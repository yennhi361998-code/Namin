import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionSheet, SwipeRow } from '../components/overlay';
import { PurchaseRow, ShoppingItemRow } from '../components/rows';
import { BrandHeader, Fab, PillTabs, ScreenTitle } from '../components/shell';
import { Card, cx, EmptyState, Icon, ListCard, MemberAvatar, ProgressBar, SectionHeader } from '../components/ui';
import { MoneyDonut, sharePct, type Slice } from '../components/money';
import {
  type DateFilterSelection,
  formatDateRange,
  getCurrentCycleMonthKey,
  getDisplayRangeLabel,
  getSavedMonthStartDay,
  resolveDateRange,
  saveMonthStartDay,
  shiftDateSelection,
} from '../lib/dateRanges';
import { monthKey, monthName, shiftMonth, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import { CHART_COLORS } from '../lib/moneyCategories';
import type { ShoppingItem, TxType } from '../lib/types';
import { useStore } from '../store';
import { removeFromList } from '../store/actions';
import { moneyEntries, useRestockMap, useRestockSuggestions } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

type Tab = 'tobuy' | 'history';

export function Shopping() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'tobuy' ? 'tobuy' : 'history';
  const shopping = useStore((s) => s.shopping);
  const toBuy = shopping.filter((x) => !x.completed);

  return (
    <>
      <BrandHeader />
      <Fab label="Add expense" onClick={() => openSheet({ type: 'transaction', txType: 'expense' })} />
      <ScreenTitle title="Shopping" />
      <div className="flex flex-col gap-space-lg">
        <PillTabs
          label="Shopping view"
          value={tab}
          onChange={(v) => setParams(v === 'history' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'history', label: 'History' },
            { value: 'tobuy', label: 'To Buy' },
          ]}
        />
        {tab === 'history' ? <History /> : <ToBuy items={toBuy} />}
      </div>
    </>
  );
}

