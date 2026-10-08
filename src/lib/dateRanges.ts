import { addDays, addMonths, daysBetween, monthKey, parseDate, shiftMonth, toDateStr, today } from './dates';

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

/**
 * Returns the monthKey (YYYY-MM) representing the cycle containing `refDate`.
 * If refDate's day is < startDay, this cycle started in the preceding calendar month.
 */
export function getCurrentCycleMonthKey(refDate: string = today(), startDay = 1): string {
  const [y, m, d] = refDate.split('-').map(Number);
  if (d < startDay) {
    const prevMonthDate = new Date(y, m - 2, 1);
    return monthKey(toDateStr(prevMonthDate));
  }
  return monthKey(refDate);
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
    const start = selection.startDate || '1970-01-01';
    let end = selection.endDate;
    if (!end) {
      if (monthStartDay > 1 && selection.startDate) {
        end = addDays(addMonths(selection.startDate, 1), -1);
      } else {
        end = '2099-12-31';
      }
    }
    return [start, end];
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
      const currentCycleKey = getCurrentCycleMonthKey(t, monthStartDay);
      return getMonthDateRange(currentCycleKey, monthStartDay);
    }
    case 'last_month': {
      const currentCycleKey = getCurrentCycleMonthKey(t, monthStartDay);
      const prevCycleKey = shiftMonth(currentCycleKey, -1);
      return getMonthDateRange(prevCycleKey, monthStartDay);
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

/**
 * Shifts the current date selection to the contiguous adjacent range (before: -1, after: +1).
 * Supports monthly cycles (e.g. 25/09 ~ 24/10 -> 25/08 ~ 24/09), quick options, and custom ranges.
 */
export function shiftDateSelection(
  selection: DateFilterSelection,
  direction: -1 | 1,
  monthStartDay = 1
): DateFilterSelection {
  if (selection.mode === 'month') {
    const nextKey = shiftMonth(selection.monthKey, direction);
    const [start, end] = getMonthDateRange(nextKey, monthStartDay);
    return {
      mode: 'month',
      monthKey: nextKey,
      startDate: start,
      endDate: end,
    };
  }

  if (selection.mode === 'quick') {
    const t = today();
    if (selection.quickOption === 'this_month' || selection.quickOption === 'last_month') {
      const baseKey =
        selection.quickOption === 'this_month'
          ? getCurrentCycleMonthKey(t, monthStartDay)
          : shiftMonth(getCurrentCycleMonthKey(t, monthStartDay), -1);
      const nextKey = shiftMonth(baseKey, direction);
      const [start, end] = getMonthDateRange(nextKey, monthStartDay);
      return {
        mode: 'month',
        monthKey: nextKey,
        startDate: start,
        endDate: end,
      };
    }
  }

  // Custom or other quick ranges: shift by adjacent contiguous block
  const [start, end] = resolveDateRange(selection, monthStartDay);
  if (!start || !end || start === '1970-01-01' || end === '2099-12-31') {
    const currentKey = getCurrentCycleMonthKey(today(), monthStartDay);
    const nextKey = shiftMonth(currentKey, direction);
    const [s, e] = getMonthDateRange(nextKey, monthStartDay);
    return {
      mode: 'month',
      monthKey: nextKey,
      startDate: s,
      endDate: e,
    };
  }

  // Check if range is an exact 1-month cycle (e.g. 25/09 ~ 24/10)
  const isMonthCycle = end === addDays(addMonths(start, 1), -1);
  if (isMonthCycle) {
    if (direction === -1) {
      const newStart = addMonths(start, -1);
      const newEnd = addDays(start, -1);
      return {
        mode: 'custom',
        monthKey: monthKey(newStart),
        startDate: newStart,
        endDate: newEnd,
      };
    } else {
      const newStart = addDays(end, 1);
      const newEnd = addDays(addMonths(newStart, 1), -1);
      return {
        mode: 'custom',
        monthKey: monthKey(newStart),
        startDate: newStart,
        endDate: newEnd,
      };
    }
  }

  // Arbitrary custom duration (N days)
  const duration = daysBetween(start, end) + 1;
  if (direction === -1) {
    const newEnd = addDays(start, -1);
    const newStart = addDays(newEnd, -(duration - 1));
    return {
      mode: 'custom',
      monthKey: monthKey(newStart),
      startDate: newStart,
      endDate: newEnd,
    };
  } else {
    const newStart = addDays(end, 1);
    const newEnd = addDays(newStart, duration - 1);
    return {
      mode: 'custom',
      monthKey: monthKey(newStart),
      startDate: newStart,
      endDate: newEnd,
    };
  }
}

/** Formats user-friendly label for the header */
export function getDisplayRangeLabel(
  selection: DateFilterSelection,
  startDate?: string,
  endDate?: string,
  monthStartDay = 1
): string {
  if (selection.mode === 'month') {
    if (monthStartDay === 1) {
      const [y, m] = selection.monthKey.split('-');
      return `${m}/${y}`;
    }
    return formatDateRange(startDate, endDate);
  }

  if (selection.mode === 'quick') {
    if (selection.quickOption === 'all') return 'All time';
    if (monthStartDay !== 1 && (selection.quickOption === 'this_month' || selection.quickOption === 'last_month')) {
      return formatDateRange(startDate, endDate);
    }
    const item = QUICK_RANGE_OPTIONS.find((o) => o.id === selection.quickOption);
    if (item) return item.label;
  }

  return formatDateRange(startDate, endDate);
}
