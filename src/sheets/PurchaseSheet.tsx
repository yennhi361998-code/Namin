import { useMemo, useRef, useState } from 'react';
import { FormField, Stepper, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { cx, Icon, MemberAvatar, PrimaryButton } from '../components/ui';
import { DatePickerModal } from '../components/DatePickerModal';
import { addDays, shortDate, today } from '../lib/dates';
import { formatVnd, parseVnd, priceInputValue } from '../lib/money';
import type { DateStr } from '../lib/types';
import { CategoryTile } from '../components/money';
import { DAILY_CATEGORY_ID } from '../lib/moneyCategories';
import { useStore } from '../store';
import { useCategoryChoices } from '../store/selectors';
import { AccountSheet } from './AccountSheet';

export function PurchaseSheet({ open, onClose, shoppingId, itemId }: { open: boolean; onClose: () => void; shoppingId?: string; itemId?: string }) {
  // Snapshot: saving removes the list entry, and the sheet still renders while it animates out.
  const [entry] = useState(() => (shoppingId ? useStore.getState().shopping.find((x) => x.id === shoppingId) : undefined));
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(entry?.itemId ?? itemId);
  const items = useStore((s) => s.items);
  const item = useStore((s) => s.items.find((i) => i.id === (entry?.itemId ?? selectedItemId)));
  const purchases = useStore((s) => s.purchases);
  const recordPurchase = useStore((s) => s.recordPurchase);
  const accounts = useStore((s) => s.accounts ?? []);
  const members = useStore((s) => s.members ?? []);
  const currentMemberId = useStore((s) => s.currentMemberId);

  const [customName, setCustomName] = useState(entry?.name ?? item?.name ?? '');

  const matchedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) : items.find((i) => i.name.trim().toLowerCase() === customName.trim().toLowerCase())),
    [items, selectedItemId, customName],
  );
  const effectiveItem = item ?? matchedItem;

  const last = useMemo(
    () => (effectiveItem ? purchases.filter((p) => p.itemId === effectiveItem.id).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate))[0] : undefined),
    [effectiveItem, purchases],
  );

  const name = entry?.name ?? effectiveItem?.name ?? customName;
  const [price, setPrice] = useState(priceInputValue(entry?.estimatedPrice ?? last?.price ?? null));
  const [store, setStore] = useState(entry?.store || last?.store || '');
  const [date, setDate] = useState<DateStr>(today());
  const [accountId, setAccountId] = useState<string | null>(last?.accountId ?? accounts[0]?.id ?? null);
  const [memberId, setMemberId] = useState<string | null>(last?.memberId ?? currentMemberId);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quantity, setQuantity] = useState(entry?.quantity ?? effectiveItem?.quantity ?? 1);
  const [unit, setUnit] = useState(entry?.unit ?? effectiveItem?.unit ?? '');
  const [usagePerPurchaseUnit, setUsagePerPurchaseUnit] = useState(
    effectiveItem?.usagePerPurchaseUnit ? String(effectiveItem.usagePerPurchaseUnit) : '',
  );
  const [usageUnit, setUsageUnit] = useState(effectiveItem?.usageUnit ?? '');
  const spendChoices = useCategoryChoices('expense');
  // Defaults to what this item was filed under last time, else Daily.
  const [spendCategoryId, setSpendCategoryId] = useState<string>(effectiveItem?.spendCategoryId || DAILY_CATEGORY_ID);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const submitted = useRef(false);

  const pickItem = (it: typeof items[0]) => {
    setSelectedItemId(it.id);
    setCustomName(it.name);
    if (it.unit) setUnit(it.unit);
    if (it.usageUnit) setUsageUnit(it.usageUnit);
    if (it.usagePerPurchaseUnit) setUsagePerPurchaseUnit(String(it.usagePerPurchaseUnit));
    if (it.spendCategoryId) setSpendCategoryId(it.spendCategoryId);
    if (nameError) setNameError(null);
  };

  const t = today();
  const dateOptions = [
    { label: 'Today', value: t },
    { label: 'Yesterday', value: addDays(t, -1) },
  ];

  const save = () => {
    if (submitted.current) return;
    if (!name.trim()) {
      setNameError('Enter an item name.');
      return;
    }
    const parsed = parseVnd(price);
    if (Number.isNaN(parsed)) {
      setPriceError('Enter a price like 189,000 or 189k.');
      return;
    }
    if (date > t) return;
    submitted.current = true;
    const parsedRatio = usagePerPurchaseUnit.trim() ? Number(usagePerPurchaseUnit) : 1;
    const ratioNum = !isNaN(parsedRatio) && parsedRatio > 0 ? parsedRatio : 1;
    const resolvedUsageUnit = usageUnit.trim() || effectiveItem?.usageUnit || (ratioNum > 1 ? 'items' : unit.trim());
    recordPurchase({
      shoppingItemId: entry?.id,
      itemId: effectiveItem?.id,
      name: name.trim(),
      category: entry?.category ?? effectiveItem?.category ?? 'Other',
      quantity,
      unit: unit.trim(),
      usageUnit: resolvedUsageUnit,
      usagePerPurchaseUnit: ratioNum,
      price: parsed,
      store,
      purchaseDate: date,
      spendCategoryId,
      accountId,
      memberId,
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
        {!entry && !item && (
          <div className="flex flex-col gap-2">
            <FormField label="Item name" htmlFor="purchase-item-name" error={nameError}>
              <TextInput
                id="purchase-item-name"
                data-autofocus
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  setSelectedItemId(undefined);
                  if (nameError) setNameError(null);
                }}
                placeholder="Item name"
                maxLength={80}
                autoComplete="off"
              />
            </FormField>
            {items.length > 0 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 pt-0.5" aria-label="Suggested items">
                {items.slice(0, 8).map((it) => {
                  const active = effectiveItem?.id === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => pickItem(it)}
                      className={cx(
                        'min-h-[32px] px-3 rounded-full text-label-sm border shrink-0 transition-all',
                        active ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub hover:text-ink'
                      )}
                    >
                      {it.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <FormField
          label="Price"
          htmlFor="purchase-price"
          error={priceError}
          hint={last?.price != null ? `Last time ${formatVnd(last.price)} on ${shortDate(last.purchaseDate)}` : 'Optional'}
        >
          <TextInput
            id="purchase-price"
            data-autofocus={Boolean(entry || item)}
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

        <div className="grid grid-cols-[140px_1fr] gap-3 items-start">
          <FormField label="Quantity">
            <Stepper
              value={quantity}
              onChange={setQuantity}
              label="Purchase quantity"
              min={1}
            />
          </FormField>
          <FormField
            label="Packaging unit"
            htmlFor="purchase-unit"
          >
            <TextInput
              id="purchase-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unit"
              maxLength={20}
              autoComplete="off"
            />
          </FormField>
        </div>

        {/* Packaging conversion: items per package & usage unit */}
        <div className="p-3.5 rounded-2xl bg-surface border border-line-strong/60 shadow-xs flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
              <Icon name="inventory_2" className="text-[16px] text-sky-dark" />
              <span>Items per {unit.trim() || 'package'}</span>
            </span>
            {unit.trim() && (
              <span className="text-caption text-sky-dark font-medium">
                {usagePerPurchaseUnit.trim()
                  ? `1 ${unit.trim()} = ${usagePerPurchaseUnit.trim()} ${usageUnit.trim() || 'items'}`
                  : effectiveItem?.usagePerPurchaseUnit
                    ? `1 ${unit.trim()} = ${effectiveItem.usagePerPurchaseUnit} ${effectiveItem.usageUnit || 'items'}`
                    : '1-to-1 default'}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[130px_1fr] gap-2.5 items-center">
            <TextInput
              id="purchase-ratio"
              inputMode="numeric"
              value={usagePerPurchaseUnit}
              onChange={(e) => setUsagePerPurchaseUnit(e.target.value.replace(/[^\d]/g, ''))}
              placeholder={effectiveItem?.usagePerPurchaseUnit ? String(effectiveItem.usagePerPurchaseUnit) : '1'}
              aria-label="Items per package"
            />
            <TextInput
              id="purchase-usage-unit"
              value={usageUnit}
              onChange={(e) => setUsageUnit(e.target.value)}
              placeholder={effectiveItem?.usageUnit ? `Usage unit: ${effectiveItem.usageUnit}` : 'Usage unit'}
              aria-label="Usage unit"
              maxLength={20}
              autoComplete="off"
            />
          </div>

          {/* Stock live preview */}
          {(() => {
            const parsedRatio = usagePerPurchaseUnit.trim()
              ? Number(usagePerPurchaseUnit)
              : (effectiveItem?.usagePerPurchaseUnit ?? 1);
            const ratio = parsedRatio > 0 ? parsedRatio : 1;
            const displayUsageUnit =
              usageUnit.trim() ||
              effectiveItem?.usageUnit ||
              (ratio > 1 ? 'items' : (unit.trim() || effectiveItem?.unit || 'units'));
            const inflow = quantity * ratio;

            return (
              <div className="flex items-center justify-between text-caption px-0.5 text-sky-dark font-medium pt-0.5">
                <span>
                  {effectiveItem?.currentStock != null
                    ? `Current stock: ${effectiveItem.currentStock} ${displayUsageUnit}`
                    : 'Inventory stock'}
                </span>
                <span>
                  {ratio > 1
                    ? `Adds +${inflow} ${displayUsageUnit} (${quantity} × ${ratio})`
                    : `Adds +${quantity} ${displayUsageUnit} to stock`}
                </span>
              </div>
            );
          })()}
        </div>

        <FormField label="Store" htmlFor="purchase-store" hint="Optional">
          <TextInput id="purchase-store" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Store name" autoComplete="off" maxLength={40} />
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
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className={cx(
                'min-h-[40px] px-3 rounded-full text-label-md border inline-flex items-center transition-colors',
                !dateOptions.some((o) => o.value === date) ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
              )}
            >
              {dateOptions.some((o) => o.value === date) ? 'Earlier' : shortDate(date)}
            </button>
          </div>
        </FormField>

        {/* Account selection */}
        <FormField label="Payment account">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
            {accounts.map((acc) => {
              const active = acc.id === accountId;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccountId(active ? null : acc.id)}
                  className={cx(
                    'min-h-[38px] px-3 rounded-full text-label-md border inline-flex items-center gap-1.5 shrink-0 transition-all active:scale-95',
                    active ? 'bg-header border-header-ink text-header-ink font-semibold shadow-xs' : 'bg-surface border-line text-ink hover:bg-soft'
                  )}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: acc.color || '#3FA88B' }} />
                  {acc.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCreatingAccount(true)}
              className="min-h-[38px] px-3 rounded-full text-label-md border border-dashed border-line-strong text-ink-sub hover:text-ink inline-flex items-center gap-1 shrink-0 active:scale-95"
            >
              <Icon name="add" className="text-[16px]" />
              Add account
            </button>
          </div>
        </FormField>

        {/* Member selection */}
        <FormField label="Purchased by">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
            {members.map((m) => {
              const active = m.id === memberId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberId(active ? null : m.id)}
                  className={cx(
                    'min-h-[38px] px-3 rounded-full text-label-md border inline-flex items-center gap-1.5 shrink-0 transition-all active:scale-95',
                    active ? 'bg-header border-header-ink text-header-ink font-semibold shadow-xs' : 'bg-surface border-line text-ink hover:bg-soft'
                  )}
                >
                  <MemberAvatar member={m} size={20} />
                  {m.name}
                </button>
              );
            })}
          </div>
        </FormField>

        <button type="submit" hidden />

        <DatePickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          value={date}
          onChange={setDate}
          title="Select Purchase Date"
        />
      </form>
      {creatingAccount && (
        <AccountSheet
          open={creatingAccount}
          onClose={() => setCreatingAccount(false)}
          onCreated={(newId) => setAccountId(newId)}
        />
      )}
    </BottomSheet>
  );
}
