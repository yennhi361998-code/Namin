import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, addMonths, today } from '../lib/dates';
import { parseVnd, formatVnd } from '../lib/money';
import { nextOccurrence, recurrenceLabel } from '../lib/recurrence';
import { estimateRestock, statusFromEstimate } from '../lib/restock';
import { guessCategory } from '../lib/categories';

describe('recurrence', () => {
  it('steps from the due date', () => {
    expect(nextOccurrence('2026-09-24', { unit: 'week', interval: 1 }, '2026-09-24')).toBe('2026-10-01');
    expect(nextOccurrence('2026-09-24', { unit: 'day', interval: 3 }, '2026-09-24')).toBe('2026-09-27');
  });
  it('skips past occurrences when completed late', () => {
    expect(nextOccurrence('2026-09-01', { unit: 'week', interval: 1 }, '2026-09-24')).toBe('2026-09-29');
  });
  it('completing early still moves one interval forward', () => {
    expect(nextOccurrence('2026-09-30', { unit: 'week', interval: 1 }, '2026-09-24')).toBe('2026-10-07');
  });
  it('clamps month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(nextOccurrence('2026-01-31', { unit: 'month', interval: 1 }, '2026-01-31')).toBe('2026-02-28');
  });
  it('labels', () => {
    expect(recurrenceLabel({ unit: 'day', interval: 1 })).toBe('Daily');
    expect(recurrenceLabel({ unit: 'week', interval: 1 }, '2026-09-26')).toBe('Every Saturday');
    expect(recurrenceLabel({ unit: 'week', interval: 2 })).toBe('Every 2 weeks');
  });
});

describe('restock', () => {
  const ref = '2026-09-24';
  it('needs two purchases', () => {
    expect(estimateRestock({ expectedUsageDays: null }, [{ purchaseDate: '2026-09-01' }], ref)).toBeNull();
    expect(estimateRestock({ expectedUsageDays: null }, [], ref)).toBeNull();
  });
  it('averages gaps between purchases', () => {
    const est = estimateRestock({ expectedUsageDays: null }, [{ purchaseDate: '2026-06-21' }, { purchaseDate: '2026-08-03' }, { purchaseDate: '2026-09-15' }], ref)!;
    expect(est.cycleDays).toBe(43);
    expect(est.nextPurchase).toBe('2026-10-28');
    expect(est.daysLeft).toBe(34);
    expect(statusFromEstimate(est)).toBe('in_stock');
  });
  it('ignores same-day duplicates', () => {
    expect(estimateRestock({ expectedUsageDays: null }, [{ purchaseDate: '2026-09-01' }, { purchaseDate: '2026-09-01' }], ref)).toBeNull();
  });
  it('uses a manual cycle only when history is thin', () => {
    const est = estimateRestock({ expectedUsageDays: 30 }, [{ purchaseDate: '2026-09-01' }], ref)!;
    expect(est.basis).toBe('manual');
    expect(est.daysLeft).toBe(7);
    expect(statusFromEstimate(est)).toBe('running_low');
  });
});

describe('money', () => {
  it('parses common inputs', () => {
    expect(parseVnd('189000')).toBe(189000);
    expect(parseVnd('189,000')).toBe(189000);
    expect(parseVnd('189.000')).toBe(189000);
    expect(parseVnd('₫189,000')).toBe(189000);
    expect(parseVnd('189k')).toBe(189000);
    expect(parseVnd('1.2tr')).toBe(1200000);
    expect(parseVnd('')).toBeNull();
    expect(parseVnd('abc')).toBeNaN();
    expect(parseVnd('-5')).toBeNaN();
  });
  it('formats', () => expect(formatVnd(1240000)).toBe('₫1,240,000'));
});

describe('categories', () => {
  it('guesses', () => {
    expect(guessCategory('Detergent')).toBe('Cleaning');
    expect(guessCategory('Toilet paper')).toBe('Bathroom');
    expect(guessCategory('Paper towels')).toBe('Kitchen');
    expect(guessCategory('Water filter')).toBe('Maintenance');
    expect(guessCategory('Eggs')).toBe('Groceries');
    expect(guessCategory('Umbrella')).toBeNull();
  });
});

