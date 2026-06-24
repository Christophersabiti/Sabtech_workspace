export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireTenantEntityAccess } from '@/lib/authz';
import { EntitlementError, assertFeatureEntitlement } from '@/lib/entitlements';

const COMPANY_DEFAULTS = {
  name: 'Sabtech Online',
  email: 'info@sabtechonline.com',
  phone: '+256 777 293 933',
  address: 'Kasese, Uganda',
  website: 'www.sabtechonline.com',
  tin: '1009345230',
  footer_note: 'Thank you for your business.',
  primary_color: '#0f172a',
  accent_color: '#7c2cbf',
  logo_url: null as string | null,
  show_tin_on_invoice: true,
  show_logo_on_invoice: true,
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  mobile_money: 'Mobile Money',
  cash: 'Cash',
  cheque: 'Cheque',
  online: 'Online',
  other: 'Other',
};

const PAYMENT_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'PENDING', color: '#d97706' },
  confirmed: { label: 'CONFIRMED', color: '#16a34a' },
  failed: { label: 'FAILED', color: '#dc2626' },
  reversed: { label: 'REVERSED', color: '#64748b' },
};

type DBClient = {
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tin_number: string | null;
};

type DBProject = {
  project_name: string;
  project_code: string;
};

type DBInvoice = {
  id: string;
  invoice_number: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  total_paid: number | string;
  balance_due: number | string;
  status: string;
  footer_note: string | null;
  apply_wht: boolean;
  wht_rate: number | string;
  wht_amount: number | string;
  net_payable_amount: number | string;
  ura_wht_certificate_number: string | null;
  client: DBClient | null;
  project: DBProject | null;
};

type DBPayment = {
  id: string;
  company_id: string;
  payment_number: string;
  invoice_id: string;
  payment_date: string;
  amount_paid: number | string;
  actual_received: number | string | null;
  wht_withheld: number | string | null;
  payment_method: string;
  reference_number: string | null;
  note: string | null;
  is_confirmed: boolean;
  status: string;
  reversal_reason: string | null;
  created_at: string;
  wht_certificate_number: string | null;
  invoice: DBInvoice | null;
};

type DBInvoiceItem = {
  item_name: string;
  description: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount_percent: number | string;
  tax_percent: number | string;
  line_total: number | string;
  service: { service_name: string } | null;
};

type DBPaymentHistory = {
  id: string;
  payment_number: string;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  amount_paid: number | string;
};

type DBCompanySettings = {
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  tin: string | null;
  default_invoice_footer: string | null;
  primary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  show_tin_on_invoice: boolean | null;
  show_logo_on_invoice: boolean | null;
};

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" style="height:60px;width:60px;flex-shrink:0">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#e01c5a"/>
      <stop offset="50%" stop-color="#8b35c1"/>
      <stop offset="100%" stop-color="#7c2cbf"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="96" stroke="url(#g1)" stroke-width="8" fill="none"/>
  <circle cx="100" cy="100" r="80" stroke="url(#g1)" stroke-width="4" fill="none"/>
  <text x="22" y="130" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="90" font-weight="900" fill="url(#g1)">S</text>
  <text x="62" y="132" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="90" font-weight="900" fill="url(#g1)">A</text>
  <text x="118" y="132" font-family="Arial Black,Helvetica Neue,sans-serif" font-size="90" font-weight="900" fill="url(#g1)">B</text>
