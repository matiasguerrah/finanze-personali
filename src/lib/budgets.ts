/** Budget thresholds ("soglie"): spending per period, status and alert de-duplication. */
import type { Budget, BudgetPeriod, ISODate, Transaction } from '../db/types';
import { BP_100 } from './money';
import { dayRange, monthRange, weekRange, type DateRange } from './dates';

export function periodRange(period: BudgetPeriod, date: ISODate): DateRange {
  if (period === 'daily') return dayRange(date);
  if (period === 'weekly') return weekRange(date);
  return monthRange(date);
}

/** The smallest range covering the current period of every budget (to query transactions once). */
export function coveringRange(budgets: Pick<Budget, 'period'>[], date: ISODate): DateRange {
  const ranges = budgets.map((b) => periodRange(b.period, date));
  if (ranges.length === 0) return dayRange(date);
  return {
    from: ranges.reduce((m, r) => (r.from < m ? r.from : m), ranges[0]!.from),
    to: ranges.reduce((m, r) => (r.to > m ? r.to : m), ranges[0]!.to),
  };
}

type BudgetLike = Pick<Budget, 'scope' | 'target' | 'categoryId' | 'period'>;
type TxLike = Pick<
  Transaction,
  'type' | 'amountCents' | 'scope' | 'categoryId' | 'date' | 'deleted'
>;

/** True if the transaction counts towards the budget (expenses only, matching scope/category). */
export function countsTowards(b: BudgetLike, t: TxLike): boolean {
  if (t.deleted || t.type !== 'expense') return false;
  if (b.scope !== 'all' && b.scope !== t.scope) return false;
  return b.target === 'global' || t.categoryId === b.categoryId;
}

export function spentInRange(b: BudgetLike, txs: TxLike[], range: DateRange): number {
  let total = 0;
  for (const t of txs)
    if (t.date >= range.from && t.date <= range.to && countsTowards(b, t)) total += t.amountCents;
  return total;
}

export type BudgetStatus = 'ok' | 'warn' | 'over';

/** warn from warnAtBp of the limit (inclusive), over when strictly above the limit. */
export function budgetStatus(
  spentCents: number,
  limitCents: number,
  warnAtBp: number,
): BudgetStatus {
  if (spentCents > limitCents) return 'over';
  // Integer comparison of spent/limit ≥ warnAtBp/10000 (no floats).
  if (spentCents * BP_100 >= limitCents * warnAtBp) return 'warn';
  return 'ok';
}

/** Spent as a share of the limit in basis points, capped at 100% (for progress bars). */
export function progressBp(spentCents: number, limitCents: number): number {
  if (limitCents <= 0) return BP_100;
  return Math.min(BP_100, Math.floor((spentCents * BP_100) / limitCents));
}

export interface BudgetEvaluation<B> {
  budget: B;
  range: DateRange;
  spentCents: number;
  remainingCents: number;
  status: BudgetStatus;
}

/** Evaluates every active, non-deleted budget for the period containing `date`. */
export function evaluateBudgets<B extends Budget>(
  budgets: B[],
  txs: TxLike[],
  date: ISODate,
): BudgetEvaluation<B>[] {
  return budgets
    .filter((b) => b.active && !b.deleted)
    .map((budget) => {
      const range = periodRange(budget.period, date);
      const spentCents = spentInRange(budget, txs, range);
      return {
        budget,
        range,
        spentCents,
        remainingCents: budget.limitCents - spentCents,
        status: budgetStatus(spentCents, budget.limitCents, budget.warnAtBp),
      };
    });
}

/** Unique key of an alert: one per budget, period and level, so it is shown only once. */
export function budgetAlertKey(budgetId: string, range: DateRange, level: 'warn' | 'over'): string {
  return `budget:${budgetId}:${range.from}:${level}`;
}

/**
 * Alerts not shown yet. Reaching "over" directly also consumes the "warn" key, so a later
 * recalculation does not announce a lower level.
 */
