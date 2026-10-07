import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionSheet, SwipeRow } from '../components/overlay';
import { PurchaseRow, ShoppingItemRow } from '../components/rows';
import { BrandHeader, Fab, PillTabs, ScreenTitle } from '../components/shell';
import { Card, cx, EmptyState, Icon, ListCard, ProgressBar, SectionHeader } from '../components/ui';
import {
  type DateFilterSelection,
  getSavedMonthStartDay,
  QUICK_RANGE_OPTIONS,
  resolveDateRange,
  saveMonthStartDay,
} from '../lib/dateRanges';
import { formatMonthYear, monthKey, monthName, shiftMonth, shortMonthName, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import type { ShoppingItem } from '../lib/types';
import { useStore } from '../store';
import { removeFromList } from '../store/actions';
import { useMoneyMonth, useRestockMap, useRestockSuggestions } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

type Tab = 'tobuy' | 'history';

export function Shopping() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'tobuy' ? 'tobuy' : 'history';
  const shopping = useStore((s) => s.shopping);
  const purchases = useStore((s) => s.purchases);
  const toBuy = shopping.filter((x) => !x.completed);

  return (
    <>
      <BrandHeader />
      <Fab label="Add expense" onClick={() => openSheet({ type: 'transaction', txType: 'expense' })} />
      <ScreenTitle
        title="Shopping"
        subtitle="What does your home need?"
      />
      <div className="flex flex-col gap-space-lg">
        <MonthSummary />
        <PillTabs
          label="Shopping view"
          value={tab}
          onChange={(v) => setParams(v === 'history' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'history', label: 'History', count: purchases.length },
            { value: 'tobuy', label: 'To Buy', count: toBuy.length },
          ]}
        />
        {tab === 'history' ? <History /> : <ToBuy items={toBuy} />}
      </div>
    </>
  );
}

function MonthSummary() {
  const key = monthKey(today());
  // All spending, not just Shopping: purchases plus expenses entered in Charts.
  const thisMonth = useMoneyMonth('expense', key);
  const lastMonth = useMoneyMonth('expense', shiftMonth(key, -1));
  const ratio = lastMonth.total ? thisMonth.total / lastMonth.total : null;
  return (
    <Card className="p-space-md flex flex-col gap-space-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-ink-sub">
          <Icon name="payments" className="text-[16px] text-sky-dark" />
          <span className="text-caption uppercase tracking-wider font-semibold">This month</span>
        </div>
        <Link to="/charts" className="min-h-[36px] -my-2 flex items-center gap-0.5 text-link text-label-sm font-medium">
          View charts <Icon name="arrow_forward" className="text-[14px]" />
        </Link>
      </div>
      <div className="flex items-baseline justify-between mt-0.5">
        <span className="text-headline-md text-ink tabular-nums">{formatVnd(thisMonth.total)}</span>
        <span className="text-caption text-ink-sub bg-soft px-2 py-0.5 rounded-full">
          {thisMonth.count} expense{thisMonth.count === 1 ? '' : 's'} in {shortMonthName(key)}
        </span>
      </div>
      {ratio != null && (
        <div className="mt-1 flex flex-col gap-1">
          <ProgressBar value={ratio} label={`This month compared with ${monthName(lastMonth.key)}`} />
          <span className="text-caption text-ink-sub">
            {Math.round(ratio * 100)}% of {monthName(lastMonth.key)} ({formatVnd(lastMonth.total)})
          </span>
        </div>
      )}
    </Card>
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
  const currentMonthKey = useMemo(() => monthKey(today()), []);

  const [monthStartDay, setMonthStartDay] = useState<number>(() => getSavedMonthStartDay());
  const [selection, setSelection] = useState<DateFilterSelection>({
    mode: 'month',
    monthKey: currentMonthKey,
  });

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
  const currentYear = today().slice(0, 4);

  const displayMonthLabel = useMemo(() => {
    if (selection.mode === 'month') {
      return formatMonthYear(selection.monthKey);
    }
    if (selection.mode === 'quick') {
      const item = QUICK_RANGE_OPTIONS.find((o) => o.id === selection.quickOption);
      return item ? item.label : 'Quick Range';
    }
    return 'Custom Range';
  }, [selection]);

  const handlePrevMonth = () => {
    const key = selection.monthKey || currentMonthKey;
    const prev = shiftMonth(key, -1);
    setSelection({
      mode: 'month',
      monthKey: prev,
    });
  };

  const handleNextMonth = () => {
    const key = selection.monthKey || currentMonthKey;
    const next = shiftMonth(key, 1);
    setSelection({
      mode: 'month',
      monthKey: next,
    });
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

  if (!purchases.length) {
    return (
      <EmptyState
        message="No purchases yet."
        action={{ label: 'Add expense', onClick: () => openSheet({ type: 'transaction', txType: 'expense' }) }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-space-lg">
      {/* Header bar matching Image 1 */}
      <Card className="p-space-md flex flex-col gap-space-xs bg-surface rounded-2xl shadow-card">
        <div className="flex items-center justify-between border-b border-line pb-space-xs">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors"
          >
            <Icon name="chevron_left" className="text-[22px]" />
          </button>

          <button
            type="button"
            onClick={handleOpenDateSheet}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-canvas active:bg-soft transition-colors text-headline-md font-semibold text-ink"
          >
            <span>{displayMonthLabel}</span>
            <Icon name="expand_more" className="text-[20px] text-ink-sub" />
          </button>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="w-10 h-10 rounded-full flex items-center justify-center text-ink hover:bg-canvas active:bg-soft transition-colors"
          >
            <Icon name="chevron_right" className="text-[22px]" />
          </button>
        </div>

        <div className="pt-2 flex flex-col items-center justify-center">
          <span className="text-caption text-ink-sub uppercase tracking-wider font-semibold">Total Expenses</span>
          <span className="text-[28px] leading-tight font-bold text-err-ink tabular-nums mt-0.5">
            - {formatVnd(totalSpent)}
          </span>
          <span className="text-caption text-ink-sub mt-1">
            {filteredPurchases.length} {filteredPurchases.length === 1 ? 'purchase' : 'purchases'}
          </span>
        </div>
      </Card>

      {/* History list */}
      {months.length === 0 ? (
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
