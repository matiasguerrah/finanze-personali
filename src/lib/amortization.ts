/**
 * French amortisation (constant monthly installment), in integer cents.
 *
 * - Monthly interest of each row = remaining principal × annualRateBp / 120000, rounded to the
 *   cent (exact integer arithmetic).
 * - Every row pays the same installment except the last, which closes the exact remaining
 *   principal plus its interest.
 * - With a 0 rate the plan is linear (interest is always 0).
 * - The number of installments is either given (`installments`) or derived from the installment.
 */
import type { ISODate } from '../db/types';
import { addMonthsISO } from './dates';
import { divRound, roundHalfAwayFromZero } from './money';

/** 100 years of monthly payments: anything longer is an input error, not a loan. */
export const MAX_INSTALLMENTS = 1200;
const MONTHLY_BP_DIVISOR = 12 * 10_000;

export interface AmortizationRow {
  /** 1-based installment number. */
  n: number;
  date: ISODate;
  paymentCents: number;
  interestCents: number;
  principalCents: number;
  /** Principal still owed after this installment. */
  balanceCents: number;
}

export interface LoanTerms {
  principalCents: number;
  annualRateBp: number;
  installmentCents: number;
  /** Date of the first installment; the following ones fall on the same day of each month. */
  firstDate: ISODate;
  /** When set, the plan has exactly this many rows (the last one absorbs rounding). */
  installments?: number;
}

export function monthlyInterest(balanceCents: number, annualRateBp: number): number {
  return divRound(balanceCents * annualRateBp, MONTHLY_BP_DIVISOR);
}

/** Date of the k-th installment (0-based), always computed from the first date: no drift. */
export function installmentDate(firstDate: ISODate, index: number): ISODate {
  return addMonthsISO(firstDate, index);
}

/**
 * Constant installment that repays `principalCents` in `n` months:
 * P·i / (1 − (1+i)^−n), i = annual rate / 12. Linear (P / n) when the rate is 0.
 * Float only here, to get a fractional power; the result is rounded to the cent and the schedule
 * itself is computed in integers.
 */
export function installmentFor(principalCents: number, annualRateBp: number, n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error('n must be a positive integer');
  if (annualRateBp === 0) return divRound(principalCents, n);
  const i = annualRateBp / MONTHLY_BP_DIVISOR;
  return roundHalfAwayFromZero((principalCents * i) / (1 - Math.pow(1 + i, -n)));
}

export type TermsError =
  'principal' | 'rate' | 'installment' | 'installments' | 'tooShort' | 'tooLong';

/**
 * Why a plan cannot be built, or [] when it can.
 * - `tooShort`: the installment does not even cover the first month's interest (with a fixed
 *   number of installments the plan would also end in a huge last row).
 * - `tooLong`: more than MAX_INSTALLMENTS months would be needed.
 */
export function termsErrors(t: Omit<LoanTerms, 'firstDate'>): TermsError[] {
  const errors: TermsError[] = [];
  if (!Number.isSafeInteger(t.principalCents) || t.principalCents <= 0) errors.push('principal');
  if (!Number.isSafeInteger(t.annualRateBp) || t.annualRateBp < 0 || t.annualRateBp > 10_000)
    errors.push('rate');
  if (!Number.isSafeInteger(t.installmentCents) || t.installmentCents <= 0)
    errors.push('installment');
  if (
    t.installments !== undefined &&
    (!Number.isInteger(t.installments) || t.installments < 1 || t.installments > MAX_INSTALLMENTS)
  )
    errors.push('installments');
  if (errors.length) return errors;
  if (t.installmentCents <= monthlyInterest(t.principalCents, t.annualRateBp)) return ['tooShort'];
  if (t.installments === undefined && countInstallments(t) > MAX_INSTALLMENTS) return ['tooLong'];
  return [];
}

/**
 * Whether row `n` is the last one. With a fixed number of rows, it is row n. Otherwise it is the
 * row that leaves at most n cents unpaid: the installment a bank prints is rounded, and without
 * this slack a plan of exactly 12 × 856,07 € would end with a 13th installment of a few cents.
 */
function isLastRow(t: Omit<LoanTerms, 'firstDate'>, n: number, balance: number, interest: number) {
  if (t.installments !== undefined) return n === t.installments;
  return balance - (t.installmentCents - interest) <= n;
}

/** Rows needed when only the installment is known (assumes valid terms). */
function countInstallments(t: Omit<LoanTerms, 'firstDate'>): number {
  let balance = t.principalCents;
  for (let n = 1; n <= MAX_INSTALLMENTS; n++) {
    const interest = monthlyInterest(balance, t.annualRateBp);
    if (isLastRow(t, n, balance, interest)) return n;
    balance -= t.installmentCents - interest;
  }
  return MAX_INSTALLMENTS + 1;
}

/** The full plan. Throws on invalid terms: call `termsErrors` first. */
export function amortizationSchedule(t: LoanTerms): AmortizationRow[] {
  const errors = termsErrors(t);
  if (errors.length) throw new Error(`invalid loan terms: ${errors.join(', ')}`);
  const rows: AmortizationRow[] = [];
  let balance = t.principalCents;
  for (let n = 1; balance > 0; n++) {
    const interestCents = monthlyInterest(balance, t.annualRateBp);
    const last = isLastRow(t, n, balance, interestCents);
    const principalCents = last ? balance : Math.min(balance, t.installmentCents - interestCents);
    balance -= principalCents;
    rows.push({
      n,
      date: installmentDate(t.firstDate, n - 1),
      paymentCents: principalCents + interestCents,
      interestCents,
      principalCents,
      balanceCents: balance,
    });
  }
  return rows;
}
