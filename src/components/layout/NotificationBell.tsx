'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bell, X, CheckSquare, FolderOpen, FileText,
  AlertTriangle, Clock, Loader2,
} from 'lucide-react';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import type { NotificationItem } from '@/app/api/notifications/route';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TYPE_CONFIG: Record<
  NotificationItem['type'],
  { icon: React.ElementType; color: string; bg: string }
> = {
  task:    { icon: CheckSquare, color: 'text-violet-600', bg: 'bg-violet-50' },
  project: { icon: FolderOpen,  color: 'text-blue-600',   bg: 'bg-blue-50'   },
  invoice: { icon: FileText,    color: 'text-amber-600',  bg: 'bg-amber-50'  },
};

function urgencyColor(daysOverdue: number): string {
  if (daysOverdue >= 14) return 'text-red-600';
  if (daysOverdue >= 7)  return 'text-orange-500';
  if (daysOverdue >= 1)  return 'text-amber-500';
  return 'text-slate-400';
}

function urgencyLabel(daysOverdue: number): string {
  if (daysOverdue === 0) return 'Due today';
  if (daysOverdue === 1) return '1 day overdue';
  return `${daysOverdue} days overdue`;
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  return items.reduce((map, item) => {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
    return map;
  }, new Map<string, T[]>());
}

const GROUP_LABELS: Record<string, string> = {
  task:    'Tasks',
  project: 'Projects',
  invoice: 'Invoices',
};

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const { activeCompanyId } = useActiveCompany();
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState<NotificationItem[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/notifications?companyId=${activeCompanyId}`);
      const data = await res.json().catch(() => ({ total: 0, items: [] }));
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId]);

  // Initial fetch + polling
  useEffect(() => {
    void fetchNotifications();
    const id = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const grouped = groupBy(items, (i) => i.type);

  const badgeCount = total > 99 ? '99+' : total > 0 ? String(total) : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`relative flex items-center gap-2 rounded-xl transition-colors ${
          collapsed
            ? 'justify-center w-full p-3 text-slate-400 hover:text-white hover:bg-slate-800'
            : 'px-3 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 w-full'
        }`}
        title="Notifications"
        aria-label={`Notifications${total > 0 ? `, ${total} unread` : ''}`}
      >
        <span className="relative shrink-0">
          {loading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Bell className="h-5 w-5" />}
          {badgeCount && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
              {badgeCount}
            </span>
          )}
        </span>
        {!collapsed && (
          <span className="text-sm font-medium flex-1 text-left">Notifications</span>
        )}
        {!collapsed && badgeCount && (
          <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
            {badgeCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[200] overflow-hidden"
          style={{ maxHeight: '70vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-400" />
              Notifications
              {total > 0 && (
                <span className="rounded-full bg-red-100 text-red-600 px-2 py-0.5 text-xs font-bold">
                  {total}
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)' }}>
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                <p className="text-sm text-slate-400 font-medium">All caught up!</p>
                <p className="text-xs text-slate-300 mt-0.5">No overdue items right now</p>
              </div>
            ) : (
              <div>
                {(['task', 'project', 'invoice'] as const).map((type) => {
                  const group = grouped.get(type);
                  if (!group || group.length === 0) return null;
                  const cfg = TYPE_CONFIG[type];
                  const TypeIcon = cfg.icon;

                  return (
                    <div key={type}>
                      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                        <TypeIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {GROUP_LABELS[type]} ({group.length})
                        </span>
                      </div>

                      {group.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                        >
                          <span className={`shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg ${cfg.bg}`}>
                            <TypeIcon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate leading-tight">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.subtitle}</p>
                            )}
                            <div className={`flex items-center gap-1 mt-1 text-[10px] font-medium ${urgencyColor(item.days_overdue)}`}>
                              {item.days_overdue >= 7
                                ? <AlertTriangle className="h-3 w-3" />
                                : <Clock className="h-3 w-3" />}
                              {urgencyLabel(item.days_overdue)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50">
              <p className="text-[10px] text-slate-400 text-center">
                {total} overdue item{total !== 1 ? 's' : ''} · Click any to open
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
