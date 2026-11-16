/**
 * Regime forfettario estimate for a calendar year (cash basis). No fiscal value lives here: rates,
 * coefficients and thresholds come from the `activities` and `taxParams` records.
 *
 * - Taxable income = Σ per activity (business income attributed to it × its coefficient).
 * - Contributions = taxable × contribution rate + fixed quota.
 * - Substitute tax = (taxable − INPS contributions actually paid in the year) × tax rate, ≥ 0.
 * - Set-aside = contributions + tax; net = income − set-aside.
 * - Revenue threshold: compared with ALL business income of the year.
 */
import type {
  Activity,
  Category,
  ISODate,
  Recurring,
  TaxKind,
  TaxParams,
  Transaction,
} from '../db/types';
import { isActiveOn } from './activities';
import { applyBp, BP_100, divRound } from './money';

export type TaxTx = Pick<
  Transaction,
  'id' | 'type' | 'scope' | 'date' | 'amountCents' | 'categoryId' | 'activityId' | 'deleted'
>;

export interface TaxContext {
  transactions: readonly TaxTx[];
  activities: readonly Activity[];
  params: readonly TaxParams[];
  categories: readonly Pick<Category, 'id' | 'systemKey'>[];
}

/** In-app alert levels of the revenue bar (UI choice, not a fiscal parameter). */
export const THRESHOLD_WARN_BP = 8000;
export const THRESHOLD_ALERT_BP = 9500;

export type ThresholdLevel = 'ok' | 'warn' | 'alert' | 'over';

export interface ActivityLine {
  activityId: string;
  incomeCents: number;
  count: number;
  coefficientBp: number;
  taxableCents: number;
  /** income − taxable: the expenses the coefficient already recognises. */
  forfaitExpenseCents: number;
}

export interface Unattributed {
  id: string;
  date: ISODate;
  amountCents: number;
  reason: 'missing' | 'inactive';
}

export interface Estimate {
  params: TaxParams;
  contributionsCents: number;
  /** The proportional part (taxable × rate), without the fixed quota. */
  contributionsVariableCents: number;
  taxBaseCents: number;
  taxCents: number;
  setAsideCents: number;
  setAsideMonthlyCents: number;
  netCents: number;
  threshold: { limitCents: number; usedBp: number; level: ThresholdLevel };
}

export interface TaxYear {
  year: number;
  /** All business income of the year. */
  incomeCents: number;
  byActivity: ActivityLine[];
  /** Business income with no activity, or one not active on its date: not in the taxable. */
  unattributed: Unattributed[];
  unattributedCents: number;
  taxableCents: number;
  /** Business expenses of the year, INPS and substitute tax excluded. */
  realExpensesCents: number;
  forfaitExpensesCents: number;
  realExceedsForfait: boolean;
  /** Contributions paid in the year (category `inps`, any scope): deducted from the tax base. */
  inpsPaidCents: number;
  substituteTaxPaidCents: number;
  /** null when no taxParams apply to the year. */
  estimate: Estimate | null;
}

/** The params with the latest validFromYear ≤ year, or null. */
export function paramsForYear(params: readonly TaxParams[], year: number): TaxParams | null {
  let best: TaxParams | null = null;
  for (const p of params)
    if (!p.deleted && p.validFromYear <= year && (!best || p.validFromYear > best.validFromYear))
      best = p;
  return best;
}

export const DISCLAIMER = 'Stima indicativa, da verificare con il commercialista.';

/** One-line state of the revenue bar (the text says it, not only the colour). */
export function thresholdText(level: ThresholdLevel, usedBp: number): string {
  const pct = `${Math.floor(usedBp / 100)}%`;
  if (level === 'over') return `Soglia superata (${pct})`;
  if (level === 'alert') return `Attenzione: ${pct} della soglia, oltre il 95%`;
  if (level === 'warn') return `Attenzione: ${pct} della soglia, oltre l’80%`;
  return `${pct} della soglia`;
}

const LEVELS: ThresholdLevel[] = ['warn', 'alert', 'over'];

/**
 * In-app alert for the revenue threshold, once per year and level. Returns the keys to remember
 * (the reached level and the lower ones, so jumping from 70% to 96% announces only once), or null
 * when nothing new has been reached.
 */
export function pendingThresholdAlert(
  year: number,
  level: ThresholdLevel,
  shown: ReadonlySet<string>,
): string[] | null {
  const reached = LEVELS.slice(0, LEVELS.indexOf(level) + 1);
  const keys = reached.map((l) => `revenue:${year}:${l}`);
  return keys.length > 0 && !shown.has(keys[keys.length - 1]!) ? keys : null;
}

export function thresholdLevel(usedBp: number): ThresholdLevel {
  if (usedBp > BP_100) return 'over';
  if (usedBp >= THRESHOLD_ALERT_BP) return 'alert';
  if (usedBp >= THRESHOLD_WARN_BP) return 'warn';
  return 'ok';
}

