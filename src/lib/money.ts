/** "₫189,000" */
export function formatVnd(amount: number): string {
  return `₫${Math.round(amount).toLocaleString('en-US')}`;
}

/**
 * Parses what people actually type for a price: "189000", "189,000", "189.000",
 * "₫189,000", "189k", "1.2tr". Returns null for empty input, NaN for invalid input.
 */
export function parseVnd(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[₫đ\s]|vnd/g, '');
  if (!s) return null;
  const m = s.match(/^([\d.,]+)(k|tr|m)?$/);
  if (!m) return NaN;
  const [, num, suffix] = m;
  let value: number;
  if (suffix) {
    // With a suffix, a single separator is a decimal point: "1.2tr", "1,5k".
    value = Number(num.replace(',', '.'));
    value *= suffix === 'k' ? 1_000 : 1_000_000;
  } else {
    // Without a suffix, separators are thousands grouping.
    value = Number(num.replace(/[.,]/g, ''));
  }
  if (!Number.isFinite(value) || value < 0) return NaN;
  return Math.round(value);
}

export function priceInputValue(amount: number | null): string {
  return amount == null ? '' : Math.round(amount).toLocaleString('en-US');
}
