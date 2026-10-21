import { useRef, useState, type ReactNode } from 'react';
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
  itemName,
  onItemName,
  itemNamePlaceholder = 'Item name',
  note,
  onNote,
  notePlaceholder = 'Note',
  error,
  onSave,
  firstKey,
  hint,
  placeholderAmount,
  accountSlot,
  memberSlot,
  accountName,
  middleSlot,
}: {
  expr: string;
  onKey: (k: string) => void;
  itemName?: string;
  onItemName?: (v: string) => void;
  itemNamePlaceholder?: string;
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
  accountSlot?: ReactNode;
  memberSlot?: ReactNode;
  accountName?: string;
  middleSlot?: ReactNode;
}) {
  const [isEditingText, setIsEditingText] = useState(false);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);
  const value = evaluate(expr);

  const handleDismissKeyboard = () => {
    itemInputRef.current?.blur();
    noteInputRef.current?.blur();
    setIsEditingText(false);
  };

  const hasItemNameProp = typeof onItemName === 'function';
  const showUnderneathNote = hasItemNameProp && (isEditingText || Boolean(note && note.trim().length > 0));

  return (
    <div className="flex flex-col gap-1.5 pb-1">
      {isEditingText && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface rounded-xl border border-line/60 shadow-xs">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDismissKeyboard}
            className="flex items-center gap-1.5 text-label-sm text-sky-dark font-medium py-1 px-1 active:opacity-70 cursor-pointer"
            aria-label="Collapse keyboard and show number pad"
          >
            <Icon name="dialpad" className="text-[18px]" />
            <span>Show number pad</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleDismissKeyboard}
            className="h-8 px-3 rounded-lg bg-sky/20 text-sky-dark font-semibold text-label-sm active:bg-sky/30 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Icon name="keyboard_hide" className="text-[18px]" />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* Main Row: Account Slot + Primary Input (Item Name or Note) + Amount Display */}
      <div className="flex items-stretch gap-1.5">
        {accountSlot && (
          <div className="shrink-0 w-[calc((100%-3*6px)/4)] flex">
            {accountSlot}
          </div>
        )}
        <div className="flex-1 min-w-0 bg-surface rounded-xl px-3 min-h-[56px] flex items-center gap-2.5 shadow-sm">
          <input
            ref={itemInputRef}
            value={hasItemNameProp ? (itemName ?? '') : note}
            onChange={(e) => {
              if (hasItemNameProp) {
                onItemName?.(e.target.value);
              } else {
                onNote(e.target.value);
              }
            }}
            onFocus={() => setIsEditingText(true)}
            onBlur={() => {
              setTimeout(() => {
                if (
                  document.activeElement !== itemInputRef.current &&
                  document.activeElement !== noteInputRef.current
                ) {
                  setIsEditingText(false);
                }
              }, 120);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (hasItemNameProp && noteInputRef.current) {
                  noteInputRef.current.focus();
                } else {
                  handleDismissKeyboard();
                }
              }
            }}
            placeholder={hasItemNameProp ? itemNamePlaceholder : notePlaceholder}
            aria-label={hasItemNameProp ? itemNamePlaceholder : notePlaceholder}
            maxLength={80}
            className="flex-1 min-w-0 min-h-[44px] bg-transparent text-body-md text-ink placeholder:text-ink-sub/80 focus:outline-none"
          />
          <div
            onClick={() => {
              if (isEditingText) handleDismissKeyboard();
            }}
            className="flex flex-col items-end shrink-0 max-w-[65%] cursor-pointer"
            aria-live="polite"
          >
            {error ? (
              <span className="text-label-md text-err-ink font-medium">{error}</span>
            ) : (
              <>
                <div className="flex items-center gap-1.5 max-w-full">
                  {accountName && (
                    <span className="text-[11px] text-ink-sub font-medium truncate max-w-[110px]">{accountName}</span>
                  )}
                  {hasOperator(expr) ? (
                    <span className="text-caption text-ink-sub truncate max-w-full">{expr}</span>
                  ) : (
                    hint && <span className="text-caption text-ink-sub">{hint}</span>
                  )}
                </div>
                <span className={cx('text-headline-md tabular-nums truncate max-w-full', value == null && placeholderAmount != null ? 'text-ink-sub/70' : 'text-ink')}>
                  {value != null ? formatVnd(value) : placeholderAmount != null ? formatVnd(placeholderAmount) : '₫0'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Underneath Note Field: Shown when focused into Item Name / Note, or when note has content */}
      {showUnderneathNote && (
        <div className="flex items-center gap-2 bg-surface rounded-xl px-3 min-h-[44px] shadow-sm border border-line/60">
          <Icon name="edit_note" className="text-[20px] text-ink-sub shrink-0" />
          <input
            ref={noteInputRef}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            onFocus={() => setIsEditingText(true)}
            onBlur={() => {
              setTimeout(() => {
                if (
                  document.activeElement !== itemInputRef.current &&
                  document.activeElement !== noteInputRef.current
                ) {
                  setIsEditingText(false);
                }
              }, 120);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleDismissKeyboard();
              }
            }}
            placeholder={notePlaceholder}
            aria-label={notePlaceholder}
            maxLength={120}
            className="flex-1 min-w-0 min-h-[40px] bg-transparent text-body-sm text-ink placeholder:text-ink-sub/70 focus:outline-none"
          />
          {note ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onNote('')}
              className="text-ink-sub hover:text-ink p-1 shrink-0 cursor-pointer"
              aria-label="Clear note"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          ) : null}
        </div>
      )}

      {!isEditingText && middleSlot}

      {!isEditingText && (
        <div className="grid grid-cols-4 gap-1.5">
        {memberSlot ? (
          <>
            {memberSlot}
            {firstKey}
            <Key onClick={() => onKey('000')} tone="soft" label="Three zeros">000</Key>
            <Key onClick={onSave} tone="primary" label="Save">
              <Icon name="check" className="text-[26px]" />
            </Key>

            <Key onClick={() => onKey('×')} tone="op" label="Multiply">×</Key>
            <Key onClick={() => onKey('1')}>1</Key>
            <Key onClick={() => onKey('2')}>2</Key>
            <Key onClick={() => onKey('3')}>3</Key>

            <Key onClick={() => onKey('÷')} tone="op" label="Divide">÷</Key>
            <Key onClick={() => onKey('4')}>4</Key>
            <Key onClick={() => onKey('5')}>5</Key>
            <Key onClick={() => onKey('6')}>6</Key>

            <Key onClick={() => onKey('−')} tone="op" label="Minus">−</Key>
            <Key onClick={() => onKey('7')}>7</Key>
            <Key onClick={() => onKey('8')}>8</Key>
            <Key onClick={() => onKey('9')}>9</Key>

            <Key onClick={() => onKey('+')} tone="op" label="Plus">+</Key>
            <Key onClick={() => onKey('.')}>.</Key>
            <Key onClick={() => onKey('0')}>0</Key>
            <Key onClick={() => onKey('back')} onLongPress={() => onKey('clear')} tone="op" label="Delete">
              <Icon name="backspace" className="text-[22px]" />
            </Key>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      )}
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
