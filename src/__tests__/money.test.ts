import { beforeEach, describe, expect, it } from 'vitest';
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
    const id3 = s.addAccount('Wallet 3', 'payments', '#D946EF', 'personal');

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
});

