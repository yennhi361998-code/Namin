import { addDays, daysBetween, today } from './dates';
import type { DateStr, HouseholdItem, ItemStatus, Purchase } from './types';

export interface RestockEstimate {
  /** Average days one purchase lasts. */
  cycleDays: number;
  /** Where the cycle came from: observed purchase gaps, or the user's own setting. */
  basis: 'history' | 'manual';
  lastPurchase: DateStr;
  nextPurchase: DateStr;
  /** Days until next purchase; negative when overdue. */
  daysLeft: number;
}

/** Days before the estimated date at which an item counts as running low. */
export const LOW_THRESHOLD_DAYS = 7;

/**
 * Deterministic restock estimate. Needs at least two purchases on distinct days
 * (one gap) to learn a cycle, or one purchase plus a manual expectedUsageDays.
 * Returns null when there isn't enough data — we never guess.
 */
export function estimateRestock(
  item: Pick<HouseholdItem, 'expectedUsageDays'>,
  purchases: Pick<Purchase, 'purchaseDate'>[],
  ref: DateStr = today(),
): RestockEstimate | null {
  const dates = [...new Set(purchases.map((p) => p.purchaseDate))].sort();
  if (dates.length === 0) return null;
  const last = dates[dates.length - 1];

  let cycleDays: number;
  let basis: RestockEstimate['basis'];
  if (dates.length >= 2) {
    cycleDays = Math.round(daysBetween(dates[0], last) / (dates.length - 1));
    basis = 'history';
  } else if (item.expectedUsageDays && item.expectedUsageDays > 0) {
    cycleDays = item.expectedUsageDays;
    basis = 'manual';
  } else {
    return null;
  }
  if (cycleDays <= 0) return null;

  const nextPurchase = addDays(last, cycleDays);
  return { cycleDays, basis, lastPurchase: last, nextPurchase, daysLeft: daysBetween(ref, nextPurchase) };
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
  unknown: 'Not enough history yet',
};

export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft < 0) return `${-daysLeft}d overdue`;
  if (daysLeft === 0) return 'Due today';
  return `~${daysLeft}d left`;
}
