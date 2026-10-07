import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, rangeLabel, type CalendarMode } from '../components/calendar';
import { WeekRows, WeekTimetable } from '../components/timetable';
import { ActionSheet, SwipeRow, type SheetAction } from '../components/overlay';
import { TaskRow } from '../components/rows';
import { AssigneeFilter, BrandHeader, Fab, PillTabs, ScreenTitle } from '../components/shell';
import { EmptyState, Icon, NotePaper, paperRowBg, SectionHeader } from '../components/ui';
import { monthGrid, weekDays } from '../lib/calendar';
import { addDays, addMonths, monthKey, shortDate, today, weekdayName } from '../lib/dates';
import type { DateStr, Task } from '../lib/types';
import { useStore } from '../store';
import { completeOccurrence, deleteTask, postponeTask, toggleTask } from '../store/actions';
import { useMembers, useTasksByDay, type DayEntry } from '../store/selectors';
import { matchesAssignee, openSheet, toast, useUi } from '../store/ui';

const MODE_KEY = 'namin:calendar-view';
/** Week view layout: seven rows with task pills, or seven columns (timetable). */
const WEEK_LAYOUT: 'rows' | 'columns' = 'rows';

// Per-device preference; falls back to week when storage is unavailable.
function readMode(): CalendarMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

function dayTitle(d: DateStr, t: DateStr) {
  const name = d === t ? 'Today' : d === addDays(t, 1) ? 'Tomorrow' : d === addDays(t, -1) ? 'Yesterday' : weekdayName(d);
  return `${name} · ${shortDate(d)}`;
}

export function Tasks() {
  const [params, setParams] = useSearchParams();
  const t = today();
  const raw = params.get('date');
  const selected: DateStr = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : t;
  const select = (d: DateStr) => setParams(d === t ? {} : { date: d }, { replace: true });

  const [mode, setModeState] = useState<CalendarMode>(readMode);
  const setMode = (m: CalendarMode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* preference only */
    }
  };

  const days = mode === 'week' ? weekDays(selected) : monthGrid(monthKey(selected));
  const allByDay = useTasksByDay(days[0], days[days.length - 1]);
  const assignee = useUi((s) => s.assignee);
  const tasks = useStore((s) => s.tasks);
  const members = useMembers();
  const filter = assignee && members.has(assignee) ? assignee : null;
  const byDay = useMemo(() => {
    if (!filter) return allByDay;
    const m = new Map<DateStr, DayEntry[]>();
    for (const [d, list] of allByDay) m.set(d, list.filter((e) => matchesAssignee(e.task.assigneeId, filter)));
    return m;
  }, [allByDay, filter]);
  const entries = byDay.get(selected) ?? [];
  const openCount = tasks.filter((x) => !x.completed && matchesAssignee(x.assigneeId, filter)).length;
  const [menuFor, setMenuFor] = useState<Task | null>(null);
  const addDate = selected < t ? t : selected;
  const navigate = useNavigate();
  const quickLabel = selected === t ? 'today' : dayTitle(selected, t).split(' · ')[0];

  return (
    <>
      <BrandHeader />
      <Fab label="New task" onClick={() => openSheet({ type: 'task', dueDate: addDate })} />
      <ScreenTitle
        title="Tasks"
        subtitle={`${openCount} open task${openCount === 1 ? '' : 's'}`}
        action={
          <PillTabs
            label="Calendar view"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        }
      />
      <div className="pb-space-md">
        <AssigneeFilter />
      </div>

      {mode === 'week' ? (
        <section className="flex flex-col gap-space-lg">
          {WEEK_LAYOUT === 'rows' ? (
            <WeekRows
              days={days}
              byDay={byDay}
              todayStr={t}
              selected={selected}
              rangeLabel={rangeLabel(days, 'week', selected)}
              onSelect={select}
              onPrev={() => select(addDays(selected, -7))}
              onNext={() => select(addDays(selected, 7))}
              onToggle={(e, d) => (e.projected ? completeOccurrence(e.anchorId, d) : toggleTask(e.task.id))}
              onOpen={(e) => navigate(`/tasks/${e.anchorId}`)}
            />
          ) : (
            <WeekTimetable
              days={days}
              byDay={byDay}
              todayStr={t}
              selected={selected}
              members={members}
              rangeLabel={rangeLabel(days, 'week', selected)}
              onSelect={select}
              onPrev={() => select(addDays(selected, -7))}
              onNext={() => select(addDays(selected, 7))}
              onOpen={(e) => navigate(`/tasks/${e.anchorId}`)}
            />
          )}
          {selected >= t && <QuickAdd date={selected} label={quickLabel} />}
        </section>
      ) : (
        <>
          <Calendar
            mode={mode}
            days={days}
            selected={selected}
            todayStr={t}
            byDay={byDay}
            onSelect={select}
            onPrev={() => select(addMonths(selected, -1))}
            onNext={() => select(addMonths(selected, 1))}
          />

          <section className="mt-space-xl flex flex-col gap-space-lg" aria-labelledby="day-title">
            <div>
              <SectionHeader
                id="day-title"
                title={dayTitle(selected, t)}
                right={
                  selected !== t ? (
                    <button type="button" onClick={() => select(t)} className="min-h-[44px] -my-2 px-1 text-label-md text-link font-medium">
                      Today
                    </button>
                  ) : undefined
                }
              />
              {entries.length ? (
                <DayList entries={entries} date={selected} onMenu={setMenuFor} />
              ) : (
                <EmptyState message="Nothing planned for this day." action={{ label: 'Add task', onClick: () => openSheet({ type: 'task', dueDate: addDate }) }} />
              )}
            </div>
            {selected >= t && <QuickAdd date={selected} label={quickLabel} />}
          </section>
        </>
      )}

      <TaskMenu task={menuFor} onClose={() => setMenuFor(null)} />
    </>
  );
}

