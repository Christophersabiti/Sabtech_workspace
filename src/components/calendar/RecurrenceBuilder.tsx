'use client';

import { useState, useEffect } from 'react';
import { Repeat, X } from 'lucide-react';
import { buildRRule, describeRRule, RRULE_PRESETS, parseRRule, type RRuleDay } from '@/lib/calendar/rruleUtils';

type Props = {
  value: string;
  onChange: (rrule: string) => void;
};

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 'SU' },
  { label: 'Mon', value: 'MO' },
  { label: 'Tue', value: 'TU' },
  { label: 'Wed', value: 'WE' },
  { label: 'Thu', value: 'TH' },
  { label: 'Fri', value: 'FR' },
  { label: 'Sat', value: 'SA' },
];

export function RecurrenceBuilder({ value, onChange }: Props) {
  const [open, setOpen]       = useState(!!value);
  const [freq, setFreq]       = useState<Freq>('WEEKLY');
  const [interval, setInterval] = useState(1);
  const [days, setDays]       = useState<string[]>(['MO']);
  const [endType, setEndType] = useState<'never' | 'count' | 'until'>('never');
  const [count, setCount]     = useState(10);
  const [until, setUntil]     = useState('');

  // Parse initial RRULE into local state
  useEffect(() => {
    if (!value) return;
    const parsed = parseRRule(value);
    if (parsed.freq)     setFreq(parsed.freq as Freq);
    if (parsed.interval) setInterval(parsed.interval);
    if (parsed.byDay?.length) setDays(parsed.byDay);
    if (parsed.count)    { setEndType('count'); setCount(parsed.count); }
    else if (parsed.until) { setEndType('until'); setUntil(parsed.until.split('T')[0]); }
    setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync(overrides?: Partial<{ freq: Freq; interval: number; days: string[]; endType: string; count: number; until: string }>) {
    const f = overrides?.freq ?? freq;
    const i = overrides?.interval ?? interval;
    const d = overrides?.days ?? days;
    const et = overrides?.endType ?? endType;
    const c = overrides?.count ?? count;
    const u = overrides?.until ?? until;

    const rule = buildRRule({
      freq: f,
      interval: i,
      byDay: f === 'WEEKLY' ? (d as RRuleDay[]) : undefined,
      count: et === 'count' ? c : undefined,
      until: et === 'until' && u ? u : undefined,
    });
    onChange(rule);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); sync(); }}
        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium"
      >
        <Repeat className="w-4 h-4" />
        Add recurrence
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
          <Repeat className="w-4 h-4 text-blue-500" />
          Recurring event
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); onChange(''); }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {RRULE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.rule)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              value === p.rule
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider pt-1">Custom</div>

      {/* Frequency + interval */}
      <div className="flex items-center gap-2 flex-wrap text-sm text-slate-700 dark:text-slate-300">
        <span>Every</span>
        <input
          type="number"
          min={1}
          max={99}
          value={interval}
          onChange={(e) => { const v = Math.max(1, Number(e.target.value)); setInterval(v); sync({ interval: v }); }}
          className="w-16 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={freq}
          onChange={(e) => { const v = e.target.value as Freq; setFreq(v); sync({ freq: v }); }}
          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
        >
          <option value="DAILY">day(s)</option>
          <option value="WEEKLY">week(s)</option>
          <option value="MONTHLY">month(s)</option>
          <option value="YEARLY">year(s)</option>
        </select>
      </div>

      {/* Days of week (only for WEEKLY) */}
      {freq === 'WEEKLY' && (
        <div className="flex gap-1 flex-wrap">
          {DAYS_OF_WEEK.map((d) => {
            const sel = days.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => {
                  const next = sel
                    ? days.filter((x) => x !== d.value)
                    : [...days, d.value];
                  if (!next.length) return;
                  setDays(next);
                  sync({ days: next });
                }}
                className={`w-10 h-8 text-xs font-medium rounded-lg border transition-all ${
                  sel
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-blue-300'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {/* End condition */}
      <div className="flex items-center gap-3 flex-wrap text-sm text-slate-700 dark:text-slate-300">
        <span>Ends</span>
        <select
          value={endType}
          onChange={(e) => { const v = e.target.value as typeof endType; setEndType(v); sync({ endType: v }); }}
          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
        >
          <option value="never">never</option>
          <option value="count">after N occurrences</option>
          <option value="until">on date</option>
        </select>
        {endType === 'count' && (
          <input
            type="number"
            min={1}
            max={999}
            value={count}
            onChange={(e) => { const v = Math.max(1, Number(e.target.value)); setCount(v); sync({ count: v }); }}
            className="w-20 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {endType === 'until' && (
          <input
            type="date"
            value={until}
            onChange={(e) => { setUntil(e.target.value); sync({ until: e.target.value }); }}
            className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 dark:text-slate-300"
          />
        )}
      </div>

      {/* Human-readable description */}
      {value && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">
          {describeRRule(value)}
        </p>
      )}
    </div>
  );
}
