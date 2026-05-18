'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Save } from 'lucide-react';

const CURRENCIES = ['UGX', 'USD', 'EUR', 'GBP', 'KES', 'TZS', 'RWF'];

export default function NewClientPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    alternate_phone: '',
    address: '',
    city: '',
    country: 'Uganda',
    tin_number: '',
    currency: 'UGX',
    notes: '',
  });

  const patch = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    
    setSaving(true);
    setErrorMsg('');

    // Generate a simple client code, e.g., C-123456
    const clientCode = `C-${Date.now().toString().slice(-6)}`;

    const payload = {
      client_code:     clientCode,
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
      status:          'active', // default status
      notes:           form.notes.trim()           || null,
    };

    const { data: newClient, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      setErrorMsg(error.message);
      setSaving(false);
    } else if (newClient) {
      // Redirect to the newly created client's details page
      router.push(`/clients/${newClient.id}`);
      router.refresh();
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-5">
        <Link
          href="/clients"
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">New Client</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a new client profile to associate with projects and invoices.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-6">
          {errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm font-medium text-red-800">{errorMsg}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => patch('name', e.target.value)}
                placeholder="Individual or Display Name"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Company Name
              </label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => patch('company_name', e.target.value)}
                placeholder="Optional company or business name"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                value={form.contact_person}
                onChange={(e) => patch('contact_person', e.target.value)}
                placeholder="Primary point of contact"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                TIN Number
              </label>
              <input
                type="text"
                value={form.tin_number}
                onChange={(e) => patch('tin_number', e.target.value)}
                placeholder="Tax Identification Number"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => patch('email', e.target.value)}
                placeholder="Email for invoices & communication"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Currency
              </label>
              <select
                value={form.currency}
                onChange={(e) => patch('currency', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => patch('phone', e.target.value)}
                placeholder="Primary phone"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Alternate Phone
              </label>
              <input
                type="tel"
                value={form.alternate_phone}
                onChange={(e) => patch('alternate_phone', e.target.value)}
                placeholder="Secondary phone"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => patch('city', e.target.value)}
                placeholder="City"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Country
              </label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => patch('country', e.target.value)}
                placeholder="Country"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Billing Address
              </label>
              <textarea
                value={form.address}
                onChange={(e) => patch('address', e.target.value)}
                rows={2}
                placeholder="Full billing or postal address"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Internal Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => patch('notes', e.target.value)}
                rows={3}
                placeholder="Private notes about this client"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-slate-100 justify-end">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
