import type { SupabaseClient } from '@supabase/supabase-js';

export type BillingStatus =
  | 'trial_active'
  | 'trial_expired'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended';

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended';

export type FeatureKey =
  | 'clients.create'
  | 'projects.create'
  | 'tasks.create'
  | 'invoices.create'
  | 'quotations.create'
  | 'reports.export'
  | 'dashboard.advanced'
  | 'inventory.enabled'
  | 'accounting.enabled'
  | 'users.invite'
  | 'branding.customize'
  | 'billing.manage';

export type PackageFeature = {
  key: FeatureKey;
  name: string;
  enabled: boolean;
  limitValue: number | null;
};

export type EntitlementSnapshot = {
  companyId: string;
  packageId: string | null;
  packageKey: string;
  packageName: string;
  billingStatus: BillingStatus;
  subscriptionStatus: SubscriptionStatus;
  trialStartDate: string | null;
  trialEndDate: string | null;
  currentPeriodEnd: string | null;
  trialDaysRemaining: number;
  features: Record<FeatureKey, PackageFeature>;
};

export class EntitlementError extends Error {
  status: number;
  featureKey: FeatureKey;

  constructor(featureKey: FeatureKey, message = 'This feature is not available on the current plan.', status = 402) {
    super(message);
    this.name = 'EntitlementError';
    this.status = status;
    this.featureKey = featureKey;
  }
}

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  'clients.create': 'Create clients',
  'projects.create': 'Create projects',
  'tasks.create': 'Create tasks',
  'invoices.create': 'Create invoices',
  'quotations.create': 'Create quotations',
  'reports.export': 'Export reports',
  'dashboard.advanced': 'Advanced dashboards',
  'inventory.enabled': 'Inventory module',
  'accounting.enabled': 'Accounting reports',
  'users.invite': 'Invite team users',
  'branding.customize': 'Customize company branding',
  'billing.manage': 'Manage billing',
};

export const MAJOR_FEATURES_AFTER_TRIAL: FeatureKey[] = [
  'clients.create',
  'projects.create',
  'invoices.create',
  'quotations.create',
  'reports.export',
  'dashboard.advanced',
  'inventory.enabled',
  'accounting.enabled',
  'users.invite',
];

const STARTER_DEFAULTS: Record<FeatureKey, PackageFeature> = {
  'clients.create': feature('clients.create', true, 25),
  'projects.create': feature('projects.create', true, 5),
  'tasks.create': feature('tasks.create', true, 100),
  'invoices.create': feature('invoices.create', true, 50),
  'quotations.create': feature('quotations.create', true, 50),
  'reports.export': feature('reports.export', false),
  'dashboard.advanced': feature('dashboard.advanced', false),
  'inventory.enabled': feature('inventory.enabled', false),
  'accounting.enabled': feature('accounting.enabled', false),
  'users.invite': feature('users.invite', true, 3),
  'branding.customize': feature('branding.customize', false),
  'billing.manage': feature('billing.manage', true),
};

type PackageFeatureRow = {
  feature_key?: string | null;
  feature_name?: string | null;
  enabled?: boolean | null;
  limit_value?: number | null;
};

type PlanRow = {
  id?: string | null;
  key?: string | null;
  name?: string | null;
  package_features?: PackageFeatureRow[] | null;
};

type SubscriptionRow = {
  subscription_plans?: PlanRow | null;
  billing_status?: string | null;
  subscription_status?: string | null;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
  current_period_end?: string | null;
};

function feature(key: FeatureKey, enabled: boolean, limitValue: number | null = null): PackageFeature {
  return {
    key,
    name: FEATURE_LABELS[key],
    enabled,
    limitValue,
  };
}

function normalizeBillingStatus(rawStatus: unknown, trialEndDate: string | null, currentPeriodEnd: string | null): BillingStatus {
  const now = Date.now();
  const status = typeof rawStatus === 'string' ? rawStatus : '';

  if (status === 'trial_active' && trialEndDate && new Date(trialEndDate).getTime() < now) {
    return 'trial_expired';
  }

  if (status === 'active' && currentPeriodEnd && new Date(currentPeriodEnd).getTime() < now) {
    return 'past_due';
  }

  if (
    status === 'trial_active' ||
    status === 'trial_expired' ||
    status === 'active' ||
    status === 'past_due' ||
    status === 'cancelled' ||
    status === 'suspended'
  ) {
    return status;
  }

  if (status === 'trialing') {
    return trialEndDate && new Date(trialEndDate).getTime() < now ? 'trial_expired' : 'trial_active';
  }

  if (status === 'expired') return 'trial_expired';
  if (status === 'canceled') return 'cancelled';

  return 'active';
}

