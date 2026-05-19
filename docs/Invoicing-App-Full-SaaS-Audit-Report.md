# Invoicing App Full SaaS Audit Report

## 1. Executive Summary

The app is a strong single-company invoicing/admin prototype, but it is not ready for commercial multi-tenant SaaS launch.

The biggest blocker is tenant isolation. Core tables such as `clients`, `projects`, `invoices`, `payments`, `quotations`, `project_tasks`, settings, users, and storage do not have `company_id` / `tenant_id`. Current RLS mostly allows any authenticated user to access all rows, which is acceptable for an internal single-company app but unsafe for SaaS.

Recommendation: refactor the current app, redesign the database for tenancy, and move critical mutations behind server-side authorization before launch.

## 2. Current System Strengths

- Good functional coverage: clients, projects, tasks, quotations, invoices, payments, reports, settings, users.
- Supabase Auth is already integrated.
- Admin invitation flow exists.
- Basic roles and permissions tables exist.
- Invoice/payment recalculation logic exists in SQL triggers.
- PDF/print routes exist for invoices, quotations, and statements.
- UI is already structured around a SaaS dashboard layout.
- Settings, branding, payment methods, and invoice options exist.
- Task bulk upload improves operational usability.
- TypeScript is in use.

## 3. Critical Risks

| Area | Issue | Risk Level | Business Impact | Technical Impact | Recommended Fix | Priority | Estimated Effort |
|---|---|---:|---|---|---|---:|---:|
| Multi-tenancy | No `company_id` / `tenant_id` on core business tables | Critical | One company can access another company data | No enforceable tenant boundary | Add `companies`, `company_users`, and `company_id` to all tenant-owned tables | P0 | 2-4 weeks |
| RLS | Policies allow all authenticated users to all rows | Critical | Cross-tenant leakage | RLS does not scope by company | Replace with tenant-scoped RLS using membership checks | P0 | 1-2 weeks |
| API security | PDF routes use service role after only session check | Critical | Any logged-in user may access any invoice/statement by ID | Service role bypasses RLS | Add tenant + permission checks before service-role reads | P0 | 3-5 days |
| User model | `app_users` has one global role, no company membership | Critical | Cannot support multiple companies per user | Role is not tenant-scoped | Replace/extend with `company_users` role per company | P0 | 1 week |
| Settings | `company_settings` is single row `id = 1` | Critical | Every tenant shares branding/payment settings | No company-specific settings | Make settings keyed by `company_id` | P0 | 3-5 days |
| Storage | Shared public `company-assets` bucket without tenant path enforcement | Critical | Logo/assets can be overwritten or viewed across tenants | No tenant-scoped storage policy | Use `company-assets/{company_id}/...` and scoped policies | P0 | 2-3 days |

## 4. High Risks

| Area | Issue | Risk Level | Business Impact | Technical Impact | Recommended Fix | Priority | Estimated Effort |
|---|---|---:|---|---|---|---:|---:|
| Auth | No self-serve company registration/onboarding | High | Cannot sell as SaaS without manual setup | Signup flow incomplete | Add register -> create company -> owner membership flow | P1 | 1-2 weeks |
| Authorization | UI hides admin routes, but backend/RLS does not fully enforce module permissions | High | Users can bypass UI with direct requests | Frontend becomes security boundary | Enforce permissions in RLS/functions/API routes | P1 | 1-2 weeks |
| Client direct writes | Browser writes directly to Supabase tables | High | Harder to validate and audit | Business rules scattered in UI | Use Server Actions/API/RPC for critical mutations | P1 | 2-3 weeks |
| Invoice numbering | Global invoice/payment sequences | High | Tenant invoice numbers collide semantically | No per-company numbering | Add tenant-scoped numbering table or function | P1 | 3-5 days |
| Audit logs | Audit logs are partial and not tenant-scoped | High | Weak forensic trail for paid businesses | Cannot prove who changed what per tenant | Central tenant-scoped audit event system | P1 | 1 week |
| Input validation | Limited server-side validation | High | Bad invoices/payments can enter DB | Data integrity depends on UI | Add Zod schemas server-side and DB constraints | P1 | 1-2 weeks |
| Hardcoded brand | Sabtech values exist in fallbacks/config | High | Not white-label/commercial ready | Tenant branding not dynamic everywhere | Remove hardcoded production business details | P1 | 2-4 days |
| PWA/offline cache | Dexie and Workbox cache are not tenant namespaced | High | Shared-browser/company switching leakage | Offline data can persist across tenants | Namespace local DB/cache by user + company | P1 | 3-5 days |

## 5. Medium Risks

