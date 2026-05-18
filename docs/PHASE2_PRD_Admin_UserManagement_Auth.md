# Sabtech Online — Phase 2 PRD
# Admin Settings · User Management · Roles & Permissions · Social Auth

**Version:** 1.0
**Date:** April 2026
**Author:** Senior Engineering & Product Team
**Status:** Implementation-Ready

---

## SECTION 1: EXECUTIVE OVERVIEW

### Objective
Transform the existing Sabtech Online invoicing system into a fully managed internal operations console with configurable company identity, dynamic payment methods, user-level access control, and secure authentication — without rebuilding the existing billing and invoicing layer.

### Business Problems Solved
| Problem | Solution |
|---|---|
| Payment instructions hardcoded in invoice template | `payment_methods` table — managed from Admin Settings |
| Company name, TIN, logo not configurable | `company_settings` table — Admin Panel |
| Any browser user can modify data | Role-based auth with protected routes and RLS |
| No concept of staff, finance, or manager roles | Roles + Permissions model with module-level access |
| No way to invite team members | Invitation flow with email + role assignment |
| Login is not secure | Supabase Auth: email/password + Google + Apple |
| Logo and branding hardcoded | Upload to Supabase Storage, served dynamically |

---

## SECTION 2: FEATURE SCOPE

### Phase 2A — Invoice & Payment Settings (Immediate)
- [x] Payment instructions block on invoice UI and PDF
- [x] TIN displayed on invoice header and PDF footer
- [x] Company logo on invoice PDF (inline SVG)
- [x] Download PDF button (auto-print-to-PDF flow)
- [ ] `company_settings` table — admin-editable
- [ ] `payment_methods` table — admin-editable, replaces hardcoded values
- [ ] Invoice PDF reads from DB settings dynamically

### Phase 2B — Admin Settings Module
- [ ] Company Profile page (name, TIN, address, logo, email, phone)
- [ ] Payment Methods management (CRUD, reorder, active/inactive)
- [ ] Invoice Settings (prefix, due days, footer, show/hide toggles)
- [ ] Branding Settings (logo, primary color, accent color, PDF style)

### Phase 2C — User Management
- [ ] Users list with status, role, last login
- [ ] Invite user by email + role
- [ ] User detail and permissions override
- [ ] Activate / Deactivate / Suspend users
- [ ] Invitation history and resend

### Phase 2D — Roles & Permissions
- [ ] Role definitions: Super Admin, Admin, Finance, Project Manager, Staff, Client
- [ ] Permission matrix: module × action
- [ ] Per-user permission overrides
- [ ] Route guards and UI visibility based on permissions

### Phase 2E — Authentication
- [ ] Email + Password login
- [ ] Google OAuth via Supabase
- [ ] Apple OAuth via Supabase
- [ ] Protected routes middleware
- [ ] Session persistence, logout
- [ ] Invitation acceptance → auto-link to role

---

## SECTION 3: ADMIN SETTINGS MODULE DESIGN

### Route Structure
```
/admin/settings/company        — Company Profile
/admin/settings/payment-methods — Payment Methods Manager
/admin/settings/invoice        — Invoice Configuration
/admin/settings/branding       — Branding & Logo
```

### Page: Company Profile (`/admin/settings/company`)
**Components:**
- `CompanyProfileForm` — controlled form with all company fields
- `LogoUploader` — drag-drop upload to Supabase Storage
- `SaveButton` with optimistic loading state

**Fields:**
| Field | Type | Validation |
|---|---|---|
| company_name | text | required, max 100 |
| trading_name | text | optional |
| email | email | required, valid format |
| phone | text | optional |
| website | url | optional |
| address | textarea | optional |
| country | select | default Uganda |
| currency | select | UGX, USD, EUR, GBP, KES |
| tin | text | optional, shown on invoices |
| registration_number | text | optional |
| default_invoice_footer | textarea | optional, max 500 |
| logo_url | internal | set by LogoUploader |

**Actions:**
- Save (upsert to `company_settings` — single row, `id = 1`)
- Upload Logo → Supabase Storage `logos/` bucket → save public URL
- Remove Logo → clear `logo_url`

