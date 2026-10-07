import { addDays, addMonths, parseDate, weekdayName } from './dates';
import type { DateStr, Recurrence } from './types';

export function step(date: DateStr, r: Recurrence): DateStr {
  if (r.unit === 'day') return addDays(date, r.interval);
  if (r.unit === 'week') return addDays(date, r.interval * 7);
  return addMonths(date, r.interval);
}

/**
 * Next due date after completing an occurrence due on `dueDate`.
 * Advances by the interval until the date is after `completedOn`, so an overdue
 * chore doesn't spawn a backlog of already-past occurrences, and past any `taken` date.
 */
export function nextOccurrence(dueDate: DateStr, r: Recurrence, completedOn: DateStr, taken?: Set<DateStr>): DateStr {
  let next = step(dueDate, r);
  // Skip dates already covered (e.g. ticked ahead in the calendar).
  // Guard against pathological inputs; 1000 steps covers years of daily backlog.
  for (let i = 0; (next <= completedOn || taken?.has(next)) && i < 1000; i++) next = step(next, r);
  return next;
}

export function recurrenceLabel(r: Recurrence | null, dueDate?: DateStr): string {
  if (!r) return 'Does not repeat';
  const { unit, interval } = r;
  if (unit === 'day') return interval === 1 ? 'Daily' : `Every ${interval} days`;
  if (unit === 'week') {
    if (interval === 1) return dueDate ? `Every ${weekdayName(dueDate)}` : 'Every week';
    return `Every ${interval} weeks`;
  }
  if (interval === 1) return dueDate ? `Monthly on the ${ordinal(parseDate(dueDate).getDate())}` : 'Every month';
  return `Every ${interval} months`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const RECURRENCE_PRESETS: { label: string; value: Recurrence | null }[] = [
  { label: 'Never', value: null },
  { label: 'Daily', value: { unit: 'day', interval: 1 } },
  { label: 'Every 3 days', value: { unit: 'day', interval: 3 } },
  { label: 'Weekly', value: { unit: 'week', interval: 1 } },
  { label: 'Every 2 weeks', value: { unit: 'week', interval: 2 } },
  { label: 'Monthly', value: { unit: 'month', interval: 1 } },
];

export function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (!a || !b) return a === b;
  return a.unit === b.unit && a.interval === b.interval;
}
