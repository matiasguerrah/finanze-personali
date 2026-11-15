/** Recurring payment operations (atomic, always through repo). */
import { repo } from '../../db/repo';
import type { ISODate, Recurring, Transaction, TxType } from '../../db/types';
import { advanceDueDate } from '../../lib/recurring';

export interface Payment {
  type: Exclude<TxType, 'transfer'>;
  amountCents: number;
  date: ISODate;
  accountId: string;
  activityId?: string;
  note: string;
}

export interface Undo {
  /** Puts everything back as it was before the action. */
  undo: () => Promise<void>;
}

/**
 * "Segna come pagata": records the transaction (linked by recurringId) and moves the recurrence to
 * its next due date, in one transaction.
 */
export async function markPaid(r: Recurring, p: Payment): Promise<Undo> {
  const previousDue = r.nextDueDate;
  const tx = await repo.atomically(async () => {
    const data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deleted'> = {
      date: p.date,
      type: p.type,
      amountCents: p.amountCents,
      scope: r.scope,
      categoryId: r.categoryId,
      accountId: p.accountId,
      note: p.note,
      tags: [],
      recurringId: r.id,
    };
    if (r.scope === 'business' && p.activityId) data.activityId = p.activityId;
    const created = await repo.create('transactions', data);
    await repo.update('recurring', r.id, { nextDueDate: advanceDueDate(previousDue, r) });
    return created;
  });
  return {
    undo: () =>
      repo.atomically(async () => {
        await repo.softDelete('transactions', tx.id);
        await repo.update('recurring', r.id, { nextDueDate: previousDue });
      }),
  };
}

/** Skips the current occurrence without recording anything. */
export async function skipOccurrence(r: Recurring): Promise<Undo> {
  const previousDue = r.nextDueDate;
  await repo.update('recurring', r.id, { nextDueDate: advanceDueDate(previousDue, r) });
  return {
    undo: async () => {
      await repo.update('recurring', r.id, { nextDueDate: previousDue });
    },
  };
}
