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
  /** Optional linked shopping/household item to consume on completion. */
  mappedItemId?: string | null;
  /** Quantity of the item to consume per completion (in usage units). */
  mappedQuantity?: number | null;
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
  /** Purchase/package unit, e.g. "roll", "box", "pack". */
  unit: string;
  /** Usage/consumable unit, e.g. "bags", "tablets", "pieces". Defaults to `unit` if not specified. */
  usageUnit?: string;
  /** How many usage units are contained in one purchase unit (e.g. 50 bags per roll). Defaults to 1. */
  usagePerPurchaseUnit?: number | null;
  /** Current in-stock quantity (tracked in usage units). */
  currentStock: number | null;
  status: ItemStatus;
  /** Manual override for how long one purchase lasts, used when history is too thin. */
  expectedUsageDays: number | null;
  notes: string;
  /** Spending category its purchases go to by default (remembered from the last purchase). */
  spendCategoryId?: string | null;
  /** Optional room/area tag (e.g. Kitchen, Living, Bathroom, etc.). */
  room?: string | null;
}

export function getUsageUnit(item: Pick<HouseholdItem, 'unit'> & { usageUnit?: string }): string {
  return item.usageUnit?.trim() || item.unit;
}

export function getUsageRatio(item: { usagePerPurchaseUnit?: number | null }): number {
  return item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0 ? item.usagePerPurchaseUnit : 1;
}


export type FinanceScope = 'household' | 'personal';
export type AccountNature = 'asset' | 'debt';

export interface Account {
  id: string;
  householdId: string;
  name: string;
  icon?: string;
  color?: string;
  scope?: FinanceScope;
  nature?: AccountNature;
  initialBalance?: number | null;
  excludeFromTotal?: boolean;
  archived?: boolean;
  order?: number;
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
  createdAt?: string;
}

export type TxType = 'expense' | 'income' | 'transfer';

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

/** A manually entered expense, income, or transfer. Shopping purchases count as expenses on their own. */
export interface Transaction {
  id: string;
  householdId: string;
  type: TxType;
  scope?: FinanceScope;
  categoryId?: string | null;
  amount: number;
  date: DateStr;
  note: string;
  itemName?: string | null;
  quantity?: number | null;
  unit?: string | null;
  usageUnit?: string | null;
  usagePerPurchaseUnit?: number | null;
  itemId?: string | null;
  memberId: string | null;
  accountId?: string | null;
  /** Destination account when type === 'transfer'. */
  toAccountId?: string | null;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  kind: 'purchase' | 'transaction';
  type: TxType;
  scope?: FinanceScope;
  amount: number;
  date: DateStr;
  itemName: string;
  categoryId?: string | null;
  accountId?: string | null;
  toAccountId?: string | null;
  memberId?: string | null;
  notes?: string;
  itemId?: string;
  createdAt?: string;
  rawPurchase?: Purchase;
  rawTransaction?: Transaction;
}
