-- Sabtech Online Invoicing Module - Initial Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- DROP EXISTING OBJECTS (safe clean slate)
-- ─────────────────────────────────────────
do $$ begin
  -- Drop triggers only if their tables exist
  if exists (select 1 from information_schema.tables where table_name = 'invoice_items') then
    drop trigger if exists trg_item_after_change on invoice_items;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'payments') then
    drop trigger if exists trg_payment_after_change on payments;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'invoices') then
    drop trigger if exists trg_invoices_updated_at on invoices;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'projects') then
    drop trigger if exists trg_projects_updated_at on projects;
  end if;
  if exists (select 1 from information_schema.tables where table_name = 'clients') then
    drop trigger if exists trg_clients_updated_at on clients;
  end if;
end $$;

drop function if exists trg_item_recalculate() cascade;
drop function if exists trg_payment_recalculate() cascade;
drop function if exists recalculate_invoice_totals(uuid) cascade;
drop function if exists update_updated_at() cascade;

drop table if exists audit_log cascade;
drop table if exists payments cascade;
drop table if exists invoice_items cascade;
drop table if exists invoices cascade;
drop table if exists invoice_schedules cascade;
drop table if exists services cascade;
drop table if exists projects cascade;
drop table if exists clients cascade;

drop sequence if exists invoice_number_seq;
drop sequence if exists payment_number_seq;

