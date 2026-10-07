import { useNavigate } from 'react-router-dom';
import { CategoryTile } from '../components/money';
import { BottomSheet, SwipeRow } from '../components/overlay';
import { Icon, ListCard } from '../components/ui';
import { monthName, shortDate } from '../lib/dates';
import { formatVnd } from '../lib/money';
import type { TxType } from '../lib/types';
import { useStore } from '../store';
import { useMoneyMonth } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

/** Everything that went into one category in one month. */
export function MoneyCategorySheet({ open, onClose, categoryId, month, txType }: { open: boolean; onClose: () => void; categoryId: string; month: string; txType: TxType }) {
  const navigate = useNavigate();
  const data = useMoneyMonth(txType, month);
  const row = data.rows.find((r) => r.category.id === categoryId);
  const entries = data.entries.filter((e) => e.categoryId === categoryId);
  const name = row?.category.name ?? 'Category';

  return (
    <BottomSheet open={open} onClose={onClose} title={`${name} · ${monthName(month)}`}>
      <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        {row && (
          <div className="flex items-center gap-3">
            <CategoryTile category={row.category} size={48} />
            <div className="flex-1">
              <p className="text-body-md text-ink font-medium">{name}</p>
              <p className="text-body-sm text-ink-sub">
                {row.count} {row.count === 1 ? 'entry' : 'entries'} in {monthName(month)}
              </p>
            </div>
            <span className="text-title-sm text-ink tabular-nums">{formatVnd(row.total)}</span>
          </div>
        )}
        {entries.length === 0 ? (
          <p className="text-body-md text-ink-sub text-center py-6">Nothing here this month.</p>
        ) : (
          <ListCard>
            {entries.map((e) => {
              const content = (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (e.kind === 'purchase') navigate(`/items/${e.itemId}`);
                    else openSheet({ type: 'transaction', transactionId: e.id });
                  }}
                  className="w-full text-left flex items-center gap-3 px-3.5 min-h-[56px] py-2 active:bg-canvas"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md text-ink truncate">{e.title}</p>
                    <p className="text-body-sm text-ink-sub flex items-center gap-1">
                      {shortDate(e.date)}
                      {e.kind === 'purchase' && (
                        <>
                          <span aria-hidden>·</span>
                          <Icon name="shopping_bag" className="text-[13px]" />
                          From Shopping
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-label-md text-ink font-semibold tabular-nums">{formatVnd(e.amount)}</span>
                </button>
              );
              // Purchases are managed from their item; only manual entries can be deleted here.
              if (e.kind === 'purchase') return <div key={e.id}>{content}</div>;
              return (
                <SwipeRow
                  key={e.id}
                  actions={[
                    {
                      label: 'Delete',
                      icon: 'delete',
                      tone: 'err',
                      onSelect: () => {
                        const undo = useStore.getState().deleteTransaction(e.id);
                        toast({ title: 'Entry deleted', action: { label: 'Undo', run: undo } });
                      },
                    },
                  ]}
                >
                  {content}
                </SwipeRow>
              );
            })}
          </ListCard>
        )}
      </div>
    </BottomSheet>
  );
}