function normalizeSubscriptionStatus(rawStatus: unknown): SubscriptionStatus {
  const status = typeof rawStatus === 'string' ? rawStatus : '';
  if (
    status === 'trialing' ||
    status === 'active' ||
    status === 'past_due' ||
    status === 'cancelled' ||
    status === 'suspended'
  ) {
    return status;
  }

  if (status === 'canceled') return 'cancelled';
  if (status === 'expired') return 'past_due';
  return 'active';
}

function daysRemaining(date: string | null) {
  if (!date) return 0;
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
}

function blockedByBilling(snapshot: EntitlementSnapshot, featureKey: FeatureKey) {
  if (featureKey === 'billing.manage') return false;
  if (!MAJOR_FEATURES_AFTER_TRIAL.includes(featureKey)) return false;
  return ['trial_expired', 'past_due', 'cancelled', 'suspended'].includes(snapshot.billingStatus);
}

export async function getCompanyEntitlementSnapshot(
  supabase: SupabaseClient,
  companyId: string,
): Promise<EntitlementSnapshot> {
  const { data: subscription } = await supabase
    .from('company_subscriptions')
    .select('*, subscription_plans(*, package_features(*))')
    .eq('company_id', companyId)
    .maybeSingle();

  const subscriptionRow = subscription as SubscriptionRow | null;
  const plan = subscriptionRow?.subscription_plans;
  const trialEndDate =
    subscriptionRow?.trial_end_date ??
    (subscriptionRow?.status === 'trialing' ? subscriptionRow.ends_at : null) ??
    null;
  const currentPeriodEnd =
    subscriptionRow?.current_period_end ??
    subscriptionRow?.ends_at ??
    null;

  const billingStatus = normalizeBillingStatus(
    subscriptionRow?.billing_status ?? subscriptionRow?.status,
    trialEndDate,
    currentPeriodEnd,
  );
  const subscriptionStatus = normalizeSubscriptionStatus(
    subscriptionRow?.subscription_status ?? subscriptionRow?.status,
  );

  const features = { ...STARTER_DEFAULTS };
  for (const row of plan?.package_features ?? []) {
    const key = row.feature_key as FeatureKey;
    if (!FEATURE_LABELS[key]) continue;
    features[key] = {
      key,
      name: row.feature_name || FEATURE_LABELS[key],
      enabled: !!row.enabled,
      limitValue: typeof row.limit_value === 'number' ? row.limit_value : null,
    };
  }

  return {
    companyId,
    packageId: (plan?.id as string | undefined) ?? null,
    packageKey: (plan?.key as string | undefined) ?? 'starter',
    packageName: (plan?.name as string | undefined) ?? 'Starter',
    billingStatus,
    subscriptionStatus,
    trialStartDate:
      subscriptionRow?.trial_start_date ??
      subscriptionRow?.starts_at ??
      null,
    trialEndDate,
    currentPeriodEnd,
    trialDaysRemaining: billingStatus === 'trial_active' ? daysRemaining(trialEndDate) : 0,
    features,
  };
}

export function canUseFeature(snapshot: EntitlementSnapshot, featureKey: FeatureKey) {
  if (blockedByBilling(snapshot, featureKey)) return false;
  return snapshot.features[featureKey]?.enabled ?? false;
}

export async function assertFeatureEntitlement(
  supabase: SupabaseClient,
  authUserId: string,
  companyId: string,
  featureKey: FeatureKey,
) {
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, role, status')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (appUser?.role === 'super_admin' && appUser.status === 'active') {
    return getCompanyEntitlementSnapshot(supabase, companyId);
  }

  const { data: membership } = await supabase
    .from('company_users')
    .select('role_id, status')
    .eq('auth_user_id', authUserId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!membership || membership.status !== 'active') {
    throw new EntitlementError(featureKey, 'You are not an active member of this company.', 403);
  }

  const snapshot = await getCompanyEntitlementSnapshot(supabase, companyId);
  if (!canUseFeature(snapshot, featureKey)) {
    const statusText = snapshot.billingStatus.replace('_', ' ');
    throw new EntitlementError(
      featureKey,
      `${FEATURE_LABELS[featureKey]} is not available while billing is ${statusText}.`,
      snapshot.billingStatus === 'trial_expired' ? 402 : 403,
    );
  }

  return snapshot;
}
