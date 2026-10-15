import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionSheet, SwipeRow } from './overlay';
import { ShoppingItemRow } from './rows';
import { EmptyState, Icon } from './ui';
import type { ShoppingItem } from '../lib/types';
import { useStore } from '../store';
import { removeFromList } from '../store/actions';
import { useRestockMap } from '../store/selectors';
import { openSheet } from '../store/ui';

export function ToBuySection() {
  const shopping = useStore((s) => s.shopping);
  const items = shopping.filter((x) => !x.completed);
  const navigate = useNavigate();
  const restock = useRestockMap();
  const [menuFor, setMenuFor] = useState<ShoppingItem | null>(null);
  const [last, setLast] = useState<ShoppingItem | null>(null);
  if (menuFor && menuFor !== last) setLast(menuFor);
  const m = menuFor ?? last;

  return (
    <section className="flex flex-col gap-space-md" aria-labelledby="tobuy-section-title">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-1.5">
          <span id="tobuy-section-title" className="font-semibold text-body-md text-ink">
            To-Buy List
          </span>
          <span className="text-body-sm text-ink-sub whitespace-nowrap">
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </div>
        <button
          type="button"
          onClick={() => openSheet({ type: 'shopping' })}
          className="text-label-sm font-semibold text-link hover:underline flex items-center gap-1 min-h-[36px] px-2"
        >
          <Icon name="add" className="text-[16px]" />
          Add item
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          message="Your shopping list is empty."
          action={{
            label: 'Add item',
            onClick: () => openSheet({ type: 'shopping' }),
          }}
        />
      ) : (
        <div className="divide-y divide-line/30">
          {items.map((x) => (
            <SwipeRow
              key={x.id}
              surface="bg-canvas"
              onLongPress={() => setMenuFor(x)}
              actions={[
                {
                  label: 'Edit',
                  icon: 'edit',
                  tone: 'sky',
                  onSelect: () => openSheet({ type: 'shopping', shoppingId: x.id }),
                },
                {
                  label: 'Remove',
                  icon: 'delete',
                  tone: 'err',
                  onSelect: () => removeFromList(x.id),
                },
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
        </div>
      )}

      <ActionSheet
        open={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={m?.name ?? ''}
        actions={
          m
            ? [
                {
                  label: 'Record purchase',
                  icon: 'shopping_cart_checkout',
                  onSelect: () => openSheet({ type: 'purchase', shoppingId: m.id }),
                },
                {
                  label: 'Edit',
                  icon: 'edit',
                  onSelect: () => openSheet({ type: 'shopping', shoppingId: m.id }),
                },
                {
                  label: 'Item details',
                  icon: 'info',
                  onSelect: () => navigate(`/items/${m.itemId}`),
                },
                {
                  label: 'Remove from list',
                  icon: 'delete',
                  destructive: true,
                  onSelect: () => removeFromList(m.id),
                },
              ]
            : []
        }
      />
    </section>
  );
}
