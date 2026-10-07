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
});
