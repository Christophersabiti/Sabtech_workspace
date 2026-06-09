# SABTECH MINI ERP — TRAINING GUIDE

This training guide is designed to onboard new users, administrators, and operations teams to the Sabtech Mini ERP platform. It is structured into a Quick-Start guide followed by targeted tracks for specific user roles.

---

## 1. Quick-Start Track (First 30 Minutes)

Goal: Onboard your company, configure your first client, enter a billing catalog service, and draft a quotation proposal.

### Step 1: Sign Up and Create Your Workspace (Minutes 0–5)
1. Navigate to the application login screen and click **Sign Up**.
2. Input your email address and a secure password. Submit the form.
3. Upon first login, you will enter the **Company Onboarding Screen**.
4. Fill in your **Company Name** (e.g., "Apex Consultants"), select your **Country** (e.g., "Uganda"), select your **Default Currency** (e.g., "UGX"), and input your physical address.
5. Click **Create Workspace**. Your dashboard will load.

### Step 2: Add a Service to Your Catalog (Minutes 5–10)
1. Click **Services** in the sidebar navigation.
2. Click **New Service** (or the Plus icon).
3. Input the details:
   * **Service Code:** `PM-01`
   * **Service Name:** `Project Planning & Scoping`
   * **Category:** `Consulting`
   * **Default Price:** `1,500,000`
   * **Tax Percent:** `18` (for 18% standard VAT)
4. Click **Create Service**. It is now saved in your global billing catalog.

### Step 3: Register Your First Client (Minutes 10–20)
1. Click **Clients** in the sidebar.
2. Click **New Client** (top-right).
3. Fill in the profile fields:
   * **Client Code:** `CLI-001`
   * **Company Name:** `Global Logistics Ltd`
   * **Contact Name:** `Sarah Namubiru`
   * **Email:** `billing@globallogistics.com`
   * **Base Currency:** `UGX` (Must match client billing target)
   * **TIN Number:** `1002345678` (For tax-compliant invoices)
4. Click **Create Client**. The profile will appear in your Client Directory.

### Step 4: Draft a Quotation Proposal (Minutes 20–30)
1. Click **Quotations** in the sidebar.
2. Click **New Quotation**.
3. Fill in the form:
   * **Client:** Select `Global Logistics Ltd` from the lookup dropdown.
   * **Proposed Project:** `ERP Implementation Phase 1`
   * **Validity:** Set valid-until date to 30 days from today.
4. Click **Add Item** in the lines table:
   * Choose service code `PM-01` from the drop-down. The name, price, and tax % will populate.
   * Set quantity to `2`.
5. Enter a brief note: "This quote covers initial systems architecture mapping."
6. Click **Save as Draft**. Review the quotation preview on your screen.

---

## 2. Staff Member Track

Goal: Learn how to view assigned projects, update tasks on Kanban boards, and log personal expenses with receipt attachments.

### Task 1: View Tasks & Update Kanban Boards
1. Log into your dashboard. You will see a list of projects assigned to you.
2. Click **Projects** in the sidebar, and select the project name card.
3. Go to the **Tasks** tab.
4. Locate the **Kanban Board** view. Drag your assigned card from **Pending** to **In Progress** to indicate you have started.
5. If you need to view timeline schedules, toggle the **Gantt Chart** view at the top of the tasks tab.
6. Once the task is completed, drag it into the **Completed** column.

### Task 2: Log a Travel or Supplies Expense Claim
1. Click **Expenses** in the sidebar.
2. Click **Add Expense** (or the Plus icon).
3. Select the category (e.g., `Travel` or `Meals & Entertainment`).
4. Enter the amount (e.g., `50,000`), date, and vendor (e.g., "SafeBoda Uganda").
5. Link it to the project context: Select the client and project from the dropdowns so the cost is allocated properly.
6. Drag your scanned photo receipt into the file upload box.
7. Click **Save Expense**. The expense is logged as **Pending** review by the Finance Admin.

---

## 3. Project Manager (PM) Track

