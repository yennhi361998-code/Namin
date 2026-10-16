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
  updatedAccounts?: Array<Partial<Account> & { id: string }>;
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
    'Exclude From Total': a.excludeFromTotal ? 'Yes' : 'No',
  }));
  const accountsWs = XLSX.utils.json_to_sheet(accountsRows);
  accountsWs['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
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
  const updatedAccountsMap = new Map<string, Partial<Account> & { id: string }>();
  const newCategories: MoneyCategory[] = [];

  const ensureAccount = (
    rawName: string,
    defaultScope: FinanceScope = 'personal',
    defaultNature?: AccountNature,
    initialBalance: number = 0,
    excludeFromTotal?: boolean,
    explicitScope?: FinanceScope
  ): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (accountsByName.has(lower)) {
      const id = accountsByName.get(lower)!;
      const existingNew = newAccounts.find((a) => a.id === id);
      if (existingNew) {
        if (initialBalance !== 0 && (!existingNew.initialBalance || existingNew.initialBalance === 0)) {
          existingNew.initialBalance = initialBalance;
        }
        if (excludeFromTotal !== undefined) {
          existingNew.excludeFromTotal = excludeFromTotal;
        }
        if (explicitScope) {
          existingNew.scope = explicitScope;
        }
        if (defaultNature) {
          existingNew.nature = defaultNature;
        }
      } else {
        const existingInState = state.accounts.find((a) => a.id === id);
        if (existingInState) {
          const upd: Partial<Account> & { id: string } = updatedAccountsMap.get(id) || { id };
          if (initialBalance !== 0 && (!existingInState.initialBalance || existingInState.initialBalance === 0)) {
            upd.initialBalance = initialBalance;
          }
          if (excludeFromTotal !== undefined) {
            upd.excludeFromTotal = excludeFromTotal;
          }
          if (explicitScope) {
            upd.scope = explicitScope;
          } else if (defaultScope === 'personal' && (lower === 'cash' || lower === 'tiền mặt')) {
            // When Cash is used in Personal scope (e.g. My_Wallet), update from default household to personal
            upd.scope = 'personal';
          }
          if (defaultNature) {
            upd.nature = defaultNature;
          }
          updatedAccountsMap.set(id, upd);
        }
      }
      return id;
    }
    const isDebt = defaultNature ? defaultNature === 'debt' : /tín dụng|tin dung|credit/i.test(trimmed);
    const resolvedScope = explicitScope ?? (defaultScope === 'household' || /quỹ|chung|household/i.test(trimmed) ? 'household' : 'personal');
    const isExcluded = excludeFromTotal ?? false;

    const newAcc: Account = {
      id: uid(),
      householdId: state.household.id,
      name: trimmed,
      icon: isDebt ? 'credit_card' : /momo|zalopay|ví/i.test(trimmed) ? 'account_balance_wallet' : /tiền mặt|cash/i.test(trimmed) ? 'payments' : 'account_balance',
      color: isDebt ? '#8B5CF6' : /momo/i.test(trimmed) ? '#D946EF' : '#4B7BFF',
      scope: resolvedScope,
      nature: isDebt ? 'debt' : 'asset',
      initialBalance,
      excludeFromTotal: isExcluded,
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
        const scopeStr = String(row['Scope'] || '').trim();
        const scope: FinanceScope = /house|chung/i.test(scopeStr) ? 'household' : 'personal';
        const nature: AccountNature = /debt|nợ|credit|tín dụng|tin dung/i.test(String(row['Nature'] || '')) ? 'debt' : 'asset';
        const rawBal = row['Initial Balance'] ?? row['Số dư ban đầu'] ?? row['Initial balance'] ?? row['Balance'];
        const initialBalance = rawBal !== undefined && rawBal !== '' ? Number(String(rawBal).replace(/[^\d.-]/g, '')) || 0 : 0;
        const rawExclude = row['Exclude From Total'] ?? row['Không tính vào tổng'] ?? row['Exclude from total'] ?? row['Exclude'];
        const excludeFromTotal = rawExclude !== undefined && rawExclude !== ''
          ? /yes|có|true|1|y/i.test(String(rawExclude).trim())
          : undefined;
        ensureAccount(name, scope, nature, initialBalance, excludeFromTotal, scope);
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
    updatedAccounts: Array.from(updatedAccountsMap.values()),
    newCategories,
  };
}

export interface CommitImportOptions {
  /** If true, cleans existing personal transactions and loads freshly from workbook */
  cleanPersonalScope?: boolean;
}

/**
 * Apply the parsed preview data into the local Zustand store (avoiding duplicates and enriching unlinked records).
 */
