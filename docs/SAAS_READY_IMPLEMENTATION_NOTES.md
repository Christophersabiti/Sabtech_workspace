# SaaS Readiness Implementation Notes

## Database and Migration

Apply Supabase migrations through `018_trials_packages_entitlements_branding.sql` after the existing migrations.

The new migration extends:

- `company_settings`: favicon URL, secondary color, tagline, invoice logo URL, report header logo URL.
- `subscription_plans`: monthly price, annual price, trial days, public visibility, storage/document/company limits.
- `company_subscriptions`: billing status, subscription status, trial dates, current period dates, payment provider identifiers, coupon link.

The migration adds:

- `package_features`
- `coupons`
- `packages` view over `subscription_plans`

## Billing Statuses

Supported billing statuses:

- `trial_active`
- `trial_expired`
- `active`
- `past_due`
- `cancelled`
- `suspended`

Trials are created from the selected package's `trial_days`, defaulting to exactly 7 days.

## Entitlements

Central service:

- `src/lib/entitlements.ts`
- `src/app/api/entitlements/route.ts`

Feature keys:

- `clients.create`
- `projects.create`
- `tasks.create`
- `invoices.create`
- `quotations.create`
- `reports.export`
- `dashboard.advanced`
- `inventory.enabled`
- `accounting.enabled`
- `users.invite`
- `branding.customize`
- `billing.manage`

Currently enforced in backend route handlers for billing checkout and PDF/export routes. Client create pages show upgrade prompts when the entitlement snapshot blocks the feature.

## Security Checklist

- Tenant data remains scoped by `company_id` through existing RLS policies.
- Company asset storage paths remain scoped by company folder.
- Super Admin package/coupon changes rely on RLS and the platform proxy guard.
- Billing checkout requires active Company Admin membership.
- Billing updates are driven by Pesapal webhook status checks.
- Export routes assert `reports.export` before rendering PDFs.
- Branding settings load and save by active company ID.

Remaining hardening work:

- Move all client-side create mutations for clients, projects, invoices, quotations, and invitations behind route handlers or server actions that call `assertFeatureEntitlement`.
- Add webhook signature verification if the selected payment provider exposes a signing secret or verification endpoint.
- Add MIME sniffing and image dimension validation for uploaded company logos beyond client-side accept filters.

## Testing Checklist

- PWA manifest loads at `/manifest.webmanifest`.
- Browser favicon uses `/favicon.ico` or `/favicon.svg`.
- Mobile install icon uses `icon-192.png`, `icon-512.png`, and `maskable-icon-512.png`.
- Unauthenticated `/` redirects to `/welcome`.
- `/welcome`, `/pricing`, `/signup`, `/login`, password reset routes remain public.
- New signup stores package metadata and starts a trial when a session is available.
- New workspace onboarding creates `company_subscriptions` with trial dates.
- Trial banner displays current package and days remaining.
- Expired/past-due/cancelled/suspended subscriptions block export routes.
- Super Admin can edit packages/features and create/toggle coupons at `/admin/platform/packages`.
