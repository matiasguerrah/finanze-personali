/**
 * Aggregations for the Report page. Pure functions over transactions already loaded; amounts in
 * integer cents. Transfers never count as income or expense. Callers pass non-deleted rows, but
 * deleted ones are skipped here too.
 */
import type { ISODate, Transaction } from '../db/types';
import { addMonthsISO, monthRange, yearOf, yearRange, type DateRange } from './dates';

type Tx = Pick<Transaction, 'type' | 'amountCents' | 'date' | 'categoryId' | 'scope' | 'deleted'> &
  Partial<Pick<Transaction, 'activityId' | 'client' | 'invoiceNumber'>>;

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'last12';

export const PERIOD_PRESET_LABEL: Record<PeriodPreset, string> = {
  thisMonth: 'Questo mese',
  lastMonth: 'Mese scorso',
  last12: 'Ultimi 12 mesi',
  thisYear: "Quest'anno",
  lastYear: 'Anno scorso',
};

export function presetRange(preset: PeriodPreset, today: ISODate): DateRange {
  switch (preset) {
    case 'thisMonth':
      return monthRange(today);
    case 'lastMonth':
      return monthRange(addMonthsISO(monthRange(today).from, -1));
    case 'thisYear':
      return yearRange(yearOf(today));
    case 'lastYear':
      return yearRange(yearOf(today) - 1);
    case 'last12':
      return { from: addMonthsISO(monthRange(today).from, -11), to: monthRange(today).to };
  }
}

const inRange = (t: Tx, r: DateRange) => t.date >= r.from && t.date <= r.to;

export interface CategoryShare {
  categoryId: string;
  cents: number;
  count: number;
  /** Share of the total of this type, in basis points (floored, so they never exceed 10000). */
  shareBp: number;
}

/** Expenses (or income) of the range grouped by category, biggest first. */
export function byCategory(
  txs: readonly Tx[],
  type: 'expense' | 'income',
  range: DateRange,
): { totalCents: number; rows: CategoryShare[] } {
  const m = new Map<string, { cents: number; count: number }>();
  let totalCents = 0;
  for (const t of txs) {
    if (t.deleted || t.type !== type || !inRange(t, range)) continue;
    const e = m.get(t.categoryId) ?? { cents: 0, count: 0 };
    e.cents += t.amountCents;
    e.count++;
    m.set(t.categoryId, e);
    totalCents += t.amountCents;
  }
  const rows = [...m.entries()]
    .map(([categoryId, e]) => ({
      categoryId,
      ...e,
      shareBp: totalCents ? Math.floor((e.cents * 10_000) / totalCents) : 0,
    }))
    .sort((a, b) => b.cents - a.cents || a.categoryId.localeCompare(b.categoryId));
  return { totalCents, rows };
}

export interface MonthTotals {
  /** 'YYYY-MM' */
  month: string;
  /** First day of the month, for formatting. */
  from: ISODate;
  incomeCents: number;
  expenseCents: number;
}

