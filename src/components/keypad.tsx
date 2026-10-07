import { useRef, type ReactNode } from 'react';
import { evaluate, hasOperator } from '../lib/calc';
import { formatVnd } from '../lib/money';
import { cx, Icon } from './ui';

/**
 * Note field + amount display + calculator keypad (sample-app style), shared by the
 * Add expense/income and Add item sheets. `firstKey` fills the top-left slot (date, clear…).
 */
export function AmountPad({
  expr,
  onKey,
  note,
  onNote,
  notePlaceholder = 'Note',
  error,
  onSave,
  firstKey,
  hint,
  placeholderAmount,
}: {
  expr: string;
  onKey: (k: string) => void;
  note: string;
  onNote: (v: string) => void;
  notePlaceholder?: string;
  error?: string | null;
  onSave: () => void;
  firstKey: ReactNode;
  /** Small label above the amount, e.g. "Estimated price". */
  hint?: string;
  /** Shown greyed out when nothing is typed (e.g. last price). */
  placeholderAmount?: number | null;
}) {
  const value = evaluate(expr);
  return (
    <div className="flex flex-col gap-1.5 pb-1">
      <div className="bg-surface rounded-xl px-3 min-h-[56px] flex items-center gap-3 shadow-sm">
        <input
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder={notePlaceholder}
          aria-label={notePlaceholder}
          maxLength={80}
          className="flex-1 min-w-0 min-h-[44px] bg-transparent text-body-md text-ink placeholder:text-ink-sub/80 focus:outline-none"
        />
        <div className="flex flex-col items-end shrink-0 max-w-[60%]" aria-live="polite">
          {error ? (
            <span className="text-label-md text-err-ink font-medium">{error}</span>
          ) : (
            <>
              {hasOperator(expr) ? (
                <span className="text-caption text-ink-sub truncate max-w-full">{expr}</span>
              ) : (
                hint && <span className="text-caption text-ink-sub">{hint}</span>
              )}
              <span className={cx('text-headline-md tabular-nums truncate max-w-full', value == null && placeholderAmount != null ? 'text-ink-sub/70' : 'text-ink')}>
                {value != null ? formatVnd(value) : placeholderAmount != null ? formatVnd(placeholderAmount) : '₫0'}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {firstKey}
        <Key onClick={() => onKey('÷')} tone="op" label="Divide">÷</Key>
        <Key onClick={() => onKey('×')} tone="op" label="Multiply">×</Key>
        <Key onClick={() => onKey('back')} onLongPress={() => onKey('clear')} tone="op" label="Delete">
          <Icon name="backspace" className="text-[22px]" />
        </Key>
        {['7', '8', '9'].map((d) => (
          <Key key={d} onClick={() => onKey(d)}>{d}</Key>
        ))}
        <Key onClick={() => onKey('−')} tone="op" label="Minus">−</Key>
        {['4', '5', '6'].map((d) => (
          <Key key={d} onClick={() => onKey(d)}>{d}</Key>
        ))}
        <Key onClick={() => onKey('+')} tone="op" label="Plus">+</Key>
        {['1', '2', '3'].map((d) => (
          <Key key={d} onClick={() => onKey(d)}>{d}</Key>
        ))}
        <Key onClick={onSave} tone="primary" label="Save" className="row-span-2 !h-auto">
          <Icon name="check" className="text-[28px]" />
        </Key>
        <Key onClick={() => onKey('000')} label="Three zeros">000</Key>
        <Key onClick={() => onKey('0')}>0</Key>
        <Key onClick={() => onKey('.')} label="Decimal point">.</Key>
      </div>
    </div>
  );
}

export function Key({
  children,
  onClick,
  onLongPress,
  tone = 'digit',
  label,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  onLongPress?: () => void;
  tone?: 'digit' | 'op' | 'soft' | 'primary';
  label?: string;
  className?: string;
}) {
  const timer = useRef<number>();
  const fired = useRef(false);
  const tones = {
    digit: 'bg-surface text-ink text-title-sm',
    op: 'bg-sky/25 text-ink text-[22px]',
    soft: 'bg-sky/25 text-ink',
    primary: 'bg-sky text-ink',
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={() => {
        fired.current = false;
        if (onLongPress)
          timer.current = window.setTimeout(() => {
            fired.current = true;
            onLongPress();
          }, 500);
      }}
      onPointerUp={() => window.clearTimeout(timer.current)}
      onPointerLeave={() => window.clearTimeout(timer.current)}
      onClick={() => !fired.current && onClick()}
      className={cx('relative h-12 rounded-xl flex items-center justify-center shadow-[0_1px_0_rgba(38,52,59,0.06)] active:scale-[0.97] active:brightness-95 transition-transform select-none', tones[tone], className)}
    >
      {children}
    </button>
  );
}
