import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionSheet, SwipeRow } from './overlay';
import { ShoppingItemRow } from './rows';
import { EmptyState, Icon } from './ui';
import { guessSpendCategory } from '../lib/moneyCategories';
import type { ShoppingItem } from '../lib/types';
import { useStore } from '../store';
import { removeFromList } from '../store/actions';
import { useRestockMap } from '../store/selectors';
import { openSheet, toast } from '../store/ui';

export function ToBuySection() {
  const shopping = useStore((s) => s.shopping);
  const addToShopping = useStore((s) => s.addToShopping);
  const items = shopping.filter((x) => !x.completed);
  const navigate = useNavigate();
  const restock = useRestockMap();
  const [quickText, setQuickText] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [menuFor, setMenuFor] = useState<ShoppingItem | null>(null);
  const [last, setLast] = useState<ShoppingItem | null>(null);
  if (menuFor && menuFor !== last) setLast(menuFor);
  const m = menuFor ?? last;

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickText.trim();
    if (!trimmed) return;
    addToShopping({
      name: trimmed,
      quantity: 1,
      category: 'Other',
    });
    setQuickText('');
    toast({ title: `Added "${trimmed}" to list` });
  };

  const handleCheck = (item: ShoppingItem) => {
    const linkedItem = item.itemId ? useStore.getState().items.find((i) => i.id === item.itemId) : undefined;
    const catId = linkedItem?.spendCategoryId || guessSpendCategory(item.name);
    openSheet({
      type: 'transaction',
      txType: 'expense',
      scope: 'household',
      initialValues: {
        note: item.name,
        quantity: item.quantity,
        unit: item.unit,
        amount: item.estimatedPrice ?? undefined,
        shoppingItemId: item.id,
        itemId: item.itemId,
        categoryId: catId,
      },
    });
  };

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
          onClick={() => quickInputRef.current?.focus()}
          className="text-label-sm font-semibold text-link hover:underline flex items-center gap-1 min-h-[36px] px-2"
        >
          <Icon name="add" className="text-[16px]" />
          Add item
        </button>
      </div>

      <form onSubmit={handleQuickAdd} className="flex items-center gap-2">
        <div className="relative flex-1 flex items-center">
          <Icon name="add" className="absolute left-3 text-[18px] text-ink-sub pointer-events-none" />
          <input
            ref={quickInputRef}
            type="text"
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="Quick add item to buy..."
            className="w-full h-10 pl-9 pr-3 bg-surface rounded-xl border border-line/70 focus:border-sky focus:outline-none text-body-md text-ink placeholder:text-ink-sub/70 shadow-2xs transition-all"
          />
        </div>
        {quickText.trim() && (
          <button
            type="submit"
            className="h-10 px-4 rounded-xl bg-sky text-ink font-semibold text-label-md transition-all active:scale-95 shadow-2xs flex items-center gap-1 cursor-pointer shrink-0"
          >
            Add
          </button>
        )}
      </form>

      {items.length === 0 ? (
        <EmptyState
          message="Your shopping list is empty."
          action={{
            label: 'Add item',
            onClick: () => quickInputRef.current?.focus(),
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
                onCheck={() => handleCheck(x)}
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
                  onSelect: () => handleCheck(m),
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
