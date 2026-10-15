import * as XLSX from 'xlsx';
import { useStore } from '../store';
import { today } from './dates';
import { uid } from './id';
import { CHART_COLORS } from './moneyCategories';
import type { Account, AccountNature, FinanceScope, HouseholdItem, MoneyCategory, ShoppingItem, Task, Transaction, TxType } from './types';

export interface ImportPreviewData {
  filename: string;
  ourWalletTxs: Transaction[];
  myWalletTxs: Transaction[];
  tasks: Task[];
  shoppingItems: ShoppingItem[];
  inventoryItems: HouseholdItem[];
  newAccounts?: Account[];
  newCategories?: MoneyCategory[];
}

/**
 * Export all household and personal data into a rich multi-sheet Excel (.xlsx) workbook.
 */
export function exportToExcel() {
  const state = useStore.getState();
  const wb = XLSX.utils.book_new();

  const accountsMap = new Map(state.accounts.map((a) => [a.id, a.name]));
  const categoriesMap = new Map(state.moneyCategories.map((c) => [c.id, c.name]));
  const membersMap = new Map(state.members.map((m) => [m.id, m.name]));

  // 1. Sheet: Our_Wallet (Shared transactions & purchases)
  const ourTxs = state.transactions.filter((t) => t.scope !== 'personal');
  const ourPurchases = state.purchases;

  const ourWalletRows = [
    ...ourTxs.map((t) => ({
      'Date': t.date,
      'Type': t.type.toUpperCase(),
      'Item / Title': t.note,
      'Category': t.categoryId ? categoriesMap.get(t.categoryId) || '' : '',
      'Amount': t.amount,
      'Account': t.accountId ? accountsMap.get(t.accountId) || '' : '',
      'To Account': t.toAccountId ? accountsMap.get(t.toAccountId) || '' : '',
      'Member': t.memberId ? membersMap.get(t.memberId) || '' : '',
      'Notes': t.note,
    })),
    ...ourPurchases.map((p) => ({
      'Date': p.purchaseDate,
      'Type': 'EXPENSE',
      'Item / Title': p.itemName,
      'Category': p.spendCategoryId ? categoriesMap.get(p.spendCategoryId) || p.category : p.category,
      'Amount': p.price ?? 0,
      'Account': p.accountId ? accountsMap.get(p.accountId) || '' : '',
      'To Account': '',
      'Member': p.memberId ? membersMap.get(p.memberId) || '' : '',
      'Notes': p.notes || '',
    })),
  ].sort((a, b) => b.Date.localeCompare(a.Date));

  const ourWalletWs = XLSX.utils.json_to_sheet(ourWalletRows.length ? ourWalletRows : [
    { 'Date': '', 'Type': '', 'Item / Title': '', 'Category': '', 'Amount': 0, 'Account': '', 'To Account': '', 'Member': '', 'Notes': '' }
  ]);
  ourWalletWs['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ourWalletWs, 'Our_Wallet');

  // 2. Sheet: My_Wallet (Personal transactions)
  const myTxs = state.transactions.filter((t) => t.scope === 'personal').sort((a, b) => b.date.localeCompare(a.date));
  const myWalletRows = myTxs.map((t) => ({
    'Date': t.date,
    'Type': t.type.toUpperCase(),
    'Item / Title': t.note,
    'Category': t.categoryId ? categoriesMap.get(t.categoryId) || '' : '',
    'Amount': t.amount,
    'Account': t.accountId ? accountsMap.get(t.accountId) || '' : '',
    'To Account': t.toAccountId ? accountsMap.get(t.toAccountId) || '' : '',
    'Member': t.memberId ? membersMap.get(t.memberId) || '' : '',
    'Notes': t.note,
  }));

  const myWalletWs = XLSX.utils.json_to_sheet(myWalletRows.length ? myWalletRows : [
    { 'Date': '', 'Type': '', 'Item / Title': '', 'Category': '', 'Amount': 0, 'Account': '', 'To Account': '', 'Member': '', 'Notes': '' }
  ]);
  myWalletWs['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, myWalletWs, 'My_Wallet');

  // 3. Sheet: Accounts
  const accountsRows = state.accounts.map((a) => ({
    'Account Name': a.name,
    'Scope': a.scope === 'personal' ? 'Personal' : 'Household',
    'Nature': a.nature === 'debt' ? 'Debt' : 'Asset',
    'Initial Balance': a.initialBalance ?? 0,
  }));
  const accountsWs = XLSX.utils.json_to_sheet(accountsRows);
  accountsWs['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, accountsWs, 'Accounts');

  // 4. Sheet: Tasks
  const tasksRows = state.tasks.map((t) => ({
    'Title': t.title,
    'Area / Room': t.area || '',
    'Due Date': t.dueDate,
    'Assignee': t.assigneeId ? membersMap.get(t.assigneeId) || '' : 'Anyone',
    'Status': t.completed ? 'Completed' : 'Pending',
    'Completed At': t.completedAt ? t.completedAt.slice(0, 10) : '',
    'Notes': t.notes || '',
  }));
  const tasksWs = XLSX.utils.json_to_sheet(tasksRows.length ? tasksRows : [
    { 'Title': '', 'Area / Room': '', 'Due Date': '', 'Assignee': '', 'Status': '', 'Completed At': '', 'Notes': '' }
  ]);
  tasksWs['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, tasksWs, 'Tasks');

  // 5. Sheet: Shopping_List
  const shoppingRows = state.shopping.map((s) => ({
    'Item Name': s.name,
    'Quantity': s.quantity,
    'Unit': s.unit,
    'Category': s.category,
    'Estimated Price': s.estimatedPrice ?? 0,
    'Status': s.completed ? 'Completed' : 'To Buy',
    'Store': s.store || '',
  }));
  const shoppingWs = XLSX.utils.json_to_sheet(shoppingRows.length ? shoppingRows : [
    { 'Item Name': '', 'Quantity': 1, 'Unit': '', 'Category': '', 'Estimated Price': 0, 'Status': '', 'Store': '' }
  ]);
  shoppingWs['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, shoppingWs, 'Shopping_List');

  // 6. Sheet: Household_Inventory
  const inventoryRows = state.items.map((i) => ({
    'Item Name': i.name,
    'Category': i.category,
    'Current Stock': i.currentStock ?? 0,
    'Unit': i.unit,
    'Status': i.status,
    'Notes': i.notes || '',
  }));
  const inventoryWs = XLSX.utils.json_to_sheet(inventoryRows.length ? inventoryRows : [
    { 'Item Name': '', 'Category': '', 'Current Stock': 0, 'Unit': '', 'Status': '', 'Notes': '' }
  ]);
  inventoryWs['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, inventoryWs, 'Household_Inventory');

  // Download workbook
  const filename = `Namin_Backup_${today()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

/**
 * Parse an uploaded Excel (.xlsx) file into structured entities for preview/import.
 */
export async function parseExcelFile(file: File): Promise<ImportPreviewData> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const state = useStore.getState();

  const accountsByName = new Map(state.accounts.map((a) => [a.name.toLowerCase().trim(), a.id]));
  const categoriesByName = new Map(state.moneyCategories.map((c) => [c.name.toLowerCase().trim(), c.id]));
  const membersByName = new Map(state.members.map((m) => [m.name.toLowerCase().trim(), m.id]));

  const newAccounts: Account[] = [];
  const newCategories: MoneyCategory[] = [];

  const ensureAccount = (rawName: string, defaultScope: FinanceScope = 'personal', defaultNature?: AccountNature): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (accountsByName.has(lower)) {
      return accountsByName.get(lower)!;
    }
    const isDebt = defaultNature ? defaultNature === 'debt' : /tín dụng|credit/i.test(trimmed);
    const isHousehold = defaultScope === 'household' || /quỹ|chung|household/i.test(trimmed);
    const newAcc: Account = {
      id: uid(),
      householdId: state.household.id,
      name: trimmed,
      icon: isDebt ? 'credit_card' : /momo|zalopay|ví/i.test(trimmed) ? 'account_balance_wallet' : /tiền mặt|cash/i.test(trimmed) ? 'payments' : 'account_balance',
      color: isDebt ? '#8B5CF6' : /momo/i.test(trimmed) ? '#D946EF' : '#4B7BFF',
      scope: isHousehold ? 'household' : 'personal',
      nature: isDebt ? 'debt' : 'asset',
      initialBalance: 0,
      createdAt: new Date().toISOString(),
    };
    newAccounts.push(newAcc);
    accountsByName.set(lower, newAcc.id);
    return newAcc.id;
  };

  const ensureCategory = (rawName: string, type: TxType = 'expense'): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (categoriesByName.has(lower)) {
      return categoriesByName.get(lower)!;
    }
    const icon = /travel|du lịch/i.test(trimmed) ? 'airplane'
      : /education|học/i.test(trimmed) ? 'books'
      : /sport|thể thao/i.test(trimmed) ? 'person-lifting-weights'
      : /thui|người yêu/i.test(trimmed) ? 'red-heart'
      : /wedding|cưới/i.test(trimmed) ? 'ring'
      : type === 'income' ? 'money-bag' : 'basket';

    const newCat: MoneyCategory = {
      id: uid(),
      householdId: state.household.id,
      type,
      name: trimmed,
      icon,
      color: CHART_COLORS[newCategories.length % CHART_COLORS.length],
      archived: false,
      order: state.moneyCategories.length + newCategories.length,
    };
    newCategories.push(newCat);
    categoriesByName.set(lower, newCat.id);
    return newCat.id;
  };

  // Pass 1: Parse Accounts sheet if present
  for (const sheetName of wb.SheetNames) {
    const lowerSheet = sheetName.toLowerCase().trim();
    if (lowerSheet.includes('account') || lowerSheet.includes('tài khoản')) {
      const ws = wb.Sheets[sheetName];
      const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      for (const row of rawRows) {
        const name = String(row['Account Name'] || row['Tên tài khoản'] || row['Name'] || '').trim();
        if (!name) continue;
        const scope: FinanceScope = /house|chung/i.test(String(row['Scope'] || '')) ? 'household' : 'personal';
        const nature: AccountNature = /debt|nợ|credit|tín dụng/i.test(String(row['Nature'] || '')) ? 'debt' : 'asset';
        ensureAccount(name, scope, nature);
      }
    }
  }

  const ourWalletTxs: Transaction[] = [];
  const myWalletTxs: Transaction[] = [];
  const tasks: Task[] = [];
  const shoppingItems: ShoppingItem[] = [];
  const inventoryItems: HouseholdItem[] = [];

  // Pass 2: Parse Transactions and other sheets
  for (const sheetName of wb.SheetNames) {
    const lowerSheet = sheetName.toLowerCase().trim();
    const ws = wb.Sheets[sheetName];
    const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rawRows.length) continue;

    // A. Our Wallet or Transactions sheet
    if (lowerSheet.includes('our_wallet') || lowerSheet.includes('our wallet') || (lowerSheet.includes('transaction') && !lowerSheet.includes('my'))) {
      for (const row of rawRows) {
        const dateStr = cleanDate(row['Date'] || row['Ngày'] || row['Ngay']);
        const amount = cleanNumber(row['Amount'] || row['Số tiền'] || row['So tien']);
        const title = String(row['Item / Title'] || row['Tên'] || row['Ghi chú'] || row['Note'] || '').trim();
        if (!dateStr || amount <= 0 || !title) continue;

        const rawType = String(row['Type'] || row['Loại'] || 'EXPENSE').toLowerCase();
        const type: TxType = rawType.includes('income') || rawType.includes('thu') ? 'income' : rawType.includes('transfer') || rawType.includes('chuyển') ? 'transfer' : 'expense';

        const catName = String(row['Category'] || row['Danh mục'] || '').trim();
        const accName = String(row['Account'] || row['Tài khoản'] || '').trim();
        const toAccName = String(row['To Account'] || row['Đến tài khoản'] || '').trim();
        const memName = String(row['Member'] || row['Thành viên'] || '').toLowerCase().trim();

        const catId = ensureCategory(catName, type);
        const accId = ensureAccount(accName, 'household');
        const toAccId = ensureAccount(toAccName, 'household');

        ourWalletTxs.push({
          id: uid(),
          householdId: state.household.id,
          type,
          scope: 'household',
          categoryId: catId,
          amount,
          date: dateStr,
          note: title,
          accountId: accId,
          toAccountId: toAccId,
          memberId: membersByName.get(memName) || null,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // B. My Wallet sheet
    else if (lowerSheet.includes('my_wallet') || lowerSheet.includes('my wallet') || lowerSheet.includes('personal') || lowerSheet.includes('cá nhân')) {
      for (const row of rawRows) {
        const dateStr = cleanDate(row['Date'] || row['Ngày'] || row['Ngay']);
        const amount = cleanNumber(row['Amount'] || row['Số tiền'] || row['So tien']);
        const catName = String(row['Category'] || row['Danh mục'] || '').trim();
        const rawTitle = String(row['Item / Title'] || row['Tên'] || row['Ghi chú'] || row['Note'] || '').trim();
        const title = rawTitle || String(row['Category'] || row['Danh mục'] || 'Transaction').trim();
        if (!dateStr || amount <= 0 || !title) continue;

        const rawType = String(row['Type'] || row['Loại'] || 'EXPENSE').toLowerCase();
        const type: TxType = rawType.includes('income') || rawType.includes('thu') ? 'income' : rawType.includes('transfer') || rawType.includes('chuyển') ? 'transfer' : 'expense';

        const accName = String(row['Account'] || row['Tài khoản'] || '').trim();
        const toAccName = String(row['To Account'] || row['Đến tài khoản'] || '').trim();

        const catId = ensureCategory(catName, type);
        const accId = ensureAccount(accName, 'personal');
        const toAccId = ensureAccount(toAccName, /quỹ/i.test(toAccName) ? 'household' : 'personal');

        myWalletTxs.push({
          id: uid(),
          householdId: state.household.id,
          type,
          scope: 'personal',
          categoryId: catId,
          amount,
          date: dateStr,
          note: title,
          accountId: accId,
          toAccountId: toAccId,
          memberId: state.currentMemberId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // C. Tasks sheet
    else if (lowerSheet.includes('task') || lowerSheet.includes('việc nhà') || lowerSheet.includes('công việc')) {
      for (const row of rawRows) {
        const title = String(row['Title'] || row['Tên việc'] || row['Tiêu đề'] || '').trim();
        if (!title) continue;

        const dueDate = cleanDate(row['Due Date'] || row['Hạn chót'] || row['Ngày']) || today();
        const area = String(row['Area / Room'] || row['Phòng'] || row['Khu vực'] || '').trim() || null;
        const memName = String(row['Assignee'] || row['Người làm'] || '').toLowerCase().trim();
        const statusStr = String(row['Status'] || row['Trạng thái'] || '').toLowerCase();
        const completed = statusStr.includes('complete') || statusStr.includes('xong') || statusStr.includes('done');
        const notes = String(row['Notes'] || row['Ghi chú'] || '').trim();

        tasks.push({
          id: uid(),
          householdId: state.household.id,
          title,
          assigneeId: membersByName.get(memName) || null,
          dueDate,
          recurrence: null,
          estimatedDuration: null,
          reminder: null,
          area,
          notes,
          completed,
          completedAt: completed ? new Date().toISOString() : null,
          nextOccurrenceId: null,
          seriesId: uid(),
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    filename: file.name,
    ourWalletTxs,
    myWalletTxs,
    tasks,
    shoppingItems,
    inventoryItems,
    newAccounts,
    newCategories,
  };
}

/**
 * Apply the parsed preview data into the local Zustand store (avoiding duplicates).
 */
export function commitImport(data: ImportPreviewData): { addedTxs: number; addedTasks: number } {
  const state = useStore.getState();

  // Deduplicate transactions by (date + amount + note + type + scope)
  const existingTxKey = new Set(
    state.transactions.map((t) => `${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}_${t.scope}`)
  );

  const newOurTxs = data.ourWalletTxs.filter(
    (t) => !existingTxKey.has(`${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}_${t.scope}`)
  );

  const newMyTxs = data.myWalletTxs.filter(
    (t) => !existingTxKey.has(`${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}_${t.scope}`)
  );

  const allNewTxs = [...newOurTxs, ...newMyTxs];

  // Deduplicate tasks by (title + dueDate)
  const existingTaskKey = new Set(state.tasks.map((t) => `${t.title.trim().toLowerCase()}_${t.dueDate}`));
  const newTasks = data.tasks.filter((t) => !existingTaskKey.has(`${t.title.trim().toLowerCase()}_${t.dueDate}`));

  const newAccounts = data.newAccounts || [];
  const newCategories = data.newCategories || [];

  useStore.setState((s) => ({
    accounts: [...s.accounts, ...newAccounts],
    moneyCategories: [...s.moneyCategories, ...newCategories],
    transactions: [...s.transactions, ...allNewTxs],
    tasks: [...s.tasks, ...newTasks],
  }));

  return {
    addedTxs: allNewTxs.length,
    addedTasks: newTasks.length,
  };
}

function cleanDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // DD/MM/YYYY
  const match1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match1) {
    const d = match1[1].padStart(2, '0');
    const m = match1[2].padStart(2, '0');
    const y = match1[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return Math.abs(val);
  const clean = String(val || '').replace(/[^\d.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.abs(num);
}
