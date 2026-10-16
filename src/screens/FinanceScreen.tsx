import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LedgerRow } from '../components/rows';
import { BrandHeader, Fab, PillTabs, ScreenTitle } from '../components/shell';
import { Card, CategoryIcon, cx, EmptyState, Icon, MemberAvatar, ProgressBar } from '../components/ui';
import { MoneyDonut, sharePct, type Slice } from '../components/money';
import {
  type DateFilterSelection,
  getCurrentCycleMonthKey,
  getDisplayRangeLabel,
  getSavedMonthStartDay,
  resolveDateRange,
  saveMonthStartDay,
  shiftDateSelection,
} from '../lib/dateRanges';
import { shortWeekday, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { CHART_COLORS, DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import type { DateStr, FinanceScope, LedgerEntry, TxType } from '../lib/types';
import { AccountSheet } from '../sheets/AccountSheet';
import { ChartBreakdownSheet, type ChartBreakdownSlice } from '../sheets/ChartBreakdownSheet';
import { TransactionDetailSheet } from '../sheets/TransactionDetailSheet';
import { useStore } from '../store';
import { moneyEntries, useAccountBalances } from '../store/selectors';
import { openSheet } from '../store/ui';

function TimeRangeBar({
  label,
  onPrev,
  onNext,
  onOpenSheet,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onOpenSheet: () => void;
}) {
  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous period"
          className="w-8 h-8 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors cursor-pointer"
        >
          <Icon name="chevron_left" className="text-[18px]" />
        </button>

        <button
          type="button"
          onClick={onOpenSheet}
          className="relative flex items-center justify-center px-6 py-1 rounded-xl hover:bg-canvas active:bg-soft transition-colors text-label-md font-semibold text-ink cursor-pointer"
        >
          <span>{label}</span>
          <Icon name="expand_more" className="absolute right-1 text-[16px] text-ink-sub pointer-events-none" />
        </button>

        <button
          type="button"
          onClick={onNext}
          aria-label="Next period"
          className="w-8 h-8 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors cursor-pointer"
        >
          <Icon name="chevron_right" className="text-[18px]" />
        </button>
      </div>
    </div>
  );
}

function stripDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function matchesSearch(query: string, ...targets: (string | null | undefined)[]): boolean {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return true;
  const strippedQ = stripDiacritics(cleanQ);

  return targets.some((target) => {
    if (!target) return false;
    const lower = target.toLowerCase();
    if (lower.includes(cleanQ)) return true;
    const stripped = stripDiacritics(lower);
    return stripped.includes(strippedQ);
  });
}

export function FinanceScreen({
  scope,
  title,
}: {
  scope: FinanceScope;
  title: string;
  subtitle?: string;
}) {
  const navigate = useNavigate();
  const purchases = useStore((s) => s.purchases);
  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);
  const items = useStore((s) => s.items ?? []);
  const householdBudget = useStore((s) => s.householdBudget);
  const personalBudget = useStore((s) => s.personalBudget);

  const accountBalances = useAccountBalances();

  const [viewMode, setViewMode] = useState<'details' | 'account' | 'chart'>('details');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);
  const [selectedBreakdownSlice, setSelectedBreakdownSlice] = useState<ChartBreakdownSlice | null>(null);
  const [chartType, setChartType] = useState<TxType>('expense');
  const [chartGroupBy, setChartGroupBy] = useState<'category' | 'account' | 'member'>('category');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllTime, setSearchAllTime] = useState(false);

  const [isAccountSheetOpen, setIsAccountSheetOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | undefined>(undefined);

  const [monthStartDay, setMonthStartDay] = useState<number>(() => getSavedMonthStartDay());
  const initialCycleKey = useMemo(() => getCurrentCycleMonthKey(today(), monthStartDay), [monthStartDay]);
  const [selection, setSelection] = useState<DateFilterSelection>(() => ({
    mode: 'month',
    monthKey: initialCycleKey,
  }));

  const [startDate, endDate] = useMemo(() => {
    return resolveDateRange(selection, monthStartDay);
  }, [selection, monthStartDay]);

  const accountsMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const moneyCategoriesMap = useMemo(() => new Map(moneyCategories.map((c) => [c.id, c])), [moneyCategories]);
  const itemsMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Scoped accounts
  const scopedAccounts = useMemo(() => {
    return accounts.filter((a) => (scope === 'household' ? a.scope !== 'personal' : a.scope === 'personal'));
  }, [accounts, scope]);

  // Group scoped accounts by Asset vs Loan / Debt
  const assetAccounts = useMemo(() => {
    return scopedAccounts.filter((a) => a.nature !== 'debt');
  }, [scopedAccounts]);

  const debtAccounts = useMemo(() => {
    return scopedAccounts.filter((a) => a.nature === 'debt');
  }, [scopedAccounts]);

  // Purchases belong to household only
  const filteredPurchases = useMemo(() => {
    if (scope !== 'household') return [];
    return purchases.filter((p) => {
      if (startDate && p.purchaseDate < startDate) return false;
      if (endDate && p.purchaseDate > endDate) return false;
      return true;
    });
  }, [purchases, startDate, endDate, scope]);

  // Filter transactions matching scope and date range
  const scopedTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (startDate && t.date < startDate) return false;
      if (endDate && t.date > endDate) return false;

      const acc = t.accountId ? accountsMap.get(t.accountId) : undefined;
      const toAcc = t.toAccountId ? accountsMap.get(t.toAccountId) : undefined;

      if (t.type === 'transfer') {
        const fromScope = acc?.scope ?? 'household';
        const toScope = toAcc?.scope ?? 'household';
        if (scope === 'household') {
          return fromScope === 'household' || toScope === 'household';
        } else {
          return fromScope === 'personal' || toScope === 'personal';
        }
      }

      if (scope === 'household') {
        return (t.scope === 'household' || !t.scope) && acc?.scope !== 'personal';
      } else {
        return t.scope === 'personal' || acc?.scope === 'personal';
      }
    });
  }, [transactions, startDate, endDate, scope, accountsMap]);

  // Calculate total spent for this period
  const totalSpent = useMemo(() => {
    const purchaseSum = filteredPurchases.reduce((sum, p) => sum + (p.price ?? 0), 0);
    const txExpenseSum = scopedTransactions
      .filter((t) => {
        if (t.type === 'expense') return true;
        // In personal view, cross-scope transfer to household is an outflow
        if (t.type === 'transfer') {
          const fromAcc = t.accountId ? accountsMap.get(t.accountId) : undefined;
          const toAcc = t.toAccountId ? accountsMap.get(t.toAccountId) : undefined;
          if (scope === 'personal' && fromAcc?.scope === 'personal' && toAcc?.scope !== 'personal') return true;
          if (scope === 'household' && fromAcc?.scope !== 'personal' && toAcc?.scope === 'personal') return true;
        }
        return false;
      })
      .reduce((sum, t) => sum + t.amount, 0);
    return purchaseSum + txExpenseSum;
  }, [filteredPurchases, scopedTransactions, scope, accountsMap]);

  // Calculate total income for this period
  const totalIncome = useMemo(() => {
    return scopedTransactions
      .filter((t) => {
        if (t.type === 'income') return true;
        // Inbound cross-scope transfer
        if (t.type === 'transfer') {
          const fromAcc = t.accountId ? accountsMap.get(t.accountId) : undefined;
          const toAcc = t.toAccountId ? accountsMap.get(t.toAccountId) : undefined;
          if (scope === 'household' && fromAcc?.scope === 'personal' && toAcc?.scope !== 'personal') return true;
          if (scope === 'personal' && fromAcc?.scope !== 'personal' && toAcc?.scope === 'personal') return true;
        }
        return false;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [scopedTransactions, scope, accountsMap]);

  const netPeriod = totalIncome - totalSpent;

  // Monthly budget
  const currentBudget = scope === 'household' ? householdBudget : personalBudget;
  const budgetRatio = currentBudget && currentBudget > 0 ? totalSpent / currentBudget : 0;
  const budgetPct = Math.round(budgetRatio * 100);

  // All ledger entries for this period and scope
  const allEntries: LedgerEntry[] = useMemo(() => {
    const purchaseEntries: LedgerEntry[] = filteredPurchases
      .filter((p) => p.price != null)
      .map((p) => ({
        id: `pur-${p.id}`,
        kind: 'purchase',
        type: 'expense',
        scope: 'household',
        amount: p.price ?? 0,
        date: p.purchaseDate,
        itemName: p.itemName,
        categoryId: p.spendCategoryId || DAILY_CATEGORY_ID,
        accountId: p.accountId,
        memberId: p.memberId,
        notes: p.notes || p.store,
        itemId: p.itemId,
        createdAt: p.createdAt,
        rawPurchase: p,
      }));

    const transactionEntries: LedgerEntry[] = scopedTransactions.map((t) => {
      const cat = t.categoryId ? moneyCategoriesMap.get(t.categoryId) : undefined;
      const linkedItem = t.itemId ? itemsMap.get(t.itemId) : undefined;
      const defaultName = linkedItem?.name || cat?.name || (t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense');
      return {
        id: `tx-${t.id}`,
        kind: 'transaction',
        type: t.type,
        scope: t.scope ?? 'household',
        amount: t.amount,
        date: t.date,
        itemName: t.note || defaultName,
        categoryId: t.categoryId ?? (t.type === 'expense' ? DAILY_CATEGORY_ID : null),
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        memberId: t.memberId,
        notes: t.note,
        itemId: t.itemId ?? undefined,
        createdAt: t.createdAt,
        rawTransaction: t,
      };
    });

    return [...purchaseEntries, ...transactionEntries];
  }, [filteredPurchases, scopedTransactions, moneyCategoriesMap, itemsMap]);

  // All ledger entries across all time for this scope (used when searching all-time)
  const allTimeEntries: LedgerEntry[] = useMemo(() => {
    const purchaseEntries: LedgerEntry[] = (scope === 'household' ? purchases : [])
      .filter((p) => p.price != null)
      .map((p) => ({
        id: `pur-${p.id}`,
        kind: 'purchase',
        type: 'expense',
        scope: 'household',
        amount: p.price ?? 0,
        date: p.purchaseDate,
        itemName: p.itemName,
        categoryId: p.spendCategoryId || DAILY_CATEGORY_ID,
        accountId: p.accountId,
        memberId: p.memberId,
        notes: p.notes || p.store,
        itemId: p.itemId,
        createdAt: p.createdAt,
        rawPurchase: p,
      }));

    const transactionEntries: LedgerEntry[] = transactions
      .filter((t) => {
        const acc = t.accountId ? accountsMap.get(t.accountId) : undefined;
        const toAcc = t.toAccountId ? accountsMap.get(t.toAccountId) : undefined;
        if (t.type === 'transfer') {
          const fromScope = acc?.scope ?? 'household';
          const toScope = toAcc?.scope ?? 'household';
          return scope === 'household'
            ? fromScope === 'household' || toScope === 'household'
            : fromScope === 'personal' || toScope === 'personal';
        }
        if (scope === 'household') {
          return (t.scope === 'household' || !t.scope) && acc?.scope !== 'personal';
        } else {
          return t.scope === 'personal' || acc?.scope === 'personal';
        }
      })
      .map((t) => {
        const cat = t.categoryId ? moneyCategoriesMap.get(t.categoryId) : undefined;
        const linkedItem = t.itemId ? itemsMap.get(t.itemId) : undefined;
        const defaultName = linkedItem?.name || cat?.name || (t.type === 'transfer' ? 'Transfer' : t.type === 'income' ? 'Income' : 'Expense');
        return {
          id: `tx-${t.id}`,
          kind: 'transaction',
          type: t.type,
          scope: t.scope ?? 'household',
          amount: t.amount,
          date: t.date,
          itemName: t.note || defaultName,
          categoryId: t.categoryId ?? (t.type === 'expense' ? DAILY_CATEGORY_ID : null),
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          memberId: t.memberId,
          notes: t.note,
          itemId: t.itemId ?? undefined,
          createdAt: t.createdAt,
          rawTransaction: t,
        };
      });

    return [...purchaseEntries, ...transactionEntries];
  }, [purchases, transactions, scope, accountsMap, moneyCategoriesMap, itemsMap]);

  // Filter entries in Details mode if searching (matches on Item Name only)
  const effectiveDetailsEntries = useMemo(() => {
    if (!isSearchOpen || !searchQuery.trim()) return allEntries;
    const base = searchAllTime ? allTimeEntries : allEntries;

    return base.filter((e) => {
      return matchesSearch(searchQuery, e.itemName);
    });
  }, [allEntries, allTimeEntries, isSearchOpen, searchAllTime, searchQuery]);

  // Group ledger entries by day
  const dayGroups = useMemo(() => {
    const byDate = new Map<DateStr, LedgerEntry[]>();
    for (const entry of effectiveDetailsEntries) {
      const list = byDate.get(entry.date) ?? [];
      list.push(entry);
      byDate.set(entry.date, list);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return sortedDates.map((d) => {
      const entries = byDate.get(d) ?? [];

      entries.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      const dayExpense = entries
        .filter((e) => {
          if (e.type === 'expense') return true;
          if (e.type === 'transfer') {
            const fromAcc = e.accountId ? accountsMap.get(e.accountId) : undefined;
            const toAcc = e.toAccountId ? accountsMap.get(e.toAccountId) : undefined;
            if (scope === 'personal' && fromAcc?.scope === 'personal' && toAcc?.scope !== 'personal') return true;
            if (scope === 'household' && fromAcc?.scope !== 'personal' && toAcc?.scope === 'personal') return true;
          }
          return false;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const dayIncome = entries
        .filter((e) => {
          if (e.type === 'income') return true;
          if (e.type === 'transfer') {
            const fromAcc = e.accountId ? accountsMap.get(e.accountId) : undefined;
            const toAcc = e.toAccountId ? accountsMap.get(e.toAccountId) : undefined;
            if (scope === 'household' && fromAcc?.scope === 'personal' && toAcc?.scope !== 'personal') return true;
            if (scope === 'personal' && fromAcc?.scope !== 'personal' && toAcc?.scope === 'personal') return true;
          }
          return false;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const parts = d.split('-').map(Number);
      const dayLabel = `${shortWeekday(d)}, ${parts[1]}/${parts[2]}`;

      return {
        date: d,
        dayLabel,
        dayExpense,
        dayIncome,
        entries,
      };
    });
  }, [effectiveDetailsEntries, scope, accountsMap]);

  const displayRangeLabel = useMemo(() => {
    return getDisplayRangeLabel(selection, startDate, endDate, monthStartDay);
  }, [selection, startDate, endDate, monthStartDay]);

  const handlePrevRange = () => {
    setSelection((prev) => shiftDateSelection(prev, -1, monthStartDay));
  };

  const handleNextRange = () => {
    setSelection((prev) => shiftDateSelection(prev, 1, monthStartDay));
  };

  const handleOpenDateSheet = () => {
    openSheet({
      type: 'date-filter',
      initialSelection: selection,
      initialMonthStartDay: monthStartDay,
      onApply: (newSelection, newStartDay) => {
        setSelection(newSelection);
        if (newStartDay !== monthStartDay) {
          setMonthStartDay(newStartDay);
          saveMonthStartDay(newStartDay);
        }
      },
    });
  };

  // Account Mode: Net Worth, Assets, Debts
  const { totalAssets, totalDebts, netWorth } = useMemo(() => {
    let assets = 0;
    let debts = 0;
    for (const acc of scopedAccounts) {
      if (acc.excludeFromTotal) continue;
      const bal = accountBalances[acc.id] ?? 0;
      if (acc.nature === 'debt') {
        debts += bal < 0 ? Math.abs(bal) : bal;
      } else {
        assets += bal;
      }
    }
    return {
      totalAssets: assets,
      totalDebts: debts,
      netWorth: assets - debts,
    };
  }, [scopedAccounts, accountBalances]);

  // Selected Wallet Drilldown
  const selectedWallet = useMemo(() => {
    if (!selectedWalletId) return null;
    return accounts.find((a) => a.id === selectedWalletId) ?? null;
  }, [accounts, selectedWalletId]);

  const walletEntries = useMemo(() => {
    if (!selectedWalletId) return [];
    return allEntries.filter((e) => e.accountId === selectedWalletId || e.toAccountId === selectedWalletId);
  }, [allEntries, selectedWalletId]);

  const walletDayGroups = useMemo(() => {
    if (!selectedWalletId) return [];
    const byDate = new Map<DateStr, LedgerEntry[]>();
    for (const entry of walletEntries) {
      const list = byDate.get(entry.date) ?? [];
      list.push(entry);
      byDate.set(entry.date, list);
    }

    const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

    return sortedDates.map((d) => {
      const entries = byDate.get(d) ?? [];
      entries.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });

      const dayOutflow = entries
        .filter((e) => {
          if (e.type === 'expense' && e.accountId === selectedWalletId) return true;
          if (e.type === 'transfer' && e.accountId === selectedWalletId) return true;
          return false;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const dayInflow = entries
        .filter((e) => {
          if (e.type === 'income' && e.accountId === selectedWalletId) return true;
          if (e.type === 'transfer' && e.toAccountId === selectedWalletId) return true;
          return false;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const parts = d.split('-').map(Number);
      const dayLabel = `${shortWeekday(d)}, ${parts[1]}/${parts[2]}`;

      return {
        date: d,
        dayLabel,
        dayOutflow,
        dayInflow,
        entries,
      };
    });
  }, [walletEntries, selectedWalletId]);

  const walletInflow = useMemo(() => {
    if (!selectedWalletId) return 0;
    return walletEntries
      .filter((e) => (e.type === 'income' && e.accountId === selectedWalletId) || (e.type === 'transfer' && e.toAccountId === selectedWalletId))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [walletEntries, selectedWalletId]);

  const walletOutflow = useMemo(() => {
    if (!selectedWalletId) return 0;
    return walletEntries
      .filter((e) => (e.type === 'expense' && e.accountId === selectedWalletId) || (e.type === 'transfer' && e.accountId === selectedWalletId))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [walletEntries, selectedWalletId]);

  // Chart entries calculation
  const chartEntries = useMemo(() => {
    const rawEntries = moneyEntries(
      {
        transactions: scopedTransactions,
        purchases: filteredPurchases,
        moneyCategories,
      },
      chartType
    );
    return rawEntries.filter((e) => {
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });
  }, [scopedTransactions, filteredPurchases, moneyCategories, chartType, startDate, endDate]);

  const chartTotal = useMemo(() => chartEntries.reduce((sum, e) => sum + e.amount, 0), [chartEntries]);

  const effectiveGroupBy = scope === 'personal' && chartGroupBy === 'member' ? 'category' : chartGroupBy;

  const chartSlices: (Slice & { count: number })[] = useMemo(() => {
    if (chartTotal === 0) return [];

    if (effectiveGroupBy === 'category') {
      const groups = new Map<string, { total: number; count: number }>();
      for (const e of chartEntries) {
        const catId = e.categoryId ?? 'unassigned';
        const cur = groups.get(catId) ?? { total: 0, count: 0 };
        groups.set(catId, { total: cur.total + e.amount, count: cur.count + 1 });
      }
      return [...groups.entries()]
        .map(([catId, data]) => {
          const cat = moneyCategories.find((c) => c.id === catId);
          return {
            key: catId,
            name: cat?.name ?? 'Other',
            icon: cat?.icon ?? 'package',
            color: cat?.color ?? '#94A3B8',
            total: data.total,
            count: data.count,
            share: data.total / chartTotal,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    if (effectiveGroupBy === 'account') {
      const groups = new Map<string | null, { total: number; count: number }>();
      for (const e of chartEntries) {
        const key = e.accountId ?? null;
        const cur = groups.get(key) ?? { total: 0, count: 0 };
        groups.set(key, { total: cur.total + e.amount, count: cur.count + 1 });
      }
      return [...groups.entries()]
        .map(([accId, data], idx) => {
          const acc = accId ? accounts.find((a) => a.id === accId) : undefined;
          const fallbackColor = CHART_COLORS[idx % CHART_COLORS.length];
          return {
            key: accId ?? 'unassigned',
            name: acc?.name ?? 'Unassigned account',
            icon: acc?.icon ?? 'account_balance_wallet',
            color: acc?.color ?? fallbackColor,
            total: data.total,
            count: data.count,
            share: data.total / chartTotal,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    if (effectiveGroupBy === 'member') {
      const groups = new Map<string | null, { total: number; count: number }>();
      for (const e of chartEntries) {
        const memId = e.memberId ?? null;
        const cur = groups.get(memId) ?? { total: 0, count: 0 };
        groups.set(memId, { total: cur.total + e.amount, count: cur.count + 1 });
      }
      return [...groups.entries()]
        .map(([memId, data], idx) => {
          const m = memId ? members.find((x) => x.id === memId) : undefined;
          const color = CHART_COLORS[idx % CHART_COLORS.length];
          return {
            key: memId ?? 'shared',
            name: m?.name ?? 'All household',
            icon: m ? undefined : 'group',
            avatar: m ? <MemberAvatar member={m} size={28} /> : undefined,
            color,
            total: data.total,
            count: data.count,
            share: data.total / chartTotal,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    return [];
  }, [chartEntries, chartTotal, effectiveGroupBy, moneyCategories, accounts, members]);

  // Filtered transactions for the currently clicked breakdown slice
  const breakdownEntries = useMemo(() => {
    if (!selectedBreakdownSlice) return [];
    return allEntries
      .filter((e) => {
        if (e.type !== chartType) return false;
        if (effectiveGroupBy === 'category') {
          const catId = e.categoryId ?? 'unassigned';
          return catId === selectedBreakdownSlice.key;
        }
        if (effectiveGroupBy === 'account') {
          const accId = e.accountId ?? 'unassigned';
          return accId === selectedBreakdownSlice.key;
        }
        if (effectiveGroupBy === 'member') {
          const memId = e.memberId ?? 'shared';
          return memId === selectedBreakdownSlice.key;
        }
        return false;
      })
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id.localeCompare(a.id);
      });
  }, [allEntries, selectedBreakdownSlice, chartType, effectiveGroupBy]);

  return (
    <>
      <BrandHeader />
      <Fab
        label="Add expense"
        onClick={() => openSheet({ type: 'transaction', txType: 'expense', scope })}
      />
      <ScreenTitle
        title={title}
        action={
          <PillTabs
            label="View mode"
            value={viewMode}
            size="sm"
            onChange={(m) => {
              setViewMode(m);
              setSelectedWalletId(null);
              setIsSearchOpen(false);
              setSearchQuery('');
              setSearchAllTime(false);
            }}
            options={[
              { value: 'details', label: 'Details' },
              { value: 'account', label: 'Account' },
              { value: 'chart', label: 'Chart' },
            ]}
          />
        }
      />

      <div className="flex flex-col gap-space-lg">
        {/* ============================================================== */}
        {/* 1. DETAILS MODE                                                */}
        {/* ============================================================== */}
        {viewMode === 'details' && (
          <div className="flex flex-col gap-2.5">
            {/* Unified Details Header Card */}
            <Card className="p-3 flex flex-col gap-2 bg-surface rounded-xl shadow-card">
              <TimeRangeBar
                label={displayRangeLabel}
                onPrev={handlePrevRange}
                onNext={handleNextRange}
                onOpenSheet={handleOpenDateSheet}
              />

              {/* Income and Expense horizontally aligned */}
              <div className="pt-1 grid grid-cols-2 divide-x divide-line/40 text-center">
                <div className="flex flex-col items-center px-2">
                  <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Income</span>
                  <span className="text-[16px] sm:text-[18px] leading-snug font-bold text-done-ink tabular-nums mt-0.5">
                    + {formatVnd(totalIncome)}
                  </span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Expense</span>
                  <span className="text-[16px] sm:text-[18px] leading-snug font-bold text-err-ink tabular-nums mt-0.5">
                    - {formatVnd(totalSpent)}
                  </span>
                </div>
              </div>

              {/* Net Text */}
              <div className="pt-1.5 border-t border-line/40 flex items-center justify-center text-[12px]">
                <span className="text-ink-sub mr-1.5">Net:</span>
                <span className={cx('font-bold tabular-nums', netPeriod >= 0 ? 'text-done-ink' : 'text-err-ink')}>
                  {netPeriod >= 0 ? `+ ${formatVnd(netPeriod)}` : `- ${formatVnd(Math.abs(netPeriod))}`}
                </span>
              </div>

              {/* Budget Progress Bar: Only shown if user configured a budget in Settings */}
              {currentBudget != null && currentBudget > 0 ? (
                <div className="pt-1.5 border-t border-line/40 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-sub font-medium">Monthly budget</span>
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className="text-sky hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Settings</span>
                      <Icon name="chevron_right" className="text-[13px]" />
                    </button>
                  </div>
                  <ProgressBar value={budgetRatio} label={`Budget ${budgetPct}%`} />
                  <div className="flex items-center justify-between text-[11px] text-ink-sub">
                    <span>{budgetPct}% of budget</span>
                    <span className="tabular-nums font-medium text-ink">
                      {formatVnd(totalSpent)} / {formatVnd(currentBudget)}
                    </span>
                  </div>
                </div>
              ) : null}
            </Card>

            {/* Search Header / Search Input Field */}
            {isSearchOpen ? (
              <div className="flex flex-col gap-2">
                <div className="relative flex items-center w-full">
                  <Icon name="search" className="text-[18px] text-ink-sub absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchQuery('');
                        setIsSearchOpen(false);
                        setSearchAllTime(false);
                      }
                    }}
                    placeholder="Search by item name..."
                    autoFocus
                    className="w-full h-11 pl-10 pr-10 bg-surface rounded-2xl border border-line text-body-md text-ink placeholder:text-ink-sub/60 focus:outline-none focus:border-sky-dark focus:ring-2 focus:ring-sky/20 shadow-2xs transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchOpen(false);
                      setSearchAllTime(false);
                    }}
                    className="absolute right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-ink-sub hover:text-ink hover:bg-soft active:bg-soft transition-colors cursor-pointer"
                    aria-label="Close search"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                </div>

                <div className="flex items-center justify-between px-1 text-caption text-ink-sub">
                  <span>
                    {searchQuery.trim()
                      ? `${effectiveDetailsEntries.length} ${effectiveDetailsEntries.length === 1 ? 'transaction' : 'transactions'} found`
                      : 'Type to filter by item name'}
                  </span>
                  {searchQuery.trim() && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSearchAllTime(false)}
                        className={cx(
                          'px-2.5 py-0.5 rounded-full text-caption transition-colors cursor-pointer',
                          !searchAllTime ? 'bg-header text-header-ink font-semibold shadow-xs' : 'text-ink-sub hover:text-ink'
                        )}
                      >
                        This period
                      </button>
                      <button
                        type="button"
                        onClick={() => setSearchAllTime(true)}
                        className={cx(
                          'px-2.5 py-0.5 rounded-full text-caption transition-colors cursor-pointer',
                          searchAllTime ? 'bg-header text-header-ink font-semibold shadow-xs' : 'text-ink-sub hover:text-ink'
                        )}
                      >
                        All time
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-1">
                <span className="text-caption font-semibold text-ink-sub uppercase tracking-wider">
                  Transactions ({allEntries.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search transactions"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-ink-sub hover:text-ink hover:bg-surface active:bg-soft transition-colors cursor-pointer"
                >
                  <Icon name="search" className="text-[18px]" />
                </button>
              </div>
            )}

            {/* Daily Grouped Transactions List */}
            {dayGroups.length === 0 ? (
              <EmptyState
                message={
                  isSearchOpen && searchQuery.trim()
                    ? `No transactions matching "${searchQuery}" found.`
                    : 'No transactions found for the selected period.'
                }
                action={
                  isSearchOpen && searchQuery.trim()
                    ? !searchAllTime
                      ? { label: 'Search all time', onClick: () => setSearchAllTime(true) }
                      : {
                          label: 'Clear search',
                          onClick: () => {
                            setSearchQuery('');
                            setIsSearchOpen(false);
                            setSearchAllTime(false);
                          },
                        }
                    : { label: 'Add transaction', onClick: () => openSheet({ type: 'transaction', scope }) }
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                {dayGroups.map((dayGroup) => (
                  <div
                    key={dayGroup.date}
                    className="bg-surface rounded-xl shadow-card border border-line/40 overflow-hidden divide-y divide-line/20"
                  >
                    {/* Day Header */}
                    <div className="px-3 py-1.5 bg-soft/30 border-b border-line/30 flex items-center justify-between gap-2 select-none">
                      <div className="font-semibold text-[12px] text-ink">
                        <span>{dayGroup.dayLabel}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0 text-ink-sub font-normal">
                        {dayGroup.dayIncome > 0 && (
                          <span>Income: {formatVnd(dayGroup.dayIncome)}</span>
                        )}
                        {dayGroup.dayExpense > 0 && (
                          <span>Expense: {formatVnd(dayGroup.dayExpense)}</span>
                        )}
                      </div>
                    </div>

                    {/* Day Rows */}
                    {dayGroup.entries.map((entry) => {
                      const moneyCat = entry.categoryId
                        ? moneyCategories.find((c) => c.id === entry.categoryId)
                        : undefined;
                      const acc = entry.accountId ? accounts.find((a) => a.id === entry.accountId) : undefined;
                      const toAcc = entry.toAccountId ? accounts.find((a) => a.id === entry.toAccountId) : undefined;
                      const mem = entry.memberId ? members.find((m) => m.id === entry.memberId) : undefined;
                      const accountName =
                        entry.type === 'transfer'
                          ? acc && toAcc
                            ? `${acc.name} → ${toAcc.name}`
                            : acc?.name || toAcc?.name || 'Transfer'
                          : acc?.name;

                      return (
                        <LedgerRow
                          key={entry.id}
                          entry={entry}
                          moneyCategory={moneyCat}
                          accountName={accountName}
                          memberName={mem?.name}
                          onOpen={() => {
                            setSelectedEntry(entry);
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. ACCOUNT MODE                                                */}
        {/* ============================================================== */}
        {viewMode === 'account' && (
          selectedWallet ? (
            /* Selected Wallet Drilldown View */
            <div className="flex flex-col gap-space-md">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSelectedWalletId(null)}
                  className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-sky hover:underline cursor-pointer"
                >
                  <Icon name="chevron_left" className="text-[18px]" />
                  <span>Back to all wallets</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAccountId(selectedWallet.id)}
                  className="text-body-sm text-ink-sub hover:text-ink flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Icon name="edit" className="text-[15px]" />
                  <span>Edit</span>
                </button>
              </div>

              {/* Wallet Header Card */}
              <Card className="p-space-md flex flex-col gap-3 bg-surface rounded-2xl shadow-card">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-2xs"
                      style={{ backgroundColor: `${selectedWallet.color || '#3FA88B'}20` }}
                    >
                      <Icon name={(selectedWallet.icon as any) || 'payments'} className="text-[22px]" style={{ color: selectedWallet.color || '#3FA88B' }} />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-title-sm font-bold text-ink truncate">{selectedWallet.name}</span>
                        <span className={cx(
                          'text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider',
                          selectedWallet.nature === 'debt' ? 'bg-err-soft text-err-ink' : 'bg-done-soft text-done-ink'
                        )}>
                          {selectedWallet.nature === 'debt' ? 'Debt' : 'Asset'}
                        </span>
                        {selectedWallet.excludeFromTotal && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Excluded from total
                          </span>
                        )}
                      </div>
                      <span className="text-caption text-ink-sub">Current balance</span>
                    </div>
                  </div>
                  <span className="text-title-md font-bold text-ink tabular-nums">
                    {formatVnd(accountBalances[selectedWallet.id] ?? 0)}
                  </span>
                </div>
              </Card>

              {/* Time Range Card & Wallet Flow */}
              <Card className="p-3 flex flex-col gap-2 bg-surface rounded-xl shadow-card">
                <TimeRangeBar
                  label={displayRangeLabel}
                  onPrev={handlePrevRange}
                  onNext={handleNextRange}
                  onOpenSheet={handleOpenDateSheet}
                />
                <div className="pt-1.5 border-t border-line/40 grid grid-cols-2 divide-x divide-line/40 text-center">
                  <div className="flex flex-col items-center px-2">
                    <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Inflow</span>
                    <span className="text-[15px] font-bold text-done-ink tabular-nums mt-0.5">
                      + {formatVnd(walletInflow)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center px-2">
                    <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Outflow</span>
                    <span className="text-[15px] font-bold text-err-ink tabular-nums mt-0.5">
                      - {formatVnd(walletOutflow)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Wallet Transactions List */}
              {walletDayGroups.length === 0 ? (
                <EmptyState
                  message="No transactions found for this wallet in the selected period."
                  action={{ label: 'Add transaction', onClick: () => openSheet({ type: 'transaction', scope }) }}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {walletDayGroups.map((dayGroup) => (
                    <div
                      key={dayGroup.date}
                      className="bg-surface rounded-xl shadow-card border border-line/40 overflow-hidden divide-y divide-line/20"
                    >
                      <div className="px-3 py-1.5 bg-soft/30 border-b border-line/30 flex items-center justify-between gap-2 select-none">
                        <div className="font-semibold text-[12px] text-ink">
                          <span>{dayGroup.dayLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] tabular-nums shrink-0 text-ink-sub font-normal">
                          {dayGroup.dayInflow > 0 && (
                            <span>Inflow: {formatVnd(dayGroup.dayInflow)}</span>
                          )}
                          {dayGroup.dayOutflow > 0 && (
                            <span>Outflow: {formatVnd(dayGroup.dayOutflow)}</span>
                          )}
                        </div>
                      </div>

                      {dayGroup.entries.map((entry) => {
                        const moneyCat = entry.categoryId
                          ? moneyCategories.find((c) => c.id === entry.categoryId)
                          : undefined;
                        const acc = entry.accountId ? accounts.find((a) => a.id === entry.accountId) : undefined;
                        const toAcc = entry.toAccountId ? accounts.find((a) => a.id === entry.toAccountId) : undefined;
                        const mem = entry.memberId ? members.find((m) => m.id === entry.memberId) : undefined;
                        const accountName =
                          entry.type === 'transfer'
                            ? acc && toAcc
                              ? `${acc.name} → ${toAcc.name}`
                              : acc?.name || toAcc?.name || 'Transfer'
                            : acc?.name;

                        return (
                          <LedgerRow
                            key={entry.id}
                            entry={entry}
                            moneyCategory={moneyCat}
                            accountName={accountName}
                            memberName={mem?.name}
                            onOpen={() => {
                              setSelectedEntry(entry);
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* All Wallets List View Grouped by Asset / Loan */
            <div className="flex flex-col gap-2.5">
              {/* Net Worth Top Card */}
              <Card className="p-3 flex flex-col gap-2 bg-surface rounded-xl shadow-card">
                <div className="flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Net Worth</span>
                  <span className={cx(
                    'text-[22px] sm:text-[24px] font-bold tracking-tight tabular-nums mt-0.5',
                    netWorth >= 0 ? 'text-ink' : 'text-err-ink'
                  )}>
                    {netWorth >= 0 ? formatVnd(netWorth) : `- ${formatVnd(Math.abs(netWorth))}`}
                  </span>
                </div>

                <div className="pt-2 border-t border-line/40 grid grid-cols-2 divide-x divide-line/40 text-center">
                  <div className="flex flex-col items-center px-2">
                    <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Asset</span>
                    <span className="text-[15px] font-bold text-done-ink tabular-nums mt-0.5">
                      + {formatVnd(totalAssets)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center px-2">
                    <span className="text-[11px] text-ink-sub uppercase tracking-wider font-semibold">Debt</span>
                    <span className="text-[15px] font-bold text-err-ink tabular-nums mt-0.5">
                      - {formatVnd(totalDebts)}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Wallets List Section Grouped by Asset and Loan/Debt */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-ink">Wallets & Accounts</span>
                    <span className="text-[11px] text-ink-sub">({scopedAccounts.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccountId(undefined);
                      setIsAccountSheetOpen(true);
                    }}
                    className="text-[12px] font-semibold text-sky hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Icon name="add" className="text-[15px]" />
                    <span>Add account</span>
                  </button>
                </div>

                {/* 1. Assets Group Card */}
                {assetAccounts.length > 0 && (
                  <div className="bg-surface rounded-xl shadow-card border border-line/40 overflow-hidden">
                    {/* Group Header */}
                    <div className="px-3 py-1.5 bg-soft/30 border-b border-line/30 flex items-center justify-between gap-2 select-none">
                      <span className="text-[11px] font-bold text-ink-sub uppercase tracking-wider">Asset</span>
                      <span className="text-[11px] font-bold text-done-ink tabular-nums">
                        Assets: +{formatVnd(totalAssets)}
                      </span>
                    </div>

                    {/* Group Accounts */}
                    <div className="divide-y divide-line/20">
                      {assetAccounts.map((acc) => {
                        const bal = accountBalances[acc.id] ?? 0;
                        return (
                          <div
                            key={acc.id}
                            onClick={() => setSelectedWalletId(acc.id)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-2.5 hover:bg-canvas active:bg-soft text-left transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-2xs"
                                style={{ backgroundColor: `${acc.color || '#3FA88B'}20` }}
                              >
                                <Icon name={(acc.icon as any) || 'payments'} className="text-[16px]" style={{ color: acc.color || '#3FA88B' }} />
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[12px] font-bold text-ink truncate">{acc.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[11px] text-ink-sub font-medium">Asset</span>
                                  {acc.excludeFromTotal && (
                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded leading-none">
                                      Excluded from total
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className="text-[13px] font-bold text-ink tabular-nums">
                                  {formatVnd(bal)}
                                </span>
                                <span className="text-[10px] text-ink-sub font-normal">VND</span>
                              </div>
                              <Icon name="chevron_right" className="text-[16px] text-ink-sub/50 group-hover:text-ink transition-colors ml-0.5" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Loans & Debts Group Card */}
                {debtAccounts.length > 0 && (
                  <div className="bg-surface rounded-xl shadow-card border border-line/40 overflow-hidden">
                    {/* Group Header */}
                    <div className="px-3 py-1.5 bg-soft/30 border-b border-line/30 flex items-center justify-between gap-2 select-none">
                      <span className="text-[11px] font-bold text-ink-sub uppercase tracking-wider">Loan / Debt</span>
                      <span className="text-[11px] font-bold text-err-ink tabular-nums">
                        Debt: -{formatVnd(totalDebts)}
                      </span>
                    </div>

                    {/* Group Accounts */}
                    <div className="divide-y divide-line/20">
                      {debtAccounts.map((acc) => {
                        const bal = accountBalances[acc.id] ?? 0;
                        return (
                          <div
                            key={acc.id}
                            onClick={() => setSelectedWalletId(acc.id)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-2.5 hover:bg-canvas active:bg-soft text-left transition-colors cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-2xs"
                                style={{ backgroundColor: `${acc.color || '#EF4444'}20` }}
                              >
                                <Icon name={(acc.icon as any) || 'credit_card'} className="text-[16px]" style={{ color: acc.color || '#EF4444' }} />
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[12px] font-bold text-ink truncate">{acc.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[11px] text-ink-sub font-medium">Debt</span>
                                  {acc.excludeFromTotal && (
                                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded leading-none">
                                      Excluded from total
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col items-end">
                                <span className={cx('text-[13px] font-bold tabular-nums', bal < 0 ? 'text-err-ink' : 'text-ink')}>
                                  {bal < 0 ? `- ${formatVnd(Math.abs(bal))}` : formatVnd(bal)}
                                </span>
                                <span className="text-[10px] text-ink-sub font-normal">VND</span>
                              </div>
                              <Icon name="chevron_right" className="text-[16px] text-ink-sub/50 group-hover:text-ink transition-colors ml-0.5" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ============================================================== */}
        {/* 3. CHART MODE                                                  */}
        {/* ============================================================== */}
        {viewMode === 'chart' && (
          <div className="flex flex-col gap-4">
            {/* Time range picker at the top */}
            <div className="py-1">
              <TimeRangeBar
                label={displayRangeLabel}
                onPrev={handlePrevRange}
                onNext={handleNextRange}
                onOpenSheet={handleOpenDateSheet}
              />
            </div>

            {/* Single Row: Left: Expense/Income Toggle | Right: Category/Member/Account Tabs */}
            <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar py-0.5">
              {/* Left: Expense / Income Toggle */}
              <div className="inline-flex p-0.5 bg-surface rounded-full border border-line shadow-2xs shrink-0" role="tablist" aria-label="Type">
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartType === 'expense'}
                  onClick={() => setChartType('expense')}
                  className={cx(
                    'min-h-[28px] px-2.5 sm:px-3 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap',
                    chartType === 'expense'
                      ? 'bg-header text-header-ink font-semibold shadow-xs border border-header-ink/20'
                      : 'text-ink-sub hover:text-ink'
                  )}
                >
                  Expense
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={chartType === 'income'}
                  onClick={() => setChartType('income')}
                  className={cx(
                    'min-h-[28px] px-2.5 sm:px-3 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap',
                    chartType === 'income'
                      ? 'bg-header text-header-ink font-semibold shadow-xs border border-header-ink/20'
                      : 'text-ink-sub hover:text-ink'
                  )}
                >
                  Income
                </button>
              </div>

              {/* Right: Category | Member | Account */}
              <div className="inline-flex p-0.5 bg-surface rounded-full border border-line shadow-2xs shrink-0" role="tablist" aria-label="Group by">
                {(scope === 'household'
                  ? (['category', 'member', 'account'] as const)
                  : (['category', 'account'] as const)
                ).map((gb) => {
                  const active = effectiveGroupBy === gb;
                  return (
                    <button
                      key={gb}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setChartGroupBy(gb)}
                      className={cx(
                        'min-h-[28px] px-2 sm:px-2.5 rounded-full text-[12px] transition-all capitalize cursor-pointer whitespace-nowrap',
                        active
                          ? 'bg-header text-header-ink font-semibold shadow-xs border border-header-ink/20'
                          : 'text-ink-sub hover:text-ink'
                      )}
                    >
                      {gb === 'category' ? 'Category' : gb === 'member' ? 'Member' : 'Account'}
                    </button>
                  );
                })}
              </div>
            </div>

            {chartSlices.length === 0 ? (
              <EmptyState
                message={`No ${chartType} recorded for this period.`}
                action={{
                  label: `Add ${chartType}`,
                  onClick: () => openSheet({ type: 'transaction', txType: chartType, scope }),
                }}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex justify-center py-2">
                  <MoneyDonut slices={chartSlices} total={chartTotal} type={chartType} />
                </div>
                <div className="bg-surface rounded-2xl shadow-card border border-line/40 overflow-hidden divide-y divide-line/20">
                  {chartSlices.map((slice) => (
                    <button
                      key={slice.key}
                      type="button"
                      onClick={() => setSelectedBreakdownSlice(slice)}
                      className="w-full p-3 flex items-center justify-between gap-2 hover:bg-canvas active:bg-soft text-left transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {slice.avatar ? (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                            {slice.avatar}
                          </div>
                        ) : (
                          <span
                            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${slice.color}20` }}
                          >
                            <CategoryIcon name={(slice.icon as any) || 'package'} size={18} color={slice.color} />
                          </span>
                        )}
                        <span className="text-body-sm font-medium text-ink truncate">{slice.name}</span>
                      </div>
                      <span className="w-16 text-center text-body-md text-ink font-normal tabular-nums">
                        {sharePct(slice.share)}
                      </span>
                      <span className="w-28 text-right text-body-md text-ink font-semibold tabular-nums">
                        {formatVnd(slice.total)}
                      </span>
                      <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink shrink-0 ml-1 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sheets & Overlays */}
      <AccountSheet
        open={isAccountSheetOpen || !!editingAccountId}
        onClose={() => {
          setIsAccountSheetOpen(false);
          setEditingAccountId(undefined);
        }}
        accountId={editingAccountId}
        initialScope={scope}
      />

      <ChartBreakdownSheet
        open={!!selectedBreakdownSlice}
        onClose={() => setSelectedBreakdownSlice(null)}
        slice={selectedBreakdownSlice}
        groupBy={effectiveGroupBy}
        txType={chartType}
        timeRangeLabel={displayRangeLabel}
        entries={breakdownEntries}
        onSelectEntry={(entry) => setSelectedEntry(entry)}
      />

      <TransactionDetailSheet
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        entry={selectedEntry}
        onEdit={(entry) => {
          const rawId = entry.id.replace(/^(tx-|pur-)/, '');
          setSelectedEntry(null);
          setSelectedBreakdownSlice(null);
          openSheet({
            type: 'transaction',
            transactionId: rawId,
            txType: entry.type,
            scope,
          });
        }}
      />
    </>
  );
}