**Access:** Super Admin, Admin only

---

## SECTION 4: PAYMENT METHODS MANAGEMENT DESIGN

### Page: Payment Methods (`/admin/settings/payment-methods`)

**List View:**
- Cards for each payment method with drag-handle for reordering
- Toggle switch for `is_active` and `show_on_invoice`
- Edit / Delete actions per card
- "Add Payment Method" button → modal

**Add/Edit Modal Fields:**
| Field | Type | Notes |
|---|---|---|
| method_type | select | mobile_money, bank_transfer, momo_merchant, wire_transfer, cash, card, other |
| display_name | text | e.g. "MTN Mobile Money" |
| account_name | text | |
| account_number | text | bank account or MOMO number |
| phone_number | text | for mobile money |
| merchant_code | text | for MOMO merchant |
| bank_name | text | for bank/wire |
| branch | text | |
| swift_code | text | for wire transfer |
| currency | text | default: UGX |
| instructions | textarea | custom instructions |
| is_active | boolean | default true |
| show_on_invoice | boolean | default true |
| display_order | integer | for ordering on invoice |

**Invoice PDF Logic:**
```typescript
// In PDF route — replaces hardcoded PAYMENT_METHODS_DATA
const { data: paymentMethods } = await supabase
  .from('payment_methods')
  .select('*')
  .eq('is_active', true)
  .eq('show_on_invoice', true)
  .order('display_order');

// Falls back to hardcoded defaults if table is empty
const methods = paymentMethods?.length ? paymentMethods : DEFAULT_PAYMENT_METHODS;
```

**Validation Rules:**
- At least one payment method must remain active
- display_name is required
- method_type is required
- If method_type = mobile_money or momo_merchant: phone_number or merchant_code required
- If method_type = bank_transfer or wire_transfer: account_number + bank_name required

---

## SECTION 5: INVOICE TEMPLATE AND PDF ENHANCEMENTS

### Already Implemented (Phase 2A)
- ✅ Logo: inline SVG in PDF header (will become dynamic `<img>` once `company_settings.logo_url` is set)
- ✅ TIN: shown in PDF header beside company name
- ✅ Payment Instructions: purple-bordered block with all 3 payment methods
- ✅ Download PDF button: opens `/api/pdf/invoice/[id]?print=1` which auto-triggers print dialog
- ✅ Preview button: opens clean PDF view without auto-print
- ✅ Payment Instructions card: shown in invoice detail sidebar

### Dynamic Settings Loading (Phase 2B)
Update `src/app/api/pdf/invoice/[id]/route.ts`:
```typescript
// Load company settings from DB, fallback to COMPANY const
const { data: companySetting } = await supabase
  .from('company_settings')
  .select('*')
  .single();

const co = companySetting ?? COMPANY_DEFAULTS;

// Load payment methods from DB
const { data: pmethods } = await supabase
  .from('payment_methods')
  .select('*')
  .eq('show_on_invoice', true)
  .eq('is_active', true)
  .order('display_order');
```

### PDF Download Flow (Browser)
```
User clicks "Download PDF"
  → opens /api/pdf/invoice/[id]?print=1 in new tab
  → page loads fully branded HTML invoice
  → window.addEventListener('load') fires setTimeout 400ms
  → window.print() triggers browser print dialog
  → user selects "Save as PDF" destination
  → PDF saved to device with invoice number as filename
```

### Future: True Server-Side PDF (Phase 3+)
Use Vercel Edge Function + `@sparticuz/chromium` + `puppeteer-core` for headless PDF generation.
Return with `Content-Disposition: attachment; filename="INV-2026-0001.pdf"` header.
Store in Supabase Storage `invoices/` bucket.

---

## SECTION 6: USER MANAGEMENT MODULE DESIGN

### Route Structure
```
/admin/users                   — Users list
/admin/users/invite            — Invite user page/modal
/admin/users/[id]              — User detail and permissions
/admin/users/roles             — Role definitions
/admin/users/permissions       — Permission matrix
/admin/users/invitations       — Invitation history
```

### Users List Page
**Table columns:** Avatar | Name | Email | Role | Status | Last Login | Invited Date | Actions