| Area | Issue | Risk Level | Business Impact | Technical Impact | Recommended Fix | Priority | Estimated Effort |
|---|---|---:|---|---|---|---:|---:|
| Workflow | No formal approval states for quotations/invoices | Medium | Weak controls for finance teams | Status transitions are loose | Add workflow events and allowed transitions | P2 | 1 week |
| Tasks | Tasks lack priority, billable flag, estimates, user assignment FK | Medium | Project/task module is light | Assignment is free text | Add richer task schema | P2 | 3-5 days |
| Reports | Reporting is operational but not SaaS-grade | Medium | Less value for paying users | Limited filters/exports | Add tenant dashboards, exports, aging reports | P2 | 1-2 weeks |
| Error handling | Many pages use alerts or silent failures | Medium | Poor trust in production | Hard to debug user issues | Add standard toast/error boundary/logging | P2 | 1 week |
| Lint/build | Repo-wide lint currently fails on existing React rules | Medium | CI will fail or be skipped | Quality gate not clean | Fix lint backlog and add CI | P2 | 2-4 days |
| Tests | No clear automated test suite | Medium | Regression risk | Manual-only verification | Add unit, integration, and RLS tests | P2 | 1-2 weeks |

## 6. Low Risks

| Area | Issue | Risk Level | Business Impact | Technical Impact | Recommended Fix | Priority | Estimated Effort |
|---|---|---:|---|---|---|---:|---:|
| UI polish | Some mojibake/encoding artifacts appear in files | Low | Unprofessional text risk | Display inconsistencies | Normalize file encoding to UTF-8 | P3 | 1 day |
| Navigation | Role-based nav is basic | Low | Usability gap | No workspace switcher | Add workspace switcher and permission-aware nav | P3 | 2-3 days |
| Exports | Limited CSV/PDF export surface | Low | Less operational flexibility | Repeated export logic likely | Add standard export service | P3 | 3-5 days |

## 7. Multi-Tenant SaaS Architecture Recommendation

Use shared database, shared schema, tenant-scoped rows with `company_id`.

Why:

- Best balance for this app current size.
- Lowest hosting cost.
- Works well with Supabase RLS.
- Easier to maintain than schema-per-tenant.
- Easier reporting and billing across tenants.
- Can scale later with partitioning or enterprise dedicated databases.

Avoid for now:

- Separate schema per company: more migration complexity.
- Separate database per company: costly and operationally heavy unless selling enterprise isolation.

Core model:

- `companies`
- `company_users`
- Every business table has `company_id`
- RLS checks current authenticated user belongs to that `company_id`
- Permissions are scoped by company membership, not global user role.

## 8. Recommended Database Structure

