-- ═══════════════════════════════════════════════════════════════════════════
-- Sabtech Online — Migration 003: Admin Settings, Payment Methods, Users
-- Run this in Supabase SQL Editor AFTER migration 002
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. COMPANY SETTINGS (single-row config table, id always = 1)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists company_settings (
  id                      integer primary key default 1 check (id = 1),
  company_name            text not null default 'Sabtech Online',
  trading_name            text,
  email                   text default 'info@sabtechonline.com',
  phone                   text default '+256 777 293 933',
  website                 text default 'www.sabtechonline.com',
  address                 text default 'Kasese, Uganda',
  country                 text default 'Uganda',
  currency                text default 'UGX',
  tin                     text default '1009345230',
  registration_number     text,
  logo_url                text,
  default_invoice_footer  text default 'Thank you for your business. Payment is due within the specified due date.',
  invoice_prefix          text default 'INV',
  receipt_prefix          text default 'RCP',
  quote_prefix            text default 'QUO',
  default_due_days        integer default 14,
  show_tin_on_invoice     boolean default true,
  show_logo_on_invoice    boolean default true,
  show_payment_history    boolean default true,
  primary_color           text default '#0f172a',
  accent_color            text default '#7c2cbf',
  updated_at              timestamptz default now()
);

-- Seed default row
insert into company_settings (id) values (1) on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PAYMENT METHODS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists payment_methods (
  id              uuid primary key default gen_random_uuid(),
  method_type     text not null check (method_type in (
                    'mobile_money','momo_merchant','bank_transfer',
                    'wire_transfer','cash','card','cheque','other'
                  )),
  display_name    text not null,
  account_name    text,
  account_number  text,
  phone_number    text,
  merchant_code   text,
  bank_name       text,
  branch          text,
  swift_code      text,
  currency        text default 'UGX',
  instructions    text,
  is_active       boolean default true,
  show_on_invoice boolean default true,
  display_order   integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_pm_order on payment_methods(is_active, show_on_invoice, display_order);

-- Seed default payment methods
insert into payment_methods (method_type, display_name, account_name, phone_number, is_active, show_on_invoice, display_order)
values ('mobile_money', 'MTN Mobile Money', 'Christopher Sabiti', '0777293933', true, true, 1);

insert into payment_methods (method_type, display_name, account_name, merchant_code, is_active, show_on_invoice, display_order)
values ('momo_merchant', 'MOMO Merchant', 'Christopher Sabiti', '876997', true, true, 2);

insert into payment_methods (method_type, display_name, account_name, account_number, bank_name, branch, is_active, show_on_invoice, display_order)
values ('bank_transfer', 'Centenary Bank Transfer', 'Christopher Sabiti', '3200051550', 'Centenary Bank', 'Kasese', true, true, 3);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. ROLES
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists roles (
  id          text primary key,
  label       text not null,
  description text,
  is_system   boolean default false,
  created_at  timestamptz default now()
);

insert into roles (id, label, description, is_system) values
  ('super_admin',     'Super Admin',     'Full system access, cannot be restricted', true),
  ('admin',           'Admin',           'Full access except super admin functions',  true),
  ('finance',         'Finance',         'Invoices, payments, reports',               true),
  ('project_manager', 'Project Manager', 'Clients, projects, invoices view',          true),
  ('staff',           'Staff',           'Basic read access to assigned modules',     true),
  ('client',          'Client',          'View own invoices and payments only',       true)
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists permissions (
  id          text primary key,
  module      text not null,
  action      text not null,
  label       text not null,
  description text
);

insert into permissions (id, module, action, label) values
  ('clients.view',          'clients',  'view',         'View Clients'),
  ('clients.create',        'clients',  'create',       'Create Clients'),
  ('clients.edit',          'clients',  'edit',         'Edit Clients'),
  ('clients.archive',       'clients',  'archive',      'Archive Clients'),
  ('projects.view',         'projects', 'view',         'View Projects'),
  ('projects.create',       'projects', 'create',       'Create Projects'),
  ('projects.edit',         'projects', 'edit',         'Edit Projects'),
  ('invoices.view',         'invoices', 'view',         'View Invoices'),
  ('invoices.create',       'invoices', 'create',       'Create Invoices'),
  ('invoices.edit',         'invoices', 'edit',         'Edit Invoices'),
  ('invoices.send',         'invoices', 'send',         'Mark Invoices as Sent'),
  ('invoices.download_pdf', 'invoices', 'download_pdf', 'Download Invoice PDF'),
  ('payments.view',         'payments', 'view',         'View Payments'),
  ('payments.create',       'payments', 'create',       'Record Payments'),
  ('payments.confirm',      'payments', 'confirm',      'Confirm Payments'),
  ('reports.view',          'reports',  'view',         'View Reports'),
  ('services.view',         'services', 'view',         'View Services'),
  ('services.manage',       'services', 'manage',       'Manage Services'),
  ('settings.view',         'settings', 'view',         'View Settings'),
  ('settings.manage',       'settings', 'manage',       'Manage Admin Settings'),
  ('users.view',            'users',    'view',         'View Users'),
  ('users.manage',          'users',    'manage',       'Manage Users'),
  ('roles.manage',          'roles',    'manage',       'Manage Roles')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. ROLE PERMISSIONS (default permissions per role)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists role_permissions (
  role_id       text references roles(id) on delete cascade,
  permission_id text references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Super Admin: all permissions
insert into role_permissions (role_id, permission_id)
select 'super_admin', id from permissions on conflict do nothing;

-- Admin: all except roles.manage
insert into role_permissions (role_id, permission_id)
select 'admin', id from permissions where id <> 'roles.manage' on conflict do nothing;

-- Finance
insert into role_permissions (role_id, permission_id) values
  ('finance', 'clients.view'),
  ('finance', 'projects.view'),
  ('finance', 'invoices.view'),
  ('finance', 'invoices.create'),
  ('finance', 'invoices.edit'),
  ('finance', 'invoices.send'),
  ('finance', 'invoices.download_pdf'),
  ('finance', 'payments.view'),
  ('finance', 'payments.create'),
  ('finance', 'payments.confirm'),
  ('finance', 'reports.view'),
  ('finance', 'services.view')
on conflict do nothing;

-- Project Manager
insert into role_permissions (role_id, permission_id) values
  ('project_manager', 'clients.view'),
  ('project_manager', 'clients.create'),
  ('project_manager', 'projects.view'),
  ('project_manager', 'projects.create'),
  ('project_manager', 'projects.edit'),
  ('project_manager', 'invoices.view'),
  ('project_manager', 'invoices.create'),
  ('project_manager', 'invoices.download_pdf'),
  ('project_manager', 'payments.view'),
  ('project_manager', 'services.view')
on conflict do nothing;

-- Staff
insert into role_permissions (role_id, permission_id) values
  ('staff', 'clients.view'),
  ('staff', 'projects.view'),
  ('staff', 'invoices.view'),
  ('staff', 'invoices.download_pdf'),
  ('staff', 'payments.view'),
  ('staff', 'services.view')
on conflict do nothing;

-- Client (own data only - RLS enforces scope)
insert into role_permissions (role_id, permission_id) values
  ('client', 'invoices.view'),
  ('client', 'invoices.download_pdf'),
  ('client', 'payments.view')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. APP USERS (extends Supabase auth.users)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete cascade,
  email         text not null,
  full_name     text,
  avatar_url    text,
  role          text not null default 'staff' references roles(id),
  status        text not null default 'active'
                check (status in ('invited','active','inactive','suspended')),
  invited_by    uuid references app_users(id),
  invited_at    timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_app_users_auth  on app_users(auth_user_id);
create index if not exists idx_app_users_email on app_users(email);
create index if not exists idx_app_users_role  on app_users(role);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. USER PERMISSION OVERRIDES
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists user_permission_overrides (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_users(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  granted       boolean not null,
  set_by        uuid references app_users(id),
  set_at        timestamptz default now(),
  unique (app_user_id, permission_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. INVITATIONS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists invitations (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  role                 text not null references roles(id),
  token                text unique not null default encode(gen_random_bytes(32), 'hex'),
  status               text not null default 'pending'
                       check (status in ('pending','accepted','expired','cancelled')),
  invited_by           uuid references app_users(id),
  permission_overrides jsonb,
  expires_at           timestamptz default (now() + interval '7 days'),
  accepted_at          timestamptz,
  created_at           timestamptz default now()
);

create index if not exists idx_invitations_email  on invitations(email);
create index if not exists idx_invitations_token  on invitations(token);
create index if not exists idx_invitations_status on invitations(status);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. RLS POLICIES FOR NEW TABLES
-- ─────────────────────────────────────────────────────────────────────────
alter table company_settings          enable row level security;
alter table payment_methods           enable row level security;
alter table roles                     enable row level security;
alter table permissions               enable row level security;
alter table role_permissions          enable row level security;
alter table app_users                 enable row level security;
alter table user_permission_overrides enable row level security;
alter table invitations               enable row level security;

-- Public read (settings/roles needed by invoice rendering and frontend)
create policy "public_read_company_settings"  on company_settings   for select using (true);
create policy "public_read_payment_methods"   on payment_methods    for select using (true);
create policy "public_read_roles"             on roles              for select using (true);
create policy "public_read_permissions"       on permissions        for select using (true);
create policy "public_read_role_permissions"  on role_permissions   for select using (true);

-- Full access via service role (admin API calls use service role key)
create policy "service_write_company"   on company_settings          for all using (true) with check (true);
create policy "service_write_pm"        on payment_methods           for all using (true) with check (true);
create policy "service_write_users"     on app_users                 for all using (true) with check (true);
create policy "service_write_invites"   on invitations               for all using (true) with check (true);
create policy "service_write_overrides" on user_permission_overrides for all using (true) with check (true);
create policy "service_write_roles"     on roles                     for all using (true) with check (true);
