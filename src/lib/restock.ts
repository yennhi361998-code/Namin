import { addDays, daysBetween, today } from './dates';
import type { DateStr, ItemStatus } from './types';

export interface RestockEstimate {
  /** Average days one purchase unit (e.g. pack/box/can) lasts. */
  cycleDays: number;
  /** Average days one usage unit (e.g. tablet/bag) lasts. Equal to cycleDays if ratio = 1. */
  daysPerUnit: number;
  /** Number of purchase units bought in the most recent purchase. */
  lastQuantity: number;
  /** Number of usage units bought in the most recent purchase. */
  lastUsageUnits: number;
  /** Total estimated duration (in days) the last purchase will last. */
  durationDays: number;
  /** Conversion ratio (usage units per purchase unit). */
  ratio: number;
  /** Where the cycle came from: observed purchase gaps, or the user's own setting. */
  basis: 'history' | 'manual';
  lastPurchase: DateStr;
  nextPurchase: DateStr;
  /** Days until next purchase; negative when overdue. */
  daysLeft: number;
}

export interface RestockPurchaseInput {
  purchaseDate: DateStr;
  quantity?: number | null;
  unit?: string | null;
  usagePerPurchaseUnit?: number | null;
}

/** Days before the estimated date at which an item counts as running low. */
export const LOW_THRESHOLD_DAYS = 7;

/**
 * Deterministic, quantity- and unit-aware restock estimate.
 * Considers purchase quantities and packaging conversion ratios.
 * Needs at least two purchases on distinct days to learn a cycle from history,
 * or one purchase plus a manual expectedUsageDays.
 * Returns null when there isn't enough data — we never guess.
 */
export function estimateRestock(
  item: { expectedUsageDays?: number | null; usagePerPurchaseUnit?: number | null },
  purchases: RestockPurchaseInput[],
  ref: DateStr = today(),
): RestockEstimate | null {
  const valid = purchases.filter((p) => Boolean(p.purchaseDate));
  if (valid.length === 0) return null;

  const ratio = item.usagePerPurchaseUnit && item.usagePerPurchaseUnit > 0 ? item.usagePerPurchaseUnit : 1;

  // Group and sum quantities by distinct purchase date
  const byDate = new Map<DateStr, { quantity: number; usageUnits: number }>();
  for (const p of valid) {
    const d = p.purchaseDate;
    const q = p.quantity != null && p.quantity > 0 ? p.quantity : 1;
    const itemRatio = p.usagePerPurchaseUnit && p.usagePerPurchaseUnit > 0 ? p.usagePerPurchaseUnit : ratio;
    const u = q * itemRatio;
    const curr = byDate.get(d) ?? { quantity: 0, usageUnits: 0 };
    byDate.set(d, { quantity: curr.quantity + q, usageUnits: curr.usageUnits + u });
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return null;

  const last = dates[dates.length - 1];
  const lastRecord = byDate.get(last)!;
  const lastQuantity = lastRecord.quantity;
  const lastUsageUnits = lastRecord.usageUnits;

  let cycleDays: number;
  let daysPerUnit: number;
  let durationDays: number;
  let basis: RestockEstimate['basis'];

  if (dates.length >= 2) {
    const deltaDays = daysBetween(dates[0], last);
    if (deltaDays <= 0) return null;

    // Consumed units between the first purchase and the last purchase
    let consumedUsageUnits = 0;
    for (let i = 0; i < dates.length - 1; i++) {
      consumedUsageUnits += byDate.get(dates[i])!.usageUnits;
    }
    if (consumedUsageUnits <= 0) consumedUsageUnits = 1;

    daysPerUnit = deltaDays / consumedUsageUnits;
    cycleDays = Math.max(1, Math.round(daysPerUnit * ratio));
    durationDays = Math.max(1, Math.round(lastUsageUnits * daysPerUnit));
    basis = 'history';
  } else if (item.expectedUsageDays && item.expectedUsageDays > 0) {
    cycleDays = item.expectedUsageDays;
    daysPerUnit = cycleDays / ratio;
    durationDays = Math.max(1, Math.round(lastQuantity * cycleDays));
    basis = 'manual';
  } else {
    return null;
  }

  if (cycleDays <= 0 || durationDays <= 0) return null;

  const nextPurchase = addDays(last, durationDays);
  return {
    cycleDays,
    daysPerUnit,
    lastQuantity,
    lastUsageUnits,
    durationDays,
    ratio,
    basis,
    lastPurchase: last,
    nextPurchase,
    daysLeft: daysBetween(ref, nextPurchase),
  };
}

export function statusFromEstimate(est: RestockEstimate | null): ItemStatus {
  if (!est) return 'unknown';
  if (est.daysLeft <= 0) return 'out';
  if (est.daysLeft <= LOW_THRESHOLD_DAYS) return 'running_low';
  return 'in_stock';
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  in_stock: 'In stock',
  running_low: 'Running low',
  out: 'Probably out',
  unknown: '',
};

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}d overdue`;
  if (daysLeft === 0) return 'Due today';
  return `~${daysLeft}d left`;
}
