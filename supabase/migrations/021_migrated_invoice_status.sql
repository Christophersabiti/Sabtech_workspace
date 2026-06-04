-- Allow 'migrated' as a valid invoice status and add migration metadata columns
-- Migration 021

-- Extend the status check constraint on invoices to include 'migrated'
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'migrated'));

-- Migration provenance fields on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS migrated_by       uuid,
  ADD COLUMN IF NOT EXISTS migrated_at       timestamptz,
  ADD COLUMN IF NOT EXISTS migration_source  text;

-- Also add a reference back to migrated_invoices from invoices (nullable)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS migrated_record_id uuid REFERENCES migrated_invoices(id) ON DELETE SET NULL;

-- Update recalculate_invoice_totals to protect 'migrated' status from being overridden
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

  v_total := v_subtotal - COALESCE(v_discount, 0) + v_tax;

  IF v_apply_wht AND v_wht_treatment = 'GROSS_UP' AND COALESCE(v_grossed_up, 0) > 0 THEN
    v_total := v_grossed_up;
  END IF;

  SELECT COALESCE(SUM(amount_paid), 0)
  INTO   v_paid
  FROM   payments
  WHERE  invoice_id = p_invoice_id AND is_confirmed = true;

  IF v_apply_wht AND COALESCE(v_net_payable, 0) > 0 THEN
    v_balance := v_net_payable - v_paid;
  ELSE
    v_balance := v_total - v_paid;
  END IF;

  -- Protect draft, cancelled, void, and migrated from automatic status overrides
  IF v_cur_status IN ('draft', 'cancelled', 'void', 'migrated') THEN
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
