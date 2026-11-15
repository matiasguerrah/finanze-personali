/** Account balances: initial balance + income − expenses ± transfers. */
import type { Account, ISODate, Transaction } from '../db/types';

type TxLike = Pick<
  Transaction,
  'type' | 'amountCents' | 'accountId' | 'toAccountId' | 'date' | 'deleted'
>;
type AccountLike = Pick<Account, 'id' | 'initialBalanceCents' | 'deleted'>;

/**
 * Balance of every (non-deleted) account, counting only transactions dated on or before `asOf`
 * (future-dated records are planned, not yet on the account). A transfer moves money from
 * `accountId` to `toAccountId` and does not change the total.
 */
export function accountBalances(
  accounts: AccountLike[],
  txs: TxLike[],
  asOf?: ISODate,
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const a of accounts) if (!a.deleted) balances.set(a.id, a.initialBalanceCents);
  const add = (id: string | undefined, cents: number) => {
    if (id !== undefined && balances.has(id)) balances.set(id, balances.get(id)! + cents);
  };
  for (const t of txs) {
    if (t.deleted || (asOf !== undefined && t.date > asOf)) continue;
    if (t.type === 'income') add(t.accountId, t.amountCents);
    else if (t.type === 'expense') add(t.accountId, -t.amountCents);
    else {
      add(t.accountId, -t.amountCents);
      add(t.toAccountId, t.amountCents);
    }
  }
  return balances;
}

/** Sum of the balances of the given account ids (e.g. the non-archived ones). */
export function totalBalance(balances: Map<string, number>, ids?: Iterable<string>): number {
  let total = 0;
  if (ids === undefined) for (const v of balances.values()) total += v;
  else for (const id of ids) total += balances.get(id) ?? 0;
  return total;
}

export function validateAccount(a: Pick<Account, 'name' | 'initialBalanceCents'>): string[] {
  const errors: string[] = [];
  if (!a.name.trim()) errors.push('Il nome è obbligatorio.');
  if (!Number.isSafeInteger(a.initialBalanceCents)) errors.push('Saldo iniziale non valido.');
  return errors;
}
