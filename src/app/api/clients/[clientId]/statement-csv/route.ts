export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireTenantEntityAccess } from '@/lib/authz';
import { assertFeatureEntitlement, EntitlementError } from '@/lib/entitlements';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth(): Promise<string | null> {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()     { return cookieStore.getAll(); },
        setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
  const { data: { session } } = await authClient.auth.getSession();
  return session?.user.id ?? null;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  // Escape double-quotes and wrap in quotes if the value contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(',');
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partially_paid: 'Partially Paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled', void: 'Void',
  migrated: 'Migrated',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', mobile_money: 'Mobile Money',
  cash: 'Cash', cheque: 'Cheque', online: 'Online', other: 'Other',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const authUserId = await requireAuth();
  if (!authUserId) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { clientId } = await params;
  const access = await requireTenantEntityAccess('clients', clientId);
  if (!access.ok) {
    return new NextResponse(access.message, { status: access.status });
  }

  const supabase = getSupabase();

  try {
    await assertFeatureEntitlement(supabase, authUserId, access.companyId, 'reports.export');
  } catch (error) {
    if (error instanceof EntitlementError) {
      return new NextResponse(error.message, { status: error.status });
    }
    throw error;
  }

  // ── Fetch client ─────────────────────────────────────────────────────────────
  const { data: clientRow } = await supabase
    .from('clients')
    .select('name, company_name, currency')
    .eq('id', clientId)
    .eq('company_id', access.companyId)
    .single();

  if (!clientRow) {
    return new NextResponse('Client not found', { status: 404 });
  }

  // ── Fetch invoices ────────────────────────────────────────────────────────────
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, issue_date, due_date, total_amount, total_paid, balance_due, status, currency, project:projects(project_name)')
    .eq('client_id', clientId)
    .eq('company_id', access.companyId)
    .not('status', 'in', '("void","cancelled")')
    .order('issue_date', { ascending: true });

  const invoices = invoiceRows || [];
  if (invoices.length === 0) {
    // Return empty CSV with just headers
    const headers = buildHeaders();
    return new NextResponse(headers + '\n', csvResponseInit(clientRow.name));
  }

  const invoiceIds = invoices.map((i: { id: string }) => i.id);

  // ── Fetch line items and payments in parallel ─────────────────────────────────
  const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
    supabase
      .from('invoice_items')
      .select('invoice_id, item_name, description, quantity, unit_price, discount_percent, tax_percent, line_total, sort_order')
      .in('invoice_id', invoiceIds)
      .order('invoice_id')
      .order('sort_order'),
    supabase
      .from('payments')
      .select('invoice_id, payment_date, amount_paid, payment_method, reference_number, status')
      .in('invoice_id', invoiceIds)
      .neq('status', 'reversed')
      .order('payment_date', { ascending: true }),
  ]);

  // Index items and payments by invoice_id
  const itemsByInvoice = groupBy(itemRows || [], 'invoice_id');
  const paymentsByInvoice = groupBy(paymentRows || [], 'invoice_id');

  // ── Build CSV rows ────────────────────────────────────────────────────────────
  const lines: string[] = [buildHeaders()];

  for (const inv of invoices) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = Array.isArray((inv as any).project) ? (inv as any).project[0]?.project_name : (inv as any).project?.project_name ?? '';
    const items = itemsByInvoice[inv.id] || [];
    const payments = paymentsByInvoice[inv.id] || [];

    // Summarise payments for this invoice
    const lastPayment = payments.length > 0 ? payments[payments.length - 1] : null;
    const allPaymentDates = payments.map((p: { payment_date: string }) => fmtDate(p.payment_date)).join('; ');
    const allPaymentMethods = payments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method)
      .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
      .join('; ');
    const allPaymentRefs = payments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.reference_number ?? '')
      .filter(Boolean)
      .join('; ');

    if (items.length === 0) {
      // Invoice with no stored line items — emit one row with blank item columns
      lines.push(csvRow([
        inv.invoice_number,
        fmtDate(inv.issue_date),
        fmtDate(inv.due_date),
        project,
        STATUS_LABELS[inv.status] ?? inv.status,
        inv.currency,
        '', '', '', '', '', '', '',         // item columns blank
        inv.total_amount,
        inv.total_paid,
        inv.balance_due,
        allPaymentDates || (lastPayment ? fmtDate(lastPayment.payment_date) : ''),
        allPaymentMethods,
        allPaymentRefs,
      ]));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of items as any[]) {
        lines.push(csvRow([
          inv.invoice_number,
          fmtDate(inv.issue_date),
          fmtDate(inv.due_date),
          project,
          STATUS_LABELS[inv.status] ?? inv.status,
          inv.currency,
          item.item_name,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_percent,
          item.tax_percent,
          item.line_total,
          inv.total_amount,
          inv.total_paid,
          inv.balance_due,
          allPaymentDates || (lastPayment ? fmtDate(lastPayment.payment_date) : ''),
          allPaymentMethods,
          allPaymentRefs,
        ]));
      }
    }
  }

  const csv = lines.join('\r\n');
  return new NextResponse(csv, csvResponseInit(clientRow.name));
}

function buildHeaders(): string {
  return csvRow([
    'Invoice Number',
    'Issue Date',
    'Due Date',
    'Project',
    'Status',
    'Currency',
    'Item Name',
    'Description',
    'Quantity',
    'Unit Price',
    'Disc %',
    'Tax %',
    'Line Total',
    'Invoice Total',
    'Total Paid',
    'Balance Due',
    'Payment Date(s)',
    'Payment Method(s)',
    'Payment Reference(s)',
  ]);
}

function csvResponseInit(clientName: string) {
  const safe = clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  return {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="statement_${safe}_${date}.csv"`,
    },
  };
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
