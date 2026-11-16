import { db, type ContiDB } from '../../db/db';
import { createRepo } from '../../db/repo';
import { SYNCED_TABLES, type SyncedTable } from '../../db/types';
import {
  makeBackup,
  parseBackup,
  planRestore,
  type BackupFile,
  type BackupTables,
  type RestorePlan,
} from '../../lib/backup';

/** Every record of every synced table, deleted ones included (they matter for LWW on restore). */
export async function buildBackup(d: ContiDB = db, now = new Date()): Promise<BackupFile> {
  const tables = {} as BackupTables;
  for (const t of SYNCED_TABLES)
    (tables as Record<string, unknown[]>)[t] = await d.table(t).toArray();
  return makeBackup(tables, now.toISOString());
}

/** Reads the file and computes what a restore would change, without writing anything. */
export async function prepareRestore(text: string, d: ContiDB = db): Promise<RestorePlan> {
  const backup = parseBackup(text);
  const local: Partial<Record<SyncedTable, Map<string, string>>> = {};
  for (const t of SYNCED_TABLES) {
    const m = new Map<string, string>();
    await d.table(t).each((r: { id: string; updatedAt: string }) => m.set(r.id, r.updatedAt));
    local[t] = m;
  }
  return planRestore(backup, local);
}

/**
 * Writes the planned records keeping their timestamps, and queues them for sync so the Google
 * Sheet (and the other devices) receive them too.
 */
export async function applyRestore(plan: RestorePlan, d: ContiDB = db): Promise<void> {
  const repo = createRepo(d);
  for (const t of SYNCED_TABLES) {
    const rows = plan.writes[t];
    if (rows?.length) await repo.putRaw(t, rows as never, { enqueue: true });
  }
}
