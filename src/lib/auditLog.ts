import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  client_id:  string;
  changed_by: string | null;
  field_name: string;
  old_value:  string | null;
  new_value:  string | null;
};

export type InvoiceAuditEntry = {
  invoice_id:   string;
  action:       InvoiceAuditAction;
  performed_by: string | null;
  old_status?:  string | null;
  new_status?:  string | null;
  reason?:      string | null;
  metadata?:    Record<string, unknown>;
};

export type PaymentAuditEntry = {
  payment_id:   string;
  action:       PaymentAuditAction;
  performed_by: string | null;
  old_status?:  string | null;
  new_status?:  string | null;
  reason?:      string | null;
  amount?:      number | null;
  metadata?:    Record<string, unknown>;
};

// ─── Client Audit ─────────────────────────────────────────────────────────────

/**
 * Log one or more field changes on a client record.
 * Pass the old and new full client objects; only changed fields are logged.
 */
export async function logClientChanges(
  supabase:  SupabaseClient,
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
    invoice_id:   entry.invoice_id,
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
