'use client';

import { useMemo } from 'react';
import type { CalendarEvent } from '@/types/calendar';
import { EVENT_TYPE_COLORS } from '@/types/calendar';

type Props = {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
};

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_EVENTS = 3;

export function MonthView({ currentDate, events, onDayClick, onEventClick }: Props) {
  const today = new Date();

  const { weeks, monthStart, monthEnd } = useMemo(() => {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const mStart = new Date(year, month, 1);
    const mEnd   = new Date(year, month + 1, 0);
    const gridStart = startOfWeek(mStart);

    const weeks: Date[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= mEnd || weeks.length < 6) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
      if (weeks.length >= 6) break;
    }
    return { weeks, monthStart: mStart, monthEnd: mEnd };
  }, [currentDate]);

  function eventsForDay(day: Date) {
    return events.filter((e) => {
      const start = new Date(e.start_at);
      const end   = new Date(e.end_at);
      return (
        isSameDay(start, day) ||
        (e.all_day && start <= day && end >= day)
      );
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-rows-6" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const isCurrentMonth = day >= monthStart && day <= monthEnd;
              const isToday = isSameDay(day, today);
              const dayEvents = eventsForDay(day);
              const visible  = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
              const overflow = dayEvents.length - MAX_VISIBLE_EVENTS;

              return (
                <div
                  key={day.toISOString()}
                  onClick={() => onDayClick(day)}
                  className={`min-h-[100px] p-1 border-b border-r border-slate-200 dark:border-slate-700 cursor-pointer transition-colors ${
                    isCurrentMonth
                      ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex justify-start mb-1">
                    <span
                      className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday
                          ? 'bg-blue-600 text-white'
                          : isCurrentMonth
                          ? 'text-slate-700 dark:text-slate-300'
                          : 'text-slate-400 dark:text-slate-600'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {visible.map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        className="w-full text-left text-xs px-1.5 py-0.5 rounded truncate text-white font-medium hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: EVENT_TYPE_COLORS[event.event_type] }}
                        title={event.title}
                      >
                        {!event.all_day && (
                          <span className="opacity-80 mr-1">
                            {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {event.title}
                      </button>
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline pl-1 font-medium"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
