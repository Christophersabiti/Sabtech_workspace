import { SupabaseClient } from '@supabase/supabase-js';

export type PermissionAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'record_payment'
  | 'export'
  | 'impersonate';

export type PermissionModule =
  | 'clients'
  | 'projects'
  | 'tasks'
  | 'quotations'
  | 'invoices'
  | 'payments'
  | 'reports'
  | 'settings'
  | 'users'
  | 'audit_logs'
  | 'subscriptions'
  | 'system';

type Membership = {
  company_id: string;
  role_id: string;
  status: string;
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: ['*'],
  finance: [
    'clients.read',
    'projects.read',
    'tasks.read',
    'quotations.read',
    'quotations.create',
    'quotations.update',
    'quotations.approve',
    'invoices.*',
    'payments.*',
    'payments.record_payment',
    'reports.read',
    'reports.export',
    'audit_logs.read',
    'settings.read',
  ],
  project_manager: [
    'clients.read',
    'projects.*',
    'tasks.*',
    'quotations.read',
    'quotations.create',
    'quotations.update',
    'quotations.approve',
    'invoices.read',
    'reports.read',
  ],
  staff: [
    'clients.read',
    'projects.read',
    'tasks.read',
    'tasks.update',
    'quotations.read',
    'invoices.read',
  ],
  viewer: [
    'clients.read',
    'projects.read',
    'tasks.read',
    'quotations.read',
    'invoices.read',
    'payments.read',
    'reports.read',
  ],
};

export class PermissionError extends Error {
  status: number;

  constructor(message = 'Forbidden', status = 403) {
    super(message);
    this.name = 'PermissionError';
    this.status = status;
  }
}

export class PermissionService {
  constructor(private supabase: SupabaseClient) {}

  async getActiveCompanyId(userId: string, requestedCompanyId?: string | null) {
    if (requestedCompanyId) {
      await this.assertCompanyAccess(userId, requestedCompanyId);
      return requestedCompanyId;
    }

    const { data } = await this.supabase
      .from('company_users')
      .select('company_id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data?.company_id) {
      throw new PermissionError('No active company membership found.');
    }

    return data.company_id as string;
  }

  async assertCompanyAccess(userId: string, companyId: string) {
    const membership = await this.getMembership(userId, companyId);
    if (!membership) {
      throw new PermissionError('You do not have access to this company.');
    }
    return membership;
  }

  async assertPermission(
    userId: string,
    companyId: string,
    module: PermissionModule,
    action: PermissionAction,
  ) {
    const membership = await this.assertCompanyAccess(userId, companyId);
    if (!this.roleAllows(membership.role_id, module, action)) {
      throw new PermissionError('You do not have permission to perform this action.');
    }
    return membership;
  }

  async isSuperAdmin(userId: string) {
    const { data } = await this.supabase
      .from('company_users')
      .select('id')
      .eq('auth_user_id', userId)
      .eq('status', 'active')
      .eq('role_id', 'super_admin')
      .limit(1)
      .maybeSingle();

    return !!data;
  }

  async canImpersonate(userId: string) {
    return this.isSuperAdmin(userId);
  }

  private async getMembership(userId: string, companyId: string): Promise<Membership | null> {
    const { data } = await this.supabase
      .from('company_users')
      .select('company_id, role_id, status')
      .eq('auth_user_id', userId)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .maybeSingle();

    return (data as Membership | null) ?? null;
  }

  private roleAllows(role: string, module: PermissionModule, action: PermissionAction) {
    const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.viewer;
    const requested = `${module}.${action}`;
    return permissions.includes('*') || permissions.includes(`${module}.*`) || permissions.includes(requested);
  }
}
