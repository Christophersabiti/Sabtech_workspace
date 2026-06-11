'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, ZoomIn, ZoomOut, AlertTriangle, Calendar } from 'lucide-react';
import {
  EnhancedProjectTask,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_DOT,
  TASK_STATUS_DOT,
  KANBAN_COLUMN_COLORS,
} from './types';

// ─── Types & Constants ────────────────────────────────────────────────────────

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

type GanttTask = EnhancedProjectTask & {
  _level: number;
  _collapsed?: boolean;
  _hasChildren: boolean;
};

const ZOOM_CONFIGS: Record<ZoomLevel, { label: string; colWidthPx: number; headerFn: (d: Date) => string; subFn?: (d: Date) => string; stepMs: number }> = {
  day: {
    label: 'Day',
    colWidthPx: 36,
    stepMs: 86_400_000,
    headerFn: d => d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    subFn:    d => ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()],
  },
  week: {
    label: 'Week',
    colWidthPx: 120,
    stepMs: 7 * 86_400_000,
    headerFn: d => `W${getWeekNumber(d)} ${d.getFullYear()}`,
    subFn:    d => d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
  },
  month: {
    label: 'Month',
    colWidthPx: 100,
    stepMs: 0, // variable — handled below
    headerFn: d => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
  },
  quarter: {
    label: 'Quarter',
    colWidthPx: 140,
    stepMs: 0,
    headerFn: d => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`,
  },
};

const ROW_H   = 40;
const LABEL_W = 220;
const HDR_H   = 44;
const SUB_H   = 22;

// ─── Utility helpers ──────────────────────────────────────────────────────────

function getWeekNumber(d: Date): number {
  const oneJan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - oneJan.getTime()) / 86_400_000 + oneJan.getDay() + 1) / 7);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}
function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function nextQuarter(d: Date): Date {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 1);
}

function buildPeriods(start: Date, end: Date, zoom: ZoomLevel): Date[] {
  const periods: Date[] = [];
  let cur: Date;
  if (zoom === 'month') {
    cur = startOfMonth(start);
    while (cur <= end) { periods.push(new Date(cur)); cur = nextMonth(cur); }
  } else if (zoom === 'quarter') {
    cur = startOfQuarter(start);
    while (cur <= end) { periods.push(new Date(cur)); cur = nextQuarter(cur); }
  } else {
    const cfg = ZOOM_CONFIGS[zoom];
    const aligned = new Date(Math.floor(start.getTime() / cfg.stepMs) * cfg.stepMs);
    cur = aligned;
    while (cur <= end) { periods.push(new Date(cur)); cur = new Date(cur.getTime() + cfg.stepMs); }
  }
  return periods;
}

function periodEndMs(p: Date, zoom: ZoomLevel): number {
  if (zoom === 'month')   return nextMonth(p).getTime();
  if (zoom === 'quarter') return nextQuarter(p).getTime();
  return p.getTime() + ZOOM_CONFIGS[zoom].stepMs;
}

function dateToX(date: string, rangeStart: number, pxPerMs: number): number {
  return (new Date(date + 'T00:00:00').getTime() - rangeStart) * pxPerMs;
}

// ─── Gantt Row ────────────────────────────────────────────────────────────────

function GanttRow({
  task,
  y,
  rangeStart,
  pxPerMs,
  totalWidth,
  onEdit,
}: {
  task: GanttTask;
  y: number;
  rangeStart: number;
  pxPerMs: number;
  totalWidth: number;
  onEdit: (t: GanttTask) => void;
}) {
  const [tooltip, setTooltip] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const barColor = KANBAN_COLUMN_COLORS[task.status] || '#6b7280';
  const isOverdue = task.status !== 'completed' && task.status !== 'cancelled' &&
    task.end_date && task.end_date < today;

  if (!task.start_date || !task.end_date) {
    // No-date tasks — just render a label row
    return (
      <g>
        <rect x={0} y={y} width={totalWidth} height={ROW_H}
          fill="transparent" className="gantt-row-hover"
          style={{ cursor: 'pointer' }}
          onClick={() => onEdit(task)}
        />
        <text x={8} y={y + ROW_H / 2 + 4} fontSize={11} fill="#9ca3af" fontStyle="italic">
          No dates set
        </text>
      </g>
    );
  }

  const x1   = Math.max(0, dateToX(task.start_date, rangeStart, pxPerMs));
  const x2   = Math.min(totalWidth, dateToX(task.end_date, rangeStart, pxPerMs) + pxPerMs * 86_400_000);
  const barW  = Math.max(4, x2 - x1);
  const progW = barW * (task.progress / 100);

  return (
    <g
      style={{ cursor: 'pointer' }}
      onClick={() => onEdit(task)}
      onMouseEnter={() => setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {/* Row bg */}
      <rect x={0} y={y} width={totalWidth} height={ROW_H} fill="transparent" />

      {/* Bar track */}
      <rect
        x={x1} y={y + 10} width={barW} height={ROW_H - 20}
        rx={4}
        fill={isOverdue ? '#fca5a5' : `${barColor}28`}
        stroke={isOverdue ? '#ef4444' : barColor}
        strokeWidth={isOverdue ? 2 : 1}
      />

      {/* Progress fill */}
      {progW > 0 && (
        <rect
          x={x1} y={y + 10} width={progW} height={ROW_H - 20}
          rx={4}
          fill={isOverdue ? '#ef444466' : `${barColor}90`}
        />
      )}

      {/* Task label inside bar */}
      {barW > 50 && (
        <text
          x={x1 + 6} y={y + ROW_H / 2 + 4}
          fontSize={10} fontWeight={500}
          fill={isOverdue ? '#991b1b' : '#1e293b'}
          clipPath={`url(#clip-${task.id})`}
        >
          {task.task_number != null ? `#${task.task_number} ` : ''}{task.title}
        </text>
      )}
      <defs>
        <clipPath id={`clip-${task.id}`}>
          <rect x={x1} y={y} width={barW} height={ROW_H} />
        </clipPath>
      </defs>

      {/* Progress % */}
      {task.progress > 0 && barW > 40 && (
        <text
          x={x1 + barW - 4} y={y + ROW_H / 2 + 4}
          fontSize={9} fill="#fff"
          textAnchor="end" fontWeight={700}
        >
          {task.progress}%
        </text>
      )}

      {/* Overdue icon */}
      {isOverdue && (
        <text x={x2 + 4} y={y + ROW_H / 2 + 4} fontSize={10} fill="#ef4444">⚠</text>
      )}

      {/* Tooltip */}
      {tooltip && (
        <g>
          <rect
            x={Math.min(x1, totalWidth - 180)}
            y={y - 58}
            width={170} height={54}
            rx={6} fill="#1e293b" opacity={0.95}
          />
          <text x={Math.min(x1 + 8, totalWidth - 172)} y={y - 42} fontSize={11} fontWeight={600} fill="white">
            {task.task_number != null ? `#${task.task_number} ` : ''}{task.title.slice(0, 22)}{task.title.length > 22 ? '…' : ''}
          </text>
          <text x={Math.min(x1 + 8, totalWidth - 172)} y={y - 28} fontSize={10} fill="#94a3b8">
            {task.start_date} → {task.end_date}
          </text>
          <text x={Math.min(x1 + 8, totalWidth - 172)} y={y - 14} fontSize={10} fill="#94a3b8">
            {TASK_STATUS_LABELS[task.status]} · {task.progress}% done
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Main Gantt ───────────────────────────────────────────────────────────────

type Props = {
  tasks: EnhancedProjectTask[];
  projectStartDate: string | null;
  projectEndDate: string | null;
  onEditTask: (task: EnhancedProjectTask) => void;
};

export function ProjectGanttView({ tasks, projectStartDate, projectEndDate, onEditTask }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>('month');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Build sorted flat task list ──────────────────────────────────────────
  const flatTasks = useMemo<GanttTask[]>(() => {
    const childrenMap = new Map<string | null, EnhancedProjectTask[]>();
    tasks.forEach(t => {
      const key = t.parent_task_id ?? null;
      if (!childrenMap.has(key)) childrenMap.set(key, []);
      childrenMap.get(key)!.push(t);
    });

    const result: GanttTask[] = [];
    function walk(parentId: string | null, level: number) {
      const children = childrenMap.get(parentId) ?? [];
      children.sort((a, b) => a.sort_order - b.sort_order);
      children.forEach(t => {
        const hasChildren = (childrenMap.get(t.id)?.length ?? 0) > 0;
        const collapsed = collapsedGroups.has(t.id);
        result.push({ ...t, _level: level, _hasChildren: hasChildren, _collapsed: collapsed });
        if (hasChildren && !collapsed) walk(t.id, level + 1);
      });
    }
    walk(null, 0);
    return result;
  }, [tasks, collapsedGroups]);

  // ─── Compute date range ───────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates: number[] = [];
    flatTasks.forEach(t => {
      if (t.start_date) dates.push(new Date(t.start_date + 'T00:00:00').getTime());
      if (t.end_date)   dates.push(new Date(t.end_date   + 'T00:00:00').getTime());
    });
    if (projectStartDate) dates.push(new Date(projectStartDate + 'T00:00:00').getTime());
    if (projectEndDate)   dates.push(new Date(projectEndDate   + 'T00:00:00').getTime());

    const BUFFER = 7 * 86_400_000;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const minDate = dates.length ? Math.min(...dates) - BUFFER : now - 14 * 86_400_000;
    const maxDate = dates.length ? Math.max(...dates) + BUFFER : now + 30 * 86_400_000;

    return { rangeStart: minDate, rangeEnd: maxDate };
  }, [flatTasks, projectStartDate, projectEndDate]);

  // ─── Build periods ────────────────────────────────────────────────────────
  const periods = useMemo(
    () => buildPeriods(new Date(rangeStart), new Date(rangeEnd), zoom),
    [rangeStart, rangeEnd, zoom],
  );

  const totalWidth = useMemo(() => {
    if (periods.length === 0) return 800;
    const lastPeriod = periods[periods.length - 1];
    return (periodEndMs(lastPeriod, zoom) - rangeStart) *
      (ZOOM_CONFIGS[zoom].colWidthPx / (zoom === 'day' ? 86_400_000 : 1));
  }, [periods, rangeStart, zoom]);

  const pxPerMs = useMemo(() => {
    if (periods.length === 0) return 1 / 86_400_000;
    const firstEnd = periodEndMs(periods[0], zoom);
    const firstW   = ZOOM_CONFIGS[zoom].colWidthPx;
    return firstW / (firstEnd - periods[0].getTime());
  }, [periods, zoom]);

  const todayX = useMemo(
    // eslint-disable-next-line react-hooks/purity
    () => (Date.now() - rangeStart) * pxPerMs,
    [rangeStart, pxPerMs],
  );

  // ─── Zoom handlers ────────────────────────────────────────────────────────
  const ZOOM_ORDER: ZoomLevel[] = ['day', 'week', 'month', 'quarter'];
  const zoomIn  = () => setZoom(z => ZOOM_ORDER[Math.max(0, ZOOM_ORDER.indexOf(z) - 1)]);
  const zoomOut = () => setZoom(z => ZOOM_ORDER[Math.min(3, ZOOM_ORDER.indexOf(z) + 1)]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const svgH = HDR_H + (ZOOM_CONFIGS[zoom].subFn ? SUB_H : 0) + ROW_H * flatTasks.length + 20;

  const today = new Date().toISOString().slice(0, 10);

  if (flatTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">No tasks to display in Gantt view.</p>
        <p className="text-xs text-gray-400 mt-1">Add tasks with start and due dates to see the timeline.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-medium text-gray-500">Zoom:</span>
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {ZOOM_ORDER.map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                zoom === z
                  ? 'bg-white text-gray-800 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {ZOOM_CONFIGS[z].label}
            </button>
          ))}
        </div>
        <button onClick={zoomIn}  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ZoomIn  className="w-3.5 h-3.5" />
        </button>
        <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> Today</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-200 border border-green-400 rounded-sm inline-block" /> Completed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-200 border border-red-400 rounded-sm inline-block" /> Overdue</span>
        </div>
      </div>

      {/* Gantt container */}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
        <div className="flex">
          {/* Left: Task name panel */}
          <div
            className="shrink-0 border-r border-gray-200 overflow-hidden"
            style={{ width: `${LABEL_W}px` }}
          >
            {/* Header */}
            <div
              className="flex items-center px-3 border-b border-gray-200 bg-gray-50"
              style={{ height: `${HDR_H + (ZOOM_CONFIGS[zoom].subFn ? SUB_H : 0)}px` }}
            >
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</span>
            </div>

            {/* Task name rows */}
            <div className="overflow-y-hidden">
              {flatTasks.map((task, idx) => {
                const isOverdue = task.status !== 'completed' && task.status !== 'cancelled' &&
                  task.end_date && task.end_date < today;
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-1.5 px-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    style={{ height: `${ROW_H}px`, paddingLeft: `${8 + task._level * 16}px` }}
                    onClick={() => onEditTask(task)}
                  >
                    {task._hasChildren ? (
                      <button
                        onClick={e => { e.stopPropagation(); toggleCollapse(task.id); }}
                        className="shrink-0 text-gray-400 hover:text-gray-600"
                      >
                        {task._collapsed
                          ? <ChevronRight className="w-3 h-3" />
                          : <ChevronDown  className="w-3 h-3" />
                        }
                      </button>
                    ) : (
                      <span className="w-3 h-3 shrink-0" />
                    )}

                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${TASK_STATUS_DOT[task.status]}`}
                    />

                    <span className={`text-xs truncate flex-1 ${
                      task.status === 'completed' ? 'line-through text-gray-400' :
                      isOverdue ? 'text-red-600 font-medium' : 'text-gray-700'
                    }`}>
                      {task.task_number != null ? `#${task.task_number} ` : ''}{task.title}
                      {task.phase && (
                        <span className="text-[10px] text-gray-400 ml-1">({task.phase})</span>
                      )}
                    </span>

                    {isOverdue && (
                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: SVG timeline */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
            <svg
              width={totalWidth}
              height={svgH}
              className="block"
              style={{ minWidth: `${totalWidth}px` }}
            >
              {/* ── Period headers ── */}
              {periods.map((p, i) => {
                const pStart = p.getTime();
                const pEnd   = periodEndMs(p, zoom);
                const x      = (pStart - rangeStart) * pxPerMs;
                const w      = (pEnd - pStart) * pxPerMs;
                const isWeekend = zoom === 'day' && (p.getDay() === 0 || p.getDay() === 6);

                return (
                  <g key={i}>
                    {/* Column background */}
                    {isWeekend && (
                      <rect x={x} y={0} width={w} height={svgH} fill="#f9fafb" />
                    )}
                    {/* Header cell */}
                    <rect x={x} y={0} width={w} height={HDR_H} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.5} />
                    <text x={x + w / 2} y={HDR_H / 2 + 5} fontSize={11} fontWeight={600}
                      fill="#475569" textAnchor="middle">
                      {ZOOM_CONFIGS[zoom].headerFn(p)}
                    </text>

                    {/* Sub-header */}
                    {ZOOM_CONFIGS[zoom].subFn && (
                      <>
                        <rect x={x} y={HDR_H} width={w} height={SUB_H} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={0.5} />
                        <text x={x + w / 2} y={HDR_H + SUB_H / 2 + 4} fontSize={9}
                          fill="#94a3b8" textAnchor="middle">
                          {ZOOM_CONFIGS[zoom].subFn!(p)}
                        </text>
                      </>
                    )}

                    {/* Vertical divider */}
                    <line x1={x} y1={0} x2={x} y2={svgH} stroke="#e2e8f0" strokeWidth={0.5} />
                  </g>
                );
              })}

              {/* ── Row grid lines ── */}
              {flatTasks.map((_, idx) => {
                const y = HDR_H + (ZOOM_CONFIGS[zoom].subFn ? SUB_H : 0) + idx * ROW_H;
                return (
                  <g key={`row-${idx}`}>
                    <rect x={0} y={y} width={totalWidth} height={ROW_H}
                      fill={idx % 2 === 0 ? 'transparent' : '#f9fafb'}
                    />
                    <line x1={0} y1={y + ROW_H} x2={totalWidth} y2={y + ROW_H}
                      stroke="#f1f5f9" strokeWidth={1}
                    />
                  </g>
                );
              })}

              {/* ── Task bars ── */}
              {flatTasks.map((task, idx) => {
                const y = HDR_H + (ZOOM_CONFIGS[zoom].subFn ? SUB_H : 0) + idx * ROW_H;
                return (
                  <GanttRow
                    key={task.id}
                    task={task}
                    y={y}
                    rangeStart={rangeStart}
                    pxPerMs={pxPerMs}
                    totalWidth={totalWidth}
                    onEdit={t => onEditTask(t)}
                  />
                );
              })}

              {/* ── Today line ── */}
              {todayX >= 0 && todayX <= totalWidth && (
                <>
                  <line
                    x1={todayX} y1={0} x2={todayX} y2={svgH}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3"
                    opacity={0.8}
                  />
                  <rect x={todayX - 18} y={2} width={36} height={16} rx={3} fill="#ef4444" />
                  <text x={todayX} y={13} fontSize={9} fontWeight={700} fill="white" textAnchor="middle">
                    TODAY
                  </text>
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-gray-400">
        <span className="font-medium text-gray-500">Status:</span>
        {(['in_progress', 'completed', 'blocked', 'cancelled'] as const).map(s => (
          <span key={s} className="flex items-center gap-1">
            <span className="w-8 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: `${KANBAN_COLUMN_COLORS[s]}50`, border: `1px solid ${KANBAN_COLUMN_COLORS[s]}` }}
            />
            {TASK_STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
