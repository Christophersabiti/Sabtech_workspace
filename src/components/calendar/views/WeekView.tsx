'use client';

import { useMemo, useRef } from 'react';
import type { CalendarEvent } from '@/types/calendar';
import { EVENT_TYPE_COLORS } from '@/types/calendar';

type Props = {
  currentDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
};

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR  = 6;  // display from 6:00
const END_HOUR    = 22; // display to 22:00
const TOTAL_HOURS = END_HOUR - START_HOUR;
const DAYS        = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekStart(d: Date): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function getEventPosition(event: CalendarEvent): { top: number; height: number } | null {
  const start = new Date(event.start_at);
  const end   = new Date(event.end_at);
  const startH = start.getHours() + start.getMinutes() / 60;
  const endH   = end.getHours() + end.getMinutes() / 60;
  if (endH <= START_HOUR || startH >= END_HOUR) return null;
  const clampedStart = Math.max(startH, START_HOUR);
  const clampedEnd   = Math.min(endH, END_HOUR);
  return {
    top:    (clampedStart - START_HOUR) * HOUR_HEIGHT,
    height: Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 22),
  };
}

export function WeekView({ currentDate, events, onSlotClick, onEventClick }: Props) {
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(() => {
    const start = getWeekStart(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  function dayEvents(day: Date) {
    return events.filter((e) => !e.all_day && isSameDay(new Date(e.start_at), day));
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* All-day row + Day headers */}
      <div className="grid border-b border-slate-200 dark:border-slate-700 shrink-0"
        style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}>
        <div className="text-xs text-slate-400 py-2 pl-1">all-day</div>
        {weekDays.map((day) => {
          const isToday = isSameDay(day, today);
          const allDay  = events.filter((e) => e.all_day && isSameDay(new Date(e.start_at), day));
          return (
            <div key={day.toISOString()} className="border-l border-slate-200 dark:border-slate-700 px-1 pb-1">
              <div className={`text-center text-sm font-semibold py-1 ${isToday ? 'text-blue-600' : 'text-slate-700 dark:text-slate-300'}`}>
                <span className={`${isToday ? 'inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white' : ''}`}>
                  {day.getDate()}
                </span>
                <span className="block text-xs font-normal text-slate-500">{DAYS[day.getDay()]}</span>
              </div>
              {allDay.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onEventClick(e)}
                  className="w-full text-left text-xs px-1 py-0.5 rounded truncate text-white mb-0.5"
                  style={{ backgroundColor: EVENT_TYPE_COLORS[e.event_type] }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: '60px repeat(7, 1fr)', height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="col-start-1">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="flex items-start justify-end pr-2 text-xs text-slate-400 pt-0.5 border-b border-slate-100 dark:border-slate-800"
              >
                {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, di) => {
            const dEvents = dayEvents(day);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={`relative border-l border-slate-200 dark:border-slate-700 ${isToday ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
              >
                {/* Hour slots (clickable) */}
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                    onClick={() => onSlotClick(day, h)}
                  />
                ))}

                {/* Events */}
                {dEvents.map((event) => {
                  const pos = getEventPosition(event);
                  if (!pos) return null;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className="absolute left-0.5 right-0.5 rounded px-1 text-white text-xs overflow-hidden text-left hover:opacity-90 transition-opacity shadow-sm"
                      style={{
                        top:             pos.top,
                        height:          pos.height,
                        backgroundColor: EVENT_TYPE_COLORS[event.event_type],
                        minHeight:       22,
                      }}
                    >
                      <span className="font-medium truncate block leading-tight">
                        {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="truncate block leading-tight">{event.title}</span>
                    </button>
                  );
                })}

                {/* Today indicator line */}
                {isToday && (() => {
                  const now = new Date();
                  const h = now.getHours() + now.getMinutes() / 60;
                  if (h < START_HOUR || h > END_HOUR) return null;
                  return (
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 pointer-events-none"
                      style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                    />
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