**Actions per user:**
- Edit role
- View permissions
- Activate / Deactivate
- Resend invite (if status = invited)
- Suspend

**Filters:** All | Active | Invited | Inactive | Suspended
**Search:** by name or email

### Invite User Flow
1. Admin clicks "Invite User"
2. Modal opens: Email + Role selector
3. Optional: expand "Advanced Permissions" to override specific permissions
4. Click "Send Invite"
5. System:
   - Inserts row in `invitations` table with `token`, `email`, `role`, `expires_at`
   - Sends email via Supabase `auth.admin.inviteUserByEmail()` or custom Edge Function
   - Status: `invited`
6. User receives email with magic link
7. User clicks link → redirected to `/auth/accept-invite?token=...`
8. User signs in (Google, Apple, or email/password)
9. System:
   - Matches email to invitation
   - Creates row in `app_users` table with role + permissions
   - Sets status: `active`
   - Redirects to dashboard

### User Status Machine
```
(none) → invited → active → inactive
                          → suspended
              active ← (re-activate)
```

### User Detail Page
- Profile info (read from Supabase Auth + `app_users` join)
- Role selector (admin can change)
- Permission overrides grid (toggle per permission)
- Activity log (last 20 entries from `audit_log`)
- Danger zone: Deactivate / Delete

---

## SECTION 7: AUTHENTICATION AND SOCIAL LOGIN DESIGN

### Supabase Auth Setup

**Enable providers in Supabase Dashboard:**
- Email (already default)
- Google OAuth → requires Google Cloud Console OAuth app
- Apple OAuth → requires Apple Developer account + Sign In with Apple

**Environment Variables:**
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# Google OAuth (set in Supabase Dashboard, not .env)
# Apple OAuth (set in Supabase Dashboard, not .env)
```

### Login Page (`/login`)
**Components:**
- `LoginForm` — email + password fields
- `GoogleSignInButton` — calls `supabase.auth.signInWithOAuth({ provider: 'google' })`
- `AppleSignInButton` — calls `supabase.auth.signInWithOAuth({ provider: 'apple' })`
- Divider "or continue with"

**File:** `src/app/login/page.tsx`

```tsx
'use client';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signInWithApple() {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }
  // ... email/password form
}
```

### Auth Callback Route (`/auth/callback`)
**File:** `src/app/auth/callback/route.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = createServerClient(...);
    await supabase.auth.exchangeCodeForSession(code);
    // Check if user has app_users record
    // If not, create with default 'staff' role or match invitation
  }
  return NextResponse.redirect(new URL('/', req.url));
}
```

### Route Protection (Middleware)
**File:** `src/middleware.ts`
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const supabase = createServerClient(...);
  const { data: { session } } = await supabase.auth.getSession();

  // Protect all routes except /login, /auth/*
  if (!session && !pathname.startsWith('/login') && !pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Protect admin routes — check role
  if (pathname.startsWith('/admin') && session) {
    const { data: appUser } = await supabase
      .from('app_users')
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single();

    if (!['super_admin', 'admin'].includes(appUser?.role ?? '')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.svg).*)'],
};
```

### Invitation Email Matching
When user signs in after receiving invite:
1. Get `session.user.email`
2. Query `invitations` where `email = session.user.email AND status = 'pending' AND expires_at > now()`
3. If found: create `app_users` row with invitation's `role` and default permissions
4. Mark invitation `status = 'accepted'`
5. If not found and no `app_users` record: deny access, show "Access Restricted" page

---

## SECTION 8: DATABASE SCHEMA CHANGES

Run this migration as `003_admin_user_management.sql` in Supabase SQL Editor:

