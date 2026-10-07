import { useRef } from 'react';
import { WEEKDAY_INITIALS } from '../lib/calendar';
import { longDate, parseDate, weekdayName } from '../lib/dates';
import type { DateStr } from '../lib/types';
import type { DayEntry } from '../store/selectors';
import { cx, Icon } from './ui';

export type CalendarMode = 'week' | 'month';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sep 2026", or "Sep – Oct 2026" for a week spanning two months. */
export function rangeLabel(days: DateStr[], mode: CalendarMode, selected: DateStr) {
  const short = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);
  if (mode === 'month') {
    const d = parseDate(selected);
    return `${short(d)} ${d.getFullYear()}`;
  }
  const a = parseDate(days[0]);
  const b = parseDate(days[days.length - 1]);
  if (a.getMonth() === b.getMonth()) return `${short(a)} ${a.getFullYear()}`;
  return a.getFullYear() === b.getFullYear() ? `${short(a)} – ${short(b)} ${b.getFullYear()}` : `${short(a)} ’${String(a.getFullYear()).slice(2)} – ${short(b)} ’${String(b.getFullYear()).slice(2)}`;
}

function summarize(entries: DayEntry[] = []) {
  const open = entries.filter((e) => !e.task.completed).length;
  const overdue = entries.filter((e) => e.overdue).length;
  return { total: entries.length, open, overdue, allDone: entries.length > 0 && open === 0 };
}

const MAX_DOTS = 3;

/** One dot per open task, up to three: red for overdue (shown first), blue for the rest. A check when all done. */
function Markers({ entries }: { entries?: DayEntry[] }) {
  const s = summarize(entries);
  if (!s.total) return <span className="h-3" aria-hidden />;
  if (s.allDone) return <Icon name="check" className="text-[13px] text-done-ink font-bold h-3 !leading-3" />;
  const red = Math.min(MAX_DOTS, s.overdue);
  const blue = Math.min(MAX_DOTS - red, s.open - s.overdue);
  return (
    <span className="h-3 flex items-center justify-center gap-[3px]" aria-hidden>
      {Array.from({ length: red }, (_, i) => (
        <span key={`r${i}`} className="w-[5px] h-[5px] rounded-full bg-err-ink" />
      ))}
      {Array.from({ length: blue }, (_, i) => (
        <span key={`b${i}`} className="w-[5px] h-[5px] rounded-full bg-sky-dark" />
      ))}
    </span>
  );
}

function dayLabel(d: DateStr, entries?: DayEntry[]) {
  const s = summarize(entries);
  const parts = [`${weekdayName(d)}, ${longDate(d)}`];
  if (s.total) parts.push(s.allDone ? 'all done' : `${s.open} to do`);
  if (s.overdue) parts.push(`${s.overdue} overdue`);
  return parts.join(', ');
}

export function Calendar({
  mode,
  days,
  selected,
  todayStr,
  byDay,
  onSelect,
  onPrev,
  onNext,
}: {
  mode: CalendarMode;
  days: DateStr[];
  selected: DateStr;
  todayStr: DateStr;
  byDay: Map<DateStr, DayEntry[]>;
  onSelect: (d: DateStr) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const month = selected.slice(0, 7);

  return (
    <section className="bg-surface rounded-xl border border-line shadow-card px-2 pt-2 pb-2.5" aria-label="Calendar">
      <div className="flex items-center justify-center">
        <div className="flex items-center justify-between w-full">
          <button type="button" onClick={onPrev} className="w-9 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft shrink-0" aria-label={mode === 'week' ? 'Previous week' : 'Previous month'}>
            <Icon name="chevron_left" className="text-[22px]" />
          </button>
          <h2 className="text-label-md font-semibold text-ink whitespace-nowrap" aria-live="polite">
            {rangeLabel(days, mode, selected)}
          </h2>
          <button type="button" onClick={onNext} className="w-9 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft shrink-0" aria-label={mode === 'week' ? 'Next week' : 'Next month'}>
            <Icon name="chevron_right" className="text-[22px]" />
          </button>
        </div>
      </div>

      <div
        className="touch-pan-y select-none"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) (dx < 0 ? onNext : onPrev)();
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        <div className="grid grid-cols-7 mt-1" aria-hidden>
          {WEEKDAY_INITIALS.map((w, i) => (
            <span key={i} className={cx('text-center text-caption', i >= 5 ? 'text-ink-sub/70' : 'text-ink-sub')}>
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 mt-1">
          {days.map((d) => {
            const isSel = d === selected;
            const isToday = d === todayStr;
            const outside = mode === 'month' && d.slice(0, 7) !== month;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSel}
                aria-current={isToday ? 'date' : undefined}
                aria-label={dayLabel(d, byDay.get(d))}
                className="flex flex-col items-center gap-0.5 py-1 min-h-[48px] rounded-lg active:bg-soft/60"
              >
                <span
                  className={cx(
                    'w-9 h-9 rounded-full flex items-center justify-center text-body-md tabular-nums transition-colors',
                    isSel ? 'bg-sky text-ink font-semibold' : isToday ? 'ring-2 ring-sky-dark text-link font-semibold' : outside ? 'text-ink-sub/50' : 'text-ink',
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
                <Markers entries={byDay.get(d)} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
