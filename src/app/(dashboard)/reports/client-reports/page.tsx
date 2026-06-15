'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntitlements } from '@/hooks/useEntitlements';
import { FeatureBlockedState } from '@/components/billing/FeatureBlockedState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PageHeader } from '@/components/ui/PageHeader';

import ReportWizard from '@/components/reports/ReportWizard';
import ClientSelector from '@/components/reports/steps/ClientSelector';
import ProjectSelector from '@/components/reports/steps/ProjectSelector';
import TaskFiltersStep from '@/components/reports/steps/TaskFilters';
import VisibilityOptions from '@/components/reports/steps/VisibilityOptions';
import FinancialOptions from '@/components/reports/steps/FinancialOptions';
import ReportPreview from '@/components/reports/ReportPreview';
import ExportPanel from '@/components/reports/ExportPanel';
import SavedTemplates from '@/components/reports/SavedTemplates';

import { DEFAULT_FILTERS, DEFAULT_VISIBILITY, DEFAULT_FINANCIALS } from '@/components/reports/reportTypes';
import { fetchReportData, logReportExport } from '@/lib/reportDataService';
import { generateClientReportPdf, generateCsvContent, DEFAULT_CSV_COLUMNS } from '@/lib/pdfReportGenerator';

import type {
  Client, ProjectWithTotals, ReportFilters, ReportVisibilityOptions,
  ReportFinancialOptions, ReportData, SavedReportTemplate,
} from '@/types';

