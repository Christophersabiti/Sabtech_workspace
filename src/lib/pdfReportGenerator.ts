import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanyBranding = {
  company_name: string;
  trading_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  logo_url: string | null;
  report_header_logo_url: string | null;
  primary_color: string;
  accent_color: string;
  secondary_color?: string;
};

type ReportMeta = {
  title: string;
  clientName: string | null;
  projectNames: string[];
  reportPeriod: { from: string | null; to: string | null };
  preparedBy: string;
  generatedAt: string;
};

type ExecutiveSummary = {
  totalProjects: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  progressPercent: number;
  projectHealth: string;
  narrative: string | null;
};

type FinancialSummary = {
  totalBudget: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalPendingInvoice: number;
  totalExpenses: number;
  estimatedProfitLoss: number;
  totalWht: number;
  balanceDue: number;
};

type TaskRow = {
  projectName: string;
  title: string;
  assignee: string;
  priority: string;
  status: string;
  startDate: string;
  dueDate: string;
  progress: number;
  latestUpdate: string;
  invoiceStatus: string;
  paymentStatus: string;
  clientRemarks: string;
};

type MilestoneRow = {
  name: string;
  targetDate: string;
  status: string;
  progress: number;
  remarks: string;
};

type RaidRow = {
  title: string;
  type: string;
  severity: string;
  owner: string;
  status: string;
  mitigation: string;
};

type NextStepRow = {
  task: string;
  responsible: string;
  dueDate: string;
  expectedOutcome: string;
};

