import { useRef, useState } from 'react';
import { FormField, TextArea, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { ChipGroup, Icon, PrimaryButton } from '../components/ui';
import { guessCategory } from '../lib/categories';
import { ROOMS } from '../lib/rooms';
import type { Category } from '../lib/types';
import { useStore } from '../store';
import { toast } from '../store/ui';

export function ItemSheet({ open, onClose, itemId }: { open: boolean; onClose: () => void; itemId?: string }) {
  const item = useStore((s) => (itemId ? s.items.find((i) => i.id === itemId) : undefined));
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);

  const isEditing = Boolean(item);
  const [name, setName] = useState(item?.name ?? '');
  const [room, setRoom] = useState<string | null>(item?.room ?? null);
  const [hasManuallySetRoom, setHasManuallySetRoom] = useState(Boolean(item?.room));
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

  const handleNameChange = (val: string) => {
    setName(val);
    setNameError(null);
    if (!isEditing && !hasManuallySetRoom) {
      const guessed = guessCategory(val);
      if (guessed === 'Kitchen') setRoom('Kitchen');
      else if (guessed === 'Bathroom') setRoom('Bathroom');
      else if (guessed === 'Cleaning') setRoom('Laundry');
    }
  };

  const inferCategory = (targetRoom: string | null, targetName: string): Category => {
    if (targetRoom === 'Kitchen') return 'Kitchen';
    if (targetRoom === 'Bathroom') return 'Bathroom';
    if (targetRoom === 'Laundry') return 'Cleaning';
    const guessed = guessCategory(targetName);
    if (guessed) return guessed;
    return 'Other';
  };

  const save = () => {
    if (submitted.current) return;
    if (!name.trim()) return setNameError('Enter an item name.');
    const days = usage.trim() ? Number(usage) : null;
    if (days != null && (!Number.isInteger(days) || days < 1 || days > 730)) {
      return setUsageError('Enter a number of days between 1 and 730.');
    }
    const stockNum = stock.trim() ? Number(stock) : null;
    const ratioNum = showConversion && usagePerPurchaseUnit.trim() ? Number(usagePerPurchaseUnit) : null;
    submitted.current = true;

    const resolvedCategory: Category = item?.category ?? inferCategory(room, name.trim());

    if (isEditing && item) {
      updateItem(item.id, {
        name: name.trim(),
        room,
        category: resolvedCategory,
        unit: unit.trim(),
        usageUnit: showConversion && usageUnit.trim() ? usageUnit.trim() : undefined,
        usagePerPurchaseUnit: ratioNum,
        currentStock: stockNum != null && !isNaN(stockNum) ? Math.max(0, stockNum) : null,
        expectedUsageDays: days,
        notes: notes.trim(),
      });
      toast({ title: 'Item updated' });
    } else {
      addItem({
        name: name.trim(),
        room,
        category: resolvedCategory,
        unit: unit.trim(),
        usageUnit: showConversion && usageUnit.trim() ? usageUnit.trim() : undefined,
        usagePerPurchaseUnit: ratioNum,
        currentStock: stockNum != null && !isNaN(stockNum) ? Math.max(0, stockNum) : null,
        expectedUsageDays: days,
        notes: notes.trim(),
      });
      toast({ title: 'Item added', subtitle: name.trim() });
    }
    onClose();
  };

  const effectiveUsageUnit = (showConversion && usageUnit.trim()) || unit.trim() || 'units';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit item' : 'Add item'}
      footer={<PrimaryButton onClick={save}>{isEditing ? 'Save changes' : 'Add item'}</PrimaryButton>}
    >
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
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Dish soap, Garbage bags, Sponges..."
            invalid={!!nameError}
            maxLength={80}
            autoComplete="off"
            autoFocus={!isEditing}
          />
        </FormField>

        <FormField label="Room">
          <ChipGroup
            label="Room"
            value={room}
            onChange={(r) => {
              setRoom(r);
              setHasManuallySetRoom(true);
            }}
            options={[
              { label: 'None', value: null as string | null },
              ...ROOMS.map((r) => ({
                label: r.name,
                value: r.name as string | null,
                icon: r.icon,
                iconColor: r.fg,
              })),
            ]}
          />
        </FormField>

        <FormField label="Purchase unit" htmlFor="edit-item-unit" hint="Packaging unit when buying">
          <TextInput
            id="edit-item-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="e.g. bottle, pack, box, roll"
            maxLength={20}
            autoComplete="off"
          />
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
                    placeholder="e.g. 50"
                  />
                </FormField>
                <FormField label="Usage / consumable unit" htmlFor="edit-item-usage-unit">
                  <TextInput
                    id="edit-item-usage-unit"
                    value={usageUnit}
                    onChange={(e) => setUsageUnit(e.target.value)}
                    placeholder="e.g. bags, tablets"
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
          <TextArea
            id="edit-item-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Brands, preferred stores, storage location..."
            maxLength={300}
          />
        </FormField>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  );
}

