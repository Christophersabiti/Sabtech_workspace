# SABTECH MINI ERP — SCREENSHOT CHECKLIST

This document provides a checklist of UI screens and states that need to be captured to complete the user documentation manuals. Developers should capture these images and place them in the `./screenshots/` directory using the recommended names.

---

## 1. Authentication & Onboarding
- [ ] **Welcome Page**
  * **File Name:** `./screenshots/auth-welcome.png`
  * **Layout State:** Welcome screen displaying "Sign Up" and "Login" options.
- [ ] **Login Screen**
  * **File Name:** `./screenshots/auth-login.png`
  * **Layout State:** Login form with email and password fields visible.
- [ ] **Company Onboarding Wizard**
  * **File Name:** `./screenshots/auth-onboarding.png`
  * **Layout State:** Screen requesting company profile info (Name, address, TIN, country, currency) for a newly registered user.
- [ ] **Workspace Switcher Menu**
  * **File Name:** `./screenshots/auth-switcher.png`
  * **Layout State:** Dropdown menu opened from the sidebar displaying multiple active company workspace selections and the "+ Create Workspace" button.

---

## 2. Company Profile & Settings
- [ ] **Company Profile Form**
  * **File Name:** `./screenshots/settings-company.png`
  * **Layout State:** **Settings** -> **Company Profile** page showing company identity, TIN, physical address, and contact details.
- [ ] **Branding Settings & Color Picker**
  * **File Name:** `./screenshots/settings-branding.png`
  * **Layout State:** **Settings** -> **Branding** page showing logo upload boxes, preset color swatches, and the custom color picker panel.
- [ ] **Invoice Prefix & Numbering Config**
  * **File Name:** `./screenshots/settings-invoice.png`
  * **Layout State:** **Settings** -> **Invoice Settings** page showing document prefix entries (INV, RCP, QUO), default due days, and document option toggles.
- [ ] **Payment Methods Directory**
  * **File Name:** `./screenshots/settings-payment-methods.png`
  * **Layout State:** **Settings** -> **Payment Methods** page showing the configured methods (MTN Mobile Money, MOMO Merchant, Centenary Bank) and active toggle switches.

---

## 3. Team & User Access Control
- [ ] **Users Directory & Invitations List**
  * **File Name:** `./screenshots/users-list.png`
  * **Layout State:** **Admin** -> **Users** page showing a list of active team users and the tab for pending invitations.
- [ ] **Invite User Modal**
  * **File Name:** `./screenshots/users-invite-modal.png`
  * **Layout State:** Pop-up modal prompting for email, role assignment dropdown, and send button.
- [ ] **Permission Overrides Panel**
  * **File Name:** `./screenshots/users-overrides.png`
  * **Layout State:** Detailed edit page for a specific user showing granular checkboxes for allowing or denying module privileges.

---

## 4. Services Catalog
- [ ] **Services List Directory**
  * **File Name:** `./screenshots/services-list.png`
  * **Layout State:** Main **Services** page showing standard billing services, default prices, and tax rates.
- [ ] **Service Creator Dialog**
  * **File Name:** `./screenshots/services-create-modal.png`
  * **Layout State:** Pop-up modal containing fields for Service Code, Name, Category, price, and tax % input.

---

## 5. Client Management
- [ ] **Clients Directory**
  * **File Name:** `./screenshots/clients-list.png`
  * **Layout State:** Main **Clients** page listing clients, codes, status, and active project counts.
- [ ] **New Client Creator Form**
  * **File Name:** `./screenshots/clients-create.png`
  * **Layout State:** Form displaying physical address inputs, TIN input, and default currency selection.
- [ ] **Client Details Portal View**
  * **File Name:** `./screenshots/clients-details.png`
  * **Layout State:** Profile detail view of a client displaying their project list tab, ledger statement tab, and audit log.

---

## 6. Quotation Module
- [ ] **Quotations Directory**
  * **File Name:** `./screenshots/quotations-list.png`
  * **Layout State:** Main **Quotations** page listing quotes with total amounts and status badges (e.g. Draft, Sent, Converted).
- [ ] **Create Quotation Form**
  * **File Name:** `./screenshots/quotations-create.png`
  * **Layout State:** Multi-line quotation form showing line item additions, tax calculations, and discount selections.
- [ ] **Quotation Details View**
  * **File Name:** `./screenshots/quotations-detail.png`
  * **Layout State:** A quotation in "Approved" state showing the active "Convert to Project" action button.