export type ReportPdfData = {
  branding: CompanyBranding;
  meta: ReportMeta;
  executiveSummary: ExecutiveSummary;
  financialSummary: FinancialSummary | null;
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  raidEntries: RaidRow[];
  nextSteps: NextStepRow[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function formatCurrency(amount: number, decimals = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

// ─── PDF Generator ──────────────────────────────────────────────────────────

export async function generateClientReportPdf(data: ReportPdfData): Promise<Uint8Array<ArrayBuffer>> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 15;
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const primaryRgb = hexToRgb(data.branding.primary_color || '#0f172a');
  const accentRgb = hexToRgb(data.branding.accent_color || '#7c2cbf');

  let yPos = 15;

  // ─── A. Header ──────────────────────────────────────────────────────────

  // Header background
  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.rect(0, 0, pageWidth, 48, 'F');

  // Accent line
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.rect(0, 48, pageWidth, 2, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(data.branding.company_name || 'Company', marginLeft, 18);

  // Company details
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const companyDetails: string[] = [];
  if (data.branding.address) companyDetails.push(data.branding.address);
  if (data.branding.email) companyDetails.push(data.branding.email);
  if (data.branding.phone) companyDetails.push(data.branding.phone);
  if (data.branding.website) companyDetails.push(data.branding.website);
  doc.text(companyDetails.join('  |  '), marginLeft, 25);

  // Report title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(data.meta.title || 'Project Report', marginLeft, 35);

  // Right side: client + date info
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const rightCol = pageWidth - marginRight;

  const rightLines: string[] = [];
  if (data.meta.clientName) rightLines.push(`Client: ${data.meta.clientName}`);
  const projectLabel = data.meta.projectNames.length > 1
    ? `${data.meta.projectNames.length} Projects`
    : data.meta.projectNames[0] || '';
  if (projectLabel) rightLines.push(`Project: ${projectLabel}`);
  if (data.meta.reportPeriod.from || data.meta.reportPeriod.to) {
    rightLines.push(`Period: ${data.meta.reportPeriod.from || 'Start'} – ${data.meta.reportPeriod.to || 'Present'}`);
  }
  rightLines.push(`Prepared by: ${data.meta.preparedBy}`);
  rightLines.push(`Generated: ${data.meta.generatedAt}`);

  rightLines.forEach((line, i) => {
    doc.text(line, rightCol, 15 + i * 4.5, { align: 'right' });
  });

  yPos = 56;

  // ─── B. Executive Summary ───────────────────────────────────────────────

  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Executive Summary', marginLeft, yPos);
  yPos += 7;

  // KPI cards as a table
  const kpiData = [
    ['Total Projects', 'Total Tasks', 'Completed', 'Pending', 'Blocked', 'Overdue', 'Progress'],
    [
      String(data.executiveSummary.totalProjects),
      String(data.executiveSummary.totalTasks),
      String(data.executiveSummary.completedTasks),
      String(data.executiveSummary.pendingTasks),
      String(data.executiveSummary.blockedTasks),
      String(data.executiveSummary.overdueTasks),
      `${data.executiveSummary.progressPercent}%`,
    ],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [kpiData[0]],
    body: [kpiData[1]],
    margin: { left: marginLeft, right: marginRight },
    styles: { fontSize: 8, cellPadding: 3, halign: 'center' },
    headStyles: {
      fillColor: [primaryRgb[0], primaryRgb[1], primaryRgb[2]],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontStyle: 'bold',
      fontSize: 11,
    },
    theme: 'grid',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yPos = (doc as any).lastAutoTable.finalY + 4;

  // Health status
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const healthLabel = data.executiveSummary.projectHealth.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  doc.text(`Project Health: ${healthLabel}`, marginLeft, yPos);
  yPos += 5;

  // Narrative
  if (data.executiveSummary.narrative) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    const narrativeLines = doc.splitTextToSize(data.executiveSummary.narrative, contentWidth);
    doc.text(narrativeLines, marginLeft, yPos);
    yPos += narrativeLines.length * 4 + 4;
  }

  // ─── C. Financial Summary ──────────────────────────────────────────────

  if (data.financialSummary) {
    yPos = checkPageBreak(doc, yPos, 55);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', marginLeft, yPos);
    yPos += 7;

    const fs = data.financialSummary;
    const finData = [
      ['Total Budget', formatCurrency(fs.totalBudget)],
      ['Total Invoiced', formatCurrency(fs.totalInvoiced)],
      ['Total Paid', formatCurrency(fs.totalPaid)],
      ['Total Outstanding', formatCurrency(fs.totalOutstanding)],
      ['Pending Invoice', formatCurrency(fs.totalPendingInvoice)],
      ['Total Expenses', formatCurrency(fs.totalExpenses)],
      ['Estimated Profit/Loss', formatCurrency(fs.estimatedProfitLoss)],
    ];

    if (fs.totalWht > 0) {
      finData.push(['WHT Withheld', formatCurrency(fs.totalWht)]);
    }
    finData.push(['Balance Due', formatCurrency(fs.balanceDue)]);

    autoTable(doc, {
      startY: yPos,
      body: finData,
      margin: { left: marginLeft, right: marginRight },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: contentWidth * 0.45 },
        1: { halign: 'right', cellWidth: contentWidth * 0.55 },
      },
      styles: { fontSize: 9, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'plain',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── D. Task Report Table ─────────────────────────────────────────────

  if (data.tasks.length > 0) {
    yPos = checkPageBreak(doc, yPos, 40);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Task Report (${data.tasks.length} tasks)`, marginLeft, yPos);
    yPos += 7;

    const taskHeaders = ['Project', 'Task', 'Assignee', 'Priority', 'Status', 'Due Date', 'Progress', 'Update'];

    const taskRows = data.tasks.map(t => [
      truncate(t.projectName, 20),
      truncate(t.title, 25),
      truncate(t.assignee || '—', 15),
      t.priority,
      t.status.replace(/_/g, ' '),
      t.dueDate || '—',
      `${t.progress}%`,
      truncate(t.latestUpdate || t.clientRemarks || '—', 30),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [taskHeaders],
      body: taskRows,
      margin: { left: marginLeft, right: marginRight },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: {
        fillColor: [primaryRgb[0], primaryRgb[1], primaryRgb[2]],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { cellWidth: 18 },
        3: { cellWidth: 14 },
        4: { cellWidth: 16 },
        5: { cellWidth: 18 },
        6: { cellWidth: 14 },
        7: { cellWidth: 'auto' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'grid',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── E. Milestones ────────────────────────────────────────────────────

  if (data.milestones.length > 0) {
    yPos = checkPageBreak(doc, yPos, 35);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Milestones', marginLeft, yPos);
    yPos += 7;

    const msHeaders = ['Milestone', 'Target Date', 'Status', 'Progress', 'Remarks'];
    const msRows = data.milestones.map(m => [
      m.name,
      m.targetDate || '—',
      m.status.replace(/_/g, ' '),
      `${m.progress}%`,
      truncate(m.remarks || '—', 40),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [msHeaders],
      body: msRows,
      margin: { left: marginLeft, right: marginRight },
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [accentRgb[0], accentRgb[1], accentRgb[2]],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      theme: 'grid',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── F. Risks, Issues & Blockers ──────────────────────────────────────

  if (data.raidEntries.length > 0) {
    yPos = checkPageBreak(doc, yPos, 35);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Risks, Issues & Blockers', marginLeft, yPos);
    yPos += 7;

    const raidHeaders = ['Title', 'Type', 'Severity', 'Owner', 'Status', 'Mitigation/Update'];
    const raidRows = data.raidEntries.map(r => [
      truncate(r.title, 25),
      r.type,
      r.severity,
      truncate(r.owner || '—', 15),
      r.status.replace(/_/g, ' '),
      truncate(r.mitigation || '—', 35),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [raidHeaders],
      body: raidRows,
      margin: { left: marginLeft, right: marginRight },
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [220, 38, 38],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      theme: 'grid',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    yPos = (doc as any).lastAutoTable.finalY + 6;
  }

  // ─── G. Next Steps ────────────────────────────────────────────────────

  if (data.nextSteps.length > 0) {
    yPos = checkPageBreak(doc, yPos, 35);

    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Next Steps', marginLeft, yPos);
    yPos += 7;

    const nsHeaders = ['Task', 'Responsible', 'Due Date', 'Expected Outcome'];
    const nsRows = data.nextSteps.map(ns => [
      truncate(ns.task, 35),
      truncate(ns.responsible, 20),
      ns.dueDate || '—',
      truncate(ns.expectedOutcome, 40),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [nsHeaders],
      body: nsRows,
      margin: { left: marginLeft, right: marginRight },
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [34, 197, 94],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      theme: 'grid',
    });
  }

  // ─── H. Footer on every page ──────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Separator line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, pageHeight - 14, pageWidth - marginRight, pageHeight - 14);

    // Footer text
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page ${i} of ${totalPages}`, marginLeft, pageHeight - 9);
    doc.text('CONFIDENTIAL — For intended recipient only', pageWidth / 2, pageHeight - 9, { align: 'center' });
    doc.text('Generated by Sabtech Workspace', pageWidth - marginRight, pageHeight - 9, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}

// ─── Page break helper ──────────────────────────────────────────────────────

function checkPageBreak(doc: jsPDF, yPos: number, requiredSpace: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (yPos + requiredSpace > pageHeight - 20) {
    doc.addPage();
    return 15;
  }
  return yPos;
}

// ─── CSV Generator ──────────────────────────────────────────────────────────

export type CsvColumn = {
  key: string;
  label: string;
  getValue: (row: TaskRow) => string;
};

export const DEFAULT_CSV_COLUMNS: CsvColumn[] = [
  { key: 'projectName',   label: 'Project',        getValue: r => r.projectName },
  { key: 'title',         label: 'Task',            getValue: r => r.title },
  { key: 'assignee',      label: 'Assignee',        getValue: r => r.assignee || '' },
  { key: 'status',        label: 'Status',          getValue: r => r.status.replace(/_/g, ' ') },
  { key: 'priority',      label: 'Priority',        getValue: r => r.priority },
  { key: 'progress',      label: 'Progress %',      getValue: r => String(r.progress) },
  { key: 'startDate',     label: 'Start Date',      getValue: r => r.startDate || '' },
  { key: 'dueDate',       label: 'Due Date',        getValue: r => r.dueDate || '' },
  { key: 'latestUpdate',  label: 'Latest Update',   getValue: r => r.latestUpdate || '' },
  { key: 'invoiceStatus', label: 'Invoice Status',  getValue: r => r.invoiceStatus || '' },
  { key: 'paymentStatus', label: 'Payment Status',  getValue: r => r.paymentStatus || '' },
  { key: 'clientRemarks', label: 'Client Remarks',  getValue: r => r.clientRemarks || '' },
];

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function generateCsvContent(
  tasks: TaskRow[],
  columns: CsvColumn[],
): string {
  // BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  const header = columns.map(c => escapeCsvField(c.label)).join(',');
  const rows = tasks.map(task =>
    columns.map(col => escapeCsvField(col.getValue(task))).join(',')
  );
  return bom + [header, ...rows].join('\n');
}
