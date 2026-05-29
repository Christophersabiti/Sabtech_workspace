export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireTenantEntityAccess } from '@/lib/authz';

const COMPANY_DEFAULTS = {
  name: 'Sabtech Online',
  email: 'info@sabtechonline.com',
  phone: '+256 777 293 933',
  address: 'Kasese, Uganda',
  website: 'www.sabtechonline.com',
  tin: '1009345230',
  primary_color: '#0f172a',
  accent_color: '#7c2cbf',
  logo_url: null as string | null,
  show_tin_on_invoice: true,
  show_logo_on_invoice: true,
  default_invoice_footer: 'Thank you for your business.',
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

type ProjectRow = {
  id: string;
  company_id: string;
  project_code: string;
  project_name: string;
  description: string | null;
  total_contract_amount: number | null;
  start_date: string | null;
  end_date: string | null;
  client: {
    name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    tin_number: string | null;
    currency: string;
  } | null;
};

type ScheduleRow = {
  id: string;
  schedule_name: string;
  description: string | null;
  percentage: number | null;
  fixed_amount: number | null;
  due_date: string | null;
  sort_order: number;
  status: 'pending' | 'invoiced' | 'paid';
  generated_invoice_id: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  schedule_id: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  total_amount: number;
  total_paid: number;
  balance_due: number;
};

type CompanySettingsRow = Partial<typeof COMPANY_DEFAULTS> & {
  company_name?: string | null;
  default_invoice_footer?: string | null;
  show_tin_on_invoice?: boolean | null;
  show_logo_on_invoice?: boolean | null;
};

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

function formatCurrency(amount: number | null | undefined, currency = 'UGX'): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '--';
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function scheduleAmount(schedule: ScheduleRow, contractAmount: number | null): number | null {
  if (schedule.fixed_amount != null) return Number(schedule.fixed_amount);
  if (schedule.percentage != null && contractAmount != null) {
    return Number(contractAmount) * Number(schedule.percentage) / 100;
  }
  return null;
}

function scheduleStatus(schedule: ScheduleRow, invoice: InvoiceRow | null): ScheduleRow['status'] {
  if (!invoice) return schedule.status;
  if (invoice.status === 'paid' || Number(invoice.balance_due || 0) <= 0) return 'paid';
  if (invoice.status === 'cancelled' || invoice.status === 'void') return 'pending';
  return 'invoiced';
}

function findScheduleInvoice(schedule: ScheduleRow, invoices: InvoiceRow[]): InvoiceRow | null {
  return (
    invoices.find(invoice => invoice.id === schedule.generated_invoice_id) ||
    invoices.find(invoice => invoice.schedule_id === schedule.id) ||
    null
  );
}

function statusBadge(status: ScheduleRow['status']): string {
  const colors: Record<ScheduleRow['status'], { bg: string; fg: string }> = {
    pending: { bg: '#f1f5f9', fg: '#475569' },
    invoiced: { bg: '#dbeafe', fg: '#1d4ed8' },
    paid: { bg: '#dcfce7', fg: '#15803d' },
  };
  const color = colors[status];
  return `<span style="display:inline-block;min-width:72px;text-align:center;border-radius:999px;padding:4px 8px;background:${color.bg};color:${color.fg};font-size:10px;font-weight:700;text-transform:uppercase">${escapeHtml(status)}</span>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireTenantEntityAccess('projects', id);
  if (!access.ok) {
    return new NextResponse(access.message, { status: access.status });
  }

  const isPrint = req.nextUrl.searchParams.get('print') === '1';
  const supabase = getSupabase();

  const [
    { data: project },
    { data: schedules },
    { data: invoices },
    { data: companySettingsRow },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, company_id, project_code, project_name, description, total_contract_amount, start_date, end_date, client:clients(name, company_name, email, phone, address, tin_number, currency)')
      .eq('id', id)
      .eq('company_id', access.companyId)
      .single(),
    supabase
      .from('invoice_schedules')
      .select('id, schedule_name, description, percentage, fixed_amount, due_date, sort_order, status, generated_invoice_id')
      .eq('project_id', id)
      .eq('company_id', access.companyId)
      .order('sort_order'),
    supabase
      .from('invoices')
      .select('id, invoice_number, schedule_id, status, issue_date, due_date, currency, total_amount, total_paid, balance_due')
      .eq('project_id', id)
      .eq('company_id', access.companyId)
      .order('issue_date', { ascending: true }),
    supabase
      .from('company_settings')
      .select('*')
      .eq('company_id', access.companyId)
      .maybeSingle(),
  ]);

  if (!project) {
    return new NextResponse('Project not found', { status: 404 });
  }

  const rawProject = project as unknown as ProjectRow & { client: ProjectRow['client'] | ProjectRow['client'][] };
  const projectRow: ProjectRow = {
    ...rawProject,
    client: Array.isArray(rawProject.client) ? rawProject.client[0] ?? null : rawProject.client,
  };
  const scheduleRows = (schedules || []) as ScheduleRow[];
  const invoiceRows = (invoices || []) as InvoiceRow[];
  const companySettings = (companySettingsRow || {}) as CompanySettingsRow;
  const currency = projectRow.client?.currency || 'UGX';

  const co = {
    name: companySettings.company_name ?? COMPANY_DEFAULTS.name,
    email: companySettings.email ?? COMPANY_DEFAULTS.email,
    phone: companySettings.phone ?? COMPANY_DEFAULTS.phone,
    address: companySettings.address ?? COMPANY_DEFAULTS.address,
    website: companySettings.website ?? COMPANY_DEFAULTS.website,
    tin: companySettings.tin ?? COMPANY_DEFAULTS.tin,
    primary_color: companySettings.primary_color ?? COMPANY_DEFAULTS.primary_color,
    accent_color: companySettings.accent_color ?? COMPANY_DEFAULTS.accent_color,
    logo_url: companySettings.logo_url ?? COMPANY_DEFAULTS.logo_url,
    show_tin: companySettings.show_tin_on_invoice ?? COMPANY_DEFAULTS.show_tin_on_invoice,
    show_logo: companySettings.show_logo_on_invoice ?? COMPANY_DEFAULTS.show_logo_on_invoice,
    footer_note: companySettings.default_invoice_footer ?? COMPANY_DEFAULTS.default_invoice_footer,
  };

  const linkedInvoices = scheduleRows
    .map(schedule => findScheduleInvoice(schedule, invoiceRows))
    .filter((invoice): invoice is InvoiceRow => Boolean(invoice));
  const uniqueLinkedInvoices = Array.from(new Map(linkedInvoices.map(invoice => [invoice.id, invoice])).values());

  const scheduledTotal = scheduleRows.reduce((sum, schedule) => sum + (scheduleAmount(schedule, projectRow.total_contract_amount) || 0), 0);
  const invoicedTotal = uniqueLinkedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
  const paidTotal = uniqueLinkedInvoices.reduce((sum, invoice) => sum + Number(invoice.total_paid || 0), 0);
  const invoiceOutstanding = uniqueLinkedInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due || 0), 0);
  const unscheduledBalance = projectRow.total_contract_amount != null
    ? Math.max(Number(projectRow.total_contract_amount) - scheduledTotal, 0)
    : null;

  const scheduleRowsHtml = scheduleRows.map((schedule, index) => {
    const amount = scheduleAmount(schedule, projectRow.total_contract_amount);
    const invoice = findScheduleInvoice(schedule, invoiceRows);
    const status = scheduleStatus(schedule, invoice);
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;font-family:monospace;font-size:11px">${index + 1}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
          <strong style="color:#0f172a">${escapeHtml(schedule.schedule_name)}</strong>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#475569">${escapeHtml(schedule.description || '--')}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;color:#475569">${schedule.percentage != null ? `${escapeHtml(schedule.percentage)}%` : '--'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0f172a">${formatCurrency(amount, currency)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#475569">${formatDate(schedule.due_date)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:11px;color:#2563eb">${invoice ? escapeHtml(invoice.invoice_number) : '--'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;text-align:center">${statusBadge(status)}</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Billing Schedule - ${escapeHtml(projectRow.project_code)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      font-size:13px;color:#0f172a;background:#fff;padding:40px;max-width:980px;margin:0 auto
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
    <a href="javascript:history.back()" style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;color:#475569;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none">Back</a>
    <button onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;background:${co.primary_color};color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Print Schedule</button>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:34px;padding-bottom:24px;border-bottom:3px solid ${co.primary_color}">
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
      <div style="font-size:26px;font-weight:900;color:${co.primary_color};letter-spacing:-1px">BILLING SCHEDULE</div>
      <div style="font-size:15px;font-weight:700;font-family:monospace;color:${co.primary_color};margin-top:4px">${escapeHtml(projectRow.project_code)}</div>
      <div style="margin-top:10px;font-size:12px;color:#64748b">Generated: <strong style="color:#0f172a">${formatDate(new Date().toISOString())}</strong></div>
      <div style="font-size:12px;color:#64748b">Currency: <strong style="color:#0f172a">${escapeHtml(currency)}</strong></div>
    </div>
  </div>

  <div style="display:flex;gap:32px;margin-bottom:26px">
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Client</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(projectRow.client?.name || '--')}</div>
      ${projectRow.client?.company_name ? `<div style="font-size:12px;color:#475569;margin-top:2px">${escapeHtml(projectRow.client.company_name)}</div>` : ''}
      ${projectRow.client?.email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${escapeHtml(projectRow.client.email)}</div>` : ''}
      ${projectRow.client?.phone ? `<div style="font-size:12px;color:#64748b">${escapeHtml(projectRow.client.phone)}</div>` : ''}
      ${projectRow.client?.address ? `<div style="font-size:12px;color:#64748b;margin-top:4px;white-space:pre-line">${escapeHtml(projectRow.client.address)}</div>` : ''}
      ${projectRow.client?.tin_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">TIN: <strong style="font-family:monospace">${escapeHtml(projectRow.client.tin_number)}</strong></div>` : ''}
    </div>
    <div style="flex:1">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:8px">Project</div>
      <div style="font-size:15px;font-weight:700;color:#0f172a">${escapeHtml(projectRow.project_name)}</div>
      <div style="font-size:12px;color:#64748b;font-family:monospace;margin-top:2px">${escapeHtml(projectRow.project_code)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:8px">Start: <strong style="color:#0f172a">${formatDate(projectRow.start_date)}</strong></div>
      <div style="font-size:12px;color:#64748b">End: <strong style="color:#0f172a">${formatDate(projectRow.end_date)}</strong></div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px">
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px;background:#f8fafc">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;font-weight:700">Contract Amount</div>
      <div style="margin-top:8px;font-size:17px;font-weight:800">${formatCurrency(projectRow.total_contract_amount, currency)}</div>
    </div>
    <div style="border:1px solid #bfdbfe;border-radius:10px;padding:14px;background:#eff6ff">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#1d4ed8;font-weight:700">Scheduled Total</div>
      <div style="margin-top:8px;font-size:17px;font-weight:800;color:#1d4ed8">${formatCurrency(scheduledTotal, currency)}</div>
    </div>
    <div style="border:1px solid #bbf7d0;border-radius:10px;padding:14px;background:#f0fdf4">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#15803d;font-weight:700">Paid</div>
      <div style="margin-top:8px;font-size:17px;font-weight:800;color:#15803d">${formatCurrency(paidTotal, currency)}</div>
    </div>
    <div style="border:1px solid #fed7aa;border-radius:10px;padding:14px;background:#fff7ed">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:#c2410c;font-weight:700">Outstanding</div>
      <div style="margin-top:8px;font-size:17px;font-weight:800;color:#c2410c">${formatCurrency(invoiceOutstanding, currency)}</div>
    </div>
  </div>

  <div style="margin-bottom:28px">
    <h3 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;margin-bottom:10px">Schedule Lines</h3>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f8fafc">
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">#</th>
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Stage</th>
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Description</th>
          <th style="text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">%</th>
          <th style="text-align:right;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Amount</th>
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Due Date</th>
          <th style="text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Invoice</th>
          <th style="text-align:center;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;padding:10px 12px;border-bottom:2px solid #e2e8f0">Status</th>
        </tr>
      </thead>
      <tbody>
        ${scheduleRowsHtml || `<tr><td colspan="8" style="padding:24px;text-align:center;color:#94a3b8">No billing schedule lines defined</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="padding:12px;border-top:2px solid #0f172a;text-align:right;font-weight:800">Scheduled Total</td>
          <td style="padding:12px;border-top:2px solid #0f172a;text-align:right;font-weight:800">${formatCurrency(scheduledTotal, currency)}</td>
          <td colspan="3" style="padding:12px;border-top:2px solid #0f172a;color:#64748b;font-size:11px">
            Invoiced: <strong>${formatCurrency(invoicedTotal, currency)}</strong>
            ${unscheduledBalance != null ? ` - Unscheduled: <strong>${formatCurrency(unscheduledBalance, currency)}</strong>` : ''}
          </td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div style="border-top:1px solid #e2e8f0;padding-top:20px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px">
    <div style="max-width:620px">
      <p style="font-size:11px;color:#475569;line-height:1.7;margin-bottom:6px">${escapeHtml(co.footer_note)}</p>
      <p style="font-size:10px;color:#94a3b8">${co.show_tin && co.tin ? `TIN: ${escapeHtml(co.tin)} - ` : ''}${escapeHtml(co.name)} - ${escapeHtml(co.website)}</p>
    </div>
    <div style="text-align:right;flex-shrink:0">
      <p style="font-size:10px;color:#94a3b8">Document generated</p>
      <p style="font-size:11px;color:#64748b;font-weight:600">${formatDate(new Date().toISOString())}</p>
      <p style="font-size:10px;color:${co.accent_color};margin-top:4px">Powered by Sabtech Online</p>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
