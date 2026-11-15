/**
 * The ONLY place that writes synced tables. Every write bumps `updatedAt` and enqueues the
 * full record in the outbox inside the same Dexie transaction, so sync never misses a change.
 * UI code must never call `db.<table>.put/add/update/delete` directly.
 */
import type { Table } from 'dexie';
import { db as defaultDb, type ContiDB } from './db';
import type { BaseRecord, NewRecord, SyncedRecordMap, SyncedTable } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

export function createRepo(db: ContiDB = defaultDb) {
  function table<T extends SyncedTable>(name: T): Table<SyncedRecordMap[T], string> {
    return db.table(name);
  }

  async function enqueue(name: SyncedTable, record: BaseRecord): Promise<void> {
    const existing = await db.outbox.where({ table: name, recordId: record.id }).first();
    const entry = { table: name, recordId: record.id, payload: record, queuedAt: nowIso() };
    if (existing?.seq !== undefined) await db.outbox.put({ ...entry, seq: existing.seq });
    else await db.outbox.add(entry);
  }

  async function create<T extends SyncedTable>(
    name: T,
    data: NewRecord<SyncedRecordMap[T]>,
  ): Promise<SyncedRecordMap[T]> {
    const ts = nowIso();
    const record = {
      ...data,
      id: data.id ?? newId(),
      createdAt: ts,
      updatedAt: ts,
      deleted: false,
    } as SyncedRecordMap[T];
    await db.transaction('rw', db.table(name), db.outbox, async () => {
      await table(name).add(record);
      await enqueue(name, record);
    });
    return record;
  }

  async function update<T extends SyncedTable>(
    name: T,
    id: string,
    changes: Partial<Omit<SyncedRecordMap[T], keyof BaseRecord>>,
  ): Promise<SyncedRecordMap[T]> {
    return db.transaction('rw', db.table(name), db.outbox, async () => {
      const current = await table(name).get(id);
      if (!current) throw new Error(`${name}/${id} not found`);
      const record = { ...current, ...changes, updatedAt: nowIso() } as SyncedRecordMap[T];
      // Optional fields explicitly set to undefined must disappear from the stored record.
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined) delete (record as unknown as Record<string, unknown>)[k];
      }
      await table(name).put(record);
      await enqueue(name, record);
      return record;
    });
  }

  async function setDeleted(name: SyncedTable, id: string, deleted: boolean): Promise<void> {
    await db.transaction('rw', db.table(name), db.outbox, async () => {
      const current = await table(name).get(id);
      if (!current || current.deleted === deleted) return;
      const record = { ...current, deleted, updatedAt: nowIso() };
      await table(name).put(record);
      await enqueue(name, record);
    });
  }

  const softDelete = (name: SyncedTable, id: string) => setDeleted(name, id, true);
  /** Undo of a soft delete. */
  const restore = (name: SyncedTable, id: string) => setDeleted(name, id, false);

  /**
   * Writes complete records keeping their own timestamps (seed data, backup restore).
   * With `enqueue` they are also queued for push.
   */
  async function putRaw<T extends SyncedTable>(
    name: T,
    records: SyncedRecordMap[T][],
    opts: { enqueue: boolean },
  ): Promise<void> {
    await db.transaction('rw', db.table(name), db.outbox, async () => {
      await table(name).bulkPut(records);
      if (opts.enqueue) for (const r of records) await enqueue(name, r);
    });
  }

  /** Runs several repo writes atomically (e.g. the two halves of a split). */
  function atomically<R>(fn: () => Promise<R>): Promise<R> {
    return db.transaction('rw', [...db.tables.filter((t) => t.name !== 'settings')], fn);
  }

  return { create, update, softDelete, restore, putRaw, atomically };
}

export const repo = createRepo();

/** Local-only settings (never synced). */
export async function getSetting<T>(key: string, fallback: T, d: ContiDB = defaultDb): Promise<T> {
  const row = await d.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown, d: ContiDB = defaultDb) {
  await d.settings.put({ key, value });
}
