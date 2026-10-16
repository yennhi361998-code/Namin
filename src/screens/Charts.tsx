import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MoneyDonut, sharePct, type Slice } from '../components/money';
import { CategoryIcon, cx, EmptyState, Icon, MemberAvatar } from '../components/ui';
import { monthKey, shiftMonth, shortDate, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { CHART_COLORS } from '../lib/moneyCategories';
import type { LedgerEntry, TxType } from '../lib/types';
import { ChartBreakdownSheet, type ChartBreakdownSlice } from '../sheets/ChartBreakdownSheet';
import { TransactionDetailSheet } from '../sheets/TransactionDetailSheet';
import { useStore } from '../store';
import { moneyEntries } from '../store/selectors';
import { openSheet } from '../store/ui';

type SubTab = 'expense' | 'income' | 'transfer' | 'budget' | 'trend';
type GroupBy = 'category' | 'account' | 'member';

export function Charts() {
  const [params, setParams] = useSearchParams();
  const current = monthKey(today());
  const rawMonth = params.get('m');
  const key = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= current ? rawMonth : current;

  const rawType = params.get('type');
  const [subTab, setSubTab] = useState<SubTab>(
    rawType === 'income' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense'
  );
  const [groupBy, setGroupBy] = useState<GroupBy>('category');
  const [selectedBreakdownSlice, setSelectedBreakdownSlice] = useState<ChartBreakdownSlice | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const transactions = useStore((s) => s.transactions);
  const purchases = useStore((s) => s.purchases);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);

  const updateMonth = (newMonth: string) => {
    setParams(
      {
        ...(newMonth !== current && { m: newMonth }),
        ...(subTab !== 'expense' && { type: subTab }),
      },
      { replace: true }
    );
  };

  const switchSubTab = (tabId: SubTab) => {
    setSubTab(tabId);
    setParams(
      {
        ...(key !== current && { m: key }),
        ...(tabId !== 'expense' && { type: tabId }),
      },
      { replace: true }
    );
  };

  const isIncome = subTab === 'income';
  const type: TxType = isIncome ? 'income' : 'expense';

  // Format month label like "9/2026"
  const monthDisplay = useMemo(() => {
    const parts = key.split('-');
    return `${Number(parts[1])}/${parts[0]}`;
  }, [key]);

  // Entries for the chosen month & type (for expense / income)
  const entries = useMemo(() => {
    return moneyEntries({ transactions, purchases, moneyCategories }, type).filter((e) => monthKey(e.date) === key);
  }, [transactions, purchases, moneyCategories, type, key]);

  const totalAmount = useMemo(() => entries.reduce((sum, e) => sum + e.amount, 0), [entries]);

  // Transfer entries for the chosen month (no categories, transfers between accounts)
  const transferEntries = useMemo(() => {
    return moneyEntries({ transactions, purchases, moneyCategories }, 'transfer').filter(
      (e) => monthKey(e.date) === key
    );
  }, [transactions, purchases, moneyCategories, key]);

  const totalTransferVolume = useMemo(
    () => transferEntries.reduce((sum, e) => sum + e.amount, 0),
    [transferEntries]
  );

  const ledgerEntries: LedgerEntry[] = useMemo(() => {
    const rawPurchasesMap = new Map(purchases.map((p) => [p.id, p]));
    const rawTransactionsMap = new Map(transactions.map((t) => [t.id, t]));

    return entries.map((e) => {
      const rawPurchase = e.kind === 'purchase' ? rawPurchasesMap.get(e.id) : undefined;
      const rawTransaction = e.kind === 'transaction' ? rawTransactionsMap.get(e.id) : undefined;
      return {
        id: e.kind === 'purchase' ? `pur-${e.id}` : `tx-${e.id}`,
        kind: e.kind,
        type,
        scope: rawTransaction?.scope ?? 'household',
        amount: e.amount,
        date: e.date,
        itemName: e.title,
        categoryId: e.categoryId,
        accountId: e.accountId,
        toAccountId: e.toAccountId,
        memberId: e.memberId,
        notes: e.note,
        itemId: e.itemId,
        createdAt: rawPurchase?.createdAt ?? rawTransaction?.createdAt,
        rawPurchase,
        rawTransaction,
      };
    });
  }, [entries, purchases, transactions, type]);

  const breakdownEntries = useMemo(() => {
    if (!selectedBreakdownSlice) return [];
    return ledgerEntries
      .filter((e) => {
        if (groupBy === 'category') {
          const catId = e.categoryId ?? 'unassigned';
          return catId === selectedBreakdownSlice.key;
        }
        if (groupBy === 'account') {
          const accId = e.accountId ?? 'unassigned';
          return accId === selectedBreakdownSlice.key;
        }
        if (groupBy === 'member') {
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
  }, [ledgerEntries, selectedBreakdownSlice, groupBy]);

  const slices: (Slice & { count: number })[] = useMemo(() => {
    if (totalAmount === 0) return [];

    if (groupBy === 'category') {
      const groups = new Map<string, { total: number; count: number }>();
      for (const e of entries) {
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
            share: data.total / totalAmount,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    if (groupBy === 'account') {
      const groups = new Map<string | null, { total: number; count: number }>();
      for (const e of entries) {
        const accId = e.accountId ?? null;
        const cur = groups.get(accId) ?? { total: 0, count: 0 };
        groups.set(accId, { total: cur.total + e.amount, count: cur.count + 1 });
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
            share: data.total / totalAmount,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    // groupBy === 'member'
    const groups = new Map<string | null, { total: number; count: number }>();
    for (const e of entries) {
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
          share: data.total / totalAmount,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [entries, totalAmount, groupBy, moneyCategories, accounts, members]);

  return (
    <div className="min-h-screen bg-canvas pb-24">
      {/* Header matching reference design: warm brown tone, Charts title, month navigation, tabs */}
      <header className="sticky top-0 z-30 bg-[#7B4B3A] text-white pt-safe shadow-sm">
        {/* Row 1: Book icon, Charts title, Month navigation */}
        <div className="h-14 px-4 flex items-center justify-between">
          <Link
            to="/shopping"
            className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors"
            aria-label="Back to Shopping"
          >
            <Icon name="book" className="text-[22px]" />
          </Link>

          <h1 className="text-title-sm font-semibold text-white">Charts</h1>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateMonth(shiftMonth(key, -1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors"
              aria-label="Previous month"
            >
              <Icon name="chevron_left" className="text-[18px]" />
            </button>
            <span className="text-label-md font-semibold text-white flex items-center gap-0.5 px-1">
              {monthDisplay}
              <Icon name="expand_more" className="text-[16px] text-white/80" />
            </span>
            <button
              type="button"
              onClick={() => updateMonth(shiftMonth(key, 1))}
              disabled={key >= current}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 active:bg-white/20 transition-colors disabled:opacity-30"
              aria-label="Next month"
            >
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>
        </div>

        {/* Row 2: Left: Expense/Income Toggle | Right: Category/Member/Account Tabs */}
        <div className="px-4 pb-2.5 pt-0.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          {/* Left: Expense / Income Toggle */}
          <div className="inline-flex p-0.5 bg-black/20 rounded-full shrink-0" role="tablist" aria-label="Transaction type">
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'expense'}
              onClick={() => switchSubTab('expense')}
              className={cx(
                'min-h-[28px] px-2.5 sm:px-3 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap',
                subTab === 'expense'
                  ? 'bg-white text-[#7B4B3A] font-semibold shadow-xs'
                  : 'text-white/80 hover:text-white'
              )}
            >
              Expense
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'income'}
              onClick={() => switchSubTab('income')}
              className={cx(
                'min-h-[28px] px-2.5 sm:px-3 rounded-full text-[12px] transition-all cursor-pointer whitespace-nowrap',
                subTab === 'income'
                  ? 'bg-white text-[#7B4B3A] font-semibold shadow-xs'
                  : 'text-white/80 hover:text-white'
              )}
            >
              Income
            </button>
          </div>

          {/* Right: Category | Member | Account */}
          <div className="inline-flex p-0.5 bg-black/20 rounded-full shrink-0" role="tablist" aria-label="Group by">
            {(['category', 'member', 'account'] as const).map((gb) => {
              const active = groupBy === gb;
              return (
                <button
                  key={gb}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGroupBy(gb)}
                  className={cx(
                    'min-h-[28px] px-2 sm:px-2.5 rounded-full text-[12px] transition-all capitalize cursor-pointer whitespace-nowrap',
                    active
                      ? 'bg-white text-[#7B4B3A] font-semibold shadow-xs'
                      : 'text-white/80 hover:text-white'
                  )}
                >
                  {gb === 'category' ? 'Category' : gb === 'member' ? 'Member' : 'Account'}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Chart content */}
      {subTab === 'budget' || subTab === 'trend' ? (
        <div className="px-4 pt-10">
          <EmptyState
            message={subTab === 'budget' ? 'Budget feature is under development.' : 'Income & Expense Trend feature is under development.'}
          />
        </div>
      ) : subTab === 'transfer' ? (
        <div className="flex flex-col gap-4 pt-4 px-4">
          {/* Transfer Summary Card */}
          <div className="p-4 rounded-2xl bg-surface border border-line/60 shadow-xs flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-caption font-semibold text-ink-sub uppercase tracking-wider">
                Total Transferred
              </span>
              <span className="text-headline-md font-bold text-ink tabular-nums">
                {formatVnd(totalTransferVolume)}
              </span>
              <span className="text-body-sm text-ink-muted">
                {transferEntries.length} {transferEntries.length === 1 ? 'transfer' : 'transfers'} in {monthDisplay}
              </span>
            </div>
            <button
              type="button"
              onClick={() => openSheet({ type: 'transaction', txType: 'transfer' })}
              className="h-10 px-4 rounded-full bg-soft hover:bg-line text-ink font-semibold text-label-md flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
            >
              <Icon name="add" className="text-[18px]" />
              Transfer
            </button>
          </div>

          {/* Transfer List or Empty State */}
          {transferEntries.length === 0 ? (
            <div className="pt-6">
              <EmptyState
                message={`No transfers recorded in ${monthDisplay}.`}
                action={{
                  label: 'Add transfer',
                  onClick: () => openSheet({ type: 'transaction', txType: 'transfer' }),
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col rounded-2xl bg-surface border border-line/60 shadow-xs divide-y divide-line/40 overflow-hidden">
              <div className="px-4 py-2.5 bg-canvas/60 text-caption font-semibold text-ink-sub uppercase tracking-wider">
                Transfer history
              </div>
              {transferEntries.map((e) => {
                const fromAcc = accounts.find((a) => a.id === e.accountId);
                const toAcc = accounts.find((a) => a.id === e.toAccountId);
                const mem = e.memberId ? members.find((m) => m.id === e.memberId) : undefined;
                const noteText = e.note?.trim();

                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      const raw = transactions.find((t) => t.id === e.id);
                      setSelectedEntry({
                        id: `tx-${e.id}`,
                        kind: 'transaction',
                        type: 'transfer',
                        amount: e.amount,
                        date: e.date,
                        itemName: e.title,
                        categoryId: e.categoryId,
                        accountId: e.accountId,
                        toAccountId: e.toAccountId,
                        memberId: e.memberId,
                        notes: e.note,
                        createdAt: raw?.createdAt,
                        rawTransaction: raw,
                      });
                    }}
                    className="flex items-center gap-3 p-3.5 hover:bg-canvas active:bg-soft text-left transition-colors"
                  >
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-full bg-soft flex items-center justify-center shrink-0 text-sky-dark">
                      <Icon name="swap_horiz" className="text-[22px]" />
                    </div>

                    {/* From -> To & Note/Date */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-body-md font-semibold text-ink truncate">
                        <span className="truncate max-w-[120px]" style={{ color: fromAcc?.color }}>
                          {fromAcc?.name ?? 'Unknown'}
                        </span>
                        <Icon name="chevron_right" className="text-[16px] text-ink-sub shrink-0" />
                        <span className="truncate max-w-[120px]" style={{ color: toAcc?.color }}>
                          {toAcc?.name ?? 'Unknown'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-caption text-ink-sub mt-0.5">
                        <span>{shortDate(e.date)}</span>
                        {noteText && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[140px] italic">{noteText}</span>
                          </>
                        )}
                        {mem && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[80px] font-medium">{mem.name}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right shrink-0">
                      <span className="text-body-md font-bold text-ink tabular-nums">
                        {formatVnd(e.amount)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : totalAmount === 0 ? (
        <div className="px-4 pt-10">
          <EmptyState
            message={type === 'expense' ? `No expenses in ${monthDisplay}.` : `No income in ${monthDisplay}.`}
            action={{ label: `Add ${type}`, onClick: () => openSheet({ type: 'transaction', txType: type }) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-2">
          {/* Donut Chart */}
          <div className="flex flex-col items-center">
            <MoneyDonut
              key={`${type}-${key}-${groupBy}`}
              slices={slices}
              total={totalAmount}
              type={type}
              title={type === 'expense' ? 'Total Expenses' : 'Total Income'}
            />
            {/* Rotate hint */}
            <div className="flex items-center justify-center gap-1.5 text-[12px] text-ink-sub/70 mt-3 select-none">
              <Icon name="replay" className="text-[14px]" />
              <span>Drag the pie chart to rotate</span>
            </div>
          </div>

          {/* Breakdown Rows matching reference screenshot */}
          <div className="flex flex-col divide-y divide-line/40 px-4 bg-surface mt-2 border-t border-b border-line/40 shadow-xs">
            {slices.map((slice) => (
              <button
                key={slice.key}
                type="button"
                onClick={() => setSelectedBreakdownSlice(slice)}
                className="w-full flex items-center py-3.5 px-1 hover:bg-canvas active:bg-soft transition-colors text-left group cursor-pointer"
              >
                {/* Left: Dot + Icon/Avatar + Name */}
                <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: slice.color }} />
                  {slice.avatar ? (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                      {slice.avatar}
                    </div>
                  ) : (
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${slice.color}20` }}
                    >
                      <CategoryIcon name={(slice.icon as any) || 'package'} size={20} color={slice.color} />
                    </div>
                  )}
                  <span className="text-body-md text-ink font-medium truncate">{slice.name}</span>
                </div>

                {/* Center: Percentage */}
                <span className="w-16 text-center text-body-md text-ink font-normal tabular-nums">
                  {sharePct(slice.share)}
                </span>

                {/* Right: Amount */}
                <span className="w-28 text-right text-body-md text-ink font-semibold tabular-nums">
                  {formatVnd(slice.total)}
                </span>

                {/* Chevron icon */}
                <Icon name="chevron_right" className="text-[18px] text-ink-sub/50 group-hover:text-ink shrink-0 ml-1 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      <ChartBreakdownSheet
        open={!!selectedBreakdownSlice}
        onClose={() => setSelectedBreakdownSlice(null)}
        slice={selectedBreakdownSlice}
        groupBy={groupBy}
        txType={type}
        timeRangeLabel={monthDisplay}
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
            scope: entry.scope,
          });
        }}
      />
    </div>
  );
}
