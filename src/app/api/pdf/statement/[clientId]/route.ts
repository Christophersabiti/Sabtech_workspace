export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ─── Company fallbacks ────────────────────────────────────────────────────────
const COMPANY_DEFAULTS = {
  name:          'Sabtech Online',
  email:         'info@sabtechonline.com',
  phone:         '+256 777 293 933',
  address:       'Kasese, Uganda',
  website:       'www.sabtechonline.com',
  tin:           '1009345230',
  primary_color: '#0f172a',
  accent_color:  '#7c2cbf',
  logo_url:      null as string | null,
  show_tin:      true,
  show_logo:     true,
};

// ─── Inline logo SVG (matches invoice route) ──────────────────────────────────
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" style="height:56px;width:56px;flex-shrink:0">
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

function fmt(amount: number, currency = 'UGX'): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partially_paid: 'Partially Paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled', void: 'Void',
};
const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b', sent: '#2563eb', partially_paid: '#d97706',
  paid: '#16a34a', overdue: '#dc2626', cancelled: '#94a3b8', void: '#94a3b8',
};
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer', mobile_money: 'Mobile Money',
  cash: 'Cash', cheque: 'Cheque', online: 'Online', other: 'Other',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type DBClient = {
  id: string; client_code: string; name: string; company_name: string | null;
  contact_person: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; country: string | null;
  tin_number: string | null; currency: string; status: string;
};
type DBInvoice = {
  id: string; invoice_number: string; issue_date: string; due_date: string | null;
  total_amount: number; total_paid: number; balance_due: number;
  status: string; currency: string; notes: string | null;
  project: { project_name: string; project_code: string } | null;
};
type DBPayment = {
  id: string; payment_number: string; payment_date: string;
  invoice_id: string; amount_paid: number; payment_method: string;
  reference_number: string | null; status: string;
  invoice: { invoice_number: string } | null;
};

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
  { params }: { params: Promise<{ clientId: string }> },
) {
  if (!(await requireAuth())) {
    return new NextResponse('Unauthorized — please log in to view this document', { status: 401 });
  }

  const { clientId } = await params;
  const isPrint = req.nextUrl.searchParams.get('print') === '1';
  const supabase = getSupabase();

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [
    { data: clientRow },
    { data: invoiceRows },
    { data: paymentRows },
    { data: companyRow },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase
      .from('invoices')
      .select('*, project:projects(project_name, project_code)')
      .eq('client_id', clientId)
      .not('status', 'in', '("void","cancelled")')
      .order('issue_date', { ascending: true }),
    supabase
      .from('payments')
      .select('*, invoice:invoices(invoice_number)')
      .in('invoice_id',
        // sub-select IDs for this client — done via a follow-up if needed
        // For simplicity: fetch all payments then filter in-process
        // But we can't easily do a sub-select in the JS client, so we handle below
        [clientId] // placeholder — replaced below
      )
      .neq('status', 'reversed')
      .order('payment_date', { ascending: true }),
    supabase.from('company_settings').select('*').eq('id', 1).single(),
  ]);

  if (!clientRow) {
    return new NextResponse('Client not found', { status: 404 });
  }

  const client = clientRow as DBClient;
  const invoices = (invoiceRows || []) as DBInvoice[];

  // ── Fetch payments properly (via invoice_id IN list) ───────────────────────
  let payments: DBPayment[] = [];
  if (invoices.length > 0) {
    const invoiceIds = invoices.map(i => i.id);
    const { data: realPayments } = await supabase
      .from('payments')
      .select('*, invoice:invoices(invoice_number)')
      .in('invoice_id', invoiceIds)
      .neq('status', 'reversed')
      .order('payment_date', { ascending: true });
    payments = (realPayments || []) as DBPayment[];
  }

  // ── Merge company settings ─────────────────────────────────────────────────
  const co = {
    name:          companyRow?.company_name   ?? COMPANY_DEFAULTS.name,
    email:         companyRow?.email           ?? COMPANY_DEFAULTS.email,
    phone:         companyRow?.phone           ?? COMPANY_DEFAULTS.phone,
    address:       companyRow?.address         ?? COMPANY_DEFAULTS.address,
    website:       companyRow?.website         ?? COMPANY_DEFAULTS.website,
    tin:           companyRow?.tin             ?? COMPANY_DEFAULTS.tin,
    primary_color: companyRow?.primary_color  ?? COMPANY_DEFAULTS.primary_color,
    accent_color:  companyRow?.accent_color   ?? COMPANY_DEFAULTS.accent_color,
    logo_url:      companyRow?.logo_url        ?? COMPANY_DEFAULTS.logo_url,
    show_tin:      companyRow?.show_tin_on_invoice  ?? COMPANY_DEFAULTS.show_tin,
    show_logo:     companyRow?.show_logo_on_invoice ?? COMPANY_DEFAULTS.show_logo,
  };

  // ── Financial totals ──────────────────────────────────────────────────────
  const totalInvoiced  = invoices.reduce((s, i) => s + i.total_amount, 0);
  const totalPaid      = invoices.reduce((s, i) => s + i.total_paid, 0);
  const totalBalance   = invoices.reduce((s, i) => s + i.balance_due, 0);
  const overdueBalance = invoices
    .filter(i => i.status === 'overdue')
    .reduce((s, i) => s + i.balance_due, 0);
  const currency       = client.currency || 'UGX';
  const today          = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── Invoices table HTML ────────────────────────────────────────────────────
  const invoicesHtml = invoices.length === 0
    ? `<tr><td colspan="7" style="padding:20px;text-align:center;color:#94a3b8">No invoices on record</td></tr>`
    : invoices.map(inv => `
      <tr style="${inv.status === 'overdue' ? 'background:#fff7ed' : ''}">
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#475569">${inv.invoice_number}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${fmtDate(inv.issue_date)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:${inv.status === 'overdue' ? '#dc2626' : '#475569'}">${fmtDate(inv.due_date)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${inv.project ? inv.project.project_name : (inv.notes ? inv.notes.slice(0, 40) : '—')}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;font-weight:600;color:#0f172a">${fmt(inv.total_amount, inv.currency)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#16a34a;font-weight:600">${fmt(inv.total_paid, inv.currency)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;font-weight:700;color:${inv.balance_due > 0 ? '#b45309' : '#16a34a'}">${fmt(inv.balance_due, inv.currency)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:center">
          <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;color:#fff;background:${STATUS_COLORS[inv.status] ?? '#64748b'};white-space:nowrap">
            ${STATUS_LABELS[inv.status] ?? inv.status}
          </span>
        </td>
      </tr>`).join('');

  // ── Payments table HTML ───────────────────────────────────────────────────
  const paymentsHtml = payments.length === 0
    ? `<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8">No payments recorded</td></tr>`
    : payments.map(p => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#475569">${p.payment_number}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${fmtDate(p.payment_date)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#64748b">${p.invoice?.invoice_number ?? '—'}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569">${PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}${p.reference_number ? ` <span style="font-family:monospace;font-size:10px;color:#94a3b8">(${p.reference_number})</span>` : ''}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:700;color:#16a34a">${fmt(p.amount_paid, currency)}</td>
      </tr>`).join('');

  // ── Full HTML document ─────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Statement — ${client.name} — ${co.name}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      font-size:13px;color:#0f172a;background:#f8fafc;
    }
    .page{
      background:#fff;max-width:960px;margin:0 auto;padding:48px 52px;
      box-shadow:0 4px 24px rgba(0,0,0,.08);min-height:100vh;
    }
    th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0;text-align:left}
    th.r{text-align:right}
    th.c{text-align:center}
    .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #f1f5f9}
    @media print{
      body{background:#fff}
      .page{box-shadow:none;padding:0;max-width:100%}
      .no-print{display:none!important}
      @page{margin:1.4cm;size:A4}
    }
  </style>
  ${isPrint ? `<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},500);})</script>` : ''}
</head>
<body>
<div class="page">

  <!-- ── Print Controls ──────────────────────────────────────────────────── -->
  <div class="no-print" style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:28px">
    <a href="javascript:history.back()"
      style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;color:#475569;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none">
      ← Back
    </a>
    <button onclick="window.print()"
      style="display:inline-flex;align-items:center;gap:6px;background:${co.primary_color};color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      ⬇ Save as PDF
    </button>
  </div>

  <!-- ── Document Header ─────────────────────────────────────────────────── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid ${co.primary_color}">

    <!-- Company branding -->
    <div style="display:flex;align-items:center;gap:14px">
      ${co.show_logo && co.logo_url
        ? `<img src="${co.logo_url}" alt="Logo" style="width:56px;height:56px;object-fit:contain;flex-shrink:0"/>`
        : LOGO_SVG}
      <div>
        <div style="font-size:20px;font-weight:800;color:${co.primary_color};letter-spacing:-.5px">${co.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">${co.email} · ${co.phone}</div>
        <div style="font-size:11px;color:#64748b">${co.address}</div>
        ${co.show_tin && co.tin ? `<div style="font-size:11px;color:#64748b;margin-top:3px">TIN: <strong style="font-family:monospace;color:${co.primary_color}">${co.tin}</strong></div>` : ''}
      </div>
    </div>

    <!-- Statement title -->
    <div style="text-align:right">
      <div style="font-size:24px;font-weight:900;color:${co.primary_color};letter-spacing:-.8px">STATEMENT</div>
      <div style="font-size:13px;font-weight:500;color:#64748b;margin-top:2px">OF ACCOUNT</div>
      <div style="margin-top:10px;font-size:11px;color:#64748b">As of <strong style="color:#0f172a">${today}</strong></div>
      <div style="margin-top:4px;font-size:11px;color:#64748b">Currency: <strong style="color:#0f172a">${currency}</strong></div>
      ${overdueBalance > 0 ? `
      <div style="margin-top:10px;display:inline-block;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:5px 12px">
        <span style="font-size:11px;font-weight:700;color:#dc2626">⚠ ${fmt(overdueBalance, currency)} OVERDUE</span>
      </div>` : ''}
    </div>
  </div>

  <!-- ── Client Info + Account Summary ───────────────────────────────────── -->
  <div style="display:flex;gap:28px;margin-bottom:36px">

    <!-- Client block -->
    <div style="flex:1.2">
      <div class="section-title">Account Holder</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">${client.name}</div>
      ${client.company_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">${client.company_name}</div>` : ''}
      ${client.email ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${client.email}</div>` : ''}
      ${client.phone ? `<div style="font-size:12px;color:#64748b">${client.phone}</div>` : ''}
      ${client.city || client.country ? `<div style="font-size:12px;color:#64748b">${[client.city, client.country].filter(Boolean).join(', ')}</div>` : ''}
      ${client.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px;white-space:pre-line">${client.address}</div>` : ''}
      ${client.tin_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="font-family:monospace">${client.tin_number}</strong></div>` : ''}
      <div style="margin-top:6px;font-size:11px;font-family:monospace;color:#94a3b8">${client.client_code}</div>
    </div>

    <!-- Account summary -->
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px">
      <div class="section-title">Account Summary</div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Total Invoiced</span>
        <span style="font-weight:600;color:#0f172a">${fmt(totalInvoiced, currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Total Payments Received</span>
        <span style="font-weight:700;color:#16a34a">${fmt(totalPaid, currency)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 12px;margin-top:8px;border-radius:8px;background:${totalBalance > 0 ? '#fffbeb' : '#f0fdf4'};font-size:14px;font-weight:700">
        <span style="color:${totalBalance > 0 ? '#b45309' : '#15803d'}">Balance Due</span>
        <span style="color:${totalBalance > 0 ? '#b45309' : '#15803d'}">${fmt(totalBalance, currency)}</span>
      </div>
      ${invoices.length > 0 ? `
      <div style="margin-top:10px;font-size:11px;color:#94a3b8">
        ${invoices.length} invoice${invoices.length !== 1 ? 's' : ''} · ${payments.length} payment${payments.length !== 1 ? 's' : ''}
      </div>` : ''}
    </div>
  </div>

  <!-- ── Invoices Table ───────────────────────────────────────────────────── -->
  <div style="margin-bottom:32px">
    <div class="section-title">Invoices</div>
    <table style="width:100%;border-collapse:collapse">
      <thead style="background:#f8fafc">
        <tr>
          <th>Invoice #</th>
          <th>Issued</th>
          <th>Due</th>
          <th>Description</th>
          <th class="r">Amount</th>
          <th class="r">Paid</th>
          <th class="r">Balance</th>
          <th class="c">Status</th>
        </tr>
      </thead>
      <tbody>
        ${invoicesHtml}
      </tbody>
      ${invoices.length > 0 ? `
      <tfoot>
        <tr style="background:#f8fafc">
          <td colspan="4" style="padding:10px 12px;font-size:12px;font-weight:700;color:#475569">Totals</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px">${fmt(totalInvoiced, currency)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:#16a34a">${fmt(totalPaid, currency)}</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:${totalBalance > 0 ? '#b45309' : '#16a34a'}">${fmt(totalBalance, currency)}</td>
          <td></td>
        </tr>
      </tfoot>` : ''}
    </table>
  </div>

  <!-- ── Payments Received Table ──────────────────────────────────────────── -->
  <div style="margin-bottom:36px">
    <div class="section-title">Payments Received</div>
    <table style="width:100%;border-collapse:collapse">
      <thead style="background:#f8fafc">
        <tr>
          <th>Receipt #</th>
          <th>Date</th>
          <th>Invoice</th>
          <th>Method / Reference</th>
          <th class="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${paymentsHtml}
      </tbody>
      ${payments.length > 0 ? `
      <tfoot>
        <tr style="background:#f0fdf4">
          <td colspan="4" style="padding:10px 12px;font-size:12px;font-weight:700;color:#15803d">Total Received</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;color:#15803d">${fmt(totalPaid, currency)}</td>
        </tr>
      </tfoot>` : ''}
    </table>
  </div>

  <!-- ── Outstanding Balance Banner ───────────────────────────────────────── -->
  ${totalBalance > 0 ? `
  <div style="margin-bottom:32px;padding:18px 22px;border-radius:12px;background:${overdueBalance > 0 ? '#fff7ed' : '#fffbeb'};border:1px solid ${overdueBalance > 0 ? '#fed7aa' : '#fde68a'};border-left:4px solid ${overdueBalance > 0 ? '#ea580c' : '#d97706'}">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
      <div>
        <div style="font-size:12px;font-weight:700;color:${overdueBalance > 0 ? '#ea580c' : '#b45309'};text-transform:uppercase;letter-spacing:.05em">
          ${overdueBalance > 0 ? '⚠ Overdue Payment Required' : '💳 Payment Required'}
        </div>
        <div style="font-size:11px;color:#78716c;margin-top:4px">
          Please settle your outstanding balance at your earliest convenience.
          Contact us at ${co.email} or ${co.phone} to arrange payment.
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:22px;font-weight:900;color:${overdueBalance > 0 ? '#dc2626' : '#b45309'}">${fmt(totalBalance, currency)}</div>
        <div style="font-size:10px;color:#78716c">Total outstanding</div>
      </div>
    </div>
  </div>` : `
  <div style="margin-bottom:32px;padding:16px 20px;border-radius:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #22c55e">
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">✅</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:#15803d">Account Fully Settled</div>
        <div style="font-size:11px;color:#4ade80;margin-top:2px">All invoices have been paid. Thank you!</div>
      </div>
    </div>
  </div>`}

  <!-- ── Footer ──────────────────────────────────────────────────────────── -->
  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
    <div>
      <p style="font-size:11px;color:#475569;line-height:1.7">
        This statement reflects all transactions as of <strong>${today}</strong>.
        For queries contact <strong>${co.email}</strong> or call <strong>${co.phone}</strong>.
      </p>
      <p style="font-size:10px;color:#94a3b8;margin-top:4px">
        ${co.show_tin && co.tin ? `TIN: ${co.tin} · ` : ''}${co.name} · ${co.website ?? ''}
      </p>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <p style="font-size:10px;color:#94a3b8">Generated</p>
      <p style="font-size:11px;color:#64748b;font-weight:600">${today}</p>
      <p style="font-size:10px;color:#c4b5fd;margin-top:4px">Powered by Sabtech Online</p>
    </div>
  </div>

</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
