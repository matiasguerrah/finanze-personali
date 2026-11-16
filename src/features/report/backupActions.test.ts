import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/db';
import { repo } from '../../db/repo';
import { runSeed } from '../../db/seed';
import { applyRestore, buildBackup, prepareRestore } from './backupActions';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup → wipe → restore', () => {
  it('brings everything back on an empty device and queues it for sync', async () => {
    await runSeed(db);
    const tx = await repo.create('transactions', {
      date: '2026-11-10',
      type: 'expense',
      amountCents: 1234,
      scope: 'personal',
      categoryId: 'c',
      accountId: 'a',
      note: 'x',
      tags: [],
    });
    await repo.softDelete('transactions', tx.id);
    const text = JSON.stringify(await buildBackup());
    const counts = Object.fromEntries(
      await Promise.all(db.tables.map(async (t) => [t.name, await t.count()])),
    );

    await Promise.all(db.tables.map((t) => t.clear()));
    const plan = await prepareRestore(text);
    expect(plan.updated).toBe(0);
    expect(plan.added).toBe(
      counts.categories + counts.accounts + counts.recurring + counts.transactions,
    );
    await applyRestore(plan);

    expect(await db.categories.count()).toBe(counts.categories);
    // The deleted state travels with the record.
    expect(await db.transactions.get(tx.id)).toMatchObject({ deleted: true, note: 'x' });
    expect(await db.outbox.count()).toBe(plan.added);

    // Restoring again changes nothing.
    expect(await prepareRestore(text)).toMatchObject({ added: 0, updated: 0 });
  });

  it('never overwrites a newer local edit', async () => {
    await runSeed(db);
    const text = JSON.stringify(await buildBackup());
    const [first] = await db.categories.toArray();
    await repo.update('categories', first!.id, { name: 'Rinominata' });
    const plan = await prepareRestore(text);
    await applyRestore(plan);
    expect((await db.categories.get(first!.id))!.name).toBe('Rinominata');
  });
});
