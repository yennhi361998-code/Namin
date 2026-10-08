import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MoneyDonut, sharePct, type Slice } from '../components/money';
import { cx, EmptyState, Icon, MemberAvatar } from '../components/ui';
import { monthKey, shiftMonth, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { CHART_COLORS } from '../lib/moneyCategories';
import type { TxType } from '../lib/types';
import { useStore } from '../store';
import { moneyEntries } from '../store/selectors';
import { openSheet } from '../store/ui';

type SubTab = 'expense' | 'income' | 'budget' | 'trend';
type GroupBy = 'category' | 'account' | 'member';

export function Charts() {
  const [params, setParams] = useSearchParams();
  const current = monthKey(today());
  const rawMonth = params.get('m');
  const key = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= current ? rawMonth : current;

  const [subTab, setSubTab] = useState<SubTab>(params.get('type') === 'income' ? 'income' : 'expense');
  const [groupBy, setGroupBy] = useState<GroupBy>('category');

  const transactions = useStore((s) => s.transactions);
  const purchases = useStore((s) => s.purchases);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);

  const updateMonth = (newMonth: string) => {
    setParams({ ...(newMonth !== current && { m: newMonth }), ...(subTab === 'income' && { type: 'income' }) }, { replace: true });
  };

  const isIncome = subTab === 'income';
  const type: TxType = isIncome ? 'income' : 'expense';

  // Format month label like "9/2026"
  const monthDisplay = useMemo(() => {
    const parts = key.split('-');
    return `${Number(parts[1])}/${parts[0]}`;
  }, [key]);

  // Entries for the chosen month & type
  const entries = useMemo(() => {
    return moneyEntries({ transactions, purchases, moneyCategories }, type).filter((e) => monthKey(e.date) === key);
  }, [transactions, purchases, moneyCategories, type, key]);

  const totalAmount = useMemo(() => entries.reduce((sum, e) => sum + e.amount, 0), [entries]);

  const slices: (Slice & { count: number })[] = useMemo(() => {
    if (totalAmount === 0) return [];

    if (groupBy === 'category') {
      const groups = new Map<string, { total: number; count: number }>();
      for (const e of entries) {
        const cur = groups.get(e.categoryId) ?? { total: 0, count: 0 };
        groups.set(e.categoryId, { total: cur.total + e.amount, count: cur.count + 1 });
      }
      return [...groups.entries()]
        .map(([catId, data]) => {
          const cat = moneyCategories.find((c) => c.id === catId);
          return {
            key: catId,
            name: cat?.name ?? 'Khác',
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
            name: acc?.name ?? 'Chưa gán ví',
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
          name: m?.name ?? 'Chung (Cả nhà)',
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

        {/* Row 2: Sub-tabs (Expenses, Income, Budget, I/E Trend) + Filter icon */}
        <div className="px-4 pb-2.5 flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            {[
              { id: 'expense', label: 'Expenses' },
              { id: 'income', label: 'Income' },
              { id: 'budget', label: 'Budget' },
              { id: 'trend', label: 'I/E Trend' },
            ].map((tab) => {
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id as SubTab)}
                  className={cx(
                    'min-h-[34px] px-3.5 rounded-full text-label-md transition-all shrink-0',
                    active
                      ? 'bg-white/25 text-white font-semibold shadow-xs'
                      : 'text-white/70 hover:text-white'
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => openSheet({ type: 'categories', txType: type })}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:bg-white/20 shrink-0"
            aria-label="Filter"
          >
            <Icon name="filter" className="text-[18px]" />
          </button>
        </div>
      </header>

      {/* Floating Segment Control: Category | Account | Member */}
      <div className="flex justify-center pt-5 pb-3 px-4">
        <div className="inline-flex p-1 bg-surface rounded-full shadow-sm border border-line/50" role="tablist">
          {(['category', 'account', 'member'] as const).map((gb) => {
            const active = groupBy === gb;
            return (
              <button
                key={gb}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGroupBy(gb)}
                className={cx(
                  'min-h-[36px] px-5 rounded-full text-label-md transition-all capitalize',
                  active
                    ? 'bg-[#F5ECE8] text-ink font-semibold shadow-xs'
                    : 'text-ink-sub hover:text-ink'
                )}
              >
                {gb === 'category' ? 'Category' : gb === 'account' ? 'Account' : 'Member'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Chart content */}
      {subTab === 'budget' || subTab === 'trend' ? (
        <div className="px-4 pt-10">
          <EmptyState
            message={subTab === 'budget' ? 'Chức năng Budget đang phát triển.' : 'Chức năng I/E Trend đang phát triển.'}
          />
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
              <div key={slice.key} className="flex items-center py-3.5 px-1">
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
                      <Icon name={(slice.icon as any) || 'category'} className="text-[20px]" style={{ color: slice.color }} />
                    </div>
                  )}
                  <span className="text-body-md text-ink font-medium truncate">{slice.name}</span>
                </div>

                {/* Center: Percentage */}
                <span className="w-16 text-center text-body-md text-ink font-normal tabular-nums">
                  {sharePct(slice.share)}
                </span>

                {/* Right: Amount */}
                <span className="w-32 text-right text-body-md text-ink font-medium tabular-nums">
                  {formatVnd(slice.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
