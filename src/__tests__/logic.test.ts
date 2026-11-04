import { beforeEach, describe, expect, it } from 'vitest';
import { addDays, addMonths, today, parseDate, weekdayName, shortDate, longDate } from '../lib/dates';
import { parseVnd, formatVnd } from '../lib/money';
import { nextOccurrence, recurrenceLabel, sameCadence, sameRecurrence } from '../lib/recurrence';
import { computeItemStatus, estimateRestock, isItemLowStock, statusFromEstimate } from '../lib/restock';
import { guessCategory } from '../lib/categories';
import { isCategoryHiddenFromInsights, isCategoryCycleHidden } from '../lib/moneyCategories';
import type { Account } from '../lib/types';

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
    expect(recurrenceLabel({ unit: 'week', interval: 2 })).toBe('Bi-weekly');
    expect(recurrenceLabel({ unit: 'day', interval: 1, endDate: '2026-11-20' })).toBe('Daily · Stop after 20 Nov');
    expect(recurrenceLabel({ unit: 'week', interval: 1, daysOfWeek: [1, 3, 5] })).toBe('Weekly on Mon, Wed, Fri');
    expect(recurrenceLabel({ unit: 'week', interval: 2, daysOfWeek: [1, 3, 5] })).toBe('Bi-weekly on Mon, Wed, Fri');
    expect(recurrenceLabel({ unit: 'year', interval: 1 })).toBe('Yearly');
    expect(recurrenceLabel({ unit: 'year', interval: 2 })).toBe('Every 2 years');
  });
  it('steps with custom daysOfWeek within week and across intervals', () => {
    // 2026-11-02 is Monday (1)
    const mwf = { unit: 'week' as const, interval: 1, daysOfWeek: [1, 3, 5] };
    expect(nextOccurrence('2026-11-02', mwf, '2026-11-02')).toBe('2026-11-04'); // Wed
    expect(nextOccurrence('2026-11-04', mwf, '2026-11-04')).toBe('2026-11-06'); // Fri
    expect(nextOccurrence('2026-11-06', mwf, '2026-11-06')).toBe('2026-11-09'); // Next Mon

    // Interval 2 weeks on Mon, Wed
    const biMonWed = { unit: 'week' as const, interval: 2, daysOfWeek: [1, 3] };
    expect(nextOccurrence('2026-11-02', biMonWed, '2026-11-02')).toBe('2026-11-04'); // Wed of same week
    expect(nextOccurrence('2026-11-04', biMonWed, '2026-11-04')).toBe('2026-11-16'); // Mon 2 weeks later
  });
  it('respects recurrence endDate', () => {
    const dailyUntilNov10 = { unit: 'day' as const, interval: 1, endDate: '2026-11-10' };
    expect(nextOccurrence('2026-11-08', dailyUntilNov10, '2026-11-08')).toBe('2026-11-09');
    expect(nextOccurrence('2026-11-09', dailyUntilNov10, '2026-11-09')).toBe('2026-11-10');
    expect(nextOccurrence('2026-11-10', dailyUntilNov10, '2026-11-10')).toBeNull();
  });
  it('sameRecurrence and sameCadence comparisons', () => {
    const r1 = { unit: 'day' as const, interval: 1 };
    const r2 = { unit: 'day' as const, interval: 1, endDate: '2026-11-20' };
    const r3 = { unit: 'day' as const, interval: 1, endDate: '2026-11-20' };
    const r4 = { unit: 'week' as const, interval: 1, daysOfWeek: [1, 3] };
    const r5 = { unit: 'week' as const, interval: 1, daysOfWeek: [3, 1] };
    const r6 = { unit: 'week' as const, interval: 1, daysOfWeek: [1, 5] };
    expect(sameCadence(r1, r2)).toBe(true);
    expect(sameRecurrence(r1, r2)).toBe(false);
    expect(sameRecurrence(r2, r3)).toBe(true);
    expect(sameCadence(r4, r5)).toBe(true);
    expect(sameCadence(r4, r6)).toBe(false);
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
  it('calculates cycle weighted by purchase quantities (e.g. 1 pack then 2 packs divides by 3)', () => {
    // Buy 1 pack on 2026-01-01
    // Buy 2 packs on 2026-02-01 (31 days later)
    // Buy 1 pack on 2026-04-04 (62 days later, total 93 days from first purchase)
    // Consumed between first and last: 1 + 2 = 3 packs
    // Average days per pack: 93 / 3 = 31 days/pack!
    const est = estimateRestock(
      { expectedUsageDays: null },
      [
        { purchaseDate: '2026-01-01', quantity: 1 },
        { purchaseDate: '2026-02-01', quantity: 2 },
        { purchaseDate: '2026-04-04', quantity: 1 },
      ],
      '2026-04-04',
    )!;
    expect(est.cycleDays).toBe(31);
    expect(est.nextPurchase).toBe('2026-05-05');
    expect(est.daysLeft).toBe(31);
  });
  it('extends duration when last purchase has multiple packs', () => {
    // Buy 1 pack on 2026-01-01
    // Buy 2 packs on 2026-02-01 (31 days later)
    // Gap: 31 days for 1 pack => 31 days per pack.
    // The 2 packs bought on 2026-02-01 will last 2 * 31 = 62 days!
    const est = estimateRestock(
      { expectedUsageDays: null },
      [
        { purchaseDate: '2026-01-01', quantity: 1 },
        { purchaseDate: '2026-02-01', quantity: 2 },
      ],
      '2026-02-01',
    )!;
    expect(est.cycleDays).toBe(31);
    expect(est.durationDays).toBe(62);
    expect(est.nextPurchase).toBe('2026-04-04');
    expect(est.daysLeft).toBe(62);
  });
  it('calculates unit-level cycle with packaging conversion ratio', () => {
    // 1 pack = 30 units (e.g. 30 trash bags in 1 roll)
    // Buy 1 roll (30 bags) on 2026-01-01
    // Buy 2 rolls (60 bags) on 2026-02-10 (40 days later)
    // In 40 days, consumed 30 bags => 40 / 30 = 1.333 days per bag.
    // 1 roll = 30 * 1.333 = 40 days per roll.
    // Last purchase of 2 rolls (60 bags) lasts 60 * (40/30) = 80 days!
    const est = estimateRestock(
      { expectedUsageDays: null, usagePerPurchaseUnit: 30 },
      [
        { purchaseDate: '2026-01-01', quantity: 1 },
        { purchaseDate: '2026-02-10', quantity: 2 },
      ],
      '2026-02-10',
    )!;
    expect(est.cycleDays).toBe(40);
    expect(Number(est.daysPerUnit.toFixed(2))).toBe(1.33);
    expect(est.durationDays).toBe(80);
    expect(est.nextPurchase).toBe('2026-05-01');
    expect(est.daysLeft).toBe(80);
  });

  it('correctly handles stock status for 1 item with long usage duration (no purchase history)', () => {
    // 1 fragrance jar lasting 60 days, no purchase date entered yet
    const item = { currentStock: 1, expectedUsageDays: 60 };
    expect(computeItemStatus(item, null)).toBe('in_stock');
    expect(isItemLowStock(item, null)).toBe(false);
  });

  it('correctly marks item as running low if remaining stock days <= 7 (no purchase history)', () => {
    // 1 item lasting only 3 days
    const item = { currentStock: 1, expectedUsageDays: 3 };
    expect(computeItemStatus(item, null)).toBe('running_low');
    expect(isItemLowStock(item, null)).toBe(true);
  });

  it('marks item as out if stock is 0 even with long expected duration', () => {
    const item = { currentStock: 0, expectedUsageDays: 60 };
    expect(computeItemStatus(item, null)).toBe('out');
    expect(isItemLowStock(item, null)).toBe(true);
  });

  it('does not mark item as low if restock estimate shows plenty of time left even with currentStock = 1', () => {
    const item = { currentStock: 1, expectedUsageDays: 60 };
    const est = {
      cycleDays: 60,
      daysPerUnit: 60,
      lastQuantity: 1,
      lastUsageUnits: 1,
      durationDays: 60,
      ratio: 1,
      basis: 'manual' as const,
      lastPurchase: '2026-09-01',
      nextPurchase: '2026-10-31',
      daysLeft: 37,
    };
    expect(computeItemStatus(item, est)).toBe('in_stock');
    expect(isItemLowStock(item, est)).toBe(false);
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
    const { createDemoSeed } = await import('../store/seed');
    useStore.setState(createDemoSeed());
  });

  it('completing a recurring task marks it completed and does NOT auto-spawn a new task, uncomplete restores it', () => {
    const s = useStore.getState();
    const task = s.tasks.find((t) => t.title === 'Clean bathroom')!;
    const before = s.tasks.length;
    s.completeTask(task.id);
    let st = useStore.getState();
    const done = st.tasks.find((t) => t.id === task.id)!;
    expect(done.completed).toBe(true);
    expect(st.tasks.length).toBe(before); // Does not auto-spawn a new task!
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

  it('completing a task with mapped item deducts in-stock quantity, undo restores it', () => {
    const s = useStore.getState();
    const trash = s.items.find((i) => i.name.includes('Trash bags'))!;
    expect(trash.currentStock).toBe(100);
    const task = s.tasks.find((t) => t.title === 'Take out trash')!;
    expect(task.mappedItemId).toBe(trash.id);
    expect(task.mappedQuantity).toBe(2);

    s.completeTask(task.id);
    let st = useStore.getState();
    let updatedTrash = st.items.find((i) => i.id === trash.id)!;
    expect(updatedTrash.currentStock).toBe(98);

    const doneTask = st.tasks.find((t) => t.id === task.id)!;
    expect(doneTask.completed).toBe(true);
    expect(doneTask.mappedItemId).toBe(trash.id);
    expect(doneTask.mappedQuantity).toBe(2);

    // Uncomplete restores stock
    st.uncompleteTask(task.id);
    st = useStore.getState();
    updatedTrash = st.items.find((i) => i.id === trash.id)!;
    expect(updatedTrash.currentStock).toBe(100);
  });

  it('purchasing item with usagePerPurchaseUnit adds converted quantity to in-stock', () => {
    const s = useStore.getState();
    const trash = s.items.find((i) => i.name.includes('Trash bags'))!;
    const stockBefore = trash.currentStock ?? 0;
    // Buy 2 rolls, each has 50 bags -> +100 bags
    const undo = s.recordPurchase({
      itemId: trash.id,
      name: trash.name,
      category: trash.category,
      quantity: 2,
      unit: 'roll',
      price: 50000,
      store: 'WinMart',
      purchaseDate: today(),
    });
    let st = useStore.getState();
    let item = st.items.find((i) => i.id === trash.id)!;
    expect(item.currentStock).toBe(stockBefore + 100);

    // Undo reverts stock
    undo();
    st = useStore.getState();
    item = st.items.find((i) => i.id === trash.id)!;
    expect(item.currentStock).toBe(stockBefore);
  });

  it('recording purchase with custom usagePerPurchaseUnit updates item ratio and adds converted quantity', () => {
    const s = useStore.getState();
    const dishSoap = s.items.find((i) => i.name === 'Dish soap')!;
    const stockBefore = dishSoap.currentStock ?? 0;
    // Buy 2 boxes of Dish soap, each containing 3 bottles
    const undo = s.recordPurchase({
      itemId: dishSoap.id,
      name: dishSoap.name,
      category: dishSoap.category,
      quantity: 2,
      unit: 'box',
      usageUnit: 'bottles',
      usagePerPurchaseUnit: 3,
      price: 120000,
      store: 'WinMart',
      purchaseDate: today(),
    });

    let st = useStore.getState();
    let item = st.items.find((i) => i.id === dishSoap.id)!;
    expect(item.unit).toBe('box');
    expect(item.usageUnit).toBe('bottles');
    expect(item.usagePerPurchaseUnit).toBe(3);
    // 2 boxes * 3 bottles = +6 bottles
    expect(item.currentStock).toBe(stockBefore + 6);

    undo();
    st = useStore.getState();
    item = st.items.find((i) => i.id === dishSoap.id)!;
    expect(item.currentStock).toBe(stockBefore);
  });

  it('ticking to-buy item with household scope adds expense and increments inventory stock', () => {
    const s = useStore.getState();
    const itemId = s.addItem({
      name: 'Sunlight Dish Soap',
      unit: 'bottle',
      category: 'Cleaning',
      currentStock: 2,
    });

    // Add to shopping list
    const shopRes = s.addToShopping({ name: 'Sunlight Dish Soap', itemId, quantity: 2 });
    expect(shopRes.ok).toBe(true);

    const shoppingItem = useStore.getState().shopping.find((x) => x.itemId === itemId)!;
    expect(shoppingItem).toBeDefined();

    // Record purchase with household scope
    s.recordPurchase({
      shoppingItemId: shoppingItem.id,
      itemId,
      name: 'Sunlight Dish Soap',
      category: 'Cleaning',
      quantity: 2,
      unit: 'bottle',
      price: 50000,
      store: 'WinMart',
      purchaseDate: today(),
      scope: 'household',
    });

    const st = useStore.getState();
    expect(st.shopping.some((x) => x.id === shoppingItem.id)).toBe(false);
    const updatedItem = st.items.find((i) => i.id === itemId)!;
    // 2 + 2 = 4
    expect(updatedItem.currentStock).toBe(4);
    expect(st.purchases.some((p) => p.itemId === itemId && p.price === 50000)).toBe(true);
  });

  it('ticking to-buy item with personal scope adds personal expense and increments inventory stock', () => {
    const s = useStore.getState();
    const itemId = s.addItem({
      name: 'Organic Milk 1L',
      unit: 'box',
      category: 'Groceries',
      currentStock: 1,
    });

    // Add to shopping list
    const shopRes = s.addToShopping({ name: 'Organic Milk 1L', itemId, quantity: 3 });
    expect(shopRes.ok).toBe(true);

    const shoppingItem = useStore.getState().shopping.find((x) => x.itemId === itemId)!;
    expect(shoppingItem).toBeDefined();

    // Record purchase with personal scope
    s.recordPurchase({
      shoppingItemId: shoppingItem.id,
      itemId,
      name: 'Organic Milk 1L',
      category: 'Groceries',
      quantity: 3,
      unit: 'box',
      price: 90000,
      store: 'VinMart',
      purchaseDate: today(),
      scope: 'personal',
      accountId: 'acc-cash',
    });

    const st = useStore.getState();
    // Cleared from shopping list
    expect(st.shopping.some((x) => x.id === shoppingItem.id)).toBe(false);
    // Stock is incremented: 1 + 3 = 4
    const updatedItem = st.items.find((i) => i.id === itemId)!;
    expect(updatedItem.currentStock).toBe(4);
    // Stored as personal transaction
    const tx = st.transactions.find((t) => t.itemId === itemId && t.scope === 'personal')!;
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(90000);
    expect(tx.accountId).toBe('acc-cash');
  });

  it('adding expense via addTransaction with itemId increments inventory stock and delete reverts it', () => {
    const s = useStore.getState();
    const itemId = s.addItem({
      name: 'Baking Soda',
      unit: 'box',
      category: 'Kitchen',
      currentStock: 0,
    });

    const txId = s.addTransaction({
      type: 'expense',
      scope: 'personal',
      categoryId: null,
      amount: 25000,
      date: today(),
      note: 'Baking Soda',
      itemId,
      quantity: 2,
      unit: 'box',
    });

    let st = useStore.getState();
    let updatedItem = st.items.find((i) => i.id === itemId)!;
    expect(updatedItem.currentStock).toBe(2);

    // Delete transaction reverts stock
    s.deleteTransaction(txId);
    st = useStore.getState();
    updatedItem = st.items.find((i) => i.id === itemId)!;
    expect(updatedItem.currentStock).toBe(0);
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

  it('records, updates and selects transfer transactions without polluting expense or income', async () => {
    const { useStore } = await import('../store');
    const { moneyEntries } = await import('../store/selectors');
    const s = useStore.getState();
    const sourceAcc = s.accounts[0];
    const destAcc = s.accounts[1];

    s.addTransaction({
      type: 'transfer',
      amount: 500000,
      date: '2026-10-14',
      accountId: sourceAcc.id,
      toAccountId: destAcc.id,
      note: 'ATM withdrawal to cash',
    });

    const state = useStore.getState();
    const transferTx = state.transactions.find((t) => t.type === 'transfer' && t.amount === 500000)!;
    expect(transferTx).toBeDefined();
    expect(transferTx.accountId).toBe(sourceAcc.id);
    expect(transferTx.toAccountId).toBe(destAcc.id);

    // Verify moneyEntries isolation
    const data = {
      transactions: state.transactions,
      purchases: state.purchases,
      moneyCategories: state.moneyCategories,
    };
    const expenses = moneyEntries(data, 'expense');
    expect(expenses.some((e) => e.id === transferTx.id)).toBe(false);

    const incomes = moneyEntries(data, 'income');
    expect(incomes.some((e) => e.id === transferTx.id)).toBe(false);

    const transfers = moneyEntries(data, 'transfer');
    const foundTransfer = transfers.find((e) => e.id === transferTx.id);
    expect(foundTransfer).toBeDefined();
    expect(foundTransfer?.accountId).toBe(sourceAcc.id);
    expect(foundTransfer?.toAccountId).toBe(destAcc.id);
    expect(foundTransfer?.title).toBe('ATM withdrawal to cash');

    // Update transfer
    state.updateTransaction(transferTx.id, {
      ...transferTx,
      amount: 600000,
      note: 'Updated note',
    });
    const updated = useStore.getState().transactions.find((t) => t.id === transferTx.id)!;
    expect(updated.amount).toBe(600000);
    expect(updated.note).toBe('Updated note');
    expect(updated.toAccountId).toBe(destAcc.id);
  });

  it('calculates account balances accurately across income, expense, transfer, and purchases', async () => {
    const { calculateAccountBalances } = await import('../store/selectors');
    const accounts = [
      { id: 'acc-1', householdId: 'h1', name: 'Bank' },
      { id: 'acc-2', householdId: 'h1', name: 'Cash' },
    ];
    const transactions = [
      {
        id: 'tx-1',
        householdId: 'h1',
        type: 'income' as const,
        amount: 10_000_000,
        date: '2026-10-01',
        accountId: 'acc-1',
      },
      {
        id: 'tx-2',
        householdId: 'h1',
        type: 'expense' as const,
        amount: 2_000_000,
        date: '2026-10-02',
        accountId: 'acc-1',
      },
      {
        id: 'tx-3',
        householdId: 'h1',
        type: 'transfer' as const,
        amount: 3_000_000,
        date: '2026-10-03',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
      },
    ];
    const purchases = [
      {
        id: 'p-1',
        householdId: 'h1',
        itemId: 'item-1',
        itemName: 'Groceries',
        category: 'Groceries' as const,
        quantity: 1,
        unit: 'pack',
        price: 500_000,
        store: 'Mart',
        purchaseDate: '2026-10-04',
        notes: '',
        accountId: 'acc-2',
      },
    ];

    const balances = calculateAccountBalances({ accounts, transactions, purchases });
    // Bank (acc-1): 10,000,000 (income) - 2,000,000 (expense) - 3,000,000 (transferred out) = 5,000,000
    expect(balances['acc-1']).toBe(5_000_000);
    // Cash (acc-2): 3,000,000 (transferred in) - 500,000 (purchase) = 2,500,000
    expect(balances['acc-2']).toBe(2_500_000);
  });

  it('sorts purchases by purchaseDate descending and newly added first on same date', () => {
    const rawPurchases = [
      { id: 'p1', itemName: 'First added earlier today', purchaseDate: '2026-10-14', createdAt: '2026-10-14T08:00:00.000Z' },
      { id: 'p2', itemName: 'Yesterday', purchaseDate: '2026-10-13', createdAt: '2026-10-13T10:00:00.000Z' },
      { id: 'p3', itemName: 'Newly added today', purchaseDate: '2026-10-14', createdAt: '2026-10-14T12:00:00.000Z' },
      { id: 'p4', itemName: 'Tomorrow', purchaseDate: '2026-10-15', createdAt: '2026-10-14T12:05:00.000Z' },
    ];

    const storeIndex = new Map(rawPurchases.map((p, idx) => [p.id, idx]));
    const sorted = [...rawPurchases].sort((a, b) => {
      const dateCmp = b.purchaseDate.localeCompare(a.purchaseDate);
      if (dateCmp !== 0) return dateCmp;
      if (a.createdAt && b.createdAt) {
        const createCmp = b.createdAt.localeCompare(a.createdAt);
        if (createCmp !== 0) return createCmp;
      }
      const idxA = storeIndex.get(a.id) ?? 0;
      const idxB = storeIndex.get(b.id) ?? 0;
      return idxB - idxA;
    });

    expect(sorted.map((p) => p.id)).toEqual(['p4', 'p3', 'p1', 'p2']);
  });

  it('initializes createSeed with a clean slate and default accounts', async () => {
    const { createSeed } = await import('../store/seed');
    const data = createSeed();
    const personalAccounts = data.accounts.filter((a) => a.scope === 'personal');
    expect(personalAccounts.length).toBeGreaterThanOrEqual(2);
    expect(data.tasks.length).toBe(0);
    expect(data.transactions.length).toBe(0);
    expect(data.items.length).toBe(0);
    expect(data.shopping.length).toBe(0);
    expect(data.members.length).toBe(1);
    expect(data.members[0].name).toBe('Me');
    expect(data.currentMemberId).toBe(data.members[0].id);
  });

  it('calculates Net Worth correctly based on Asset and Debt account natures', async () => {
    const { calculateAccountBalances } = await import('../store/selectors');
    const accounts: Account[] = [
      { id: 'acc-asset-1', householdId: 'h1', name: 'Cash', scope: 'personal', nature: 'asset' },
      { id: 'acc-asset-2', householdId: 'h1', name: 'Savings', scope: 'personal', nature: 'asset' },
      { id: 'acc-debt-1', householdId: 'h1', name: 'Credit Card', scope: 'personal', nature: 'debt' },
    ];

    const transactions = [
      // Cash income 20,000,000
      { id: 't1', householdId: 'h1', type: 'income' as const, amount: 20_000_000, date: '2026-10-01', accountId: 'acc-asset-1' },
      // Savings transfer 5,000,000
      { id: 't2', householdId: 'h1', type: 'transfer' as const, amount: 5_000_000, date: '2026-10-02', accountId: 'acc-asset-1', toAccountId: 'acc-asset-2' },
      // Credit card expense 4,000,000
      { id: 't3', householdId: 'h1', type: 'expense' as const, amount: 4_000_000, date: '2026-10-03', accountId: 'acc-debt-1' },
    ];

    const balances = calculateAccountBalances({ accounts, transactions, purchases: [] });
    expect(balances['acc-asset-1']).toBe(15_000_000);
    expect(balances['acc-asset-2']).toBe(5_000_000);
    expect(balances['acc-debt-1']).toBe(-4_000_000);

    let assets = 0;
    let debts = 0;
    for (const acc of accounts) {
      if (acc.excludeFromTotal) continue;
      const bal = balances[acc.id] ?? 0;
      if (acc.nature === 'debt') {
        debts += bal < 0 ? Math.abs(bal) : bal;
      } else {
        assets += bal;
      }
    }

    expect(assets).toBe(20_000_000);
    expect(debts).toBe(4_000_000);
    expect(assets - debts).toBe(16_000_000);

    // If an account has excludeFromTotal = true, it should not be counted in total assets
    const accountsWithExclusion: Account[] = [
      ...accounts,
      { id: 'acc-lent-1', householdId: 'h1', name: 'Quỹ vợ chồng', nature: 'asset', initialBalance: 120_500_000, excludeFromTotal: true },
    ];
    const balancesWithLent = calculateAccountBalances({ accounts: accountsWithExclusion, transactions, purchases: [] });
    expect(balancesWithLent['acc-lent-1']).toBe(120_500_000);

    let assetsFiltered = 0;
    for (const acc of accountsWithExclusion) {
      if (acc.excludeFromTotal) continue;
      const bal = balancesWithLent[acc.id] ?? 0;
      if (acc.nature !== 'debt') assetsFiltered += bal;
    }
    expect(assetsFiltered).toBe(20_000_000);
  });

  it('manages household and personal budget via store actions', async () => {
    const { useStore } = await import('../store');
    const setBudget = useStore.getState().setBudget;

    setBudget('household', 35_000_000);
    expect(useStore.getState().householdBudget).toBe(35_000_000);

    setBudget('personal', 18_000_000);
    expect(useStore.getState().personalBudget).toBe(18_000_000);

    setBudget('household', null);
    expect(useStore.getState().householdBudget).toBeNull();
  });

  it('supports initialBalance when creating account and includes it in account balances', async () => {
    const { useStore } = await import('../store');
    const { calculateAccountBalances } = await import('../store/selectors');

    const addAccount = useStore.getState().addAccount;
    const newAccId = addAccount('Gold Savings', 'gold', '#F59E0B', 'household', 'asset', 50_000_000);

    const created = useStore.getState().accounts.find((a) => a.id === newAccId);
    expect(created).toBeDefined();
    expect(created?.initialBalance).toBe(50_000_000);

    const balances = calculateAccountBalances({
      accounts: useStore.getState().accounts,
      transactions: [],
      purchases: [],
    });
    expect(balances[newAccId]).toBe(50_000_000);
  });

  it('provides concise basic purchase units for modal selection', async () => {
    const { BASIC_PURCHASE_UNITS } = await import('../components/UnitPickerModal');
    expect(BASIC_PURCHASE_UNITS).toContain('pack');
    expect(BASIC_PURCHASE_UNITS).toContain('item');
    expect(BASIC_PURCHASE_UNITS).toContain('box');
    expect(BASIC_PURCHASE_UNITS).toContain('bottle');
    expect(BASIC_PURCHASE_UNITS).toContain('bag');
    expect(BASIC_PURCHASE_UNITS).toContain('roll');
    expect(BASIC_PURCHASE_UNITS.length).toBe(6);
  });

  it('resiliently handles invalid, undefined, null, and ISO dates without crashing', () => {
    expect(() => parseDate(undefined)).not.toThrow();
    expect(() => parseDate(null)).not.toThrow();
    expect(() => parseDate('')).not.toThrow();

    // ISO timestamp strings should extract date cleanly
    expect(shortDate('2026-10-16T12:00:00.000Z')).toBe('16 Oct');
    expect(longDate('2026-10-16T12:00:00.000Z')).toBe('16 Oct 2026');
    expect(weekdayName('2026-10-16T12:00:00.000Z')).toBe('Friday');

    // Standard date string
    expect(shortDate('2026-10-16')).toBe('16 Oct');
    expect(longDate('2026-10-16')).toBe('16 Oct 2026');
    expect(weekdayName('2026-10-16')).toBe('Friday');

    // Missing / malformed dates should return fallback without crashing
    expect(shortDate(undefined as any)).toBe('—');
    expect(longDate(undefined as any)).toBe('—');
    expect(weekdayName(undefined as any)).toBe('');
  });

  it('manages inventory items with room, stock, addItem, and deleteItem', async () => {
    const { useStore } = await import('../store');
    const { resolveItemRoom } = await import('../lib/rooms');

    const addItem = useStore.getState().addItem;
    const updateItem = useStore.getState().updateItem;
    const deleteItem = useStore.getState().deleteItem;

    // 1. Add item with room
    const itemId = addItem({
      name: 'Air Purifier Filter',
      room: 'Living',
      category: 'Maintenance',
      unit: 'piece',
      currentStock: 3,
    });

    let item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item).toBeDefined();
    expect(item?.name).toBe('Air Purifier Filter');
    expect(item?.room).toBe('Living');
    expect(item?.currentStock).toBe(3);
    expect(resolveItemRoom(item!)).toBe('Living');

    // 2. Room fallback when room is not set
    const fallbackItem = { id: 'test', householdId: 'h', name: 'Sponge', category: 'Kitchen' as const, quantity: 1, unit: 'pack', currentStock: 2, status: 'in_stock' as const, expectedUsageDays: null, notes: '' };
    expect(resolveItemRoom(fallbackItem)).toBe('Kitchen');

    const bathroomItem = { id: 'test2', householdId: 'h', name: 'Shampoo', category: 'Bathroom' as const, quantity: 1, unit: 'bottle', currentStock: 1, status: 'in_stock' as const, expectedUsageDays: null, notes: '' };
    expect(resolveItemRoom(bathroomItem)).toBe('Bathroom');

    const cleaningItem = { id: 'test3', householdId: 'h', name: 'Bleach', category: 'Cleaning' as const, quantity: 1, unit: 'bottle', currentStock: 1, status: 'in_stock' as const, expectedUsageDays: null, notes: '' };
    expect(resolveItemRoom(cleaningItem)).toBe('Laundry');

    // 3. Update item
    updateItem(itemId, { currentStock: 5, room: 'Bedroom' });
    item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item?.currentStock).toBe(5);
    expect(item?.room).toBe('Bedroom');

    // 4. Link task to item and verify stock reduction on complete
    const addTask = useStore.getState().addTask;
    const completeTask = useStore.getState().completeTask;

    const taskId = addTask({
      title: 'Replace Bedroom Filter',
      assigneeId: null,
      dueDate: '2026-10-20',
      recurrence: null,
      estimatedDuration: 15,
      reminder: null,
      area: 'Bedroom',
      notes: '',
      checklist: [],
      mappedItemId: itemId,
      mappedQuantity: 1,
    });

    completeTask(taskId);

    item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item?.currentStock).toBe(4);

    // 5. Direct use item button (decrements 1 with undo)
    const useItem = useStore.getState().useItem;
    const undoUse = useItem(itemId, 1);
    item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item?.currentStock).toBe(3);

    // Undo use
    undoUse();
    item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item?.currentStock).toBe(4);

    // 6. Delete item with undo
    const undo = deleteItem(itemId);
    expect(useStore.getState().items.find((i) => i.id === itemId)).toBeUndefined();

    // Verify task mappedItemId is cleared
    const taskAfter = useStore.getState().tasks.find((t) => t.id === taskId);
    expect(taskAfter?.mappedItemId).toBeNull();

    // Undo delete
    undo();
    expect(useStore.getState().items.find((i) => i.id === itemId)).toBeDefined();
  });
});