export function taxYear(ctx: TaxContext, year: number): TaxYear {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const keyOf = new Map(ctx.categories.map((c) => [c.id, c.systemKey]));
  const activity = new Map(ctx.activities.map((a) => [a.id, a]));
  const lines = new Map<string, ActivityLine>();
  const unattributed: Unattributed[] = [];
  let incomeCents = 0;
  let realExpensesCents = 0;
  let inpsPaidCents = 0;
  let substituteTaxPaidCents = 0;

  for (const t of ctx.transactions) {
    if (t.deleted || t.date < from || t.date > to) continue;
    if (t.type === 'expense') {
      const key = keyOf.get(t.categoryId);
      if (key === 'inps') inpsPaidCents += t.amountCents;
      else if (key === 'substituteTax') substituteTaxPaidCents += t.amountCents;
      else if (t.scope === 'business') realExpensesCents += t.amountCents;
      continue;
    }
    if (t.type !== 'income' || t.scope !== 'business') continue;
    incomeCents += t.amountCents;
    const a = t.activityId ? activity.get(t.activityId) : undefined;
    if (!a || !isActiveOn(a, t.date)) {
      unattributed.push({
        id: t.id,
        date: t.date,
        amountCents: t.amountCents,
        reason: t.activityId ? 'inactive' : 'missing',
      });
      continue;
    }
    const line = lines.get(a.id) ?? {
      activityId: a.id,
      incomeCents: 0,
      count: 0,
      coefficientBp: a.coefficientBp,
      taxableCents: 0,
      forfaitExpenseCents: 0,
    };
    line.incomeCents += t.amountCents;
    line.count += 1;
    lines.set(a.id, line);
  }

  const order = new Map(ctx.activities.map((a) => [a.id, a.sortOrder]));
  const byActivity = [...lines.values()]
    .map((l) => {
      // Rounded once per activity; the forfait part is the exact complement.
      const taxableCents = applyBp(l.incomeCents, l.coefficientBp);
      return { ...l, taxableCents, forfaitExpenseCents: l.incomeCents - taxableCents };
    })
    .sort((a, b) => (order.get(a.activityId) ?? 0) - (order.get(b.activityId) ?? 0));
  const taxableCents = byActivity.reduce((s, l) => s + l.taxableCents, 0);
  const forfaitExpensesCents = byActivity.reduce((s, l) => s + l.forfaitExpenseCents, 0);
  unattributed.sort((a, b) => a.date.localeCompare(b.date));

  const params = paramsForYear(ctx.params, year);
  let estimate: Estimate | null = null;
  if (params) {
    const contributionsVariableCents = applyBp(taxableCents, params.contributionRateBp);
    const contributionsCents = contributionsVariableCents + params.fixedContributionCents;
    const taxBaseCents = Math.max(0, taxableCents - inpsPaidCents);
    const taxCents = applyBp(taxBaseCents, params.substituteTaxBp);
    const setAsideCents = contributionsCents + taxCents;
    const usedBp =
      params.revenueThresholdCents > 0
        ? divRound(incomeCents * BP_100, params.revenueThresholdCents)
        : 0;
    estimate = {
      params,
      contributionsCents,
      contributionsVariableCents,
      taxBaseCents,
      taxCents,
      setAsideCents,
      setAsideMonthlyCents: divRound(setAsideCents, 12),
      netCents: incomeCents - setAsideCents,
      threshold: {
        limitCents: params.revenueThresholdCents,
        usedBp,
        level: params.revenueThresholdCents > 0 ? thresholdLevel(usedBp) : 'ok',
      },
    };
  }

  return {
    year,
    incomeCents,
    byActivity,
    unattributed,
    unattributedCents: unattributed.reduce((s, u) => s + u.amountCents, 0),
    taxableCents,
    realExpensesCents,
    forfaitExpensesCents,
    realExceedsForfait: realExpensesCents > forfaitExpensesCents,
    inpsPaidCents,
    substituteTaxPaidCents,
    estimate,
  };
}

/** What the wizard still needs before an estimate can be shown for `year`. */
export function setupStatus(ctx: Pick<TaxContext, 'activities' | 'params'>, year: number) {
  const hasActivities = ctx.activities.some((a) => !a.deleted);
  const hasParams = paramsForYear(ctx.params, year) !== null;
  return { hasActivities, hasParams, complete: hasActivities && hasParams };
}

// ---------------------------------------------------------------------------------------------
// Proposed amounts for the fiscal deadlines ("metodo storico")

export type FiscalItem = 'tax' | 'contributions';

export interface FiscalProposal {
  totalCents: number;
  parts: { label: string; cents: number }[];
}

/** Amount on which advances are computed: the tax, or the proportional contributions. */
function base(y: TaxYear, item: FiscalItem): number | null {
  if (!y.estimate) return null;
  return item === 'tax' ? y.estimate.taxCents : y.estimate.contributionsVariableCents;
}

