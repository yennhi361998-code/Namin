import { addDays, parseDate, today } from '../lib/dates';
import { uid } from '../lib/id';
import type { Account, Category, Household, HouseholdItem, Member, Purchase, Recurrence, ShoppingItem, Task, TaskChecklistItem } from '../lib/types';
import { defaultMoneyCategories, demoTransactions } from '../lib/moneyCategories';
import type { Data } from './types';

export function defaultAccounts(householdId: string): Account[] {
  const now = new Date().toISOString();
  return [
    { id: 'acc-cash', householdId, name: 'Tiền mặt', icon: 'wallet', color: '#3FA88B', createdAt: now },
    { id: 'acc-bank', householdId, name: 'Tài khoản ngân hàng', icon: 'credit_card', color: '#4B7BFF', createdAt: now },
    { id: 'acc-momo', householdId, name: 'Ví điện tử', icon: 'account_balance_wallet', color: '#D946EF', createdAt: now },
  ];
}

/** Demo data dated relative to first launch so the app always feels current. */
export function createSeed(): Data {
  const t = today();
  const now = new Date().toISOString();
  const d = (n: number) => addDays(t, n);
  const dow = parseDate(t).getDay();
  const nextSaturday = (6 - dow + 7) % 7 || 7;

  const household: Household = { id: uid(), name: 'Apartment 402', createdAt: now };
  const hid = household.id;
  const minh: Member = { id: uid(), householdId: hid, name: 'Minh', color: '#8CC9E8', createdAt: now };
  const lan: Member = { id: uid(), householdId: hid, name: 'Lan', color: '#A9D8C8', createdAt: now };
  const accounts = defaultAccounts(hid);

  const tasks: Task[] = [];
  const checklist: TaskChecklistItem[] = [];
  const task = (
    title: string,
    assignee: Member,
    due: number,
    recurrence: Recurrence | null,
    extra: Partial<Task> = {},
    items: string[] = [],
  ) => {
    const id = uid();
    const tk: Task = {
      id,
      householdId: hid,
      title,
      assigneeId: assignee.id,
      dueDate: d(due),
      recurrence,
      estimatedDuration: null,
      reminder: null,
      area: null,
      notes: '',
      completed: false,
      completedAt: null,
      nextOccurrenceId: null,
      seriesId: id,
      createdAt: now,
      ...extra,
    };
    tasks.push(tk);
    items.forEach((title) => checklist.push({ id: uid(), taskId: tk.id, title, completed: false }));
    return tk;
  };

  task('Take out trash', minh, 0, { unit: 'day', interval: 1 }, { area: 'Kitchen', reminder: '20:00', estimatedDuration: 5 });
  task(
    'Clean bathroom',
    lan,
    0,
    { unit: 'week', interval: 1 },
    { area: 'Bathroom', estimatedDuration: 45, notes: 'Use the blue cleaner for the shower glass.' },
    ['Clean sink', 'Clean toilet', 'Mop floor', 'Replace towels'],
  );
  task('Wipe kitchen counters', lan, -1, { unit: 'day', interval: 2 }, { area: 'Kitchen', estimatedDuration: 10 });
  task('Vacuum living room', minh, 0, { unit: 'day', interval: 3 }, { area: 'Living', estimatedDuration: 20 });
  const plantsNext = task('Water indoor plants', minh, 3, { unit: 'day', interval: 3 }, { area: 'Living', estimatedDuration: 10 });
  const doneToday = new Date();
  doneToday.setHours(Math.min(doneToday.getHours(), 8), 15, 0, 0);
  task('Water indoor plants', minh, 0, { unit: 'day', interval: 3 }, {
    area: 'Living',
    estimatedDuration: 10,
    completed: true,
    completedAt: doneToday.toISOString(),
    nextOccurrenceId: plantsNext.id,
    seriesId: plantsNext.seriesId,
  });
  task('Wash bedsheets', minh, 1, { unit: 'week', interval: 2 }, { area: 'Bedroom', estimatedDuration: 30 });
  task('Clean refrigerator', lan, nextSaturday, { unit: 'month', interval: 1 }, { area: 'Kitchen', estimatedDuration: 40 }, [
    'Throw out expired food',
    'Wipe shelves',
    'Clean door seals',
  ]);
  task('Mop kitchen floors', lan, 3, { unit: 'week', interval: 1 }, { area: 'Kitchen', estimatedDuration: 15 });
  task('Replace AC filter', minh, 12, { unit: 'month', interval: 3 }, { area: 'Living', estimatedDuration: 15 });

  const items: HouseholdItem[] = [];
  const purchases: Purchase[] = [];
  const item = (
    name: string,
    category: Category,
    quantity: number,
    unit: string,
    history: [daysAgo: number, price: number, store: string][],
  ) => {
    const it: HouseholdItem = {
      id: uid(),
      householdId: hid,
      name,
      category,
      quantity,
      unit,
      currentStock: null,
      status: 'unknown',
      expectedUsageDays: null,
      notes: '',
    };
    items.push(it);
    history.forEach(([ago, price, store], idx) =>
      purchases.push({
        id: uid(),
        householdId: hid,
        itemId: it.id,
        itemName: name,
        category,
        quantity,
        unit,
        price,
        store,
        purchaseDate: d(-ago),
        notes: '',
        accountId: ['acc-cash', 'acc-bank', 'acc-momo'][idx % 3],
        memberId: [minh.id, lan.id][idx % 2],
      }),
    );
    return it;
  };

  const detergent = item('Detergent', 'Cleaning', 1, 'bottle', [[123, 179000, 'WinMart'], [80, 195000, 'WinMart'], [37, 189000, 'WinMart']]);
  const dishSoap = item('Dish soap', 'Cleaning', 2, 'bottles', [[50, 45000, 'WinMart'], [24, 46000, 'WinMart']]);
  const toiletPaper = item('Toilet paper', 'Bathroom', 2, 'packs', [[82, 85000, 'Guardian'], [52, 89000, 'Guardian'], [22, 89000, 'WinMart']]);
  const trashBags = item('Trash bags (50L)', 'Kitchen', 1, 'roll', [[20, 42000, 'WinMart']]);
  item('Hand soap', 'Bathroom', 1, 'bottle', [[58, 39000, 'Guardian'], [29, 39000, 'Guardian']]);
  item('Eggs', 'Groceries', 10, 'eggs', [[25, 35000, 'Bách Hóa Xanh'], [18, 35000, 'Bách Hóa Xanh'], [11, 36000, 'Bách Hóa Xanh'], [4, 35000, 'Bách Hóa Xanh']]);
  item('Sponges', 'Kitchen', 1, 'pack', [[45, 25000, 'WinMart'], [13, 25000, 'WinMart']]);
  item('Rice (5kg)', 'Groceries', 1, 'bag', [[40, 165000, 'Bách Hóa Xanh'], [10, 170000, 'Bách Hóa Xanh']]);
  item('Shampoo', 'Bathroom', 1, 'bottle', [[41, 159000, 'Guardian'], [6, 159000, 'Guardian']]);
  item('Fabric softener', 'Cleaning', 1, 'bottle', [[15, 145000, 'WinMart']]);
  item('Mop refill', 'Cleaning', 1, 'pad', [[8, 155000, 'WinMart']]);
  item('Cooking oil', 'Groceries', 1, 'bottle', [[3, 68000, 'WinMart']]);
  item('Light bulbs', 'Maintenance', 2, 'bulbs', [[16, 120000, 'Điện Máy Xanh']]);
  item('Water filter cartridge', 'Maintenance', 1, 'cartridge', [[35, 450000, 'Điện Máy Xanh']]);

  const shopping: ShoppingItem[] = [
    [detergent, 189000, 'WinMart', 'Refill pouch preferred'],
    [dishSoap, 45000, 'WinMart', ''],
    [toiletPaper, 89000, 'Guardian', ''],
    [trashBags, 42000, 'WinMart', ''],
  ].map(([it, price, store, note]) => {
    const h = it as HouseholdItem;
    return {
      id: uid(),
      householdId: hid,
      itemId: h.id,
      name: h.name,
      category: h.category,
      quantity: h.quantity,
      unit: h.unit,
      estimatedPrice: price as number,
      store: store as string,
      note: note as string,
      completed: false,
      createdAt: now,
    };
  });

  return {
    household,
    members: [minh, lan],
    currentMemberId: minh.id,
    tasks,
    checklist,
    shopping,
    items,
    purchases,
    moneyCategories: defaultMoneyCategories(hid),
    transactions: demoTransactions(hid, [minh.id, lan.id], t),
    accounts,
  };
}