</svg>`;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(amount: number | string | null | undefined, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(toNumber(amount));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatQuantity(value: number | string): string {
  const amount = toNumber(value);
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function multiline(value: string | null | undefined): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

function paymentMethodLabel(value: string): string {
  return PAYMENT_METHOD_LABELS[value] ?? value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTenantEntityAccess('payments', id);
  if (!access.ok) {
    return new NextResponse(access.message, { status: access.status });
  }

  const supabase = getSupabase();

  try {
    await assertFeatureEntitlement(supabase, access.authUserId, access.companyId, 'reports.export');
  } catch (error) {
    if (error instanceof EntitlementError) {
      return new NextResponse(error.message, { status: error.status });
    }
    throw error;
  }

  const [{ data: paymentRow }, { data: companySettingsRow }] = await Promise.all([
    supabase
      .from('payments')
      .select('*, invoice:invoices(*, client:clients(*), project:projects(project_name, project_code))')
      .eq('id', id)
      .eq('company_id', access.companyId)
      .maybeSingle(),
    supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', access.companyId)
      .maybeSingle(),
  ]);

  const payment = paymentRow as DBPayment | null;
  const companySettings = companySettingsRow as DBCompanySettings | null;

  if (!payment || !payment.invoice) {
    return new NextResponse('Receipt not found', { status: 404 });
  }

  const [{ data: itemRows }, { data: paymentHistoryRows }] = await Promise.all([
    supabase
      .from('invoice_items')
      .select('*, service:services(service_name)')
      .eq('invoice_id', payment.invoice_id)
      .eq('company_id', access.companyId)
      .order('sort_order'),
    supabase
      .from('payments')
      .select('id, payment_number, payment_date, payment_method, reference_number, amount_paid')
      .eq('invoice_id', payment.invoice_id)
      .eq('company_id', access.companyId)
      .eq('is_confirmed', true)
      .neq('status', 'reversed')
      .order('payment_date'),
  ]);

  const invoice = payment.invoice;
  const client = invoice.client;
  const project = invoice.project;
  const items = (itemRows || []) as DBInvoiceItem[];
  const paymentHistory = (paymentHistoryRows || []) as DBPaymentHistory[];
  const currency = invoice.currency || 'UGX';
  const isPrint = req.nextUrl.searchParams.get('print') === '1';

  const co = {
    name: companySettings?.company_name ?? COMPANY_DEFAULTS.name,
    email: companySettings?.email ?? COMPANY_DEFAULTS.email,
    phone: companySettings?.phone ?? COMPANY_DEFAULTS.phone,
    address: companySettings?.address ?? COMPANY_DEFAULTS.address,
    website: companySettings?.website ?? COMPANY_DEFAULTS.website,
    tin: companySettings?.tin ?? COMPANY_DEFAULTS.tin,
    footer_note: companySettings?.default_invoice_footer ?? COMPANY_DEFAULTS.footer_note,
    primary_color: companySettings?.primary_color ?? COMPANY_DEFAULTS.primary_color,
    accent_color: companySettings?.accent_color ?? COMPANY_DEFAULTS.accent_color,
    logo_url: companySettings?.logo_url ?? COMPANY_DEFAULTS.logo_url,
    show_tin: companySettings?.show_tin_on_invoice ?? COMPANY_DEFAULTS.show_tin_on_invoice,
    show_logo: companySettings?.show_logo_on_invoice ?? COMPANY_DEFAULTS.show_logo_on_invoice,
  };

  const statusMeta = PAYMENT_STATUS_META[payment.status] ?? PAYMENT_STATUS_META.pending;
  const paymentAmount = toNumber(payment.amount_paid);
  const actualReceived = payment.actual_received === null ? paymentAmount : toNumber(payment.actual_received);
  const whtWithheld = toNumber(payment.wht_withheld);

  const lineItemsHtml = items.map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#94a3b8">${escapeHtml(item.service?.service_name || '-')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
        <strong style="color:#0f172a">${escapeHtml(item.item_name)}</strong>
        ${item.description ? `<br/><span style="font-size:11px;color:#94a3b8">${escapeHtml(item.description)}</span>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${formatQuantity(item.quantity)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${formatCurrency(item.unit_price, currency)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b">${toNumber(item.discount_percent)}%</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b">${toNumber(item.tax_percent)}%</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a">${formatCurrency(item.line_total, currency)}</td>
    </tr>`).join('');

  const paymentHistoryHtml = paymentHistory.length > 0 ? `
    <div style="margin-bottom:28px">
      <h3 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px">Confirmed Payments On This Invoice</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f8fafc">
            <th style="text-align:left;font-size:10px;color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">Receipt #</th>
            <th style="text-align:left;font-size:10px;color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">Date</th>
            <th style="text-align:left;font-size:10px;color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">Method</th>
            <th style="text-align:left;font-size:10px;color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">Reference</th>
            <th style="text-align:right;font-size:10px;color:#64748b;padding:8px 12px;border-bottom:1px solid #e2e8f0">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${paymentHistory.map(p => `
            <tr style="${p.id === payment.id ? `background:${co.accent_color}12` : ''}">
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#475569">${escapeHtml(p.payment_number)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px">${formatDate(p.payment_date)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px">${escapeHtml(paymentMethodLabel(p.payment_method))}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#94a3b8">${escapeHtml(p.reference_number || '-')}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#16a34a">${formatCurrency(p.amount_paid, currency)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const whtDetailsHtml = invoice.apply_wht || whtWithheld > 0 ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">Supplier Received</div>
        <div style="font-size:16px;font-weight:800;color:#0f172a">${formatCurrency(actualReceived, currency)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">WHT Withheld</div>
        <div style="font-size:16px;font-weight:800;color:#b45309">${formatCurrency(whtWithheld, currency)}</div>
      </div>
      ${payment.wht_certificate_number ? `
        <div style="grid-column:1 / -1;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">WHT Certificate</div>
          <div style="font-size:12px;font-family:monospace;font-weight:700;color:#0f172a">${escapeHtml(payment.wht_certificate_number)}</div>
        </div>` : ''}
    </div>` : '';

  const reversedNoticeHtml = payment.status === 'reversed' ? `
    <div style="margin-bottom:24px;padding:14px 16px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:12px;line-height:1.6">
      <strong>This payment has been reversed.</strong>
      ${payment.reversal_reason ? ` Reason: ${escapeHtml(payment.reversal_reason)}` : ''}
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${escapeHtml(payment.payment_number)} - Receipt - ${escapeHtml(co.name)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      font-size:13px;color:#0f172a;background:#fff;padding:40px;max-width:900px;margin:0 auto
    }
    @media print{
      body{padding:0;max-width:100%}
      .no-print{display:none!important}
      @page{margin:1.2cm;size:A4}
    }
  </style>
  ${isPrint ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},400);})</script>` : ''}
</head>
<body>

  <div class="no-print" style="text-align:right;margin-bottom:20px;display:flex;justify-content:flex-end;gap:10px">
    <a href="javascript:history.back()" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;color:#475569;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none">
      Back
    </a>
    <button onclick="window.print()"
      style="display:inline-flex;align-items:center;gap:6px;background:${co.primary_color};color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print Receipt
    </button>
  </div>

  ${reversedNoticeHtml}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid ${co.primary_color}">
    <div style="display:flex;align-items:center;gap:16px">
      ${co.show_logo && co.logo_url ? `<img src="${escapeHtml(co.logo_url)}" alt="Logo" style="width:60px;height:60px;object-fit:contain;flex-shrink:0"/>` : LOGO_SVG}
      <div>
        <div style="font-size:22px;font-weight:800;color:${co.primary_color};letter-spacing:-0.5px">${escapeHtml(co.name)}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${escapeHtml(co.email)} - ${escapeHtml(co.phone)}</div>
        <div style="font-size:11px;color:#64748b">${escapeHtml(co.address)} - ${escapeHtml(co.website)}</div>
        ${co.show_tin && co.tin ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="color:${co.primary_color};font-family:monospace">${escapeHtml(co.tin)}</strong></div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:900;color:${co.primary_color};letter-spacing:-1px">RECEIPT</div>
      <div style="font-size:17px;font-weight:700;font-family:monospace;color:${co.primary_color};margin-top:4px">${escapeHtml(payment.payment_number)}</div>
      <div>
        <span style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:#fff;background:${statusMeta.color}">
          ${statusMeta.label}
        </span>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#64748b">Payment Date: <strong style="color:#0f172a">${formatDate(payment.payment_date)}</strong></div>
      <div style="font-size:12px;color:#64748b">Invoice: <strong style="color:#0f172a;font-family:monospace">${escapeHtml(invoice.invoice_number)}</strong></div>
      <div style="font-size:12px;color:#64748b">Currency: <strong style="color:#0f172a">${escapeHtml(currency)}</strong></div>
    </div>
  </div>

  <div style="display:flex;gap:32px;margin-bottom:32px">
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Received From</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(client?.name || '-')}</div>
      ${client?.company_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">${escapeHtml(client.company_name)}</div>` : ''}
      ${client?.email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escapeHtml(client.email)}</div>` : ''}
      ${client?.phone ? `<div style="font-size:12px;color:#64748b">${escapeHtml(client.phone)}</div>` : ''}
      ${client?.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px;line-height:1.5">${multiline(client.address)}</div>` : ''}
      ${client?.tin_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="font-family:monospace">${escapeHtml(client.tin_number)}</strong></div>` : ''}
    </div>
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Invoice Details</div>
      <div style="font-size:14px;font-weight:700;color:#0f172a;font-family:monospace">${escapeHtml(invoice.invoice_number)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px">Issue Date: <strong style="color:#0f172a">${formatDate(invoice.issue_date)}</strong></div>
      ${invoice.due_date ? `<div style="font-size:12px;color:#64748b">Due Date: <strong style="color:#0f172a">${formatDate(invoice.due_date)}</strong></div>` : ''}
      ${project ? `
        <div style="margin-top:12px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">Project</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a">${escapeHtml(project.project_name)}</div>
          <div style="font-size:12px;color:#64748b;font-family:monospace;margin-top:2px">${escapeHtml(project.project_code)}</div>
        </div>` : ''}
    </div>
  </div>

  <div style="margin-bottom:28px;padding:20px;background:${co.accent_color}10;border:1px solid ${co.accent_color}40;border-radius:12px;border-left:4px solid ${co.accent_color}">
    <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${co.accent_color};margin-bottom:16px">Payment Confirmation</h3>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">Receipt Number</div>
        <div style="font-size:12px;font-family:monospace;font-weight:800;color:#0f172a">${escapeHtml(payment.payment_number)}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">Method</div>
        <div style="font-size:13px;font-weight:800;color:#0f172a">${escapeHtml(paymentMethodLabel(payment.payment_method))}</div>
      </div>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:4px">Reference</div>
        <div style="font-size:12px;font-family:monospace;font-weight:800;color:#0f172a">${escapeHtml(payment.reference_number || '-')}</div>
      </div>
    </div>
    <div style="margin-top:14px;padding:16px;border-radius:10px;background:#ecfdf5;border:1px solid #bbf7d0;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:800">Amount Confirmed</div>
        <div style="font-size:12px;color:#475569;margin-top:4px">Applied to invoice ${escapeHtml(invoice.invoice_number)}</div>
      </div>
      <div style="font-size:24px;font-weight:900;color:#15803d">${formatCurrency(paymentAmount, currency)}</div>
    </div>
    ${whtDetailsHtml}
    ${payment.note ? `<div style="font-size:12px;color:#475569;line-height:1.6;margin-top:12px;padding-top:12px;border-top:1px solid ${co.accent_color}30"><strong>Note:</strong> ${escapeHtml(payment.note)}</div>` : ''}
  </div>

  <div style="margin-bottom:28px">
    <h3 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px">Invoice Items</h3>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Service</th>
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Description</th>
          <th style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Qty</th>
          <th style="text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Unit Price</th>
          <th style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Disc%</th>
          <th style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Tax%</th>
          <th style="text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml || `<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">No items on this invoice</td></tr>`}
      </tbody>
    </table>
  </div>

  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <div style="width:340px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#64748b">Subtotal</span>
        <span style="font-weight:500">${formatCurrency(invoice.subtotal, currency)}</span>
      </div>
      ${toNumber(invoice.discount_amount) > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#16a34a">Discount</span>
        <span style="font-weight:500;color:#16a34a">-${formatCurrency(invoice.discount_amount, currency)}</span>
      </div>` : ''}
      ${toNumber(invoice.tax_amount) > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#64748b">Tax (VAT)</span>
        <span style="font-weight:500">${formatCurrency(invoice.tax_amount, currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #0f172a;margin-top:6px;font-size:16px;font-weight:700">
        <span>Invoice Total</span>
        <span>${formatCurrency(invoice.total_amount, currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#16a34a">
        <span style="font-weight:600">This Receipt</span>
        <span style="font-weight:700">${formatCurrency(paymentAmount, currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#16a34a">
        <span style="font-weight:600">Total Paid On Invoice</span>
        <span style="font-weight:700">${formatCurrency(invoice.total_paid, currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 16px;border-radius:10px;margin-top:8px;background:${toNumber(invoice.balance_due) > 0 ? '#fffbeb' : '#f0fdf4'};font-size:16px;font-weight:700">
        <span style="color:${toNumber(invoice.balance_due) > 0 ? '#b45309' : '#15803d'}">Current Balance Due</span>
        <span style="color:${toNumber(invoice.balance_due) > 0 ? '#b45309' : '#15803d'}">${formatCurrency(invoice.balance_due, currency)}</span>
      </div>
    </div>
  </div>

  ${paymentHistoryHtml}

  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
    <div style="max-width:520px">
      <p style="font-size:11px;color:#475569;line-height:1.7;margin-bottom:6px">
        ${escapeHtml(invoice.footer_note || co.footer_note)}
      </p>
      <p style="font-size:10px;color:#94a3b8">
        ${co.show_tin && co.tin ? `TIN: ${escapeHtml(co.tin)} - ` : ''}${escapeHtml(co.name)} - ${escapeHtml(co.website)}
      </p>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <p style="font-size:10px;color:#94a3b8">Receipt generated</p>
      <p style="font-size:11px;color:#64748b;font-weight:600">
        ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </p>
      <p style="font-size:10px;color:#c4b5fd;margin-top:4px">Powered by Sabtech Online</p>
    </div>
  </div>

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
