# SABTECH MINI ERP — WORKFLOW DIAGRAMS GUIDE

This document houses all the system process flow diagrams using Mermaid syntax. It serves as a visual layout reference for business users, operation teams, administrators, and system trainers to understand how data moves through the application.

---

## 1. Authentication & Onboarding Workflow
Describes how a user accesses the system, undergoes authentication checks, and is guided to select an active company workspace or register a new one.

```mermaid
flowchart TD
    A[User Opens Application URL] --> B[Sign Up or Login Screen]
    B --> C[Email and Password Credentials Check]
    C --> D{Is User Session Active?}
    D -->|No| B
    D -->|Yes| E{Does User Have Company Memberships?}
    E -->|Yes| F[Redirect to Home Dashboard]
    E -->|No| G[Launch Onboarding Company Wizard]
    G --> H[Input Company Name, Address, TIN, Country, Currency]
    H --> I[Submit & Create Company Profile]
    I --> F
```

---

## 2. Company & Workspace Switcher Workflow
Shows how company settings are configured and how users who belong to multiple organizations switch their context, reloading isolated data.

```mermaid
flowchart TD
    A[Super Admin or Company Admin] --> B[Open Settings Section]
    B --> C[Configure Profile: TIN, Name, Website, Currency]
    C --> D[Customize Branding: Primary / Accent Colors, Upload Logo]
    D --> E[Save Configuration -> Writes to company_settings]
    
    F[User clicks active workspace on Sidebar] --> G[Dropdown opens listing all active memberships]
    G --> H{User selects a workspace}
    H --> I[Update activeCompanyId state in Sidebar Context]
    I --> J[Trigger Next.js Router Refresh]
    J --> K[Re-evaluate RLS policies matching company_id]
    K --> L[Display target company’s dashboard]
```

---

## 3. User Invitation & Permissions Workflow
Illustrates how Admins invite team members and set custom permission overrides that bypass standard role-based access.

```mermaid
flowchart TD
    A[Admin Opens Users Screen] --> B[Click Invite User Button]
    B --> C[Enter Email & Select Default Role]
    C --> D[Configure Module Permissions Toggles Override]
    D --> E[Send Invitation -> Creates invitation record]
    E --> F[User receives tokenized email invitation link]
    F --> G{User Clicks Link?}
    G -->|Accepts before expiry| H[Link invitation to auth user ID]
    H --> I[Create company_users record & active state]
    G -->|Expires after 7 days / Revoked| J[Mark Invitation Expired / Cancelled]
```

---

## 4. Services Catalog Management
Explains how the standard rates catalog is populated for quotes and invoice calculations.

```mermaid
flowchart TD
    A[Finance or Project Manager] --> B[Open Services Screen]
    B --> C[Click New Service]
    C --> D[Input Service Code, Name, Category, Default Rate]
    D --> E[Set Tax Percentage e.g. 18% VAT]
    E --> F[Click Save -> Adds item to services table]
    F --> G[Service becomes selectable on Invoices & Quotations]
```

---

## 5. Quotation Lifecycle & Project Conversion
Demonstrates the pathway from an initial customer quote to project creation and automated task importing.

```mermaid
flowchart TD
    A[Project Manager drafts Quotation] --> B[Add Client, Project Title & Line Items]
    B --> C[Save as Draft status]
    C --> D[Change Status to Sent]
    D --> E{Client Response?}
    E -->|Rejected| F[Update Status to Rejected]
    E -->|No Action / Past Validity| G[Update Status to Expired]
    E -->|Approved| H[Update Status to Approved]
    H --> I[Click Convert to Project Button]
    I --> J[Create new Project record automatically]
    J --> K[Import Quotation Line Items as Project Tasks]
    K --> L[Open Project Kanban Board]
```

---

## 6. Project & Task Board Workflow
Shows how operations are managed via Kanban/Gantt boards and how milestones connect to the billing process.

```mermaid
flowchart TD
    A[Project Created / Imported] --> B[Define Milestone Schedules & Percentages]
    B --> C[Add Project Tasks to board]
    C --> D[Assign Resources & set estimated hours]
    D --> E[Staff updates status: Pending -> In Progress -> Completed]
    E --> F{Is Milestone Task group finished?}
    F -->|No| E
    F -->|Yes| G[Click Generate Invoice button next to Milestone]
    G --> H[Launch pre-filled Invoice Form]
```

---

## 7. Invoicing Lifecycle & PDF Management
Outlines the steps required to issue invoices, compute taxes, download compliance documentation, and void invoices.

```mermaid
flowchart TD
    A[Launch Invoice Creator] --> B[Select Client, Project, Issue Date, Due Days]
    B --> C[Load Services Catalog Items or custom lines]
    C --> D[Set discounts, tax % -> Auto-calculate Totals]
    D --> E[Save in Draft status]
    E --> F[Click Mark as Sent -> Formats PDF & prints Doc Number]
    F --> G[Download PDF / Print client record]
    G --> H{Payment Status?}
    H -->|Partial Settlement| I[Update status to Partially Paid]
    H -->|Full Settlement| J[Update status to Paid]
    H -->|Unpaid past due date| K[Update status to Overdue]
    F -->|Error Discovered| L[Click Void -> Require Reason input]
    L --> M[Update status to Void -> Restore Client Balance]
```

