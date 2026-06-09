# SABTECH MINI ERP — ADMIN GUIDE

This guide is designed for Company Admins and Platform Super Admins. It outlines the backend configurations, settings, access controls, billing operations, and system maintenance tasks required to manage company workspaces and the global SaaS platform.

---

## 1. Company Identity & Branding Customization

### Company Profile Setup
As a Company Admin, configuring your identity details is the first step in setting up your workspace:
1. Navigate to **Settings** -> **Company Profile**.
2. Fill in the **Company Name** and **Trading Name** (if different).
3. Set your **TIN (Tax Identification Number)** and **Registration Number** to ensure your invoices are legally compliant.
4. Input your physical address, contact phone, website, and support email.
5. Save the profile. These details are cached locally via Dexie IndexedDB and synchronized with Supabase for document templates.

### Branding Customization
The system supports full visual branding matching your corporate identity:
1. Navigate to **Settings** -> **Branding**.
2. **Primary Color:** Choose a dark background color. This color is used for invoice PDF table headers and primary text layouts. Preset swatches include corporate dark blue (`#091545`), slate (`#0f172a`), and navy (`#112068`).
3. **Accent Color:** Choose a vibrant highlight color. This color is used for status badges (e.g., "SENT", "PAID"), buttons, and payment instruction backgrounds. Preset accents include teal (`#1D9E75`), purple (`#5DCAA5`), and indigo (`#4f46e5`).
4. **Logos & Icons:**
   * **Company Logo:** Upload your main company logo.
   * **Invoice / Quotation Logo:** Define a specific logo URL for documents.
   * **Favicon URL:** Provide a favicon link for browser tabs.
5. Click **Save Branding Settings** to apply.

> **Admin Tip:** Logo uploads require a public bucket in Supabase Storage named `company-assets` to host media files. If uploads fail, contact the Platform Admin.

### Document Settings & Prefixes
Control how your invoicing numbering behaves:
1. Go to **Settings** -> **Invoice Settings**.
2. Edit numbering prefixes:
   * **Invoice Prefix:** e.g., `INV` generates `INV-2026-0001`
   * **Receipt Prefix:** e.g., `RCP` generates `RCP-2026-0001`
   * **Quote Prefix:** e.g., `QUO` generates `QUO-2026-0001`
3. **Default Due Days:** Specify standard invoice payment periods (e.g., `14` days). Set to `0` for payment due on receipt.
4. **Display Options:** Use toggles to show or hide your company logo, TIN number, and payment history ledger on generated PDF documents.

---

## 2. Payment Methods Setup

To receive payments from clients, configure your bank accounts and mobile money collection details:
1. Navigate to **Settings** -> **Payment Methods**.
2. Click **Add Payment Method** or edit existing ones.
3. Supported types:
   * **Mobile Money:** Specify Mobile Money Number and Account Holder Name (e.g., "MTN Mobile Money" - `0777293933`).
   * **MOMO Merchant Pay:** Enter Merchant Pay Code (e.g., "MOMO Merchant" - `876997`).
   * **Bank Transfer:** Enter Bank Name, Account Name, Account Number, Branch, and Swift Code (e.g., "Centenary Bank" - `3200051550`).
4. **Display Option:** Toggle **Show on Invoice** to print payment details and instructions directly onto client invoice PDFs.
5. Use the **Display Order** field to prioritize how payment options are displayed to clients.

---

## 3. Access Controls & Custom Permissions

The platform uses a role-based access model with an override engine:
1. Navigate to **Admin** -> **Users**.
2. Click **Invite User** to add team members:
   * Input the email address and select the default role.
   * **Roles Catalog:**
     * `super_admin`: Full company control.
     * `admin`: Complete operational access (except super admin billing).
     * `finance`: Manage billing, payments, and financial reports.
     * `project_manager`: Build clients, projects, and schedule invoices.
     * `staff`: Complete assigned tasks, upload receipts.
     * `client`: Portal access to view owned documents.
3. **Permission Overrides:**
   * To change permissions for a user, click on their profile in the user list.
   * Toggle permissions manually for specific modules (e.g., allow a `staff` member to edit clients by checking `Allow` on `clients.edit`).
   * Click **Save Overrides**.

> **Warning:** Permission overrides take absolute priority over default role settings. Ensure that sensitive permissions (e.g., `payments.confirm` or `invoices.edit`) are restricted to authorized personnel.

---

## 4. SaaS Billing & Subscription Operations

The SaaS platform handles billing, plan limits, coupons, and payments using Pesapal:
1. Navigate to **Settings** -> **Billing**.
2. **Trial Period:** All new workspaces start with a **7-Day Free Trial** on the Starter plan. A countdown banner is shown on the dashboard.
3. **Package Tier Limits:**
   * **Starter:** UGX 75,000/mo. Limits: 3 users, 50 invoices, 25 clients, 5 projects, 100 tasks, 50 quotes. Advanced reports and branding customization are disabled.
   * **Professional:** UGX 150,000/mo. Limits: 10 users, 250 invoices, unlimited clients, 50 projects, 1,000 tasks. Advanced reporting and custom branding are enabled.
   * **Business:** UGX 300,000/mo. Limits: 25 users, 1,000 invoices, unlimited projects. All modules (including Inventory/Accounting flags) are enabled.
   * **Enterprise:** Custom packages. Unlimited users and documents.
4. **Processing Payments:**
   * Choose a plan and interval (monthly/annual).
   * Enter any discount coupons in the checkout panel.
   * Click **Pay with Pesapal** to launch the gateway. Once paid, the system receives a callback, upgrades your subscription, and removes limit flags.

---

## 5. Platform Super Admin Operations

For global platform administrators managing the entire SaaS server:

### Accessing the Platform Admin Dashboard
1. Log in with a global administrator account (Default super admin seeded: `sabiti.christopher@gmail.com`).
2. Go to **Platform Admin** in the sidebar.

### Impersonating a Client Workspace
To assist clients and debug settings:
1. Navigate to **Companies** inside the platform dashboard.
2. Search for the target company and click **Impersonate**.
3. The platform switches your active company ID context. You will see the tenant workspace exactly as their admin sees it.
4. An alert banner will confirm you are in impersonation mode.
5. Complete troubleshooting, and click **Stop Impersonation** on the banner to return to global admin mode.

### Package & Feature Flags Configurations
1. Go to the **Packages** tab.
2. Select any package to modify user caps, document limits, monthly prices, and billing intervals.
3. Toggle feature keys for package catalogs (e.g., toggle `reports.export` or `branding.customize` flags on the Starter package).
4. Click **Sync Packages** to propagate limits across all active tenant databases.

### Audit Log & System Diagnostics
* **Security & RLS Checks:** The database enforces multi-tenancy isolation using row-level policies. Platform Super Admins can audit RLS policies by viewing logs under **Admin** -> **Audit Log**.
* **Global Transactions:** Inspect the **Transactions** view to review Pesapal logs, reference numbers, payment status codes, error messages, and raw API payloads.
