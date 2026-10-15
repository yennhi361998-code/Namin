import { describe, it, expect, beforeEach } from 'vitest';
import { commitImport, type ImportPreviewData } from '../lib/excel';
import { useStore } from '../store';

import { createDemoSeed } from '../store/seed';

describe('Excel Import & Export Logic', () => {
  beforeEach(() => {
    // Reset store with demo seed fixtures
    useStore.setState(createDemoSeed());
  });

  it('correctly deduplicates imported transactions and tasks', () => {
    const initialState = useStore.getState();
    const existingTxCount = initialState.transactions.length;
    const existingTaskCount = initialState.tasks.length;

    // Create preview data containing 1 duplicate tx, 1 new tx, 1 duplicate task, 1 new task
    const sampleExistingTx = initialState.transactions[0];
    const sampleExistingTask = initialState.tasks[0];

    const previewData: ImportPreviewData = {
      filename: 'test_backup.xlsx',
      ourWalletTxs: [
        // Duplicate
        {
          id: 'import-tx-dup',
          householdId: initialState.household.id,
          type: sampleExistingTx.type,
          scope: sampleExistingTx.scope,
          categoryId: sampleExistingTx.categoryId,
          amount: sampleExistingTx.amount,
          date: sampleExistingTx.date,
          note: sampleExistingTx.note,
          accountId: sampleExistingTx.accountId,
          toAccountId: null,
          memberId: sampleExistingTx.memberId,
          createdAt: '',
        },
        // Brand new transaction
        {
          id: 'import-tx-new',
          householdId: initialState.household.id,
          type: 'expense',
          scope: 'household',
          categoryId: null,
          amount: 88888,
          date: '2026-10-15',
          note: 'Unique imported expense item',
          accountId: null,
          toAccountId: null,
          memberId: null,
          createdAt: '',
        },
      ],
      myWalletTxs: [],
      tasks: [
        // Duplicate
        {
          id: 'import-task-dup',
          householdId: initialState.household.id,
          title: sampleExistingTask.title,
          assigneeId: null,
          dueDate: sampleExistingTask.dueDate,
          recurrence: null,
          estimatedDuration: null,
          reminder: null,
          area: null,
          notes: '',
          completed: false,
          completedAt: null,
          nextOccurrenceId: null,
          seriesId: 's-1',
          createdAt: '',
        },
        // Brand new task
        {
          id: 'import-task-new',
          householdId: initialState.household.id,
          title: 'Brand new imported task title',
          assigneeId: null,
          dueDate: '2026-10-25',
          recurrence: null,
          estimatedDuration: null,
          reminder: null,
          area: 'Living room',
          notes: '',
          completed: false,
          completedAt: null,
          nextOccurrenceId: null,
          seriesId: 's-2',
          createdAt: '',
        },
      ],
      shoppingItems: [],
      inventoryItems: [],
    };

    const res = commitImport(previewData);

    expect(res.addedTxs).toBe(1);
    expect(res.addedTasks).toBe(1);

    const updatedState = useStore.getState();
    expect(updatedState.transactions.length).toBe(existingTxCount + 1);
    expect(updatedState.tasks.length).toBe(existingTaskCount + 1);
    expect(updatedState.transactions.some((t) => t.note === 'Unique imported expense item')).toBe(true);
    expect(updatedState.tasks.some((t) => t.title === 'Brand new imported task title')).toBe(true);
  });

  it('correctly auto-creates accounts and categories when importing workbook', async () => {
    const XLSX = await import('xlsx');
    const { parseExcelFile } = await import('../lib/excel');

    const wb = XLSX.utils.book_new();
    const accountsData = [
      { 'Account Name': 'VPBank', 'Scope': 'Personal', 'Nature': 'Asset', 'Initial Balance': 0 },
      { 'Account Name': 'The tin dung', 'Scope': 'Personal', 'Nature': 'Debt', 'Initial Balance': 0 },
    ];
    const myWalletData = [
      { 'Date': '2026-10-01', 'Type': 'EXPENSE', 'Item / Title': 'Cà phê sáng', 'Category': 'Food', 'Amount': 45000, 'Account': 'VPBank', 'To Account': '', 'Member': 'Me', 'Notes': 'cf' },
      { 'Date': '2026-10-02', 'Type': 'TRANSFER', 'Item / Title': 'Thanh toán thẻ', 'Category': '', 'Amount': 2000000, 'Account': 'VPBank', 'To Account': 'The tin dung', 'Member': 'Me', 'Notes': '' },
      { 'Date': '2026-10-03', 'Type': 'EXPENSE', 'Item / Title': 'Vé máy bay Seoul', 'Category': 'Travel', 'Amount': 5000000, 'Account': 'The tin dung', 'To Account': '', 'Member': 'Me', 'Notes': '' },
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsData), 'Accounts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(myWalletData), 'My_Wallet');

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'test_wallet.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const preview = await parseExcelFile(file);
    expect(preview.myWalletTxs.length).toBe(3);
    expect(preview.newAccounts?.length).toBeGreaterThanOrEqual(2);
    expect(preview.newCategories?.some((c) => c.name.toLowerCase() === 'travel')).toBe(true);

    const res = commitImport(preview);
    expect(res.addedTxs).toBe(3);

    const state = useStore.getState();
    expect(state.accounts.some((a) => a.name === 'VPBank')).toBe(true);
    expect(state.accounts.some((a) => a.name === 'The tin dung')).toBe(true);
    expect(state.moneyCategories.some((c) => c.name === 'Travel')).toBe(true);

    // Verify transfer toAccountId was correctly mapped
    const transferTx = state.transactions.find((t) => t.type === 'transfer' && t.amount === 2000000);
    expect(transferTx).toBeDefined();
    expect(transferTx?.accountId).toBeDefined();
    expect(transferTx?.toAccountId).toBeDefined();
  });
});