/** `months` consecutive months ending with the month of `endDate`, oldest first, zeros included. */
export function monthlyTotals(txs: readonly Tx[], endDate: ISODate, months = 12): MonthTotals[] {
  const last = monthRange(endDate).from;
  const out: MonthTotals[] = [];
  const index = new Map<string, MonthTotals>();
  for (let i = months - 1; i >= 0; i--) {
    const from = addMonthsISO(last, -i);
    const row = { month: from.slice(0, 7), from, incomeCents: 0, expenseCents: 0 };
    out.push(row);
    index.set(row.month, row);
  }
  for (const t of txs) {
    if (t.deleted) continue;
    const row = index.get(t.date.slice(0, 7));
    if (!row) continue;
    if (t.type === 'income') row.incomeCents += t.amountCents;
    else if (t.type === 'expense') row.expenseCents += t.amountCents;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Professional reports (scope business)

export interface Ranked {
  key: string;
  cents: number;
  count: number;
}

function rank(entries: Map<string, { cents: number; count: number }>): Ranked[] {
  return [...entries.entries()]
    .map(([key, e]) => ({ key, ...e }))
    .sort((a, b) => b.cents - a.cents || a.key.localeCompare(b.key));
}

function add(m: Map<string, { cents: number; count: number }>, key: string, cents: number) {
  const e = m.get(key) ?? { cents: 0, count: 0 };
  e.cents += cents;
  e.count++;
  m.set(key, e);
}

export interface BusinessReport {
  year: number;
  incomeCents: number;
  /** Business expenses excluding substitute tax and INPS. */
  expenseCents: number;
  /** Substitute tax + INPS paid in the year (by payment date). */
  taxesCents: number;
  invoiceCount: number;
  /** 12 months, January first, with the running total. */
  months: Array<{ month: string; from: ISODate; incomeCents: number; cumulativeCents: number }>;
  /** key = activityId, '' when missing. */
  byActivity: Ranked[];
  /** key = client as typed (trimmed), '' when missing. Same client in different case is merged. */
  byClient: Ranked[];
  /** Business expenses by categoryId (taxes included, so the list adds up to everything paid). */
  expensesByCategory: Ranked[];
}

/**
 * Income and expenses with scope business in calendar year `year` (regime forfettario: cash
 * basis, so the transaction date decides the year). `fiscalCategoryIds` = INPS and substitute
 * tax categories, reported separately from ordinary expenses.
 */
export function businessReport(
  txs: readonly Tx[],
  year: number,
  fiscalCategoryIds: ReadonlySet<string>,
): BusinessReport {
  const r = yearRange(year);
  const months = Array.from({ length: 12 }, (_, i) => {
    const from = `${year}-${String(i + 1).padStart(2, '0')}-01`;
    return { month: from.slice(0, 7), from, incomeCents: 0, cumulativeCents: 0 };
  });
  const activities = new Map<string, { cents: number; count: number }>();
  const clients = new Map<string, { cents: number; count: number }>();
  const clientName = new Map<string, string>();
  const expenses = new Map<string, { cents: number; count: number }>();
  let incomeCents = 0;
  let expenseCents = 0;
  let taxesCents = 0;
  let invoiceCount = 0;

  for (const t of txs) {
    if (t.deleted || t.scope !== 'business' || !inRange(t, r)) continue;
    if (t.type === 'income') {
      incomeCents += t.amountCents;
      months[Number(t.date.slice(5, 7)) - 1]!.incomeCents += t.amountCents;
      add(activities, t.activityId ?? '', t.amountCents);
      const name = (t.client ?? '').trim();
      const k = name.toLocaleLowerCase('it');
      if (!clientName.has(k)) clientName.set(k, name);
      add(clients, k, t.amountCents);
      if (t.invoiceNumber?.trim()) invoiceCount++;
    } else if (t.type === 'expense') {
      add(expenses, t.categoryId, t.amountCents);
      if (fiscalCategoryIds.has(t.categoryId)) taxesCents += t.amountCents;
      else expenseCents += t.amountCents;
    }
  }
  let running = 0;
  for (const m of months) m.cumulativeCents = running += m.incomeCents;

  return {
    year,
    incomeCents,
    expenseCents,
    taxesCents,
    invoiceCount,
    months,
    byActivity: rank(activities),
    byClient: rank(clients).map((c) => ({ ...c, key: clientName.get(c.key) ?? c.key })),
    expensesByCategory: rank(expenses),
  };
}

/** Business income per calendar year, most recent first (years with income only). */
export function businessIncomeByYear(txs: readonly Tx[]): Array<{ year: number; cents: number }> {
  const m = new Map<number, number>();
  for (const t of txs) {
    if (t.deleted || t.scope !== 'business' || t.type !== 'income') continue;
    const y = yearOf(t.date);
    m.set(y, (m.get(y) ?? 0) + t.amountCents);
  }
  return [...m.entries()].map(([year, cents]) => ({ year, cents })).sort((a, b) => b.year - a.year);
}
