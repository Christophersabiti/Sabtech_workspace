import type { EnhancedProjectTask } from './types';

const DAY_MS = 86_400_000;

export function diffIsoDays(fromDate?: string | null, toDate?: string | null) {
  if (!fromDate || !toDate) return null;

  const fromTime = new Date(`${fromDate}T00:00:00`).getTime();
  const toTime = new Date(`${toDate}T00:00:00`).getTime();

  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return Math.round((toTime - fromTime) / DAY_MS);
}

export function getPlannedDueDate(
  task: Pick<EnhancedProjectTask, 'revised_due_date' | 'end_date'>,
) {
  return task.revised_due_date || task.end_date || null;
}

export function getTaskBaselineVariance(
  task: Pick<EnhancedProjectTask, 'baseline_due_date' | 'revised_due_date' | 'end_date'>,
) {
  return diffIsoDays(task.baseline_due_date, getPlannedDueDate(task));
}

export function formatScheduleVariance(days: number) {
  if (days === 0) return 'On baseline';

  const absDays = Math.abs(days);
  const unit = absDays === 1 ? 'day' : 'days';
  return `${days > 0 ? '+' : '-'}${absDays} ${unit} vs baseline`;
}
