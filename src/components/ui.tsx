import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { CATEGORY_COLOR } from '../lib/categories';
import { MemberAvatarIcon } from '../lib/members';
import { roomStyle } from '../lib/rooms';
import type { Category, Member } from '../lib/types';
import { CATEGORY_ICONS, UI_ICONS, type CategoryIconName, type IconName } from './icons';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * Lucide icon by app name. Sized by font size (text-[18px] etc.), 24px by default.
 * `filled` (active tab) draws a heavier stroke, since Lucide is outline-only.
 */
export function Icon({ name, className, filled, label, style }: { name: IconName; className?: string; filled?: boolean; label?: string; style?: CSSProperties }) {
  const Glyph = UI_ICONS[name] || UI_ICONS.add;
  return (
    <Glyph
      size="1em"
      strokeWidth={filled ? 2.5 : 2}
      absoluteStrokeWidth={false}
      style={style}
      className={cx('inline-block shrink-0 select-none', !className?.includes('text-[') && 'text-[24px]', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

/** Money-category picture (Lucide), drawn in the given colour. */
export function CategoryIcon({ name, size = 24, label, color, className }: { name: string; size?: number; label?: string; color?: string; className?: string }) {
  const Glyph = CATEGORY_ICONS[name as CategoryIconName] ?? CATEGORY_ICONS.package;
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      color={color}
      className={cx('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: IconName };

export function PrimaryButton({ icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-[50px] w-full px-4 rounded-2xl bg-sky text-ink font-semibold text-body-md shadow-sm',
        'inline-flex items-center justify-center gap-1.5 transition-all',
        'active:bg-sky-dark active:text-white active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} className="text-[20px]" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-[50px] w-full px-4 rounded-2xl bg-soft text-link font-semibold text-body-md border border-transparent',
        'inline-flex items-center justify-center gap-1.5 transition-all active:border-sky active:scale-[0.99] disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} className="text-[20px]" />}
      {children}
    </button>
  );
}

export function GhostButton({ icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-[50px] w-full px-4 rounded-2xl bg-transparent text-ink font-semibold text-body-md border border-line',
        'inline-flex items-center justify-center gap-1.5 transition-all active:bg-canvas disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} className="text-[20px]" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('bg-surface rounded-xl border border-line shadow-card overflow-hidden', className)}>{children}</div>;
}

const RINGS = 9;
const FOLD = 20;

const PAPER = {
  /** Yellow sticky note held by a strip of aqua tape. */
  sticky: { paper: 'bg-sticky border-sticky-edge', rules: 'divide-sticky-line', flap: 'bg-sticky-fold border-sticky-edge', top: 'pt-1' },
  /** Aqua spiral-bound notebook page. */
  spiral: { paper: 'bg-note border-note-edge', rules: 'divide-note-line', flap: 'bg-note-fold border-note-edge', top: 'pt-3' },
} as const;

export type PaperStyle = keyof typeof PAPER;
/** Paper used for the task lists (Home Today, Tasks day list). */
export const TASK_PAPER: PaperStyle = 'sticky';

/** Background for rows that slide (SwipeRow) on top of the given paper. */
export const paperRowBg = (style: PaperStyle = TASK_PAPER) => (style === 'sticky' ? 'bg-sticky' : 'bg-note');

/**
 * Task list drawn as a paper note: dashed rules between rows and a folded bottom-right corner,
 * topped with tape (sticky) or binding rings (spiral).
 */
export function NotePaper({ children, label, paper = TASK_PAPER }: { children: ReactNode; label?: string; paper?: PaperStyle }) {
  const p = PAPER[paper];
  return (
    <div className="relative pt-2.5" aria-label={label}>
      {paper === 'sticky' ? (
        <span className="absolute top-0 left-1/2 w-20 h-5 bg-header/85 border border-[#9FDDE6] z-10 pointer-events-none" style={{ transform: 'translateX(-50%) rotate(3deg)' }} aria-hidden />
      ) : (
        <div className="absolute top-0 inset-x-4 flex justify-between z-10 pointer-events-none" aria-hidden>
          {Array.from({ length: RINGS }, (_, i) => (
            <span key={i} className="w-2 h-4 rounded-full border-[1.5px] border-note-ring bg-canvas" />
          ))}
        </div>
      )}
      <div
        className={cx('border rounded-lg divide-y divide-dashed overflow-hidden', p.paper, p.rules, p.top)}
        style={{ clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${FOLD}px), calc(100% - ${FOLD}px) 100%, 0 100%)` }}
      >
        {children}
      </div>
      {/* the folded-over flap */}
      <span
        className={cx('absolute right-0 bottom-0 border-l border-t rounded-tl-[3px]', p.flap)}
        style={{ width: FOLD, height: FOLD, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }}
        aria-hidden
      />
    </div>
  );
}

/** Card whose rows are separated by inset hairlines. */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cx('divide-y divide-line', className)}>{children}</Card>;
}

export function SectionHeader({
  title,
  icon,
  badge,
  right,
  accent,
  id,
  alert,
}: {
  title: string;
  icon?: IconName;
  badge?: ReactNode;
  /** Shown next to the badge in the warning tone, e.g. "2 overdue". */
  alert?: string;
  right?: ReactNode;
  accent?: boolean;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-space-sm px-0.5 min-h-[28px]">
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} className={cx('text-[16px]', accent ? 'text-sky-dark' : 'text-ink-sub')} />}
        <h2 id={id} className={cx('text-label-md uppercase tracking-wider font-semibold', accent ? 'text-link' : 'text-ink-sub')}>
          {title}
        </h2>
        {badge != null && <Badge>{badge}</Badge>}
        {alert && <Badge tone="err">{alert}</Badge>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, tone = 'sky' }: { children: ReactNode; tone?: 'sky' | 'warn' | 'done' | 'err' | 'plain' }) {
  const tones = {
    sky: 'bg-soft text-link',
    warn: 'bg-warn text-warn-ink',
    done: 'bg-done text-done-ink',
    err: 'bg-err text-err-ink',
    plain: 'bg-canvas text-ink-sub border border-line',
  };
  return <span className={cx('text-caption px-2 py-0.5 rounded-full font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}

/** Room shown as an icon on task rows; the name stays available to screen readers and on hover. */
export function RoomIcon({ room }: { room: string }) {
  const r = roomStyle(room);
  return (
    <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: r.bg, color: r.fg }} title={room}>
      <Icon name={r.icon} className="text-[18px]" label={room} />
    </span>
  );
}

export function MemberAvatar({ member, size = 28, ring }: { member?: Member; size?: number; ring?: boolean }) {
  const name = member?.name ?? '?';
  const avatar = member?.avatar;
  const iconSize = Math.round(size * 0.62);
  const hasIcon = avatar && avatar !== 'initial';

  return (
    <span
      className={cx('inline-flex items-center justify-center rounded-full font-semibold text-ink flex-shrink-0 select-none leading-none', ring && 'ring-2 ring-canvas')}
      style={{
        width: size,
        height: size,
        background: member?.color ?? '#CBD5DA',
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden
    >
      {hasIcon ? <MemberAvatarIcon id={avatar} size={iconSize} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function CategoryDot({ category, size = 8 }: { category: Category; size?: number }) {
  return <span className="inline-block rounded-full flex-shrink-0" style={{ width: size, height: size, background: CATEGORY_COLOR[category] }} aria-hidden />;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="w-full bg-line h-1.5 rounded-full overflow-hidden" role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="bg-sky-dark h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <Card className="px-4 py-8 flex flex-col items-center gap-3 text-center">
      <p className="text-body-md text-ink-sub">{message}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="min-h-[44px] px-4 rounded-xl bg-soft text-link font-medium text-label-md inline-flex items-center gap-1 active:scale-95 transition-transform">
          <Icon name="add" className="text-[18px]" />
          {action.label}
        </button>
      )}
    </Card>
  );
}

/** Round (tasks) or rounded-square (shopping) checkbox with a 44px hit area. */
export function Checkbox({
  checked,
  onChange,
  label,
  shape = 'round',
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  shape?: 'round' | 'square';
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="-m-2.5 p-2.5 flex-shrink-0 group/check"
    >
      <span
        className={cx(
          'w-6 h-6 flex items-center justify-center transition-all duration-200 group-active/check:scale-90',
          shape === 'round' ? 'rounded-full' : 'rounded-md',
          checked ? 'bg-sky border-2 border-sky animate-check' : 'bg-surface border-2 border-line-strong',
        )}
      >
        <Icon name="check" className={cx('text-[16px] text-ink font-bold transition-opacity', checked ? 'opacity-100' : 'opacity-0')} />
      </span>
    </button>
  );
}

/** Pill chips for single-choice fields (repeat, category, assignee). */
export function ChipGroup<T>({
  options,
  value,
  onChange,
  label,
  isEqual = (a, b) => a === b,
}: {
  options: { label: string; value: T; dot?: string; icon?: IconName; iconColor?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  isEqual?: (a: T, b: T) => boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = isEqual(o.value, value);
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-[36px] px-3 rounded-full text-label-md inline-flex items-center gap-1.5 border transition-colors',
              active ? 'bg-soft border-sky text-ink font-semibold' : 'bg-surface border-line text-ink-sub',
            )}
          >
            {o.dot && <span className="w-2 h-2 rounded-full" style={{ background: o.dot }} aria-hidden />}
            {o.icon && (
              <span style={o.iconColor ? { color: o.iconColor } : undefined} className={cx('flex', !o.iconColor && (active ? 'text-sky-dark' : 'text-ink-sub'))}>
                <Icon name={o.icon} className="text-[18px]" />
              </span>
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
