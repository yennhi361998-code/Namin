import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { guessCategory } from '../lib/categories';
import { today } from '../lib/dates';
import { uid } from '../lib/id';
import { nextOccurrence } from '../lib/recurrence';
import { computeItemStatus, estimateRestock } from '../lib/restock';
import { defaultMoneyCategories, demoPersonalTransactions, demoTransactions, EMOJI_TO_ICON } from '../lib/moneyCategories';
import type { Account, AccountNature, Category, DateStr, FinanceScope, HouseholdItem, LedgerEntry, Member, MoneyCategory, Purchase, Recurrence, ShoppingItem, Task, TaskChecklistItem, Transaction, TxType } from '../lib/types';
import { createSeed, defaultAccounts } from './seed';
import type { Data } from './types';
import { toast } from './ui';

export interface TaskInput {
  title: string;
  assigneeId: string | null;
  dueDate: DateStr;
  recurrence: Recurrence | null;
  estimatedDuration: number | null;
  reminder: string | null;
  area: string | null;
  notes: string;
  checklist: { id?: string; title: string; completed?: boolean }[];
  mappedItemId?: string | null;
  mappedQuantity?: number | null;
}


export interface ShoppingInput {
  name: string;
  itemId?: string;
  quantity?: number;
  unit?: string;
  category?: Category | null;
  estimatedPrice?: number | null;
  store?: string;
  note?: string;
}

export interface PurchaseInput {
  shoppingItemId?: string;
  itemId?: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  usageUnit?: string;
  usagePerPurchaseUnit?: number | null;
  price: number | null;
  store: string;
  purchaseDate: DateStr;
  notes?: string;
  /** Spending category in Charts; remembered on the item for next time. */
  spendCategoryId?: string | null;
  accountId?: string | null;
  memberId?: string | null;
  scope?: FinanceScope;
}

export interface TransactionInput {
  type: TxType;
  scope?: FinanceScope;
  categoryId?: string | null;
  amount: number;
  date: DateStr;
  note?: string;
  itemName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  usageUnit?: string | null;
  usagePerPurchaseUnit?: number | null;
  itemId?: string | null;
  memberId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  shoppingItemId?: string;
}

export interface ItemInput {
  name: string;
  category?: Category;
  room?: string | null;
  unit?: string;
  usageUnit?: string;
  usagePerPurchaseUnit?: number | null;
  currentStock?: number | null;
  expectedUsageDays?: number | null;
  notes?: string;
  spendCategoryId?: string | null;
}

export interface MoneyCategoryInput {
  type: TxType;
  name: string;
  icon: string;
  color: string;
}

type Undo = () => void;

interface Actions {
  addTask: (input: TaskInput) => string;
  updateTask: (id: string, input: TaskInput) => void;
  completeTask: (id: string) => void;
  /** Tick a future, not-yet-stored occurrence of a recurring task (from the calendar). */
  completeOccurrence: (anchorId: string, date: DateStr) => Undo;
  uncompleteTask: (id: string) => void;
  postponeTask: (id: string, dueDate: DateStr) => void;
  deleteTask: (id: string) => Undo;
  toggleChecklistItem: (id: string) => void;

  addToShopping: (input: ShoppingInput) => { ok: true; id: string } | { ok: false; reason: 'duplicate' | 'empty' };
  updateShoppingItem: (id: string, patch: Partial<ShoppingItem>) => void;
  removeShoppingItem: (id: string) => Undo;
  recordPurchase: (input: PurchaseInput) => Undo;
  deletePurchase: (id: string) => Undo;
  updatePurchase: (id: string, patch: Partial<Purchase>) => void;
  addItem: (input: ItemInput) => string;
  addItemFromExpense: (entry: LedgerEntry) => string;
  updateItem: (id: string, patch: Partial<HouseholdItem>) => void;
  deleteItem: (id: string) => Undo;
  useItem: (id: string, amount?: number) => Undo;

  addTransaction: (input: TransactionInput) => string;
  updateTransaction: (id: string, input: TransactionInput) => void;
  deleteTransaction: (id: string) => Undo;
  addMoneyCategory: (input: MoneyCategoryInput) => string;
  updateMoneyCategory: (id: string, patch: Partial<MoneyCategoryInput>) => void;
  /** Hides it from pickers; past entries keep showing under it. */
  archiveMoneyCategory: (id: string) => Undo;

  addAccount: (name: string, icon?: string, color?: string, scope?: FinanceScope, nature?: AccountNature, initialBalance?: number | null, excludeFromTotal?: boolean, archived?: boolean) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  reorderAccounts: (orderedIds: string[]) => void;
  setBudget: (scope: FinanceScope, amount: number | null) => void;

  renameHousehold: (name: string) => void;
  addMember: (name: string, avatar?: string | null) => void;
  renameMember: (id: string, name: string) => void;
  setMemberAvatar: (id: string, avatar: string | null) => void;
  setCurrentMember: (id: string) => void;
  resetDemo: () => void;
}

export type State = Data & Actions;

const MEMBER_COLORS = ['#8CC9E8', '#A9D8C8', '#B8C7E6', '#F2D6A7', '#D7C4E8', '#CBD5DA'];
function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const sameName = (a: string, b: string) => {
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  if (normA === normB) return true;
  return stripDiacritics(normA) === stripDiacritics(normB);
};

