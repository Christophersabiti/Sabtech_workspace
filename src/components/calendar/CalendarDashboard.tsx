'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw,
  CalendarDays, List, AlignLeft, Grid3x3,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { CalendarEvent, CalendarView, CalendarFilters, EventType, EventStatus } from '@/types/calendar';
import type { CalendarEventFormValues } from './CalendarEventModal';
import { CalendarEventModal } from './CalendarEventModal';
import { MonthView } from './views/MonthView';
import { WeekView } from './views/WeekView';
import { DayView } from './views/DayView';
import { AgendaView } from './views/AgendaView';

type Project = { id: string; project_name: string; project_code: string };
type Client  = { id: string; name: string; company_name: string | null };

const VIEWS: { key: CalendarView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'month',  label: 'Month',  icon: Grid3x3 },
  { key: 'week',   label: 'Week',   icon: CalendarDays },
  { key: 'day',    label: 'Day',    icon: AlignLeft },
  { key: 'agenda', label: 'Agenda', icon: List },
];

function getDateRange(view: CalendarView, date: Date): { start: Date; end: Date } {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (view === 'month') {
    const start = new Date(y, m, 1);
    start.setDate(start.getDate() - start.getDay()); // go to Sunday of that week
    const end = new Date(y, m + 1, 0);
    end.setDate(end.getDate() + (6 - end.getDay())); // go to Saturday of last week
    return { start, end };
  }
  if (view === 'week') {
    const start = new Date(y, m, d);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start, end };
  }
  if (view === 'day') {
    const start = new Date(y, m, d, 0, 0, 0);
    const end   = new Date(y, m, d, 23, 59, 59);
    return { start, end };
  }
  // agenda: next 30 days
  const start = new Date(y, m, d);
  const end   = new Date(start);
  end.setDate(end.getDate() + 30);
  return { start, end };
}

function navigate(view: CalendarView, date: Date, direction: 1 | -1): Date {
  const d = new Date(date);
  if (view === 'month')  d.setMonth(d.getMonth() + direction);
  if (view === 'week')   d.setDate(d.getDate() + direction * 7);
  if (view === 'day')    d.setDate(d.getDate() + direction);
  if (view === 'agenda') d.setDate(d.getDate() + direction * 30);
  return d;
}

function formatHeaderLabel(view: CalendarView, date: Date): string {
  if (view === 'month') {
    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }
  if (view === 'week') {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (start.getMonth() === end.getMonth()) {
      return `${start.toLocaleDateString([], { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
    }
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  if (view === 'day') {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  return `Next 30 days from ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function CalendarDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();

  const [view, setView]               = useState<CalendarView>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents]           = useState<CalendarEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState<Project[]>([]);
  const [clients, setClients]         = useState<Client[]>([]);

  const [filters, setFilters] = useState<CalendarFilters>({
    project_id: null, client_id: null, user_id: null, status: null, event_type: null,
  });

  const [modalOpen, setModalOpen]           = useState(false);
  const [selectedEvent, setSelectedEvent]   = useState<CalendarEvent | null>(null);
  const [initialModalDate, setInitialModalDate] = useState<Date | undefined>();

  const fetchEvents = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const { start, end } = getDateRange(view, currentDate);
      const params = new URLSearchParams({
        company_id: activeCompanyId,
        start:      start.toISOString(),
        end:        end.toISOString(),
      });
      if (filters.project_id) params.set('project_id', filters.project_id);
      if (filters.client_id)  params.set('client_id',  filters.client_id);
      if (filters.user_id)    params.set('user_id',    filters.user_id);
      if (filters.status)     params.set('status',     filters.status);
      if (filters.event_type) params.set('event_type', filters.event_type);

      const res = await fetch(`/api/calendar/events?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, view, currentDate, filters]);

  const fetchMeta = useCallback(async () => {
    if (!activeCompanyId) return;
    const [pRes, cRes] = await Promise.all([
      supabase.from('projects').select('id, project_name, project_code').eq('company_id', activeCompanyId).eq('status', 'active'),
      supabase.from('clients').select('id, name, company_name').eq('company_id', activeCompanyId).eq('status', 'active'),
    ]);
    if (pRes.data) setProjects(pRes.data);
    if (cRes.data) setClients(cRes.data);
  }, [activeCompanyId, supabase]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  function openNewEvent(date?: Date, hour?: number) {
    setSelectedEvent(null);
    if (date && hour !== undefined) {
      const d = new Date(date);
      d.setHours(hour, 0, 0, 0);
      setInitialModalDate(d);
    } else if (date) {
      setInitialModalDate(date);
    } else {
      setInitialModalDate(undefined);
    }
    setModalOpen(true);
  }

  function openEditEvent(event: CalendarEvent) {
    setSelectedEvent(event);
    setModalOpen(true);
  }

  async function handleSaveEvent(values: CalendarEventFormValues) {
    if (!activeCompanyId) return;
    const payload = {
      ...values,
      company_id: activeCompanyId,
      project_id: values.project_id || undefined,
      client_id:  values.client_id  || undefined,
      task_id:    values.task_id    || undefined,
    };

    if (selectedEvent) {
      await fetch(`/api/calendar/events/${selectedEvent.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    } else {
      await fetch('/api/calendar/events', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
    await fetchEvents();
  }

  async function handleDeleteEvent() {
    if (!activeCompanyId || !selectedEvent) return;
    await fetch(`/api/calendar/events/${selectedEvent.id}`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ company_id: activeCompanyId }),
    });
    await fetchEvents();
  }

  const headerLabel = formatHeaderLabel(view, currentDate);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          {/* Navigation */}
          <button
            onClick={() => setCurrentDate(navigate(view, currentDate, -1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentDate(navigate(view, currentDate, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <h2 className="ml-2 text-base font-semibold text-slate-800 dark:text-slate-100 min-w-[180px]">
            {headerLabel}
          </h2>

          {loading && (
            <RefreshCw className="w-4 h-4 text-blue-500 animate-spin ml-1" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filters */}
          <select
            value={filters.project_id ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, project_id: e.target.value || null }))}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
          </select>

          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value as EventStatus) || null }))}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 focus:outline-none"
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="rescheduled">Rescheduled</option>
          </select>

          {/* View switcher */}
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {VIEWS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                title={label}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  view === key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* New event */}
          <button
            onClick={() => openNewEvent()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Event</span>
          </button>
        </div>
      </div>

      {/* Calendar view */}
      <div className="flex-1 overflow-hidden">
        {view === 'month' && (
          <MonthView
            currentDate={currentDate}
            events={events}
            onDayClick={(d) => { setCurrentDate(d); setView('day'); }}
            onEventClick={openEditEvent}
          />
        )}
        {view === 'week' && (
          <WeekView
            currentDate={currentDate}
            events={events}
            onSlotClick={(d, h) => openNewEvent(d, h)}
            onEventClick={openEditEvent}
          />
        )}
        {view === 'day' && (
          <DayView
            currentDate={currentDate}
            events={events}
            onSlotClick={(d, h) => openNewEvent(d, h)}
            onEventClick={openEditEvent}
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            currentDate={currentDate}
            events={events}
            onEventClick={openEditEvent}
          />
        )}
      </div>

      {/* Event modal */}
      <CalendarEventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedEvent(null); }}
        onSave={handleSaveEvent}
        onDelete={selectedEvent ? handleDeleteEvent : undefined}
        event={selectedEvent}
        initialDate={initialModalDate}
        projects={projects}
        clients={clients}
      />
    </div>
  );
}
