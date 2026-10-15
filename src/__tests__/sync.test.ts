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
});
