'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Coins,
  Loader2,
  PackagePlus,
  RefreshCw,
  Save,
  Tag,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRequireAppRole } from '@/hooks/useCurrentUser';
import type { FeatureKey } from '@/lib/entitlements';
import { FEATURE_LABELS } from '@/lib/entitlements';

const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];

type PackageRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  trial_days: number;
  user_limit: number;
  invoice_limit: number;
  is_active: boolean;
  is_public: boolean;
  package_features?: Array<{
    id: string;
    feature_key: FeatureKey;
    feature_name: string;
    enabled: boolean;
    limit_value: number | null;
  }>;
};

type CouponRow = {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  is_active: boolean;
  expiry_date: string | null;
  usage_limit: number | null;
  used_count: number;
  package_id: string | null;
};

export default function PlatformPackagesPage() {
  const { checking } = useRequireAppRole(['super_admin']);
  const supabase = useMemo(() => createClient(), []);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newPackage, setNewPackage] = useState({
    key: '',
    name: '',
    monthly_price: 0,
    annual_price: 0,
    currency: 'UGX',
    trial_days: 7,
    user_limit: 3,
    invoice_limit: 50,
  });
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    package_id: '',
    expiry_date: '',
    usage_limit: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: packageRows, error: packageError }, { data: couponRows, error: couponError }] = await Promise.all([
      supabase
        .from('subscription_plans')
        .select('*, package_features(*)')
        .order('monthly_price', { ascending: true }),
      supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    if (packageError || couponError) {
      setToast({ type: 'error', message: packageError?.message || couponError?.message || 'Could not load packages.' });
    } else {
      setPackages((packageRows ?? []) as PackageRow[]);
      setCoupons((couponRows ?? []) as CouponRow[]);
      setSelectedPackageId(current => current || ((packageRows?.[0] as PackageRow | undefined)?.id ?? null));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!checking) void load();
  }, [checking, load]);

  function updatePackageField(id: string, field: keyof PackageRow, value: string | number | boolean | null) {
    setPackages(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  }

  async function syncPackages(showToast = true) {
    setSyncing(true);
    const res = await fetch('/api/platform/packages/sync', { method: 'POST' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setToast({ type: 'error', message: data.error || 'Package sync failed.' });
      setSyncing(false);
      return false;
    }

    if (showToast) {
      setToast({ type: 'success', message: 'Packages synced with tenant billing settings.' });
    }
    setSyncing(false);
    await load();
    return true;
  }

  async function savePackage(pkg: PackageRow) {
    setSavingId(pkg.id);
    const { error } = await supabase
      .from('subscription_plans')
      .update({
        name: pkg.name,
        description: pkg.description,
        price: Number(pkg.monthly_price ?? 0),
        monthly_price: Number(pkg.monthly_price ?? 0),
        annual_price: Number(pkg.annual_price ?? 0),
        currency: pkg.currency,
        trial_days: Number(pkg.trial_days),
        user_limit: Number(pkg.user_limit),
        invoice_limit: Number(pkg.invoice_limit),
        is_active: pkg.is_active,
        is_public: pkg.is_public,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pkg.id);

    setSavingId(null);
    if (error) {
      setToast({ type: 'error', message: error.message });
      return;
    }

    setToast({ type: 'success', message: 'Package saved.' });
    await syncPackages(false);
  }

  async function createPackage(event: FormEvent) {
    event.preventDefault();
    const { data, error } = await supabase
      .from('subscription_plans')
      .insert({
        key: newPackage.key.trim().toLowerCase(),
        name: newPackage.name.trim(),
        price: Number(newPackage.monthly_price),
        monthly_price: Number(newPackage.monthly_price),
        annual_price: Number(newPackage.annual_price),
        currency: newPackage.currency,
        trial_days: Number(newPackage.trial_days),
        user_limit: Number(newPackage.user_limit),
        invoice_limit: Number(newPackage.invoice_limit),
        billing_interval: 'monthly',
        is_active: true,
        is_public: true,
      })
      .select('id')
      .single();

    if (error || !data) {
      setToast({ type: 'error', message: error?.message || 'Could not create package.' });
      return;
    }

    await Promise.all(FEATURE_KEYS.map(featureKey => supabase.from('package_features').insert({
      package_id: data.id,
      feature_key: featureKey,
      feature_name: FEATURE_LABELS[featureKey],
      enabled: featureKey === 'billing.manage',
    })));

    setNewPackage({
      key: '',
      name: '',
      monthly_price: 0,
      annual_price: 0,
      currency: 'UGX',
      trial_days: 7,
      user_limit: 3,
      invoice_limit: 50,
    });
    setToast({ type: 'success', message: 'Package created.' });
    await syncPackages(false);
  }

  async function toggleFeature(pkg: PackageRow, featureKey: FeatureKey) {
    const existing = pkg.package_features?.find(feature => feature.feature_key === featureKey);
    const nextEnabled = !(existing?.enabled ?? false);

    const { error } = await supabase
      .from('package_features')
      .upsert({
        package_id: pkg.id,
        feature_key: featureKey,
        feature_name: FEATURE_LABELS[featureKey],
        enabled: nextEnabled,
        limit_value: existing?.limit_value ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'package_id,feature_key' });

    setToast(error ? { type: 'error', message: error.message } : { type: 'success', message: 'Feature updated.' });
    await load();
  }

  async function createCoupon(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase
      .from('coupons')
      .insert({
        code: newCoupon.code.trim().toUpperCase(),
        discount_type: newCoupon.discount_type,
        discount_value: Number(newCoupon.discount_value),
        package_id: newCoupon.package_id || null,
        expiry_date: newCoupon.expiry_date ? new Date(newCoupon.expiry_date).toISOString() : null,
        usage_limit: newCoupon.usage_limit ? Number(newCoupon.usage_limit) : null,
        is_active: true,
      });

    if (error) {
      setToast({ type: 'error', message: error.message });
      return;
    }

    setNewCoupon({
      code: '',
      discount_type: 'percentage',
      discount_value: 10,
      package_id: '',
      expiry_date: '',
      usage_limit: '',
    });
    setToast({ type: 'success', message: 'Coupon created.' });
    await load();
  }

  async function toggleCoupon(coupon: CouponRow) {
    const { error } = await supabase
      .from('coupons')
      .update({ is_active: !coupon.is_active, updated_at: new Date().toISOString() })
      .eq('id', coupon.id);

    setToast(error ? { type: 'error', message: error.message } : { type: 'success', message: 'Coupon updated.' });
    await load();
  }

  const selectedPackage = packages.find(pkg => pkg.id === selectedPackageId) ?? packages[0] ?? null;

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions...</div>;

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold ${
          toast.type === 'success' ? 'border border-green-200 bg-green-50 text-green-700' : 'border border-red-200 bg-red-50 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <div>
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <PackagePlus className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Package Configuration</h1>
            <p className="mt-1 text-sm text-slate-500">Configure packages, feature entitlements, limits, visibility, and coupons.</p>
          </div>
          <button
            type="button"
            onClick={() => void syncPackages()}
            disabled={syncing}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync tenants
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-12 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading package configuration...
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Packages</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Monthly</th>
                    <th className="px-3 py-2">Annual</th>
                    <th className="px-3 py-2">Trial</th>
                    <th className="px-3 py-2">Users</th>
                    <th className="px-3 py-2">Invoices</th>
                    <th className="px-3 py-2">Visible</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2 text-right">Save</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {packages.map(pkg => (
                    <tr key={pkg.id} className={selectedPackageId === pkg.id ? 'bg-blue-50/40' : undefined}>
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => setSelectedPackageId(pkg.id)} className="mb-1 font-mono text-[10px] font-bold uppercase text-blue-600">
                          {pkg.key}
                        </button>
                        <input value={pkg.name} onChange={e => updatePackageField(pkg.id, 'name', e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 font-semibold" />
                      </td>
                      <td className="px-3 py-3"><input type="number" value={pkg.monthly_price ?? 0} onChange={e => updatePackageField(pkg.id, 'monthly_price', Number(e.target.value))} className="w-24 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-3"><input type="number" value={pkg.annual_price ?? 0} onChange={e => updatePackageField(pkg.id, 'annual_price', Number(e.target.value))} className="w-24 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-3"><input type="number" value={pkg.trial_days} onChange={e => updatePackageField(pkg.id, 'trial_days', Number(e.target.value))} className="w-16 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-3"><input type="number" value={pkg.user_limit} onChange={e => updatePackageField(pkg.id, 'user_limit', Number(e.target.value))} className="w-16 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-3"><input type="number" value={pkg.invoice_limit} onChange={e => updatePackageField(pkg.id, 'invoice_limit', Number(e.target.value))} className="w-20 rounded border border-slate-200 px-2 py-1" /></td>
                      <td className="px-3 py-3"><input type="checkbox" checked={pkg.is_public} onChange={e => updatePackageField(pkg.id, 'is_public', e.target.checked)} /></td>
                      <td className="px-3 py-3"><input type="checkbox" checked={pkg.is_active} onChange={e => updatePackageField(pkg.id, 'is_active', e.target.checked)} /></td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => savePackage(pkg)} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50" disabled={savingId === pkg.id}>
                          {savingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <form onSubmit={createPackage} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Create Package</h2>
            <div className="grid gap-3 md:grid-cols-4">
              <input required value={newPackage.key} onChange={e => setNewPackage(p => ({ ...p, key: e.target.value }))} placeholder="key" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input required value={newPackage.name} onChange={e => setNewPackage(p => ({ ...p, name: e.target.value }))} placeholder="Name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" value={newPackage.monthly_price} onChange={e => setNewPackage(p => ({ ...p, monthly_price: Number(e.target.value) }))} placeholder="Monthly" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" value={newPackage.annual_price} onChange={e => setNewPackage(p => ({ ...p, annual_price: Number(e.target.value) }))} placeholder="Annual" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" value={newPackage.trial_days} onChange={e => setNewPackage(p => ({ ...p, trial_days: Number(e.target.value) }))} placeholder="Trial days" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" value={newPackage.user_limit} onChange={e => setNewPackage(p => ({ ...p, user_limit: Number(e.target.value) }))} placeholder="Users" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input type="number" value={newPackage.invoice_limit} onChange={e => setNewPackage(p => ({ ...p, invoice_limit: Number(e.target.value) }))} placeholder="Invoices" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
                <PackagePlus className="h-4 w-4" />
                Create
              </button>
            </div>
          </form>

          {selectedPackage && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-900">Feature Entitlements: {selectedPackage.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURE_KEYS.map(featureKey => {
                  const enabled = selectedPackage.package_features?.find(feature => feature.feature_key === featureKey)?.enabled ?? false;
                  return (
                    <button
                      key={featureKey}
                      type="button"
                      onClick={() => toggleFeature(selectedPackage, featureKey)}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                        enabled ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}
                    >
                      <span>{FEATURE_LABELS[featureKey]}</span>
                      {enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <form onSubmit={createCoupon} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-900">
                <Tag className="h-5 w-5 text-blue-600" />
                Create Coupon
              </h2>
              <div className="space-y-3">
                <input required value={newCoupon.code} onChange={e => setNewCoupon(c => ({ ...c, code: e.target.value.toUpperCase() }))} placeholder="CODE" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold uppercase" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select value={newCoupon.discount_type} onChange={e => setNewCoupon(c => ({ ...c, discount_type: e.target.value as 'percentage' | 'fixed' }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed</option>
                  </select>
                  <input type="number" value={newCoupon.discount_value} onChange={e => setNewCoupon(c => ({ ...c, discount_value: Number(e.target.value) }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <select value={newCoupon.package_id} onChange={e => setNewCoupon(c => ({ ...c, package_id: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">All packages</option>
                  {packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="date" value={newCoupon.expiry_date} onChange={e => setNewCoupon(c => ({ ...c, expiry_date: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  <input type="number" value={newCoupon.usage_limit} onChange={e => setNewCoupon(c => ({ ...c, usage_limit: e.target.value }))} placeholder="Usage limit" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
                  <Coins className="h-4 w-4" />
                  Create Coupon
                </button>
              </div>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-bold text-slate-900">Coupons</h2>
              <div className="space-y-2">
                {coupons.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400">No coupons configured.</p>
                ) : coupons.map(coupon => (
                  <div key={coupon.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-mono text-sm font-black">{coupon.code}</p>
                      <p className="text-xs text-slate-500">
                        {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : coupon.discount_value} off · used {coupon.used_count}
                      </p>
                    </div>
                    <button type="button" onClick={() => toggleCoupon(coupon)} className={`rounded-lg px-3 py-2 text-xs font-bold ${coupon.is_active ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {coupon.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
