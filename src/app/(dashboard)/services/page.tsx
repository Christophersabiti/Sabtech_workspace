'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Service } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Plus, Search, X, Tag, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';

const CATEGORIES = ['Web & Tech', 'Design', 'Analytics', 'Training', 'Coaching', 'Consultancy', 'Products'];

const emptyForm = {
  service_code: '', service_name: '', category: '',
  default_price: '0', tax_percent: '0', is_active: true,
};

export default function ServicesPage() {
  const supabase = createClient();
  const [services, setServices]     = useState<Service[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [saving, setSaving]         = useState(false);
  const [form, setForm]             = useState(emptyForm);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('services').select('*').order('category').order('service_name');
    setServices(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  function openNew() { setEditService(null); setForm(emptyForm); setShowModal(true); }

  function openEdit(s: Service) {
    setEditService(s);
    setForm({
      service_code: s.service_code, service_name: s.service_name,
      category: s.category || '', default_price: String(s.default_price),
      tax_percent: String(s.tax_percent), is_active: s.is_active,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.service_code.trim() || !form.service_name.trim()) return;
    setSaving(true);
    const payload = {
      service_code: form.service_code.trim().toUpperCase(),
      service_name: form.service_name.trim(),
      category: form.category.trim() || null,
      default_price: parseFloat(form.default_price) || 0,
      tax_percent: parseFloat(form.tax_percent) || 0,
      is_active: form.is_active,
    };
    const { error } = editService
      ? await supabase.from('services').update(payload).eq('id', editService.id)
      : await supabase.from('services').insert(payload);
    if (!error) { setShowModal(false); fetchServices(); }
    else alert('Error: ' + error.message);
    setSaving(false);
  }

  async function toggleActive(s: Service) {
    await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    fetchServices();
  }

  const filtered = services.filter(s => {
    if (!showInactive && !s.is_active) return false;
    return [s.service_name, s.service_code, s.category].some(v => v?.toLowerCase().includes(search.toLowerCase()));
  });

  const grouped = filtered.reduce<Record<string, Service[]>>((acc, s) => {
    const cat = s.category || 'Uncategorised';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Services Catalog"
        subtitle="Manage services available for selection on invoices"
        action={
          <button onClick={openNew} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="h-4 w-4" /> New Service
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search services..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show inactive
        </label>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center">
          <Tag className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No services found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700">{category}</h3>
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Code', 'Service Name', 'Default Price', 'Tax %', 'Status', 'Actions'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {items.map(s => (
                      <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${!s.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{s.service_code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{s.service_name}</td>
                        <td className="px-4 py-3 text-slate-700">{formatCurrency(s.default_price)}</td>
                        <td className="px-4 py-3 text-slate-600">{s.tax_percent}%</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-blue-600 transition-colors" title="Edit">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button onClick={() => toggleActive(s)} className={`transition-colors ${s.is_active ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-green-500'}`} title={s.is_active ? 'Deactivate' : 'Activate'}>
                              {s.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {items.map(s => (
                  <div key={s.id} className={`p-4 ${!s.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{s.service_name}</p>
                        <p className="font-mono text-xs text-slate-400 mt-0.5">{s.service_code}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(s)} className="text-slate-400 hover:text-blue-600 p-1">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => toggleActive(s)} className={`p-1 ${s.is_active ? 'text-green-500' : 'text-slate-300'}`}>
                          {s.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{formatCurrency(s.default_price)}</span>
                      <span>Tax {s.tax_percent}%</span>
                      <span className={`font-medium ${s.is_active ? 'text-green-600' : 'text-slate-400'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:rounded-2xl sm:max-w-md max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">{editService ? 'Edit Service' : 'New Service'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Service Code *</label>
                  <input required type="text" value={form.service_code}
                    onChange={e => setForm(f => ({ ...f, service_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. WD"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <input list="categories" type="text" value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <datalist id="categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Service Name *</label>
                <input required type="text" value={form.service_name}
                  onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Default Price</label>
                  <input type="number" min="0" step="0.01" value={form.default_price}
                    onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tax %</label>
                  <input type="number" min="0" max="100" step="0.01" value={form.tax_percent}
                    onChange={e => setForm(f => ({ ...f, tax_percent: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-700">Active (available on invoices)</span>
              </label>
              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-slate-200 text-slate-700 py-2.5 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Saving...' : editService ? 'Update' : 'Save Service'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
