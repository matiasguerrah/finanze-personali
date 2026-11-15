/** Money helpers. Amounts are always integer cents; rates are integer basis points. */

export const BP_100 = 10_000;

// it-IT does not group 4-digit numbers by default (CLDR minimumGroupingDigits = 2): force "1.234,56 €".
const eurFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
} as unknown as Intl.NumberFormatOptions);

export function formatCents(cents: number): string {
  return eurFormatter.format(cents / 100);
}

/**
 * Rounds a float to an integer, .5 away from zero (Math.round rounds -2.5 to -2).
 * Only for genuinely fractional values (e.g. compound interest); integer ratios use divRound.
 */
export function roundHalfAwayFromZero(x: number): number {
  // Absorb float noise such as 1.005 * 100 = 100.49999999999999.
  const nudged = Math.abs(x) + 1e-9;
  return Math.sign(x) * Math.floor(nudged + 0.5);
}

/** Exact integer division n / d rounded half away from zero (no float involved). */
export function divRound(n: number, d: number): number {
  assertInt(n, 'n');
  assertInt(d, 'd');
  if (d === 0) throw new Error('division by zero');
  const sign = Math.sign(n) * Math.sign(d);
  const an = Math.abs(n);
  const ad = Math.abs(d);
  const q = Math.floor(an / ad);
  const r = an - q * ad;
  return sign * (r * 2 >= ad ? q + 1 : q) || 0;
}

/** cents × rate, rounded to the nearest cent. */
export function applyBp(cents: number, bp: number): number {
  assertInt(cents, 'cents');
  assertInt(bp, 'bp');
  return divRound(cents * bp, BP_100);
}

export function assertInt(n: number, label = 'value'): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} must be a safe integer, got ${n}`);
}

/**
 * Parses a user-typed amount ("12", "12,5", "1.234,56", "12.50", "€ 3") into cents.
 * Returns null when the input is not a valid non-negative amount with at most 2 decimals.
 * Works on strings only: no float arithmetic is involved.
 */
export function parseAmountToCents(input: string): number | null {
  let s = input.replace(/[\s€]/g, '');
  if (s === '') return null;
  if (s.includes(',')) {
    // Italian format: dots are thousands separators, comma is the decimal separator.
    s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(s)) {
    // "1.234" or "1.234.567": dots are thousands separators.
    s = s.replace(/\./g, '');
  }
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const intPart = m[1] ?? '0';
  const frac = (m[2] ?? '').padEnd(2, '0');
  const cents = Number(intPart) * 100 + Number(frac);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents → editable string using the Italian decimal comma ("1234,50"). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return rest === 0 ? `${sign}${euros}` : `${sign}${euros},${String(rest).padStart(2, '0')}`;
}

/** Basis points → "67" / "4,5" (percent, Italian comma). */
export function bpToPercentInput(bp: number): string {
  return centsToInput(bp);
}

/** "67" / "4,5" / "26,23" → basis points (same 2-decimal rules as amounts). */
export function percentInputToBp(input: string): number | null {
  return parseAmountToCents(input.replace('%', ''));
}

export function formatBp(bp: number): string {
  return `${bpToPercentInput(bp)}%`;
}

export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}
