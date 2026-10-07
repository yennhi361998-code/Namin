import { useSearchParams } from 'react-router-dom';
import { CategoryTile, MoneyDonut, sharePct, sliceColors } from '../components/money';
import { HeaderButton, PageHeader, PillTabs } from '../components/shell';
import { Card, EmptyState, Icon } from '../components/ui';
import { monthKey, monthName, shiftMonth, today } from '../lib/dates';
import { formatVnd } from '../lib/money';
import type { TxType } from '../lib/types';
import { useMoneyMonth } from '../store/selectors';
import { openSheet } from '../store/ui';

export function Charts() {
  const [params, setParams] = useSearchParams();
  const current = monthKey(today());
  const rawMonth = params.get('m');
  const key = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) && rawMonth <= current ? rawMonth : current;
  const type: TxType = params.get('type') === 'income' ? 'income' : 'expense';
  const update = (next: { m?: string; type?: TxType }) => {
    const m = next.m ?? key;
    const tp = next.type ?? type;
    setParams({ ...(m !== current && { m }), ...(tp === 'income' && { type: tp }) }, { replace: true });
  };

  const data = useMoneyMonth(type, key);
  const colors = sliceColors(data);
  const other = useMoneyMonth(type === 'expense' ? 'income' : 'expense', key);
  const showYear = key.slice(0, 4) !== current.slice(0, 4);
  // New entries default to today, or the 1st when looking at a past month.
  const addDate = key === current ? today() : `${key}-01`;
  const noun = type === 'expense' ? 'expense' : 'income';

  return (
    <>
      <PageHeader title="Charts" back="/shopping" right={<HeaderButton icon="add" label={`Add ${noun}`} onClick={() => openSheet({ type: 'transaction', txType: type, date: addDate })} />}>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            <button type="button" onClick={() => update({ m: shiftMonth(key, -1) })} className="w-10 h-10 rounded-full flex items-center justify-center text-ink active:bg-white/40" aria-label="Previous month">
              <Icon name="chevron_left" className="text-[24px]" />
            </button>
            <span className="min-w-[128px] text-center text-label-md font-semibold text-ink" aria-live="polite">
              {monthName(key, showYear)}
            </span>
            <button
              type="button"
              onClick={() => update({ m: shiftMonth(key, 1) })}
              disabled={key >= current}
              className="w-10 h-10 rounded-full flex items-center justify-center text-ink active:bg-white/40 disabled:opacity-30"
              aria-label="Next month"
            >
              <Icon name="chevron_right" className="text-[24px]" />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <PillTabs
              tone="header"
              label="Chart type"
              value={type}
              onChange={(v) => update({ type: v })}
              options={[
                { value: 'expense', label: 'Expenses' },
                { value: 'income', label: 'Income' },
              ]}
            />
            <HeaderButton icon="tune" label={`${type === 'expense' ? 'Expense' : 'Income'} categories`} onClick={() => openSheet({ type: 'categories', txType: type })} />
          </div>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-space-lg pt-space-lg">
        {data.total === 0 ? (
          <EmptyState
            message={type === 'expense' ? `No expenses in ${monthName(key)}.` : `No income in ${monthName(key)}.`}
            action={{ label: `Add ${noun}`, onClick: () => openSheet({ type: 'transaction', txType: type, date: addDate }) }}
          />
        ) : (
          <>
            <Card className="pt-3 pb-4 flex flex-col items-center">
              <MoneyDonut key={`${type}-${key}`} month={data} type={type} />
              <p className="text-caption text-ink-sub">
                {data.count} {data.count === 1 ? 'entry' : 'entries'}
                {other.total > 0 && ` · ${type === 'expense' ? 'Income' : 'Expenses'} ${formatVnd(other.total)}`}
              </p>
            </Card>

            <Card className="divide-y divide-line">
              {data.rows.map((r) => (
                <button
                  key={r.category.id}
                  type="button"
                  onClick={() => openSheet({ type: 'money-category', categoryId: r.category.id, month: key, txType: type })}
                  className="w-full text-left flex items-center gap-3 px-3.5 min-h-[60px] py-2 active:bg-canvas"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors.get(r.category.id) }} aria-hidden />
                  <CategoryTile category={r.category} size={38} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-body-md text-ink truncate">{r.category.name}</span>
                    <span className="text-body-sm text-ink-sub tabular-nums truncate">
                      {sharePct(r.share)} · {r.count} {r.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-label-md text-ink font-semibold tabular-nums">{formatVnd(r.total)}</span>
                </button>
              ))}
            </Card>
            {type === 'expense' && <p className="text-caption text-ink-sub text-center px-6">Shopping purchases are added automatically.</p>}
          </>
        )}
      </div>
    </>
  );
}