function DayList({ entries, date, onMenu }: { entries: DayEntry[]; date: DateStr; onMenu: (t: Task) => void }) {
  const navigate = useNavigate();
  const members = useMembers();
  const checklist = useStore((s) => s.checklist);
  return (
    <NotePaper label="Tasks for this day">
      {entries.map(({ task, projected, anchorId }) => {
        const items = checklist.filter((c) => c.taskId === (projected ? anchorId : task.id));
        const row = (
          <TaskRow
            task={task}
            member={task.assigneeId ? members.get(task.assigneeId) : undefined}
            checklist={projected ? undefined : { done: items.filter((c) => c.completed).length, total: items.length }}
            projected={projected}
            inDay
            onToggle={() => (projected ? completeOccurrence(anchorId, date) : toggleTask(task.id))}
            onOpen={() => navigate(`/tasks/${anchorId}`)}
          />
        );
        // Scheduled repeats aren't stored yet, so there's nothing to postpone or delete.
        if (projected) return <div key={task.id}>{row}</div>;
        return (
          <SwipeRow
            key={task.id}
            surface={paperRowBg()}
            onLongPress={() => onMenu(task)}
            actions={[
              ...(!task.completed ? [{ label: 'Postpone', icon: 'event' as const, tone: 'sky' as const, onSelect: () => postponeTask(task.id) }] : []),
              { label: 'Delete', icon: 'delete', tone: 'err' as const, onSelect: () => deleteTask(task.id) },
            ]}
          >
            {row}
          </SwipeRow>
        );
      })}
    </NotePaper>
  );
}

/** Stitch's quick-add bar: type, press return, it's on the selected day for you. */
function QuickAdd({ date, label }: { date: DateStr; label: string }) {
  const [value, setValue] = useState('');
  const addTask = useStore((s) => s.addTask);
  const me = useStore((s) => s.currentMemberId);
  const input = useRef<HTMLInputElement>(null);
  const submit = () => {
    const title = value.trim();
    if (!title) {
      input.current?.focus();
      return;
    }
    addTask({ title, assigneeId: me, dueDate: date, recurrence: null, estimatedDuration: null, reminder: null, area: null, notes: '', checklist: [] });
    setValue('');
    toast({ title: `Added to ${label}`, subtitle: title });
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2 p-1.5 pl-3.5 bg-surface rounded-xl border border-line shadow-card focus-within:border-sky focus-within:ring-2 focus-within:ring-sky/20 transition-all"
      >
        <Icon name="add_task" className="text-[20px] text-ink-sub shrink-0" />
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Quick task for ${label}`}
          aria-label={`Quick task for ${label}`}
          enterKeyHint="done"
          maxLength={120}
          className="w-full min-h-[40px] bg-transparent text-body-md text-ink placeholder:text-ink-sub/80 focus:outline-none"
        />
        <button type="submit" aria-label="Add quick task" className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky text-ink active:scale-95 transition-all shrink-0 shadow-sm">
          <Icon name="arrow_upward" className="text-[18px]" />
        </button>
      </form>
      <p className="px-2 pt-1.5 text-center text-caption text-ink-sub">Press return to add it to {label}</p>
    </div>
  );
}

function TaskMenu({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [last, setLast] = useState<Task | null>(null);
  if (task && task !== last) setLast(task);
  const t = task ?? last;
  const actions: SheetAction[] = t
    ? [
        { label: t.completed ? 'Mark as not done' : 'Complete', icon: t.completed ? ('undo' as const) : ('check_circle' as const), onSelect: () => toggleTask(t.id) },
        { label: 'Open details', icon: 'open_in_full', onSelect: () => navigate(`/tasks/${t.id}`) },
        { label: 'Edit', icon: 'edit', onSelect: () => openSheet({ type: 'task', taskId: t.id }) },
        ...(!t.completed ? [{ label: 'Postpone a day', icon: 'event' as const, onSelect: () => postponeTask(t.id) }] : []),
        { label: 'Delete', icon: 'delete', destructive: true, onSelect: () => deleteTask(t.id) },
      ]
    : [];
  return <ActionSheet open={!!task} onClose={onClose} title={t?.title ?? ''} actions={actions} />;
}
