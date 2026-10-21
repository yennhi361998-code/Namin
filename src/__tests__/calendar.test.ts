import { beforeEach, describe, expect, it } from 'vitest';
import { monthGrid, projectOccurrences, startOfWeek, weekDays } from '../lib/calendar';
import { addDays, today } from '../lib/dates';
import { nextOccurrence } from '../lib/recurrence';

describe('calendar grid', () => {
  it('weeks start on Monday', () => {
    expect(startOfWeek('2026-09-24')).toBe('2026-09-21'); // Thursday → Monday
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21'); // Sunday stays in the same week
    expect(weekDays('2026-09-24')).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  });
  it('month grid covers whole weeks', () => {
    const g = monthGrid('2026-09');
    expect(g[0]).toBe('2026-08-31');
    expect(g[g.length - 1]).toBe('2026-10-04');
    expect(g.length % 7).toBe(0);
    expect(monthGrid('2026-02').length % 7).toBe(0);
    expect(monthGrid("2026-12").slice(-1)[0] >= '2026-12-31').toBe(true);
  });
});

describe('projection', () => {
  const daily = { dueDate: '2026-09-24', recurrence: { unit: 'day' as const, interval: 1 } };
  it('projects after the current occurrence', () => {
    expect(projectOccurrences(daily, '2026-09-21', '2026-09-27', '2026-09-24')).toEqual(['2026-09-25', '2026-09-26', '2026-09-27']);
  });
  it('an overdue recurring task stays on its due date, and projection starts from today onward', () => {
    expect(projectOccurrences({ ...daily, dueDate: '2026-09-22' }, '2026-09-21', '2026-09-26', '2026-09-24')).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
  });
  it('skips taken dates and handles intervals and year ends', () => {
    expect(projectOccurrences(daily, '2026-09-21', '2026-09-27', '2026-09-24', new Set(['2026-09-26']))).toEqual(['2026-09-25', '2026-09-27']);
    expect(projectOccurrences({ dueDate: '2026-12-28', recurrence: { unit: 'day', interval: 3 } }, '2026-12-28', '2027-01-06', '2026-12-28')).toEqual(['2026-12-31', '2027-01-03', '2027-01-06']);
    expect(projectOccurrences({ dueDate: '2026-09-24', recurrence: null }, '2026-09-21', '2026-10-30', '2026-09-24')).toEqual([]);
  });
  it('next occurrence skips a date already ticked', () => {
    expect(nextOccurrence('2026-09-24', daily.recurrence, '2026-09-24', new Set(['2026-09-25']))).toBe('2026-09-26');
  });
});

describe('ticking ahead', () => {
  let useStore: typeof import('../store').useStore;
  beforeEach(async () => {
    ({ useStore } = await import('../store'));
    const { createDemoSeed } = await import('../store/seed');
    useStore.setState(createDemoSeed());
  });

  it('ticks one future date; the series skips it; unticking restores it', () => {
    const trash = useStore.getState().tasks.find((t) => t.title === 'Take out trash' && !t.completed)!;
    const d2 = addDays(today(), 2);
    useStore.getState().completeOccurrence(trash.id, d2);
    let record = useStore.getState().tasks.find((t) => t.seriesId === trash.seriesId && t.dueDate === d2)!;
    expect(record.completed).toBe(true);
    // Doing today's and tomorrow's normally, then the series jumps over the ticked day.
    useStore.getState().completeTask(trash.id);
    const tomorrow = useStore.getState().tasks.find((t) => t.seriesId === trash.seriesId && !t.completed)!;
    expect(tomorrow.dueDate).toBe(addDays(today(), 1));
    useStore.getState().completeTask(tomorrow.id);
    const after = useStore.getState().tasks.find((t) => t.seriesId === trash.seriesId && !t.completed)!;
    expect(after.dueDate).toBe(addDays(today(), 3));
    // Unticking the ticked-ahead record removes it rather than leaving two open occurrences.
    useStore.getState().uncompleteTask(record.id);
    expect(useStore.getState().tasks.some((t) => t.id === record.id)).toBe(false);
    expect(useStore.getState().tasks.filter((t) => t.seriesId === trash.seriesId && !t.completed).length).toBe(1);
  });

  it('migrates v1 data by linking occurrence chains', () => {
    const migrate = useStore.persist.getOptions().migrate!;
    const base = { recurrence: { unit: 'day', interval: 1 }, completed: true };
    const v1 = {
      tasks: [
        { ...base, id: 'a', nextOccurrenceId: 'b' },
        { ...base, id: 'b', nextOccurrenceId: 'c' },
        { ...base, id: 'c', nextOccurrenceId: null, completed: false },
        { ...base, id: 'x', nextOccurrenceId: null },
      ],
    };
    const out = migrate(v1, 1) as { tasks: { id: string; seriesId: string }[] };
    expect(out.tasks.map((t) => t.seriesId)).toEqual(['a', 'a', 'a', 'x']);
  });
});