| Table | Purpose | Key Columns |
|---|---|---|
| `companies` | Tenant/workspace | `id`, `name`, `slug`, `status`, `owner_user_id`, `created_at`, `updated_at` |
| `company_users` | User-company membership | `id`, `company_id`, `auth_user_id`, `app_user_id`, `role_id`, `status`, `invited_by`, `joined_at` |
| `roles` | System/custom roles | `id`, `company_id nullable`, `name`, `is_system` |
| `permissions` | Permission catalog | `id`, `module`, `action` |
| `role_permissions` | Role grants | `role_id`, `permission_id` |
| `clients` | Tenant clients | `company_id`, client fields, `created_by`, `updated_by`, `deleted_at` |
| `projects` | Client projects | `company_id`, `client_id`, project fields |
| `project_tasks` | Tasks | `company_id`, `project_id`, `assigned_to_user_id`, `priority`, `billable`, `status` |
| `quotations` | Sales quotes | `company_id`, `client_id`, `project_id`, `status`, totals |
| `quotation_items` | Quote lines | `company_id`, `quotation_id`, item fields |
| `invoices` | Billing records | `company_id`, `client_id`, `project_id`, `quotation_id`, `invoice_number`, totals |
| `invoice_items` | Invoice lines | `company_id`, `invoice_id`, item fields |
| `payments` | Payment records | `company_id`, `invoice_id`, amount, method, status |
| `expenses` | Optional project/company costs | `company_id`, `project_id`, category, amount |
| `taxes` | Tenant tax rules | `company_id`, `name`, `rate`, `is_default` |
| `currencies` | Supported currencies | `code`, `symbol`, `precision` |
| `company_settings` | Tenant settings | `company_id`, invoice defaults, locale, tax settings |
| `invoice_settings` | Numbering/terms | `company_id`, prefixes, next numbers, due days |
| `payment_methods` | Tenant payment methods | `company_id`, method details |
| `audit_logs` | Immutable activity | `company_id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `metadata` |
| `notifications` | User notifications | `company_id`, `user_id`, type, read state |
| `subscription_plans` | SaaS plans | `id`, limits, price |
| `subscriptions` | Tenant subscription | `company_id`, `plan_id`, status, trial dates |
| `billing_records` | SaaS billing | `company_id`, provider IDs, invoices, events |

Important constraints:

- Unique invoice number per company: `unique(company_id, invoice_number)`.
- Unique client code per company: `unique(company_id, client_code)`.
- Add indexes on `(company_id, status)`, `(company_id, created_at)`, `(company_id, client_id)`.
- Add `created_by`, `updated_by`, `deleted_at` to business tables.
- Use soft delete for customer-facing records.

## 9. Security Improvement Plan

1. Add `company_id` to all tenant-owned tables.
2. Backfill existing data into one default company.
3. Create `company_users` and migrate `app_users.role` into memberships.
4. Replace all broad RLS policies with tenant-scoped policies.
5. Move critical writes to server-side functions/routes.
6. Validate every mutation with Zod and DB constraints.
7. Add API authorization helper: `requireCompanyPermission(companyId, permission)`.
8. Secure PDF routes by checking entity belongs to active company membership.
9. Scope storage paths to `company_id`.
10. Remove hardcoded company fallbacks from documents.
11. Add audit logging for create/update/delete/status transitions.
12. Add rate limiting for auth, invites, PDFs, exports.
13. Add monitoring with Sentry or a similar tool.
14. Add DB backup/restore policy.
15. Add RLS regression tests.

## 10. UI/UX Improvement Plan

| Screen | Recommendation |
|---|---|
| Login | Add create company / trial signup path if commercial SaaS |
| Registration | Add owner account + company creation + email verification |
| Company onboarding | Guided setup: company profile, invoice prefix, payment method, logo |
| Dashboard | Add workspace switcher, plan status, aging receivables, recent activity |
| Sidebar | Permission-aware navigation and company switcher |
| Clients | Add bulk import/export, tags, contact persons, credit terms |
| Projects | Add team assignment, project health, billable/non-billable summary |
| Tasks | Add priority, assignee FK, billable flag, bulk edit, filters |
| Quotations | Add approval/send/client acceptance workflow |
| Invoices | Add approval/send/reminder/recurring invoice flow |
| Payments | Add reconciliation, receipts, reversal approval |
| Reports | Add aging, revenue by client/project, tax report, export center |
| Settings | Split company, billing, users, roles, security, integrations |
| User management | Tenant-scoped roles, invitations, suspended users |
| Mobile | Keep dashboard dense but ensure tables degrade into action cards |
| Empty states | Add action-specific empty states with import/create options |
| Errors | Standard toast + inline field errors, no raw DB messages |

## 11. Role and Permission Matrix

| Permission | Super Admin | Owner | Admin | Manager | Accountant | Project Manager | Staff | Viewer/Client |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Platform admin | Yes | No | No | No | No | No | No | No |
| Company settings | Yes | Yes | Yes | No | No | No | No | No |
| Subscription billing | Yes | Yes | Yes | No | No | No | No | No |
| User management | Yes | Yes | Yes | No | No | No | No | No |
| Roles/permissions | Yes | Yes | Limited | No | No | No | No | No |
| Clients view | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Own only |
| Clients create/edit | Yes | Yes | Yes | Yes | Limited | Yes | No | No |
| Projects manage | Yes | Yes | Yes | Yes | No | Yes | Limited | No |
| Tasks manage | Yes | Yes | Yes | Yes | No | Yes | Assigned | No |
| Quotations create | Yes | Yes | Yes | Yes | Yes | Yes | No | No |
| Quotations approve | Yes | Yes | Yes | Yes | Limited | No | No | Client accept/reject |
| Invoices create | Yes | Yes | Yes | No | Yes | Limited | No | No |
| Invoices approve/send | Yes | Yes | Yes | No | Yes | No | No | No |
| Payments record | Yes | Yes | Yes | No | Yes | No | No | No |
| Reports | Yes | Yes | Yes | Yes | Yes | Limited | No | Own only |
| Audit logs | Yes | Yes | Yes | No | Limited | No | No | No |

## 12. Product Feature Gaps

- Self-serve signup and company creation.
- Workspace/company switcher.
- Tenant-scoped users and roles.
- Subscription plans and billing.
- Free trial and usage limits.
- Plan enforcement.
- Customer support/contact flow.
- Terms/privacy pages.
- Email notifications and reminders.
- Invoice delivery tracking.
- Client portal.
- Tax configuration.
- Recurring invoices.
- Expense tracking.
- Data export per tenant.
- Backup/restore flow.
- Admin analytics.
- Tenant suspension.
- Webhook/event log.
- Production monitoring.

## 13. Commercialization Roadmap

### Phase 1: Critical Foundation

Status: implemented in the current Phase 1 branch/worktree.

- Feature expansion frozen for foundational SaaS/security work.
- Added `companies` and `company_users`.
- Backfilled existing records to the default Sabtech Online company.
- Added `company_id` to tenant-owned business tables.
- Replaced broad authenticated RLS with tenant membership/admin policies.
- Secured PDF/API document routes with tenant entity access checks.
- Scoped invite acceptance and admin invite creation to company membership.

### Phase 2: Multi-Tenant Upgrade

Status: foundation implemented; live sign-in verification still required.

- Added company workspace onboarding and creation UI.
- Added server-side workspace creation endpoint.
- Added active company switcher.
- Added dashboard workspace guard for users without a company.
- Migrated settings, payment methods, logo storage paths, PDF branding, and numbering to tenant scope.
- Updated major create flows to write the selected `company_id` explicitly.

### Phase 3: Security and Access Control

- Implement permission service.
- Move critical mutations server-side.
- Add audit logs.
- Add rate limiting and monitoring.

### Phase 4: Business Workflow Completion

- Add quotation approvals.
- Add invoice approval/send/reminder flow.
- Add task assignment and billable tracking.
- Add payment reversal controls.

### Phase 5: UI/UX Polish

- Improve empty/loading/error states.
- Add import/export flows.
- Improve mobile tables.
- Standardize forms and modals.

### Phase 6: Subscription and Billing

- Add Stripe or local payment provider.
- Add plans, trials, usage limits.
- Add billing page and tenant suspension.

### Phase 7: Launch Readiness

- Add CI/CD quality gates.
- Add RLS tests.
- Add backups.
- Add legal pages.
- Add support process.
- Run pilot with 2-3 companies.

## 14. Developer Task List

| Task | Description | Priority | Risk Level | Acceptance Criteria | Estimated Effort |
|---|---|---:|---:|---|---:|
| Add companies table | Create tenant root entity | P0 | Critical | Existing data belongs to default company | 1 day |
| Add company_users | Tenant-scoped memberships | P0 | Critical | One user can belong to multiple companies | 2 days |
| Add company_id everywhere | Update all business tables | P0 | Critical | Every tenant-owned row has `company_id` | 3-5 days |
| Rewrite RLS | Enforce tenant membership | P0 | Critical | User cannot query another company rows | 3-5 days |
| Secure PDF routes | Check tenant access before service-role reads | P0 | Critical | Direct ID guessing fails | 1-2 days |
| Tenant settings migration | Replace `id = 1` settings | P0 | Critical | Each company has own branding/settings | 2-3 days |
| Tenant storage policies | Scope uploads by company path | P0 | Critical | Users cannot overwrite other company assets | 1-2 days |
| Onboarding flow | Register company + owner | P1 | High | New owner can create workspace and land in dashboard | 1 week |
| Permission helper | Central server-side permission checks | P1 | High | All API mutations call same guard | 3 days |
| Server-side validation | Add Zod schemas for mutations | P1 | High | Invalid payloads rejected before DB write | 1 week |
| Invoice numbering | Per-company numbering function | P1 | High | Concurrent invoices get unique company-local numbers | 2 days |
| Audit event system | Central audit log | P1 | High | Key actions write immutable events | 3-5 days |
| Fix lint backlog | Clean React/ESLint issues | P2 | Medium | `npm run lint` passes | 2-4 days |
| Add tests | RLS + workflow tests | P2 | Medium | CI blocks tenant leakage regressions | 1-2 weeks |
| Subscription module | Plans, trials, limits | P2 | Medium | Plan limits enforced in backend | 1-2 weeks |
| Client portal | Client invoice/quotation access | P3 | Medium | Client role sees only own documents | 1-2 weeks |

## 15. Final Recommendation

1. Refactor the current app: yes. The existing UI and modules are worth keeping.
2. Rebuild the backend: partially. Keep Supabase, but move critical business operations into server-side APIs/RPC with authorization.
3. Redesign the database: yes. This is mandatory before SaaS launch.
4. Redesign the UI: not from scratch. Add onboarding, workspace switching, commercial polish, and better workflow screens.
5. Launch after fixes: not now. Launch only after tenant isolation, RLS, API authorization, onboarding, and billing foundations are complete.

Practical path: keep this app as the V1 product shell, but treat the next sprint as a multi-tenant foundation sprint, not a feature sprint. The current app is close to being useful, but tenant isolation is the line between internal tool and safe SaaS.
