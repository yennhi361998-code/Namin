import { longDate, parseDate, weekdayName } from '../lib/dates';
import { roomStyle } from '../lib/rooms';
import type { DateStr, Member } from '../lib/types';
import type { DayEntry } from '../store/selectors';
import { cx, Icon } from './ui';

const INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Week as a timetable that fits one phone screen: seven equal columns (Mon–Sun), tasks stacked
 * as compact cards tinted by room, no hour grid. Cards open the task; completing happens there.
 */
export function WeekTimetable({
  days,
  byDay,
  todayStr,
  selected,
  members,
  rangeLabel,
  onSelect,
  onPrev,
  onNext,
  onOpen,
}: {
  days: DateStr[];
  byDay: Map<DateStr, DayEntry[]>;
  todayStr: DateStr;
  selected: DateStr;
  members: Map<string, Member>;
  rangeLabel: string;
  onSelect: (d: DateStr) => void;
  onPrev: () => void;
  onNext: () => void;
  onOpen: (e: DayEntry) => void;
}) {
  return (
    <section className="bg-surface rounded-xl border border-line shadow-card pb-2" aria-label="Week timetable">
      <div className="flex items-center justify-between px-2 pt-2">
        <button type="button" onClick={onPrev} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft" aria-label="Previous week">
          <Icon name="chevron_left" className="text-[22px]" />
        </button>
        <h2 className="text-label-md font-semibold text-ink" aria-live="polite">
          {rangeLabel}
        </h2>
        <button type="button" onClick={onNext} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft" aria-label="Next week">
          <Icon name="chevron_right" className="text-[22px]" />
        </button>
      </div>

      <div className="grid grid-cols-7 px-1">
        {days.map((d, i) => {
          const entries = byDay.get(d) ?? [];
          const isToday = d === todayStr;
          const isSel = d === selected;
          return (
            <div key={d} className={cx('flex flex-col min-w-0 px-[2px] min-h-[200px]', i > 0 && 'border-l border-line/70')}>
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSel}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${weekdayName(d)}, ${longDate(d)}: ${entries.length} task${entries.length === 1 ? '' : 's'}`}
                className={cx('flex flex-col items-center rounded-lg py-1 mb-1 min-h-[48px] transition-colors', isSel ? 'bg-sky' : 'active:bg-soft')}
              >
                <span className={cx('text-caption', isSel ? 'text-ink' : i >= 5 ? 'text-ink-sub/70' : 'text-ink-sub')}>{INITIALS[i]}</span>
                <span
                  className={cx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-label-md font-semibold tabular-nums',
                    isToday && !isSel ? 'ring-2 ring-sky-dark text-link' : 'text-ink',
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
              </button>

              <div className="flex flex-col gap-1">
                {entries.map((e) => {
                  const task = e.task;
                  const room = task.area ? roomStyle(task.area) : null;
                  const who = task.assigneeId ? members.get(task.assigneeId)?.name : 'Anyone';
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpen(e)}
                      title={`${task.title} · ${who}`}
                      aria-label={`${task.title}, ${who}${task.completed ? ', completed' : e.overdue ? ', overdue' : e.projected ? ', scheduled' : ''}. Open details`}
                      className={cx(
                        'w-full text-left rounded-md px-[3px] py-1 active:brightness-95',
                        e.overdue && 'border-l-[3px] border-err-ink',
                        task.completed ? 'opacity-60' : '',
                      )}
                      style={{ background: room?.bg ?? '#E8F5FA' }}
                    >
                      {/* Clamp on the inner span so the button's padding can't reveal an extra line. */}
                      <span
                        lang="en"
                        className={cx('text-[11px] leading-[13px] font-medium line-clamp-4 [hyphens:auto] [overflow-wrap:anywhere]', task.completed ? 'line-through text-ink-sub' : 'text-ink')}
                      >
                        {task.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Week as seven rows (Mon–Sun) on one screen: the day on the left, that day's tasks as
 * room-tinted pills on the right (wrapping), each with its own tick and full title.
 */
export function WeekRows({
  days,
  byDay,
  todayStr,
  selected,
  rangeLabel,
  onSelect,
  onPrev,
  onNext,
  onToggle,
  onOpen,
}: {
  days: DateStr[];
  byDay: Map<DateStr, DayEntry[]>;
  todayStr: DateStr;
  selected: DateStr;
  rangeLabel: string;
  onSelect: (d: DateStr) => void;
  onPrev: () => void;
  onNext: () => void;
  onToggle: (e: DayEntry, date: DateStr) => void;
  onOpen: (e: DayEntry) => void;
}) {
  return (
    <section className="bg-surface rounded-xl border border-line shadow-card pb-1" aria-label="Week">
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <button type="button" onClick={onPrev} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft" aria-label="Previous week">
          <Icon name="chevron_left" className="text-[22px]" />
        </button>
        <h2 className="text-label-md font-semibold text-ink" aria-live="polite">
          {rangeLabel}
        </h2>
        <button type="button" onClick={onNext} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-sub active:bg-soft" aria-label="Next week">
          <Icon name="chevron_right" className="text-[22px]" />
        </button>
      </div>

      <div className="divide-y divide-line">
        {days.map((d, i) => {
          const entries = byDay.get(d) ?? [];
          const isToday = d === todayStr;
          const isSel = d === selected;
          return (
            <div key={d} className="flex items-start gap-2 px-2 py-1">
              <button
                type="button"
                onClick={() => onSelect(d)}
                aria-pressed={isSel}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${weekdayName(d)}, ${longDate(d)}: ${entries.length} task${entries.length === 1 ? '' : 's'}`}
                className={cx('shrink-0 px-1.5 flex items-center gap-1 rounded-lg min-h-[38px] justify-center transition-colors', isSel ? 'bg-sky' : 'active:bg-soft')}
              >
                <span className={cx('text-caption font-medium', isSel ? 'text-ink' : i >= 5 ? 'text-ink-sub/70' : 'text-ink-sub')}>{WEEKDAY_SHORT[i]}</span>
                <span
                  className={cx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-label-sm font-semibold tabular-nums',
                    isToday && !isSel ? 'ring-2 ring-sky-dark text-link' : 'text-ink',
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
              </button>

              <div className="flex-1 min-w-0 flex flex-wrap gap-1 py-1">
                {entries.length === 0 && <span className="text-caption text-ink-sub/70 self-center min-h-[30px] flex items-center">No tasks</span>}
                {entries.map((e) => {
                  const task = e.task;
                  const room = task.area ? roomStyle(task.area) : null;
                  return (
                    <span
                      key={task.id}
                      title={task.title}
                      className={cx('inline-flex items-center max-w-[calc(50%-2px)] rounded-full h-[30px] pr-2.5 border border-black/[0.04]', task.completed && 'opacity-60')}
                      style={{ background: room?.bg ?? '#E8F5FA' }}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={task.completed}
                        aria-label={task.completed ? `Mark ${task.title} not done` : `Complete ${task.title}${e.projected ? ` for ${weekdayName(d)}` : ''}`}
                        onClick={() => onToggle(e, d)}
                        className="w-8 h-[30px] shrink-0 flex items-center justify-center rounded-full"
                      >
                        <span className={cx('w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center', task.completed ? 'bg-sky border-sky' : 'bg-surface border-line-strong')}>
                          {task.completed && <Icon name="check" className="text-[11px] text-ink" />}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpen(e)}
                        aria-label={`${task.title}${task.completed ? ', completed' : e.overdue ? ', overdue' : e.projected ? ', scheduled' : ''}. Open details`}
                        className="min-w-0 flex items-center gap-1 text-left"
                      >
                        {/* Before the title so truncation can't hide it. */}
                        {e.overdue && <span className="w-1.5 h-1.5 rounded-full bg-err-ink shrink-0" aria-hidden />}
                        <span className={cx('min-w-0 text-[12px] leading-4 font-medium truncate', task.completed ? 'line-through text-ink-sub' : 'text-ink')}>{task.title}</span>
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
