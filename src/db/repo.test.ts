import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContiDB } from './db';
import { createRepo } from './repo';
import {
  DEFAULT_ACCOUNT_ID,
  defaultCategories,
  defaultFiscalRecurrences,
  INPS_CATEGORY_ID,
  runSeed,
  SEED_TIMESTAMP,
  SUBSTITUTE_TAX_CATEGORY_ID,
} from './seed';

let db: ContiDB;
let repo: ReturnType<typeof createRepo>;

beforeEach(async () => {
  db = new ContiDB(`test-${crypto.randomUUID()}`);
  await db.open();
  repo = createRepo(db);
});
afterEach(async () => {
  await db.delete();
});

const tx = {
  date: '2026-11-08',
  type: 'expense' as const,
  amountCents: 450,
  scope: 'personal' as const,
  categoryId: 'c1',
  accountId: 'a1',
  note: '',
  tags: [],
};

describe('repo', () => {
  it('create sets metadata and enqueues the record', async () => {
    const r = await repo.create('transactions', tx);
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.deleted).toBe(false);
    expect(r.createdAt).toBe(r.updatedAt);
    const out = await db.outbox.toArray();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ table: 'transactions', recordId: r.id });
  });

  it('keeps a single outbox row per record with the latest payload', async () => {
    const r = await repo.create('transactions', tx);
    await new Promise((res) => setTimeout(res, 2));
    await repo.update('transactions', r.id, { amountCents: 500 });
    await repo.softDelete('transactions', r.id);
    const out = await db.outbox.toArray();
    expect(out).toHaveLength(1);
    expect(out[0]!.payload).toMatchObject({ amountCents: 500, deleted: true });
    const stored = await db.transactions.get(r.id);
    expect(stored!.updatedAt > r.updatedAt).toBe(true);
  });

  it('update removes optional fields set to undefined', async () => {
    const r = await repo.create('transactions', { ...tx, activityId: 'x' });
    await repo.update('transactions', r.id, { activityId: undefined });
    const stored = await db.transactions.get(r.id);
    expect('activityId' in stored!).toBe(false);
  });

  it('atomically rolls back every write on error', async () => {
    await expect(
      repo.atomically(async () => {
        await repo.create('transactions', tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.transactions.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('seed', () => {
  it('is idempotent and uses fixed ids and old timestamps', async () => {
    await runSeed(db);
    await runSeed(db);
    expect(await db.categories.count()).toBe(defaultCategories().length);
    const acc = await db.accounts.get(DEFAULT_ACCOUNT_ID);
    expect(acc?.updatedAt).toBe(SEED_TIMESTAMP);
    const inps = (await db.categories.toArray()).filter((c) => c.systemKey === 'inps');
    expect(inps).toHaveLength(1);
  });

  it('does not overwrite a record the user already changed', async () => {
    await runSeed(db);
    const first = defaultCategories()[0]!;
    await repo.update('categories', first.id, { name: 'Supermercato' });
    await db.settings.delete('seedVersion');
    await runSeed(db);
    expect((await db.categories.get(first.id))!.name).toBe('Supermercato');
  });

  it('seeds the four fiscal recurrences on the right categories', async () => {
    await runSeed(db);
    await runSeed(db);
    const rec = await db.recurring.toArray();
    expect(rec).toHaveLength(4);
    expect(
      rec.every((r) => r.scope === 'business' && r.taxKind && r.updatedAt === SEED_TIMESTAMP),
    ).toBe(true);
    expect((await db.categories.get(INPS_CATEGORY_ID))?.systemKey).toBe('inps');
    expect((await db.categories.get(SUBSTITUTE_TAX_CATEGORY_ID))?.systemKey).toBe('substituteTax');
  });

  it('fiscal deadlines start from the next 30 June / 30 November', () => {
    const dates = defaultFiscalRecurrences('2026-11-15').map((r) => r.nextDueDate);
    expect(dates).toEqual(['2027-06-30', '2026-11-30', '2027-06-30', '2026-11-30']);
  });
});

describe('schema upgrade', () => {
  it('v1 → v2 keeps existing data and adds the profile table', async () => {
    const { default: Dexie } = await import('dexie');
    const name = `upgrade-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ categories: 'id, type, sortOrder', outbox: '++seq, &[table+recordId]' });
    await v1.table('categories').put({ id: 'c1', name: 'Bar', type: 'expense', sortOrder: 1 });
    v1.close();

    const upgraded = new ContiDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(2);
    expect((await upgraded.categories.get('c1'))?.name).toBe('Bar');
    expect(await upgraded.profile.count()).toBe(0);
    await upgraded.delete();
  });
});