function shares(p: TaxParams | null, item: FiscalItem) {
  if (!p) return null;
  const first = item === 'tax' ? p.taxFirstAdvanceBp : p.contributionFirstAdvanceBp;
  const second = item === 'tax' ? p.taxSecondAdvanceBp : p.contributionSecondAdvanceBp;
  return first === undefined || second === undefined ? null : { first, second };
}

/**
 * Proposal for a fiscal recurrence due in `dueYear` (D):
 * - secondAdvance (November D) = base(D−1) × second%(D)
 * - balanceAndFirstAdvance (June D) = balance of D−1 + first advance for D, where
 *   balance = amount(D−1) − advances due for D−1 (base(D−2) × (first+second)%(D−1)).
 *   A year without data counts as no advances (e.g. the first year of activity). Never < 0.
 * Returns null when the inputs are missing (no estimate for D−1 or no advance percentages).
 */
export function fiscalProposal(
  ctx: TaxContext,
  kind: TaxKind,
  item: FiscalItem,
  dueYear: number,
): FiscalProposal | null {
  const prev = taxYear(ctx, dueYear - 1);
  const prevBase = base(prev, item);
  const now = shares(paramsForYear(ctx.params, dueYear), item);
  if (prevBase === null || !now) return null;
  const what = item === 'tax' ? 'imposta' : 'contributi';

  if (kind === 'secondAdvance') {
    const cents = applyBp(prevBase, now.second);
    return { totalCents: cents, parts: [{ label: `2° acconto ${what} ${dueYear}`, cents }] };
  }

  const before = shares(paramsForYear(ctx.params, dueYear - 1), item);
  const twoBack = base(taxYear(ctx, dueYear - 2), item) ?? 0;
  const advancesDue = before ? applyBp(twoBack, before.first + before.second) : 0;
  const amountPrev =
    item === 'tax' ? prev.estimate!.taxCents : prev.estimate!.contributionsVariableCents;
  const balance = amountPrev - advancesDue;
  const first = applyBp(prevBase, now.first);
  return {
    totalCents: Math.max(0, balance + first),
    parts: [
      { label: `Saldo ${what} ${dueYear - 1}`, cents: balance },
      { label: `1° acconto ${what} ${dueYear}`, cents: first },
    ],
  };
}

/** Proposal for a recurrence, if it is a fiscal one (taxKind + inps/substituteTax category). */
export function proposalForRecurring(
  ctx: TaxContext,
  r: Pick<Recurring, 'taxKind' | 'categoryId' | 'nextDueDate'>,
): FiscalProposal | null {
  if (!r.taxKind) return null;
  const key = ctx.categories.find((c) => c.id === r.categoryId)?.systemKey;
  const item: FiscalItem | null =
    key === 'substituteTax' ? 'tax' : key === 'inps' ? 'contributions' : null;
  if (!item) return null;
  return fiscalProposal(ctx, r.taxKind, item, Number(r.nextDueDate.slice(0, 4)));
}

// ---------------------------------------------------------------------------------------------

export function validateTaxParams(
  p: Pick<
    TaxParams,
    | 'validFromYear'
    | 'substituteTaxBp'
    | 'contributionRateBp'
    | 'fixedContributionCents'
    | 'revenueThresholdCents'
    | 'taxFirstAdvanceBp'
    | 'taxSecondAdvanceBp'
    | 'contributionFirstAdvanceBp'
    | 'contributionSecondAdvanceBp'
  >,
  others: readonly Pick<TaxParams, 'validFromYear' | 'deleted'>[],
): string[] {
  const errors: string[] = [];
  const rate = (bp: number) => Number.isInteger(bp) && bp >= 0 && bp <= BP_100;
  if (!Number.isInteger(p.validFromYear) || p.validFromYear < 2000 || p.validFromYear > 2100)
    errors.push('Indica un anno valido.');
  else if (others.some((o) => !o.deleted && o.validFromYear === p.validFromYear))
    errors.push(`Esistono già parametri dal ${p.validFromYear}: modifica quelli.`);
  if (!rate(p.substituteTaxBp)) errors.push("L'aliquota dell'imposta deve essere tra 0% e 100%.");
  if (!rate(p.contributionRateBp))
    errors.push("L'aliquota dei contributi deve essere tra 0% e 100%.");
  if (!Number.isSafeInteger(p.fixedContributionCents) || p.fixedContributionCents < 0)
    errors.push('La quota fissa non può essere negativa.');
  if (!Number.isSafeInteger(p.revenueThresholdCents) || p.revenueThresholdCents <= 0)
    errors.push('La soglia ricavi deve essere maggiore di zero.');
  const adv = [
    p.taxFirstAdvanceBp,
    p.taxSecondAdvanceBp,
    p.contributionFirstAdvanceBp,
    p.contributionSecondAdvanceBp,
  ];
  if (adv.some((a) => a !== undefined && !rate(a)))
    errors.push('Le percentuali degli acconti devono essere tra 0% e 100%.');
  return errors;
}