```sql
-- ═══════════════════════════════════════════════════════════
-- 1. COMPANY SETTINGS (single-row config table)
-- ═══════════════════════════════════════════════════════════
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
  default_invoice_footer  text default 'Thank you for your business.',
  invoice_prefix          text default 'INV',
  receipt_prefix          text default 'RCP',
  quote_prefix            text default 'QUO',
  default_due_days        integer default 14,
  show_tin_on_invoice     boolean default true,
  show_logo_on_invoice    boolean default true,
  show_payment_history    boolean default true,
  primary_color           text default '#0f172a',
  accent_color            text default '#7c2cbf',
  updated_at              timestamptz default now(),
  updated_by              uuid references auth.users(id)
);

-- Seed default values
insert into company_settings (id) values (1) on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════
-- 2. PAYMENT METHODS
-- ═══════════════════════════════════════════════════════════
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
  updated_at      timestamptz default now(),
  created_by      uuid references auth.users(id)
);

create index if not exists idx_pm_active on payment_methods(is_active, show_on_invoice, display_order);

-- Seed default payment methods
insert into payment_methods (method_type, display_name, account_name, phone_number, show_on_invoice, display_order)
values ('mobile_money', 'MTN Mobile Money', 'Christopher Sabiti', '0777293933', true, 1)
on conflict do nothing;

insert into payment_methods (method_type, display_name, account_name, merchant_code, show_on_invoice, display_order)
values ('momo_merchant', 'MOMO Merchant', 'Christopher Sabiti', '876997', true, 2)
on conflict do nothing;

insert into payment_methods (method_type, display_name, account_name, account_number, bank_name, branch, show_on_invoice, display_order)
values ('bank_transfer', 'Centenary Bank Transfer', 'Christopher Sabiti', '3200051550', 'Centenary Bank', 'Kasese', true, 3)
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════
-- 3. ROLES
-- ═══════════════════════════════════════════════════════════
create table if not exists roles (
  id          text primary key,  -- e.g. 'super_admin', 'admin', 'finance'
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

-- ═══════════════════════════════════════════════════════════
-- 4. PERMISSIONS
-- ═══════════════════════════════════════════════════════════
create table if not exists permissions (
  id          text primary key,  -- e.g. 'invoices.create'
  module      text not null,     -- e.g. 'invoices'
  action      text not null,     -- e.g. 'create'
  label       text not null,
  description text
);

insert into permissions (id, module, action, label) values
  ('clients.view',         'clients',  'view',    'View Clients'),
  ('clients.create',       'clients',  'create',  'Create Clients'),
  ('clients.edit',         'clients',  'edit',    'Edit Clients'),
  ('clients.archive',      'clients',  'archive', 'Archive Clients'),
  ('projects.view',        'projects', 'view',    'View Projects'),
  ('projects.create',      'projects', 'create',  'Create Projects'),
  ('projects.edit',        'projects', 'edit',    'Edit Projects'),
  ('invoices.view',        'invoices', 'view',    'View Invoices'),
  ('invoices.create',      'invoices', 'create',  'Create Invoices'),
  ('invoices.edit',        'invoices', 'edit',    'Edit Invoices'),
  ('invoices.send',        'invoices', 'send',    'Mark Invoices as Sent'),
  ('invoices.download_pdf','invoices', 'download_pdf', 'Download Invoice PDF'),
  ('payments.view',        'payments', 'view',    'View Payments'),
  ('payments.create',      'payments', 'create',  'Record Payments'),
  ('payments.confirm',     'payments', 'confirm', 'Confirm Payments'),
  ('reports.view',         'reports',  'view',    'View Reports'),
  ('services.view',        'services', 'view',    'View Services'),
  ('services.manage',      'services', 'manage',  'Manage Services'),
  ('settings.view',        'settings', 'view',    'View Settings'),
  ('settings.manage',      'settings', 'manage',  'Manage Admin Settings'),
  ('users.view',           'users',    'view',    'View Users'),
  ('users.manage',         'users',    'manage',  'Manage Users'),
  ('roles.manage',         'roles',    'manage',  'Manage Roles')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════
-- 5. ROLE PERMISSIONS (default permissions per role)
-- ═══════════════════════════════════════════════════════════
create table if not exists role_permissions (
  role_id       text references roles(id) on delete cascade,
  permission_id text references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Super Admin gets everything
insert into role_permissions (role_id, permission_id)
select 'super_admin', id from permissions on conflict do nothing;

-- Admin gets everything except roles.manage
insert into role_permissions (role_id, permission_id)
select 'admin', id from permissions where id != 'roles.manage' on conflict do nothing;

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

-- Client (own data only — enforced by RLS)
insert into role_permissions (role_id, permission_id) values
  ('client', 'invoices.view'),
  ('client', 'invoices.download_pdf'),
  ('client', 'payments.view')
on conflict do nothing;

-- ═══════════════════════════════════════════════════════════
-- 6. APP USERS (extends Supabase auth.users)
-- ═══════════════════════════════════════════════════════════
create table if not exists app_users (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  role            text not null default 'staff' references roles(id),
  status          text not null default 'active'
                  check (status in ('invited','active','inactive','suspended')),
  invited_by      uuid references app_users(id),
  invited_at      timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_app_users_auth on app_users(auth_user_id);
create index if not exists idx_app_users_email on app_users(email);
create index if not exists idx_app_users_role on app_users(role);

-- ═══════════════════════════════════════════════════════════
-- 7. USER PERMISSION OVERRIDES
-- ═══════════════════════════════════════════════════════════
create table if not exists user_permission_overrides (
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_users(id) on delete cascade,
  permission_id text not null references permissions(id) on delete cascade,
  granted       boolean not null,  -- true = grant, false = revoke
  set_by        uuid references app_users(id),
  set_at        timestamptz default now(),
  unique (app_user_id, permission_id)
);

-- ═══════════════════════════════════════════════════════════
-- 8. INVITATIONS
-- ═══════════════════════════════════════════════════════════
create table if not exists invitations (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  role            text not null references roles(id),
  token           text unique not null default encode(gen_random_bytes(32), 'hex'),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','expired','cancelled')),
  invited_by      uuid references app_users(id),
  permission_overrides jsonb,  -- optional custom permissions at invite time
  expires_at      timestamptz default (now() + interval '7 days'),
  accepted_at     timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_invitations_email  on invitations(email);
create index if not exists idx_invitations_token  on invitations(token);
create index if not exists idx_invitations_status on invitations(status);

-- ═══════════════════════════════════════════════════════════
-- 9. RLS POLICIES FOR NEW TABLES
-- ═══════════════════════════════════════════════════════════
alter table company_settings         enable row level security;
alter table payment_methods          enable row level security;
alter table roles                    enable row level security;
alter table permissions              enable row level security;
alter table role_permissions         enable row level security;
alter table app_users                enable row level security;
alter table user_permission_overrides enable row level security;
alter table invitations              enable row level security;

-- Open read for authenticated users (settings and roles are not sensitive to read)
create policy "read_company_settings"  on company_settings   for select using (true);
create policy "read_payment_methods"   on payment_methods    for select using (true);
create policy "read_roles"             on roles              for select using (true);
create policy "read_permissions"       on permissions        for select using (true);
create policy "read_role_permissions"  on role_permissions   for select using (true);

-- Write restricted to admin via service role (Edge Functions use service role)
create policy "admin_write_company"    on company_settings   for all using (true) with check (true);
create policy "admin_write_pm"         on payment_methods    for all using (true) with check (true);
create policy "admin_write_roles"      on roles              for all using (true) with check (true);

-- App users — users can read their own record
create policy "read_own_app_user"  on app_users for select using (auth_user_id = auth.uid());
create policy "admin_manage_users" on app_users for all using (true) with check (true);

-- Invitations
create policy "admin_manage_invitations" on invitations for all using (true) with check (true);

-- Permission overrides
create policy "admin_manage_overrides" on user_permission_overrides for all using (true) with check (true);
```