export function pendingBudgetAlerts<B extends Budget>(
  evals: BudgetEvaluation<B>[],
  shown: ReadonlySet<string>,
): Array<{ evaluation: BudgetEvaluation<B>; keys: string[] }> {
  const out: Array<{ evaluation: BudgetEvaluation<B>; keys: string[] }> = [];
  for (const e of evals) {
    if (e.status === 'ok') continue;
    const main = budgetAlertKey(e.budget.id, e.range, e.status);
    if (shown.has(main)) continue;
    const keys = [main];
    if (e.status === 'over') keys.push(budgetAlertKey(e.budget.id, e.range, 'warn'));
    out.push({ evaluation: e, keys });
  }
  return out;
}

/** Drops alert keys whose period started before `cutoff` (keeps the settings row small). */
export function pruneAlertKeys(keys: string[], cutoff: ISODate): string[] {
  return keys.filter((k) => {
    const date = /:(\d{4}-\d{2}-\d{2})(?::|$)/.exec(k)?.[1];
    return date === undefined || date >= cutoff;
  });
}

export function validateBudget(
  b: Pick<Budget, 'target' | 'categoryId' | 'limitCents' | 'warnAtBp'>,
): string[] {
  const errors: string[] = [];
  if (b.target === 'category' && !b.categoryId) errors.push('Scegli una categoria.');
  if (!Number.isSafeInteger(b.limitCents) || b.limitCents <= 0)
    errors.push('Il limite deve essere maggiore di zero.');
  if (!Number.isInteger(b.warnAtBp) || b.warnAtBp <= 0 || b.warnAtBp > BP_100)
    errors.push('La soglia di avviso deve essere tra 1% e 100%.');
  return errors;
}

const PERIOD_NOW: Record<BudgetPeriod, string> = {
  daily: 'oggi',
  weekly: 'questa settimana',
  monthly: 'questo mese',
};
export const PERIOD_LABEL: Record<BudgetPeriod, string> = {
  daily: 'Giornaliera',
  weekly: 'Settimanale',
  monthly: 'Mensile',
};

/** "Ristoranti", "Spese totali", "Spese di lavoro"… plus the scope when it narrows a category. */
export function budgetLabel(
  b: Pick<Budget, 'scope' | 'target'>,
  categoryName: string | undefined,
): string {
  if (b.target === 'global')
    return b.scope === 'all'
      ? 'Spese totali'
      : b.scope === 'personal'
        ? 'Spese personali'
        : 'Spese di lavoro';
  const name = categoryName ?? 'Categoria eliminata';
  return b.scope === 'all' ? name : `${name} (${b.scope === 'personal' ? 'personale' : 'lavoro'})`;
}

/** Whole percentage used, for messages (floor, so 79.9% is never shown as 80%). */
export function percentUsed(spentCents: number, limitCents: number): number {
  return limitCents <= 0 ? 100 : Math.floor((spentCents * 100) / limitCents);
}

/** "al 75%" / "all'85%": Italian elision before numbers read with a leading vowel (uno, otto, undici, ottanta…). */
export function alPercent(n: number): string {
  const vowel = n === 1 || n === 11 || String(n).startsWith('8');
  return `${vowel ? "all'" : 'al '}${n}%`;
}

export function budgetAlertMessage(
  label: string,
  e: Pick<BudgetEvaluation<Budget>, 'spentCents' | 'status' | 'budget'>,
  format: (cents: number) => string,
): string {
  const { limitCents, period } = e.budget;
  const when = PERIOD_NOW[period];
  return e.status === 'over'
    ? `Soglia «${label}» superata: ${format(e.spentCents)} su ${format(limitCents)} ${when}.`
    : `Soglia «${label}» ${alPercent(percentUsed(e.spentCents, limitCents))}: ${format(e.spentCents)} su ${format(limitCents)} ${when}.`;
}
