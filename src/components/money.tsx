import { useState } from 'react';
import { formatVnd } from '../lib/money';
import { CHART_COLORS, OTHER_COLOR } from '../lib/moneyCategories';
import type { MoneyCategory, TxType } from '../lib/types';
import type { MoneyMonth } from '../store/selectors';
import { cx, CategoryIcon } from './ui';

/** Category icon in its colour, on a pastel tint of the same colour. */
export function CategoryTile({ category, size = 44 }: { category: Pick<MoneyCategory, 'icon' | 'color' | 'name'>; size?: number }) {
  return (
    <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: size, height: size, background: `${category.color}26` }}>
      <CategoryIcon name={category.icon} size={Math.round(size * 0.5)} label={category.name} color={category.color} />
    </span>
  );
}

export function sharePct(share: number) {
  const p = share * 100;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
}

interface Slice {
  key: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  share: number;
}

const MAX_SLICES = 6;
const MIN_SHARE = 0.03;

/**
 * Colour per category for one chart. Each category keeps its own colour unless an earlier
 * (bigger) slice already uses it, then it takes the next free palette slot. Categories folded
 * into "Other" are grey. The list uses the same map so dots match slices.
 */
export function sliceColors(month: MoneyMonth): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  month.rows.forEach((r, i) => {
    if (i >= MAX_SLICES || r.share < MIN_SHARE) return map.set(r.category.id, OTHER_COLOR);
    const own = r.category.color;
    const color = !used.has(own) ? own : CHART_COLORS.find((c) => !used.has(c)) ?? own;
    used.add(color);
    map.set(r.category.id, color);
  });
  return map;
}

/** Largest categories as their own slices; small ones fold into "Other" so the ring stays legible. */
function toSlices(month: MoneyMonth): Slice[] {
  const colors = sliceColors(month);
  const main = month.rows.filter((r, i) => i < MAX_SLICES && r.share >= MIN_SHARE);
  const rest = month.rows.slice(main.length);
  const slices: Slice[] = main.map((r) => ({ key: r.category.id, name: r.category.name, icon: r.category.icon, color: colors.get(r.category.id)!, total: r.total, share: r.share }));
  if (rest.length) {
    const total = rest.reduce((n, r) => n + r.total, 0);
    slices.push({ key: 'other', name: `Other (${rest.length})`, icon: 'package', color: OTHER_COLOR, total, share: month.total ? total / month.total : 0 });
  }
  return slices;
}

const SIZE = 248;
const OUTER = 112;
const INNER = 70;
const MID = (OUTER + INNER) / 2;
const WIDTH = OUTER - INNER;
const CIRC = 2 * Math.PI * MID;
const GAP = 2;

/** Donut with the month's total in the middle. Tap a slice to see it in the centre; tap again to clear. */
export function MoneyDonut({ month, type }: { month: MoneyMonth; type: TxType }) {
  const [picked, setPicked] = useState<string | null>(null);
  const slices = toSlices(month);
  const sel = slices.find((s) => s.key === picked);
  const multi = slices.length > 1;

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = s.share * CIRC;
    const start = offset;
    offset += len;
    const mid = ((start + len / 2) / CIRC) * 2 * Math.PI - Math.PI / 2;
    return { ...s, len, start, mid };
  });
  const at = (angle: number, radius: number) => ({ x: SIZE / 2 + Math.cos(angle) * radius, y: SIZE / 2 + Math.sin(angle) * radius });

  return (
    <div className="relative mx-auto" style={{ width: SIZE + 32, height: SIZE + 32 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute left-4 top-4 -rotate-0" role="img" aria-label={`${type === 'expense' ? 'Expenses' : 'Income'} by category`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={MID} fill="none" stroke="#E5EEF2" strokeWidth={WIDTH} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={MID}
            fill="none"
            stroke={a.color}
            strokeWidth={WIDTH}
            strokeDasharray={`${Math.max(0.1, a.len - (multi ? GAP : 0))} ${CIRC}`}
            strokeDashoffset={-a.start}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            opacity={sel && sel.key !== a.key ? 0.35 : 1}
            className="cursor-pointer transition-opacity"
            style={{ pointerEvents: 'visibleStroke' }}
            onClick={() => setPicked((p) => (p === a.key ? null : a.key))}
          >
            <title>{`${a.name}: ${formatVnd(a.total)} (${sharePct(a.share)})`}</title>
          </circle>
        ))}
        {arcs
          .filter((a) => a.share >= 0.08)
          .map((a) => {
            const p = at(a.mid, MID);
            return (
              <text key={`t-${a.key}`} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" className="fill-ink text-[12px] font-semibold pointer-events-none">
                {sharePct(a.share)}
              </text>
            );
          })}
      </svg>
      {/* Icon badges on the outer edge of the bigger slices. */}
      {arcs
        .filter((a) => a.share >= 0.05)
        .map((a) => {
          const p = at(a.mid, OUTER + 8);
          return (
            <span
              key={`b-${a.key}`}
              className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full bg-surface flex items-center justify-center text-[18px] shadow-card pointer-events-none"
              style={{ left: p.x + 16, top: p.y + 16, boxShadow: `0 0 0 2px ${a.color}, 0 2px 6px rgba(38,52,59,0.12)` }}
              aria-hidden
            >
              <CategoryIcon name={a.icon} size={18} color={a.color} />
            </span>
          );
        })}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-24">
        {sel ? (
          <>
            <CategoryIcon name={sel.icon} size={24} color={sel.color} />
            <span className="text-caption text-ink-sub mt-1 truncate max-w-full">{sel.name}</span>
            <span className="text-label-md font-semibold text-ink tabular-nums">{formatVnd(sel.total)}</span>
            <span className="text-caption text-ink-sub">{sharePct(sel.share)}</span>
          </>
        ) : (
          <>
            <span className="text-caption text-ink-sub">{type === 'expense' ? 'Total expenses' : 'Total income'}</span>
            <span className={cx('w-6 h-0.5 rounded-full my-1.5', type === 'expense' ? 'bg-[#E5806A]' : 'bg-[#3FA88B]')} aria-hidden />
            <span className="text-title-sm text-ink tabular-nums">{formatVnd(month.total)}</span>
          </>
        )}
      </div>
    </div>
  );
}