describe('rangeLabel', () => {
  it('formats month, week, and today modes correctly', async () => {
    const { rangeLabel } = await import('../components/calendar');
    expect(rangeLabel(['2026-10-15'], 'today', '2026-10-15')).toBe('Oct 2026');
    expect(rangeLabel(['2026-10-15'], 'month', '2026-10-15')).toBe('Oct 2026');
    expect(rangeLabel(['2026-10-12', '2026-10-18'], 'week', '2026-10-15')).toBe('Oct 2026');
    expect(rangeLabel(['2026-09-28', '2026-10-04'], 'week', '2026-09-28')).toBe('Sep – Oct 2026');
  });
});

describe('overdue tasks do not roll over to today/future', () => {
  it('keeps uncompleted overdue tasks on their original dueDate in tasksByDay', async () => {
    const { tasksByDay, taskLists } = await import('../store/selectors');

    const yesterday = addDays(today(), -1);
    const todayStr = today();
    const tomorrow = addDays(today(), 1);

    const testTasks = [
      {
        id: 'past-1',
        householdId: 'h1',
        title: 'Uncompleted yesterday task',
        assigneeId: null,
        dueDate: yesterday,
        recurrence: null,
        estimatedDuration: null,
        reminder: null,
        area: null,
        notes: '',
        completed: false,
        completedAt: null,
        nextOccurrenceId: null,
        seriesId: 'past-1',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'today-1',
        householdId: 'h1',
        title: 'Today task',
        assigneeId: null,
        dueDate: todayStr,
        recurrence: null,
        estimatedDuration: null,
        reminder: null,
        area: null,
        notes: '',
        completed: false,
        completedAt: null,
        nextOccurrenceId: null,
        seriesId: 'today-1',
        createdAt: new Date().toISOString(),
      },
    ];

    const dayMap = tasksByDay(testTasks, yesterday, tomorrow, todayStr);

    // Yesterday's task must stay on yesterday
    const yesterdayTasks = dayMap.get(yesterday) ?? [];
    expect(yesterdayTasks.some((e) => e.task.id === 'past-1')).toBe(true);
    expect(yesterdayTasks.find((e) => e.task.id === 'past-1')?.overdue).toBe(true);

    // Today must NOT have yesterday's uncompleted task
    const todayTasks = dayMap.get(todayStr) ?? [];
    expect(todayTasks.some((e) => e.task.id === 'past-1')).toBe(false);
    expect(todayTasks.some((e) => e.task.id === 'today-1')).toBe(true);

    // taskLists.today must NOT include yesterday's uncompleted task
    const lists = taskLists(testTasks, todayStr);
    expect(lists.today.some((t) => t.id === 'past-1')).toBe(false);
    expect(lists.today.some((t) => t.id === 'today-1')).toBe(true);
    expect(lists.overdue.some((t) => t.id === 'past-1')).toBe(true);
  });
});


