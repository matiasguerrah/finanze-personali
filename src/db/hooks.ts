/** Reactive read hooks (Dexie liveQuery). Soft-deleted rows are always excluded. */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { PROFILE_ID } from './types';
import type {
  Account,
  Activity,
  Budget,
  Category,
  Debt,
  ISODate,
  Profile,
  Recurring,
  Transaction,
} from './types';
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

/** Every live transaction (reports need several ranges at once; volumes are small). */
export function useAllTransactions(): Transaction[] | undefined {
  return useLiveQuery(() => db.transactions.filter((t) => !t.deleted).toArray(), []);
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

export function useBudgets(): Budget[] | undefined {
  return useLiveQuery(() => db.budgets.filter((b) => !b.deleted).toArray(), []);
}

export function useDebts(): Debt[] | undefined {
  return useLiveQuery(() => db.debts.filter((d) => !d.deleted).sortBy('startDate'), []);
}

/** Non-deleted expenses linked to any debt. */
export function useDebtPayments(): Transaction[] | undefined {
  return useLiveQuery(
    () => db.transactions.filter((t) => !!t.debtId && !t.deleted && t.type === 'expense').toArray(),
    [],
  );
}

/** The owner profile; null when never saved. */
export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => {
    const p = await db.profile.get(PROFILE_ID);
    return p && !p.deleted ? p : null;
  }, []);
}