---

## SECTION 9: ROLE AND PERMISSION MODEL

### Permission Matrix

| Permission | Super Admin | Admin | Finance | Project Mgr | Staff | Client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| clients.view | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| clients.create | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| clients.edit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| clients.archive | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| projects.view | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| projects.create | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| projects.edit | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| invoices.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| invoices.create | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| invoices.edit | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| invoices.send | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| invoices.download_pdf | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| payments.view | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| payments.create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| payments.confirm | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| reports.view | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| services.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| settings.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| users.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| roles.manage | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Permission Resolution Logic
```typescript
async function resolvePermissions(authUserId: string): Promise<Set<string>> {
  const supabase = createServerClient(/* ... */);

  // 1. Get user's role
  const { data: appUser } = await supabase
    .from('app_users')
    .select('id, role')
    .eq('auth_user_id', authUserId)
    .single();

  if (!appUser) return new Set(); // No access

  // 2. Get role's default permissions
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', appUser.role);

  const perms = new Set(rolePerms?.map(p => p.permission_id) ?? []);

  // 3. Apply user-specific overrides
  const { data: overrides } = await supabase
    .from('user_permission_overrides')
    .select('permission_id, granted')
    .eq('app_user_id', appUser.id);

  for (const override of overrides ?? []) {
    if (override.granted) perms.add(override.permission_id);
    else perms.delete(override.permission_id);
  }

  return perms;
}
```

