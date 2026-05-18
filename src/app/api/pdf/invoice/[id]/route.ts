export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ─── Hardcoded fallbacks (used if DB tables not yet created) ─────────────────
const COMPANY_DEFAULTS = {
  name: 'Sabtech Online',
  email: 'info@sabtechonline.com',
  phone: '+256 777 293 933',
  address: 'Kasese, Uganda',
  website: 'www.sabtechonline.com',
  tin: '1009345230',
  footer_note: 'Thank you for your business. Payment is due within the specified due date. Late payments may attract additional charges.',
  primary_color: '#0f172a',
  accent_color: '#7c2cbf',
  logo_url: null as string | null,
  show_tin_on_invoice: true,
  show_logo_on_invoice: true,
  show_payment_history: true,
  default_invoice_footer: 'Thank you for your business.',
};

const PAYMENT_METHODS_FALLBACK = [
  {
    display_name: 'MTN Mobile Money',
    details: [
      { key: 'Number', value: '0777 293 933' },
      { key: 'Account Name', value: 'Christopher Sabiti' },
    ],
  },
  {
    display_name: 'MOMO Merchant',
    details: [
      { key: 'Merchant Code', value: '876997' },
      { key: 'Account Name', value: 'Christopher Sabiti' },
    ],
  },
  {
    display_name: 'Bank Transfer — Centenary Bank',
    details: [
      { key: 'Account Name', value: 'Christopher Sabiti' },
      { key: 'Account Number', value: '3200051550' },
      { key: 'Branch', value: 'Kasese' },
      { key: 'Bank', value: 'Centenary Bank Uganda' },
    ],
  },
];

type DBPaymentMethod = {
  display_name: string;
  account_name: string | null;
  account_number: string | null;
  phone_number: string | null;
  merchant_code: string | null;
  bank_name: string | null;
  branch: string | null;
  swift_code: string | null;
  instructions: string | null;
  method_type: string;
};

