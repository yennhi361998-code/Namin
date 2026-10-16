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

  it('updates existing Cash account scope from household to personal when specified in Accounts sheet', async () => {
    const XLSX = await import('xlsx');
    const { parseExcelFile } = await import('../lib/excel');

    // Manually force Cash to be household in store to simulate previous state
    useStore.setState((s) => ({
      accounts: s.accounts.map((a) => (a.name.toLowerCase() === 'cash' ? { ...a, scope: 'household', initialBalance: 0 } : a)),
    }));

    const preState = useStore.getState();
    const preCash = preState.accounts.find((a) => a.name.toLowerCase() === 'cash');
    expect(preCash?.scope).toBe('household');

    const wb = XLSX.utils.book_new();
    const accountsData = [
      { 'Account Name': 'Cash', 'Scope': 'Personal', 'Nature': 'Asset', 'Initial Balance': -418000, 'Current Balance': 1132000, 'Exclude From Total': 'No' },
    ];
    const myWalletData = [
      { 'Date': '2026-10-01', 'Type': 'EXPENSE', 'Item / Title': 'Bún bò', 'Category': 'Food', 'Amount': 50000, 'Account': 'Cash', 'To Account': '', 'Member': 'Me', 'Notes': '' },
    ];

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountsData), 'Accounts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(myWalletData), 'My_Wallet');

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([buffer], 'namin_cash_update.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const preview = await parseExcelFile(file);
    expect(preview.updatedAccounts?.some((a) => a.id === preCash?.id && a.scope === 'personal')).toBe(true);

    commitImport(preview);

    const postState = useStore.getState();
    const postCash = postState.accounts.find((a) => a.name.toLowerCase() === 'cash');
    expect(postCash?.scope).toBe('personal');
    expect(postCash?.initialBalance).toBe(-418000);
  });

  it('correctly imports Namin_Import_Nhi_Wallet.xlsx and calculates exact workbook balances', async () => {
    const fs = await import('fs');
    const { parseExcelFile, commitImport } = await import('../lib/excel');
    const { calculateAccountBalances } = await import('../store/selectors');

    const buffer = fs.readFileSync('Namin_Import_Nhi_Wallet.xlsx');
    const file = new File([buffer], 'Namin_Import_Nhi_Wallet.xlsx');

    const preview = await parseExcelFile(file);
    expect(preview.myWalletTxs.length).toBe(2021);
    expect(preview.newAccounts?.length).toBeGreaterThanOrEqual(13);

    const { createSeed } = await import('../store/seed');
    useStore.setState(createSeed());

    // Commit cleanly
    const result = commitImport(preview, { cleanPersonalScope: true });
    expect(result.addedTxs).toBeGreaterThanOrEqual(2021);

    const state = useStore.getState();
    const vpbank = state.accounts.find((a) => a.name === 'VPBank');
    expect(vpbank).toBeDefined();

    // Verify transactions are linked to VPBank
    const vpbankTxs = state.transactions.filter((t) => t.accountId === vpbank?.id);
    expect(vpbankTxs.length).toBeGreaterThan(1000);

    const balances = calculateAccountBalances({
      accounts: state.accounts,
      transactions: state.transactions,
      purchases: state.purchases,
    });

    // Check exact target balances matching imported workbook
    expect(balances[vpbank!.id]).toBe(16554591);

    const gold = state.accounts.find((a) => a.name.includes('Gold'));
    expect(balances[gold!.id]).toBe(530850000);

    const silver = state.accounts.find((a) => a.name.includes('Silver'));
    expect(balances[silver!.id]).toBe(158350000);

    const tikop = state.accounts.find((a) => a.name === 'Tikop');
    expect(balances[tikop!.id]).toBe(192000000);

    const cash = state.accounts.find((a) => a.name.toLowerCase() === 'cash');
    expect(balances[cash!.id]).toBe(1132000);
  });

  it('enriches and links existing transactions that previously had null accountId', async () => {
    const { commitImport } = await import('../lib/excel');

    // Simulate existing transaction with null accountId
    useStore.setState((s) => ({
      transactions: [
        {
          id: 'tx-old-unlinked',
          householdId: s.household.id,
          type: 'expense',
          scope: 'personal',
          amount: 410000,
          date: '2026-10-02',
          note: 'Cước 4G',
          accountId: null,
          memberId: null,
          createdAt: new Date().toISOString(),
        },
      ],
    }));

    const preview: ImportPreviewData = {
      filename: 'enrich_test.xlsx',
      ourWalletTxs: [],
      myWalletTxs: [
        {
          id: 'tx-incoming-linked',
          householdId: useStore.getState().household.id,
          type: 'expense',
          scope: 'personal',
          amount: 410000,
          date: '2026-10-02',
          note: 'Cước 4G',
          accountId: 'acc-real-vpbank',
          memberId: null,
          createdAt: new Date().toISOString(),
        },
      ],
      tasks: [],
      shoppingItems: [],
      inventoryItems: [],
    };

    const res = commitImport(preview, { cleanPersonalScope: false });
    expect(res.updatedTxs).toBe(1);

    const tx = useStore.getState().transactions.find((t) => t.id === 'tx-old-unlinked');
    expect(tx?.accountId).toBe('acc-real-vpbank');
  });
});



