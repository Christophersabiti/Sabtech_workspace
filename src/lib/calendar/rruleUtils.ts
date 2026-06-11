// RRULE utilities — build, parse, and describe recurrence rules without a full library.
// Supports: DAILY, WEEKLY (with specific days), MONTHLY, YEARLY.

export type RRuleFreq  = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RRuleDay   = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type RRuleConfig = {
  freq:       RRuleFreq;
  interval:   number;
  byDay?:     RRuleDay[];   // WEEKLY only
  byMonthDay?: number;      // MONTHLY: day of month
  count?:     number;       // end after N occurrences
  until?:     string;       // YYYY-MM-DD end date
};

const DAY_LABELS: Record<RRuleDay, string> = {
  MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
};

export function buildRRule(config: RRuleConfig): string {
  const parts: string[] = [`FREQ=${config.freq}`];
  if (config.interval > 1) parts.push(`INTERVAL=${config.interval}`);
  if (config.byDay?.length) parts.push(`BYDAY=${config.byDay.join(',')}`);
  if (config.byMonthDay)    parts.push(`BYMONTHDAY=${config.byMonthDay}`);
  if (config.count)         parts.push(`COUNT=${config.count}`);
  if (config.until)         parts.push(`UNTIL=${config.until.replace(/-/g, '')}T000000Z`);
  return parts.join(';');
}

export function parseRRule(rule: string): Partial<RRuleConfig> {
  const cfg: Partial<RRuleConfig> = {};
  for (const part of rule.split(';')) {
    const [key, val] = part.split('=');
    switch (key) {
      case 'FREQ':       cfg.freq       = val as RRuleFreq; break;
      case 'INTERVAL':   cfg.interval   = Number(val); break;
      case 'BYDAY':      cfg.byDay      = val.split(',') as RRuleDay[]; break;
      case 'BYMONTHDAY': cfg.byMonthDay = Number(val); break;
      case 'COUNT':      cfg.count      = Number(val); break;
      case 'UNTIL': {
        const y = val.slice(0, 4), m = val.slice(4, 6), d = val.slice(6, 8);
        cfg.until = `${y}-${m}-${d}`;
        break;
      }
    }
  }
  return cfg;
}

export function describeRRule(rule: string): string {
  const cfg = parseRRule(rule);
  if (!cfg.freq) return rule;

  const interval = cfg.interval ?? 1;

  let base = '';
  switch (cfg.freq) {
    case 'DAILY':
      base = interval === 1 ? 'Every day' : `Every ${interval} days`;
      break;
    case 'WEEKLY':
      if (cfg.byDay?.length) {
        const days = cfg.byDay.map((d) => DAY_LABELS[d]).join(', ');
        base = interval === 1
          ? `Every week on ${days}`
          : `Every ${interval} weeks on ${days}`;
      } else {
        base = interval === 1 ? 'Every week' : `Every ${interval} weeks`;
      }
      break;
    case 'MONTHLY':
      base = cfg.byMonthDay
        ? `Monthly on the ${ordinal(cfg.byMonthDay)}`
        : (interval === 1 ? 'Every month' : `Every ${interval} months`);
      break;
    case 'YEARLY':
      base = 'Every year';
      break;
    default:
      base = rule;
  }

  if (cfg.count)  return `${base}, ${cfg.count} times`;
  if (cfg.until)  return `${base}, until ${new Date(cfg.until).toLocaleDateString()}`;
  return `${base}, indefinitely`;
}

function ordinal(n: number): string {
  if (n === 1 || n === 21 || n === 31) return `${n}st`;
  if (n === 2 || n === 22)             return `${n}nd`;
  if (n === 3 || n === 23)             return `${n}rd`;
  return `${n}th`;
}

export const RRULE_PRESETS: Array<{ label: string; rule: string }> = [
  { label: 'Every day',               rule: 'FREQ=DAILY' },
  { label: 'Every weekday (Mon–Fri)', rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week',              rule: 'FREQ=WEEKLY' },
  { label: 'Every 2 weeks',           rule: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month',             rule: 'FREQ=MONTHLY' },
  { label: 'Every year',              rule: 'FREQ=YEARLY' },
];