function refreshStatus(
  items: HouseholdItem[],
  purchases: Data['purchases'],
  itemId: string,
  transactions?: Data['transactions'],
): HouseholdItem[] {
  const purHistory = purchases
    .filter((p) => p.itemId === itemId)
    .map((p) => ({
      purchaseDate: p.purchaseDate,
      quantity: p.quantity,
      unit: p.unit,
    }));
  const txHistory = (transactions ?? [])
    .filter((t) => t.type === 'expense' && t.itemId === itemId)
    .map((t) => ({
      purchaseDate: t.date,
      quantity: t.quantity,
      unit: t.unit,
      usagePerPurchaseUnit: t.usagePerPurchaseUnit,
    }));
  const history = [...purHistory, ...txHistory];
  return items.map((it) =>
    it.id === itemId ? { ...it, status: computeItemStatus(it, estimateRestock(it, history)) } : it,
  );
}

/** Due dates already stored for a task's series (other occurrences only). */
function seriesDates(tasks: Task[], task: Task): Set<DateStr> {
  return new Set(tasks.filter((t) => t.seriesId === task.seriesId && t.id !== task.id).map((t) => t.dueDate));
}

function buildChecklist(taskId: string, list: TaskInput['checklist']): TaskChecklistItem[] {
  return list
    .filter((c) => c.title.trim())
    .map((c) => ({ id: c.id ?? uid(), taskId, title: c.title.trim(), completed: c.completed ?? false }));
}

