/** Recurring payments: due-date arithmetic, status and validation. */
import { getDaysInMonth } from 'date-fns';
import type { ISODate, Recurring, RecurringFrequency } from '../db/types';
import { addDaysISO, addMonthsISO, daysBetween, fromISODate, isISODate } from './dates';

const MONTHS: Partial<Record<RecurringFrequency, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
};

export function isMonthBased(f: RecurringFrequency): boolean {
  return MONTHS[f] !== undefined;
}

/** The anchor day to store for a due date: its day of month, only for month-based frequencies. */
export function anchorDayFor(date: ISODate, f: RecurringFrequency): number | undefined {
  return isMonthBased(f) ? Number(date.slice(8, 10)) : undefined;
}

type Schedule = Pick<Recurring, 'frequency' | 'customDays' | 'anchorDay'>;

/** The due date after `date`. Month-based schedules go back to `anchorDay` when the month allows. */
export function advanceDueDate(date: ISODate, s: Schedule): ISODate {
  const months = MONTHS[s.frequency];
  if (months === undefined) return addDaysISO(date, Math.max(1, s.customDays ?? 1));
  const next = addMonthsISO(date, months); // clamped to the end of month
  if (!s.anchorDay) return next;
  const day = Math.min(s.anchorDay, getDaysInMonth(fromISODate(next)));
  return `${next.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

/** First date with the given month/day that is on or after `today` (e.g. fiscal deadlines). */
export function nextYearlyOccurrence(month: number, day: number, today: ISODate): ISODate {
  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${mmdd}`;
  return thisYear >= today ? thisYear : `${year + 1}-${mmdd}`;
}

export type DueStatus = 'overdue' | 'dueSoon' | 'upcoming';

/** Overdue before today; dueSoon from `reminderDaysBefore` days before up to the day itself. */
export function dueStatus(
  r: Pick<Recurring, 'nextDueDate' | 'reminderDaysBefore'>,
  today: ISODate,
): DueStatus {
  const days = daysBetween(today, r.nextDueDate);
  if (days < 0) return 'overdue';
  return days <= r.reminderDaysBefore ? 'dueSoon' : 'upcoming';
}

type RecurringLike = Pick<
  Recurring,
  'id' | 'nextDueDate' | 'reminderDaysBefore' | 'active' | 'deleted'
>;

export interface DueGroups<R> {
  overdue: R[];
  dueSoon: R[];
  upcoming: R[];
  inactive: R[];
}

/** Splits recurrences by status, each group sorted by due date. Deleted ones are dropped. */
export function groupByDueStatus<R extends RecurringLike>(list: R[], today: ISODate): DueGroups<R> {
  const g: DueGroups<R> = { overdue: [], dueSoon: [], upcoming: [], inactive: [] };
  const sorted = list
    .filter((r) => !r.deleted)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate) || a.id.localeCompare(b.id));
  for (const r of sorted) {
    if (!r.active) g.inactive.push(r);
    else g[dueStatus(r, today)].push(r);
  }
  return g;
}

/** Number of active recurrences that need attention (overdue or due soon): the nav badge. */
export function attentionCount(list: RecurringLike[], today: ISODate): number {
  return list.filter((r) => !r.deleted && r.active && dueStatus(r, today) !== 'upcoming').length;
}

export function validateRecurring(
  r: Pick<
    Recurring,
    | 'name'
    | 'amountCents'
    | 'categoryId'
    | 'accountId'
    | 'frequency'
    | 'customDays'
    | 'nextDueDate'
    | 'reminderDaysBefore'
  >,
): string[] {
  const errors: string[] = [];
  if (!r.name.trim()) errors.push('Il nome è obbligatorio.');
  // 0 is allowed: "amount still unknown" (e.g. taxes before the estimate is available).
  if (!Number.isSafeInteger(r.amountCents) || r.amountCents < 0) errors.push('Importo non valido.');
  if (!r.categoryId) errors.push('Scegli una categoria.');
  if (!r.accountId) errors.push('Scegli un conto.');
  if (
    r.frequency === 'custom' &&
    (!Number.isInteger(r.customDays) || (r.customDays ?? 0) < 1 || (r.customDays ?? 0) > 3660)
  )
    errors.push('Indica ogni quanti giorni si ripete (1–3660).');
  if (!isISODate(r.nextDueDate)) errors.push('Data della prossima scadenza non valida.');
  if (
    !Number.isInteger(r.reminderDaysBefore) ||
    r.reminderDaysBefore < 0 ||
    r.reminderDaysBefore > 365
  )
    errors.push('Il preavviso deve essere tra 0 e 365 giorni.');
  return errors;
}

export const FREQUENCY_LABEL: Record<RecurringFrequency, string> = {
  monthly: 'Mensile',
  bimonthly: 'Bimestrale',
  quarterly: 'Trimestrale',
  yearly: 'Annuale',
  custom: 'Ogni N giorni',
};

export function frequencyText(r: Pick<Recurring, 'frequency' | 'customDays'>): string {
  return r.frequency === 'custom'
    ? `ogni ${r.customDays ?? '?'} giorni`
    : FREQUENCY_LABEL[r.frequency].toLowerCase();
}

/** "oggi", "domani", "tra 5 giorni", "scaduta ieri", "scaduta da 3 giorni". */
export function dueText(date: ISODate, today: ISODate): string {
  const d = daysBetween(today, date);
  if (d === 0) return 'oggi';
  if (d === 1) return 'domani';
  if (d === -1) return 'scaduta ieri';
  return d > 0 ? `tra ${d} giorni` : `scaduta da ${-d} giorni`;
}
