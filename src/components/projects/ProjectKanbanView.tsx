'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  AlertTriangle,
  Calendar,
  User2,
  MoreHorizontal,
  Plus,
  ChevronDown,
  ChevronRight,
  Flag,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  EnhancedProjectTask,
  TaskStatus,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_DOT,
  TASK_PRIORITY_COLORS,
  KANBAN_COLUMN_COLORS,
  DEFAULT_KANBAN_COLUMNS,
} from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  tasks: EnhancedProjectTask[];
  companyId: string;
  projectId: string;
  onTasksChange: (tasks: EnhancedProjectTask[]) => void;
  onEditTask: (task: EnhancedProjectTask) => void;
  onAddTask: (defaultStatus?: TaskStatus) => void;
};

type ColumnDef = {
  status_key: TaskStatus;
  name: string;
  color: string;
  wip_limit?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function isOverdue(task: EnhancedProjectTask): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  if (!task.end_date) return false;
  return task.end_date < new Date().toISOString().slice(0, 10);
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function KanbanCard({
  task,
  index,
  onEdit,
}: {
  task: EnhancedProjectTask;
  index: number;
  onEdit: (t: EnhancedProjectTask) => void;
}) {
  const overdue = isOverdue(task);
  const priorityCls = TASK_PRIORITY_COLORS[task.priority];
  const dotCls     = TASK_PRIORITY_DOT[task.priority];

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onEdit(task)}
          className={`
            group relative bg-white rounded-xl border shadow-xs cursor-pointer select-none
            transition-all duration-150
            ${snapshot.isDragging
              ? 'shadow-lg ring-2 ring-blue-400/50 border-blue-300 rotate-1'
              : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
            }
            ${overdue ? 'border-l-2 border-l-red-400' : ''}
          `}
        >
          {/* Progress bar at top */}
          {task.progress > 0 && (
            <div className="h-0.5 rounded-t-xl overflow-hidden bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all"
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}

          <div className="p-3 space-y-2.5">
            {/* Priority + overdue */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${priorityCls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                {TASK_PRIORITY_LABELS[task.priority]}
              </span>
              <div className="flex items-center gap-1">
                {overdue && (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                )}
                <button
                  onClick={e => { e.stopPropagation(); onEdit(task); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 text-gray-400 transition-opacity"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Title */}
            <p className={`text-sm font-medium text-gray-800 leading-snug line-clamp-2 ${
              task.status === 'completed' ? 'line-through text-gray-400' : ''
            }`}>
              {task.task_number != null ? `#${task.task_number} ` : ''}{task.title}
            </p>

            {/* Phase Badge */}
            {task.phase && (
              <div className="inline-flex items-center text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                {task.phase}
              </div>
            )}

            {/* Tags */}
            {task.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Footer: assignee + due date */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-50">
              {task.assigned_to ? (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-[9px] font-bold text-white">
                    {task.assigned_to[0].toUpperCase()}
                  </span>
                  <span className="max-w-[80px] truncate">{task.assigned_to}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-gray-300">
                  <User2 className="w-3.5 h-3.5" />
                  <span>Unassigned</span>
                </div>
              )}

              {task.end_date && (
                <div className={`flex items-center gap-1 text-[11px] ${
                  overdue ? 'text-red-500 font-semibold' : 'text-gray-400'
                }`}>
                  <Calendar className="w-3 h-3" />
                  {formatDate(task.end_date)}
                </div>
              )}
            </div>

            {/* Progress % label */}
            {task.progress > 0 && task.progress < 100 && (
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 tabular-nums">{task.progress}%</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumnUI({
  column,
  tasks,
  onEdit,
  onAddTask,
  collapsed,
  onToggleCollapse,
}: {
  column: ColumnDef;
  tasks: EnhancedProjectTask[];
  onEdit: (t: EnhancedProjectTask) => void;
  onAddTask: (status: TaskStatus) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const wipExceeded = column.wip_limit != null && tasks.length > column.wip_limit;
  const headerColor = KANBAN_COLUMN_COLORS[column.status_key];

  return (
    <div className={`flex flex-col rounded-xl bg-gray-50 border ${
      wipExceeded ? 'border-red-300' : 'border-gray-200'
    } transition-all duration-200`}
      style={{ minWidth: collapsed ? '48px' : '272px', maxWidth: collapsed ? '48px' : '272px' }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 flex-1 min-w-0"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: headerColor }}
          />
          {!collapsed && (
            <>
              <span className="text-sm font-semibold text-gray-700 truncate">{column.name}</span>
              <span className={`ml-auto text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                wipExceeded
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-200 text-gray-500'
              }`}>
                {tasks.length}{column.wip_limit != null ? `/${column.wip_limit}` : ''}
              </span>
            </>
          )}
        </button>
        {!collapsed && (
          <button
            onClick={() => onAddTask(column.status_key)}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
            title={`Add task to ${column.name}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-1 px-1 py-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: headerColor }}
            />
            <span className="text-[10px] font-bold text-gray-500 tabular-nums rotate-180 writing-mode-vertical">
              {tasks.length}
            </span>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* WIP warning */}
          {wipExceeded && (
            <div className="mx-2 mt-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-1.5 text-xs text-red-600">
              <AlertTriangle className="w-3 h-3" />
              WIP limit exceeded ({column.wip_limit})
            </div>
          )}

          {/* Droppable task list */}
          <Droppable droppableId={column.status_key}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`
                  flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] max-h-[calc(100vh-280px)]
                  transition-colors duration-150 rounded-b-xl
                  ${snapshot.isDraggingOver ? 'bg-blue-50/60' : ''}
                `}
              >
                {tasks.map((task, idx) => (
                  <KanbanCard key={task.id} task={task} index={idx} onEdit={onEdit} />
                ))}
                {provided.placeholder}

                {tasks.length === 0 && !snapshot.isDraggingOver && (
                  <button
                    onClick={() => onAddTask(column.status_key)}
                    className="w-full flex flex-col items-center justify-center gap-1.5 py-6 text-gray-300 hover:text-gray-400 hover:bg-gray-100/70 rounded-lg border border-dashed border-gray-200 hover:border-gray-300 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-xs">Add task</span>
                  </button>
                )}
              </div>
            )}
          </Droppable>
        </>
      )}
    </div>
  );
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export function ProjectKanbanView({
  tasks,
  companyId,
  projectId,
  onTasksChange,
  onEditTask,
  onAddTask,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const [savingError, setSavingError] = useState<string | null>(null);

  // Group tasks by status, sorted by sort_order
  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, EnhancedProjectTask[]>();
    DEFAULT_KANBAN_COLUMNS.forEach(c => map.set(c.status_key, []));
    tasks.forEach(t => {
      const col = map.get(t.status) ?? map.get('backlog')!;
      col.push(t);
    });
    map.forEach(col => col.sort((a, b) => a.sort_order - b.sort_order));
    return map;
  }, [tasks]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const srcStatus  = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;
    const taskId     = draggableId;

    // Build optimistic new task list
    const srcTasks  = [...(tasksByStatus.get(srcStatus) ?? [])];
    const destTasks = srcStatus === destStatus ? srcTasks : [...(tasksByStatus.get(destStatus) ?? [])];

    const [moved] = srcTasks.splice(source.index, 1);
    const updatedTask: EnhancedProjectTask = {
      ...moved,
      status: destStatus,
      progress: destStatus === 'completed' ? 100 : moved.progress,
    };

    if (srcStatus === destStatus) {
      srcTasks.splice(destination.index, 0, updatedTask);
    } else {
      destTasks.splice(destination.index, 0, updatedTask);
    }

    // Re-assign sort_order
    const reordered = (srcStatus === destStatus ? srcTasks : destTasks).map((t, i) => ({
      ...t,
      sort_order: i,
    }));

    // Optimistic update
    const newTasks = tasks.map(t => {
      const updated = reordered.find(r => r.id === t.id);
      return updated ?? (t.id === taskId ? updatedTask : t);
    });
    if (srcStatus !== destStatus) {
      srcTasks.forEach((t, i) => {
        const idx = newTasks.findIndex(nt => nt.id === t.id);
        if (idx >= 0) newTasks[idx] = { ...newTasks[idx], sort_order: i };
      });
    }
    onTasksChange(newTasks);
    setSavingError(null);

    // Persist: update status + sort_order
    try {
      const updates = reordered.map(t =>
        supabase
          .from('project_tasks')
          .update({
            status:     t.status,
            sort_order: t.sort_order,
            progress:   t.progress,
            updated_at: new Date().toISOString(),
          })
          .eq('id', t.id)
          .eq('company_id', companyId),
      );

      // Also update source column sort_order if moved between columns
      if (srcStatus !== destStatus) {
        srcTasks.forEach((t, i) => {
          updates.push(
            supabase
              .from('project_tasks')
              .update({ sort_order: i, updated_at: new Date().toISOString() })
              .eq('id', t.id)
              .eq('company_id', companyId),
          );
        });
      }

      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) {
        throw new Error(failed.error.message);
      }

      // Log activity
      await supabase.from('task_activity_logs').insert({
        company_id: companyId,
        project_id: projectId,
        task_id:    taskId,
        action:     'status_changed',
        old_value:  { status: srcStatus },
        new_value:  { status: destStatus },
        metadata:   { via: 'kanban_drag' },
      });
    } catch (err) {
      // Roll back optimistic update
      onTasksChange(tasks);
      setSavingError(err instanceof Error ? err.message : 'Failed to save. Please retry.');
    }
  }, [tasks, tasksByStatus, onTasksChange, supabase, companyId, projectId]);

  function toggleCollapse(status: TaskStatus) {
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }));
  }

  return (
    <div className="flex flex-col gap-3">
      {savingError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {savingError}
          <button onClick={() => setSavingError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {DEFAULT_KANBAN_COLUMNS.map(col => (
            <KanbanColumnUI
              key={col.status_key}
              column={col}
              tasks={tasksByStatus.get(col.status_key) ?? []}
              onEdit={onEditTask}
              onAddTask={onAddTask}
              collapsed={!!collapsed[col.status_key]}
              onToggleCollapse={() => toggleCollapse(col.status_key)}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
