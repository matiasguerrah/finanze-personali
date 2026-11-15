import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { repo } from '../../db/repo';
import { markPaid, skipOccurrence } from './actions';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function rent() {
  return repo.create('recurring', {
    name: 'Affitto',
    amountCents: 75000,
    estimated: false,
    scope: 'personal',
    categoryId: 'cat',
    accountId: 'acc',
    frequency: 'monthly',
    nextDueDate: '2027-01-31',
    anchorDay: 31,
    reminderDaysBefore: 3,
    active: true,
  });
}

describe('markPaid', () => {
  it('creates the linked transaction and advances the due date, undo reverts both', async () => {
    const r = await rent();
    const { undo } = await markPaid(r, {
      type: 'expense',
      amountCents: 76000,
      date: '2027-02-01',
      accountId: 'acc',
      note: 'Affitto',
    });
    const txs = await db.transactions.toArray();
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ recurringId: r.id, amountCents: 76000, scope: 'personal' });
    expect((await db.recurring.get(r.id))!.nextDueDate).toBe('2027-02-28');

    await undo();
    expect((await db.transactions.get(txs[0]!.id))!.deleted).toBe(true);
    expect((await db.recurring.get(r.id))!.nextDueDate).toBe('2027-01-31');
    // Both records are queued for sync.
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('skipOccurrence', () => {
  it('advances without recording a transaction', async () => {
    const r = await rent();
    const { undo } = await skipOccurrence(r);
    expect(await db.transactions.count()).toBe(0);
    expect((await db.recurring.get(r.id))!.nextDueDate).toBe('2027-02-28');
    await undo();
    expect((await db.recurring.get(r.id))!.nextDueDate).toBe('2027-01-31');
  });
});
