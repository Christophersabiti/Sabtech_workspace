import { type ClassValue, clsx } from 'clsx';
import { format, parseISO } from 'date-fns';
import { InvoiceStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(' ');
}

export function formatCurrency(amount: number, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

export function generateClientCode(name: string, existingCodes: string[]): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  let code = `CLT-${base}`;
  let counter = 1;
  while (existingCodes.includes(code)) {
    code = `CLT-${base}${counter}`;
    counter++;
  }
  return code;
}

export function generateProjectCode(name: string, existingCodes: string[]): string {
  const base = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  const year = new Date().getFullYear();
  let code = `PRJ-${year}-${base}`;
  let counter = 1;
  while (existingCodes.includes(code)) {
    code = `PRJ-${year}-${base}${counter}`;
    counter++;
  }
  return code;
}

export const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-200 text-gray-500',
  void: 'bg-slate-100 text-slate-400',
};

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  void: 'Void',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  cash: 'Cash',
  cheque: 'Cheque',
  online: 'Online',
  other: 'Other',
};

export const BILLING_TYPE_LABELS: Record<string, string> = {
  single_invoice: 'Single Invoice',
  installment: 'Installment Plan',
  milestone: 'Milestone Billing',
  recurring: 'Recurring',
};

export function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  discountPercent: number
): number {
  return quantity * unitPrice * (1 - discountPercent / 100);
}
