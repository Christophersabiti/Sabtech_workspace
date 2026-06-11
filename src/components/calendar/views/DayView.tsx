'use client';

import type { CalendarEvent } from '@/types/calendar';
import { EVENT_TYPE_COLORS } from '@/types/calendar';

type Props = {
  currentDate: Date;
  events: CalendarEvent[];
  onSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: CalendarEvent) => void;
};

const HOUR_HEIGHT = 64;
const START_HOUR  = 6;
const END_HOUR    = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

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
    height: Math.max((clampedEnd - clampedStart) * HOUR_HEIGHT, 28),
  };
}

export function DayView({ currentDate, events, onSlotClick, onEventClick }: Props) {
  const today = new Date();
  const isToday = isSameDay(currentDate, today);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  const dayEvents = events.filter((e) => !e.all_day && isSameDay(new Date(e.start_at), currentDate));
  const allDayEvents = events.filter((e) => e.all_day && isSameDay(new Date(e.start_at), currentDate));

  const dayLabel = currentDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
        <h3 className={`text-base font-semibold ${isToday ? 'text-blue-600' : 'text-slate-800 dark:text-slate-200'}`}>
          {isToday ? 'Today — ' : ''}{dayLabel}
        </h3>
        {allDayEvents.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {allDayEvents.map((e) => (
              <button
                key={e.id}
                onClick={() => onEventClick(e)}
                className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                style={{ backgroundColor: EVENT_TYPE_COLORS[e.event_type] }}
              >
                {e.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-16 shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="flex items-start justify-end pr-3 text-xs text-slate-400 pt-0.5 border-b border-slate-100 dark:border-slate-800"
              >
                {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
              </div>
            ))}
          </div>

          {/* Event column */}
          <div className={`flex-1 relative border-l border-slate-200 dark:border-slate-700 ${isToday ? 'bg-blue-50/20 dark:bg-blue-900/5' : ''}`}>
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-100/60 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                onClick={() => onSlotClick(currentDate, h)}
              />
            ))}

            {dayEvents.map((event) => {
              const pos = getEventPosition(event);
              if (!pos) return null;
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="absolute left-2 right-2 rounded-lg px-3 text-white text-sm overflow-hidden text-left hover:opacity-90 transition-opacity shadow-md"
                  style={{
                    top:             pos.top + 2,
                    height:          pos.height - 4,
                    backgroundColor: EVENT_TYPE_COLORS[event.event_type],
                  }}
                >
                  <span className="font-semibold block text-xs opacity-90">
                    {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(event.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="font-medium block">{event.title}</span>
                  {event.location && (
                    <span className="text-xs opacity-80 block">{event.location}</span>
                  )}
                </button>
              );
            })}

            {/* Now indicator */}
            {isToday && (() => {
              const now = new Date();
              const h = now.getHours() + now.getMinutes() / 60;
              if (h < START_HOUR || h > END_HOUR) return null;
              return (
                <div
                  className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                  style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-0.5 bg-red-500" />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
