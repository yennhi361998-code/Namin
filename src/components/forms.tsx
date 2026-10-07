import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { addDays, parseDate, shortDate, today, weekdayName } from '../lib/dates';
import type { DateStr } from '../lib/types';
import { cx, Icon } from './ui';

const inputBase =
  'w-full min-h-[48px] px-3.5 rounded-lg bg-surface border-[1.5px] text-body-md text-ink placeholder:text-ink-sub/80 ' +
  'focus:outline-none focus:border-sky-dark focus:shadow-[0_0_0_3px_rgba(140,201,232,0.25)] transition-colors';

export function FormField({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label-md text-ink-sub font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-body-sm text-err-ink flex items-center gap-1" role="alert">
          <Icon name="error" className="text-[15px]" />
          {error}
        </p>
      ) : (
        hint && <p className="text-body-sm text-ink-sub">{hint}</p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; prefix?: string }>(
  function TextInput({ invalid, className, prefix, ...rest }, ref) {
    if (prefix)
      return (
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-body-md text-ink-sub pointer-events-none">{prefix}</span>
          <input ref={ref} className={cx(inputBase, 'pl-8', invalid ? 'border-err-ink' : 'border-line-strong', className)} aria-invalid={invalid || undefined} {...rest} />
        </div>
      );
    return <input ref={ref} className={cx(inputBase, invalid ? 'border-err-ink' : 'border-line-strong', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} className={cx(inputBase, 'py-3 border-line-strong resize-none')} {...props} />;
}

/** Quick date chips plus the native picker for anything else. */
export function DatePicker({ value, onChange, label }: { value: DateStr; onChange: (d: DateStr) => void; label: string }) {
  const id = useId();
  const t = today();
  const dow = parseDate(t).getDay();
  const saturday = addDays(t, (6 - dow + 7) % 7 || 7);
  const quick: { label: string; value: DateStr }[] = [
    { label: 'Today', value: t },
    { label: 'Tomorrow', value: addDays(t, 1) },
    { label: dow === 6 || dow === 0 ? 'Next Saturday' : 'Saturday', value: saturday },
    { label: 'Next week', value: addDays(t, 7) },
  ];
  const isQuick = quick.some((q) => q.value === value);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {quick.map((q) => (
        <button
          key={q.label}
          type="button"
          aria-pressed={q.value === value}
          onClick={() => onChange(q.value)}
          className={cx(
            'min-h-[36px] px-3 rounded-full text-label-md border transition-colors',
            q.value === value ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
          )}
        >
          {q.label}
        </button>
      ))}
      <label
        htmlFor={id}
        className={cx(
          'relative min-h-[36px] px-3 rounded-full text-label-md border inline-flex items-center gap-1 cursor-pointer',
          !isQuick ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
        )}
      >
        <Icon name="calendar_today" className="text-[15px]" />
        {isQuick ? 'Pick date' : `${weekdayName(value).slice(0, 3)}, ${shortDate(value)}`}
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          aria-label={`${label}: choose a date`}
        />
      </label>
    </div>
  );
}

/** Small stepper for quantities. */
export function Stepper({ value, onChange, label, min = 1 }: { value: number; onChange: (n: number) => void; label: string; min?: number }) {
  const btn = 'w-11 h-11 flex items-center justify-center rounded-lg text-ink active:bg-soft disabled:opacity-40';
  return (
    <div className="inline-flex items-center border-[1.5px] border-line-strong rounded-lg bg-surface" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease">
        <Icon name="remove" className="text-[20px]" />
      </button>
      <span className="w-8 text-center text-body-md font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} aria-label="Increase">
        <Icon name="add" className="text-[20px]" />
      </button>
    </div>
  );
}
