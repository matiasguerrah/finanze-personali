/** Multi-record transaction operations (always atomic, always through repo). */
import { db } from '../../db/db';
import { newId, repo } from '../../db/repo';
import type { Transaction } from '../../db/types';
import type { SplitResult } from '../../lib/split';

/**
 * "Dividi": the original keeps the personal part, a new business record gets the rest.
 * Both share a splitGroupId.
 */
export async function splitTransaction(tx: Transaction, parts: SplitResult): Promise<void> {
  const groupId = tx.splitGroupId ?? newId();
  await repo.atomically(async () => {
    await repo.update('transactions', tx.id, {
      amountCents: parts.personalCents,
      scope: 'personal',
      activityId: undefined,
      splitGroupId: groupId,
    });
    const { id: _id, createdAt: _c, updatedAt: _u, deleted: _d, ...rest } = tx;
    const business: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deleted'> = {
      ...rest,
      amountCents: parts.businessCents,
      scope: 'business',
      splitGroupId: groupId,
    };
    await repo.create('transactions', business);
  });
}

/** Undo a split: this record absorbs the other halves of the group, which are soft-deleted. */
export async function mergeSplit(tx: Transaction): Promise<void> {
  if (!tx.splitGroupId) return;
  await repo.atomically(async () => {
    const group = await db.transactions
      .where('splitGroupId')
      .equals(tx.splitGroupId!)
      .filter((t) => !t.deleted)
      .toArray();
    const others = group.filter((t) => t.id !== tx.id);
    const total = group.reduce((s, t) => s + t.amountCents, 0);
    for (const o of others) await repo.softDelete('transactions', o.id);
    await repo.update('transactions', tx.id, { amountCents: total, splitGroupId: undefined });
  });
}