describe('Category insight exclusion rules and transaction note handling', () => {
  it('correctly identifies categories where item insights are completely hidden', () => {
    expect(isCategoryHiddenFromInsights('exp-food', 'Food')).toBe(true);
    expect(isCategoryHiddenFromInsights(null, 'Đồ uống')).toBe(true);
    expect(isCategoryHiddenFromInsights(null, 'Cà phê')).toBe(true);
    expect(isCategoryHiddenFromInsights('exp-social', 'Social')).toBe(true);
    expect(isCategoryHiddenFromInsights('exp-family', 'Family')).toBe(true);
    expect(isCategoryHiddenFromInsights('inc-gift', 'Gift')).toBe(true);
    expect(isCategoryHiddenFromInsights(null, 'Hiếu hỷ & Quà tặng')).toBe(true);
    expect(isCategoryHiddenFromInsights('exp-medical', 'Medical')).toBe(true);
    expect(isCategoryHiddenFromInsights(null, 'Thuốc phát sinh / Bác sĩ')).toBe(true);

    // Categories that are NOT hidden
    expect(isCategoryHiddenFromInsights('exp-daily', 'Daily')).toBe(false);
    expect(isCategoryHiddenFromInsights('exp-beauty', 'Beauty')).toBe(false);
    expect(isCategoryHiddenFromInsights('exp-traffic', 'Traffic')).toBe(false);
    expect(isCategoryHiddenFromInsights('exp-clothes', 'Clothes')).toBe(false);
    expect(isCategoryHiddenFromInsights('exp-entertainment', 'Entertainment')).toBe(false);
  });

  it('correctly identifies categories where product cycle is hidden but average is kept', () => {
    // Traffic, Entertainment, Clothes hide cycle
    expect(isCategoryCycleHidden('exp-traffic', 'Traffic')).toBe(true);
    expect(isCategoryCycleHidden(null, 'Đi lại / Grab')).toBe(true);
    expect(isCategoryCycleHidden('exp-entertainment', 'Entertainment')).toBe(true);
    expect(isCategoryCycleHidden(null, 'Giải trí / Phim')).toBe(true);
    expect(isCategoryCycleHidden('exp-clothes', 'Clothes')).toBe(true);
    expect(isCategoryCycleHidden(null, 'Thời trang')).toBe(true);

    // Beauty MUST show cycle (explicit user requirement: Mỹ phẩm có show)
    expect(isCategoryCycleHidden('exp-beauty', 'Beauty')).toBe(false);
    expect(isCategoryCycleHidden(null, 'Mỹ phẩm')).toBe(false);

    // Daily / regular items show cycle
    expect(isCategoryCycleHidden('exp-daily', 'Daily')).toBe(false);
  });

  it('adding transaction from Wallet preserves itemName and note without polluting inventory items', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();
    const itemsCountBefore = s.items.length;

    const txId = s.addTransaction({
      type: 'expense',
      scope: 'personal',
      amount: 45000,
      date: today(),
      itemName: 'Highland Coffee',
      note: 'Meeting with An',
      categoryId: 'exp-food',
    });

    const st = useStore.getState();
    const createdTx = st.transactions.find((t) => t.id === txId);
    expect(createdTx).toBeDefined();
    expect(createdTx?.itemName).toBe('Highland Coffee');
    expect(createdTx?.note).toBe('Meeting with An');

    // Crucial requirement: Adding expense does NOT automatically create item in inventory
    expect(st.items.length).toBe(itemsCountBefore);
    expect(st.items.find((i) => i.name === 'Highland Coffee')).toBeUndefined();

    // Updating transaction preserves both fields
    st.updateTransaction(txId, {
      type: 'expense',
      amount: 50000,
      date: today(),
      itemName: 'Highland PhinDi',
      note: 'Size L',
    });

    const updatedTx = useStore.getState().transactions.find((t) => t.id === txId);
    expect(updatedTx?.itemName).toBe('Highland PhinDi');
    expect(updatedTx?.note).toBe('Size L');
    expect(updatedTx?.amount).toBe(50000);
  });

  it('addItemFromExpense creates item in inventory and links past records with matching name', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();

    // 1. User records an expense that is not in inventory
    const txId = s.addTransaction({
      type: 'expense',
      scope: 'household',
      amount: 65000,
      date: '2026-10-10',
      itemName: 'Nước lau sàn Sunlight',
      note: 'Hương hoa hạ',
      quantity: 2,
      unit: 'bottle',
      categoryId: 'exp-daily',
    });

    // Verify it is not in items
    expect(useStore.getState().items.find((i) => i.name === 'Nước lau sàn Sunlight')).toBeUndefined();

    // 2. User clicks [Thêm vào kho]
    const entry = {
      id: `tx-${txId}`,
      kind: 'transaction' as const,
      type: 'expense' as const,
      date: '2026-10-10',
      amount: 65000,
      itemName: 'Nước lau sàn Sunlight',
      notes: 'Hương hoa hạ',
      categoryId: 'exp-daily',
      rawTransaction: useStore.getState().transactions.find((t) => t.id === txId),
    };

    const newItemId = useStore.getState().addItemFromExpense(entry);
    expect(newItemId).toBeTruthy();

    // Verify item now exists in inventory with correct details
    const createdItem = useStore.getState().items.find((i) => i.id === newItemId);
    expect(createdItem).toBeDefined();
    expect(createdItem?.name).toBe('Nước lau sàn Sunlight');
    expect(createdItem?.unit).toBe('bottle');
    expect(createdItem?.currentStock).toBe(2);
    expect(createdItem?.spendCategoryId).toBe('exp-daily');

    // Verify transaction is linked to itemId
    const linkedTx = useStore.getState().transactions.find((t) => t.id === txId);
    expect(linkedTx?.itemId).toBe(newItemId);
  });

  it('defaults purchase unit to item when none is provided', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();

    const txId = s.addTransaction({
      type: 'expense',
      scope: 'household',
      amount: 30000,
      date: '2026-10-12',
      itemName: 'Bàn chải đánh răng',
      categoryId: 'exp-daily',
    });

    const entry = {
      id: `tx-${txId}`,
      kind: 'transaction' as const,
      type: 'expense' as const,
      date: '2026-10-12',
      amount: 30000,
      itemName: 'Bàn chải đánh răng',
      categoryId: 'exp-daily',
      rawTransaction: useStore.getState().transactions.find((t) => t.id === txId),
    };

    const newItemId = useStore.getState().addItemFromExpense(entry);
    const createdItem = useStore.getState().items.find((i) => i.id === newItemId);
    expect(createdItem?.unit).toBe('item');
  });

  it('records the active member in completedBy when task is completed and clears it on uncomplete', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();
    const memberA = s.members[0];
    const memberB = s.members[1] || s.members[0];
    s.setCurrentMember(memberB.id);

    const taskId = s.addTask({
      title: 'Take out compost',
      assigneeId: memberA.id,
      dueDate: '2026-10-29',
      recurrence: null,
      estimatedDuration: null,
      reminder: null,
      area: 'Kitchen',
      notes: '',
      checklist: [],
    });

    // Member B ticks it done
    s.completeTask(taskId);
    let task = useStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.completed).toBe(true);
    expect(task?.completedBy).toBe(memberB.id);

    // Uncomplete
    s.uncompleteTask(taskId);
    task = useStore.getState().tasks.find((t) => t.id === taskId);
    expect(task?.completed).toBe(false);
    expect(task?.completedBy).toBeNull();
  });

  it('deletes occurrence only for active due date without deleting other days', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();
    const taskId = s.addTask({
      title: 'Water plants daily',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-08' },
      estimatedDuration: null,
      reminder: null,
      area: 'Balcony',
      notes: '',
      checklist: [],
    });

    const seriesTasks = useStore.getState().tasks.filter((t) => t.title === 'Water plants daily');
    expect(seriesTasks.length).toBe(5);

    // Delete occurrence for 2026-11-04
    const undo = s.deleteTaskOccurrence(taskId, '2026-11-04');
    let remaining = useStore.getState().tasks.filter((t) => t.title === 'Water plants daily');
    expect(remaining.length).toBe(4);
    expect(remaining.some((t) => t.dueDate === '2026-11-04')).toBe(false);
    expect(remaining.some((t) => t.dueDate === '2026-11-05')).toBe(true);

    // Undo restores 2026-11-04
    undo();
    remaining = useStore.getState().tasks.filter((t) => t.title === 'Water plants daily');
    expect(remaining.length).toBe(5);
    expect(remaining.some((t) => t.dueDate === '2026-11-04')).toBe(true);
  });

  it('deletes occurrence for future projected or pre-generated date', async () => {
    const { useStore } = await import('../store');
    const { tasksByDay } = await import('../store/selectors');
    const s = useStore.getState();
    s.addTask({
      title: 'Vacuum living room',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-08' },
      estimatedDuration: null,
      reminder: null,
      area: 'Living Room',
      notes: '',
      checklist: [],
    });

    // Before deleting, 2026-11-06 has occurrence
    let dayMap = tasksByDay(useStore.getState().tasks, '2026-11-04', '2026-11-07', '2026-11-04');
    expect(dayMap.get('2026-11-06')?.some((e) => e.task.title === 'Vacuum living room')).toBe(true);

    // Delete occurrence for 2026-11-06 only
    const taskOnNov6 = useStore.getState().tasks.find((t) => t.title === 'Vacuum living room' && t.dueDate === '2026-11-06')!;
    const undo = s.deleteTaskOccurrence(taskOnNov6.id, '2026-11-06');

    // Now 2026-11-06 should NOT have this task
    dayMap = tasksByDay(useStore.getState().tasks, '2026-11-04', '2026-11-07', '2026-11-04');
    expect(dayMap.get('2026-11-06')?.some((e) => e.task.title === 'Vacuum living room')).toBe(false);

    // But 2026-11-05 and 2026-11-07 still have it
    expect(dayMap.get('2026-11-05')?.some((e) => e.task.title === 'Vacuum living room')).toBe(true);
    expect(dayMap.get('2026-11-07')?.some((e) => e.task.title === 'Vacuum living room')).toBe(true);

    // Undo restores it
    undo();
    dayMap = tasksByDay(useStore.getState().tasks, '2026-11-04', '2026-11-07', '2026-11-04');
    expect(dayMap.get('2026-11-06')?.some((e) => e.task.title === 'Vacuum living room')).toBe(true);
  });

  it('deletes entire recurring task series', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();
    const taskId = s.addTask({
      title: 'Mop floor weekly',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'week', interval: 1, endDate: '2026-11-25' },
      estimatedDuration: null,
      reminder: null,
      area: 'House',
      notes: '',
      checklist: [{ title: 'Fill bucket', completed: false }],
    });

    const task = useStore.getState().tasks.find((t) => t.id === taskId)!;
    const seriesCount = useStore.getState().tasks.filter((t) => t.seriesId === task.seriesId).length;
    expect(seriesCount).toBe(4);

    // Delete all occurrences
    const undo = useStore.getState().deleteTaskSeries(task.seriesId);
    expect(useStore.getState().tasks.filter((t) => t.seriesId === task.seriesId).length).toBe(0);

    // Undo restores all occurrences in series
    undo();
    expect(useStore.getState().tasks.filter((t) => t.seriesId === task.seriesId).length).toBe(4);
  });
});

