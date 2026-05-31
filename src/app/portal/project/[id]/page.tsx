'use client';

import { useEffect, useState, useMemo, use } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Building2, Calendar, CheckCircle2, ChevronRight, Loader2, Lock, Tag, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type Project = {
  id: string;
  project_name: string;
  project_code: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client: {
    name: string;
    company_name: string | null;
  };
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: 'backlog' | 'pending' | 'in_progress' | 'in_review' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  start_date: string | null;
  end_date: string | null;
};

const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-100 text-slate-600 border-slate-200',
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  in_review: 'bg-purple-50 text-purple-700 border-purple-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-400 border-slate-200',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  pending: 'Not Started',
  in_progress: 'In Progress',
  in_review: 'In Review',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export default function ClientPortalPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const { id } = params;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadPortalData() {
      setLoading(true);
      setError('');

      // Check active user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Unauthorized — please log in to access your client portal.');
        setLoading(false);
        return;
      }

      // Load project details (checks standard member access via Supabase policies)
      const { data: projData, error: projErr } = await supabase
        .from('projects')
        .select('*, client:clients(name, company_name)')
        .eq('id', id)
        .maybeSingle();

      if (projErr || !projData) {
        setError('Project workspace not found or access restricted.');
        setLoading(false);
        return;
      }

      setProject(projData as unknown as Project);

      // Load tasks - only select non-sensitive columns
      const { data: taskData, error: taskErr } = await supabase
        .from('project_tasks')
        .select('id, title, description, status, priority, progress, start_date, end_date')
        .eq('project_id', id)
        .order('sort_order', { ascending: true });

      if (!taskErr && taskData) {
        setTasks(taskData as Task[]);
      }

      setLoading(false);
    }

    loadPortalData();
  }, [id, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3 font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Loading Client Portal...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center font-sans">
        <div className="h-16 w-16 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl flex items-center justify-center mb-6">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-black text-white mb-2">Access Restricted</h1>
        <p className="text-slate-400 max-w-sm text-sm leading-relaxed mb-6">
          {error || 'You do not have permission to view this client workspace.'}
        </p>
        <button
          onClick={() => router.push('/login')}
          className="bg-slate-900 border border-white/10 hover:bg-slate-800 text-white font-semibold px-6 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
        >
          Return to Login
        </button>
      </div>
    );
  }

  // Calculate stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const overallProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* Background decoration */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-10 left-10 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl -z-10" />

      <div className="mx-auto max-w-7xl px-6 py-8">
        
        {/* Navigation Bar */}
        <header className="flex items-center justify-between border-b border-white/5 pb-6 mb-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-xl bg-purple-600 flex items-center justify-center">
              <Image src="/logo.svg" alt="Sabtech Workspace" width={40} height={40} className="object-contain" />
            </div>
            <div>
              <p className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                Sabtech Workspace
              </p>
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-widest">Client Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 border border-white/5 bg-white/[0.01] px-4 py-2 rounded-xl backdrop-blur-xl">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Secure Client Link</span>
          </div>
        </header>

        {/* Hero Section */}
        <section className="bg-gradient-to-br from-slate-900/60 via-slate-900/30 to-purple-950/20 border border-white/5 rounded-3xl p-6 sm:p-10 mb-10 flex flex-col md:flex-row justify-between gap-8 backdrop-blur-3xl">
          <div className="space-y-4 max-w-xl">
            <div className="inline-flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 font-bold px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
              <Building2 className="w-3 h-3" /> {project.client.name}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">{project.project_name}</h1>
            {project.description && (
              <p className="text-sm text-slate-400 leading-relaxed font-medium">{project.description}</p>
            )}

            <div className="flex flex-wrap gap-6 pt-2 text-xs text-slate-400">
              {project.start_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Start: <strong>{new Date(project.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
                </div>
              )}
              {project.end_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Delivery: <strong>{new Date(project.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Aggregated progress widget */}
          <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-6 flex flex-col justify-between w-full md:max-w-xs shrink-0 backdrop-blur-xl">
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Overall Completion</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-white tabular-nums">{overallProgress}%</span>
                <span className="text-xs text-slate-500 font-semibold">({completedTasks} of {totalTasks} tasks)</span>
              </div>
            </div>
            
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <span>Kickoff</span>
                <span>Launch</span>
              </div>
            </div>
          </div>
        </section>

        {/* Task lists & Kanban tracking */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h2 className="text-xl font-extrabold text-white tracking-tight">Active Deliverables Board</h2>
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Updates in Real-Time</span>
          </div>

          {tasks.length === 0 ? (
            <div className="bg-slate-900/20 border border-white/5 border-dashed rounded-3xl p-16 text-center text-slate-500 text-sm">
              No active deliverables have been published to this client portal yet.
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {/* columns grouping: To Do / In Progress / Completed */}
              {[
                { id: 'pending', title: 'Planned Stages', statuses: ['backlog', 'pending', 'blocked'] },
                { id: 'active', title: 'Work in Progress', statuses: ['in_progress', 'in_review'] },
                { id: 'completed', title: 'Delivered', statuses: ['completed'] },
              ].map((column) => {
                const columnTasks = tasks.filter(t => column.statuses.includes(t.status));
                return (
                  <div key={column.id} className="bg-slate-900/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-4 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{column.title}</h3>
                      <span className="text-[10px] bg-white/5 text-slate-400 font-extrabold px-2 py-0.5 rounded-full tabular-nums">
                        {columnTasks.length}
                      </span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] scrollbar-thin">
                      {columnTasks.map((t) => {
                        const isOverdue = t.end_date && t.end_date < new Date().toISOString().slice(0, 10) && t.status !== 'completed';
                        return (
                          <div 
                            key={t.id} 
                            className="group bg-slate-950/80 hover:bg-slate-900 border border-white/5 rounded-xl p-4 space-y-3 transition-colors flex flex-col justify-between"
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-xs font-bold text-white leading-tight group-hover:text-purple-400 transition-colors">
                                  {t.title}
                                </h4>
                              </div>
                              {t.description && (
                                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{t.description}</p>
                              )}
                            </div>

                            <div className="border-t border-white/5 pt-3 mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                              {t.end_date ? (
                                <span className={`inline-flex items-center gap-1 font-semibold ${
                                  isOverdue ? 'text-red-400 font-bold' : 'text-slate-500'
                                }`}>
                                  <Calendar className="w-3 h-3 shrink-0" />
                                  <span>{isOverdue ? 'Overdue' : 'Due'}: {new Date(t.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                </span>
                              ) : (
                                <span className="text-slate-600 font-medium">No deadline</span>
                              )}

                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px] border ${
                                TASK_STATUS_COLORS[t.status]
                              }`}>
                                {TASK_STATUS_LABELS[t.status]}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                      {columnTasks.length === 0 && (
                        <div className="text-center py-10 text-slate-600 text-xs font-medium">
                          No tasks in this column
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      <footer className="mt-16 border-t border-white/5 py-8 text-center text-xs text-slate-600">
        <p>© {new Date().getFullYear()} Sabtech Workspace. Secure Client Access Portal. All rights reserved.</p>
        <p className="text-[10px] text-slate-700 mt-1">Powered by Sabtech Online · Powered with absolute tenant privacy.</p>
      </footer>
    </main>
  );
}
