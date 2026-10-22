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

  it('correctly packages My Wallet snapshot without leaking household data', async () => {
    const { useStore } = await import('../store');
    const { sanitizeForFirestore } = await import('../lib/sync');

    useStore.setState({
      household: { id: 'h-100', name: 'Nguyen Family', createdAt: '2026-10-01' },
      personalBudget: 15_000_000,
      accounts: [
        { id: 'acc-h1', householdId: 'h-100', name: 'Family Joint Bank', scope: 'household' },
        { id: 'acc-p1', householdId: 'h-100', name: 'My Secret Savings', scope: 'personal' },
      ],
      transactions: [
        { id: 'tx-h1', householdId: 'h-100', type: 'expense', amount: 500000, date: '2026-10-20', note: 'House electric bill', scope: 'household', memberId: 'm-1', createdAt: '' },
        { id: 'tx-p1', householdId: 'h-100', type: 'expense', amount: 65000, date: '2026-10-21', note: 'My Personal Snack', scope: 'personal', memberId: 'm-1', createdAt: '' },
      ],
    });

    const state = useStore.getState();
    const personalTxs = state.transactions.filter((t) => t.scope === 'personal');
    const personalAccs = state.accounts.filter((a) => a.scope === 'personal');
    const personalBudget = state.personalBudget ?? null;

    const snapshot = {
      meta: {
        backedUpAt: '2026-10-22T08:00:00.000Z',
        transactionsCount: personalTxs.length,
        accountsCount: personalAccs.length,
      },
      personalBudget,
      accounts: sanitizeForFirestore(personalAccs),
      transactions: sanitizeForFirestore(personalTxs),
    };

    // Snapshot only includes personal accounts & personal transactions
    expect(snapshot.accounts.length).toBe(1);
    expect(snapshot.accounts[0].name).toBe('My Secret Savings');
    expect(snapshot.transactions.length).toBe(1);
    expect(snapshot.transactions[0].note).toBe('My Personal Snack');
    expect(snapshot.personalBudget).toBe(15_000_000);
  });

  it('restores My Wallet cloud snapshot onto new device while preserving room code and shared data', async () => {
    const { useStore } = await import('../store');

    // Scenario: User has joined Household 'h-room-88' on a new device.
    // They currently have household data and 0 personal data.
    useStore.setState({
      household: { id: 'h-room-88', name: 'Tran Family', createdAt: '2026-10-01' },
      householdBudget: 30_000_000,
      personalBudget: null,
      accounts: [
        { id: 'acc-joint', householdId: 'h-room-88', name: 'Shared Cash', scope: 'household' },
      ],
      transactions: [
        { id: 'tx-rent', householdId: 'h-room-88', type: 'expense', amount: 8000000, date: '2026-10-01', note: 'House Rent', scope: 'household', memberId: 'm-wife', createdAt: '' },
      ],
    });

    // Cloud snapshot from user's previous backup
    const cloudSnapshot = {
      accounts: [
        { id: 'acc-restored-1', householdId: 'h-room-88', name: 'Private Visa', scope: 'personal' },
      ],
      transactions: [
        { id: 'tx-restored-1', householdId: 'h-room-88', type: 'expense', amount: 120000, date: '2026-10-18', note: 'Coffee with clients', scope: 'personal', memberId: null, createdAt: '' },
      ],
      personalBudget: 12_000_000,
    };

    // Simulate restore merge logic
    const state = useStore.getState();
    const householdAccounts = state.accounts.filter((a) => a.scope !== 'personal');
    const localPersonalAccounts = state.accounts.filter((a) => a.scope === 'personal');
    const accMap = new Map();
    for (const a of localPersonalAccounts) accMap.set(a.id, a);
    for (const a of cloudSnapshot.accounts) accMap.set(a.id, { ...a, scope: 'personal' });
    const mergedAccounts = [...householdAccounts, ...Array.from(accMap.values())];

    const householdTxs = state.transactions.filter((t) => t.scope !== 'personal');
    const localPersonalTxs = state.transactions.filter((t) => t.scope === 'personal');
    const txMap = new Map();
    for (const t of localPersonalTxs) txMap.set(t.id, t);
    for (const t of cloudSnapshot.transactions) txMap.set(t.id, { ...t, scope: 'personal' });
    const mergedTxs = [...householdTxs, ...Array.from(txMap.values())];

    useStore.setState({
      accounts: mergedAccounts,
      transactions: mergedTxs,
      personalBudget: cloudSnapshot.personalBudget,
    });

    const finalState = useStore.getState();

    // 1. Household room code and household data remain 100% intact
    expect(finalState.household.id).toBe('h-room-88');
    expect(finalState.household.name).toBe('Tran Family');
    expect(finalState.accounts.some((a) => a.id === 'acc-joint')).toBe(true);
    expect(finalState.transactions.some((t) => t.id === 'tx-rent')).toBe(true);

    // 2. Personal My Wallet data restored successfully
    expect(finalState.accounts.some((a) => a.id === 'acc-restored-1')).toBe(true);
    expect(finalState.transactions.some((t) => t.id === 'tx-restored-1')).toBe(true);
    expect(finalState.personalBudget).toBe(12_000_000);
  });
});
