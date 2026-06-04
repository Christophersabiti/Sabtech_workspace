-- Uganda Withholding Tax (WHT) Support
-- Migration 020

-- ─── WHT fields on invoices ───────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS apply_wht                  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wht_rate                   numeric(5,2) NOT NULL DEFAULT 6.00,
  ADD COLUMN IF NOT EXISTS wht_treatment              text        NOT NULL DEFAULT 'STANDARD_DEDUCTION'
    CHECK (wht_treatment IN ('STANDARD_DEDUCTION', 'GROSS_UP')),
  ADD COLUMN IF NOT EXISTS wht_taxable_base_type      text        NOT NULL DEFAULT 'SUBTOTAL_EXCL_VAT'
    CHECK (wht_taxable_base_type IN ('SUBTOTAL_EXCL_VAT', 'TOTAL_INCL_VAT', 'MANUAL')),
  ADD COLUMN IF NOT EXISTS wht_taxable_amount         numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wht_amount                 numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable_amount         numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grossed_up_amount          numeric(15,2),
  ADD COLUMN IF NOT EXISTS ura_wht_remittance_status  text        NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (ura_wht_remittance_status IN ('NOT_APPLICABLE', 'PENDING', 'REMITTED')),
  ADD COLUMN IF NOT EXISTS ura_wht_certificate_number text,
  ADD COLUMN IF NOT EXISTS ura_wht_remittance_date    date;

-- Back-fill net_payable_amount for existing invoices (no WHT → net = total)
UPDATE invoices
SET    net_payable_amount = total_amount
WHERE  net_payable_amount = 0 AND total_amount > 0;

-- ─── WHT fields on payments ───────────────────────────────────────────────────
-- amount_paid = actual_received + wht_withheld (gross applied to invoice balance)
-- actual_received = cash the supplier actually received
-- wht_withheld    = amount held back by client and remitted to URA
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS wht_withheld           numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_received        numeric(15,2),
  ADD COLUMN IF NOT EXISTS wht_certificate_number text,
  ADD COLUMN IF NOT EXISTS wht_certificate_url    text;

-- Back-fill: for existing payments, actual_received = amount_paid (no WHT was applied)
UPDATE payments SET actual_received = amount_paid WHERE actual_received IS NULL;

-- ─── Historical / migrated invoices ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrated_invoices (
  id                      uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              uuid        NOT NULL,
  original_invoice_number text        NOT NULL,
  mapped_invoice_id       uuid        REFERENCES invoices(id) ON DELETE SET NULL,
  original_issue_date     date        NOT NULL,
  original_due_date       date,
  client_id               uuid        REFERENCES clients(id) ON DELETE SET NULL,
  project_id              uuid        REFERENCES projects(id) ON DELETE SET NULL,
  currency                text        NOT NULL DEFAULT 'UGX',
  subtotal                numeric(15,2) NOT NULL DEFAULT 0,
  vat_amount              numeric(15,2) NOT NULL DEFAULT 0,
  discount_amount         numeric(15,2) NOT NULL DEFAULT 0,
  wht_applied             boolean     NOT NULL DEFAULT false,
  wht_rate                numeric(5,2)          DEFAULT 0,
  wht_amount              numeric(15,2)         DEFAULT 0,
  gross_invoice_total     numeric(15,2) NOT NULL DEFAULT 0,
  amount_paid             numeric(15,2) NOT NULL DEFAULT 0,
  payment_date            date,
  payment_method          text,
  payment_reference       text,
  original_receipt_number text,
  wht_certificate_number  text,
  attachment_url          text,
  migration_remarks       text,
  status                  text        NOT NULL DEFAULT 'MIGRATED',
  migrated_by             uuid,
  migrated_at             timestamptz NOT NULL DEFAULT now(),
  migration_source        text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE migrated_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_migrated_invoices_all"
  ON migrated_invoices FOR ALL
  USING  (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_migrated_invoices_company  ON migrated_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_migrated_invoices_client   ON migrated_invoices(client_id);

-- ─── Update recalculate_invoice_totals to handle GROSS_UP ────────────────────
CREATE OR REPLACE FUNCTION recalculate_invoice_totals(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_subtotal        numeric(15,2);
  v_tax             numeric(15,2);
  v_discount        numeric(15,2);
  v_total           numeric(15,2);
  v_paid            numeric(15,2);
  v_balance         numeric(15,2);
  v_status          text;
  v_due_date        date;
  v_cur_status      text;
  v_apply_wht       boolean;
  v_wht_treatment   text;
  v_grossed_up      numeric(15,2);
  v_net_payable     numeric(15,2);
BEGIN
  -- Recalculate line items aggregate
  SELECT
    COALESCE(SUM(quantity * unit_price * (1 - discount_percent / 100)), 0),
    COALESCE(SUM(quantity * unit_price * (tax_percent / 100)), 0)
  INTO v_subtotal, v_tax
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;

  SELECT discount_amount, due_date, status,
         apply_wht, wht_treatment, grossed_up_amount, net_payable_amount
  INTO   v_discount, v_due_date, v_cur_status,
         v_apply_wht, v_wht_treatment, v_grossed_up, v_net_payable
  FROM   invoices
  WHERE  id = p_invoice_id;

  -- Base total from items
  v_total := v_subtotal - COALESCE(v_discount, 0) + v_tax;

  -- For GROSS_UP WHT, use the stored grossed-up amount as the invoice total
  IF v_apply_wht AND v_wht_treatment = 'GROSS_UP' AND COALESCE(v_grossed_up, 0) > 0 THEN
    v_total := v_grossed_up;
  END IF;

  -- Sum all confirmed payments (amount_paid = actual_received + wht_withheld for WHT invoices)
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO   v_paid
  FROM   payments
  WHERE  invoice_id = p_invoice_id AND is_confirmed = true;

  -- For non-WHT invoices balance against total; for WHT against net_payable
  IF v_apply_wht AND COALESCE(v_net_payable, 0) > 0 THEN
    v_balance := v_net_payable - v_paid;
  ELSE
    v_balance := v_total - v_paid;
  END IF;

  -- Determine status (don't override draft or cancelled/void)
  IF v_cur_status IN ('draft', 'cancelled', 'void') THEN
    v_status := v_cur_status;
  ELSIF v_balance <= 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partially_paid';
  ELSIF v_due_date IS NOT NULL AND v_due_date < current_date THEN
    v_status := 'overdue';
  ELSE
    v_status := 'sent';
  END IF;

  UPDATE invoices SET
    subtotal             = v_subtotal,
    tax_amount           = v_tax,
    total_amount         = v_total,
    total_paid           = v_paid,
    balance_due          = v_balance,
    status               = v_status
  WHERE id = p_invoice_id;
END;
$$;