---

## 7. Project & Task Board
- [ ] **Projects Board Directory**
  * **File Name:** `./screenshots/projects-list.png`
  * **Layout State:** Main **Projects** page listing active projects and billing models.
- [ ] **Kanban Task Board**
  * **File Name:** `./screenshots/projects-kanban.png`
  * **Layout State:** Kanban column layout showing tasks distributed across Pending, In Progress, and Completed lanes.
- [ ] **Gantt Chart timeline view**
  * **File Name:** `./screenshots/projects-gantt.png`
  * **Layout State:** Operational Gantt timeline illustrating task durations and dependencies.
- [ ] **Milestone Billing Scheduler**
  * **File Name:** `./screenshots/projects-billing.png`
  * **Layout State:** Project details **Billing** tab displaying scheduled installments and the "Generate Invoice" trigger button.

---

## 8. Invoices Module
- [ ] **Invoices Directory**
  * **File Name:** `./screenshots/invoices-list.png`
  * **Layout State:** Main **Invoices** page listing invoices, client columns, total amount columns, and status badges.
- [ ] **Create Invoice Form**
  * **File Name:** `./screenshots/invoices-create.png`
  * **Layout State:** Complete invoice creator form showing client choice, invoice date, due days, and service line additions.
- [ ] **Invoice Detail View & PDF Preview**
  * **File Name:** `./screenshots/invoices-detail.png`
  * **Layout State:** Invoice detail page showing the print/download buttons, and the interactive PDF rendering displaying company branding.

---

## 9. Payments Module
- [ ] **Payments Log View**
  * **File Name:** `./screenshots/payments-list.png`
  * **Layout State:** Main **Payments** ledger page listing transaction entries, payment methods, reference numbers, and status badges.
- [ ] **Record Payment Dialog**
  * **File Name:** `./screenshots/payments-record-modal.png`
  * **Layout State:** Pop-up modal containing amount paid inputs, payment methods selector, and reference note fields.
- [ ] **Payment Detail & Actions View**
  * **File Name:** `./screenshots/payments-detail-panel.png`
  * **Layout State:** Detail slider pane for a pending payment showing the "Confirm" and "Reverse" action items.

---

## 10. Expenses Module
- [ ] **Expenses Log View**
  * **File Name:** `./screenshots/expenses-list.png`
  * **Layout State:** Main **Expenses** listing showing logged expenditures, receipts download icons, and project context associations.
- [ ] **Log Expense Form**
  * **File Name:** `./screenshots/expenses-create.png`
  * **Layout State:** Expense layout showing receipt file drag-and-drop input boxes, client lookups, and category dropdowns.
- [ ] **Expense Categories Drawer**
  * **File Name:** `./screenshots/expenses-categories.png`
  * **Layout State:** Modal drawer listing configurable categories (e.g., Office, Travel, Meals).

---

## 11. Reports & Analytics
- [ ] **Reports Overview Dashboard**
  * **File Name:** `./screenshots/reports-overview.png`
  * **Layout State:** Financial dashboard showing KPI summary cards, invoice status counts, and top clients list.
- [ ] **Reports Invoice tab ledger**
  * **File Name:** `./screenshots/reports-invoices.png`
  * **Layout State:** Reports screen with date range filters selected, displaying the filtered Invoices tab and the "Export CSV" action.

---

## 12. Billing & Subscriptions (SaaS)
- [ ] **Workspace Billing Overview**
  * **File Name:** `./screenshots/billing-details.png`
  * **Layout State:** **Settings** -> **Billing** page showing current package tier, trial countdown banner, and usage progress bars.
- [ ] **Package Pricing grid**
  * **File Name:** `./screenshots/billing-pricing.png`
  * **Layout State:** Pricing tier selection screen displaying Starter, Professional, and Business packages.

---

## 13. Platform Admin (Global Admin)
- [ ] **Global Companies Dashboard**
  * **File Name:** `./screenshots/platform-companies.png`
  * **Layout State:** **Platform Admin** portal listing all registered company workspaces, subscription statuses, and the "Impersonate" actions.
- [ ] **Impersonation Active Banner State**
  * **File Name:** `./screenshots/platform-impersonation.png`
  * **Layout State:** Active impersonation view of a client workspace showing the colored header banner and "Stop Impersonation" action.
- [ ] **Global Plan Editor**
  * **File Name:** `./screenshots/platform-packages.png`
  * **Layout State:** Super admin **Packages** page detailing limits and feature flags.
