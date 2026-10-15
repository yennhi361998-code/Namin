import { useRef, useState } from 'react';
import { FormField, TextArea, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { ChipGroup, Icon, PrimaryButton } from '../components/ui';
import { CATEGORY_COLOR } from '../lib/categories';
import { CATEGORIES, type Category } from '../lib/types';
import { useStore } from '../store';
import { toast } from '../store/ui';

export function ItemSheet({ open, onClose, itemId }: { open: boolean; onClose: () => void; itemId: string }) {
  const item = useStore((s) => s.items.find((i) => i.id === itemId));
  const updateItem = useStore((s) => s.updateItem);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<Category>(item?.category ?? 'Other');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [usageUnit, setUsageUnit] = useState(item?.usageUnit ?? '');
  const [usagePerPurchaseUnit, setUsagePerPurchaseUnit] = useState(
    item?.usagePerPurchaseUnit ? String(item.usagePerPurchaseUnit) : '',
  );
  const [stock, setStock] = useState(item?.currentStock != null ? String(item.currentStock) : '');
  const [showConversion, setShowConversion] = useState(
    !!(item?.usagePerPurchaseUnit || (item?.usageUnit && item.usageUnit !== item.unit)),
  );
  const [usage, setUsage] = useState(item?.expectedUsageDays ? String(item.expectedUsageDays) : '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const submitted = useRef(false);

  const save = () => {
    if (!item || submitted.current) return;
    if (!name.trim()) return setNameError('Enter an item name.');
    const days = usage.trim() ? Number(usage) : null;
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 730)) return setUsageError('Enter a number of days between 1 and 730.');
    const stockNum = stock.trim() ? Number(stock) : null;
    const ratioNum = showConversion && usagePerPurchaseUnit.trim() ? Number(usagePerPurchaseUnit) : null;
    submitted.current = true;
    updateItem(item.id, {
      name: name.trim(),
      category,
      unit: unit.trim(),
      usageUnit: showConversion && usageUnit.trim() ? usageUnit.trim() : undefined,
      usagePerPurchaseUnit: ratioNum,
      currentStock: stockNum != null && !isNaN(stockNum) ? Math.max(0, stockNum) : null,
      expectedUsageDays: days,
      notes: notes.trim(),
    });
    toast({ title: 'Item updated' });
    onClose();
  };

  const effectiveUsageUnit = (showConversion && usageUnit.trim()) || unit.trim() || 'units';

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit item" footer={<PrimaryButton onClick={save}>Save changes</PrimaryButton>}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FormField label="Item name" htmlFor="edit-item-name" error={nameError}>
          <TextInput
            id="edit-item-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            invalid={!!nameError}
            maxLength={80}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Category">
          <ChipGroup label="Category" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ label: c, value: c, dot: CATEGORY_COLOR[c] }))} />
        </FormField>
        <FormField label="Purchase unit" htmlFor="edit-item-unit" hint="Packaging unit when buying">
          <TextInput id="edit-item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" maxLength={20} autoComplete="off" />
        </FormField>

        {/* Optional conversion for multi-item packs/rolls */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowConversion((v) => !v)}
            className="flex items-center gap-1.5 text-label-md text-link font-medium self-start -my-1"
          >
            <Icon name={showConversion ? 'expand_less' : 'expand_more'} className="text-[18px]" />
            {showConversion ? 'Hide packaging conversion' : '+ Packaging conversion'}
          </button>

          {showConversion && (
            <div className="p-3.5 rounded-xl bg-soft border border-line flex flex-col gap-3">
              <span className="text-body-sm text-ink-sub">
                For items bought in packages but consumed individually.
              </span>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Items per purchase unit" htmlFor="edit-item-ratio">
                  <TextInput
                    id="edit-item-ratio"
                    inputMode="numeric"
                    value={usagePerPurchaseUnit}
                    onChange={(e) => setUsagePerPurchaseUnit(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="Ratio"
                  />
                </FormField>
                <FormField label="Usage / consumable unit" htmlFor="edit-item-usage-unit">
                  <TextInput
                    id="edit-item-usage-unit"
                    value={usageUnit}
                    onChange={(e) => setUsageUnit(e.target.value)}
                    placeholder="Usage unit"
                  />
                </FormField>
              </div>
              {unit.trim() && usageUnit.trim() && usagePerPurchaseUnit && (
                <div className="text-caption font-medium text-sky-dark px-2 py-1 bg-white/60 rounded">
                  Conversion: 1 {unit.trim()} = {usagePerPurchaseUnit} {usageUnit.trim()}
                </div>
              )}
            </div>
          )}
        </div>

        <FormField
          label="Current stock"
          htmlFor="edit-item-stock"
          hint={`Household quantity remaining in ${effectiveUsageUnit}`}
        >
          <TextInput
            id="edit-item-stock"
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ''))}
            placeholder={`0 (${effectiveUsageUnit})`}
            autoComplete="off"
          />
        </FormField>

        <FormField
          label="Usually lasts (days)"
          htmlFor="edit-item-usage"
          error={usageError}
          hint="Optional. Used for the restock estimate until there are at least two purchases."
        >
          <TextInput
            id="edit-item-usage"
            inputMode="numeric"
            value={usage}
            onChange={(e) => {
              setUsage(e.target.value.replace(/[^\d]/g, ''));
              setUsageError(null);
            }}
            placeholder="30"
            invalid={!!usageError}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Notes" htmlFor="edit-item-notes">
          <TextArea id="edit-item-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" maxLength={300} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  );
}

