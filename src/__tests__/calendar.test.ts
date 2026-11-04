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
  it('an overdue recurring task stays on its due date, and projects all occurrences in range', () => {
    expect(projectOccurrences({ ...daily, dueDate: '2026-09-22' }, '2026-09-21', '2026-09-26', '2026-09-24')).toEqual(['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']);
  });
  it('skips taken dates and handles intervals and year ends', () => {
    expect(projectOccurrences(daily, '2026-09-21', '2026-09-27', '2026-09-24', new Set(['2026-09-26']))).toEqual(['2026-09-25', '2026-09-27']);
    expect(projectOccurrences({ dueDate: '2026-12-28', recurrence: { unit: 'day', interval: 3 } }, '2026-12-28', '2027-01-06', '2026-12-28')).toEqual(['2026-12-31', '2027-01-03', '2027-01-06']);
    expect(projectOccurrences({ dueDate: '2026-09-24', recurrence: null }, '2026-09-21', '2026-10-30', '2026-09-24')).toEqual([]);
  });
  it('next occurrence skips a date already ticked', () => {
    expect(nextOccurrence('2026-09-24', daily.recurrence, '2026-09-24', new Set(['2026-09-25']))).toBe('2026-09-26');
  });
  it('stops projection at recurrence.endDate', () => {
    const dailyUntil26 = {
      dueDate: '2026-09-24',
      recurrence: { unit: 'day' as const, interval: 1, endDate: '2026-09-26' },
    };
    expect(projectOccurrences(dailyUntil26, '2026-09-21', '2026-09-30', '2026-09-24')).toEqual([
      '2026-09-25',
      '2026-09-26',
    ]);
  });
});

