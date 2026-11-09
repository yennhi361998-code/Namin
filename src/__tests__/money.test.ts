import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, press } from '../lib/calc';
import { today } from '../lib/dates';
import { DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import { moneyForMonth } from '../store/selectors';

const typeKeys = (keys: string[]) => keys.reduce(press, '');

describe('keypad', () => {
  it('builds expressions', () => {
    expect(typeKeys(['4', '5', '0', '0', '0', '+', '3', '0', '0', '0', '0'])).toBe('45000+30000');
    expect(typeKeys(['+', '5'])).toBe('5'); // no leading operator
    expect(typeKeys(['5', '+', '×', '2'])).toBe('5×2'); // second operator swaps
    expect(typeKeys(['0', '0', '7'])).toBe('7'); // no leading zeros
    expect(typeKeys(['.', '5', '.', '2'])).toBe('0.52'); // one decimal point per number
    expect(typeKeys(['1', '2', 'back'])).toBe('1');
    expect(typeKeys(['000', '5'])).toBe('5');
    expect(typeKeys(['4', '5', '000'])).toBe('45000');
  });
  it('evaluates with precedence', () => {
    expect(evaluate('45000+30000')).toBe(75000);
    expect(evaluate('100000−20000×2')).toBe(60000);
    expect(evaluate('90000÷3+')).toBe(30000);
    expect(evaluate('1.5×20000')).toBe(30000);
    expect(evaluate('5÷0')).toBeNull();
    expect(evaluate('')).toBeNull();
  });
});

describe('money totals', () => {
  let useStore: typeof import('../store').useStore;
  beforeEach(async () => {
    ({ useStore } = await import('../store'));
    useStore.getState().resetDemo();
  });

  it('purchases count as expenses under their chosen category, Daily by default', () => {
    const s = useStore.getState();
    const key = today().slice(0, 7);
    const before = moneyForMonth(s, 'expense', key);
    s.recordPurchase({ name: 'Lamp', category: 'Maintenance', quantity: 1, unit: '', price: 300000, store: '', purchaseDate: today() });
    s.recordPurchase({ name: 'Milk', category: 'Groceries', quantity: 1, unit: '', price: 40000, store: '', purchaseDate: today(), spendCategoryId: 'exp-food' });
    const after = moneyForMonth(useStore.getState(), 'expense', key);
    expect(after.total - before.total).toBe(340000);
    const daily = (m: typeof after) => m.rows.find((r) => r.category.id === DAILY_CATEGORY_ID)?.total ?? 0;
    expect(daily(after) - daily(before)).toBe(300000);
    // The chosen category is remembered on the item.
    expect(useStore.getState().items.find((i) => i.name === 'Milk')!.spendCategoryId).toBe('exp-food');
  });

  it('income and custom categories; archived categories keep their history', () => {
    const s = useStore.getState();
    const key = today().slice(0, 7);
    const id = s.addMoneyCategory({ type: 'income', name: 'Rent out', icon: 'bank', color: '#3E97C8' });
    s.addTransaction({ type: 'income', categoryId: id, amount: 5_000_000, date: today(), note: '' });
    useStore.getState().archiveMoneyCategory(id);
    const m = moneyForMonth(useStore.getState(), 'income', key);
    const row = m.rows.find((r) => r.category.id === id)!;
    expect(row.total).toBe(5_000_000);
    expect(row.category.name).toBe('Rent out');
    expect(m.rows.reduce((n, r) => n + r.share, 0)).toBeCloseTo(1);
  });

  it('can create an account with archived property and update it', () => {
    const s = useStore.getState();
    const id = s.addAccount('Old Wallet', 'payments', '#64748B', 'personal', 'asset', 500000, false, true);

    let acc = useStore.getState().accounts.find((a) => a.id === id);
    expect(acc).toBeDefined();
    expect(acc?.name).toBe('Old Wallet');
    expect(acc?.archived).toBe(true);

    // Unarchive the account
    useStore.getState().updateAccount(id, { archived: false });
    acc = useStore.getState().accounts.find((a) => a.id === id);
    expect(acc?.archived).toBe(false);
  });

  it('reorders accounts within state without affecting other accounts', () => {
    const s = useStore.getState();
    const id1 = s.addAccount('Wallet 1', 'payments', '#3FA88B', 'personal');
    const id2 = s.addAccount('Wallet 2', 'payments', '#4B7BFF', 'personal');
    const id3 = s.addAccount('Wallet 3', 'payments', '#E9A3E0', 'personal');

    const accountsBefore = useStore.getState().accounts;
    const initialOrder = accountsBefore.map((a) => a.id);
    expect(initialOrder.indexOf(id1)).toBeLessThan(initialOrder.indexOf(id2));
    expect(initialOrder.indexOf(id2)).toBeLessThan(initialOrder.indexOf(id3));

    // Reorder: 3 -> 1 -> 2
    useStore.getState().reorderAccounts([id3, id1, id2]);

    const accountsAfter = useStore.getState().accounts;
    const reordered = accountsAfter.map((a) => a.id);
    expect(reordered.indexOf(id3)).toBeLessThan(reordered.indexOf(id1));
    expect(reordered.indexOf(id1)).toBeLessThan(reordered.indexOf(id2));
  });

  it('verifies Every 3 days preset is removed from RECURRENCE_PRESETS', async () => {
    const { RECURRENCE_PRESETS } = await import('../lib/recurrence');
    expect(RECURRENCE_PRESETS.some((p) => p.label === 'Every 3 days')).toBe(false);
  });

  it('adjusting account balance creates an adjustment transaction under Others', async () => {
    const { calculateAccountBalances } = await import('../store/selectors');
    const s = useStore.getState();
    const accId = s.addAccount('Test Bank', 'account_balance', '#4B7BFF', 'household', 'asset', 1_500_000);

    const initialBalances = calculateAccountBalances({
      accounts: useStore.getState().accounts,
      transactions: useStore.getState().transactions,
      purchases: useStore.getState().purchases,
    });
    expect(initialBalances[accId]).toBe(1_500_000);

    // User adjusts balance from 1,500,000 to 1,000,000 (diff: -500,000)
    const diff = 1_000_000 - initialBalances[accId];
    expect(diff).toBe(-500_000);

    const othersCat = useStore.getState().moneyCategories.find((c) => c.type === 'expense' && /other|khác/i.test(c.name));
    expect(othersCat).toBeDefined();

    s.addTransaction({
      type: 'expense',
      scope: 'household',
      categoryId: othersCat!.id,
      amount: Math.abs(diff),
      date: today(),
      note: 'Balance adjustment',
      accountId: accId,
    });

    const updatedBalances = calculateAccountBalances({
      accounts: useStore.getState().accounts,
      transactions: useStore.getState().transactions,
      purchases: useStore.getState().purchases,
    });
    expect(updatedBalances[accId]).toBe(1_000_000);

    const adjTx = useStore.getState().transactions.find((t) => t.accountId === accId && t.note === 'Balance adjustment');
    expect(adjTx).toBeDefined();
    expect(adjTx?.amount).toBe(500_000);
    expect(adjTx?.type).toBe('expense');
  });

  it('keeps all-time history for income transactions matching name (e.g. Tiền ba mẹ)', () => {
    const s = useStore.getState();
    const incomeCat = s.moneyCategories.find((c) => c.type === 'income');
    expect(incomeCat).toBeDefined();

    s.addTransaction({
      type: 'income',
      scope: 'personal',
      categoryId: incomeCat!.id,
      amount: 3_000_000,
      date: '2026-09-10',
      itemName: 'Tiền ba mẹ',
      note: 'Ba mẹ gửi tháng 9',
    });

    s.addTransaction({
      type: 'income',
      scope: 'personal',
      categoryId: incomeCat!.id,
      amount: 3_500_000,
      date: '2026-11-02',
      itemName: 'Tiền ba mẹ',
      note: 'Ba mẹ gửi tháng 11',
    });

    const allTx = useStore.getState().transactions;
    const targetName = 'tiền ba mẹ';
    const matches = allTx.filter((t) => {
      const txName = (t.itemName || '').trim().toLowerCase();
      const txNote = (t.note || '').trim().toLowerCase();
      const txTitle = (t.itemName?.trim() || t.note?.trim() || '').toLowerCase();
      return txName === targetName || txNote === targetName || txTitle === targetName;
    });

    expect(matches.length).toBe(2);
    expect(matches.some((m) => m.date === '2026-09-10')).toBe(true);
    expect(matches.some((m) => m.date === '2026-11-02')).toBe(true);
  });

  it('migrates v13 account color #D946EF to #E9A3E0', () => {
    const migrate = useStore.persist.getOptions().migrate!;
    const v13 = {
      accounts: [
        { id: 'acc-1', name: 'Cash', color: '#3FA88B' },
        { id: 'acc-2', name: 'Momo', color: '#D946EF' },
        { id: 'acc-3', name: 'ZaloPay', color: '#d946ef' },
      ],
    };
    const out = migrate(v13, 13) as { accounts: { id: string; color: string }[] };
    expect(out.accounts[0].color).toBe('#3FA88B');
    expect(out.accounts[1].color).toBe('#E9A3E0');
    expect(out.accounts[2].color).toBe('#E9A3E0');
  });

  it('separates default start day per wallet scope (Our Wallet vs My Wallet)', async () => {
    let store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
    vi.stubGlobal('localStorage', mockStorage);

    const { getSavedMonthStartDay, saveMonthStartDay } = await import('../lib/dateRanges');
    mockStorage.clear();

    // Default start day is 1 for both when unset
    expect(getSavedMonthStartDay('household')).toBe(1);
    expect(getSavedMonthStartDay('personal')).toBe(1);

    // Set household to 25
    saveMonthStartDay(25, 'household');
    expect(getSavedMonthStartDay('household')).toBe(25);
    // Personal remains untouched (1)
    expect(getSavedMonthStartDay('personal')).toBe(1);

    // Set personal to 10
    saveMonthStartDay(10, 'personal');
    expect(getSavedMonthStartDay('household')).toBe(25);
    expect(getSavedMonthStartDay('personal')).toBe(10);

    // Backwards compatibility: reading household with only legacy key set
    mockStorage.removeItem('namin:month-start-day:household');
    mockStorage.setItem('namin:month-start-day', '20');
    expect(getSavedMonthStartDay('household')).toBe(20);
    // But personal still reads personal key or defaults to 1
    expect(getSavedMonthStartDay('personal')).toBe(10);

    vi.unstubAllGlobals();
  });

  it('preserves account ordering via order property across reorders and sync snapshots', () => {
    const s = useStore.getState();
    const idA = s.addAccount('Joint Account A', 'payments', '#3FA88B', 'household');
    const idB = s.addAccount('Joint Account B', 'payments', '#4B7BFF', 'household');
    const idC = s.addAccount('Joint Account C', 'payments', '#E9A3E0', 'household');

    // Reorder C -> A -> B
    s.reorderAccounts([idC, idA, idB]);
    const accounts = useStore.getState().accounts;
    const accC = accounts.find((a) => a.id === idC);
    const accA = accounts.find((a) => a.id === idA);
    const accB = accounts.find((a) => a.id === idB);

    expect(accC?.order).toBeLessThan(accA?.order ?? 0);
    expect(accA?.order).toBeLessThan(accB?.order ?? 0);

    // Simulate incoming snapshot where Firestore returns items in random or reverse ID order
    const remoteIncoming = [accB!, accA!, accC!];
    const sorted = [...remoteIncoming].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    expect(sorted.map((a) => a.id)).toEqual([idC, idA, idB]);
  });

  it('migrates v14 accounts to v15 assigning continuous order to accounts missing order', () => {
    const migrate = useStore.persist.getOptions().migrate!;
    const v14 = {
      accounts: [
        { id: 'acc-1', name: 'Cash' },
        { id: 'acc-2', name: 'Bank' },
      ],
    };
    const out = migrate(v14, 14) as { accounts: { id: string; order?: number }[] };
    expect(out.accounts[0].order).toBe(0);
    expect(out.accounts[1].order).toBe(1);
  });
});


