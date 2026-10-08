import type { Account, Household, HouseholdItem, Member, MoneyCategory, Purchase, ShoppingItem, Task, TaskChecklistItem, Transaction } from '../lib/types';

/** Everything that gets persisted. Swap the persistence layer in store/index.ts to move this to a backend. */
export interface Data {
  household: Household;
  members: Member[];
  currentMemberId: string;
  tasks: Task[];
  checklist: TaskChecklistItem[];
  shopping: ShoppingItem[];
  items: HouseholdItem[];
  purchases: Purchase[];
  moneyCategories: MoneyCategory[];
  transactions: Transaction[];
  accounts: Account[];
}
