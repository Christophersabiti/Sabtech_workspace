'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useRequireRole } from '@/hooks/useCurrentUser';
import {
  CreditCard,
  Check,
  AlertCircle,
  Loader2,
  Calendar,
  History,
  ShieldCheck,
  Zap,
} from 'lucide-react';

type PackageFeatureRow = {
  feature_key?: string;
  feature_name: string;
  enabled: boolean;
  limit_value?: number | null;
};

type BillingPlan = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  monthly_price: number | null;
  annual_price: number | null;
  currency: string;
  billing_interval: string;
  user_limit: number;
  invoice_limit: number;
  package_features?: PackageFeatureRow[];
};

type TenantSubscription = {
  status?: string | null;
  billing_status?: string | null;
  trial_end_date?: string | null;
  ends_at?: string | null;
  current_period_end?: string | null;
  subscription_plans?: BillingPlan | null;
};

type BillingTransaction = {
  id: string;
  merchant_reference: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  status: string;
  created_at: string;
  subscription_plans?: { name: string | null } | null;
};

function formatMoney(value: number | null | undefined, currency = 'UGX') {
  if (!value) return 'Custom';
  return `${Number(value).toLocaleString()} ${currency}`;
}

function trialDaysRemaining(subscription: TenantSubscription | null) {
  const trialEnd = subscription?.trial_end_date || (subscription?.status === 'trialing' ? subscription?.ends_at : null);
  if (!trialEnd) return 0;
  return Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86_400_000));
}

function packageAmount(plan: BillingPlan) {
  return Number(plan.monthly_price ?? plan.price ?? 0);
}

function getSubscriptionDate(subscription: TenantSubscription | null, billingStatus: string) {
  if (!subscription) return null;

  if (billingStatus === 'trial_active' || billingStatus === 'trial_expired') {
    const date = subscription.trial_end_date || subscription.ends_at;
    return date ? { label: 'Trial ends', date } : null;
  }

  if (billingStatus === 'active' || billingStatus === 'past_due') {
    const date = subscription.current_period_end || subscription.ends_at;
    if (!date) return null;

    const periodEnd = new Date(date);
    const yearsOut = periodEnd.getFullYear() - new Date().getFullYear();
    if (yearsOut >= 20) return null;

    return {
      label: billingStatus === 'past_due' ? 'Expired' : 'Renews',
      date,
    };
  }

  if (billingStatus === 'cancelled') {
    const date = subscription.current_period_end || subscription.ends_at;
    return date ? { label: 'Ends', date } : null;
  }

  return null;
}

