import { addDays, parseDate, toDateStr } from './dates';
import { step } from './recurrence';
import type { DateStr, Recurrence } from './types';

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Monday of the week containing `d`. */
export function startOfWeek(d: DateStr): DateStr {
  const dow = (parseDate(d).getDay() + 6) % 7; // Monday = 0
  return addDays(d, -dow);
}

export function weekDays(d: DateStr): DateStr[] {
  const start = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Full Monday-first weeks covering the month `key` ("YYYY-MM"). */
export function monthGrid(key: string): DateStr[] {
  const first = `${key}-01`;
  const [y, m] = key.split('-').map(Number);
  const last = toDateStr(new Date(y, m, 0));
  const days: DateStr[] = [];
  for (let d = startOfWeek(first); d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Dates a recurring task will fall on in [from, to], not stored anywhere yet.
 * Starts after both the current occurrence and today: today's work is the
 * current (possibly overdue) occurrence itself. Dates in `taken` already have a record.
 */
export function projectOccurrences(
  anchor: { dueDate: DateStr; recurrence: Recurrence | null },
  from: DateStr,
  to: DateStr,
  todayStr: DateStr,
  taken: Set<DateStr> = new Set(),
): DateStr[] {
  if (!anchor.recurrence) return [];
  const out: DateStr[] = [];
  const floor = anchor.dueDate > todayStr ? anchor.dueDate : todayStr;
  let d = step(anchor.dueDate, anchor.recurrence);
  for (let i = 0; d <= to && i < 2000; i++, d = step(d, anchor.recurrence)) {
    if (d > floor && d >= from && !taken.has(d)) out.push(d);
  }
  return out;
}
