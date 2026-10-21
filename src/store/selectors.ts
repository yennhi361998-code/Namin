import { useMemo } from 'react';
import { monthKey, toDateStr, today } from '../lib/dates';
import { projectOccurrences } from '../lib/calendar';
import { estimateRestock, LOW_THRESHOLD_DAYS, type RestockEstimate } from '../lib/restock';
import { DAILY_CATEGORY_ID, OTHER_COLOR } from '../lib/moneyCategories';
import type { Account, DateStr, Member, MoneyCategory, Purchase, Task, Transaction, TxType } from '../lib/types';
import { useStore } from './index';
import type { Data } from './types';

export function useMembers() {
  const members = useStore((s) => s.members);
  return useMemo(() => new Map<string, Member>(members.map((m) => [m.id, m])), [members]);
}

export function useAccounts() {
  const accounts = useStore((s) => s.accounts);
  return useMemo(() => new Map<string, Account>((accounts ?? []).map((a) => [a.id, a])), [accounts]);
}

export function useCurrentMember() {
  return useStore((s) => s.members.find((m) => m.id === s.currentMemberId) ?? s.members[0]);
}

const byDue = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate) || (a.reminder ?? '99').localeCompare(b.reminder ?? '99');

export function taskLists(tasks: Task[], t: DateStr = today()) {
  const open = tasks.filter((x) => !x.completed);
  return {
    /**
     * Due today, plus anything completed today so progress stays visible.
     * Overdue uncompleted tasks remain on their original due date and are not automatically moved to today.
     * One stable order regardless of completion, so rows never jump under the user's thumb.
     */
    today: tasks
      .filter((x) => (x.dueDate === t && !x.completed) || (x.completed && x.completedAt && toDateStr(new Date(x.completedAt)) === t))
      .sort((a, b) => byDue(a, b) || a.createdAt.localeCompare(b.createdAt)),
    overdue: open.filter((x) => x.dueDate < t),
    upcoming: open.filter((x) => x.dueDate > t).sort(byDue),
    recurring: open.filter((x) => x.recurrence).sort(byDue),
    completed: tasks
      .filter((x) => x.completed)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    openCount: open.length,
  };
}

export function useTaskLists() {
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => taskLists(tasks), [tasks]);
}

/** Restock estimate for every item that has enough history. */
export function useRestockMap() {
  const items = useStore((s) => s.items);
  const purchases = useStore((s) => s.purchases);
  const transactions = useStore((s) => s.transactions);
  return useMemo(() => {
    const byItem = new Map<string, Array<Pick<Purchase, 'purchaseDate'>>>();
    for (const p of purchases) {
      if (p.itemId) {
        byItem.set(p.itemId, [...(byItem.get(p.itemId) ?? []), { purchaseDate: p.purchaseDate }]);
      }
    }
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue;
      let targetItemId = tx.itemId;
      if (!targetItemId && tx.note) {
        const found = items.find((i) => i.name.trim().toLowerCase() === tx.note.trim().toLowerCase());
        if (found) targetItemId = found.id;
      }
      if (targetItemId) {
        byItem.set(targetItemId, [...(byItem.get(targetItemId) ?? []), { purchaseDate: tx.date }]);
      }
    }
    const t = today();
    const map = new Map<string, RestockEstimate>();
    for (const it of items) {
      const est = estimateRestock(it, byItem.get(it.id) ?? [], t);
      if (est) map.set(it.id, est);
    }
    return map;
  }, [items, purchases, transactions]);
}

/** Items due for restock within the low threshold that aren't already on the list, soonest first. */
export function useRestockSuggestions() {
  const restock = useRestockMap();
  const items = useStore((s) => s.items);
  const shopping = useStore((s) => s.shopping);
  return useMemo(() => {
    const onList = new Set(shopping.filter((x) => !x.completed).map((x) => x.itemId));
    return items
      .filter((i) => !onList.has(i.id))
      .map((i) => ({ item: i, est: restock.get(i.id) }))
      .filter((x): x is { item: typeof x.item; est: RestockEstimate } => !!x.est && x.est.daysLeft <= LOW_THRESHOLD_DAYS)
      .sort((a, b) => a.est.daysLeft - b.est.daysLeft);
  }, [items, shopping, restock]);
}

