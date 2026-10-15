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

    // Next occurrence inherits mapping
    const doneTask = st.tasks.find((t) => t.id === task.id)!;
    const nextTask = st.tasks.find((t) => t.id === doneTask.nextOccurrenceId)!;
    expect(nextTask.mappedItemId).toBe(trash.id);
    expect(nextTask.mappedQuantity).toBe(2);

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

  it('populates personal demo transactions and accounts in createSeed', async () => {
    const { createSeed } = await import('../store/seed');
    const data = createSeed();
    const personalAccounts = data.accounts.filter((a) => a.scope === 'personal');
    expect(personalAccounts.length).toBeGreaterThanOrEqual(2);

    const personalTx = data.transactions.filter((t) => t.scope === 'personal');
    expect(personalTx.length).toBeGreaterThan(0);

    const personalExpenses = personalTx.filter((t) => t.type === 'expense');
    const personalIncomes = personalTx.filter((t) => t.type === 'income');
    expect(personalExpenses.length).toBeGreaterThan(0);
    expect(personalIncomes.length).toBeGreaterThan(0);
  });

  it('calculates Net Worth correctly based on Asset and Debt account natures', async () => {
    const { calculateAccountBalances } = await import('../store/selectors');
    const accounts = [
      { id: 'acc-asset-1', householdId: 'h1', name: 'Cash', scope: 'personal' as const, nature: 'asset' as const },
      { id: 'acc-asset-2', householdId: 'h1', name: 'Savings', scope: 'personal' as const, nature: 'asset' as const },
      { id: 'acc-debt-1', householdId: 'h1', name: 'Credit Card', scope: 'personal' as const, nature: 'debt' as const },
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
});