export function commitImport(
  data: ImportPreviewData,
  options: CommitImportOptions = {}
): { addedTxs: number; updatedTxs: number; addedTasks: number } {
  const state = useStore.getState();

  const newAccounts = data.newAccounts || [];
  const updatedAccounts = data.updatedAccounts || [];
  const updatedAccountsMap = new Map(updatedAccounts.map((a) => [a.id, a]));
  const newCategories = data.newCategories || [];

  const existingAccountNames = new Set(state.accounts.map((a) => a.name.toLowerCase().trim()));
  const existingAccountIds = new Set(state.accounts.map((a) => a.id));
  const filteredNewAccounts = newAccounts.filter(
    (a) => !existingAccountIds.has(a.id) && !existingAccountNames.has(a.name.toLowerCase().trim())
  );

  const mergedAccounts = [
    ...state.accounts.map((a) => {
      const upd = updatedAccountsMap.get(a.id);
      return upd ? { ...a, ...upd } : a;
    }),
    ...filteredNewAccounts,
  ];

  // Map incoming transactions by signature for matching/enrichment
  const incomingByKeyA = new Map<string, Transaction>();
  const incomingByKeyB = new Map<string, Transaction>();

  const allIncoming = [...data.ourWalletTxs, ...data.myWalletTxs];
  for (const t of allIncoming) {
    const keyA = `${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}_${t.scope}`;
    const keyB = `${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}`;
    if (!incomingByKeyA.has(keyA)) incomingByKeyA.set(keyA, t);
    if (!incomingByKeyB.has(keyB)) incomingByKeyB.set(keyB, t);
  }

  let finalTransactions: Transaction[] = [];
  let addedCount = 0;
  let updatedCount = 0;

  if (options.cleanPersonalScope) {
    // Keep household transactions, cleanly replace personal transactions
    const nonPersonalTxs = state.transactions.filter((t) => t.scope !== 'personal');
    const existingOurKey = new Set(
      nonPersonalTxs.map((t) => `${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}`)
    );
    const newOurTxs = data.ourWalletTxs.filter(
      (t) => !existingOurKey.has(`${t.date}_${t.amount}_${t.note.trim().toLowerCase()}_${t.type}`)
    );
    finalTransactions = [...nonPersonalTxs, ...newOurTxs, ...data.myWalletTxs];
    addedCount = newOurTxs.length + data.myWalletTxs.length;
  } else {
    // Smart merge & enrich:
    const matchedIncomingIds = new Set<string>();

    const updatedExistingTxs = state.transactions.map((existing) => {
      const keyA = `${existing.date}_${existing.amount}_${existing.note.trim().toLowerCase()}_${existing.type}_${existing.scope}`;
      const keyB = `${existing.date}_${existing.amount}_${existing.note.trim().toLowerCase()}_${existing.type}`;
      const incoming = incomingByKeyA.get(keyA) || incomingByKeyB.get(keyB);

      if (!incoming) return existing;

      matchedIncomingIds.add(incoming.id);

      let changed = false;
      const copy = { ...existing };

      if (incoming.accountId && existing.accountId !== incoming.accountId) {
        copy.accountId = incoming.accountId;
        changed = true;
      }
      if (incoming.toAccountId && existing.toAccountId !== incoming.toAccountId) {
        copy.toAccountId = incoming.toAccountId;
        changed = true;
      }
      if (incoming.categoryId && (!existing.categoryId || existing.categoryId === 'daily' || existing.categoryId === 'cat-other')) {
        copy.categoryId = incoming.categoryId;
        changed = true;
      }
      if (incoming.scope && existing.scope !== incoming.scope) {
        copy.scope = incoming.scope;
        changed = true;
      }

      if (changed) {
        updatedCount++;
        return copy;
      }
      return existing;
    });

    // Add any incoming transaction that was not matched
    const newTxs: Transaction[] = [];
    for (const t of allIncoming) {
      if (!matchedIncomingIds.has(t.id)) {
        newTxs.push(t);
      }
    }

    finalTransactions = [...updatedExistingTxs, ...newTxs];
    addedCount = newTxs.length;
  }

  // Deduplicate tasks by (title + dueDate)
  const existingTaskKey = new Set(state.tasks.map((t) => `${t.title.trim().toLowerCase()}_${t.dueDate}`));
  const newTasks = data.tasks.filter((t) => !existingTaskKey.has(`${t.title.trim().toLowerCase()}_${t.dueDate}`));

  // Deduplicate new categories
  const existingCatKeys = new Set(state.moneyCategories.map((c) => `${c.name.toLowerCase().trim()}_${c.type}`));
  const uniqueCategories = newCategories.filter((c) => !existingCatKeys.has(`${c.name.toLowerCase().trim()}_${c.type}`));

  useStore.setState({
    accounts: mergedAccounts,
    moneyCategories: [...state.moneyCategories, ...uniqueCategories],
    transactions: finalTransactions,
    tasks: [...state.tasks, ...newTasks],
  });

  return {
    addedTxs: addedCount,
    updatedTxs: updatedCount,
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