describe('pre-generated recurring tasks in time range', () => {
  it('pre-generates all occurrences within the time range at creation time and does NOT auto-spawn on completeTask', async () => {
    const { useStore } = await import('../store');
    const s = useStore.getState();
    s.addTask({
      title: 'Morning Yoga',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-08' },
      estimatedDuration: null,
      reminder: null,
      area: 'Living Room',
      notes: '15 mins stretch',
      checklist: [{ title: 'Warm up', completed: false }],
    });

    // 1. Pre-generated at creation time: 5 occurrences (Nov 4, 5, 6, 7, 8)
    const seriesTasks = useStore.getState().tasks.filter((t) => t.title === 'Morning Yoga');
    expect(seriesTasks.length).toBe(5);
    expect(seriesTasks.map((t) => t.dueDate)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(seriesTasks.every((t) => !t.completed)).toBe(true);

    // 2. Tick done on Nov 4 task:
    const nov4 = seriesTasks.find((t) => t.dueDate === '2026-11-04')!;
    useStore.getState().completeTask(nov4.id);

    // After tick done: Nov 4 is completed, total count is STILL 5 (NO auto-spawned next task!)
    const afterDone = useStore.getState().tasks.filter((t) => t.title === 'Morning Yoga');
    expect(afterDone.length).toBe(5);
    expect(afterDone.find((t) => t.dueDate === '2026-11-04')?.completed).toBe(true);
    expect(afterDone.find((t) => t.dueDate === '2026-11-05')?.completed).toBe(false);
    expect(afterDone.find((t) => t.dueDate === '2026-11-06')?.completed).toBe(false);

    // 3. Untick Nov 4 task:
    useStore.getState().uncompleteTask(nov4.id);
    const afterUntick = useStore.getState().tasks.filter((t) => t.title === 'Morning Yoga');
    expect(afterUntick.length).toBe(5);
    expect(afterUntick.find((t) => t.dueDate === '2026-11-04')?.completed).toBe(false);

    // 4. Delete occurrence on Nov 6 only:
    const nov6 = afterUntick.find((t) => t.dueDate === '2026-11-06')!;
    useStore.getState().deleteTaskOccurrence(nov6.id, '2026-11-06');
    const afterDeleteOne = useStore.getState().tasks.filter((t) => t.title === 'Morning Yoga');
    expect(afterDeleteOne.length).toBe(4);
    expect(afterDeleteOne.some((t) => t.dueDate === '2026-11-06')).toBe(false);
    expect(afterDeleteOne.some((t) => t.dueDate === '2026-11-05')).toBe(true);
    expect(afterDeleteOne.some((t) => t.dueDate === '2026-11-07')).toBe(true);

    // 5. Edit task: update title and extend time range to Nov 10
    useStore.getState().updateTask(nov4.id, {
      title: 'Power Yoga',
      assigneeId: null,
      dueDate: '2026-11-04',
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-10' },
      estimatedDuration: null,
      reminder: null,
      area: 'Living Room',
      notes: 'Updated notes',
      checklist: [{ title: 'Warm up', completed: false }],
    });

    const afterEdit = useStore.getState().tasks.filter((t) => t.title === 'Power Yoga');
    expect(afterEdit.length).toBe(7); // Nov 4, 5, 6, 7, 8, 9, 10
    expect(afterEdit.map((t) => t.dueDate)).toEqual([
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
    ]);
  });

  it('clicking done today preserves tomorrow and day after tomorrow in all views', async () => {
    const { useStore } = await import('../store');
    const { tasksByDay, taskLists } = await import('../store/selectors');
    const s = useStore.getState();

    const todayDate = '2026-11-04';
    const tomorrowDate = '2026-11-05';
    const dayAfterDate = '2026-11-06';

    const taskId = s.addTask({
      title: 'Take vitamins',
      assigneeId: null,
      dueDate: todayDate,
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-10' },
      estimatedDuration: null,
      reminder: null,
      area: null,
      notes: '',
      checklist: [],
    });

    // Check before: today, tomorrow, day after tomorrow all exist
    let dayMap = tasksByDay(useStore.getState().tasks, todayDate, dayAfterDate, todayDate);
    expect(dayMap.get(todayDate)?.some((e) => e.task.title === 'Take vitamins' && !e.task.completed)).toBe(true);
    expect(dayMap.get(tomorrowDate)?.some((e) => e.task.title === 'Take vitamins' && !e.task.completed)).toBe(true);
    expect(dayMap.get(dayAfterDate)?.some((e) => e.task.title === 'Take vitamins' && !e.task.completed)).toBe(true);

    // Click done on today's task
    s.completeTask(taskId);

    // After clicking done:
    // 1. Today is completed
    const currentTodayTask = useStore.getState().tasks.find((t) => t.id === taskId);
    expect(currentTodayTask?.completed).toBe(true);

    // 2. Tomorrow and day after are STILL present and uncompleted in tasksByDay
    dayMap = tasksByDay(useStore.getState().tasks, todayDate, dayAfterDate, todayDate);
    expect(dayMap.get(todayDate)?.find((e) => e.task.title === 'Take vitamins')?.task.completed).toBe(true);

    const tomorrowEntry = dayMap.get(tomorrowDate)?.find((e) => e.task.title === 'Take vitamins');
    expect(tomorrowEntry).toBeDefined();
    expect(tomorrowEntry?.task.completed).toBe(false);

    const dayAfterEntry = dayMap.get(dayAfterDate)?.find((e) => e.task.title === 'Take vitamins');
    expect(dayAfterEntry).toBeDefined();
    expect(dayAfterEntry?.task.completed).toBe(false);

    // 3. In upcoming task list, tomorrow and day after are still listed
    const lists = taskLists(useStore.getState().tasks, todayDate);
    expect(lists.upcoming.some((t) => t.dueDate === tomorrowDate && t.title === 'Take vitamins')).toBe(true);
    expect(lists.upcoming.some((t) => t.dueDate === dayAfterDate && t.title === 'Take vitamins')).toBe(true);
  });

  it('clicking done on Monday when today is Wednesday does not delete Tuesday or Wednesday', async () => {
    const { useStore } = await import('../store');
    const { tasksByDay } = await import('../store/selectors');
    const s = useStore.getState();

    const monday = '2026-11-02';
    const tuesday = '2026-11-03';
    const wednesday = '2026-11-04';
    const thursday = '2026-11-05';

    s.addTask({
      title: 'Water plants daily',
      assigneeId: null,
      dueDate: monday,
      recurrence: { unit: 'day', interval: 1, endDate: '2026-11-10' },
      estimatedDuration: null,
      reminder: null,
      area: null,
      notes: '',
      checklist: [],
    });

    const mondayTask = useStore.getState().tasks.find((t) => t.title === 'Water plants daily' && t.dueDate === monday)!;
    const tuesdayTask = useStore.getState().tasks.find((t) => t.title === 'Water plants daily' && t.dueDate === tuesday)!;
    const wednesdayTask = useStore.getState().tasks.find((t) => t.title === 'Water plants daily' && t.dueDate === wednesday)!;

    // Ticking done Monday on Wednesday
    s.completeTask(mondayTask.id);

    // Monday is completed
    expect(useStore.getState().tasks.find((t) => t.id === mondayTask.id)?.completed).toBe(true);

    // Tuesday and Wednesday are NOT deleted and NOT completed!
    const tuesdayAfter = useStore.getState().tasks.find((t) => t.id === tuesdayTask.id);
    expect(tuesdayAfter).toBeDefined();
    expect(tuesdayAfter?.completed).toBe(false);

    const wednesdayAfter = useStore.getState().tasks.find((t) => t.id === wednesdayTask.id);
    expect(wednesdayAfter).toBeDefined();
    expect(wednesdayAfter?.completed).toBe(false);

    // In tasksByDay for the week: Monday is done, Tuesday/Wednesday/Thursday are open
    const weekMap = tasksByDay(useStore.getState().tasks, monday, thursday, wednesday);
    expect(weekMap.get(monday)?.find((e) => e.task.title === 'Water plants daily')?.task.completed).toBe(true);
    expect(weekMap.get(tuesday)?.find((e) => e.task.title === 'Water plants daily')?.task.completed).toBe(false);
    expect(weekMap.get(wednesday)?.find((e) => e.task.title === 'Water plants daily')?.task.completed).toBe(false);
    expect(weekMap.get(thursday)?.find((e) => e.task.title === 'Water plants daily')?.task.completed).toBe(false);
  });

  it('migration v13 prunes tasks after recurrence.endDate and tasksByDay strictly stops at 15-Nov', async () => {
    const { useStore } = await import('../store');
    const { tasksByDay, taskLists } = await import('../store/selectors');

    // Simulate pre-existing state with tasks on 15-Nov, 16-Nov, 17-Nov for a series ending on 15-Nov
    const sid = 'test-series-15nov';
    const fakeData = {
      tasks: [
        {
          id: 't-15',
          seriesId: sid,
          title: 'Daily until 15 Nov',
          dueDate: '2026-11-15',
          recurrence: { unit: 'day', interval: 1, endDate: '2026-11-15' },
          completed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 't-16',
          seriesId: sid,
          title: 'Daily until 15 Nov',
          dueDate: '2026-11-16',
          recurrence: { unit: 'day', interval: 1, endDate: '2026-11-15' },
          completed: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 't-17',
          seriesId: sid,
          title: 'Daily until 15 Nov',
          dueDate: '2026-11-17',
          recurrence: { unit: 'day', interval: 1, endDate: '2026-11-15' },
          completed: false,
          createdAt: new Date().toISOString(),
        },
      ],
      checklist: [
        { id: 'c-16', taskId: 't-16', title: 'Step', completed: false },
      ],
    };

    const migrate = useStore.persist.getOptions().migrate!;
    const migrated = migrate(fakeData as any, 12) as typeof fakeData;

    // In migrated data: t-16 and t-17 must be pruned! Only t-15 remains!
    expect(migrated.tasks.some((t) => t.dueDate === '2026-11-15')).toBe(true);
    expect(migrated.tasks.some((t) => t.dueDate === '2026-11-16')).toBe(false);
    expect(migrated.tasks.some((t) => t.dueDate === '2026-11-17')).toBe(false);
    expect(migrated.checklist.some((c) => c.taskId === 't-16')).toBe(false);

    // Verify tasksByDay and taskLists with tasks stopping at 15-Nov
    const map = tasksByDay(migrated.tasks as any, '2026-11-14', '2026-11-20', '2026-11-14');
    expect(map.get('2026-11-15')?.some((e) => e.task.title === 'Daily until 15 Nov')).toBe(true);
    expect(Boolean(map.get('2026-11-16')?.some((e) => e.task.title === 'Daily until 15 Nov'))).toBe(false);
    expect(Boolean(map.get('2026-11-17')?.some((e) => e.task.title === 'Daily until 15 Nov'))).toBe(false);

    const lists = taskLists(migrated.tasks as any, '2026-11-14');
    expect(lists.upcoming.some((t) => t.dueDate === '2026-11-15')).toBe(true);
    expect(lists.upcoming.some((t) => t.dueDate === '2026-11-16')).toBe(false);
    expect(lists.upcoming.some((t) => t.dueDate === '2026-11-17')).toBe(false);
  });
});







