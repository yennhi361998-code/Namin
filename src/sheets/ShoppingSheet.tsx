import { useMemo, useRef, useState } from 'react';
import { Stepper } from '../components/forms';
import { HOUSEHOLD_CATEGORY_ICONS } from '../components/icons';
import { AmountPad, Key } from '../components/keypad';
import { BottomSheet } from '../components/overlay';
import { cx, Icon } from '../components/ui';
import { press, evaluate } from '../lib/calc';
import { CATEGORY_COLOR, guessCategory } from '../lib/categories';
import { formatVnd } from '../lib/money';
import { CATEGORIES, type Category, type HouseholdItem } from '../lib/types';
import { useStore } from '../store';
import { removeFromList } from '../store/actions';
import { toast } from '../store/ui';

/** Shopping-list category on its pastel tint (same tile shape as money categories). */
function HouseholdTile({ category, size = 44 }: { category: Category; size?: number }) {
  const { icon: Glyph, fg } = HOUSEHOLD_CATEGORY_ICONS[category];
  return (
    <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, background: `${CATEGORY_COLOR[category]}55` }}>
      <Glyph size={Math.round(size * 0.5)} color={fg} strokeWidth={2} aria-hidden />
    </span>
  );
}

/**
 * Add or edit a shopping-list item, laid out like Add expense: name on top, category grid,
 * then the keypad for the estimated price. Only the name is required.
 */
