import { useRef, useState } from 'react';
import { FormField, TextArea, TextInput } from '../components/forms';
import { BottomSheet } from '../components/overlay';
import { ChipGroup, PrimaryButton } from '../components/ui';
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
    submitted.current = true;
    updateItem(item.id, { name: name.trim(), category, unit: unit.trim(), expectedUsageDays: days, notes: notes.trim() });
    toast({ title: 'Item updated' });
    onClose();
  };

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
        <FormField label="Unit" htmlFor="edit-item-unit">
          <TextInput id="edit-item-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bottle, pack…" maxLength={20} autoComplete="off" />
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
            placeholder="e.g. 30"
            invalid={!!usageError}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Notes" htmlFor="edit-item-notes">
          <TextArea id="edit-item-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brand, size, where it's kept…" maxLength={300} />
        </FormField>
        <button type="submit" hidden />
      </form>
    </BottomSheet>
  );
}
