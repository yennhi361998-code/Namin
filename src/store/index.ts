import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { guessCategory } from '../lib/categories';
import { today } from '../lib/dates';
import { uid } from '../lib/id';
import { nextOccurrence } from '../lib/recurrence';
import { estimateRestock, statusFromEstimate } from '../lib/restock';
import { defaultMoneyCategories, demoTransactions, EMOJI_TO_ICON } from '../lib/moneyCategories';
import type { Account, Category, DateStr, HouseholdItem, MoneyCategory, Recurrence, ShoppingItem, Task, TaskChecklistItem, TxType } from '../lib/types';
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
  price: number | null;
  store: string;
  purchaseDate: DateStr;
  notes?: string;
  /** Spending category in Charts; remembered on the item for next time. */
  spendCategoryId?: string | null;
  accountId?: string | null;
  memberId?: string | null;
}

export interface TransactionInput {
  type: TxType;
  categoryId: string;
  amount: number;
  date: DateStr;
  note: string;
  memberId?: string | null;
  accountId?: string | null;
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
  updateItem: (id: string, patch: Partial<HouseholdItem>) => void;

  addTransaction: (input: TransactionInput) => string;
  updateTransaction: (id: string, input: TransactionInput) => void;
  deleteTransaction: (id: string) => Undo;
  addMoneyCategory: (input: MoneyCategoryInput) => string;
  updateMoneyCategory: (id: string, patch: Partial<MoneyCategoryInput>) => void;
  /** Hides it from pickers; past entries keep showing under it. */
  archiveMoneyCategory: (id: string) => Undo;

  addAccount: (name: string, icon?: string, color?: string) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  deleteAccount: (id: string) => void;

  renameHousehold: (name: string) => void;
  addMember: (name: string, avatar?: string | null) => void;
  renameMember: (id: string, name: string) => void;
  setMemberAvatar: (id: string, avatar: string | null) => void;
  setCurrentMember: (id: string) => void;
  resetDemo: () => void;
}

export type State = Data & Actions;

