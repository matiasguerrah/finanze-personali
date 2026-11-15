/**
 * Sync core: push the outbox, then pull what changed on the server. Independent from the browser
 * (no fetch, no navigator) so it is tested end to end against the real Code.gs.
 */
import type { ContiDB } from '../db/db';
import { createRepo, getSetting, setSetting } from '../db/repo';
import type { SyncedRecordMap, SyncedTable } from '../db/types';
import { SYNCED_TABLES } from '../db/types';
import {
  chunk,
  columnNames,
  fromRow,
  RowError,
  toRow,
  type ErrorResponse,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type Row,
  type SyncRequest,
} from '../lib/sync/merge';

/** Sends one request to the Apps Script and returns the parsed JSON (whatever it is). */
export type Transport = (req: SyncRequest) => Promise<unknown>;

export const PUSH_BATCH = 200;
export const LAST_PULL_SETTING = 'lastPullServerTime';

export class SyncError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  /** Rows of the Sheet that could not be read (e.g. edited by hand), with the reason. */
  skipped: string[];
}

async function call<T>(transport: Transport, req: SyncRequest): Promise<T> {
  const res = (await transport(req)) as T | ErrorResponse | null;
  if (!res || typeof res !== 'object' || !('ok' in res)) throw new SyncError('bad_response');
  if (res.ok === false) throw new SyncError((res as ErrorResponse).error || 'server_error');
  return res as T;
}

/** Parses rows of one table, keeping the good ones and reporting the bad ones. */
function parseRows<T extends SyncedTable>(table: T, rows: Row[], skipped: string[]) {
  const out: SyncedRecordMap[T][] = [];
  for (const row of rows) {
    try {
      out.push(fromRow(table, row));
    } catch (err) {
      if (!(err instanceof RowError)) throw err;
      skipped.push(`${err.message} (riga ${row.id || '?'})`);
    }
  }
  return out;
}

async function applyTables(
  db: ContiDB,
  tables: Partial<Record<SyncedTable, Row[]>>,
  skipped: string[],
): Promise<number> {
  const repo = createRepo(db);
  let applied = 0;
  for (const t of SYNCED_TABLES) {
    const rows = tables[t];
    if (rows?.length) applied += await repo.applyRemote(t, parseRows(t, rows, skipped));
  }
  return applied;
}

/** Sends the outbox in batches; acknowledged entries leave it unless edited meanwhile. */
export async function push(
  db: ContiDB,
  transport: Transport,
  key: string,
  result: SyncResult,
): Promise<void> {
  const entries = await db.outbox.orderBy('seq').toArray();
  for (const batch of chunk(entries, PUSH_BATCH)) {
    const tables: PushRequest['tables'] = {};
    for (const e of batch) {
      const t = (tables[e.table] ??= { columns: columnNames(e.table), rows: [] });
      t.rows.push(toRow(e.table, e.payload as SyncedRecordMap[typeof e.table]));
    }
    const res = await call<PushResponse>(transport, { action: 'push', key, tables });

    await db.transaction('rw', db.outbox, async () => {
      for (const sent of batch) {
        const now = await db.outbox.get(sent.seq!);
        // Edited while the request was in flight: keep it, the newer version goes next time.
        if (now && now.payload.updatedAt === sent.payload.updatedAt)
          await db.outbox.delete(sent.seq!);
      }
    });
    const conflicts = Object.values(res.conflicts ?? {}).reduce((n, rows) => n + rows.length, 0);
    result.conflicts += conflicts;
    // The server kept a newer version: adopt it locally.
    if (conflicts) await applyTables(db, res.conflicts, result.skipped);
    result.pushed += batch.length;
  }
}

/** Fetches rows changed on the server since the last pull and applies them (LWW). */
export async function pull(
  db: ContiDB,
  transport: Transport,
  key: string,
  result: SyncResult,
): Promise<void> {
  const since = await getSetting<string>(LAST_PULL_SETTING, '', db);
  const res = await call<PullResponse>(transport, { action: 'pull', key, since });
  result.pulled += await applyTables(db, res.tables ?? {}, result.skipped);
  if (res.serverTime) await setSetting(LAST_PULL_SETTING, res.serverTime, db);
}

/** One full sync: push first (so the server decides conflicts), then pull. */
export async function runSync(db: ContiDB, transport: Transport, key: string): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, skipped: [] };
  await push(db, transport, key, result);
  await pull(db, transport, key, result);
  return result;
}

export async function ping(transport: Transport, key: string): Promise<void> {
  await call(transport, { action: 'ping', key });
}