export default function ClientReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { activeCompanyId } = useActiveCompany();
  const { user } = useCurrentUser();
  const { canUse, loading: entLoading } = useEntitlements();

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<ProjectWithTotals[]>([]);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<SavedReportTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [visibility, setVisibility] = useState<ReportVisibilityOptions>(DEFAULT_VISIBILITY);
  const [financials, setFinancials] = useState<ReportFinancialOptions>(DEFAULT_FINANCIALS);
  const [currentStep, setCurrentStep] = useState(1);

  // Preview/export state
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'pdf' | 'csv' | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState('');

  // ─── Load initial data ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const [clientsRes, projectsRes, usersRes, templatesRes] = await Promise.all([
        supabase.from('clients').select('*').eq('company_id', activeCompanyId).eq('status', 'active').order('name'),
        supabase.from('project_totals').select('*, client:clients(name, company_name)').eq('company_id', activeCompanyId).order('project_name'),
        supabase.from('company_users').select('app_user_id, app_users:app_users(id, full_name)').eq('company_id', activeCompanyId).eq('status', 'active'),
        supabase.from('saved_report_templates').select('*').eq('company_id', activeCompanyId).order('created_at', { ascending: false }),
      ]);

      setClients((clientsRes.data || []) as Client[]);
      setProjects((projectsRes.data || []) as ProjectWithTotals[]);
      setAssignees(
        (usersRes.data || [])
          .map((u: Record<string, unknown>) => {
            const appUser = u.app_users as Record<string, unknown> | null;
            return {
              id: (appUser?.id as string) || '',
              name: (appUser?.full_name as string) || 'Unknown',
            };
          })
          .filter((a: { id: string }) => a.id)
      );
      setTemplates((templatesRes.data || []) as SavedReportTemplate[]);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Filtered projects by selected client ──────────────────────────────

  const filteredProjects = useMemo(() => {
    if (!filters.clientId) return projects;
    return projects.filter(p => p.client_id === filters.clientId);
  }, [projects, filters.clientId]);

  // ─── Generate preview ──────────────────────────────────────────────────

  const generatePreview = useCallback(async () => {
    if (!activeCompanyId || !user) return;
    setPreviewLoading(true);
    try {
      const data = await fetchReportData(
        supabase,
        activeCompanyId,
        user.id,
        user.fullName || user.email || 'Unknown',
        filters,
        visibility,
        financials,
      );
      setReportData(data);
    } catch (err) {
      console.error('Failed to generate preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [activeCompanyId, user, supabase, filters, visibility, financials]);

  // Auto-generate preview when entering step 6
  useEffect(() => {
    if (currentStep === 6) {
      generatePreview();
    }
  }, [currentStep, generatePreview]);

  // ─── PDF Export ────────────────────────────────────────────────────────

  const handleExportPdf = async () => {
    if (!reportData || !activeCompanyId || !user) return;
    setExportLoading(true);
    setExportingFormat('pdf');

    try {
      const completedTasks = reportData.tasks.filter(t => t.status === 'completed').length;
      const pendingTasks = reportData.tasks.filter(t => ['pending', 'backlog', 'in_progress', 'in_review'].includes(t.status)).length;
      const blockedTasks = reportData.tasks.filter(t => t.status === 'blocked').length;
      const overdueTasks = reportData.tasks.filter(t => {
        if (!t.due_date || t.status === 'completed') return false;
        return new Date(t.due_date) < new Date();
      }).length;
      const progressPercent = reportData.tasks.length > 0
        ? Math.round(reportData.tasks.reduce((s, t) => s + t.progress, 0) / reportData.tasks.length)
        : 0;

      const pdfData = {
        branding: {
          company_name: reportData.company?.company_name || 'Company',
          trading_name: reportData.company?.trading_name || null,
          email: reportData.company?.email || null,
          phone: reportData.company?.phone || null,
          website: reportData.company?.website || null,
          address: reportData.company?.address || null,
          logo_url: reportData.company?.logo_url || null,
          report_header_logo_url: null,
          primary_color: reportData.company?.primary_color || '#0f172a',
          accent_color: reportData.company?.accent_color || '#7c2cbf',
        },
        meta: {
          title: 'Client Report',
          clientName: reportData.client?.name || 'All Clients',
          projectNames: reportData.projects.map(p => p.project_name),
          reportPeriod: reportData.reportPeriod,
          preparedBy: reportData.generatedBy,
          generatedAt: new Date(reportData.generatedAt).toLocaleDateString(),
        },
        executiveSummary: {
          totalProjects: reportData.projects.length,
          totalTasks: reportData.tasks.length,
          completedTasks,
          pendingTasks,
          blockedTasks,
          overdueTasks,
          progressPercent,
          projectHealth: 'on_track',
          narrative: executiveSummary || null,
        },
        financialSummary: reportData.financialSummary,
        tasks: reportData.tasks.map(t => ({
          projectName: t.project_name,
          title: t.title,
          assignee: t.assignee || '',
          priority: t.priority,
          status: t.status,
          startDate: t.start_date || '',
          dueDate: t.due_date || '',
          progress: t.progress,
          latestUpdate: t.last_update_summary || '',
          invoiceStatus: t.invoice_status || '',
          paymentStatus: t.payment_status || '',
          clientRemarks: t.report_note || '',
        })),
        milestones: reportData.milestones.map(m => ({
          name: m.name,
          targetDate: m.target_date || '',
          status: m.status,
          progress: m.progress,
          remarks: m.remarks || '',
        })),
        raidEntries: reportData.raidEntries.map(r => ({
          title: r.title,
          type: r.type,
          severity: r.severity,
          owner: '',
          status: r.status,
          mitigation: r.mitigation || '',
        })),
        nextSteps: reportData.tasks
          .filter(t => ['pending', 'in_progress'].includes(t.status) && t.due_date)
          .slice(0, 5)
          .map(t => ({
            task: t.title,
            responsible: t.assignee || '',
            dueDate: t.due_date || '',
            expectedOutcome: t.last_update_summary || 'Completion expected',
          })),
      };

      const pdfBytes = await generateClientReportPdf(pdfData);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${reportData.client?.name || 'All'}_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      // Audit log
      await logReportExport(supabase, activeCompanyId, user.id, 'exported_pdf', filters, financials.showFinancialSummary, 'pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExportLoading(false);
      setExportingFormat(null);
    }
  };

  // ─── CSV Export ────────────────────────────────────────────────────────

  const handleExportCsv = async (selectedColumns: string[]) => {
    if (!reportData || !activeCompanyId || !user) return;
    setExportLoading(true);
    setExportingFormat('csv');

    try {
      const csvColumns = DEFAULT_CSV_COLUMNS.filter(c => selectedColumns.includes(c.key));
      const taskRows = reportData.tasks.map(t => ({
        projectName: t.project_name,
        title: t.title,
        assignee: t.assignee || '',
        priority: t.priority,
        status: t.status,
        startDate: t.start_date || '',
        dueDate: t.due_date || '',
        progress: t.progress,
        latestUpdate: t.last_update_summary || '',
        invoiceStatus: t.invoice_status || '',
        paymentStatus: t.payment_status || '',
        clientRemarks: t.report_note || '',
      }));

      const csv = generateCsvContent(taskRows, csvColumns);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report_${reportData.client?.name || 'All'}_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      await logReportExport(supabase, activeCompanyId, user.id, 'exported_csv', filters, financials.showFinancialSummary, 'csv');
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setExportLoading(false);
      setExportingFormat(null);
    }
  };

  // ─── Template management ──────────────────────────────────────────────

  const handleSaveTemplate = async (name: string, description: string) => {
    if (!activeCompanyId || !user) return;
    const { data } = await supabase.from('saved_report_templates').insert({
      company_id: activeCompanyId,
      name,
      description: description || null,
      template_type: 'custom',
      filters,
      visibility_options: visibility,
      financial_options: financials,
      selected_fields: [],
      created_by: user.id,
    }).select().single();

    if (data) {
      setTemplates(prev => [data as SavedReportTemplate, ...prev]);
    }
  };

  const handleLoadTemplate = (template: SavedReportTemplate) => {
    setFilters(template.filters || DEFAULT_FILTERS);
    setVisibility(template.visibility_options || DEFAULT_VISIBILITY);
    setFinancials(template.financial_options || DEFAULT_FINANCIALS);
    setCurrentStep(1);
  };

  const handleDeleteTemplate = async (id: string) => {
    await supabase.from('saved_report_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setVisibility(DEFAULT_VISIBILITY);
    setFinancials(DEFAULT_FINANCIALS);
    setReportData(null);
    setExecutiveSummary('');
  };

  // ─── Project selection helpers ────────────────────────────────────────

  const toggleProject = (id: string) => {
    setFilters(prev => ({
      ...prev,
      projectIds: prev.projectIds.includes(id)
        ? prev.projectIds.filter(p => p !== id)
        : [...prev.projectIds, id],
    }));
  };

  const selectAllProjects = () => {
    setFilters(prev => ({ ...prev, projectIds: filteredProjects.map(p => p.id) }));
  };

  const clearAllProjects = () => {
    setFilters(prev => ({ ...prev, projectIds: [] }));
  };

  // ─── Entitlement check ────────────────────────────────────────────────

  if (entLoading) return <LoadingSpinner />;
  if (!canUse('reports.export')) {
    return (
      <div className="p-6">
        <PageHeader title="Client Reports" subtitle="Generate professional reports for clients" />
        <FeatureBlockedState
          title="Report export is paused"
          description="This company package or billing status does not currently allow report exports."
        />
      </div>
    );
  }

  if (loading) return <LoadingSpinner />;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-[1100px] mx-auto space-y-6">
      <PageHeader
        title="Client Reports"
        subtitle="Generate professional reports with filters, financial summaries, and branded exports"
      />

      {/* Saved Templates */}
      <SavedTemplates
        templates={templates}
        onLoad={handleLoadTemplate}
        onSave={handleSaveTemplate}
        onDelete={handleDeleteTemplate}
      />

      {/* Report Wizard */}
      <ReportWizard
        filters={filters}
        visibility={visibility}
        financials={financials}
        onFiltersChange={setFilters}
        onVisibilityChange={setVisibility}
        onFinancialsChange={setFinancials}
        onStepChange={setCurrentStep}
        onReset={handleReset}
      >
        {(step: number) => {
          switch (step) {
            case 1:
              return (
                <ClientSelector
                  clients={clients}
                  selectedClientId={filters.clientId}
                  onSelect={(id) => setFilters(prev => ({ ...prev, clientId: id, projectIds: [] }))}
                />
              );
            case 2:
              return (
                <ProjectSelector
                  projects={filteredProjects}
                  selectedIds={filters.projectIds}
                  onToggle={toggleProject}
                  onSelectAll={selectAllProjects}
                  onClearAll={clearAllProjects}
                />
              );
            case 3:
              return (
                <TaskFiltersStep
                  filters={filters}
                  onChange={setFilters}
                  assignees={assignees}
                />
              );
            case 4:
              return (
                <VisibilityOptions
                  visibility={visibility}
                  onChange={setVisibility}
                />
              );
            case 5:
              return (
                <FinancialOptions
                  financials={financials}
                  onChange={setFinancials}
                />
              );
            case 6:
              return (
                <ReportPreview
                  reportData={reportData}
                  loading={previewLoading}
                  executiveSummary={executiveSummary}
                  onSummaryChange={setExecutiveSummary}
                />
              );
            case 7:
              return (
                <ExportPanel
                  onExportPdf={handleExportPdf}
                  onExportCsv={handleExportCsv}
                  loading={exportLoading}
                  exportingFormat={exportingFormat}
                />
              );
            default:
              return null;
          }
        }}
      </ReportWizard>
    </div>
  );
}
