import { addDays, monthKey, parseDate, toDateStr, today } from './dates';

export type QuickRangeOption =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days';

export interface QuickOptionItem {
  id: QuickRangeOption;
  label: string;
}

export const QUICK_RANGE_OPTIONS: QuickOptionItem[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'This Week' },
  { id: 'last_week', label: 'Last Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_year', label: 'Last Year' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_90_days', label: 'Last 90 Days' },
];

export interface DateFilterSelection {
  mode: 'month' | 'quick' | 'custom';
  monthKey: string; // e.g. "2026-10"
  quickOption?: QuickRangeOption;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

/** Formats date range as e.g. "01/10 - 15/10/2026" or "01/10/2026" */
export function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return 'All time';
  if (start && !end) {
    const [y, m, d] = start.split('-');
    return `From ${d}/${m}/${y}`;
  }
  if (!start && end) {
    const [y, m, d] = end.split('-');
    return `Until ${d}/${m}/${y}`;
  }
  if (start === end) {
    const [y, m, d] = start!.split('-');
    return `${d}/${m}/${y}`;
  }
  const [y1, m1, d1] = start!.split('-');
  const [y2, m2, d2] = end!.split('-');
  if (y1 === y2) {
    return `${d1}/${m1} - ${d2}/${m2}/${y1}`;
  }
  return `${d1}/${m1}/${y1} - ${d2}/${m2}/${y2}`;
}

const MONTH_START_DAY_KEY = 'namin:month-start-day';

export function getSavedMonthStartDay(): number {
  try {
    const val = localStorage.getItem(MONTH_START_DAY_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (parsed >= 1 && parsed <= 28) return parsed;
    }
  } catch {}
  return 1;
}

export function saveMonthStartDay(day: number): void {
  try {
    localStorage.setItem(MONTH_START_DAY_KEY, String(day));
  } catch {}
}

/** Given a monthKey (YYYY-MM) and monthStartDay (1-28), returns [startDate, endDate] strings */
export function getMonthDateRange(key: string, startDay = 1): [string, string] {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, Math.min(startDay, 28));
  const end = new Date(y, m, Math.min(startDay, 28) - 1);
  return [toDateStr(start), toDateStr(end)];
}

/** Calculate exact [start, end] date strings from selection and monthStartDay settings */
export function resolveDateRange(selection: DateFilterSelection, monthStartDay = 1): [string, string] {
  const t = today();
  const d = parseDate(t);

  if (selection.mode === 'custom') {
    return [selection.startDate || '1970-01-01', selection.endDate || '2099-12-31'];
  }

  if (selection.mode === 'month') {
    return getMonthDateRange(selection.monthKey, monthStartDay);
  }

  const opt = selection.quickOption || 'all';

  switch (opt) {
    case 'all':
      return ['', ''];
    case 'today':
      return [t, t];
    case 'yesterday': {
      const prev = addDays(t, -1);
      return [prev, prev];
    }
    case 'this_week': {
      const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday
      const distanceToMon = (dayOfWeek + 6) % 7;
      const mon = addDays(t, -distanceToMon);
      const sun = addDays(mon, 6);
      return [mon, sun];
    }
    case 'last_week': {
      const dayOfWeek = d.getDay();
      const distanceToMon = (dayOfWeek + 6) % 7;
      const thisMon = addDays(t, -distanceToMon);
      const lastMon = addDays(thisMon, -7);
      const lastSun = addDays(lastMon, 6);
      return [lastMon, lastSun];
    }
    case 'this_month': {
      const currentKey = monthKey(t);
      return getMonthDateRange(currentKey, monthStartDay);
    }
    case 'last_month': {
      const currentKey = monthKey(t);
      const [y, m] = currentKey.split('-').map(Number);
      const prevMonthDate = new Date(y, m - 2, 1);
      const prevKey = monthKey(toDateStr(prevMonthDate));
      return getMonthDateRange(prevKey, monthStartDay);
    }
    case 'this_year': {
      const yr = d.getFullYear();
      return [`${yr}-01-01`, `${yr}-12-31`];
    }
    case 'last_year': {
      const yr = d.getFullYear() - 1;
      return [`${yr}-01-01`, `${yr}-12-31`];
    }
    case 'last_7_days':
      return [addDays(t, -6), t];
    case 'last_30_days':
      return [addDays(t, -29), t];
    case 'last_90_days':
      return [addDays(t, -89), t];
    default:
      return ['', ''];
  }
}
