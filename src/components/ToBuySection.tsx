import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ActionSheet, SwipeRow } from './overlay';
import { ShoppingItemRow } from './rows';
import { Checkbox, Icon } from './ui';
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
  const [isAdding, setIsAdding] = useState(false);
  const [quickText, setQuickText] = useState('');
  const quickInputRef = useRef<HTMLInputElement>(null);
  const [menuFor, setMenuFor] = useState<ShoppingItem | null>(null);
  const [last, setLast] = useState<ShoppingItem | null>(null);
  if (menuFor && menuFor !== last) setLast(menuFor);
  const m = menuFor ?? last;

  const startAdding = () => {
    setIsAdding(true);
    setTimeout(() => quickInputRef.current?.focus(), 40);
  };

  const commitItem = (andContinue: boolean) => {
    const trimmed = quickText.trim();
    if (trimmed) {
      addToShopping({
        name: trimmed,
        quantity: 1,
        category: 'Other',
      });
      setQuickText('');
      toast({ title: `Added "${trimmed}" to list` });
      if (andContinue) {
        quickInputRef.current?.focus();
      } else {
        setIsAdding(false);
      }
    } else {
      setIsAdding(false);
    }
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
    <section className="flex flex-col" aria-labelledby="tobuy-section-title">
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
          onClick={startAdding}
          className="text-label-sm font-semibold text-link hover:underline flex items-center gap-1 min-h-[36px] px-2 cursor-pointer"
        >
          <Icon name="add" className="text-[16px]" />
          Add item
        </button>
      </div>

      {isAdding && (
        <div className="p-3.5 flex items-start gap-3 bg-surface/80 rounded-xl border border-sky/40 shadow-xs transition-all my-2">
          <div className="mt-px shrink-0">
            <Checkbox checked={false} onChange={() => {}} label="New item" shape="square" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              ref={quickInputRef}
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitItem(true);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setQuickText('');
                  setIsAdding(false);
                }
              }}
              onBlur={() => commitItem(false)}
              placeholder="Item name..."
              className="w-full bg-transparent text-body-md text-ink placeholder:text-ink-sub/60 focus:outline-none"
            />
          </div>
        </div>
      )}

        {items.length === 0 && !isAdding ? (
          <div className="py-8 text-center text-body-sm text-ink-sub">
            Your shopping list is empty.
          </div>
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
