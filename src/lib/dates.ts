import type { DateStr } from './types';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): DateStr {
  return toDateStr(new Date());
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateStr(d);
}

/** Whole days from a to b (b - a). DST-safe because both are local midnights, rounded. */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

export function weekdayName(s: DateStr): string {
  return WEEKDAYS[parseDate(s).getDay()];
}

export function shortWeekday(s: DateStr): string {
  return weekdayName(s).slice(0, 3);
}

/** "24 Sep" */
export function shortDate(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "24 Sep 2026" */
export function longDate(s: DateStr): string {
  return `${shortDate(s)} ${parseDate(s).getFullYear()}`;
}

/** "Thursday, 24 Sep" */
export function headerDate(s: DateStr): string {
  return `${weekdayName(s)}, ${shortDate(s)}`;
}

export function monthKey(s: DateStr): string {
  return s.slice(0, 7);
}

export function monthName(key: string, withYear = false): string {
  const [y, m] = key.split('-').map(Number);
  return withYear ? `${MONTHS_LONG[m - 1]} ${y}` : MONTHS_LONG[m - 1];
}

export function shortMonthName(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}

export function shiftMonth(key: string, n: number): string {
  return monthKey(addMonths(`${key}-01`, n));
}

/** Human label for a due date relative to today: "Today", "Tomorrow", "Saturday", "3 Oct", "Yesterday", "2 days overdue". */
export function relativeDay(s: DateStr, ref: DateStr = today()): string {
  const diff = daysBetween(ref, s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < -1) return `${-diff} days overdue`;
  if (diff < 7) return weekdayName(s);
  return shortDate(s);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
