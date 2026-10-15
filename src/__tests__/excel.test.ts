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
});
