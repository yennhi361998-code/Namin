import { useMemo, useRef, useState } from 'react';
import { FormField, Stepper, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { cx, PrimaryButton } from '../components/ui';
import { addDays, shortDate, today } from '../lib/dates';
import { formatVnd, parseVnd, priceInputValue } from '../lib/money';
import type { DateStr } from '../lib/types';
import { CategoryTile } from '../components/money';
import { DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import { useStore } from '../store';
import { useCategoryChoices } from '../store/selectors';

export function PurchaseSheet({ open, onClose, shoppingId, itemId }: { open: boolean; onClose: () => void; shoppingId?: string; itemId?: string }) {
  // Snapshot: saving removes the list entry, and the sheet still renders while it animates out.
  const [entry] = useState(() => (shoppingId ? useStore.getState().shopping.find((x) => x.id === shoppingId) : undefined));
  const item = useStore((s) => s.items.find((i) => i.id === (entry?.itemId ?? itemId)));
  const purchases = useStore((s) => s.purchases);
  const recordPurchase = useStore((s) => s.recordPurchase);

  const last = useMemo(
    () => (item ? purchases.filter((p) => p.itemId === item.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0] : undefined),
    [item, purchases],
  );

  const name = entry?.name ?? item?.name ?? '';
  const [price, setPrice] = useState(priceInputValue(entry?.estimatedPrice ?? last?.price ?? null));
  const [store, setStore] = useState(entry?.store || last?.store || '');
  const [date, setDate] = useState<DateStr>(today());
  const [quantity, setQuantity] = useState(entry?.quantity ?? item?.quantity ?? 1);
  const spendChoices = useCategoryChoices('expense');
  // Defaults to what this item was filed under last time, else Daily.
  const [spendCategoryId, setSpendCategoryId] = useState<string>(item?.spendCategoryId || DAILY_CATEGORY_ID);
  const [priceError, setPriceError] = useState<string | null>(null);
  const submitted = useRef(false);

  const t = today();
  const dateOptions = [
    { label: 'Today', value: t },
    { label: 'Yesterday', value: addDays(t, -1) },
  ];

  const save = () => {
    if (submitted.current || !name) return;
    const parsed = parseVnd(price);
    if (Number.isNaN(parsed)) {
      setPriceError('Enter a price like 189,000 or 189k.');
      return;
    }
    if (date > t) return;
    submitted.current = true;
    // No toast: the item leaving the list and appearing in History is the feedback.
    recordPurchase({
      shoppingItemId: entry?.id,
      itemId: item?.id,
      name,
      category: entry?.category ?? item?.category ?? 'Other',
      quantity,
      unit: entry?.unit ?? item?.unit ?? '',
      price: parsed,
      store,
      purchaseDate: date,
      spendCategoryId,
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={name || 'Record purchase'} footer={<PrimaryButton onClick={save}>Save purchase</PrimaryButton>}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FormField
          label="Price"
          htmlFor="purchase-price"
          error={priceError}
          hint={last?.price != null ? `Last time ${formatVnd(last.price)} on ${shortDate(last.purchaseDate)}` : 'Optional'}
        >
          <TextInput
            id="purchase-price"
            data-autofocus
            prefix="₫"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              if (priceError) setPriceError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => {
              const v = parseVnd(price);
              if (v != null && !Number.isNaN(v)) setPrice(priceInputValue(v));
            }}
            placeholder="0"
            invalid={!!priceError}
            enterKeyHint="done"
            autoComplete="off"
          />
        </FormField>

        <FormField label="Store" htmlFor="purchase-store" hint="Optional">
          <TextInput id="purchase-store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="e.g. WinMart" autoComplete="off" maxLength={40} />
        </FormField>

        <FormField label="Spending category">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5" role="radiogroup" aria-label="Spending category">
            {spendChoices.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={spendCategoryId === c.id}
                onClick={() => setSpendCategoryId(c.id)}
                className={cx(
                  'min-h-[40px] pl-1.5 pr-3 rounded-full text-label-md border inline-flex items-center gap-1.5 shrink-0',
                  spendCategoryId === c.id ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
                )}
              >
                <CategoryTile category={c} size={28} />
                {c.name}
              </button>
            ))}
          </div>
        </FormField>

        <div className="flex gap-4 items-start flex-wrap">
          <FormField label="Date">
            <div className="flex gap-2 flex-wrap">
              {dateOptions.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={date === o.value}
                  onClick={() => setDate(o.value)}
                  className={cx('min-h-[40px] px-3 rounded-full text-label-md border', date === o.value ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub')}
                >
                  {o.label}
                </button>
              ))}
              <label
                className={cx(
                  'relative min-h-[40px] px-3 rounded-full text-label-md border inline-flex items-center',
                  !dateOptions.some((o) => o.value === date) ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
                )}
              >
                {dateOptions.some((o) => o.value === date) ? 'Earlier' : shortDate(date)}
                <input
                  type="date"
                  max={t}
                  value={date}
                  onChange={(e) => e.target.value && e.target.value <= t && setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full"
                  aria-label="Choose purchase date"
                />
              </label>
            </div>
          </FormField>
          <FormField label="Quantity">
            <Stepper label="Quantity" value={quantity} onChange={setQuantity} />
          </FormField>
        </div>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  );
}