function buildPaymentDetails(m: DBPaymentMethod): { key: string; value: string }[] {
  const details: { key: string; value: string }[] = [];
  if (m.account_name)   details.push({ key: 'Account Name', value: m.account_name });
  if (m.phone_number)   details.push({ key: 'Phone', value: m.phone_number });
  if (m.merchant_code)  details.push({ key: 'Merchant Code', value: m.merchant_code });
  if (m.account_number) details.push({ key: 'Account No.', value: m.account_number });
  if (m.bank_name)      details.push({ key: 'Bank', value: m.bank_name + (m.branch ? ` · ${m.branch}` : '') });
  if (m.swift_code)     details.push({ key: 'SWIFT', value: m.swift_code });
  if (m.instructions)   details.push({ key: 'Note', value: m.instructions });
  return details;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function formatCurrency(amount: number, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ─── Logo inline SVG ─────────────────────────────────────────────────────────
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

async function requireAuth(): Promise<boolean> {
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
  return !!session;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAuth())) {
    return new NextResponse('Unauthorized — please log in to view this document', { status: 401 });
  }

  const { id } = await params;
  const isPrint = req.nextUrl.searchParams.get('print') === '1';
  const supabase = getSupabase();

  // ── Load company settings + payment methods from DB (with fallback) ────────
  const [
    { data: invoice }, { data: items }, { data: payments },
    { data: companySettingsRow }, { data: dbPaymentMethods },
  ] = await Promise.all([
    supabase
      .from('invoices')
      .select('*, client:clients(*), project:projects(project_name, project_code)')
      .eq('id', id)
      .single(),
    supabase
      .from('invoice_items')
      .select('*, service:services(service_name)')
      .eq('invoice_id', id)
      .order('sort_order'),
    supabase
      .from('payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date'),
    supabase.from('company_settings').select('*').eq('id', 1).single(),
    supabase.from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .eq('show_on_invoice', true)
      .order('display_order'),
  ]);

  if (!invoice) {
    return new NextResponse('Invoice not found', { status: 404 });
  }

  // ── Merge DB settings with fallbacks ───────────────────────────────────────
  const co = {
    name:          companySettingsRow?.company_name   ?? COMPANY_DEFAULTS.name,
    email:         companySettingsRow?.email           ?? COMPANY_DEFAULTS.email,
    phone:         companySettingsRow?.phone           ?? COMPANY_DEFAULTS.phone,
    address:       companySettingsRow?.address         ?? COMPANY_DEFAULTS.address,
    website:       companySettingsRow?.website         ?? COMPANY_DEFAULTS.website,
    tin:           companySettingsRow?.tin             ?? COMPANY_DEFAULTS.tin,
    footer_note:   companySettingsRow?.default_invoice_footer ?? COMPANY_DEFAULTS.footer_note,
    primary_color: companySettingsRow?.primary_color  ?? COMPANY_DEFAULTS.primary_color,
    accent_color:  companySettingsRow?.accent_color   ?? COMPANY_DEFAULTS.accent_color,
    logo_url:      companySettingsRow?.logo_url        ?? COMPANY_DEFAULTS.logo_url,
    show_tin:      companySettingsRow?.show_tin_on_invoice  ?? COMPANY_DEFAULTS.show_tin_on_invoice,
    show_logo:     companySettingsRow?.show_logo_on_invoice ?? COMPANY_DEFAULTS.show_logo_on_invoice,
    show_payments: companySettingsRow?.show_payment_history ?? COMPANY_DEFAULTS.show_payment_history,
  };

  // ── Build payment method cards from DB or fallback ─────────────────────────
  type PMCard = { display_name: string; details: { key: string; value: string }[] };
  const paymentMethodCards: PMCard[] = dbPaymentMethods && dbPaymentMethods.length > 0
    ? dbPaymentMethods.map((m: DBPaymentMethod) => ({
        display_name: m.display_name,
        details: buildPaymentDetails(m),
      }))
    : PAYMENT_METHODS_FALLBACK;

  const client = invoice.client as {
    name: string; company_name?: string; email?: string;
    phone?: string; address?: string; tin_number?: string;
  };
  const project = invoice.project as {
    project_name: string; project_code: string;
  } | null;

  const STATUS_COLORS: Record<string, string> = {
    draft: '#64748b', sent: '#2563eb', partially_paid: '#d97706',
    paid: '#16a34a', overdue: '#dc2626', cancelled: '#94a3b8',
  };
  const STATUS_LABELS: Record<string, string> = {
    draft: 'DRAFT', sent: 'SENT', partially_paid: 'PARTIALLY PAID',
    paid: 'PAID', overdue: 'OVERDUE', cancelled: 'CANCELLED',
  };

  const statusColor = STATUS_COLORS[invoice.status] || '#64748b';
  const statusLabel = STATUS_LABELS[invoice.status] || invoice.status.toUpperCase();

  // ── Line items ─────────────────────────────────────────────────────────────
  const lineItemsHtml = (items || []).map((item: {
    item_name: string; description?: string; quantity: number;
    unit_price: number; discount_percent: number; tax_percent: number;
    line_total: number; service?: { service_name: string };
  }) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#94a3b8">${item.service?.service_name || '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
        <strong style="color:#0f172a">${item.item_name}</strong>
        ${item.description ? `<br><span style="font-size:11px;color:#94a3b8">${item.description}</span>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right">${formatCurrency(item.unit_price, invoice.currency)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b">${item.discount_percent}%</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center;color:#64748b">${item.tax_percent}%</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a">${formatCurrency(item.line_total, invoice.currency)}</td>
    </tr>`).join('');

  // ── Payment history ────────────────────────────────────────────────────────
  const paymentsHtml = (payments && payments.length > 0) ? `
    <div style="margin-bottom:28px">
      <h3 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px">Payment History</h3>
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
          ${(payments || []).map((p: {
            payment_number: string; payment_date: string;
            payment_method: string; reference_number?: string; amount_paid: number;
          }) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#475569">${p.payment_number}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px">${formatDate(p.payment_date)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px;text-transform:capitalize">${p.payment_method.replace(/_/g, ' ')}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#94a3b8">${p.reference_number || '—'}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#16a34a">${formatCurrency(p.amount_paid, invoice.currency)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  // ── Payment methods block (from DB or fallback) ───────────────────────────
  const paymentMethodCardsHtml = paymentMethodCards.map((m: PMCard) => `
    <div style="flex:1;min-width:160px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px">
      <div style="font-size:11px;font-weight:700;color:${co.primary_color};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0">${m.display_name}</div>
      ${m.details.map((d: { key: string; value: string }) => `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:3px">
          <span style="color:#64748b">${d.key}:</span>
          <span style="font-weight:700;color:#0f172a;font-family:monospace">${d.value}</span>
        </div>`).join('')}
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${invoice.invoice_number} — ${co.name}</title>
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

  <!-- Print Button (hidden when printing) -->
  <div class="no-print" style="text-align:right;margin-bottom:20px;display:flex;justify-content:flex-end;gap:10px">
    <a href="javascript:history.back()" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;color:#475569;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none">
      ← Back
    </a>
    <button onclick="window.print()"
      style="display:inline-flex;align-items:center;gap:6px;background:${co.primary_color};color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      ⬇ Download PDF
    </button>
  </div>

  <!-- ══ INVOICE DOCUMENT ═════════════════════════════════════════════════════ -->

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid ${co.primary_color}">
    <div style="display:flex;align-items:center;gap:16px">
      ${co.show_logo && co.logo_url ? `<img src="${co.logo_url}" alt="Logo" style="width:60px;height:60px;object-fit:contain;flex-shrink:0"/>` : LOGO_SVG}
      <div>
        <div style="font-size:22px;font-weight:800;color:${co.primary_color};letter-spacing:-0.5px">${co.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${co.email} · ${co.phone}</div>
        <div style="font-size:11px;color:#64748b">${co.address} · ${co.website}</div>
        ${co.show_tin && co.tin ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="color:${co.primary_color};font-family:monospace">${co.tin}</strong></div>` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:900;color:${co.primary_color};letter-spacing:-1px">INVOICE</div>
      <div style="font-size:17px;font-weight:700;font-family:monospace;color:${co.primary_color};margin-top:4px">${invoice.invoice_number}</div>
      <div>
        <span style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.06em;color:#fff;background:${statusColor}">
          ${statusLabel}
        </span>
      </div>
      <div style="margin-top:10px;font-size:12px;color:#64748b">Issue Date: <strong style="color:#0f172a">${formatDate(invoice.issue_date)}</strong></div>
      ${invoice.due_date ? `<div style="font-size:12px;color:#64748b">Due Date: <strong style="color:${invoice.balance_due > 0 ? '#dc2626' : '#0f172a'}">${formatDate(invoice.due_date)}</strong></div>` : ''}
      <div style="font-size:12px;color:#64748b">Currency: <strong style="color:#0f172a">${invoice.currency}</strong></div>
    </div>
  </div>

  <!-- Billed To / From / Project -->
  <div style="display:flex;gap:32px;margin-bottom:32px">
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Billed To</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${client.name}</div>
      ${client.company_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">${client.company_name}</div>` : ''}
      ${client.email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${client.email}</div>` : ''}
      ${client.phone ? `<div style="font-size:12px;color:#64748b">${client.phone}</div>` : ''}
      ${client.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px;white-space:pre-line">${client.address}</div>` : ''}
      ${client.tin_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="font-family:monospace">${client.tin_number}</strong></div>` : ''}
    </div>
    ${project ? `
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Project</div>
      <div style="font-size:14px;font-weight:700;color:#0f172a">${project.project_name}</div>
      <div style="font-size:12px;color:#64748b;font-family:monospace;margin-top:2px">${project.project_code}</div>
    </div>` : ''}
  </div>

  <!-- Line Items -->
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

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:32px">
    <div style="width:320px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#64748b">Subtotal</span>
        <span style="font-weight:500">${formatCurrency(invoice.subtotal, invoice.currency)}</span>
      </div>
      ${invoice.discount_amount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#16a34a">Discount</span>
        <span style="font-weight:500;color:#16a34a">−${formatCurrency(invoice.discount_amount, invoice.currency)}</span>
      </div>` : ''}
      ${invoice.tax_amount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
        <span style="color:#64748b">Tax (VAT)</span>
        <span style="font-weight:500">${formatCurrency(invoice.tax_amount, invoice.currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #0f172a;margin-top:6px;font-size:16px;font-weight:700">
        <span>Invoice Total</span>
        <span>${formatCurrency(invoice.total_amount, invoice.currency)}</span>
      </div>
      ${invoice.total_paid > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#16a34a">
        <span style="font-weight:600">Amount Paid</span>
        <span style="font-weight:700">${formatCurrency(invoice.total_paid, invoice.currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:12px 16px;border-radius:10px;margin-top:8px;background:${invoice.balance_due > 0 ? '#fffbeb' : '#f0fdf4'};font-size:16px;font-weight:700">
        <span style="color:${invoice.balance_due > 0 ? '#b45309' : '#15803d'}">Balance Due</span>
        <span style="color:${invoice.balance_due > 0 ? '#b45309' : '#15803d'}">${formatCurrency(invoice.balance_due, invoice.currency)}</span>
      </div>
    </div>
  </div>

  <!-- Payment History -->
  ${paymentsHtml}

  <!-- Payment Instructions -->
  <div style="margin-bottom:32px;padding:20px;background:${co.accent_color}10;border:1px solid ${co.accent_color}40;border-radius:12px;border-left:4px solid ${co.accent_color}">
    <h3 style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${co.accent_color};margin-bottom:16px">
      💳 Payment Instructions
    </h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px">
      ${paymentMethodCardsHtml}
    </div>
    <div style="font-size:11px;color:#475569;line-height:1.7;padding-top:12px;border-top:1px solid ${co.accent_color}30">
      Please include <strong style="font-family:monospace">${invoice.invoice_number}</strong> as the payment reference.
      Send proof of payment to <strong>${co.email}</strong> or call <strong>${co.phone}</strong>.
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
    <div style="max-width:520px">
      <p style="font-size:11px;color:#475569;line-height:1.7;margin-bottom:6px">
        ${invoice.footer_note || co.footer_note}
      </p>
      <p style="font-size:10px;color:#94a3b8">
        ${co.show_tin && co.tin ? `TIN: ${co.tin} · ` : ''}${co.name} · ${co.website}
      </p>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <p style="font-size:10px;color:#94a3b8">Document generated</p>
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
