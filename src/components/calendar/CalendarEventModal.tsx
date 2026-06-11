'use client';

import { useState, useEffect } from 'react';
import {
  X, Calendar, Clock, MapPin, Video, Users, Link2, Bell,
  FolderOpen, Eye, AlertCircle, Plus, Trash2, ExternalLink,
} from 'lucide-react';
import type {
  CalendarEvent, EventType, EventStatus, EventVisibility,
  ReminderMethod, AttendeeType,
} from '@/types/calendar';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '@/types/calendar';
import { ConflictWarning } from './ConflictWarning';
import { RecurrenceBuilder } from './RecurrenceBuilder';

type AttendeeInput = {
  email: string;
  name: string;
  attendee_type: AttendeeType;
  is_optional: boolean;
  user_id?: string;
};

type ReminderInput = {
  method: ReminderMethod;
  minutes_before: number;
};

type Project = { id: string; project_name: string; project_code: string };
type Client  = { id: string; name: string; company_name: string | null };

export type CalendarEventFormValues = {
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;
  location: string;
  meet_link: string;
  project_id: string;
  task_id: string;
  client_id: string;
  event_type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  recurrence_rule: string;
  attendees: AttendeeInput[];
  reminders: ReminderInput[];
  sync_to_provider: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (values: CalendarEventFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  initialDate?: Date;
  event?: CalendarEvent | null;
  projects?: Project[];
  clients?: Client[];
  companyId?: string;
};

function toLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTime(local: string, tz: string): string {
  return new Date(local).toISOString();
}

const TIMEZONES = [
  'Africa/Kampala', 'Africa/Nairobi', 'UTC', 'Europe/London',
  'America/New_York', 'America/Los_Angeles', 'Asia/Dubai',
];

const REMINDER_OPTIONS: { label: string; minutes: number }[] = [
  { label: '5 min before', minutes: 5 },
  { label: '15 min before', minutes: 15 },
  { label: '30 min before', minutes: 30 },
  { label: '1 hour before', minutes: 60 },
  { label: '1 day before',  minutes: 1440 },
];

function defaultStart(date?: Date): string {
  const d = date ?? new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalDateTime(d.toISOString());
}

function defaultEnd(startLocal: string): string {
  const d = new Date(startLocal);
  d.setHours(d.getHours() + 1);
  return toLocalDateTime(d.toISOString());
}

export function CalendarEventModal({
  open, onClose, onSave, onDelete, initialDate, event, projects = [], clients = [], companyId,
}: Props) {
  const isEdit = !!event;
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState('');
  const [newAttendeeEmail, setNewAttendeeEmail] = useState('');

  const [form, setForm] = useState<CalendarEventFormValues>(() => {
    if (event) {
      return {
        title:         event.title,
        description:   event.description ?? '',
        start_at:      toLocalDateTime(event.start_at),
        end_at:        toLocalDateTime(event.end_at),
        all_day:       event.all_day,
        timezone:      event.timezone,
        location:      event.location ?? '',
        meet_link:     event.meet_link ?? '',
        project_id:    event.project_id ?? '',
        task_id:       event.task_id ?? '',
        client_id:     event.client_id ?? '',
        event_type:    event.event_type,
        status:        event.status,
        visibility:    event.visibility,
        recurrence_rule: event.recurrence_rule ?? '',
        attendees:     (event.attendees ?? []).filter((a) => !a.is_organizer).map((a) => ({
          email: a.email, name: a.name ?? '', attendee_type: a.attendee_type, is_optional: a.is_optional, user_id: a.user_id ?? undefined,
        })),
        reminders:     (event.reminders ?? []).map((r) => ({ method: r.method, minutes_before: r.minutes_before })),
        sync_to_provider: true,
      };
    }
    const start = defaultStart(initialDate);
    return {
      title: '', description: '', start_at: start, end_at: defaultEnd(start),
      all_day: false, timezone: 'Africa/Kampala', location: '', meet_link: '',
      project_id: '', task_id: '', client_id: '', event_type: 'meeting',
      status: 'scheduled', visibility: 'team', recurrence_rule: '',
      attendees: [], reminders: [{ method: 'in_app', minutes_before: 15 }],
      sync_to_provider: true,
    };
  });

  // Sync form when event prop changes
  useEffect(() => {
    if (!open) return;
    if (event) {
      setForm({
        title: event.title, description: event.description ?? '',
        start_at: toLocalDateTime(event.start_at), end_at: toLocalDateTime(event.end_at),
        all_day: event.all_day, timezone: event.timezone,
        location: event.location ?? '', meet_link: event.meet_link ?? '',
        project_id: event.project_id ?? '', task_id: event.task_id ?? '',
        client_id: event.client_id ?? '', event_type: event.event_type,
        status: event.status, visibility: event.visibility,
        recurrence_rule: event.recurrence_rule ?? '',
        attendees: (event.attendees ?? []).filter((a) => !a.is_organizer).map((a) => ({
          email: a.email, name: a.name ?? '', attendee_type: a.attendee_type,
          is_optional: a.is_optional, user_id: a.user_id ?? undefined,
        })),
        reminders: (event.reminders ?? []).map((r) => ({ method: r.method, minutes_before: r.minutes_before })),
        sync_to_provider: true,
      });
    } else {
      const start = defaultStart(initialDate);
      setForm({
        title: '', description: '', start_at: start, end_at: defaultEnd(start),
        all_day: false, timezone: 'Africa/Kampala', location: '', meet_link: '',
        project_id: '', task_id: '', client_id: '', event_type: 'meeting',
        status: 'scheduled', visibility: 'team', recurrence_rule: '',
        attendees: [], reminders: [{ method: 'in_app', minutes_before: 15 }],
        sync_to_provider: true,
      });
    }
    setError('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id]);

  function set<K extends keyof CalendarEventFormValues>(key: K, val: CalendarEventFormValues[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function addAttendee() {
    const email = newAttendeeEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (form.attendees.some((a) => a.email === email)) return;
    setForm((f) => ({
      ...f,
      attendees: [...f.attendees, { email, name: '', attendee_type: 'internal', is_optional: false }],
    }));
    setNewAttendeeEmail('');
  }

  function removeAttendee(email: string) {
    setForm((f) => ({ ...f, attendees: f.attendees.filter((a) => a.email !== email) }));
  }

  function addReminder() {
    setForm((f) => ({
      ...f,
      reminders: [...f.reminders, { method: 'in_app', minutes_before: 15 }],
    }));
  }

  function removeReminder(i: number) {
    setForm((f) => ({ ...f, reminders: f.reminders.filter((_, j) => j !== i) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (new Date(form.start_at) >= new Date(form.end_at)) { setError('End time must be after start time'); return; }

    setSaving(true);
    try {
      await onSave({
        ...form,
        start_at: fromLocalDateTime(form.start_at, form.timezone),
        end_at:   fromLocalDateTime(form.end_at,   form.timezone),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !window.confirm('Cancel this event? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel event');
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: EVENT_TYPE_COLORS[form.event_type] }}
            />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {isEdit ? 'Edit Event' : 'New Event'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="w-4 h-4 shrink-0" />{error}
              </div>
            )}

            {/* Title */}
            <div>
              <input
                type="text"
                placeholder="Event title *"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className="w-full text-xl font-semibold bg-transparent border-0 border-b-2 border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none pb-2 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
              />
            </div>

            {/* Event type */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Event Type</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('event_type', type)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                      form.event_type === type
                        ? 'text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    style={form.event_type === type ? { backgroundColor: EVENT_TYPE_COLORS[type] } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date / Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />Start
                </label>
                <input
                  type={form.all_day ? 'date' : 'datetime-local'}
                  value={form.start_at}
                  onChange={(e) => set('start_at', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Clock className="w-3 h-3 inline mr-1" />End
                </label>
                <input
                  type={form.all_day ? 'date' : 'datetime-local'}
                  value={form.end_at}
                  onChange={(e) => set('end_at', e.target.value)}
                  min={form.start_at}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={form.all_day}
                  onChange={(e) => set('all_day', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600"
                />
                All day
              </label>
              <select
                value={form.timezone}
                onChange={(e) => set('timezone', e.target.value)}
                className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>

            {/* Conflict warning — debounced on time change */}
            {companyId && !form.all_day && (
              <ConflictWarning
                companyId={companyId}
                startAt={form.start_at ? new Date(form.start_at).toISOString() : ''}
                endAt={form.end_at ? new Date(form.end_at).toISOString() : ''}
                excludeEventId={event?.id}
              />
            )}

            {/* Location + Meet link */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <MapPin className="w-3 h-3 inline mr-1" />Location
                </label>
                <input
                  type="text"
                  placeholder="Physical or virtual location"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Video className="w-3 h-3 inline mr-1" />Meet / Teams Link
                </label>
                <input
                  type="url"
                  placeholder="https://meet.google.com/..."
                  value={form.meet_link}
                  onChange={(e) => set('meet_link', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                rows={3}
                placeholder="Add a description, agenda, or notes..."
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 resize-none"
              />
            </div>

            {/* Project + Client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {projects.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    <FolderOpen className="w-3 h-3 inline mr-1" />Project
                  </label>
                  <select
                    value={form.project_id}
                    onChange={(e) => set('project_id', e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                  </select>
                </div>
              )}
              {clients.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    <Link2 className="w-3 h-3 inline mr-1" />Client
                  </label>
                  <select
                    value={form.client_id}
                    onChange={(e) => set('client_id', e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">No client</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Status + Visibility */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => set('status', e.target.value as EventStatus)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Eye className="w-3 h-3 inline mr-1" />Visibility
                </label>
                <select
                  value={form.visibility}
                  onChange={(e) => set('visibility', e.target.value as EventVisibility)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                >
                  <option value="private">Private (only me)</option>
                  <option value="team">Team</option>
                  <option value="company">Company-wide</option>
                </select>
              </div>
            </div>

            {/* Attendees */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                <Users className="w-3 h-3 inline mr-1" />Attendees
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="email"
                  placeholder="Add attendee email"
                  value={newAttendeeEmail}
                  onChange={(e) => setNewAttendeeEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                  className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
                <button
                  type="button"
                  onClick={addAttendee}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {form.attendees.length > 0 && (
                <div className="space-y-1">
                  {form.attendees.map((a) => (
                    <div key={a.email} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{a.email}</span>
                      <button type="button" onClick={() => removeAttendee(a.email)} className="text-slate-400 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recurrence */}
            <RecurrenceBuilder
              value={form.recurrence_rule}
              onChange={(rrule) => set('recurrence_rule', rrule)}
            />

            {/* Reminders */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Bell className="w-3 h-3 inline mr-1" />Reminders
                </label>
                <button type="button" onClick={addReminder} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" />Add
                </button>
              </div>
              {form.reminders.map((r, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <select
                    value={r.minutes_before}
                    onChange={(e) => setForm((f) => {
                      const reminders = [...f.reminders];
                      reminders[i] = { ...reminders[i], minutes_before: Number(e.target.value) };
                      return { ...f, reminders };
                    })}
                    className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none text-slate-800 dark:text-slate-200"
                  >
                    {REMINDER_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
                  </select>
                  <select
                    value={r.method}
                    onChange={(e) => setForm((f) => {
                      const reminders = [...f.reminders];
                      reminders[i] = { ...reminders[i], method: e.target.value as ReminderMethod };
                      return { ...f, reminders };
                    })}
                    className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none text-slate-800 dark:text-slate-200"
                  >
                    <option value="in_app">In-app</option>
                    <option value="email">Email</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                  <button type="button" onClick={() => removeReminder(i)} className="text-slate-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Sync toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.sync_to_provider}
                onChange={(e) => set('sync_to_provider', e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Sync to connected Google Calendar
              </span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </label>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
            {isEdit && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Cancelling…' : 'Cancel Event'}
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
