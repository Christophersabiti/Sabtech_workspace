'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, Clock, MapPin, Video, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

type BookingLink = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  event_type: string;
  location_type: string;
  location_value: string | null;
  timezone: string;
};

type TimeSlot = { start: string; end: string };

type Step = 'pick-date' | 'pick-time' | 'form' | 'confirmed';

export default function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [link, setLink]           = useState<BookingLink | null>(null);
  const [notFound, setNotFound]   = useState(false);
  const [step, setStep]           = useState<Step>('pick-date');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots]         = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [form, setForm]           = useState({ name: '', email: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking]     = useState<{ cancel_token: string; status: string } | null>(null);
  const [error, setError]         = useState('');

  useEffect(() => {
    fetch(`/api/booking/${slug}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => setLink(d.link))
      .catch(() => setNotFound(true));
  }, [slug]);

  const loadSlots = useCallback(async (dateStr: string) => {
    setLoadingSlots(true);
    setSlots([]);
    try {
      const res = await fetch(`/api/booking/${slug}?date=${dateStr}`);
      if (res.ok) {
        const d = await res.json();
        setSlots(d.slots ?? []);
      }
    } finally {
      setLoadingSlots(false);
    }
  }, [slug]);

  function selectDate(dateStr: string) {
    setSelectedDate(dateStr);
    setSelectedSlot(null);
    setStep('pick-time');
    loadSlots(dateStr);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot || !form.name || !form.email) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/booking/${slug}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          start_at:    selectedSlot.start,
          guest_name:  form.name,
          guest_email: form.email,
          guest_notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Booking failed'); return; }
      setBooking(data.booking);
      setStep('confirmed');
    } finally {
      setSubmitting(false);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Generate days for the current calendar month
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayBlanks = Array.from({ length: firstDay });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  function toDateStr(d: number) {
    return `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function isPast(d: number) {
    return new Date(year, month, d) < today;
  }

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800">Booking link not found</h1>
          <p className="text-slate-500 mt-1">This link may have been deactivated or never existed.</p>
        </div>
      </main>
    );
  }

  if (!link) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{link.title}</h1>
              {link.description && <p className="text-slate-500 mt-1 text-sm">{link.description}</p>}
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {link.duration_minutes} min
                </span>
                {link.location_type === 'video' && (
                  <span className="flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-slate-400" />
                    Video call
                  </span>
                )}
                {link.location_type === 'in_person' && link.location_value && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    {link.location_value}
                  </span>
                )}
                <span className="text-slate-400">{link.timezone}</span>
              </div>
            </div>
          </div>
        </div>

        {step === 'confirmed' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-10 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-900">Booking Confirmed!</h2>
            <p className="text-slate-500 mt-2">
              {booking?.status === 'pending_approval'
                ? "Your request has been sent. The host will confirm shortly."
                : "You're all set. A confirmation has been sent to your email."}
            </p>
            {selectedSlot && (
              <div className="mt-6 inline-block bg-slate-50 rounded-xl px-6 py-4 text-sm text-slate-700 border border-slate-200">
                <p className="font-semibold">{new Date(selectedSlot.start).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p className="text-slate-500 mt-1">
                  {new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' — '}
                  {new Date(selectedSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' '}{link.timezone}
                </p>
              </div>
            )}
            {booking?.cancel_token && (
              <p className="mt-4 text-xs text-slate-400">
                Need to cancel? Visit your confirmation email for a cancellation link.
              </p>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Calendar / Date picker */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-800">Select a date</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCalendarDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium px-2 text-slate-700">
                    {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => setCalendarDate((d) => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
                {['S','M','T','W','T','F','S'].map((d,i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {dayBlanks.map((_, i) => <div key={`b${i}`} />)}
                {days.map((d) => {
                  const ds = toDateStr(d);
                  const past = isPast(d);
                  const selected = ds === selectedDate;
                  return (
                    <button
                      key={d}
                      disabled={past}
                      onClick={() => selectDate(ds)}
                      className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : past
                          ? 'text-slate-300 cursor-not-allowed'
                          : 'hover:bg-blue-50 text-slate-700 hover:text-blue-600'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time slots / Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              {step === 'pick-date' && (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                  <Calendar className="w-8 h-8 mb-3" />
                  <p className="text-sm">Select a date to see available times</p>
                </div>
              )}

              {step === 'pick-time' && (
                <>
                  <h2 className="font-semibold text-slate-800 mb-4">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </h2>
                  {loadingSlots ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-8">No available slots on this day.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start}
                          onClick={() => { setSelectedSlot(slot); setStep('form'); }}
                          className="py-2 px-3 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all font-medium"
                        >
                          {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {step === 'form' && selectedSlot && (
                <>
                  <button
                    onClick={() => setStep('pick-time')}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {new Date(selectedSlot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' — '}
                    {new Date(selectedSlot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </button>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">
                        <AlertCircle className="w-4 h-4" />{error}
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Your name *</label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email *</label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes (optional)</label>
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Anything the host should know?"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {submitting ? 'Booking…' : 'Confirm Booking'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          Powered by <span className="font-semibold text-slate-500">Sabtech Workspace</span>
        </p>
      </div>
    </main>
  );
}
