import { useState } from 'react';
import { FormField, TextInput } from '../components/forms';
import { CategoryTile } from '../components/money';
import { BottomSheet } from '../components/overlay';
import { cx, GhostButton, Icon, CategoryIcon, PrimaryButton } from '../components/ui';
import { CHART_COLORS, ICON_CHOICES } from '../lib/moneyCategories';
import type { MoneyCategory, TxType } from '../lib/types';
import { useStore } from '../store';
import { toast } from '../store/ui';

/** Add, edit and remove expense or income categories. */
export function CategoriesSheet({ open, onClose, type }: { open: boolean; onClose: () => void; type: TxType }) {
  const categories = useStore((s) => s.moneyCategories);
  const list = categories.filter((c) => c.type === type && !c.archived).sort((a, b) => a.order - b.order);
  const [editing, setEditing] = useState<MoneyCategory | 'new' | null>(null);
  const label = type === 'expense' ? 'Expense' : 'Income';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? (editing === 'new' ? `New ${label.toLowerCase()} category` : `Edit ${editing.name}`) : `${label} categories`}
      header={
        <div className="flex items-center justify-between px-2 pb-2">
          {editing ? (
            <button type="button" onClick={() => setEditing(null)} className="min-h-[44px] px-2 flex items-center gap-0.5 text-link text-label-md font-medium rounded-lg active:bg-soft" aria-label="Back to categories">
              <Icon name="chevron_left" className="text-[24px]" />
              Categories
            </button>
          ) : (
            <h2 className="text-title-sm text-ink px-2">{label} categories</h2>
          )}
          <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-ink-sub active:bg-soft" aria-label="Close">
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>
      }
    >
      {editing ? (
        <CategoryForm key={editing === 'new' ? 'new' : editing.id} type={type} category={editing === 'new' ? undefined : editing} siblings={list} onDone={() => setEditing(null)} />
      ) : (
        <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
          <div className="bg-surface rounded-xl border border-line divide-y divide-line">
            {list.map((c) => (
              <button key={c.id} type="button" onClick={() => setEditing(c)} className="w-full flex items-center gap-3 px-3 min-h-[56px] text-left active:bg-canvas">
                <CategoryTile category={c} size={36} />
                <span className="flex-1 text-body-md text-ink">{c.name}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                <Icon name="chevron_right" className="text-[20px] text-ink-sub" />
              </button>
            ))}
          </div>
          <PrimaryButton icon="add" onClick={() => setEditing('new')}>
            New category
          </PrimaryButton>
        </div>
      )}
    </BottomSheet>
  );
}

function CategoryForm({ type, category, siblings, onDone }: { type: TxType; category?: MoneyCategory; siblings: MoneyCategory[]; onDone: () => void }) {
  const { addMoneyCategory, updateMoneyCategory, archiveMoneyCategory } = useStore.getState();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<string>(category?.icon ?? ICON_CHOICES[0]);
  const [color, setColor] = useState(category?.color ?? CHART_COLORS[siblings.length % CHART_COLORS.length]);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const n = name.trim();
    if (!n) return setError('Give the category a name.');
    if (siblings.some((c) => c.id !== category?.id && c.name.toLowerCase() === n.toLowerCase())) return setError(`There's already a ${n} category.`);
    if (category) updateMoneyCategory(category.id, { name: n, icon, color });
    else addMoneyCategory({ type, name: n, icon, color });
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-5 pb-[env(safe-area-inset-bottom)]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex items-center gap-3">
        <CategoryTile category={{ icon, color, name: name || 'New category' }} size={56} />
        <div className="flex-1">
          <FormField label="Name" htmlFor="cat-name" error={error}>
            <TextInput
              id="cat-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Pets"
              invalid={!!error}
              maxLength={24}
              autoComplete="off"
              autoFocus={!category}
            />
          </FormField>
        </div>
      </div>

      <FormField label="Picture">
        <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="Picture">
          {ICON_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={icon === n}
              aria-label={n.replace(/-/g, ' ')}
              onClick={() => setIcon(n)}
              className={cx('aspect-square rounded-lg flex items-center justify-center', icon === n ? 'bg-soft ring-2 ring-sky-dark' : 'active:bg-canvas')}
            >
              <CategoryIcon name={n} size={22} color={icon === n ? color : '#40484D'} />
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="Chart colour">
        <div className="flex gap-3" role="radiogroup" aria-label="Chart colour">
          {CHART_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={`Colour ${CHART_COLORS.indexOf(c) + 1}`}
              onClick={() => setColor(c)}
              className={cx('w-9 h-9 rounded-full flex items-center justify-center', color === c && 'ring-2 ring-offset-2 ring-ink')}
              style={{ background: c }}
            >
              {color === c && <Icon name="check" className="text-[18px] text-white" />}
            </button>
          ))}
        </div>
      </FormField>

      <div className="flex flex-col gap-2">
        <PrimaryButton type="submit">{category ? 'Save changes' : 'Add category'}</PrimaryButton>
        {category && (
          <GhostButton
            icon="delete"
            className="text-err-ink"
            onClick={() => {
              const undo = archiveMoneyCategory(category.id);
              toast({ title: 'Category removed', subtitle: 'Past entries keep it.', action: { label: 'Undo', run: undo } });
              onDone();
            }}
          >
            Remove category
          </GhostButton>
        )}
      </div>
    </form>
  );
}
