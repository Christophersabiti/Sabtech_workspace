-- Fix RLS: Allow anon role for all tables (internal tool, no auth flow)
-- Drop existing restrictive policies
drop policy if exists "auth_clients_select"    on clients;
drop policy if exists "auth_clients_insert"    on clients;
drop policy if exists "auth_clients_update"    on clients;
drop policy if exists "auth_services_all"      on services;
drop policy if exists "auth_projects_all"      on projects;
drop policy if exists "auth_invoices_all"      on invoices;
drop policy if exists "auth_items_all"         on invoice_items;
drop policy if exists "auth_payments_all"      on payments;
drop policy if exists "auth_schedules_all"     on invoice_schedules;
drop policy if exists "auth_audit_select"      on audit_log;
drop policy if exists "auth_audit_insert"      on audit_log;

-- Create open policies (anon + authenticated)
create policy "open_clients_all"        on clients          for all using (true) with check (true);
create policy "open_services_all"       on services         for all using (true) with check (true);
create policy "open_projects_all"       on projects         for all using (true) with check (true);
create policy "open_invoices_all"       on invoices         for all using (true) with check (true);
create policy "open_items_all"          on invoice_items    for all using (true) with check (true);
create policy "open_payments_all"       on payments         for all using (true) with check (true);
create policy "open_schedules_all"      on invoice_schedules for all using (true) with check (true);
create policy "open_audit_all"          on audit_log        for all using (true) with check (true);
