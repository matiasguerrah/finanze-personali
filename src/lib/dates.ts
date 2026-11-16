/**
 * Calendar helpers. Calendar dates are `YYYY-MM-DD` strings in Europe/Rome; arithmetic on them is
 * done on local Date objects at midnight, which is timezone-independent for whole days.
 */
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { it } from 'date-fns/locale';
import type { ISODate } from '../db/types';

export const TIME_ZONE = 'Europe/Rome';
const WEEK_OPTS = { weekStartsOn: 1 as const };

const romeDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Europe/Rome, regardless of the device timezone. */
export function todayRome(now: Date = new Date()): ISODate {
  return romeDateFormatter.format(now);
}

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(parseISO(s)) && toISODate(parseISO(s)) === s;
}

export function fromISODate(s: ISODate): Date {
  return parseISO(s);
}

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function addDaysISO(s: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(s), days));
}

export function addMonthsISO(s: ISODate, months: number): ISODate {
  // date-fns clamps to the end of month (31 Jan + 1 month = 28/29 Feb).
  return toISODate(addMonths(fromISODate(s), months));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(fromISODate(to), fromISODate(from));
}

export interface DateRange {
  from: ISODate; // inclusive
  to: ISODate; // inclusive
}

export function dayRange(s: ISODate): DateRange {
  return { from: s, to: s };
}

export function weekRange(s: ISODate): DateRange {
  const d = fromISODate(s);
  return { from: toISODate(startOfWeek(d, WEEK_OPTS)), to: toISODate(endOfWeek(d, WEEK_OPTS)) };
}

export function monthRange(s: ISODate): DateRange {
  const d = fromISODate(s);
  return { from: toISODate(startOfMonth(d)), to: toISODate(endOfMonth(d)) };
}

export function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function inRange(s: ISODate, r: DateRange): boolean {
  return s >= r.from && s <= r.to;
}

export function yearOf(s: ISODate): number {
  return Number(s.slice(0, 4));
}

/** "Oggi", "Ieri", or "lunedì 3 novembre" (+ year if different from today). */
export function formatDayHeading(s: ISODate, today: ISODate = todayRome()): string {
  if (s === today) return 'Oggi';
  if (s === addDaysISO(today, -1)) return 'Ieri';
  const pattern = yearOf(s) === yearOf(today) ? 'EEEE d MMMM' : 'EEEE d MMMM yyyy';
  return format(fromISODate(s), pattern, { locale: it });
}

export function formatShortDate(s: ISODate): string {
  return format(fromISODate(s), 'd MMM yyyy', { locale: it });
}

/** "gen 2027": month and year, for payoff dates and chart axes. */
export function formatMonthYear(s: ISODate): string {
  return format(fromISODate(s), 'MMM yyyy', { locale: it });
}