Goal: Manage client folders, draft quotes, convert approved quotes to projects, construct Kanban boards, and set installment invoice schedules.

### Task 1: Client Workspace Operations
1. Open the **Clients** list. Click on any client profile.
2. Review client health indicators (Active projects, outstanding invoice amount, payment history).
3. Browse client audit logs to see who changed contact details or currency fields.

### Task 2: Quotation Conversion
1. Navigate to **Quotations** and select your draft quotation.
2. Click **Mark as Sent** once it has been emailed to the client.
3. When the client approves, click **Approve** on the quotation screen.
4. Click **Convert to Project**. The system launches the project onboarding panel.
5. Confirm the project name and manager.
6. Click Save. The system generates the project record and automatically creates tasks from the quotation's line items.

### Task 3: Task Scheduling & Installments Setup
1. Open your newly created project.
2. Under the **Tasks** tab, configure task due dates, assign team members, and toggle the `Billable` flag.
3. Go to the **Billing** tab.
4. Add installment schedules for payment milestones:
   * **Schedule 1:** "Mobilization Deposit" | `30%` | Due date: Next Monday
   * **Schedule 2:** "System Scoping Sign-off" | `40%` | Due date: In 3 weeks
   * **Schedule 3:** "Final Handover" | `30%` | Due date: Project end date
5. Click Save. The schedules are locked in as pending invoices.

---

## 4. Finance Officer Track

Goal: Process invoice milestones, download PDF invoices, record and confirm payments, approve employee expenses, and audit financial dashboards.

### Task 1: Generate & Send Milestone Invoices
1. Open **Projects** in the sidebar. Select the active project.
2. Click on the **Billing** tab.
3. Find the completed milestone (e.g., "Mobilization Deposit") and click **Generate Invoice**.
4. The system opens the invoice builder, pre-filled with client info, milestones, and installment amount.
5. Review the totals. Click **Save as Draft**.
6. Review the branding preview. Click **Mark as Sent**.
7. Click **Download PDF** to export the invoice for client delivery.

### Task 2: Record & Reconcile Client Payments
1. Open **Payments** in the sidebar (or click **Record Payment** from the unpaid invoice view).
2. If recording from the invoice view, the details are locked. Enter:
   * **Payment Date:** Select payment arrival date
   * **Amount:** Defaults to outstanding balance
   * **Payment Method:** e.g., `bank_transfer` or `mobile_money`
   * **Reference Number:** Enter bank transaction ID or mobile money TxID
3. Click **Record Payment**. The payment is marked as **Pending** status.
4. Confirm with bank statement: Once verified, click **Confirm Payment**. The invoice status updates to **Paid** or **Partially Paid**, and the client’s ledger updates automatically.

### Task 3: Reverse a Bounced Cheque or Bad Payment
1. Open **Payments**. Locate the incorrect or failed payment transaction.
2. Click the payment row.
3. Click the **Reverse Payment** button.
4. Enter the reversal reason: "Cheque returned due to insufficient funds."
5. Click Confirm. The status changes to **Reversed** (crossed out), and the invoice balance due is restored.

### Task 4: Process Expense Approvals & Payouts
1. Click **Expenses** in the sidebar.
2. Filter the view by status `Pending` to view employee claims.
3. Click on the expense card, open the attached receipt image, and verify the amount.
4. Click **Approve** (or **Reject** if details are wrong).
5. Once approved, click **Record Payment** on the expense card to enter the cash account payout date and pay method. The expense changes to **Paid** status.

### Task 5: Pull Financial Reports
1. Click **Reports** in the sidebar.
2. Set the Date Range filters (e.g., 2026-06-01 to 2026-06-30).
3. Review KPIs:
   * **Total Invoiced:** Total bills issued
   * **Total Collected:** Total cash settled
   * **Outstanding:** Total accounts receivable
4. Under the **Invoices** tab, click **Export CSV** to download a spreadsheet for reconciliation.
5. Under the **By Client** tab, identify the top revenue contributors and outstanding balances.
