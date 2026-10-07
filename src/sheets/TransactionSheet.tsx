import { useRef, useState } from 'react';
import { CategoryTile } from '../components/money';
import { BottomSheet } from '../components/overlay';
import { AmountPad, Key } from '../components/keypad';
import { cx, Icon } from '../components/ui';
import { evaluate, press } from '../lib/calc';
import { addDays, shortDate, today } from '../lib/dates';
import type { DateStr, TxType } from '../lib/types';
import { useStore } from '../store';
import { useCategoryChoices } from '../store/selectors';
import { toast } from '../store/ui';
import { CategoriesSheet } from './CategoriesSheet';

/** Add or edit an expense/income: category grid on top, calculator keypad below. */
export function TransactionSheet({
  open,
  onClose,
  transactionId,
  txType = 'expense',
  date: initialDate,
}: {
  open: boolean;
  onClose: () => void;
  transactionId?: string;
  txType?: TxType;
  date?: DateStr;
}) {
  const [existing] = useState(() => (transactionId ? useStore.getState().transactions.find((t) => t.id === transactionId) : undefined));
  const [type, setType] = useState<TxType>(existing?.type ?? txType);
  const choices = useCategoryChoices(type);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [expr, setExpr] = useState(existing ? String(existing.amount) : '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [date, setDate] = useState<DateStr>(existing?.date ?? initialDate ?? today());
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const submitted = useRef(false);
  const dateInput = useRef<HTMLInputElement>(null);

  // Fall back to the most-used category when none is chosen (or the chosen one was removed).
  const selected = choices.find((c) => c.id === categoryId) ?? (existing && categoryId === existing.categoryId ? undefined : choices[0]);
  const effectiveCategoryId = selected?.id ?? categoryId;

  const key = (k: string) => {
    setExpr((e) => press(e, k));
    setError(null);
  };

  const save = () => {
    if (submitted.current) return;
    const amount = evaluate(expr);
    if (!amount || amount <= 0) return setError('Enter an amount');
    if (!effectiveCategoryId) return setError('Choose a category');
    submitted.current = true;
    const input = { type, categoryId: effectiveCategoryId, amount, date, note };
    const s = useStore.getState();
    if (existing) s.updateTransaction(existing.id, input);
    else s.addTransaction(input);
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const undo = useStore.getState().deleteTransaction(existing.id);
    toast({ title: 'Entry deleted', action: { label: 'Undo', run: undo } });
    onClose();
  };

  const openDatePicker = () => {
    const el = dateInput.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus(); // older browsers without showPicker
    }
  };

  const t = today();
  const dateLabel = date === t ? 'Today' : date === addDays(t, -1) ? 'Yesterday' : shortDate(date);
  const label = type === 'expense' ? 'expense' : 'income';

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={existing ? `Edit ${label}` : `Add ${label}`}
        bodyClassName="pt-1"
        footerClassName="!bg-soft border-line-strong/60 px-3"
        header={
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <button type="button" onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-full text-ink-sub active:bg-soft" aria-label="Close">
              <Icon name="close" className="text-[24px]" />
            </button>
            <div className="flex p-1 bg-line rounded-full" role="tablist" aria-label="Entry type">
              {(['expense', 'income'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  role="tab"
                  aria-selected={type === tp}
                  onClick={() => {
                    setType(tp);
                    setCategoryId(null);
                    setError(null);
                  }}
                  className={cx('min-h-[36px] px-4 rounded-full text-label-md transition-all', type === tp ? 'bg-sky text-ink font-semibold shadow-sm' : 'text-ink-sub')}
                >
                  {tp === 'expense' ? 'Expense' : 'Income'}
                </button>
              ))}
            </div>
            <div className="flex items-center">
              {existing && (
                <button type="button" onClick={remove} className="w-11 h-11 flex items-center justify-center rounded-full text-err-ink active:bg-err/50" aria-label="Delete entry">
                  <Icon name="delete" className="text-[22px]" />
                </button>
              )}
              <button type="button" onClick={save} className="w-11 h-11 flex items-center justify-center rounded-full text-link active:bg-soft" aria-label="Save">
                <Icon name="check" className="text-[26px]" />
              </button>
            </div>
          </div>
        }
        footer={
          <AmountPad
            expr={expr}
            onKey={key}
            note={note}
            onNote={setNote}
            error={error}
            onSave={save}
            firstKey={
        <Key onClick={openDatePicker} tone="soft" label={`Date: ${dateLabel}`}>
          <span className="flex items-center gap-1 text-label-md font-semibold">
            <Icon name="calendar_today" className="text-[16px]" />
            {dateLabel}
          </span>
          <input
            ref={dateInput}
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden
          />
        </Key>
            }
          />
        }
      >
        <div className="grid grid-cols-4 gap-x-1 gap-y-2" role="radiogroup" aria-label="Category">
          {choices.map((c) => {
            const active = c.id === effectiveCategoryId;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setCategoryId(c.id);
                  setError(null);
                }}
                className={cx('flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-colors', active ? 'border-sky-dark bg-soft' : 'border-transparent active:bg-canvas')}
              >
                <CategoryTile category={c} size={44} />
                <span className={cx('text-label-sm truncate max-w-full px-1', active ? 'text-ink font-semibold' : 'text-ink-muted')}>{c.name}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setManaging(true)} className="flex flex-col items-center gap-1 py-2 rounded-xl border-2 border-transparent active:bg-canvas" aria-label={`Edit ${label} categories`}>
            <span className="w-11 h-11 rounded-full border-2 border-dashed border-line-strong text-ink-sub flex items-center justify-center">
              <Icon name="tune" className="text-[20px]" />
            </span>
            <span className="text-label-sm text-ink-sub">Edit</span>
          </button>
        </div>
      </BottomSheet>
      <CategoriesSheet open={managing} onClose={() => setManaging(false)} type={type} />
    </>
  );
}
