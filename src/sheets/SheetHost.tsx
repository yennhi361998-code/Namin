import { useUi } from '../store/ui';
import { HouseholdSheet } from './HouseholdSheet';
import { ItemSheet } from './ItemSheet';
import { PurchaseSheet } from './PurchaseSheet';
import { ShoppingSheet } from './ShoppingSheet';
import { TaskSheet } from './TaskSheet';
import { CategoriesSheet } from './CategoriesSheet';
import { MoneyCategorySheet } from './MoneyCategorySheet';
import { TransactionSheet } from './TransactionSheet';

/** Renders whichever sheet is open. One sheet at a time keeps the modal story simple. */
export function SheetHost() {
  const sheet = useUi((s) => s.sheet);
  const open = useUi((s) => s.sheetOpen);
  const close = useUi((s) => s.closeSheet);
  if (!sheet) return null;
  const common = { open, onClose: close };
  switch (sheet.type) {
    case 'task':
      return <TaskSheet key={sheet.key} {...common} taskId={sheet.taskId} dueDate={sheet.dueDate} />;
    case 'shopping':
      return <ShoppingSheet key={sheet.key} {...common} shoppingId={sheet.shoppingId} />;
    case 'purchase':
      return <PurchaseSheet key={sheet.key} {...common} shoppingId={sheet.shoppingId} itemId={sheet.itemId} />;
    case 'item':
      return <ItemSheet key={sheet.key} {...common} itemId={sheet.itemId} />;
    case 'household':
      return <HouseholdSheet key={sheet.key} {...common} />;
    case 'transaction':
      return <TransactionSheet key={sheet.key} {...common} transactionId={sheet.transactionId} txType={sheet.txType} date={sheet.date} />;
    case 'categories':
      return <CategoriesSheet key={sheet.key} {...common} type={sheet.txType} />;
    case 'money-category':
      return <MoneyCategorySheet key={sheet.key} {...common} categoryId={sheet.categoryId} month={sheet.month} txType={sheet.txType} />;
  }
}