---

## 8. Payment Reconciliation & Reversal
Shows how payments are recorded against open invoice balances, reviewed, and reversed if transactions bounce.

```mermaid
flowchart TD
    A[Finance logs Payment] --> B[Enter Invoice #, Amount, Date, Reference, Method]
    B --> C[Save -> Creates payment in Pending status]
    C --> D{Finance reviews transaction?}
    D -->|Details match bank/momo| E[Click Confirm Payment]
    E --> F[Update status to Confirmed -> Subtract Invoice balance]
    D -->|Bounce / Dishonored cheque| G[Click Reverse -> Input reason]
    G --> H[Update status to Reversed -> Restore invoice balance due]
```

---

## 9. Expense Recording & Payout
Shows how operational costs are logged, linked to projects for margin analysis, and processed.

```mermaid
flowchart TD
    A[Employee logs Expense] --> B[Input Amount, Category, Vendor, Description]
    B --> C[Attach Receipt File Upload to storage]
    C --> D[Allocate Cost: Select Client and Project]
    D --> E[Submit Expense -> status: Pending]
    E --> F{Finance / Admin review?}
    F -->|Reject| G[Click Reject -> status: Rejected]
    F -->|Approve| H[Click Approve -> status: Approved]
    H --> I[Confirm Settlement -> status: Paid -> Outflow logged]
```

---

## 10. Reports & Financial Compilation
Explains how dashboard metrics are dynamically computed from transactions.

```mermaid
flowchart TD
    A[Select Start and End Date filters] --> B[Read all invoice and payment records]
    B --> C[Filter: company_id MATCH AND status NOT IN void, cancelled, reversed]
    C --> D[Sum active invoice totals -> Total Invoiced KPI]
    C --> E[Sum confirmed payment amounts -> Total Collected KPI]
    C --> F[Sum invoice balances due -> Outstanding KPI]
    D --> G[Total Invoiced - Approved Expenses = Profit Margin]
    E --> H[Generate tab listings for Invoices, Payments, Clients]
    H --> I[Click Export -> Download CSV spreadsheet]
```

---

## 11. Billing, Subscriptions & Pesapal (SaaS)
Shows the SaaS lifecycle, checking package limitations, and integrating Pesapal.

```mermaid
flowchart TD
    A[New Company Registered] --> B[Automatically Seed 7-Day Free Trial]
    B --> C[Unlock features based on Trial key]
    C --> D{System evaluates feature usage limits?}
    D -->|Exceeds limits| E[Block document creation form]
    D -->|Within limits| F[Allow operation]
    B --> G{Trial Period Ends?}
    G -->|Yes| H[Lock workspace features -> Prompt payment]
    G -->|No| C
    H --> I[Admin opens Billing -> Selects Starter/Pro/Business Package]
    I --> J[Apply Coupon Code -> Calculate Discount]
    J --> K[Click Pay -> Handshake with Pesapal API]
    K --> L[User settles payment on Pesapal portal]
    L --> M[Pesapal callback verification checks]
    M --> N[Update Subscription to Active -> Reset user/document limits]
```

---

## 12. Super Admin Global Operations
Illustrates the global management workflows of the SaaS platform.

```mermaid
flowchart TD
    A[Super Admin Logs In] --> B[Open Platform Admin Section]
    B --> C{Select Admin Task?}
    C -->|Impersonate Workspace| D[Click Impersonate Company]
    D --> E[Switch cookie/session to tenant sandbox context]
    E --> F[Debug issue -> Logged in platform_audit_logs]
    F --> G[Click Stop Impersonation -> Restore original session]
    C -->|Manage Subscriptions| H[Edit package limits, prices, features]
    H --> I[Sync package features to database catalog]
    C -->|API Gateways| J[Input Sandbox/Production keys in pesapal_settings]
```

---

## 13. Master Interconnected Business Workflow
The complete, unified business flow of Sabtech Mini ERP:

```mermaid
flowchart TD
    A[Company Onboarding] --> B[User Invitation & Role Setup]
    B --> C[Configure Services Catalog & Base Rates]
    C --> D[Add Client Account]
    D --> E[Draft Quotation proposal]
    E --> F[Client Approves Quote]
    F --> G[Convert Quote -> Create Project & Tasks]
    G --> H[Assign Staff to Kanban Board]
    G --> I[Define Milestone Invoice Schedules]
    H --> J[Staff Work & Complete Tasks]
    I -->|Milestone Complete| K[Click Generate Invoice]
    K --> L[Save Invoice Draft -> Mark Sent]
    L --> M[Client Pays -> Record Payment]
    M --> N[Confirm Payment -> Invoice marked Paid]
    O[Log Expenses & Attach Receipts] --> P[Link Expense to Project]
    P --> Q[Approve Expense & Record Cash Outflow]
    N --> R[Reports Compiled: Total Revenue]
    Q --> S[Reports Compiled: Total Costs]
    R --> T[Dashboard Profit & Margin Analytics]
    S --> T
```
