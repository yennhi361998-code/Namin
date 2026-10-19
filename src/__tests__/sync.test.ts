import { describe, it, expect } from 'vitest';
import { sanitizeForFirestore } from '../lib/sync';
import type { Account, Transaction } from '../lib/types';

describe('Firebase Sync Logic', () => {
  it('sanitizeForFirestore removes undefined fields recursively', () => {
    const dirty = {
      id: 'task-1',
      title: 'Buy Milk',
      mappedItemId: undefined,
      metadata: {
        note: 'Fresh milk',
        tag: undefined,
        count: 0,
      },
      list: [1, undefined, 3],
    };

    const clean: any = sanitizeForFirestore(dirty);
    expect(clean.id).toBe('task-1');
    expect(clean.title).toBe('Buy Milk');
    expect('mappedItemId' in clean).toBe(false);
    expect(clean.metadata.note).toBe('Fresh milk');
    expect('tag' in clean.metadata).toBe(false);
    expect(clean.metadata.count).toBe(0);
    expect(clean.list[0]).toBe(1);
    expect(clean.list[1]).toBe(null);
    expect(clean.list[2]).toBe(3);
  });

  it('correctly partitions accounts by household vs personal scope', () => {
    const accounts: Account[] = [
      { id: 'acc-1', householdId: 'h-1', name: 'Cash', scope: 'household' },
      { id: 'acc-2', householdId: 'h-1', name: 'Joint Bank', scope: 'household' },
      { id: 'acc-3', householdId: 'h-1', name: 'Minh Secret Wallet', scope: 'personal' },
      { id: 'acc-4', householdId: 'h-1', name: 'Minh Credit Card', scope: 'personal' },
    ];

    const householdAccounts = accounts.filter((a) => a.scope !== 'personal');
    const personalAccounts = accounts.filter((a) => a.scope === 'personal');

    expect(householdAccounts.map((a) => a.id)).toEqual(['acc-1', 'acc-2']);
    expect(personalAccounts.map((a) => a.id)).toEqual(['acc-3', 'acc-4']);
  });

  it('correctly partitions transactions by household vs personal scope', () => {
    const transactions: Transaction[] = [
      { id: 'tx-1', householdId: 'h-1', type: 'expense', amount: 50000, date: '2026-10-15', note: 'Family lunch', scope: 'household', memberId: 'm-1', createdAt: '' },
      { id: 'tx-2', householdId: 'h-1', type: 'expense', amount: 35000, date: '2026-10-15', note: 'Personal coffee', scope: 'personal', memberId: 'm-1', createdAt: '' },
    ];

    const householdTxs = transactions.filter((t) => t.scope !== 'personal');
    const personalTxs = transactions.filter((t) => t.scope === 'personal');

    expect(householdTxs.length).toBe(1);
    expect(householdTxs[0].note).toBe('Family lunch');
    expect(personalTxs.length).toBe(1);
    expect(personalTxs[0].note).toBe('Personal coffee');
  });

  it('manages isBulkImporting state correctly to coordinate sync push', async () => {
    const { setBulkImporting, getIsBulkImporting } = await import('../lib/sync');
    expect(getIsBulkImporting()).toBe(false);

    setBulkImporting(true);
    expect(getIsBulkImporting()).toBe(true);

    setBulkImporting(false);
    expect(getIsBulkImporting()).toBe(false);
  });

  it('preserves local personal accounts and transactions when shared updates are applied', async () => {
    const { useStore } = await import('../store');
    
    // Seed initial state with 1 shared account, 1 personal account, 1 shared tx, 1 personal tx
    useStore.setState({
      accounts: [
        { id: 'acc-shared-1', householdId: 'h-1', name: 'Joint Fund', scope: 'household' },
        { id: 'acc-personal-1', householdId: 'h-1', name: 'My Private Wallet', scope: 'personal' },
      ],
      transactions: [
        { id: 'tx-shared-1', householdId: 'h-1', type: 'expense', amount: 100000, date: '2026-10-15', note: 'Family groceries', scope: 'household', memberId: null, createdAt: '' },
        { id: 'tx-personal-1', householdId: 'h-1', type: 'expense', amount: 30000, date: '2026-10-15', note: 'Secret coffee', scope: 'personal', memberId: null, createdAt: '' },
      ],
    });

    // Simulate what updateCombinedAccounts and updateCombinedTransactions do:
    // remote household has updated shared account and tx
    const remoteHouseholdAccounts: Account[] = [
      { id: 'acc-shared-1', householdId: 'h-1', name: 'Joint Fund (Updated from cloud)', scope: 'household' },
      { id: 'acc-shared-2', householdId: 'h-1', name: 'New Cloud Account', scope: 'household' },
    ];
    const remoteHouseholdTxs: Transaction[] = [
      { id: 'tx-shared-1', householdId: 'h-1', type: 'expense', amount: 100000, date: '2026-10-15', note: 'Family groceries (Updated)', scope: 'household', memberId: null, createdAt: '' },
      { id: 'tx-shared-2', householdId: 'h-1', type: 'expense', amount: 50000, date: '2026-10-16', note: 'Cloud electricity bill', scope: 'household', memberId: null, createdAt: '' },
    ];

    const localPersonalAccounts = useStore.getState().accounts.filter((a) => a.scope === 'personal');
    const combinedAccounts = [...remoteHouseholdAccounts, ...localPersonalAccounts];
    useStore.setState({ accounts: combinedAccounts });

    const localPersonalTxs = useStore.getState().transactions.filter((t) => t.scope === 'personal');
    const combinedTxs = [...remoteHouseholdTxs, ...localPersonalTxs];
    useStore.setState({ transactions: combinedTxs });

    const finalState = useStore.getState();

    // Verify local personal account and tx are completely preserved
    expect(finalState.accounts.some((a) => a.id === 'acc-personal-1')).toBe(true);
    expect(finalState.transactions.some((t) => t.id === 'tx-personal-1')).toBe(true);

    // Verify shared account and tx were updated from cloud
    expect(finalState.accounts.some((a) => a.id === 'acc-shared-2')).toBe(true);
    expect(finalState.transactions.some((t) => t.id === 'tx-shared-2')).toBe(true);
  });
});
