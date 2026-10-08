// Calendar dates are stored as local "YYYY-MM-DD" strings; timestamps as ISO strings.
export type DateStr = string;

export const CATEGORIES = ['Cleaning', 'Kitchen', 'Bathroom', 'Groceries', 'Maintenance', 'Other'] as const;
export type Category = (typeof CATEGORIES)[number];

export type RecurrenceUnit = 'day' | 'week' | 'month';
export interface Recurrence {
  unit: RecurrenceUnit;
  interval: number;
}

export interface Household {
  id: string;
  name: string;
  createdAt: string;
}

export interface Member {
  id: string;
  householdId: string;
  name: string;
  color: string;
  avatar?: string | null;
  createdAt: string;
}

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  householdId: string;
  title: string;
  assigneeId: string | null;
  dueDate: DateStr;
  recurrence: Recurrence | null;
  /** Minutes. */
  estimatedDuration: number | null;
  /** "HH:MM" on the due date. */
  reminder: string | null;
  /** Optional room/area tag shown as a chip (e.g. "Kitchen"). */
  area: string | null;
  notes: string;
  completed: boolean;
  completedAt: string | null;
  /** When a recurring occurrence is completed, the id of the occurrence it spawned. */
  nextOccurrenceId: string | null;
  /** Shared by every occurrence of the same recurring task (equals the first occurrence's id). */
  seriesId: string;
  createdAt: string;
}

export interface ShoppingItem {
  id: string;
  householdId: string;
  itemId: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  estimatedPrice: number | null;
  store: string;
  note: string;
  completed: boolean;
  createdAt: string;
}

export type ItemStatus = 'in_stock' | 'running_low' | 'out' | 'unknown';

export interface HouseholdItem {
  id: string;
  householdId: string;
  name: string;
  category: Category;
  quantity: number;
  unit: string;
  currentStock: number | null;
  status: ItemStatus;
  /** Manual override for how long one purchase lasts, used when history is too thin. */
  expectedUsageDays: number | null;
  notes: string;
  /** Spending category its purchases go to by default (remembered from the last purchase). */
  spendCategoryId?: string | null;
}

export interface Account {
  id: string;
  householdId: string;
  name: string;
  icon?: string;
  color?: string;
  archived?: boolean;
  createdAt?: string;
}

export interface Purchase {
  id: string;
  householdId: string;
  itemId: string;
  itemName: string;
  category: Category;
  quantity: number;
  unit: string;
  price: number | null;
  store: string;
  purchaseDate: DateStr;
  notes: string;
  /** Spending category this purchase counts toward in Charts. Missing = Daily. */
  spendCategoryId?: string | null;
  accountId?: string | null;
  memberId?: string | null;
}

export type TxType = 'expense' | 'income';

/** A user-editable spending or income category (Food, Salary…). */
export interface MoneyCategory {
  id: string;
  householdId: string;
  type: TxType;
  name: string;
  /** Icon id (CategoryIconName in components/icons.ts). */
  icon: string;
  /** One of CHART_COLORS: the category's fixed colour in charts. */
  color: string;
  /** Removed from pickers, kept so past entries still show their category. */
  archived: boolean;
  order: number;
}

/** A manually entered expense or income. Shopping purchases count as expenses on their own. */
export interface Transaction {
  id: string;
  householdId: string;
  type: TxType;
  categoryId: string;
  amount: number;
  date: DateStr;
  note: string;
  memberId: string | null;
  accountId?: string | null;
  createdAt: string;
}