describe('store flows', () => {
  let useStore: typeof import('../store').useStore;
  beforeEach(async () => {
    ({ useStore } = await import('../store'));
    useStore.getState().resetDemo();
  });

  it('completing a recurring task spawns the next occurrence, undo retracts it', () => {
    const s = useStore.getState();
    const task = s.tasks.find((t) => t.title === 'Clean bathroom')!;
    const before = s.tasks.length;
    s.completeTask(task.id);
    let st = useStore.getState();
    const done = st.tasks.find((t) => t.id === task.id)!;
    const next = st.tasks.find((t) => t.id === done.nextOccurrenceId)!;
    expect(done.completed).toBe(true);
    expect(st.tasks.length).toBe(before + 1);
    expect(next.dueDate).toBe(addDays(task.dueDate, 7));
    expect(next.recurrence).toEqual(task.recurrence);
    expect(st.checklist.filter((c) => c.taskId === next.id).map((c) => c.completed)).toEqual([false, false, false, false]);
    st.uncompleteTask(task.id);
    st = useStore.getState();
    expect(st.tasks.length).toBe(before);
    expect(st.tasks.find((t) => t.id === task.id)!.completed).toBe(false);
  });

  it('shopping → purchase → history, spending, restock; undo restores', () => {
    const s = useStore.getState();
    expect(s.addToShopping({ name: '  ' })).toEqual({ ok: false, reason: 'empty' });
    expect(s.addToShopping({ name: 'detergent' })).toEqual({ ok: false, reason: 'duplicate' });
    const res = s.addToShopping({ name: 'Hand soap' });
    expect(res.ok).toBe(true);
    const entry = useStore.getState().shopping.find((x) => x.name === 'Hand soap')!;
    expect(entry.estimatedPrice).toBe(39000); // default from last purchase
    expect(entry.store).toBe('Guardian');
    const purchasesBefore = useStore.getState().purchases.length;
    const undo = useStore.getState().recordPurchase({
      shoppingItemId: entry.id, name: entry.name, category: entry.category, quantity: 1, unit: 'bottle', price: 41000, store: 'WinMart', purchaseDate: today(),
    });
    let st = useStore.getState();
    expect(st.shopping.some((x) => x.id === entry.id)).toBe(false);
    expect(st.purchases.length).toBe(purchasesBefore + 1);
    const item = st.items.find((i) => i.id === entry.itemId)!;
    expect(item.status).toBe('in_stock');
    undo();
    st = useStore.getState();
    expect(st.purchases.length).toBe(purchasesBefore);
    expect(st.shopping.some((x) => x.id === entry.id)).toBe(true);
  });

  it('a brand new item gets an estimate after its second purchase', () => {
    const s = useStore.getState();
    const base = { name: 'Coffee beans', category: 'Groceries' as const, quantity: 1, unit: 'bag', price: 180000, store: 'WinMart' };
    s.recordPurchase({ ...base, purchaseDate: addDays(today(), -20) });
    let item = useStore.getState().items.find((i) => i.name === 'Coffee beans')!;
    expect(item.status).toBe('unknown');
    useStore.getState().recordPurchase({ ...base, purchaseDate: today() });
    item = useStore.getState().items.find((i) => i.name === 'Coffee beans')!;
    expect(useStore.getState().items.filter((i) => i.name === 'Coffee beans').length).toBe(1);
    expect(item.status).toBe('in_stock');
  });
});

describe('date cycle and range navigation', () => {
  it('correctly calculates current cycle monthKey based on startDay', async () => {
    const { getCurrentCycleMonthKey } = await import('../lib/dateRanges');
    // If today is 07/10/2026 and startDay is 25: 7 < 25, so current cycle began in 09/2026
    expect(getCurrentCycleMonthKey('2026-10-07', 25)).toBe('2026-09');
    // If today is 26/10/2026 and startDay is 25: 26 >= 25, so current cycle began in 10/2026
    expect(getCurrentCycleMonthKey('2026-10-26', 25)).toBe('2026-10');
    // If startDay is 1: always current calendar month
    expect(getCurrentCycleMonthKey('2026-10-07', 1)).toBe('2026-10');
  });

  it('resolves month cycle dates accurately', async () => {
    const { getMonthDateRange, resolveDateRange } = await import('../lib/dateRanges');
    // For key 2026-09 with startDay 25: starts 25/09/2026 and ends 24/10/2026
    expect(getMonthDateRange('2026-09', 25)).toEqual(['2026-09-25', '2026-10-24']);
    // For key 2026-08 with startDay 25: starts 25/08/2026 and ends 24/09/2026
    expect(getMonthDateRange('2026-08', 25)).toEqual(['2026-08-25', '2026-09-24']);

    // When selecting month mode 2026-08 with startDay 25, it never includes October dates
    const [start, end] = resolveDateRange({ mode: 'month', monthKey: '2026-08' }, 25);
    expect(start).toBe('2026-08-25');
    expect(end).toBe('2026-09-24');
  });

  it('shifts to contiguous adjacent range when clicking back or forward', async () => {
    const { shiftDateSelection, resolveDateRange } = await import('../lib/dateRanges');
    // Given cycle 2026-09 (25/09 ~ 24/10), shifting -1 produces 2026-08 (25/08 ~ 24/09)
    const current = { mode: 'month' as const, monthKey: '2026-09' };
    const prev = shiftDateSelection(current, -1, 25);
    expect(prev.monthKey).toBe('2026-08');
    expect(resolveDateRange(prev, 25)).toEqual(['2026-08-25', '2026-09-24']);

    // Shifting +1 from 2026-08 produces 2026-09 (25/09 ~ 24/10)
    const next = shiftDateSelection(prev, 1, 25);
    expect(next.monthKey).toBe('2026-09');
    expect(resolveDateRange(next, 25)).toEqual(['2026-09-25', '2026-10-24']);

    // Custom 1-month range: 2026-09-25 ~ 2026-10-24
    const customSelection = {
      mode: 'custom' as const,
      monthKey: '2026-09',
      startDate: '2026-09-25',
      endDate: '2026-10-24',
    };
    const prevCustom = shiftDateSelection(customSelection, -1, 25);
    expect(prevCustom.startDate).toBe('2026-08-25');
    expect(prevCustom.endDate).toBe('2026-09-24');
  });

  it('unticked default start day resolves This Month to standard calendar month 01..last day', async () => {
    const { resolveDateRange } = await import('../lib/dateRanges');
    // When startDay = 1, this_month resolves to standard month (e.g. 2026-10-01 ~ 2026-10-31)
    const [start, end] = resolveDateRange({ mode: 'quick', quickOption: 'this_month', monthKey: '2026-10' }, 1);
    expect(start.endsWith('-01')).toBe(true);
    expect(start.slice(0, 7)).toBe(end.slice(0, 7)); // Same calendar month!
  });
});
