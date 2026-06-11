'use client';

import { useMemo } from 'react';
import { MapPin, Video, Users, FolderOpen, Link2 } from 'lucide-react';
import type { CalendarEvent } from '@/types/calendar';
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS, EVENT_STATUS_LABELS } from '@/types/calendar';

type Props = {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
};

export function AgendaView({ currentDate, events, onEventClick }: Props) {
  const grouped = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const map = new Map<string, CalendarEvent[]>();
    for (const e of sorted) {
      const key = e.start_at.substring(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  if (grouped.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <p className="text-sm">No upcoming events in this period.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
        {Array.from(grouped.entries()).map(([dateKey, dayEvents]) => {
          const date = new Date(dateKey + 'T00:00:00');
          const isToday = dateKey === new Date().toISOString().substring(0, 10);
          return (
            <div key={dateKey}>
              <div className={`flex items-center gap-3 mb-3 ${isToday ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
                <div className={`text-center min-w-[48px] ${isToday ? 'bg-blue-600 text-white rounded-lg py-1' : ''}`}>
                  <div className="text-xl font-bold leading-none">{date.getDate()}</div>
                  <div className="text-xs font-medium uppercase">
                    {date.toLocaleDateString([], { weekday: 'short' })}
                  </div>
                </div>
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                <span className="text-xs font-medium">
                  {date.toLocaleDateString([], { month: 'long', year: 'numeric' })}
                </span>
              </div>

              <div className="space-y-2 ml-16">
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className="w-full text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Color strip */}
                      <div
                        className="w-1 rounded-full shrink-0 self-stretch min-h-[40px]"
                        style={{ backgroundColor: EVENT_TYPE_COLORS[event.event_type] }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {event.title}
                          </h4>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: EVENT_TYPE_COLORS[event.event_type] + '20',
                              color: EVENT_TYPE_COLORS[event.event_type],
                            }}
                          >
                            {EVENT_TYPE_LABELS[event.event_type]}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {!event.all_day ? (
                            <span>
                              {new Date(event.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' — '}
                              {new Date(event.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span>All day</span>
                          )}

                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{event.location}
                            </span>
                          )}

                          {event.meet_link && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Video className="w-3 h-3" />Video call
                            </span>
                          )}

                          {event.attendees && event.attendees.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />{event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
                            </span>
                          )}

                          {event.project && (
                            <span className="flex items-center gap-1">
                              <FolderOpen className="w-3 h-3" />{event.project.project_name}
                            </span>
                          )}

                          {event.client && (
                            <span className="flex items-center gap-1">
                              <Link2 className="w-3 h-3" />{event.client.name}
                            </span>
                          )}
                        </div>

                        {event.status !== 'scheduled' && (
                          <span className={`mt-2 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                            event.status === 'cancelled'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : event.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {EVENT_STATUS_LABELS[event.status]}
                          </span>
                        )}

                        {event.description && (
                          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 line-clamp-2">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