export function ShoppingSheet({ open, onClose, shoppingId }: { open: boolean; onClose: () => void; shoppingId?: string }) {
  const existing = useStore((s) => (shoppingId ? s.shopping.find((x) => x.id === shoppingId) : undefined));
  const items = useStore((s) => s.items);
  const shopping = useStore((s) => s.shopping);
  const purchases = useStore((s) => s.purchases);
  const addToShopping = useStore((s) => s.addToShopping);
  const updateShoppingItem = useStore((s) => s.updateShoppingItem);

  const [name, setName] = useState(existing?.name ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [category, setCategory] = useState<Category | null>(existing?.category ?? null);
  const [expr, setExpr] = useState(existing?.estimatedPrice != null ? String(existing.estimatedPrice) : '');
  const [store, setStore] = useState(existing?.store ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [picked, setPicked] = useState<HouseholdItem | null>(null);
  const submitted = useRef(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const known = useMemo(() => items.find((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase()), [items, name]);
  const lastPurchase = useMemo(() => {
    const it = picked ?? known;
    if (!it) return undefined;
    return purchases.filter((p) => p.itemId === it.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0];
  }, [picked, known, purchases]);

  // Suggest things the household has bought before that aren't on the list yet.
  const suggestions = useMemo(() => {
    if (existing) return [];
    const q = name.trim().toLowerCase();
    if (!q || known) return [];
    const onList = new Set(shopping.filter((x) => !x.completed).map((x) => x.itemId));
    return items.filter((i) => !onList.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 4);
  }, [existing, name, known, items, shopping]);

  const stores = useMemo(() => {
    const counts = new Map<string, number>();
    purchases.forEach((p) => p.store && counts.set(p.store, (counts.get(p.store) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
  }, [purchases]);

  const effectiveCategory: Category = category ?? known?.category ?? guessCategory(name) ?? 'Other';

  const pick = (it: HouseholdItem) => {
    setPicked(it);
    setName(it.name);
    setQuantity(it.quantity || 1);
    setUnit(it.unit);
    setCategory(it.category);
    setNameError(null);
  };

  const submit = () => {
    if (submitted.current) return;
    if (!name.trim()) {
      setNameError('Enter an item name.');
      nameInput.current?.focus();
      return;
    }
    const value = evaluate(expr);
    const input = {
      name,
      quantity,
      // Blank means "use the item's usual unit", not "no unit".
      unit: unit.trim() || (existing ? '' : undefined),
      category: effectiveCategory,
      // Empty keypad = no estimate; the store then fills in the last price it knows.
      estimatedPrice: value != null && value > 0 ? Math.round(value) : null,
      store,
      note,
    };
    if (existing) {
      submitted.current = true;
      updateShoppingItem(existing.id, { ...input, name: name.trim(), store: store.trim(), note: note.trim() });
      onClose();
      return;
    }
    const res = addToShopping({ ...input, itemId: known?.id ?? picked?.id });
    if (!res.ok) {
      setNameError(res.reason === 'duplicate' ? `${known?.name ?? name.trim()} is already on your list.` : 'Enter an item name.');
      return;
    }
    submitted.current = true;
    toast({ title: 'Added to shopping list', subtitle: name.trim() });
    onClose();
  };

  const chip = (active: boolean) =>
    cx('min-h-[36px] px-3 rounded-full text-label-md border shrink-0', active ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={existing ? 'Edit item' : 'Add item'}
      bodyClassName="pt-1"
      footerClassName="!bg-soft border-line-strong/60 px-3"
      header={
        <div className="grid grid-cols-[96px_1fr_96px] items-center px-2 pb-2">
          <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-ink-sub active:bg-soft" aria-label="Close">
            <Icon name="close" className="text-[24px]" />
          </button>
          <h2 className="text-center">
            <span className="inline-flex items-center min-h-[36px] px-4 rounded-full bg-sky text-ink text-label-md font-semibold shadow-sm">{existing ? 'Edit item' : 'Add item'}</span>
          </h2>
          <div className="flex items-center justify-end">
            {existing && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  removeFromList(existing.id);
                }}
                className="w-11 h-11 flex items-center justify-center rounded-full text-err-ink active:bg-err/50"
                aria-label="Remove from list"
              >
                <Icon name="delete" className="text-[22px]" />
              </button>
            )}
            <button type="button" onClick={submit} className="w-11 h-11 flex items-center justify-center rounded-full text-link active:bg-soft" aria-label={existing ? 'Save changes' : 'Add to shopping list'}>
              <Icon name="check" className="text-[26px]" />
            </button>
          </div>
        </div>
      }
      footer={
        <AmountPad
          expr={expr}
          onKey={(k) => setExpr((e) => press(e, k))}
          note={note}
          onNote={setNote}
          notePlaceholder="Note (e.g. refill pouch)"
          hint={lastPurchase?.price != null && !expr ? 'Last price' : 'Estimated price'}
          placeholderAmount={lastPurchase?.price ?? null}
          onSave={submit}
          firstKey={
            <Key onClick={() => setExpr('')} tone="soft" label="Clear price">
              <span className="flex items-center gap-1 text-label-md font-semibold">
                <Icon name="clear" className="text-[16px]" />
                Clear
              </span>
            </Key>
          }
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <input
            ref={nameInput}
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setPicked(null);
              if (nameError) setNameError(null);
            }}
            onKeyDown={(e) => {
              // Return just closes the phone keyboard so the price keypad shows; ✓ saves.
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="What do you need? e.g. Detergent"
            aria-label="Item name"
            aria-invalid={!!nameError || undefined}
            enterKeyHint="done"
            autoComplete="off"
            maxLength={80}
            className={cx(
              'w-full min-h-[52px] px-4 rounded-2xl bg-canvas border-[1.5px] text-body-lg text-ink placeholder:text-ink-sub/80 focus:outline-none focus:border-sky-dark focus:bg-surface transition-colors',
              nameError ? 'border-err-ink' : 'border-line',
            )}
          />
          {nameError && (
            <p className="text-body-sm text-err-ink flex items-center gap-1 mt-1.5" role="alert">
              <Icon name="error" className="text-[15px]" />
              {nameError}
            </p>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2" aria-label="Bought before">
              {suggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => pick(s)} className="min-h-[36px] pl-1 pr-3 rounded-full bg-soft text-ink text-label-md inline-flex items-center gap-1.5">
                  <HouseholdTile category={s.category} size={28} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {lastPurchase && (
            <p className="text-body-sm text-ink-sub mt-1.5">
              Last bought {lastPurchase.price != null ? `for ${formatVnd(lastPurchase.price)}` : ''}
              {lastPurchase.store ? ` at ${lastPurchase.store}` : ''}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-x-1 gap-y-1" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => {
            const active = c === effectiveCategory;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(c)}
                className={cx('flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-colors', active ? 'border-sky-dark bg-soft' : 'border-transparent active:bg-canvas')}
              >
                <HouseholdTile category={c} />
                <span className={cx('text-label-sm', active ? 'text-ink font-semibold' : 'text-ink-muted')}>{c}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Stepper label="Quantity" value={quantity} onChange={setQuantity} />
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={known?.unit || 'unit (bottle, pack…)'}
            aria-label="Unit"
            maxLength={20}
            autoComplete="off"
            className="flex-1 min-w-0 min-h-[46px] px-3 rounded-lg bg-surface border-[1.5px] border-line-strong text-body-md text-ink placeholder:text-ink-sub/80 focus:outline-none focus:border-sky-dark"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="radiogroup" aria-label="Store">
          <span className="flex items-center gap-1 text-label-md text-ink-sub shrink-0 pr-1">
            <Icon name="storefront" className="text-[16px]" />
            Store
          </span>
          {stores.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={store === s} onClick={() => setStore(store === s ? '' : s)} className={chip(store === s)}>
              {s}
            </button>
          ))}
          <input
            value={stores.includes(store) ? '' : store}
            onChange={(e) => setStore(e.target.value)}
            placeholder={lastPurchase?.store && !store ? lastPurchase.store : 'Other…'}
            aria-label="Other store"
            maxLength={40}
            autoComplete="off"
            className="min-h-[36px] w-28 shrink-0 px-3 rounded-full bg-surface border border-line text-label-md text-ink placeholder:text-ink-sub/80 focus:outline-none focus:border-sky-dark"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
