/**
 * End-to-end sync between two devices (two IndexedDB databases) through the real Code.gs
 * running against an in-memory Google Sheet.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContiDB } from '../db/db';
import { createRepo } from '../db/repo';
import { defaultCategories, runSeed } from '../db/seed';
import { PROFILE_ID } from '../db/types';
import { createAppsScript } from '../test/appsScriptHarness';
import { PUSH_BATCH, runSync, SyncError, type Transport } from './engine';

let server: ReturnType<typeof createAppsScript>;
let key: string;
let transport: Transport;
let phone: ContiDB;
let laptop: ContiDB;

const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at('2026-11-15T09:00:00.000Z');
  server = createAppsScript();
  key = server.setup();
  transport = async (req) => server.post(req);
  phone = new ContiDB(`phone-${crypto.randomUUID()}`);
  laptop = new ContiDB(`laptop-${crypto.randomUUID()}`);
  await Promise.all([phone.open(), laptop.open()]);
  await runSeed(phone);
  await runSeed(laptop);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([phone.delete(), laptop.delete()]);
});

const tx = {
  date: '2026-11-15',
  type: 'expense' as const,
  amountCents: 450,
  scope: 'personal' as const,
  categoryId: defaultCategories()[1]!.id,
  accountId: '00000000-0000-4000-8000-000000004001',
  note: 'caffè',
  tags: ['bar'],
};

describe('sync between two devices', () => {
  it('seeds do not duplicate and new records reach the other device', async () => {
    const created = await createRepo(phone).create('transactions', tx);
    await runSync(phone, transport, key);
    const r = await runSync(laptop, transport, key);

    expect(await laptop.transactions.get(created.id)).toEqual(created);
    expect(await laptop.categories.count()).toBe(defaultCategories().length);
    expect(server.sheets.get('categories')!.objects()).toHaveLength(defaultCategories().length);
    expect(r.skipped).toEqual([]);
    expect(await phone.outbox.count()).toBe(0);
    expect(await laptop.outbox.count()).toBe(0);
  });

  it('conflict: the most recent edit wins on both devices', async () => {
    const created = await createRepo(phone).create('transactions', tx);
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);

    // Both edit the same record offline; the laptop edits later.
    at('2026-11-15T10:00:00.000Z');
    await createRepo(phone).update('transactions', created.id, { note: 'dal telefono' });
    at('2026-11-15T10:05:00.000Z');
    await createRepo(laptop).update('transactions', created.id, { note: 'dal portatile' });

    // The laptop syncs first; the phone's older edit is then rejected by the server.
    await runSync(laptop, transport, key);
    const phoneResult = await runSync(phone, transport, key);
    expect(phoneResult.conflicts).toBe(1);

    expect((await phone.transactions.get(created.id))!.note).toBe('dal portatile');
    expect((await laptop.transactions.get(created.id))!.note).toBe('dal portatile');
    expect(await phone.outbox.count()).toBe(0);
  });

  it('conflict the other way: a newer offline edit overwrites the server', async () => {
    const created = await createRepo(phone).create('transactions', tx);
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);

    at('2026-11-15T10:00:00.000Z');
    await createRepo(laptop).update('transactions', created.id, { amountCents: 500 });
    await runSync(laptop, transport, key);
    at('2026-11-15T11:00:00.000Z');
    await createRepo(phone).update('transactions', created.id, { amountCents: 600 });
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);

    expect((await laptop.transactions.get(created.id))!.amountCents).toBe(600);
  });

  it('a pending local edit older than the pulled version leaves the outbox', async () => {
    const created = await createRepo(phone).create('transactions', tx);
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);

    at('2026-11-15T10:00:00.000Z');
    await createRepo(phone).update('transactions', created.id, { note: 'vecchia' });
    at('2026-11-15T10:01:00.000Z');
    await createRepo(laptop).update('transactions', created.id, { note: 'nuova' });
    await runSync(laptop, transport, key);

    await runSync(phone, transport, key);
    expect((await phone.transactions.get(created.id))!.note).toBe('nuova');
    expect(server.sheets.get('transactions')!.objects()[0]!.note).toBe('nuova');
  });

  it('deletions propagate as soft deletes', async () => {
    const created = await createRepo(phone).create('transactions', tx);
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);

    at('2026-11-15T10:00:00.000Z');
    await createRepo(laptop).softDelete('transactions', created.id);
    await runSync(laptop, transport, key);
    await runSync(phone, transport, key);

    expect((await phone.transactions.get(created.id))!.deleted).toBe(true);
    expect(server.sheets.get('transactions')!.objects()[0]!.deleted).toBe('TRUE');
  });

  it('a record edited while its push is in flight stays queued with the new version', async () => {
    const repo = createRepo(phone);
    const created = await repo.create('transactions', tx);
    let edited = false;
    const racing: Transport = async (req) => {
      if (req.action === 'push' && !edited) {
        edited = true;
        at('2026-11-15T09:30:00.000Z');
        await repo.update('transactions', created.id, { note: 'modificata durante la sync' });
      }
      return server.post(req);
    };
    await runSync(phone, racing, key);
    const left = await phone.outbox.where({ table: 'transactions', recordId: created.id }).first();
    expect(left?.payload).toMatchObject({ note: 'modificata durante la sync' });

    await runSync(phone, transport, key);
    expect(await phone.outbox.count()).toBe(0);
    expect(server.sheets.get('transactions')!.objects()[0]!.note).toBe(
      'modificata durante la sync',
    );
  });

  it('pushes in batches and keeps text cells as text', async () => {
    const repo = createRepo(phone);
    for (let i = 0; i < PUSH_BATCH + 5; i++)
      await repo.create('transactions', { ...tx, note: i === 0 ? '=1+1' : `n${i}` });
    let pushes = 0;
    const counting: Transport = async (req) => {
      if (req.action === 'push') pushes++;
      return server.post(req);
    };
    const r = await runSync(phone, counting, key);
    expect(pushes).toBe(2); // 205 transactions + 36 seed rows = 241 → 2 batches
    expect(r.pushed).toBeGreaterThan(PUSH_BATCH);

    await runSync(laptop, transport, key);
    const notes = (await laptop.transactions.toArray()).map((t) => t.note);
    expect(notes).toContain('=1+1');
    expect(await laptop.transactions.count()).toBe(PUSH_BATCH + 5);
  });

  it('skips rows broken by hand in the Sheet and applies the others', async () => {
    const a = await createRepo(phone).create('transactions', tx);
    const b = await createRepo(phone).create('transactions', { ...tx, note: 'buona' });
    await runSync(phone, transport, key);
    // Someone types "4,50" in the Sheet: the cell is no longer an integer.
    const sheet = server.sheets.get('transactions')!;
    const col = (sheet.cells[0] as string[]).indexOf('amountCents');
    const rowIdx = sheet.cells.findIndex((r) => r[0] === a.id);
    sheet.cells[rowIdx]![col] = '4,50';

    const r = await runSync(laptop, transport, key);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toContain('amountCents');
    expect(await laptop.transactions.get(a.id)).toBeUndefined();
    expect((await laptop.transactions.get(b.id))!.note).toBe('buona');
  });

  it('profile syncs as a single record', async () => {
    await createRepo(phone).create('profile', {
      id: PROFILE_ID,
      firstName: 'Mario',
      lastName: 'Rossi',
      vatNumber: '01234567897',
      taxCode: 'RSSMRA85T10A562S',
      pec: 'mario.rossi@pec.example.it',
    });
    await runSync(phone, transport, key);
    await runSync(laptop, transport, key);
    expect((await laptop.profile.get(PROFILE_ID))!.vatNumber).toBe('01234567897');
  });

  it('a wrong key fails without touching local data', async () => {
    await createRepo(phone).create('transactions', tx);
    const before = await phone.outbox.count();
    await expect(runSync(phone, transport, 'wrong')).rejects.toEqual(new SyncError('unauthorized'));
    expect(await phone.outbox.count()).toBe(before);
  });

  it('a non-JSON answer (e.g. a Google login page) is reported clearly', async () => {
    await expect(runSync(phone, async () => '<html>', key)).rejects.toEqual(
      new SyncError('bad_response'),
    );
  });
});
