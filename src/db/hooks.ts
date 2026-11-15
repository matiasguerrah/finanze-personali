/** Reactive read hooks (Dexie liveQuery). Soft-deleted rows are always excluded. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Account, Activity, Category, ISODate, Recurring, Transaction } from './types';
import { accountBalances } from '../lib/balances';

const EMPTY: never[] = [];

export function useCategories(): Category[] {
  return useLiveQuery(() => db.categories.filter((c) => !c.deleted).sortBy('sortOrder'), [], EMPTY);
}

export function useAccounts(): Account[] {
  return useLiveQuery(() => db.accounts.filter((a) => !a.deleted).sortBy('sortOrder'), [], EMPTY);
}

export function useActivities(): Activity[] {
  return useLiveQuery(() => db.activities.filter((a) => !a.deleted).sortBy('sortOrder'), [], EMPTY);
}

/** Transactions in [from, to] (inclusive), newest first. */
export function useTransactionsBetween(from: ISODate, to: ISODate): Transaction[] | undefined {
  return useLiveQuery(
    async () =>
      (
        await db.transactions
          .where('date')
          .between(from, to, true, true)
          .filter((t) => !t.deleted)
          .toArray()
      ).sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
      ),
    [from, to],
  );
}

export function useRecurring(): Recurring[] | undefined {
  return useLiveQuery(() => db.recurring.filter((r) => !r.deleted).sortBy('nextDueDate'), []);
}

/** Balance of every account as of `asOf` (Map accountId → cents). */
export function useAccountBalances(asOf: ISODate): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const [accounts, txs] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
    return accountBalances(accounts, txs, asOf);
  }, [asOf]);
}

/** How many non-deleted transactions and recurrences reference each account. */
export function useAccountUsage(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const m = new Map<string, number>();
    const inc = (id?: string) => id && m.set(id, (m.get(id) ?? 0) + 1);
    await db.transactions
      .filter((t) => !t.deleted)
      .each((t) => {
        inc(t.accountId);
        inc(t.toAccountId);
      });
    await db.recurring.filter((r) => !r.deleted).each((r) => inc(r.accountId));
    return m;
  }, []);
}