---

## SECTION 10: FRONTEND PAGE MAP

### New Pages Required

#### Admin Settings
| Path | Component | Access |
|---|---|---|
| `/admin/settings/company` | `CompanySettingsPage` | Admin+ |
| `/admin/settings/payment-methods` | `PaymentMethodsPage` | Admin+ |
| `/admin/settings/invoice` | `InvoiceSettingsPage` | Admin+ |
| `/admin/settings/branding` | `BrandingSettingsPage` | Admin+ |

#### User Management
| Path | Component | Access |
|---|---|---|
| `/admin/users` | `UsersListPage` | Admin+ |
| `/admin/users/[id]` | `UserDetailPage` | Admin+ |
| `/admin/users/roles` | `RolesPage` | Super Admin |
| `/admin/users/permissions` | `PermissionMatrixPage` | Super Admin |
| `/admin/users/invitations` | `InvitationsPage` | Admin+ |

#### Auth
| Path | Component | Access |
|---|---|---|
| `/login` | `LoginPage` | Public |
| `/auth/callback` | `AuthCallbackRoute` | Public (server) |
| `/auth/accept-invite` | `AcceptInvitePage` | Public (token-gated) |

### Sidebar Navigation Update
Add "Admin" section to sidebar (visible only to admin roles):
```
Admin
├── Settings
│   ├── Company Profile
│   ├── Payment Methods
│   ├── Invoice Settings
│   └── Branding
└── Users
    ├── All Users
    ├── Roles
    └── Invitations
```

---

## SECTION 11: API / BACKEND LOGIC

### Edge Functions Required

#### `POST /api/admin/invite-user`
```typescript
// Input: { email, role, permissions? }
// 1. Verify caller is admin (check session + app_users role)
// 2. Insert into invitations table
// 3. Call supabase.auth.admin.inviteUserByEmail(email, { redirectTo })
// 4. Return invitation record
```

#### `POST /api/admin/accept-invite`
```typescript
// Input: { token }
// 1. Validate token in invitations table
// 2. Check expiry
// 3. Get current session user email
// 4. Match email to invitation
// 5. Create app_users record
// 6. Apply permission_overrides if any
// 7. Mark invitation as accepted
```

#### `GET /api/admin/my-permissions`
```typescript
// 1. Get session
// 2. Call resolvePermissions(session.user.id)
// 3. Return array of permission IDs
// Cache in session/cookie for 15 minutes
```

#### `PUT /api/admin/company-settings`
```typescript
// Input: company settings object
// 1. Verify admin role
// 2. Upsert to company_settings (id = 1)
// 3. If logo file: upload to Supabase Storage, save URL
```

#### `GET /api/pdf/invoice/[id]` (already exists — update to read from DB)
- Load `company_settings` from DB (fallback to defaults)
- Load `payment_methods` from DB (fallback to hardcoded)
- Render dynamic invoice HTML