describe('ticking ahead', () => {
  let useStore: typeof import('../store').useStore;
  beforeEach(async () => {
    ({ useStore } = await import('../store'));
    const { createDemoSeed } = await import('../store/seed');
    useStore.setState(createDemoSeed());
  });

  it('ticks today; tomorrow and day after remain uncompleted and are NOT deleted or auto-spawned', () => {
    const monday = '2026-11-02';
    const tuesday = '2026-11-03';
    const wednesday = '2026-11-04';

    const taskId = useStore.getState().addTask({
      title: 'Take out trash daily',
      assigneeId: null,
      dueDate: monday,
      recurrence: { unit: 'day', interval: 1, endDate: wednesday },
      estimatedDuration: null,
      reminder: null,
      area: 'Kitchen',
      notes: '',
      checklist: [],
    });

    const series = useStore.getState().tasks.filter((t) => t.title === 'Take out trash daily');
    expect(series.length).toBe(3);

    // Tick Monday
    useStore.getState().completeTask(taskId);

    // Monday is completed; Tuesday and Wednesday are still there, uncompleted!
    const afterDone = useStore.getState().tasks.filter((t) => t.title === 'Take out trash daily');
    expect(afterDone.length).toBe(3);
    expect(afterDone.find((t) => t.dueDate === monday)?.completed).toBe(true);
    expect(afterDone.find((t) => t.dueDate === tuesday)?.completed).toBe(false);
    expect(afterDone.find((t) => t.dueDate === wednesday)?.completed).toBe(false);

    // Unticking Monday restores Monday to uncompleted without touching Tuesday/Wednesday
    useStore.getState().uncompleteTask(taskId);
    const afterUntick = useStore.getState().tasks.filter((t) => t.title === 'Take out trash daily');
    expect(afterUntick.every((t) => !t.completed)).toBe(true);
  });

  it('ticking an overdue occurrence does not skip subsequent occurrences (e.g. ticking Monday keeps Tuesday and Wednesday)', async () => {
    const monday = '2026-11-02';
    const tuesday = '2026-11-03';
    const wednesday = '2026-11-04';
    const thursday = '2026-11-05';

    const taskId = useStore.getState().addTask({
      title: 'Daily vitamins',
      assigneeId: null,
      dueDate: monday,
      recurrence: { unit: 'day', interval: 1 },
      estimatedDuration: null,
      reminder: null,
      area: null,
      notes: '',
      checklist: [],
    });

    const { tasksByDay } = await import('../store/selectors');
    // Before ticking Monday: Monday has anchor task. Tuesday and Wednesday are projected.
    let byDay = tasksByDay(useStore.getState().tasks, monday, thursday, wednesday);
    expect(byDay.get(monday)?.some((e) => e.task.title === 'Daily vitamins')).toBe(true);
    expect(byDay.get(tuesday)?.some((e) => e.task.title === 'Daily vitamins')).toBe(true);
    expect(byDay.get(wednesday)?.some((e) => e.task.title === 'Daily vitamins')).toBe(true);

    // Tick Monday
    useStore.getState().completeTask(taskId);

    // After ticking Monday:
    // Monday is completed.
    // Tuesday is now the active anchor task (uncompleted).
    // Wednesday is still projected (uncompleted)! Neither is deleted or skipped!
    byDay = tasksByDay(useStore.getState().tasks, monday, thursday, wednesday);
    const mondayEntry = byDay.get(monday)?.find((e) => e.task.title === 'Daily vitamins');
    expect(mondayEntry?.task.completed).toBe(true);

    const tuesdayEntry = byDay.get(tuesday)?.find((e) => e.task.title === 'Daily vitamins');
    expect(tuesdayEntry).toBeDefined();
    expect(tuesdayEntry?.task.completed).toBe(false);

    const wednesdayEntry = byDay.get(wednesday)?.find((e) => e.task.title === 'Daily vitamins');
    expect(wednesdayEntry).toBeDefined();
    expect(wednesdayEntry?.task.completed).toBe(false);
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

  it('finishes series when completing task at recurrence.endDate', () => {
    const taskId = useStore.getState().addTask({
      title: 'Practice Guitar',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-05' },
      reminder: null,
      estimatedDuration: null,
      area: null,
      notes: '',
      checklist: [],
    });

    // Complete the first occurrence (2026-11-04)
    useStore.getState().completeTask(taskId);
    let all = useStore.getState().tasks;
    const second = all.find((t) => t.title === 'Practice Guitar' && !t.completed)!;
    expect(second).toBeDefined();
    expect(second.dueDate).toBe('2026-11-05');
    expect(second.recurrence?.endDate).toBe('2026-11-05');

    // Complete the last occurrence (2026-11-05)
    useStore.getState().completeTask(second.id);
    all = useStore.getState().tasks;
    const third = all.find((t) => t.title === 'Practice Guitar' && !t.completed);
    expect(third).toBeUndefined(); // Series stopped, no more tasks spawned!
  });

  it('pre-generates occurrences for custom weekly recurrence on specific days', () => {
    // 2026-11-02 is Monday (1)
    useStore.getState().addTask({
      title: 'Workout MWF',
      assigneeId: null,
      dueDate: '2026-11-02',
      recurrence: {
        unit: 'week',
        interval: 1,
        daysOfWeek: [1, 3, 5],
        endDate: '2026-11-13', // stops after Nov 13
      },
      reminder: null,
      estimatedDuration: null,
      area: null,
      notes: '',
      checklist: [],
    });

    const tasks = useStore.getState().tasks.filter((t) => t.title === 'Workout MWF');
    const dates = tasks.map((t) => t.dueDate).sort();
    // Expected MWF from Nov 2 to Nov 13:
    // Nov 2 (Mon), Nov 4 (Wed), Nov 6 (Fri), Nov 9 (Mon), Nov 11 (Wed), Nov 13 (Fri)
    expect(dates).toEqual([
      '2026-11-02',
      '2026-11-04',
      '2026-11-06',
      '2026-11-09',
      '2026-11-11',
      '2026-11-13',
    ]);
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

  it('keeps completed overdue tasks on original dueDate when ticked done (does not move to completion date)', async () => {
    const { tasksByDay, taskLists } = await import('../store/selectors');

    const yesterday = addDays(today(), -1);
    const todayStr = today();
    const tomorrow = addDays(today(), 1);

    const testTasks = [
      {
        id: 'past-completed',
        householdId: 'h1',
        title: 'Overdue task completed today',
        assigneeId: null,
        dueDate: yesterday,
        recurrence: null,
        estimatedDuration: null,
        reminder: null,
        area: null,
        notes: '',
        completed: true,
        completedAt: new Date().toISOString(),
        nextOccurrenceId: null,
        seriesId: 'past-completed',
        createdAt: new Date().toISOString(),
      },
    ];

    const dayMap = tasksByDay(testTasks, yesterday, tomorrow, todayStr);

    // Task must stay on yesterday (original dueDate), NOT today
    const yesterdayTasks = dayMap.get(yesterday) ?? [];
    expect(yesterdayTasks.some((e) => e.task.id === 'past-completed')).toBe(true);
    expect(yesterdayTasks.find((e) => e.task.id === 'past-completed')?.overdue).toBe(false);

    // Today must NOT have this completed overdue task
    const todayTasks = dayMap.get(todayStr) ?? [];
    expect(todayTasks.some((e) => e.task.id === 'past-completed')).toBe(false);

    // taskLists.today must NOT include it (remains on yesterday)
    const lists = taskLists(testTasks, todayStr);
    expect(lists.today.some((t) => t.id === 'past-completed')).toBe(false);
    expect(lists.completed.some((t) => t.id === 'past-completed')).toBe(true);
  });
});



