import type { InvoiceStatus } from '@/types';

/**
 * Recalculate the correct invoice status after a payment change.
 *
 * Rules:
 *  1. If balance_due <= 0                   → 'paid'
 *  2. If total_paid > 0 but balance remains  → 'partially_paid'
 *  3. If unpaid and past due_date            → 'overdue'
 *  4. Otherwise                              → 'sent'
 *
 * Never transitions into 'draft', 'void', or 'cancelled' —
 * those are set explicitly by user actions.
 */
export function recalculateInvoiceStatus(
  totalPaid:  number,
  balanceDue: number,
  dueDate:    string | null,
): InvoiceStatus {
  if (balanceDue <= 0) return 'paid';
  if (totalPaid  >  0) return 'partially_paid';
  if (dueDate && new Date(dueDate) < new Date()) return 'overdue';
  return 'sent';
}

/**
 * Format a currency amount for display.
 * e.g. formatCurrency(1234567.5, 'UGX') → 'UGX 1,234,568'
 */
export function formatCurrency(amount: number, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-UG', {
    style:    'currency',
    currency,
    minimumFractionDigits: currency === 'UGX' ? 0 : 2,
    maximumFractionDigits: currency === 'UGX' ? 0 : 2,
  }).format(amount);
}

/**
 * Returns true if this invoice status prevents new payments being applied.
 */
export function isInvoiceLocked(status: InvoiceStatus): boolean {
  return status === 'void' || status === 'cancelled' || status === 'paid';
}

/**
 * Returns true if the invoice can be voided.
 * Draft invoices are deleted, not voided.
 */
export function canVoidInvoice(status: InvoiceStatus): boolean {
  return !['draft', 'void', 'cancelled'].includes(status);
}

/**
 * Badge colour class for a given invoice status.
 */
export function invoiceStatusColor(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    draft:          'bg-slate-100 text-slate-600',
    sent:           'bg-blue-100 text-blue-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    paid:           'bg-green-100 text-green-700',
    overdue:        'bg-red-100 text-red-700',
    cancelled:      'bg-slate-100 text-slate-400',
    void:           'bg-red-200 text-red-800',
  };
  return map[status] ?? 'bg-slate-100 text-slate-600';
}