### Settings Loading Hook
```typescript
// src/hooks/useCompanySettings.ts
export function useCompanySettings() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

---

## SECTION 12: RLS AND SECURITY MODEL

### Principle
- All tables have RLS enabled
- Service role key (server-side only) bypasses RLS for admin operations
- Anon key (client-side) subject to all RLS policies
- Admin routes protected by middleware (server-side check)
- Client-side UI hides elements based on resolved permissions

### Critical Security Rules
1. **`company_settings`** — Anyone can read (needed for invoice rendering), only admin can write (enforced server-side via role check before DB write)
2. **`payment_methods`** — Same as company_settings
3. **`app_users`** — Users can only read their own row; admin can read all (use service role in admin pages)
4. **`invitations`** — Admin only; token validated server-side
5. **Invoice PDFs** — No auth check currently (by design for shared links); add `?token=` signing in Phase 3

### Audit Logging
Extend existing `audit_log` table to capture:
```sql
-- Events to log:
-- settings.company.updated
-- settings.payment_method.created / updated / deleted
-- users.invited / activated / deactivated / role_changed
-- permissions.override_set
-- auth.login / logout
```

---

## SECTION 13: IMPLEMENTATION ROADMAP

### Phase 2A — Invoice & PDF Enhancements (DONE ✅)
- ✅ Logo SVG in PDF
- ✅ TIN in PDF header
- ✅ Payment instructions block in PDF
- ✅ Download PDF button (auto-print flow)
- ✅ Payment instructions card on invoice detail UI

### Phase 2B — Admin Settings & Payment Methods (~3 days)
**Scope:**
1. Run `003_admin_user_management.sql` migration
2. Build `/admin/settings/company` page with form + logo upload
3. Build `/admin/settings/payment-methods` with CRUD cards
4. Update PDF route to read from DB (with fallback)
5. Update invoice detail sidebar to read from DB

**Dependencies:** Migration must run first
**Risk:** Supabase Storage bucket setup for logo uploads

### Phase 2C — User Management (~2 days)
**Scope:**
1. Build `/admin/users` list page
2. Build invite user modal with email + role
3. Build user detail page with permissions grid
4. Build `/admin/users/invitations` history

**Dependencies:** Phase 2B (app_users, invitations tables)
**Risk:** Email delivery for invitations (Supabase transactional email setup)

### Phase 2D — Roles & Permissions UI (~2 days)
**Scope:**
1. Build `/admin/users/roles` role definitions page
2. Build permission matrix view
3. Wire permission checks into existing pages (hide buttons, block routes)
4. Middleware route protection

**Dependencies:** Phase 2C
**Risk:** Permission check performance (cache resolved permissions)

### Phase 2E — Authentication (~2 days)
**Scope:**
1. Build `/login` page with email + Google + Apple buttons
2. Build `/auth/callback` server route
3. Build `/auth/accept-invite` page
4. Add middleware for route protection
5. Enable Google + Apple in Supabase Dashboard

**Dependencies:** Phase 2D (roles exist before auth routes use them)
**Risk:** Apple OAuth requires Apple Developer account ($99/yr); Google OAuth requires verified domain

---

## SECTION 14: ACCEPTANCE CRITERIA

### Invoice Enhancements
- [ ] Invoice PDF shows company logo, name, TIN, address
- [ ] Invoice PDF shows payment instructions section with all 3 methods
- [ ] "Download PDF" button triggers print dialog in new tab
- [ ] Invoice detail sidebar shows payment instructions card
- [ ] Balance due amount highlighted in amber (unpaid) or green (paid)

### Admin Settings
- [ ] Admin can update company name, TIN, email, address
- [ ] Admin can upload and change company logo
- [ ] Updated logo appears on new invoices immediately
- [ ] Admin can add/edit/delete payment methods
- [ ] Payment methods on invoice reflect DB data, not hardcoded values
- [ ] Inactive payment methods are hidden from invoice PDF

### User Management
- [ ] Admin can view all users with status and role
- [ ] Admin can invite user by email and assign role
- [ ] Invited user receives email with working invite link
- [ ] Accepted user can log in and sees correct modules
- [ ] Admin can change user role
- [ ] Admin can deactivate user (user can no longer log in)

### Authentication
- [ ] User can log in with email + password
- [ ] User can log in with Google
- [ ] User can log in with Apple
- [ ] Unauthenticated user redirected to /login
- [ ] Non-admin user cannot access /admin/* routes
- [ ] Session persists across page refreshes

### Roles & Permissions
- [ ] Finance user cannot access Users or Settings
- [ ] Staff user cannot create invoices
- [ ] Client user can only view invoices assigned to them
- [ ] Super Admin has no restrictions
- [ ] Per-user overrides correctly grant or revoke specific permissions

---

## SECTION 15: FINAL BUILD OUTPUTS

### Table Inventory
| Table | Purpose | Phase |
|---|---|---|
| `clients` | Client records | ✅ Exists |
| `projects` | Project records | ✅ Exists |
| `services` | Services catalog | ✅ Exists |
| `invoices` | Invoice records | ✅ Exists |
| `invoice_items` | Line items | ✅ Exists |
| `invoice_schedules` | Installment plans | ✅ Exists |
| `payments` | Payment records | ✅ Exists |
| `audit_log` | Audit trail | ✅ Exists |
| `company_settings` | Company identity & config | 2B |
| `payment_methods` | Managed payment methods | 2B |
| `roles` | Role definitions | 2C |
| `permissions` | Permission definitions | 2C |
| `role_permissions` | Role → Permission mapping | 2C |
| `app_users` | Internal user records | 2C |
| `user_permission_overrides` | Per-user permission overrides | 2D |
| `invitations` | User invitation records | 2C |

### Page Inventory
| Page | Route | Phase |
|---|---|---|
| Dashboard | `/` | ✅ |
| Clients List | `/clients` | ✅ |
| Client Detail | `/clients/[id]` | ✅ |
| Projects List | `/projects` | ✅ |
| Project Detail | `/projects/[id]` | ✅ |
| Services | `/services` | ✅ |
| Invoices List | `/invoices` | ✅ |
| Invoice Detail | `/invoices/[id]` | ✅ (enhanced) |
| New Invoice | `/invoices/new` | ✅ |
| Payments | `/payments` | ✅ |
| Reports | `/reports` | ✅ |
| Invoice PDF | `/api/pdf/invoice/[id]` | ✅ (enhanced) |
| Login | `/login` | 2E |
| Auth Callback | `/auth/callback` | 2E |
| Accept Invite | `/auth/accept-invite` | 2E |
| Company Settings | `/admin/settings/company` | 2B |
| Payment Methods | `/admin/settings/payment-methods` | 2B |
| Invoice Settings | `/admin/settings/invoice` | 2B |
| Branding | `/admin/settings/branding` | 2B |
| Users List | `/admin/users` | 2C |
| User Detail | `/admin/users/[id]` | 2C |
| Roles | `/admin/users/roles` | 2D |
| Permissions Matrix | `/admin/users/permissions` | 2D |
| Invitations | `/admin/users/invitations` | 2C |

### Implementation Checklist

#### Phase 2A (Complete)
- [x] Logo SVG created at `public/logo.svg`
- [x] PDF route updated with logo, TIN, payment instructions, auto-print
- [x] Invoice detail page updated with Download PDF, Preview, payment instructions card
- [x] RLS fix applied (`002_fix_rls_open_policies.sql`)

#### Phase 2B (Next)
- [ ] Run `003_admin_user_management.sql` in Supabase
- [ ] Seed `company_settings` row
- [ ] Seed `payment_methods` rows
- [ ] Build `CompanySettingsPage`
- [ ] Build `PaymentMethodsPage`
- [ ] Setup Supabase Storage bucket `logos` (public)
- [ ] Update PDF route to read from `company_settings` + `payment_methods`

#### Phase 2C
- [ ] Build UsersListPage
- [ ] Build InviteUserModal
- [ ] Build UserDetailPage
- [ ] Build InvitationsPage
- [ ] Wire invite API

#### Phase 2D
- [ ] Build RolesPage
- [ ] Build PermissionMatrixPage
- [ ] Add `usePermissions()` hook
- [ ] Apply permission guards to existing pages

#### Phase 2E
- [ ] Enable Google OAuth in Supabase
- [ ] Enable Apple OAuth in Supabase
- [ ] Build `/login` page
- [ ] Build `/auth/callback` route
- [ ] Build `/auth/accept-invite` page
- [ ] Add `src/middleware.ts`
- [ ] Test full invite → login → access flow

---

*This document is the authoritative implementation reference for Sabtech Online Phase 2. Keep it updated as features are built.*