-- ─────────────────────────────────────────
-- 1. CLIENTS
-- ─────────────────────────────────────────
create table clients (
  id uuid primary key default uuid_generate_v4(),
  client_code text unique not null,
  name text not null,
  company_name text,
  contact_person text,
  email text,
  phone text,
  address text,
  tin_number text,
  currency text not null default 'UGX',
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 2. SERVICES CATALOG
-- ─────────────────────────────────────────
create table services (
  id uuid primary key default uuid_generate_v4(),
  service_code text unique not null,
  service_name text not null,
  category text,
  default_price numeric(15,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed default services
insert into services (service_code, service_name, category, default_price) values
  ('WD',   'Website Design',                     'Web & Tech',   0),
  ('WDV',  'Website Development',                'Web & Tech',   0),
  ('LP',   'Landing Page Design',                'Web & Tech',   0),
  ('LGD',  'Logo Design',                        'Design',       0),
  ('BKD',  'Brand Kit Design',                   'Design',       0),
  ('SMG',  'Social Media Graphics',              'Design',       0),
  ('DA',   'Data Analysis',                      'Analytics',    0),
  ('DBD',  'Dashboard Development',              'Analytics',    0),
  ('ETR',  'Excel Training',                     'Training',     0),
  ('PBTR', 'Power BI Training',                  'Training',     0),
  ('CSN',  'Coaching Session',                   'Coaching',     0),
  ('PMC',  'Product Management Consultation',    'Consultancy',  0),
  ('TPL',  'Template Purchase',                  'Products',     0),
  ('CVD',  'CV / Portfolio Design',              'Design',       0),
  ('GEN',  'General Consultancy',                'Consultancy',  0);

-- ─────────────────────────────────────────
-- 3. PROJECTS
-- ─────────────────────────────────────────
create table projects (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid not null references clients(id) on delete restrict,
  project_code text unique not null,
  project_name text not null,
  description text,
  total_contract_amount numeric(15,2),
  billing_type text not null default 'single_invoice'
    check (billing_type in ('single_invoice', 'installment', 'milestone', 'recurring')),
  project_manager text,
  status text not null default 'active'
    check (status in ('active', 'on_hold', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 4. INVOICE SCHEDULES (Installment Plans)
-- ─────────────────────────────────────────
create table invoice_schedules (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references projects(id) on delete cascade,
  schedule_name text not null,
  description text,
  percentage numeric(5,2),
  fixed_amount numeric(15,2),
  due_date date,
  sort_order int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'invoiced', 'paid')),
  generated_invoice_id uuid,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 5. INVOICES
-- ─────────────────────────────────────────
create sequence invoice_number_seq start 1;

create table invoices (
  id uuid primary key default uuid_generate_v4(),
  invoice_number text unique not null,
  client_id uuid not null references clients(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  schedule_id uuid references invoice_schedules(id) on delete set null,
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'UGX',
  subtotal numeric(15,2) not null default 0,
  discount_amount numeric(15,2) not null default 0,
  tax_amount numeric(15,2) not null default 0,
  total_amount numeric(15,2) not null default 0,
  total_paid numeric(15,2) not null default 0,
  balance_due numeric(15,2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  notes text,
  footer_note text,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 6. INVOICE ITEMS
-- ─────────────────────────────────────────
create table invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  item_name text not null,
  description text,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(15,2) not null default 0,
  discount_percent numeric(5,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  line_total numeric(15,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 7. PAYMENTS
-- ─────────────────────────────────────────
create sequence payment_number_seq start 1;

create table payments (
  id uuid primary key default uuid_generate_v4(),
  payment_number text unique not null,
  invoice_id uuid not null references invoices(id) on delete restrict,
  payment_date date not null default current_date,
  amount_paid numeric(15,2) not null,
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer', 'mobile_money', 'cash', 'cheque', 'online', 'other')),
  reference_number text,
  note text,
  is_confirmed boolean not null default true,
  receipt_url text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- 8. AUDIT LOG
-- ─────────────────────────────────────────
create table audit_log (
  id uuid primary key default uuid_generate_v4(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  performed_by text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────
-- FUNCTIONS & TRIGGERS
-- ─────────────────────────────────────────

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function update_updated_at();

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function update_updated_at();

-- Auto-recalculate invoice totals and status after every payment change
create or replace function recalculate_invoice_totals(p_invoice_id uuid)
returns void language plpgsql as $$
declare
  v_subtotal  numeric(15,2);
  v_tax       numeric(15,2);
  v_discount  numeric(15,2);
  v_total     numeric(15,2);
  v_paid      numeric(15,2);
  v_balance   numeric(15,2);
  v_status    text;
  v_due_date  date;
  v_cur_status text;
begin
  select
    coalesce(sum(quantity * unit_price * (1 - discount_percent/100)), 0),
    coalesce(sum(quantity * unit_price * (tax_percent/100)), 0)
  into v_subtotal, v_tax
  from invoice_items
  where invoice_id = p_invoice_id;

  select discount_amount, due_date, status
  into v_discount, v_due_date, v_cur_status
  from invoices where id = p_invoice_id;

  v_total   := v_subtotal - coalesce(v_discount, 0) + v_tax;

  select coalesce(sum(amount_paid), 0)
  into v_paid
  from payments
  where invoice_id = p_invoice_id and is_confirmed = true;

  v_balance := v_total - v_paid;

  -- Determine status (don't override draft or cancelled)
  if v_cur_status in ('draft', 'cancelled') then
    v_status := v_cur_status;
  elsif v_balance <= 0 then
    v_status := 'paid';
  elsif v_paid > 0 then
    v_status := 'partially_paid';
  elsif v_due_date is not null and v_due_date < current_date then
    v_status := 'overdue';
  else
    v_status := 'sent';
  end if;

  update invoices set
    subtotal     = v_subtotal,
    tax_amount   = v_tax,
    total_amount = v_total,
    total_paid   = v_paid,
    balance_due  = v_balance,
    status       = v_status
  where id = p_invoice_id;
end;
$$;

create or replace function trg_payment_recalculate()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    perform recalculate_invoice_totals(OLD.invoice_id);
  else
    perform recalculate_invoice_totals(NEW.invoice_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_payment_after_change
  after insert or update or delete on payments
  for each row execute function trg_payment_recalculate();

create or replace function trg_item_recalculate()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'DELETE' then
    perform recalculate_invoice_totals(OLD.invoice_id);
  else
    perform recalculate_invoice_totals(NEW.invoice_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger trg_item_after_change
  after insert or update or delete on invoice_items
  for each row execute function trg_item_recalculate();

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index idx_projects_client_id   on projects(client_id);
create index idx_invoices_client_id   on invoices(client_id);
create index idx_invoices_project_id  on invoices(project_id);
create index idx_invoices_status      on invoices(status);
create index idx_invoices_due_date    on invoices(due_date);
create index idx_invoice_items_inv    on invoice_items(invoice_id);
create index idx_payments_invoice_id  on payments(invoice_id);
create index idx_audit_log_entity     on audit_log(entity_type, entity_id);

-- ─────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────
alter table clients          enable row level security;
alter table projects         enable row level security;
alter table services         enable row level security;
alter table invoices         enable row level security;
alter table invoice_items    enable row level security;
alter table payments         enable row level security;
alter table invoice_schedules enable row level security;
alter table audit_log        enable row level security;

-- Open policies for authenticated users (tighten per role later)
create policy "auth_clients_select"   on clients          for select using (auth.role() = 'authenticated');
create policy "auth_clients_insert"   on clients          for insert with check (auth.role() = 'authenticated');
create policy "auth_clients_update"   on clients          for update using (auth.role() = 'authenticated');

create policy "auth_services_all"     on services         for all using (auth.role() = 'authenticated');
create policy "auth_projects_all"     on projects         for all using (auth.role() = 'authenticated');
create policy "auth_invoices_all"     on invoices         for all using (auth.role() = 'authenticated');
create policy "auth_items_all"        on invoice_items    for all using (auth.role() = 'authenticated');
create policy "auth_payments_all"     on payments         for all using (auth.role() = 'authenticated');
create policy "auth_schedules_all"    on invoice_schedules for all using (auth.role() = 'authenticated');
create policy "auth_audit_select"     on audit_log        for select using (auth.role() = 'authenticated');
create policy "auth_audit_insert"     on audit_log        for insert with check (auth.role() = 'authenticated');