const MEMBER_COLORS = ['#8CC9E8', '#A9D8C8', '#B8C7E6', '#F2D6A7', '#D7C4E8', '#CBD5DA'];
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function refreshStatus(items: HouseholdItem[], purchases: Data['purchases'], itemId: string): HouseholdItem[] {
  return items.map((it) =>
    it.id === itemId ? { ...it, status: statusFromEstimate(estimateRestock(it, purchases.filter((p) => p.itemId === it.id))) } : it,
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
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...rest, title: input.title.trim(), notes: input.notes.trim() } : t)),
          checklist: [...s.checklist.filter((c) => c.taskId !== id), ...buildChecklist(id, checklist)],
        }));
      },

      completeTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        if (!task || task.completed) return;
        const done: Task = { ...task, completed: true, completedAt: new Date().toISOString() };
        if (!task.recurrence) {
          set({ tasks: s.tasks.map((t) => (t.id === id ? done : t)) });
          return;
        }
        // Recurring: spawn the next occurrence with the same configuration and a fresh checklist.
        const next: Task = {
          ...task,
          id: uid(),
          dueDate: nextOccurrence(task.dueDate, task.recurrence, today(), seriesDates(s.tasks, task)),
          completed: false,
          completedAt: null,
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
        });
      },

      completeOccurrence: (anchorId, date) => {
        const s = get();
        const anchor = s.tasks.find((t) => t.id === anchorId);
        if (!anchor || seriesDates(s.tasks, anchor).has(date)) return () => {};
        // A completed record on that date; the series skips it when it gets there.
        const record: Task = {
          ...anchor,
          id: uid(),
          dueDate: date,
          completed: true,
          completedAt: new Date().toISOString(),
          nextOccurrenceId: null,
          // Same as the series so the row keeps its place in the day list when ticked.
          createdAt: anchor.createdAt,
        };
        const items = s.checklist
          .filter((c) => c.taskId === anchorId)
          .map((c) => ({ ...c, id: uid(), taskId: record.id, completed: true }));
        set({ tasks: [...s.tasks, record], checklist: [...s.checklist, ...items] });
        return () =>
          set((st) => ({ tasks: st.tasks.filter((t) => t.id !== record.id), checklist: st.checklist.filter((c) => c.taskId !== record.id) }));
      },

      uncompleteTask: (id) => {
        const s = get();
        const task = s.tasks.find((t) => t.id === id);
        if (!task || !task.completed) return;
        // A ticked-ahead record: unticking removes it so the date goes back to "scheduled"
        // instead of leaving the series with two open occurrences.
        const seriesOpen = s.tasks.some((t) => t.id !== id && t.seriesId === task.seriesId && !t.completed);
        if (task.recurrence && !task.nextOccurrenceId && seriesOpen) {
          set({ tasks: s.tasks.filter((t) => t.id !== id), checklist: s.checklist.filter((c) => c.taskId !== id) });
          return;
        }
        // Retract the occurrence this completion spawned, unless it has already been completed itself.
        const spawned = task.nextOccurrenceId ? s.tasks.find((t) => t.id === task.nextOccurrenceId) : undefined;
        const dropId = spawned && !spawned.completed ? spawned.id : null;
        set({
          tasks: s.tasks
            .filter((t) => t.id !== dropId)
            .map((t) => (t.id === id ? { ...t, completed: false, completedAt: null, nextOccurrenceId: null } : t)),
          checklist: dropId ? s.checklist.filter((c) => c.taskId !== dropId) : s.checklist,
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
        let item = input.itemId ? s.items.find((i) => i.id === input.itemId) : s.items.find((i) => sameName(i.name, name));
        const createdItem = !item;
        if (!item) {
          item = {
            id: uid(),
            householdId: s.household.id,
            name,
            category: input.category,
            quantity: input.quantity,
            unit: input.unit,
            currentStock: null,
            status: 'unknown',
            expectedUsageDays: null,
            notes: '',
          };
        }
        const purchase = {
          id: uid(),
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
        };
        // Buying it clears it from the list, wherever the purchase was recorded from.
        const removed = s.shopping.filter((x) => x.id === input.shoppingItemId || (x.itemId === item!.id && !x.completed));
        const purchases = [...s.purchases, purchase];
        const baseItems = createdItem ? [...s.items, item] : s.items;
        set({
          purchases,
          shopping: s.shopping.filter((x) => !removed.includes(x)),
          items: refreshStatus(baseItems, purchases, item.id).map((i) =>
            i.id === item!.id && input.spendCategoryId ? { ...i, spendCategoryId: input.spendCategoryId } : i,
          ),
        });
        const itemId = item.id;
        return () =>
          set((st) => {
            const ps = st.purchases.filter((p) => p.id !== purchase.id);
            const items = createdItem ? st.items.filter((i) => i.id !== itemId) : refreshStatus(st.items, ps, itemId);
            return { purchases: ps, shopping: [...st.shopping, ...removed], items };
          });
      },

      deletePurchase: (id) => {
        const p = get().purchases.find((x) => x.id === id);
        set((s) => {
          const ps = s.purchases.filter((x) => x.id !== id);
          return { purchases: ps, items: p ? refreshStatus(s.items, ps, p.itemId) : s.items };
        });
        return () => {
          if (p)
            set((s) => {
              const ps = [...s.purchases, p];
              return { purchases: ps, items: refreshStatus(s.items, ps, p.itemId) };
            });
        };
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

      addTransaction: (input) => {
        const id = uid();
        set((s) => ({
          transactions: [
            ...s.transactions,
            {
              ...input,
              id,
              householdId: s.household.id,
              amount: Math.round(input.amount),
              note: input.note.trim(),
              memberId: input.memberId ?? s.currentMemberId,
              accountId: input.accountId ?? null,
              createdAt: new Date().toISOString(),
            },
          ],
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
                  note: input.note.trim(),
                  memberId: input.memberId !== undefined ? input.memberId : t.memberId,
                  accountId: input.accountId !== undefined ? input.accountId : t.accountId,
                }
              : t,
          ),
        })),
      deleteTransaction: (id) => {
        const tx = get().transactions.find((t) => t.id === id);
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
        return () => {
          if (tx) set((s) => ({ transactions: [...s.transactions, tx] }));
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

      addAccount: (name, icon = 'wallet', color = '#3FA88B') => {
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
      version: 5,
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
      }),
    },
  ),
);
