import { addDays, addMonths, addYears, parseDate, shortDate, weekdayName } from './dates';
import type { DateStr, Recurrence } from './types';

export function step(date: DateStr, r: Recurrence): DateStr {
  if (r.unit === 'day') return addDays(date, r.interval);
  if (r.unit === 'week') {
    if (r.daysOfWeek && r.daysOfWeek.length > 0) {
      const sortedDays = [...new Set(r.daysOfWeek)].sort((a, b) => a - b);
      const curDay = parseDate(date).getDay();
      const nextSameWeek = sortedDays.find((d) => d > curDay);
      if (nextSameWeek !== undefined) {
        return addDays(date, nextSameWeek - curDay);
      }
      const firstNextWeek = sortedDays[0];
      const daysAhead = 7 * r.interval - curDay + firstNextWeek;
      return addDays(date, daysAhead);
    }
    return addDays(date, r.interval * 7);
  }
  if (r.unit === 'month') return addMonths(date, r.interval);
  if (r.unit === 'year') return addYears(date, r.interval);
  return addDays(date, r.interval);
}

/**
 * Next due date after completing an occurrence due on `dueDate`.
 * Advances by the interval until the date is after `completedOn`, so an overdue
 * chore doesn't spawn a backlog of already-past occurrences, and past any `taken` date.
 * Returns null if the next occurrence exceeds r.endDate.
 */
export function nextOccurrence(dueDate: DateStr, r: Recurrence, completedOn: DateStr, taken?: Set<DateStr>): DateStr | null {
  let next = step(dueDate, r);
  // Skip dates already covered (e.g. ticked ahead in the calendar).
  // Guard against pathological inputs; 1000 steps covers years of daily backlog.
  for (let i = 0; (next <= completedOn || taken?.has(next)) && i < 1000; i++) next = step(next, r);
  if (r.endDate && next > r.endDate) return null;
  return next;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function recurrenceLabel(r: Recurrence | null, dueDate?: DateStr): string {
  if (!r) return 'Does not repeat';
  const { unit, interval, endDate, daysOfWeek } = r;
  let base = '';
  if (unit === 'day') {
    base = interval === 1 ? 'Daily' : `Every ${interval} days`;
  } else if (unit === 'week') {
    if (daysOfWeek && daysOfWeek.length > 0) {
      if (daysOfWeek.length === 7) {
        base = interval === 1 ? 'Daily' : `Every day, every ${interval} weeks`;
      } else if (
        daysOfWeek.length === 5 &&
        [1, 2, 3, 4, 5].every((d) => daysOfWeek.includes(d))
      ) {
        base = interval === 1 ? 'Every weekday' : `Every weekday, every ${interval} weeks`;
      } else {
        const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
        const dayList = sorted.map((d) => DAY_NAMES[d]).join(', ');
        if (interval === 1) {
          base = `Weekly on ${dayList}`;
        } else if (interval === 2) {
          base = `Bi-weekly on ${dayList}`;
        } else {
          base = `Every ${interval} weeks on ${dayList}`;
        }
      }
    } else if (interval === 1) {
      base = dueDate ? `Every ${weekdayName(dueDate)}` : 'Every week';
    } else if (interval === 2) {
      base = 'Bi-weekly';
    } else {
      base = `Every ${interval} weeks`;
    }
  } else if (unit === 'month') {
    if (interval === 1) {
      base = dueDate ? `Monthly on the ${ordinal(parseDate(dueDate).getDate())}` : 'Every month';
    } else {
      base = `Every ${interval} months`;
    }
  } else if (unit === 'year') {
    if (interval === 1) {
      base = 'Yearly';
    } else {
      base = `Every ${interval} years`;
    }
  } else {
    base = `Every ${interval} ${unit}s`;
  }

  if (endDate) {
    return `${base} · Stop after ${shortDate(endDate)}`;
  }
  return base;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const RECURRENCE_PRESETS: { label: string; value: Recurrence | null }[] = [
  { label: 'Never', value: null },
  { label: 'Daily', value: { unit: 'day', interval: 1 } },
  { label: 'Weekly', value: { unit: 'week', interval: 1 } },
  { label: 'Bi-weekly', value: { unit: 'week', interval: 2 } },
  { label: 'Monthly', value: { unit: 'month', interval: 1 } },
];

function sameDaysOfWeek(a?: number[], b?: number[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((v, i) => v === sortedB[i]);
}

export function sameCadence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.unit === b.unit &&
    a.interval === b.interval &&
    sameDaysOfWeek(a.daysOfWeek, b.daysOfWeek)
  );
}

export function sameRecurrence(a: Recurrence | null, b: Recurrence | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.unit === b.unit &&
    a.interval === b.interval &&
    (a.endDate ?? null) === (b.endDate ?? null) &&
    sameDaysOfWeek(a.daysOfWeek, b.daysOfWeek)
  );
}
