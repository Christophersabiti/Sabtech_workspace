import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type QuotationAuditAction =
  | 'created'
  | 'updated'
  | 'status_changed'
  | 'converted';

export type InvoiceAuditAction =
  | 'created'
  | 'sent'
  | 'payment_applied'
  | 'payment_reversed'
  | 'voided'
  | 'status_changed'
  | 'updated';

export type PaymentAuditAction =
  | 'created'
  | 'confirmed'
  | 'failed'
  | 'reversed';

export type ClientAuditEntry = {
  company_id: string;
  client_id:  string;
  changed_by: string | null;
  field_name: string;
  old_value:  string | null;
  new_value:  string | null;
};

export type InvoiceAuditEntry = {
  company_id:   string;
  invoice_id:   string;
  action:       InvoiceAuditAction;
  performed_by: string | null;
  old_status?:  string | null;
  new_status?:  string | null;
  reason?:      string | null;
  metadata?:    Record<string, unknown>;
};

export type PaymentAuditEntry = {
  company_id:   string;
  payment_id:   string;
  action:       PaymentAuditAction;
  performed_by: string | null;
  old_status?:  string | null;
  new_status?:  string | null;
  reason?:      string | null;
  amount?:      number | null;
  metadata?:    Record<string, unknown>;
};

export type QuotationAuditEntry = {
  company_id:   string;
  quotation_id: string;
  action:       QuotationAuditAction;
  performed_by: string | null;
  old_status?:  string | null;
  new_status?:  string | null;
  reason?:      string | null;
  metadata?:    Record<string, unknown>;
};

// ─── Client Audit ─────────────────────────────────────────────────────────────

/**
 * Log one or more field changes on a client record.
 * Pass the old and new full client objects; only changed fields are logged.
 */
export async function logClientChanges(
  supabase:  SupabaseClient,
  companyId: string,
  clientId:  string,
  changedBy: string | null,
  oldData:   Record<string, unknown>,
  newData:   Record<string, unknown>,
): Promise<void> {
  const AUDITED_FIELDS = [
    'name', 'company_name', 'contact_person', 'email', 'phone',
    'alternate_phone', 'address', 'city', 'country', 'tin_number',
    'currency', 'notes', 'status',
  ];

  const rows: ClientAuditEntry[] = [];

  for (const field of AUDITED_FIELDS) {
    const oldVal = oldData[field] ?? null;
    const newVal = newData[field] ?? null;
    if (String(oldVal) !== String(newVal)) {
      rows.push({
        company_id: companyId,
        client_id:  clientId,
        changed_by: changedBy,
        field_name: field,
        old_value:  oldVal !== null ? String(oldVal) : null,
        new_value:  newVal !== null ? String(newVal) : null,
      });
    }
  }

  if (rows.length === 0) return;
  await supabase.from('client_audit_log').insert(rows);
}

// ─── Invoice Audit ────────────────────────────────────────────────────────────

export async function logInvoiceAction(
  supabase: SupabaseClient,
  entry:    InvoiceAuditEntry,
): Promise<void> {
  await supabase.from('invoice_audit_log').insert({
    company_id:   entry.company_id,
    invoice_id:   entry.invoice_id,
    action:       entry.action,
    performed_by: entry.performed_by ?? null,
    old_status:   entry.old_status   ?? null,
    new_status:   entry.new_status   ?? null,
    reason:       entry.reason        ?? null,
    metadata:     entry.metadata      ?? null,
  });
}

// ─── Quotation Audit ──────────────────────────────────────────────────────────

export async function logQuotationAction(
  supabase: SupabaseClient,
  entry:    QuotationAuditEntry,
): Promise<void> {
  await supabase.from('quotation_audit_log').insert({
    company_id:   entry.company_id,
    quotation_id: entry.quotation_id,
    action:       entry.action,
    performed_by: entry.performed_by ?? null,
    old_status:   entry.old_status   ?? null,
    new_status:   entry.new_status   ?? null,
    reason:       entry.reason        ?? null,
    metadata:     entry.metadata      ?? null,
  });
}

// ─── Payment Audit ────────────────────────────────────────────────────────────

export async function logPaymentAction(
  supabase: SupabaseClient,
  entry:    PaymentAuditEntry,
): Promise<void> {
  await supabase.from('payment_audit_log').insert({
    company_id:   entry.company_id,
    payment_id:   entry.payment_id,
    action:       entry.action,
    performed_by: entry.performed_by ?? null,
    old_status:   entry.old_status   ?? null,
    new_status:   entry.new_status   ?? null,
    reason:       entry.reason        ?? null,
    amount:       entry.amount        ?? null,
    metadata:     entry.metadata      ?? null,
  });
}
