export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// ─── Company fallbacks (no sensitive data) ───────────────────────────────────
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

// ─── Inline logo SVG ──────────────────────────────────────────────────────────
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
  draft: 'Draft', sent: 'Sent', approved: 'Approved',
  rejected: 'Rejected', expired: 'Expired', converted: 'Converted',
};
const STATUS_COLORS: Record<string, string> = {
  draft: '#64748b', sent: '#2563eb', approved: '#16a34a',
  rejected: '#dc2626', expired: '#d97706', converted: '#7c3aed',
};

type DBQuotation = {
  id: string;
  quotation_number: string;
  project_name: string;
  issue_date: string;
  valid_until: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total_amount: number;
  status: string;
  notes: string | null;
  client: {
    name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    tin_number: string | null;
  } | null;
  quotation_items: Array<{
    id: string;
    item_name: string;
    description: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
  }>;
};

type DBPaymentMethod = {
  display_name: string;
  method_type: string;
  account_name: string | null;
  account_number: string | null;
  phone_number: string | null;
  merchant_code: string | null;
  bank_name: string | null;
  branch: string | null;
  swift_code: string | null;
  instructions: string | null;
  show_on_invoice: boolean;
  is_active: boolean;
  display_order: number;
};

function buildPaymentMethodHtml(m: DBPaymentMethod): string {
  const lines: string[] = [];
  if (m.account_name)   lines.push(`<span>${m.account_name}</span>`);
  if (m.phone_number)   lines.push(`<span style="font-family:monospace">${m.phone_number}</span>`);
  if (m.merchant_code)  lines.push(`<span>Code: <span style="font-family:monospace">${m.merchant_code}</span></span>`);
  if (m.account_number) lines.push(`<span>A/C: <span style="font-family:monospace">${m.account_number}</span></span>`);
  if (m.bank_name)      lines.push(`<span>${m.bank_name}${m.branch ? ` · ${m.branch}` : ''}</span>`);
  if (m.swift_code)     lines.push(`<span>SWIFT: ${m.swift_code}</span>`);
  if (m.instructions)   lines.push(`<span style="font-style:italic">${m.instructions}</span>`);
  return `
    <div style="display:flex;align-items:flex-start;gap:14px;padding:9px 0;border-bottom:1px solid #f1f5f9">
      <div style="min-width:150px;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.04em;padding-top:1px">${m.display_name}</div>
      <div style="font-size:12px;color:#0f172a;display:flex;flex-direction:column;gap:2px">${lines.join('')}</div>
    </div>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!(await requireAuth())) {
    return new NextResponse('Unauthorized — please log in to view this document', { status: 401 });
  }

  const { id } = await params;
  const isPrint = req.nextUrl.searchParams.get('print') === '1';
  const supabase = getSupabase();

  const [{ data: qRow }, { data: companyRow }, { data: paymentMethods }] = await Promise.all([
    supabase
      .from('quotations')
      .select('*, client:clients(name, company_name, email, phone, address, city, country, tin_number), quotation_items(*)')
      .eq('id', id)
      .order('sort_order', { referencedTable: 'quotation_items', ascending: true })
      .single(),
    supabase.from('company_settings').select('*').eq('id', 1).single(),
    supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .eq('show_on_invoice', true)
      .order('display_order', { ascending: true }),
  ]);

  if (!qRow) {
    return new NextResponse('Quotation not found', { status: 404 });
  }

  const q     = qRow as DBQuotation;
  const items = (q.quotation_items || []).sort((a, b) => a.sort_order - b.sort_order);
  const pms   = (paymentMethods || []) as DBPaymentMethod[];

  const co = {
    name:          companyRow?.company_name  ?? COMPANY_DEFAULTS.name,
    email:         companyRow?.email          ?? COMPANY_DEFAULTS.email,
    phone:         companyRow?.phone          ?? COMPANY_DEFAULTS.phone,
    address:       companyRow?.address        ?? COMPANY_DEFAULTS.address,
    website:       companyRow?.website        ?? COMPANY_DEFAULTS.website,
    tin:           companyRow?.tin            ?? COMPANY_DEFAULTS.tin,
    primary_color: companyRow?.primary_color  ?? COMPANY_DEFAULTS.primary_color,
    accent_color:  companyRow?.accent_color   ?? COMPANY_DEFAULTS.accent_color,
    logo_url:      companyRow?.logo_url       ?? COMPANY_DEFAULTS.logo_url,
    show_tin:      companyRow?.show_tin_on_invoice  ?? COMPANY_DEFAULTS.show_tin,
    show_logo:     companyRow?.show_logo_on_invoice ?? COMPANY_DEFAULTS.show_logo,
  };

  const currency = q.currency || 'UGX';
  const today    = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const client   = q.client;

  // ── Items table rows ──────────────────────────────────────────────────────
  const itemsHtml = items.length === 0
    ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8">No items</td></tr>`
    : items.map((item, i) => `
      <tr style="background:${i % 2 === 1 ? '#f8fafc' : '#fff'}">
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:600;color:#0f172a">${item.item_name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${item.description || '—'}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#475569">${item.quantity}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#475569">${fmt(item.unit_price, currency)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:13px;font-weight:700;color:#0f172a">${fmt(item.line_total, currency)}</td>
      </tr>`).join('');

  // ── Payment methods from DB ───────────────────────────────────────────────
  const paymentHtml = pms.length === 0
    ? `<p style="font-size:12px;color:#94a3b8;padding:8px 0">Contact us for payment details.</p>`
    : pms.map(buildPaymentMethodHtml).join('');

  // ── Full HTML document ────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Quotation ${q.quotation_number} — ${co.name}</title>
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
    th{
      font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;
      color:#64748b;padding:10px 14px;border-bottom:2px solid #e2e8f0;text-align:left;
      background:#f8fafc;
    }
    th.r{text-align:right}
    .section-title{
      font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
      color:#94a3b8;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #f1f5f9;
    }
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

  <!-- ── Print Controls ── -->
  <div class="no-print" style="display:flex;justify-content:flex-end;gap:10px;margin-bottom:28px">
    <a href="javascript:history.back()"
      style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;color:#475569;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none">
      ← Back
    </a>
    <button onclick="window.print()"
      style="display:inline-flex;align-items:center;gap:6px;background:${co.primary_color};color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      ⬇ Save / Print
    </button>
  </div>

  <!-- ── Document Header ── -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid ${co.primary_color}">
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
    <div style="text-align:right">
      <div style="font-size:28px;font-weight:900;color:${co.primary_color};letter-spacing:-.8px">QUOTATION</div>
      <div style="margin-top:6px;display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 14px">
        <span style="font-family:monospace;font-size:16px;font-weight:700;color:${co.primary_color}">${q.quotation_number}</span>
      </div>
      <div style="margin-top:10px">
        <span style="display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;color:#fff;background:${STATUS_COLORS[q.status] ?? '#64748b'}">
          ${STATUS_LABELS[q.status] ?? q.status}
        </span>
      </div>
    </div>
  </div>

  <!-- ── Client + Quotation Meta ── -->
  <div style="display:flex;gap:28px;margin-bottom:36px">
    <div style="flex:1.2">
      <div class="section-title">Prepared For</div>
      ${client ? `
        <div style="font-size:16px;font-weight:700;color:#0f172a">${client.name}</div>
        ${client.company_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">${client.company_name}</div>` : ''}
        ${client.email  ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${client.email}</div>` : ''}
        ${client.phone  ? `<div style="font-size:12px;color:#64748b">${client.phone}</div>` : ''}
        ${(client.city || client.country) ? `<div style="font-size:12px;color:#64748b">${[client.city, client.country].filter(Boolean).join(', ')}</div>` : ''}
        ${client.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px">${client.address}</div>` : ''}
        ${client.tin_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="font-family:monospace">${client.tin_number}</strong></div>` : ''}
      ` : '<div style="font-size:13px;color:#94a3b8">—</div>'}
    </div>
    <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px">
      <div class="section-title">Quotation Details</div>
      ${q.project_name ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Project / Description</span>
        <span style="font-weight:600;color:#0f172a;max-width:180px;text-align:right">${q.project_name}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Issue Date</span>
        <span style="font-weight:600;color:#0f172a">${fmtDate(q.issue_date)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Valid Until</span>
        <span style="font-weight:600;color:#0f172a">${fmtDate(q.valid_until)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:12px">
        <span style="color:#64748b">Currency</span>
        <span style="font-weight:600;font-family:monospace;color:#0f172a">${currency}</span>
      </div>
    </div>
  </div>

  <!-- ── Line Items Table ── -->
  <div style="margin-bottom:24px">
    <div class="section-title">Services &amp; Deliverables</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="width:30%">Item / Service</th>
          <th>Description</th>
          <th class="r" style="width:60px">Qty</th>
          <th class="r" style="width:120px">Unit Price</th>
          <th class="r" style="width:120px">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>

  <!-- ── Totals block ── -->
  <div style="display:flex;justify-content:flex-end;margin-bottom:36px">
    <div style="min-width:280px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Subtotal</span>
        <span style="color:#0f172a;font-weight:600">${fmt(q.subtotal, currency)}</span>
      </div>
      ${q.discount > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Discount</span>
        <span style="color:#dc2626;font-weight:600">− ${fmt(q.discount, currency)}</span>
      </div>` : ''}
      ${q.tax > 0 ? `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px">
        <span style="color:#64748b">Tax</span>
        <span style="color:#0f172a;font-weight:600">${fmt(q.tax, currency)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:12px 14px;margin-top:6px;border-radius:8px;background:${co.primary_color}">
        <span style="font-size:14px;font-weight:700;color:#fff">Total Amount</span>
        <span style="font-size:16px;font-weight:900;color:#fff">${fmt(q.total_amount, currency)}</span>
      </div>
    </div>
  </div>

  <!-- ── Notes ── -->
  ${q.notes ? `
  <div style="margin-bottom:28px;padding:16px 20px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;border-left:4px solid #f59e0b">
    <div class="section-title" style="border-bottom:none;margin-bottom:6px">Notes</div>
    <p style="font-size:12px;color:#78716c;line-height:1.7;white-space:pre-line">${q.notes}</p>
  </div>` : ''}

  <!-- ── Payment Information (from DB) ── -->
  ${pms.length > 0 ? `
  <div style="margin-bottom:32px">
    <div class="section-title">Payment Information</div>
    <p style="font-size:12px;color:#64748b;margin-bottom:12px">
      Upon approval, please make payment via any of the following methods:
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px">
      ${paymentHtml}
    </div>
    <p style="font-size:11px;color:#94a3b8;margin-top:8px">
      Please include the quotation number <strong style="font-family:monospace;color:#475569">${q.quotation_number}</strong> as your payment reference.
    </p>
  </div>` : ''}

  <!-- ── Footer ── -->
  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
    <div>
      <p style="font-size:11px;color:#475569;line-height:1.7">
        This quotation is valid until <strong>${fmtDate(q.valid_until)}</strong>.
        For queries contact <strong>${co.email}</strong> or call <strong>${co.phone}</strong>.
      </p>
      <p style="font-size:10px;color:#94a3b8;margin-top:4px">
        ${co.show_tin && co.tin ? `TIN: ${co.tin} · ` : ''}${co.name}${co.website ? ` · ${co.website}` : ''}
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
