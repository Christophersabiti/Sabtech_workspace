'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Client } from '@/types';
import { X } from 'lucide-react';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES'];

type EditForm = {
  name: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  alternate_phone: string;
  address: string;
  city: string;
  country: string;
  tin_number: string;
  currency: string;
  status: 'active' | 'inactive';
  notes: string;
};

function toForm(c: Client): EditForm {
  return {
    name: c.name,
    company_name: c.company_name || '',
    contact_person: c.contact_person || '',
    email: c.email || '',
    phone: c.phone || '',
    alternate_phone: c.alternate_phone || '',
    address: c.address || '',
    city: c.city || '',
    country: c.country || '',
    tin_number: c.tin_number || '',
    currency: c.currency,
    status: c.status ?? 'active',
    notes: c.notes || '',
  };
}

type Props = {
  client: Client | null;
  onClose: () => void;
  onSaved: (updated: Client) => void;
};

export function EditClientPanel({ client, onClose, onSaved }: Props) {
  const supabase = createClient();
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (client) { setForm(toForm(client)); setErrorMsg(''); }
  }, [client]);

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (client) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [client]);

  if (!client || !form) return null;

  const patch = <K extends keyof EditForm>(key: K, val: EditForm[K]) =>
    setForm(f => f ? { ...f, [key]: val } : f);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!client || !form?.name.trim()) return;
    setSaving(true);
    setErrorMsg('');
    const payload = {
      name:            form.name.trim(),
      company_name:    form.company_name.trim()    || null,
      contact_person:  form.contact_person.trim()  || null,
      email:           form.email.trim()           || null,
      phone:           form.phone.trim()           || null,
      alternate_phone: form.alternate_phone.trim() || null,
      address:         form.address.trim()         || null,
      city:            form.city.trim()            || null,
      country:         form.country.trim()         || null,
      tin_number:      form.tin_number.trim()      || null,
      currency:        form.currency,
      status:          form.status,
      notes:           form.notes.trim()           || null,
    };
    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', client.id)
      .select('*')
      .single();
    if (error) {
      setErrorMsg(error.message);
    } else {
      onSaved(data as Client);
      onClose();
    }
    setSaving(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 w-full sm:max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Edit Client</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{client.client_code}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable form */}
        <form id="edit-client-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          {/* Status toggle */}
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-700 flex-1">Client Status</p>
            <div className="flex gap-2">
              {(['active', 'inactive'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => patch('status', s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    form.status === s
                      ? s === 'active'
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label>
              <input required type="text" value={form.name}
                onChange={e => patch('name', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <input type="text" value={form.company_name}
                onChange={e => patch('company_name', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person</label>
              <input type="text" value={form.contact_person}
                onChange={e => patch('contact_person', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">TIN Number</label>
              <input type="text" value={form.tin_number}
                onChange={e => patch('tin_number', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email}
                onChange={e => patch('email', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input type="tel" value={form.phone}
                onChange={e => patch('phone', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Alternate Phone</label>
              <input type="tel" value={form.alternate_phone}
                onChange={e => patch('alternate_phone', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select value={form.currency}
                onChange={e => patch('currency', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
              <input type="text" value={form.city}
                onChange={e => patch('city', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
              <input type="text" value={form.country}
                onChange={e => patch('country', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Billing Address</label>
              <textarea value={form.address}
                onChange={e => patch('address', e.target.value)}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea value={form.notes}
                onChange={e => patch('notes', e.target.value)}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-slate-200 flex-shrink-0 bg-white">
          <button type="button" onClick={onClose}
            className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" form="edit-client-form" disabled={saving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
