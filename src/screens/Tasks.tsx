import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, rangeLabel, type CalendarMode } from '../components/calendar';
import { WeekRows, WeekTimetable } from '../components/timetable';
import { ActionSheet, SwipeRow, type SheetAction } from '../components/overlay';
import { TaskRow } from '../components/rows';
import { AssigneeFilter, BrandHeader, Fab, PillTabs, ScreenTitle } from '../components/shell';
import { EmptyState, NotePaper, paperRowBg, SectionHeader, SpiralCard } from '../components/ui';
import { monthGrid, weekDays } from '../lib/calendar';
import { addDays, addMonths, monthKey, relativeDay, shortDate, shortWeekday, today, weekdayName } from '../lib/dates';
import type { DateStr, Task } from '../lib/types';
import { useStore } from '../store';
import { completeOccurrence, deleteTask, postponeTask, toggleTask } from '../store/actions';
import { useMembers, useTaskLists, useTasksByDay, type DayEntry } from '../store/selectors';
import { matchesAssignee, openSheet, useUi } from '../store/ui';
import { ToBuySection } from '../components/ToBuySection';

const MODE_KEY = 'namin:calendar-view';
/** Week view layout: seven rows with task pills, or seven columns (timetable). */
const WEEK_LAYOUT: 'rows' | 'columns' = 'rows';

// Per-device preference; falls back to week when storage is unavailable.
function readMode(): CalendarMode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === 'today' || saved === 'month' || saved === 'week' ? saved : 'week';
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
    if (m === 'today') select(t);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* preference only */
    }
  };

  const days =
    mode === 'today'
      ? [t]
      : mode === 'week'
      ? weekDays(selected)
      : monthGrid(monthKey(selected));
  const allByDay = useTasksByDay(days[0], days[days.length - 1]);
  const assignee = useUi((s) => s.assignee);
  const members = useMembers();
  const lists = useTaskLists();
  const filter = assignee && members.has(assignee) ? assignee : null;
  const upNext = lists.upcoming.filter((item) => matchesAssignee(item.assigneeId, filter)).slice(0, 3);
  const byDay = useMemo(() => {
    if (!filter) return allByDay;
    const m = new Map<DateStr, DayEntry[]>();
    for (const [d, list] of allByDay) m.set(d, list.filter((e) => matchesAssignee(e.task.assigneeId, filter)));
    return m;
  }, [allByDay, filter]);
  const entries = byDay.get(mode === 'today' ? t : selected) ?? [];
  const [menuFor, setMenuFor] = useState<Task | null>(null);
  const addDate = mode === 'today' ? t : selected < t ? t : selected;
  const navigate = useNavigate();

  return (
    <>
      <BrandHeader />
      <Fab label="New task" onClick={() => openSheet({ type: 'task', dueDate: addDate })} />
      <ScreenTitle
        title="Tasks"
        action={
          <PillTabs
            label="Calendar view"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        }
      />
      <div className="pb-space-md">
        <AssigneeFilter />
      </div>

      {mode === 'today' ? (
        <section className="flex flex-col gap-space-lg" aria-labelledby="today-title">
          <div>
            <SectionHeader id="today-title" title={dayTitle(t, t)} />
            {entries.length ? (
              <DayList entries={entries} date={t} onMenu={setMenuFor} />
            ) : (
              <EmptyState
                message="No tasks for today."
                action={{ label: 'Add task', onClick: () => openSheet({ type: 'task', dueDate: t }) }}
              />
            )}
          </div>
          {upNext.length > 0 && (
            <div className="flex flex-col gap-2">
              <SectionHeader id="today-upnext" title="Up next" />
              <div className="divide-y divide-black/[0.06] -mx-1 bg-surface rounded-2xl shadow-card border border-line/40 px-3 py-1">
                {upNext.map((task) => {
                  const who = task.assigneeId ? members.get(task.assigneeId)?.name : 'All';
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="w-full text-left flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-black/[0.02] active:bg-black/[0.04] transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-header-ink/40 group-hover:bg-header-ink group-hover:scale-125 transition-all shrink-0" aria-hidden />
                        <div className="flex flex-col min-w-0">
                          <span className="text-body-md text-ink font-medium truncate">{task.title}</span>
                          <span className="text-caption text-ink-sub">
                            {relativeDay(task.dueDate)} · {who}
                          </span>
                        </div>
                      </div>
                      <span className="text-caption font-medium text-ink-sub/80 shrink-0">
                        {shortWeekday(task.dueDate)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : mode === 'week' ? (
        <section className="flex flex-col gap-space-lg">
          <SpiralCard>
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
          </SpiralCard>
          <div className="pt-2 border-t border-line/60">
            <ToBuySection />
          </div>
        </section>
      ) : (
        <>
          <SpiralCard>
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
          </SpiralCard>

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
            <div className="pt-2 border-t border-line/60">
              <ToBuySection />
            </div>
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