export interface MoneyEntry {
  /** A manual transaction, or a Shopping purchase counted as an expense. */
  kind: 'transaction' | 'purchase';
  id: string;
  categoryId?: string | null;
  amount: number;
  date: DateStr;
  title: string;
  note: string;
  memberId?: string | null;
  accountId?: string | null;
  /** Destination account when type === 'transfer'. */
  toAccountId?: string | null;
  /** For purchases: the household item, to open its detail. */
  itemId?: string;
}

export interface MoneyRow {
  category: MoneyCategory;
  total: number;
  count: number;
  /** Share of the month's total, 0–1. */
  share: number;
}

export interface MoneyMonth {
  key: string;
  type: TxType;
  total: number;
  count: number;
  /** Largest first. */
  rows: MoneyRow[];
  entries: MoneyEntry[];
}

export function moneyEntries(data: Pick<Data, 'transactions' | 'purchases' | 'moneyCategories'>, type: TxType): MoneyEntry[] {
  const out: MoneyEntry[] = data.transactions
    .filter((t) => t.type === type)
    .map((t) => {
      const cat = t.categoryId ? data.moneyCategories.find((c) => c.id === t.categoryId) : undefined;
      return {
        kind: 'transaction',
        id: t.id,
        categoryId: t.categoryId ?? null,
        amount: t.amount,
        date: t.date,
        title: t.note || (type === 'transfer' ? 'Transfer' : (cat?.name || 'Entry')),
        note: t.note,
        memberId: t.memberId,
        accountId: t.accountId,
        toAccountId: t.toAccountId,
      };
    });
  if (type === 'expense')
    for (const p of data.purchases)
      if (p.price != null)
        out.push({
          kind: 'purchase',
          id: p.id,
          categoryId: p.spendCategoryId || DAILY_CATEGORY_ID,
          amount: p.price,
          date: p.purchaseDate,
          title: p.itemName,
          note: p.store,
          itemId: p.itemId,
          memberId: p.memberId,
          accountId: p.accountId,
        });
  return out;
}

export function moneyForMonth(data: Pick<Data, 'transactions' | 'purchases' | 'moneyCategories'>, type: TxType, key: string): MoneyMonth {
  const entries = moneyEntries(data, type)
    .filter((e) => monthKey(e.date) === key)
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = entries.reduce((n, e) => n + e.amount, 0);
  const byCat = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const catId = e.categoryId ?? 'unassigned';
    const r = byCat.get(catId) ?? { total: 0, count: 0 };
    byCat.set(catId, { total: r.total + e.amount, count: r.count + 1 });
  }
  const rows: MoneyRow[] = [];
  for (const [id, r] of byCat) {
    // Entries pointing at a deleted category still count, under a placeholder.
    const category =
      data.moneyCategories.find((c) => c.id === id) ??
      ({ id, householdId: '', type, name: 'Other', icon: 'package', color: OTHER_COLOR, archived: true, order: 999 } satisfies MoneyCategory);
    rows.push({ category, total: r.total, count: r.count, share: total ? r.total / total : 0 });
  }
  rows.sort((a, b) => b.total - a.total);
  return { key, type, total, count: entries.length, rows, entries };
}

export function useMoneyMonth(type: TxType, key: string) {
  const transactions = useStore((s) => s.transactions);
  const purchases = useStore((s) => s.purchases);
  const moneyCategories = useStore((s) => s.moneyCategories);
  return useMemo(() => moneyForMonth({ transactions, purchases, moneyCategories }, type, key), [transactions, purchases, moneyCategories, type, key]);
}

/**
 * Active categories of a type, most used first ("Recommended"), then in their saved order.
 * Plain frequency counting, nothing more.
 */
export function useCategoryChoices(type: TxType) {
  const transactions = useStore((s) => s.transactions);
  const purchases = useStore((s) => s.purchases);
  const moneyCategories = useStore((s) => s.moneyCategories);
  return useMemo(() => {
    const uses = new Map<string, number>();
    for (const e of moneyEntries({ transactions, purchases, moneyCategories }, type)) {
      if (e.categoryId) uses.set(e.categoryId, (uses.get(e.categoryId) ?? 0) + 1);
    }
    return moneyCategories
      .filter((c) => c.type === type && !c.archived)
      .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.order - b.order);
  }, [transactions, purchases, moneyCategories, type]);
}