export default function TenantBillingPage() {
  const { checking } = useRequireRole(['super_admin', 'admin']);
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');

  const loadBillingData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch active plans
      const { data: plansData, error: plansErr } = await supabase
        .from('subscription_plans')
        .select('*, package_features(*)')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('monthly_price', { ascending: true });

      if (plansErr) throw plansErr;
      setPlans((plansData || []) as BillingPlan[]);

      // 2. Fetch active company subscription
      const { data: subData, error: subErr } = await supabase
        .from('company_subscriptions')
        .select('*, subscription_plans(*)')
        .eq('company_id', activeCompanyId)
        .maybeSingle();

      if (subErr) throw subErr;
      setSubscription(subData as TenantSubscription | null);

      // 3. Fetch past transactions
      const { data: txData, error: txErr } = await supabase
        .from('billing_transactions')
        .select('*, subscription_plans(name)')
        .eq('company_id', activeCompanyId)
        .order('created_at', { ascending: false });

      if (txErr) throw txErr;
      setTransactions((txData || []) as BillingTransaction[]);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load billing settings.');
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, supabase]);

  useEffect(() => {
    if (activeCompanyId && !companyLoading) {
      void loadBillingData();
    }
  }, [activeCompanyId, companyLoading, loadBillingData]);

  async function handleUpgrade(planId: string) {
    if (!activeCompanyId) return;
    setSubscribingPlanId(planId);
    setError(null);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: activeCompanyId,
          planId,
          couponCode: couponCode.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize checkout.');
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        throw new Error('No checkout redirect URL received.');
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
      setSubscribingPlanId(null);
    }
  }

  if (checking) return <div className="py-16 text-center text-slate-400">Checking permissions…</div>;
  if (companyLoading || (loading && !plans.length)) {
    return (
      <div className="py-16 text-center text-slate-400 flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading billing details…
      </div>
    );
  }

  const activePlanKey = subscription?.subscription_plans?.key || 'none';
  const billingStatus = subscription?.billing_status || subscription?.status || 'inactive';
  const daysRemaining = trialDaysRemaining(subscription);
  const subscriptionDate = getSubscriptionDate(subscription, billingStatus);

  return (
    <div className="space-y-8 max-w-5xl">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Active Subscription Status Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 flex-shrink-0">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Active Plan: <span className="text-purple-600">{subscription?.subscription_plans?.name || 'No Subscription'}</span>
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500 font-medium">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                Billing: <span className="capitalize font-bold text-green-600">{String(billingStatus).replace('_', ' ')}</span>
              </span>
              {billingStatus === 'trial_active' && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Trial: {daysRemaining} day{daysRemaining === 1 ? '' : 's'} remaining
                </span>
              )}
              {subscriptionDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {subscriptionDate.label}: {new Date(subscriptionDate.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>
        {subscription && (
          <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-center md:text-right">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tenant Limits</p>
            <p className="text-sm font-semibold text-slate-700 mt-0.5">
              {subscription.subscription_plans?.user_limit} Users · {subscription.subscription_plans?.invoice_limit} Invoices
            </p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block max-w-md">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-400">Coupon</span>
          <input
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold uppercase outline-none focus:ring-2 focus:ring-purple-500"
          />
        </label>
      </div>

      {/* Pricing Cards Selection */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Upgrade Subscription Package
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Select a subscription plan below to upgrade. Handled safely via Pesapal.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans
            .filter((p) => p.key !== 'enterprise') // Hide enterprise from standard checkout
            .map((plan) => {
              const isActive = plan.key === activePlanKey;
              const isPending = subscribingPlanId === plan.id;
              const amount = packageAmount(plan);
              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-2xl p-6 shadow-sm border flex flex-col justify-between relative transition-all ${
                    isActive
                      ? 'border-purple-600 ring-2 ring-purple-100'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow'
                  }`}
                >
                  {isActive && (
                    <span className="absolute -top-3 left-6 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
                      Active Plan
                    </span>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{plan.name}</h4>
                      <p className="text-xs text-slate-400 mt-1 h-8 leading-relaxed">{plan.description}</p>
                    </div>

                    <div className="flex items-baseline gap-1 pt-2">
                      <span className="text-2xl font-black text-slate-900">
                        {formatMoney(amount, plan.currency)}
                      </span>
                      {amount > 0 && (
                        <span className="text-slate-400 text-xs font-semibold">
                          / month
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-400">
                      Annual: {formatMoney(plan.annual_price, plan.currency)}
                    </p>

                    <ul className="space-y-2.5 pt-4 border-t border-slate-100 text-xs font-semibold text-slate-600">
                      {(plan.package_features?.length ? plan.package_features : [
                        { feature_name: `Up to ${plan.user_limit} Company Users`, enabled: true },
                        { feature_name: `Up to ${plan.invoice_limit} Invoices / month`, enabled: true },
                        { feature_name: 'Full Invoice & Quotation Modules', enabled: true },
                        { feature_name: 'Online Mobile Money Payments', enabled: true },
                      ]).slice(0, 5).map((feature: PackageFeatureRow) => (
                        <li key={feature.feature_key || feature.feature_name} className="flex items-center gap-2">
                          <Check className={`h-4 w-4 ${feature.enabled ? 'text-purple-600' : 'text-slate-300'}`} />
                          {feature.feature_name}
                          {feature.limit_value ? ` (${feature.limit_value})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={isActive || isPending || subscribingPlanId !== null}
                      className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                        isActive
                          ? 'bg-purple-50 text-purple-700 border border-purple-200 cursor-default'
                          : 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
                      }`}
                    >
                      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {isActive ? 'Current Plan' : isPending ? 'Initializing...' : 'Subscribe Now'}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Transactions History */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <History className="h-5 w-5 text-slate-500" />
          Billing Invoices & History
        </h3>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No historical subscription payments recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-5 py-3">Reference</th>
                    <th className="px-5 py-3">Billing Plan</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Paid Via</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Billing Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-mono">{tx.merchant_reference}</td>
                      <td className="px-5 py-3.5">{tx.subscription_plans?.name || 'SaaS'}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-900">
                        {tx.amount.toLocaleString()} {tx.currency}
                      </td>
                      <td className="px-5 py-3.5">{tx.payment_method || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${
                            tx.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : tx.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400">
                        {new Date(tx.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