// Surfacing a failed save beats silently losing data; throttled so a full disk doesn't spam toasts.
let lastPersistWarning = 0;
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      if (Date.now() - lastPersistWarning > 10_000) {
        lastPersistWarning = Date.now();
        toast({ title: "Couldn't save on this device", subtitle: 'Your latest changes may be lost if you close the app.', tone: 'error' });
      }
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...createSeed(),

      addTask: (input) => {
        const id = uid();
        const { checklist, ...rest } = input;
        const task: Task = {
          ...rest,
          id,
          householdId: get().household.id,
          title: input.title.trim(),
          notes: input.notes.trim(),
          mappedItemId: input.mappedItemId ?? null,
          mappedQuantity: input.mappedQuantity ?? null,
          completed: false,
          completedAt: null,
          nextOccurrenceId: null,
          seriesId: id,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ tasks: [...s.tasks, task], checklist: [...s.checklist, ...buildChecklist(id, checklist)] }));
        return id;
      },

      updateTask: (id, input) => {
        const { checklist, ...rest } = input;
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...rest,
                  title: input.title.trim(),
                  notes: input.notes.trim(),
                  mappedItemId: input.mappedItemId ?? null,
                  mappedQuantity: input.mappedQuantity ?? null,
                }
              : t,
          ),
          checklist: [...s.checklist.filter((c) => c.taskId !== id), ...buildChecklist(id, checklist)],
        }));
      },

      completeTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        if (!task || task.completed) return;
        let updatedItems = s.items;
        if (task.mappedItemId && task.mappedQuantity && task.mappedQuantity > 0) {
          const it = s.items.find((i) => i.id === task.mappedItemId);
          if (it) {
            const ratio = it.usagePerPurchaseUnit && it.usagePerPurchaseUnit > 0 ? it.usagePerPurchaseUnit : 1;
            const current = it.currentStock != null ? it.currentStock : (it.quantity ?? 1) * ratio;
            const nextStock = Math.max(0, current - task.mappedQuantity);
            updatedItems = s.items.map((i) => (i.id === it.id ? { ...i, currentStock: nextStock } : i));
          }
        }
        const done: Task = {
          ...task,
          completed: true,
          completedAt: new Date().toISOString(),
          completedBy: s.currentMemberId,
        };
        if (!task.recurrence) {
          set({ tasks: s.tasks.map((t) => (t.id === id ? done : t)), items: updatedItems });
          return;
        }
        // Recurring: spawn the next occurrence with the same configuration and a fresh checklist.
        const next: Task = {
          ...task,
          id: uid(),
          dueDate: nextOccurrence(task.dueDate, task.recurrence, today(), seriesDates(s.tasks, task)),
          completed: false,
          completedAt: null,
          completedBy: null,
          nextOccurrenceId: null,
          createdAt: new Date().toISOString(),
        };
        done.nextOccurrenceId = next.id;
        const nextChecklist = s.checklist
          .filter((c) => c.taskId === id)
          .map((c) => ({ ...c, id: uid(), taskId: next.id, completed: false }));
        set({
          tasks: [...s.tasks.map((t) => (t.id === id ? done : t)), next],
          checklist: [...s.checklist, ...nextChecklist],
          items: updatedItems,
        });
      },

      completeOccurrence: (anchorId, date) => {
        const s = get();
        const anchor = s.tasks.find((t) => t.id === anchorId);
        if (!anchor || seriesDates(s.tasks, anchor).has(date)) return () => {};
        let updatedItems = s.items;
        const mappedItemId = anchor.mappedItemId;
        const mappedQty = anchor.mappedQuantity;
        if (mappedItemId && mappedQty && mappedQty > 0) {
          const it = s.items.find((i) => i.id === mappedItemId);
          if (it) {
            const ratio = it.usagePerPurchaseUnit && it.usagePerPurchaseUnit > 0 ? it.usagePerPurchaseUnit : 1;
            const current = it.currentStock != null ? it.currentStock : (it.quantity ?? 1) * ratio;
            const nextStock = Math.max(0, current - mappedQty);
            updatedItems = s.items.map((i) => (i.id === it.id ? { ...i, currentStock: nextStock } : i));
          }
        }
        // A completed record on that date; the series skips it when it gets there.
        const record: Task = {
          ...anchor,
          id: uid(),
          dueDate: date,
          completed: true,
          completedAt: new Date().toISOString(),
          completedBy: s.currentMemberId,
          nextOccurrenceId: null,
          // Same as the series so the row keeps its place in the day list when ticked.
          createdAt: anchor.createdAt,
        };
        const items = s.checklist
          .filter((c) => c.taskId === anchorId)
          .map((c) => ({ ...c, id: uid(), taskId: record.id, completed: true }));
        set({ tasks: [...s.tasks, record], checklist: [...s.checklist, ...items], items: updatedItems });
        return () =>
          set((st) => {
            let restoredItems = st.items;
            if (mappedItemId && mappedQty && mappedQty > 0) {
              const it = st.items.find((i) => i.id === mappedItemId);
              if (it && it.currentStock != null) {
                restoredItems = st.items.map((i) => (i.id === it.id ? { ...i, currentStock: (i.currentStock ?? 0) + mappedQty } : i));
              }
            }
            return {
              tasks: st.tasks.filter((t) => t.id !== record.id),
              checklist: st.checklist.filter((c) => c.taskId !== record.id),
              items: restoredItems,
            };
          });
      },

      uncompleteTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        if (!task || !task.completed) return;
        let updatedItems = s.items;
        if (task.mappedItemId && task.mappedQuantity && task.mappedQuantity > 0) {
          const it = s.items.find((i) => i.id === task.mappedItemId);
          if (it && it.currentStock != null) {
            updatedItems = s.items.map((i) => (i.id === it.id ? { ...i, currentStock: (i.currentStock ?? 0) + task.mappedQuantity! } : i));
          }
        }
        // A ticked-ahead record: unticking removes it so the date goes back to "scheduled"
        // instead of leaving the series with two open occurrences.
        const seriesOpen = s.tasks.some((t) => t.id !== id && t.seriesId === task.seriesId && !t.completed);
        if (task.recurrence && !task.nextOccurrenceId && seriesOpen) {
          set({ tasks: s.tasks.filter((t) => t.id !== id), checklist: s.checklist.filter((c) => c.taskId !== id), items: updatedItems });
          return;
        }
        // Retract the occurrence this completion spawned, unless it has already been completed itself.
        const spawned = task.nextOccurrenceId ? s.tasks.find((t) => t.id === task.nextOccurrenceId) : undefined;
        const dropId = spawned && !spawned.completed ? spawned.id : null;
        set({
          tasks: s.tasks
            .filter((t) => t.id !== dropId)
            .map((t) => (t.id === id ? { ...t, completed: false, completedAt: null, completedBy: null, nextOccurrenceId: null } : t)),
          checklist: dropId ? s.checklist.filter((c) => c.taskId !== dropId) : s.checklist,
          items: updatedItems,
        });
      },


      postponeTask: (id, dueDate) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, dueDate } : t)) })),

      deleteTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        const items = s.checklist.filter((c) => c.taskId === id);
        set({ tasks: s.tasks.filter((t) => t.id !== id), checklist: s.checklist.filter((c) => c.taskId !== id) });
        return () => {
          if (task) set((st) => ({ tasks: [...st.tasks, task], checklist: [...st.checklist, ...items] }));
        };
      },

      toggleChecklistItem: (id) =>
        set((s) => ({ checklist: s.checklist.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c)) })),

      addToShopping: (input) => {
        const name = input.name.trim();
        if (!name) return { ok: false, reason: 'empty' };
        const s = get();
        let item = input.itemId ? s.items.find((i) => i.id === input.itemId) : s.items.find((i) => sameName(i.name, name));
        if (item && s.shopping.some((sh) => sh.itemId === item!.id && !sh.completed)) return { ok: false, reason: 'duplicate' };

        const newItems = [...s.items];
        if (!item) {
          item = {
            id: uid(),
            householdId: s.household.id,
            name,
            category: input.category ?? guessCategory(name) ?? 'Other',
            quantity: input.quantity ?? 1,
            unit: input.unit ?? '',
            currentStock: null,
            status: 'unknown',
            expectedUsageDays: null,
            notes: '',
          };
          newItems.push(item);
        }
        // Smart defaults: fill blanks from the most recent purchase of this item.
        const last = s.purchases.filter((p) => p.itemId === item!.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
        const entry: ShoppingItem = {
          id: uid(),
          householdId: s.household.id,
          itemId: item.id,
          name: item.name,
          category: input.category ?? item.category,
          quantity: input.quantity ?? item.quantity ?? 1,
          unit: input.unit ?? item.unit,
          estimatedPrice: input.estimatedPrice !== undefined && input.estimatedPrice !== null ? input.estimatedPrice : last?.price ?? null,
          store: input.store?.trim() || last?.store || '',
          note: input.note?.trim() ?? '',
          completed: false,
          createdAt: new Date().toISOString(),
        };
        set({ items: newItems, shopping: [...s.shopping, entry] });
        return { ok: true, id: entry.id };
      },

      updateShoppingItem: (id, patch) => {
        set((s) => {
          const entry = s.shopping.find((x) => x.id === id);
          return {
            shopping: s.shopping.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            // Keep the item's canonical category/unit in sync with the latest edit.
            items: entry
              ? s.items.map((i) =>
                  i.id === entry.itemId
                    ? { ...i, category: patch.category ?? i.category, unit: patch.unit ?? i.unit, quantity: patch.quantity ?? i.quantity }
                    : i,
                )
              : s.items,
          };
        });
      },

      removeShoppingItem: (id) => {
        const entry = get().shopping.find((x) => x.id === id);
        set((s) => ({ shopping: s.shopping.filter((x) => x.id !== id) }));
        return () => {
          if (entry) set((s) => ({ shopping: [...s.shopping, entry] }));
        };
      },

      recordPurchase: (input) => {
        const s = get();
        const name = input.name.trim();
        const shopItem = input.shoppingItemId ? s.shopping.find((x) => x.id === input.shoppingItemId) : undefined;
        const resolvedItemId = input.itemId || shopItem?.itemId;
        let item = resolvedItemId ? s.items.find((i) => i.id === resolvedItemId) : s.items.find((i) => sameName(i.name, name));
        const createdItem = !item;
        if (!item) {
          item = {
            id: uid(),
            householdId: s.household.id,
            name,
            category: input.category,
            quantity: input.quantity,
            unit: input.unit,
            usageUnit: input.usageUnit,
            usagePerPurchaseUnit: input.usagePerPurchaseUnit,
            currentStock: null,
            status: 'unknown',
            expectedUsageDays: null,
            notes: '',
          };
        }

        const targetScope: FinanceScope = input.scope ?? 'household';
        const isPersonal = targetScope === 'personal';
        const newPurId = uid();
        const newTxId = uid();

        const purchase = {
          id: newPurId,
          householdId: s.household.id,
          itemId: item.id,
          itemName: item.name,
          category: input.category,
          quantity: input.quantity,
          unit: input.unit,
          price: input.price,
          store: input.store.trim(),
          purchaseDate: input.purchaseDate,
          notes: input.notes?.trim() ?? '',
          spendCategoryId: input.spendCategoryId ?? item.spendCategoryId ?? null,
          accountId: input.accountId ?? null,
          memberId: input.memberId ?? s.currentMemberId ?? null,
          createdAt: new Date().toISOString(),
        };

        const transaction: Transaction = {
          id: newTxId,
          householdId: s.household.id,
          type: 'expense',
          scope: 'personal',
          categoryId: input.spendCategoryId ?? item.spendCategoryId ?? null,
          amount: Math.round(input.price ?? 0),
          date: input.purchaseDate,
          note: item.name,
          quantity: input.quantity,
          unit: input.unit,
          usageUnit: input.usageUnit ?? item.usageUnit ?? null,
          usagePerPurchaseUnit: input.usagePerPurchaseUnit ?? item.usagePerPurchaseUnit ?? null,
          itemId: item.id,
          accountId: input.accountId ?? null,
          memberId: input.memberId ?? s.currentMemberId ?? null,
          createdAt: new Date().toISOString(),
        };

        const ratio = input.usagePerPurchaseUnit && input.usagePerPurchaseUnit > 0
          ? input.usagePerPurchaseUnit
          : (item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0 ? item.usagePerPurchaseUnit : 1);
        const qty = input.quantity && input.quantity > 0 ? input.quantity : 1;
        const inflow = qty * ratio;

        // Buying it clears it from the list, wherever the purchase was recorded from.
        const removed = s.shopping.filter((x) => x.id === input.shoppingItemId || (item && x.itemId === item.id && !x.completed));
        const purchases = isPersonal ? s.purchases : [...s.purchases, purchase];
        const transactions = isPersonal ? [...s.transactions, transaction] : s.transactions;
        const baseItems = createdItem ? [...s.items, item] : s.items;

        set({
          purchases,
          transactions,
          shopping: s.shopping.filter((x) => !removed.includes(x)),
          items: refreshStatus(baseItems, purchases, item.id, transactions).map((i) =>
            i.id === item!.id
              ? {
                  ...i,
                  currentStock: (i.currentStock != null ? i.currentStock : 0) + inflow,
                  unit: input.unit || i.unit,
                  ...(input.usageUnit !== undefined ? { usageUnit: input.usageUnit } : {}),
                  ...(input.usagePerPurchaseUnit !== undefined ? { usagePerPurchaseUnit: input.usagePerPurchaseUnit } : {}),
                  ...(input.spendCategoryId ? { spendCategoryId: input.spendCategoryId } : {}),
                }
              : i,
          ),
        });

        const itemId = item.id;
        return () =>
          set((st) => {
            const ps = isPersonal ? st.purchases : st.purchases.filter((p) => p.id !== newPurId);
            const txs = isPersonal ? st.transactions.filter((t) => t.id !== newTxId) : st.transactions;
            const items = createdItem
              ? st.items.filter((i) => i.id !== itemId)
              : refreshStatus(st.items, ps, itemId, txs).map((i) =>
                  i.id === itemId ? { ...i, currentStock: Math.max(0, (i.currentStock ?? inflow) - inflow) } : i,
                );
            return { purchases: ps, transactions: txs, shopping: [...st.shopping, ...removed], items };
          });
      },

      deletePurchase: (id) => {
        const p = get().purchases.find((x) => x.id === id);
        const it = p ? get().items.find((i) => i.id === p.itemId) : undefined;
        const ratio = it?.usagePerPurchaseUnit && it.usagePerPurchaseUnit > 0 ? it.usagePerPurchaseUnit : 1;
        const qty = p ? p.quantity * ratio : 0;
        set((s) => {
          const ps = s.purchases.filter((x) => x.id !== id);
          const updated = s.items.map((i) =>
            p && i.id === p.itemId ? { ...i, currentStock: Math.max(0, (i.currentStock ?? qty) - qty) } : i,
          );
          return { purchases: ps, items: p ? refreshStatus(updated, ps, p.itemId) : s.items };
        });
        return () => {
          if (p)
            set((s) => {
              const ps = [...s.purchases, p];
              const updated = s.items.map((i) =>
                i.id === p.itemId ? { ...i, currentStock: (i.currentStock ?? 0) + qty } : i,
              );
              return { purchases: ps, items: refreshStatus(updated, ps, p.itemId) };
            });
        };
      },

      updatePurchase: (id, patch) => {
        set((s) => {
          const old = s.purchases.find((x) => x.id === id);
          if (!old) return s;
          const purchases = s.purchases.map((p) => (p.id === id ? { ...p, ...patch } : p));
          const it = old.itemId ? s.items.find((i) => i.id === old.itemId) : undefined;
          let items = s.items;
          if (it) {
            const ratio = it.usagePerPurchaseUnit && it.usagePerPurchaseUnit > 0 ? it.usagePerPurchaseUnit : 1;
            const oldQty = old.quantity * ratio;
            const newQty = (patch.quantity ?? old.quantity) * ratio;
            const diff = newQty - oldQty;
            items = s.items.map((i) =>
              i.id === it.id
                ? {
                    ...i,
                    currentStock: i.currentStock != null ? Math.max(0, i.currentStock + diff) : null,
                    ...(patch.itemName ? { name: patch.itemName } : {}),
                    ...(patch.unit ? { unit: patch.unit } : {}),
                    ...(patch.spendCategoryId ? { spendCategoryId: patch.spendCategoryId } : {}),
                  }
                : i
            );
          }
          return {
            purchases,
            items: old.itemId ? refreshStatus(items, purchases, old.itemId) : items,
          };
        });
      },

      addItem: (input) => {
        const id = uid();
        const s = get();
        const name = input.name.trim();
        const newItem: HouseholdItem = {
          id,
          householdId: s.household.id,
          name,
          category: input.category ?? guessCategory(name) ?? 'Other',
          room: input.room ?? null,
          quantity: 1,
          unit: input.unit?.trim() ?? '',
          usageUnit: input.usageUnit?.trim() || undefined,
          usagePerPurchaseUnit: input.usagePerPurchaseUnit != null && input.usagePerPurchaseUnit > 0 ? input.usagePerPurchaseUnit : null,
          currentStock: input.currentStock != null && !isNaN(input.currentStock) ? Math.max(0, input.currentStock) : null,
          status: computeItemStatus(
            {
              currentStock: input.currentStock != null && !isNaN(input.currentStock) ? Math.max(0, input.currentStock) : null,
              expectedUsageDays: input.expectedUsageDays ?? null,
              usagePerPurchaseUnit: input.usagePerPurchaseUnit != null && input.usagePerPurchaseUnit > 0 ? input.usagePerPurchaseUnit : null,
            },
            null,
          ),
          expectedUsageDays: input.expectedUsageDays ?? null,
          notes: input.notes?.trim() ?? '',
          spendCategoryId: input.spendCategoryId ?? null,
        };
        set({ items: [...s.items, newItem] });
        return id;
      },

      addItemFromExpense: (entry) => {
        const s = get();
        const rawName = (entry.itemName || entry.notes || '').trim() || 'Item';
        let item = s.items.find((i) => sameName(i.name, rawName));
        let itemId: string;
        let created = false;

        if (item) {
          itemId = item.id;
        } else {
          created = true;
          itemId = uid();
          const category = entry.rawPurchase?.category ?? guessCategory(rawName) ?? 'Other';
          const unit = (entry.rawPurchase?.unit ?? entry.rawTransaction?.unit ?? 'item').trim();
          const usageUnit = entry.rawTransaction?.usageUnit ?? undefined;
          const usagePerPurchaseUnit = entry.rawTransaction?.usagePerPurchaseUnit ?? null;
          const qty = entry.rawPurchase?.quantity ?? entry.rawTransaction?.quantity ?? 1;

          item = {
            id: itemId,
            householdId: s.household.id,
            name: rawName,
            category,
            room: null,
            quantity: 1,
            unit,
            usageUnit,
            usagePerPurchaseUnit,
            currentStock: qty,
            status: 'unknown',
            expectedUsageDays: null,
            notes: '',
            spendCategoryId: entry.categoryId ?? entry.rawPurchase?.spendCategoryId ?? null,
          };
        }

        const rawPurId = entry.kind === 'purchase' ? entry.id.replace(/^pur-/, '') : entry.rawPurchase?.id;
        const rawTxId = entry.kind === 'transaction' ? entry.id.replace(/^tx-/, '') : entry.rawTransaction?.id;

        const nextPurchases = s.purchases.map((p) => {
          if (p.id === rawPurId || sameName(p.itemName, rawName)) {
            return { ...p, itemId };
          }
          return p;
        });

        const nextTransactions = s.transactions.map((t) => {
          const tName = (t.itemName || t.note || '').trim();
          if (t.id === rawTxId || sameName(tName, rawName)) {
            return { ...t, itemId, itemName: t.itemName || rawName };
          }
          return t;
        });

        const baseItems = created ? [...s.items, item] : s.items;
        const nextItems = refreshStatus(baseItems, nextPurchases, itemId, nextTransactions);

        set({
          items: nextItems,
          purchases: nextPurchases,
          transactions: nextTransactions,
        });

        return itemId;
      },

      updateItem: (id, patch) =>
        set((s) => {
          const items = s.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
          const name = patch.name?.trim();
          return {
            items: refreshStatus(items, s.purchases, id),
            // Renames and re-categorisations flow through to the open list entry.
            shopping: s.shopping.map((x) =>
              x.itemId === id ? { ...x, name: name || x.name, category: patch.category ?? x.category } : x,
            ),
          };
        }),

      deleteItem: (id) => {
        const s = get();
        const item = s.items.find((i) => i.id === id);
        if (!item) return () => {};
        set({
          items: s.items.filter((i) => i.id !== id),
          tasks: s.tasks.map((t) => (t.mappedItemId === id ? { ...t, mappedItemId: null, mappedQuantity: null } : t)),
          shopping: s.shopping.filter((sh) => sh.itemId !== id),
        });
        return () => {
          set((st) => ({
            items: [...st.items, item],
          }));
        };
      },

      useItem: (id, amount = 1) => {
        const s = get();
        const item = s.items.find((i) => i.id === id);
        if (!item) return () => {};
        const ratio = item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0 ? item.usagePerPurchaseUnit : 1;
        const current = item.currentStock != null ? item.currentStock : (item.quantity ?? 1) * ratio;
        const nextStock = Math.max(0, current - amount);
        const prevStock = item.currentStock;
        set({
          items: s.items.map((i) => (i.id === id ? { ...i, currentStock: nextStock } : i)),
        });
        return () => {
          set((st) => ({
            items: st.items.map((i) => (i.id === id ? { ...i, currentStock: prevStock } : i)),
          }));
        };
      },

      addTransaction: (input) => {
        const id = uid();
        const s = get();
        const shopItem = input.shoppingItemId ? s.shopping.find((x) => x.id === input.shoppingItemId) : undefined;
        const resolvedItemId = input.itemId || shopItem?.itemId;
        const name = (input.itemName || input.note || '').trim();
        const item = resolvedItemId
          ? s.items.find((i) => i.id === resolvedItemId)
          : (name ? s.items.find((i) => sameName(i.name, name)) : undefined);

        const tx: Transaction = {
          ...input,
          id,
          householdId: s.household.id,
          scope: input.scope ?? 'household',
          amount: Math.round(input.amount),
          itemName: input.itemName ? input.itemName.trim() : null,
          note: (input.note ?? '').trim(),
          memberId: input.memberId ?? s.currentMemberId,
          accountId: input.accountId ?? null,
          createdAt: new Date().toISOString(),
        };

        if (input.type === 'expense' && item) {
          const ratio = input.usagePerPurchaseUnit && input.usagePerPurchaseUnit > 0
            ? input.usagePerPurchaseUnit
            : (item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0 ? item.usagePerPurchaseUnit : 1);
          const qty = input.quantity != null && input.quantity > 0 ? input.quantity : 1;
          const inflow = qty * ratio;
          const txs = [...s.transactions, tx];
          const nextItems = refreshStatus(s.items, s.purchases, item.id, txs).map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  currentStock: (i.currentStock != null ? i.currentStock : 0) + inflow,
                  unit: input.unit || i.unit,
                  ...(input.usageUnit !== undefined && input.usageUnit !== null ? { usageUnit: input.usageUnit } : {}),
                  ...(input.usagePerPurchaseUnit !== undefined && input.usagePerPurchaseUnit !== null ? { usagePerPurchaseUnit: input.usagePerPurchaseUnit } : {}),
                }
              : i,
          );
          const nextShopping = s.shopping.filter((x) => x.id !== input.shoppingItemId && (x.itemId !== item.id || x.completed));
          set({
            transactions: txs,
            items: nextItems,
            shopping: nextShopping,
          });
          return id;
        }

        const nextShopping = input.shoppingItemId ? s.shopping.filter((x) => x.id !== input.shoppingItemId) : s.shopping;
        set((st) => ({
          transactions: [...st.transactions, tx],
          shopping: nextShopping,
        }));
        return id;
      },
      updateTransaction: (id, input) =>
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...input,
                  amount: Math.round(input.amount),
                  scope: input.scope !== undefined ? input.scope : t.scope,
                  itemName: input.itemName !== undefined ? (input.itemName ? input.itemName.trim() : null) : t.itemName,
                  note: input.note !== undefined ? input.note.trim() : t.note,
                  memberId: input.memberId !== undefined ? input.memberId : t.memberId,
                  accountId: input.accountId !== undefined ? input.accountId : t.accountId,
                  toAccountId: input.toAccountId !== undefined ? input.toAccountId : t.toAccountId,
                }
              : t,
          ),
        })),
      deleteTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        const it = tx?.itemId ? get().items.find((i) => i.id === tx.itemId) : undefined;
        const ratio = it?.usagePerPurchaseUnit && it.usagePerPurchaseUnit > 0 ? it.usagePerPurchaseUnit : (tx?.usagePerPurchaseUnit && tx.usagePerPurchaseUnit > 0 ? tx.usagePerPurchaseUnit : 1);
        const qty = tx && tx.type === 'expense' && tx.itemId ? (tx.quantity ?? 1) * ratio : 0;
        set((s) => {
          const txs = s.transactions.filter((t) => t.id !== id);
          const updated = it && qty > 0 ? s.items.map((i) => (i.id === it.id ? { ...i, currentStock: Math.max(0, (i.currentStock ?? qty) - qty) } : i)) : s.items;
          return { transactions: txs, items: it ? refreshStatus(updated, s.purchases, it.id, txs) : s.items };
        });
        return () => {
          if (tx)
            set((s) => {
              const txs = [...s.transactions, tx];
              const updated = it && qty > 0 ? s.items.map((i) => (i.id === it.id ? { ...i, currentStock: (i.currentStock ?? 0) + qty } : i)) : s.items;
              return { transactions: txs, items: it ? refreshStatus(updated, s.purchases, it.id, txs) : s.items };
            });
        };
      },
      addMoneyCategory: (input) => {
        const id = uid();
        set((s) => ({
          moneyCategories: [
            ...s.moneyCategories,
            {
              ...input,
              id,
              householdId: s.household.id,
              name: input.name.trim(),
              archived: false,
              order: Math.max(-1, ...s.moneyCategories.filter((c) => c.type === input.type).map((c) => c.order)) + 1,
            },
          ],
        }));
        return id;
      },
      updateMoneyCategory: (id, patch) =>
        set((s) => ({
          moneyCategories: s.moneyCategories.map((c) => (c.id === id ? { ...c, ...patch, name: patch.name?.trim() || c.name } : c)),
        })),
      archiveMoneyCategory: (id) => {
        set((s) => ({ moneyCategories: s.moneyCategories.map((c) => (c.id === id ? { ...c, archived: true } : c)) }));
        return () => set((s) => ({ moneyCategories: s.moneyCategories.map((c) => (c.id === id ? { ...c, archived: false } : c)) }));
      },

      addAccount: (name, icon = 'payments', color = '#3FA88B', scope = 'household', nature = 'asset', initialBalance = 0, excludeFromTotal = false, archived = false) => {
        const id = uid();
        set((s) => ({
          accounts: [
            ...(s.accounts ?? []),
            {
              id,
              householdId: s.household.id,
              name: name.trim(),
              icon,
              color,
              scope,
              nature,
              initialBalance: initialBalance ?? 0,
              excludeFromTotal: excludeFromTotal ?? false,
              archived: archived ?? false,
              order: (s.accounts ?? []).length,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return id;
      },
      updateAccount: (id, patch) =>
        set((s) => ({
          accounts: (s.accounts ?? []).map((a) => (a.id === id ? { ...a, ...patch, name: patch.name?.trim() || a.name } : a)),
        })),
      deleteAccount: (id) =>
        set((s) => ({
          accounts: (s.accounts ?? []).filter((a) => a.id !== id),
        })),
      reorderAccounts: (orderedIds) =>
        set((s) => {
          const list = [...(s.accounts ?? [])];
          const orderedSet = new Set(orderedIds);
          const targetIndices: number[] = [];
          list.forEach((acc, idx) => {
            if (orderedSet.has(acc.id)) {
              targetIndices.push(idx);
            }
          });
          const accountMap = new Map(list.map((a) => [a.id, a]));
          targetIndices.forEach((targetIdx, i) => {
            const id = orderedIds[i];
            if (id && accountMap.has(id)) {
              list[targetIdx] = { ...accountMap.get(id)!, order: i };
            }
          });
          return { accounts: list };
        }),
      setBudget: (scope, amount) =>
        set(() => (scope === 'household' ? { householdBudget: amount } : { personalBudget: amount })),

      renameHousehold: (name) => set((s) => ({ household: { ...s.household, name: name.trim() || s.household.name } })),
      addMember: (name, avatar = null) =>
        set((s) => ({
          members: [
            ...s.members,
            {
              id: uid(),
              householdId: s.household.id,
              name: name.trim(),
              color: MEMBER_COLORS[s.members.length % MEMBER_COLORS.length],
              avatar,
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      renameMember: (id, name) =>
        set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, name: name.trim() || m.name } : m)) })),
      setMemberAvatar: (id, avatar) =>
        set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, avatar } : m)) })),
      setCurrentMember: (id) => set({ currentMemberId: id }),
      resetDemo: () => set(createSeed()),
    }),
    {
      name: 'namin:data',
      version: 11,
      migrate: (persisted, version) => {
        const data = persisted as Data;
        if (version < 2) {
          // v2 links occurrences of a recurring task through seriesId; rebuild it from nextOccurrenceId chains.
          const byId = new Map(data.tasks.map((t) => [t.id, { ...t, seriesId: t.seriesId ?? t.id }]));
          for (let changed = true, n = 0; changed && n < 50; n++) {
            changed = false;
            for (const t of byId.values()) {
              const next = t.nextOccurrenceId ? byId.get(t.nextOccurrenceId) : undefined;
              if (next && next.seriesId !== t.seriesId) {
                next.seriesId = t.seriesId;
                changed = true;
              }
            }
          }
          data.tasks = [...byId.values()];
        }
        if (version < 3) {
          // v3 adds income/expense tracking: default categories plus demo entries so Charts isn't empty.
          const hid = data.household?.id ?? '';
          data.moneyCategories = defaultMoneyCategories(hid);
          data.transactions = demoTransactions(hid, (data.members ?? []).map((m) => m.id));
        }
        if (version < 4) {
          // v4 swaps platform emoji for bundled icons, so they look the same on every device.
          data.moneyCategories = data.moneyCategories.map((c) => {
            const { emoji, ...rest } = c as MoneyCategory & { emoji?: string };
            return { ...rest, icon: rest.icon ?? (emoji && EMOJI_TO_ICON[emoji]) ?? 'package' };
          });
        }
        if (version < 5 || !data.accounts || !data.accounts.length) {
          const hid = data.household?.id ?? '';
          data.accounts = defaultAccounts(hid);
        }
        if (version < 7) {
          const hid = data.household?.id ?? '';
          if (data.accounts) {
            data.accounts = data.accounts.map((a) => ({
              ...a,
              scope: a.scope ?? 'household',
            }));
            if (!data.accounts.some((a) => a.scope === 'personal')) {
              data.accounts.push(
                { id: 'acc-personal-cash', householdId: hid, name: 'Personal Cash', icon: 'wallet', color: '#06B6D4', scope: 'personal', createdAt: new Date().toISOString() },
                { id: 'acc-personal-bank', householdId: hid, name: 'Personal Card', icon: 'credit_card', color: '#8B5CF6', scope: 'personal', createdAt: new Date().toISOString() },
              );
            }
          }
          const hasPersonalTx = (data.transactions ?? []).some((t) => t.scope === 'personal');
          if (!hasPersonalTx) {
            const currentMemId = data.currentMemberId || (data.members?.[0]?.id ?? '');
            const personalDemos = demoPersonalTransactions(hid, currentMemId);
            data.transactions = [...(data.transactions ?? []), ...personalDemos];
          }
        }
        if (version < 8) {
          if (data.accounts) {
            data.accounts = data.accounts.map((a) => ({
              ...a,
              nature: a.nature ?? (a.name.toLowerCase().includes('credit') || a.id === 'acc-personal-bank' ? 'debt' : 'asset'),
            }));
          }
          data.householdBudget = data.householdBudget ?? 30000000;
          data.personalBudget = data.personalBudget ?? 15000000;
        }
        if (version < 10) {
          // Reset members to default: 1 member named 'Me'
          const hasOldMembers = (data.members ?? []).some((m) => m.name === 'Minh' || m.name === 'Lan');
          if (hasOldMembers || !data.members || data.members.length === 0) {
            const now = new Date().toISOString();
            const hid = data.household?.id || 'h-home';
            const me: Member = { id: uid(), householdId: hid, name: 'Me', color: '#8CC9E8', createdAt: now };
            data.members = [me];
            data.currentMemberId = me.id;
          }
        }
        if (version < 11) {
          // Fix Cash account scope: if acc-cash or Cash was marked as household, update to personal
          if (data.accounts) {
            const cashAcc = data.accounts.find((a) => a.id === 'acc-cash' || a.name.toLowerCase().trim() === 'cash');
            if (cashAcc && cashAcc.scope === 'household') {
              const hasPersonalTx = (data.transactions ?? []).some((t) => (t.accountId === cashAcc.id || t.toAccountId === cashAcc.id) && t.scope === 'personal');
              const hasHouseholdTx = (data.transactions ?? []).some((t) => (t.accountId === cashAcc.id || t.toAccountId === cashAcc.id) && t.scope === 'household');
              if (hasPersonalTx || cashAcc.initialBalance === -418000 || !hasHouseholdTx) {
                cashAcc.scope = 'personal';
              }
            }
          }
        }
        return data;
      },
      storage: createJSONStorage(() => safeStorage),
      // Only persist data, never action functions.
      partialize: (s): Data => ({
        household: s.household,
        members: s.members,
        currentMemberId: s.currentMemberId,
        tasks: s.tasks,
        checklist: s.checklist,
        shopping: s.shopping,
        items: s.items,
        purchases: s.purchases,
        moneyCategories: s.moneyCategories,
        transactions: s.transactions,
        accounts: s.accounts,
        householdBudget: s.householdBudget,
        personalBudget: s.personalBudget,
      }),
    },
  ),
);