function ToBuy({ items }: { items: ShoppingItem[] }) {
  const navigate = useNavigate();
  const restock = useRestockMap();
  const [menuFor, setMenuFor] = useState<ShoppingItem | null>(null);
  const [last, setLast] = useState<ShoppingItem | null>(null);
  if (menuFor && menuFor !== last) setLast(menuFor);
  const m = menuFor ?? last;

  return (
    <div className="flex flex-col gap-space-md">
      {items.length === 0 ? (
        <EmptyState message="Your shopping list is empty." action={{ label: 'Add item', onClick: () => document.getElementById('quick-add-item')?.focus() }} />
      ) : (
        <ListCard>
          {items.map((x) => (
            <SwipeRow
              key={x.id}
              onLongPress={() => setMenuFor(x)}
              actions={[
                { label: 'Edit', icon: 'edit', tone: 'sky', onSelect: () => openSheet({ type: 'shopping', shoppingId: x.id }) },
                { label: 'Remove', icon: 'delete', tone: 'err', onSelect: () => removeFromList(x.id) },
              ]}
            >
              <ShoppingItemRow
                item={x}
                est={restock.get(x.itemId)}
                onCheck={() => openSheet({ type: 'purchase', shoppingId: x.id })}
                onOpen={() => navigate(`/items/${x.itemId}`)}
              />
            </SwipeRow>
          ))}
        </ListCard>
      )}
      <QuickAddItem />
      <RestockCard />
      <ActionSheet
        open={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={m?.name ?? ''}
        actions={
          m
            ? [
                { label: 'Record purchase', icon: 'shopping_cart_checkout', onSelect: () => openSheet({ type: 'purchase', shoppingId: m.id }) },
                { label: 'Edit', icon: 'edit', onSelect: () => openSheet({ type: 'shopping', shoppingId: m.id }) },
                { label: 'Item details', icon: 'info', onSelect: () => navigate(`/items/${m.itemId}`) },
                { label: 'Remove from list', icon: 'delete', destructive: true, onSelect: () => removeFromList(m.id) },
              ]
            : []
        }
      />
    </div>
  );
}

function listPhrase(names: string[]) {
  const n = names.map((x) => x.toLowerCase());
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** Quiet, deterministic restock nudges from purchase history. Closes the loop back to the list. */
function RestockCard() {
  const suggestions = useRestockSuggestions();
  const shopping = useStore((s) => s.shopping);
  const restock = useRestockMap();
  const addToShopping = useStore((s) => s.addToShopping);

  const lowOnList = shopping.filter((x) => !x.completed && (restock.get(x.itemId)?.daysLeft ?? Infinity) <= 7);
  if (!suggestions.length && !lowOnList.length) return null;

  const text = suggestions.length
    ? `Based on previous purchases, ${listPhrase(suggestions.slice(0, 3).map((s) => s.item.name))} usually need${suggestions.length === 1 ? 's' : ''} restocking this week.`
    : `Based on previous purchases, ${listPhrase(lowOnList.slice(0, 3).map((x) => x.name))} usually need${lowOnList.length === 1 ? 's' : ''} restocking this week. ${lowOnList.length === 1 ? "It's" : "They're"} on your list.`;

  return (
    <section className="bg-soft border border-sky/30 rounded-xl p-space-md shadow-sm flex items-start gap-space-sm" aria-labelledby="restock-title">
      <div className="w-8 h-8 rounded-full bg-sky/40 text-link flex items-center justify-center shrink-0">
        <Icon name="event_repeat" className="text-[18px]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span id="restock-title" className="text-label-md text-ink font-semibold">
            Restock soon
          </span>
          <span className="text-caption text-link font-medium">From your history</span>
        </div>
        <p className="text-body-sm text-ink-muted mt-0.5 leading-snug">{text}</p>
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2.5">
            {suggestions.slice(0, 4).map(({ item }) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const res = addToShopping({ name: item.name, itemId: item.id });
                  if (res.ok) toast({ title: 'Added to shopping list', subtitle: item.name });
                }}
                className="min-h-[36px] px-3 rounded-full bg-surface border border-line text-ink text-label-md inline-flex items-center gap-1 active:scale-95 transition-transform"
                aria-label={`Add ${item.name} to shopping list`}
              >
                <Icon name="add" className="text-[16px] text-sky-dark" />
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function History() {
  const navigate = useNavigate();
  const purchases = useStore((s) => s.purchases);
  const transactions = useStore((s) => s.transactions);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const moneyCategories = useStore((s) => s.moneyCategories ?? []);

  const [viewMode, setViewMode] = useState<'details' | 'chart'>('details');
  const [chartType, setChartType] = useState<TxType>('expense');
  const [chartGroupBy, setChartGroupBy] = useState<'category' | 'account' | 'member'>('category');

  const [monthStartDay, setMonthStartDay] = useState<number>(() => getSavedMonthStartDay());
  const initialCycleKey = useMemo(() => getCurrentCycleMonthKey(today(), monthStartDay), [monthStartDay]);
  const [selection, setSelection] = useState<DateFilterSelection>(() => ({
    mode: 'month',
    monthKey: initialCycleKey,
  }));

  const [startDate, endDate] = useMemo(() => {
    return resolveDateRange(selection, monthStartDay);
  }, [selection, monthStartDay]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (startDate && p.purchaseDate < startDate) return false;
      if (endDate && p.purchaseDate > endDate) return false;
      return true;
    });
  }, [purchases, startDate, endDate]);

  const months = useMemo(() => {
    const sorted = [...filteredPurchases].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
    const m = new Map<string, typeof sorted>();
    sorted.forEach((p) => {
      const k = monthKey(p.purchaseDate);
      m.set(k, [...(m.get(k) ?? []), p]);
    });
    return [...m.entries()];
  }, [filteredPurchases]);

  const totalSpent = useMemo(() => filteredPurchases.reduce((sum, p) => sum + (p.price ?? 0), 0), [filteredPurchases]);
  const totalIncome = useMemo(() => {
    return transactions
      .filter((t) => {
        if (t.type !== 'income') return false;
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        return true;
      })
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions, startDate, endDate]);

  const currentYear = today().slice(0, 4);

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

  const prevPeriodTotal = useMemo(() => {
    if (!startDate || !endDate) return null;
    const prevSelection = shiftDateSelection(selection, -1, monthStartDay);
    const [pStart, pEnd] = resolveDateRange(prevSelection, monthStartDay);
    if (!pStart || !pEnd) return null;
    return purchases
      .filter((p) => {
        if (p.purchaseDate < pStart || p.purchaseDate > pEnd) return false;
        return true;
      })
      .reduce((sum, p) => sum + (p.price ?? 0), 0);
  }, [selection, startDate, endDate, monthStartDay, purchases]);

  const prevPeriodLabel = useMemo(() => {
    if (selection.mode === 'month' && monthStartDay === 1) {
      return monthName(shiftMonth(selection.monthKey, -1));
    }
    const prevSelection = shiftDateSelection(selection, -1, monthStartDay);
    const [pStart, pEnd] = resolveDateRange(prevSelection, monthStartDay);
    return formatDateRange(pStart, pEnd);
  }, [selection, monthStartDay]);

  const ratio = useMemo(() => {
    return prevPeriodTotal ? totalSpent / prevPeriodTotal : null;
  }, [totalSpent, prevPeriodTotal]);

  // Chart entries calculation
  const chartEntries = useMemo(() => {
    return moneyEntries({ transactions, purchases, moneyCategories }, chartType).filter((e) => {
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      return true;
    });
  }, [transactions, purchases, moneyCategories, chartType, startDate, endDate]);

  const chartTotal = useMemo(() => chartEntries.reduce((sum, e) => sum + e.amount, 0), [chartEntries]);

  const chartSlices: (Slice & { count: number })[] = useMemo(() => {
    if (chartTotal === 0) return [];

    if (chartGroupBy === 'category') {
      const groups = new Map<string, { total: number; count: number }>();
      for (const e of chartEntries) {
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
            share: data.total / chartTotal,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    if (chartGroupBy === 'account') {
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
            name: acc?.name ?? 'Chưa gán ví',
            icon: acc?.icon ?? 'account_balance_wallet',
            color: acc?.color ?? fallbackColor,
            total: data.total,
            count: data.count,
            share: data.total / chartTotal,
          };
        })
        .sort((a, b) => b.total - a.total);
    }

    // Group by Member
    const groups = new Map<string | null, { total: number; count: number }>();
    for (const e of chartEntries) {
      const key = e.memberId ?? null;
      const cur = groups.get(key) ?? { total: 0, count: 0 };
      groups.set(key, { total: cur.total + e.amount, count: cur.count + 1 });
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
          share: data.total / chartTotal,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [chartEntries, chartTotal, chartGroupBy, moneyCategories, accounts, members]);

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Consolidated Header Card */}
      <Card className="p-space-md flex flex-col gap-space-xs bg-surface rounded-2xl shadow-card">
        <div className="flex items-center justify-between border-b border-line pb-space-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrevRange}
              aria-label="Previous period"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors"
            >
              <Icon name="chevron_left" className="text-[18px]" />
            </button>

            <button
              type="button"
              onClick={handleOpenDateSheet}
              className="relative flex items-center justify-center px-6 py-1 rounded-xl hover:bg-canvas active:bg-soft transition-colors text-label-md font-semibold text-ink"
            >
              <span>{displayRangeLabel}</span>
              <Icon name="expand_more" className="absolute right-1 text-[16px] text-ink-sub pointer-events-none" />
            </button>

            <button
              type="button"
              onClick={handleNextRange}
              aria-label="Next period"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors"
            >
              <Icon name="chevron_right" className="text-[18px]" />
            </button>
          </div>

          <Link to="/charts" className="flex items-center gap-0.5 text-link text-label-sm font-medium">
            View charts <Icon name="arrow_forward" className="text-[14px]" />
          </Link>
        </div>

        <div className="pt-1.5 flex flex-col items-center justify-center text-center">
          <span className="text-caption text-ink-sub uppercase tracking-wider font-semibold">Expense</span>
          <span className="text-[20px] leading-snug font-bold text-err-ink tabular-nums mt-0.5">
            - {formatVnd(totalSpent)}
          </span>
          <div className="flex items-center gap-1 mt-1 text-caption text-done-ink">
            <span>Income</span>
            <span className="font-semibold tabular-nums">+ {formatVnd(totalIncome)}</span>
          </div>
        </div>

        {ratio != null && prevPeriodTotal != null && (
          <div className="mt-2 pt-2 border-t border-line/60 flex flex-col gap-1">
            <ProgressBar value={ratio} label={`Compared with ${prevPeriodLabel}`} />
            <span className="text-caption text-ink-sub text-center">
              {Math.round(ratio * 100)}% of {prevPeriodLabel} ({formatVnd(prevPeriodTotal)})
            </span>
          </div>
        )}
      </Card>

      {/* Switch between Details and Chart */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex p-1 bg-line/60 rounded-xl" role="tablist" aria-label="View mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'details'}
            onClick={() => setViewMode('details')}
            className={cx(
              'px-4 py-1.5 rounded-lg text-label-md font-medium transition-all',
              viewMode === 'details' ? 'bg-surface text-ink font-semibold shadow-xs' : 'text-ink-sub hover:text-ink'
            )}
          >
            Details
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'chart'}
            onClick={() => setViewMode('chart')}
            className={cx(
              'px-4 py-1.5 rounded-lg text-label-md font-medium transition-all',
              viewMode === 'chart' ? 'bg-surface text-ink font-semibold shadow-xs' : 'text-ink-sub hover:text-ink'
            )}
          >
            Chart
          </button>
        </div>
      </div>

      {/* Render Chart View */}
      {viewMode === 'chart' ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-2">
            <PillTabs
              label="Chart type"
              value={chartType}
              onChange={setChartType}
              options={[
                { value: 'expense', label: 'Expenses' },
                { value: 'income', label: 'Income' },
              ]}
            />
          </div>

          {/* Floating Segment Control: Category | Account | Member */}
          <div className="flex justify-center -mt-1">
            <div className="inline-flex p-1 bg-surface rounded-full shadow-sm border border-line/50" role="tablist">
              {(['category', 'account', 'member'] as const).map((gb) => {
                const active = chartGroupBy === gb;
                return (
                  <button
                    key={gb}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setChartGroupBy(gb)}
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

          {chartSlices.length === 0 ? (
            <EmptyState
              message={chartType === 'expense' ? 'Không có chi tiêu trong khoảng thời gian này.' : 'Không có thu nhập trong khoảng thời gian này.'}
              action={{ label: 'Thêm mục', onClick: () => openSheet({ type: 'transaction', txType: chartType }) }}
            />
          ) : (
            <div className="flex flex-col gap-6 pt-1">
              {/* Donut Chart */}
              <div className="flex flex-col items-center">
                <MoneyDonut
                  key={`${chartType}-${startDate}-${endDate}-${chartGroupBy}`}
                  type={chartType}
                  slices={chartSlices}
                  total={chartTotal}
                  title={chartType === 'expense' ? 'Total Expenses' : 'Total Income'}
                />
                {/* Rotate hint */}
                <div className="flex items-center justify-center gap-1.5 text-[12px] text-ink-sub/70 mt-3 select-none">
                  <Icon name="replay" className="text-[14px]" />
                  <span>Drag the pie chart to rotate</span>
                </div>
              </div>

              {/* Breakdown Rows matching reference screenshot */}
              <div className="flex flex-col divide-y divide-line/40 px-3 bg-surface rounded-2xl shadow-card border border-line/40 overflow-hidden">
                {chartSlices.map((slice) => (
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
      ) : (
        /* Render Details List */
        months.length === 0 ? (
          <EmptyState message="No purchases found for the selected period." />
        ) : (
          months.map(([key, ps]) => (
            <section key={key} aria-label={monthName(key, true)}>
              <SectionHeader
                title={monthName(key, key.slice(0, 4) !== currentYear)}
                right={<span className="text-body-sm text-ink-sub tabular-nums">{formatVnd(ps.reduce((n, p) => n + (p.price ?? 0), 0))}</span>}
              />
              <ListCard>
                {ps.map((p) => (
                  <PurchaseRow key={p.id} purchase={p} onOpen={() => navigate(`/items/${p.itemId}`)} />
                ))}
              </ListCard>
            </section>
          ))
        )
      )}
    </div>
  );
}

/**
 * Fast path onto the To Buy list: type a name, press return. Price, store, quantity and
 * category fill in from what the household bought before (addToShopping's smart defaults).
 */
function QuickAddItem() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addToShopping = useStore((s) => s.addToShopping);
  const submit = () => {
    const name = value.trim();
    if (!name) return;
    const res = addToShopping({ name });
    if (!res.ok) {
      setError(res.reason === 'duplicate' ? `${name} is already on your list.` : 'Enter an item name.');
      return;
    }
    setValue('');
    setError(null);
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={cx(
          'flex items-center gap-2 p-1.5 pl-3.5 bg-surface rounded-xl border shadow-card focus-within:border-sky focus-within:ring-2 focus-within:ring-sky/20 transition-all',
          error ? 'border-err-ink' : 'border-line',
        )}
      >
        <Icon name="add_shopping_cart" className="text-[20px] text-ink-sub shrink-0" />
        <input
          id="quick-add-item"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Add to list, e.g. Detergent"
          aria-label="Add an item to the shopping list"
          aria-invalid={!!error || undefined}
          enterKeyHint="done"
          autoComplete="off"
          maxLength={80}
          className="w-full min-h-[40px] bg-transparent text-body-md text-ink placeholder:text-ink-sub/80 focus:outline-none"
        />
        <button type="submit" aria-label="Add to list" className="w-10 h-10 flex items-center justify-center rounded-lg bg-sky text-ink active:scale-95 transition-all shrink-0 shadow-sm">
          <Icon name="arrow_upward" className="text-[18px]" />
        </button>
      </form>
      {error ? (
        <p className="px-2 pt-1.5 text-body-sm text-err-ink" role="alert">
          {error}
        </p>
      ) : (
        <p className="px-2 pt-1.5 text-center text-caption text-ink-sub">Press return to add it. Price and store fill in from last time.</p>
      )}
    </div>
  );
}