export interface DayEntry {
  /** For projected entries, a display copy of the current occurrence moved to `date`. */
  task: Task;
  /** Not stored yet: a future repeat computed from the current occurrence. */
  projected: boolean;
  /** The stored occurrence a projected entry comes from (what gets opened/edited). */
  anchorId: string;
  overdue: boolean;
}

/**
 * Tasks per calendar day in [from, to].
 * - Open tasks sit on their due date (overdue tasks remain on their original due date, not rolled over).
 * - Completed tasks sit on the later of due date and completion date: done-late shows on the day
 *   it was done, ticked-ahead shows on the day it was for.
 * - Future repeats of each open recurring task are projected, skipping dates already stored.
 */
export function tasksByDay(tasks: Task[], from: DateStr, to: DateStr, t: DateStr = today()) {
  const map = new Map<DateStr, DayEntry[]>();
  const push = (date: DateStr, e: DayEntry) => {
    if (date < from || date > to) return;
    map.set(date, [...(map.get(date) ?? []), e]);
  };
  const taken = new Map<string, Set<DateStr>>();
  for (const x of tasks) taken.set(x.seriesId, (taken.get(x.seriesId) ?? new Set()).add(x.dueDate));

  for (const x of tasks) {
    if (x.completed) {
      const doneOn = x.completedAt ? toDateStr(new Date(x.completedAt)) : x.dueDate;
      push(doneOn > x.dueDate ? doneOn : x.dueDate, { task: x, projected: false, anchorId: x.id, overdue: false });
      continue;
    }
    const overdue = x.dueDate < t;
    push(x.dueDate, { task: x, projected: false, anchorId: x.id, overdue });
    for (const date of projectOccurrences(x, from, to, t, taken.get(x.seriesId))) {
      push(date, { task: { ...x, id: `${x.id}@${date}`, dueDate: date }, projected: true, anchorId: x.id, overdue: false });
    }
  }
  for (const list of map.values())
    list.sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.task.reminder ?? '99').localeCompare(b.task.reminder ?? '99') ||
        a.task.createdAt.localeCompare(b.task.createdAt) ||
        a.task.title.localeCompare(b.task.title),
    );
  return map;
}

export function useTasksByDay(from: DateStr, to: DateStr) {
  const tasks = useStore((s) => s.tasks);
  return useMemo(() => tasksByDay(tasks, from, to), [tasks, from, to]);
}

/**
 * Calculates current balance for every account based on:
 * - Income transactions (+amount to accountId)
 * - Expense transactions (-amount from accountId)
 * - Purchases (-price from accountId)
 * - Transfers (-amount from accountId, +amount to toAccountId)
 */
export function calculateAccountBalances(data: {
  accounts?: Account[];
  transactions: Array<Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>>;
  purchases: Array<Pick<Purchase, 'price' | 'accountId'>>;
}): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const acc of data.accounts ?? []) {
    balances[acc.id] = (acc as any).initialBalance ?? 0;
  }
  for (const t of data.transactions) {
    if (t.type === 'income' && t.accountId) {
      balances[t.accountId] = (balances[t.accountId] ?? 0) + t.amount;
    } else if (t.type === 'expense' && t.accountId) {
      balances[t.accountId] = (balances[t.accountId] ?? 0) - t.amount;
    } else if (t.type === 'transfer') {
      if (t.accountId) balances[t.accountId] = (balances[t.accountId] ?? 0) - t.amount;
      if (t.toAccountId) balances[t.toAccountId] = (balances[t.toAccountId] ?? 0) + t.amount;
    }
  }
  for (const p of data.purchases) {
    if (p.price != null && p.accountId) {
      balances[p.accountId] = (balances[p.accountId] ?? 0) - p.price;
    }
  }
  return balances;
}

export function useAccountBalances(): Record<string, number> {
  const accounts = useStore((s) => s.accounts ?? []);
  const transactions = useStore((s) => s.transactions);
  const purchases = useStore((s) => s.purchases);
  return useMemo(
    () => calculateAccountBalances({ accounts, transactions, purchases }),
    [accounts, transactions, purchases]
  );
}

