/** Pure helpers for transactions: defaults, validation, grouping and totals. */
import type { Activity, ISODate, Scope, ScopeFilter, Transaction, TxType } from '../db/types';
import { checkActivityAssignment } from './activities';

type TxLike = Pick<Transaction, 'type' | 'amountCents' | 'scope' | 'date'>;

/**
 * Scope proposed in the keypad: business if either the category or the account defaults to
 * business, otherwise personal. The user can override it with one tap.
 */
export function proposedScope(categoryScope?: Scope, accountScope?: Scope): Scope {
  return categoryScope === 'business' || accountScope === 'business' ? 'business' : 'personal';
}

export interface TxDraft {
  type: TxType;
  amountCents: number;
  scope: Scope;
  date: ISODate;
  /** Ignored for transfers. */
  categoryId: string;
  accountId: string;
  /** Only for transfers. */
  toAccountId?: string;
  activityId?: string;
}

export type TxDraftError =
  | 'amount'
  | 'category'
  | 'account'
  | 'toAccount'
  | 'sameAccount'
  | 'activityMissing'
  | 'activityInactive';

export function validateDraft(
  d: TxDraft,
  activities: Pick<Activity, 'id' | 'activeFrom' | 'activeTo' | 'deleted'>[],
): TxDraftError[] {
  const errors: TxDraftError[] = [];
  if (!Number.isSafeInteger(d.amountCents) || d.amountCents <= 0) errors.push('amount');
  if (!d.accountId) errors.push('account');
  if (d.type === 'transfer') {
    if (!d.toAccountId) errors.push('toAccount');
    else if (d.toAccountId === d.accountId) errors.push('sameAccount');
    return errors;
  }
  if (!d.categoryId) errors.push('category');
  const a = checkActivityAssignment(d, activities);
  if (a === 'missing') errors.push('activityMissing');
  if (a === 'inactive') errors.push('activityInactive');
  return errors;
}

/** Signed effect on the overall balance: income +, expense −, transfer 0. */
export function signedCents(t: Pick<Transaction, 'type' | 'amountCents'>): number {
  if (t.type === 'income') return t.amountCents;
  if (t.type === 'expense') return -t.amountCents;
  return 0;
}

export function filterByScope<T extends Pick<Transaction, 'scope'>>(txs: T[], f: ScopeFilter): T[] {
  return f === 'all' ? txs : txs.filter((t) => t.scope === f);
}

export interface Totals {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export function totals(txs: TxLike[]): Totals {
  let incomeCents = 0;
  let expenseCents = 0;
  for (const t of txs) {
    if (t.type === 'income') incomeCents += t.amountCents;
    else if (t.type === 'expense') expenseCents += t.amountCents;
  }
  return { incomeCents, expenseCents, netCents: incomeCents - expenseCents };
}

export interface DayGroup<T> {
  date: ISODate;
  items: T[];
  netCents: number;
}

/** Groups by date preserving input order (callers pass newest first). */
export function groupByDay<T extends TxLike>(txs: T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const t of txs) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== t.date) {
      g = { date: t.date, items: [], netCents: 0 };
      groups.push(g);
    }
    g.items.push(t);
    g.netCents += signedCents(t);
  }
  return groups;
}

/** Comma/space separated input → unique, trimmed, lowercase tags. */
export function parseTags(input: string): string[] {
  return [
    ...new Set(input.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '').toLowerCase())),
  ].filter(Boolean);
}
