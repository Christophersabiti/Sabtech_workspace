'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Link2, Plus, Trash2, Copy, ExternalLink, Clock, Video, MapPin,
  CheckCircle2, AlertCircle, Edit2, X, Save,
} from 'lucide-react';

type BookingLink = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  duration_minutes: number;
  event_type: string;
  location_type: string;
  location_value: string | null;
  timezone: string;
  buffer_minutes: number;
  booking_window_days: number;
  max_bookings_per_day: number | null;
  require_approval: boolean;
  is_active: boolean;
};

type Props = {
  companyId: string;
};

const EVENT_TYPES = [
  'consultation', 'discovery_call', 'project_kickoff', 'project_review',
  'status_update', 'meeting', 'interview', 'other',
];

const LOCATION_TYPES = [
  { value: 'video',     label: 'Video call' },
  { value: 'phone',     label: 'Phone call' },
  { value: 'in_person', label: 'In person' },
];

const DURATIONS = [15, 30, 45, 60, 90, 120];

type FormState = {
  title: string;
  description: string;
  slug: string;
  duration_minutes: number;
  event_type: string;
  location_type: string;
  location_value: string;
  timezone: string;
  buffer_minutes: number;
  booking_window_days: number;
  max_bookings_per_day: string;
  require_approval: boolean;
};

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const EMPTY_FORM: FormState = {
  title: '', description: '', slug: '', duration_minutes: 30,
  event_type: 'consultation', location_type: 'video', location_value: '',
  timezone: 'Africa/Kampala', buffer_minutes: 15, booking_window_days: 30,
  max_bookings_per_day: '', require_approval: false,
};

export function BookingLinkManager({ companyId }: Props) {
  const [links, setLinks]         = useState<BookingLink[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar/booking-links?company_id=${companyId}`);
      if (res.ok) setLinks((await res.json()).links ?? []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(link: BookingLink) {
    setForm({
      title:               link.title,
      description:         link.description ?? '',
      slug:                link.slug,
      duration_minutes:    link.duration_minutes,
      event_type:          link.event_type,
      location_type:       link.location_type,
      location_value:      link.location_value ?? '',
      timezone:            link.timezone,
      buffer_minutes:      link.buffer_minutes,
      booking_window_days: link.booking_window_days,
      max_bookings_per_day: link.max_bookings_per_day?.toString() ?? '',
      require_approval:    link.require_approval,
    });
    setEditingId(link.id);
    setShowForm(true);
  }

  function setF<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.slug.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        company_id:          companyId,
        max_bookings_per_day: form.max_bookings_per_day ? Number(form.max_bookings_per_day) : null,
      };
      const res = editingId
        ? await fetch(`/api/calendar/booking-links/${editingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch('/api/calendar/booking-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        showToast('success', editingId ? 'Booking link updated.' : 'Booking link created.');
        setShowForm(false);
        await fetchLinks();
      } else {
        const d = await res.json();
        showToast('error', d.error ?? 'Failed to save booking link.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this booking link? Guests will no longer be able to book.')) return;
    const res = await fetch(`/api/calendar/booking-links/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId }),
    });
    if (res.ok) { showToast('success', 'Booking link deleted.'); await fetchLinks(); }
    else showToast('error', 'Failed to delete booking link.');
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/booking/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(slug);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border ${
          toast.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800 dark:text-slate-100">Booking Links</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Share public links so clients can book time on your calendar.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />New link
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">
              {editingId ? 'Edit Booking Link' : 'New Booking Link'}
            </h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => { setF('title', e.target.value); if (!editingId) setF('slug', slugify(e.target.value)); }}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  placeholder="30-Minute Consultation"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Slug *</label>
                <div className="flex items-center border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-2 text-xs text-slate-400 border-r border-slate-200 dark:border-slate-700 py-2">/booking/</span>
                  <input
                    type="text"
                    required
                    value={form.slug}
                    onChange={(e) => setF('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className="flex-1 px-2 py-2 text-sm bg-transparent focus:outline-none text-slate-800 dark:text-slate-200"
                    placeholder="30-min-consult"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setF('description', e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200 resize-none"
                placeholder="What is this booking for?"
              />
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Duration</label>
                <select
                  value={form.duration_minutes}
                  onChange={(e) => setF('duration_minutes', Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                >
                  {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Buffer (min)</label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.buffer_minutes}
                  onChange={(e) => setF('buffer_minutes', Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Booking window (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.booking_window_days}
                  onChange={(e) => setF('booking_window_days', Number(e.target.value))}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Location type</label>
                <select
                  value={form.location_type}
                  onChange={(e) => setF('location_type', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                >
                  {LOCATION_TYPES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
              {form.location_type === 'in_person' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Address / Place</label>
                  <input
                    type="text"
                    value={form.location_value}
                    onChange={(e) => setF('location_value', e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                    placeholder="123 Main St, Kampala"
                  />
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Event type</label>
                <select
                  value={form.event_type}
                  onChange={(e) => setF('event_type', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Max bookings / day</label>
                <input
                  type="number"
                  min={1}
                  value={form.max_bookings_per_day}
                  onChange={(e) => setF('max_bookings_per_day', e.target.value)}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-200"
                  placeholder="Unlimited"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={form.require_approval}
                onChange={(e) => setF('require_approval', e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              Require approval before confirming bookings
            </label>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : editingId ? 'Update link' : 'Create link'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2].map((i) => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}
        </div>
      ) : links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <Link2 className="w-8 h-8 mb-3" />
          <p className="text-sm font-medium">No booking links yet</p>
          <p className="text-xs mt-1">Create one to let clients book time directly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-start justify-between gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">{link.title}</h3>
                  {!link.is_active && (
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">Inactive</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{link.duration_minutes} min</span>
                  {link.location_type === 'video'
                    ? <span className="flex items-center gap-1"><Video className="w-3 h-3" />Video</span>
                    : link.location_type === 'in_person'
                    ? <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />In person</span>
                    : null}
                  <span className="text-slate-300 dark:text-slate-600">/booking/{link.slug}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => copyLink(link.slug)}
                  title="Copy link"
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {copied === link.slug ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <a
                  href={`/booking/${link.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open booking page"
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => openEdit(link)}
                  title="Edit"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(link.id)}
                  title="Delete"
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
