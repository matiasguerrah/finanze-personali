/**
 * JSON backup of every synced table, and the restore plan.
 *
 * Records are stored as Sheet rows (`toRow`), so parsing reuses the same validated `fromRow` as
 * sync: a hand-edited or truncated file is rejected with a precise message instead of writing
 * half-broken records.
 *
 * Restore MERGES: a record is written when it is missing locally or the backup's version is newer
 * (same last-write-wins rule as sync). Nothing local is deleted, so restoring an old backup can
 * never lose newer work; deleted records come back only if they were deleted after the backup.
 */
import { SYNCED_TABLES, type SyncedRecordMap, type SyncedTable } from '../db/types';
import { fromRow, RowError, toRow, type Row } from './sync/merge';

export const BACKUP_APP = 'conti';
export const BACKUP_FORMAT = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  tables: Partial<Record<SyncedTable, Row[]>>;
}

export type BackupTables = { [K in SyncedTable]: SyncedRecordMap[K][] };

export function makeBackup(tables: BackupTables, exportedAt: string): BackupFile {
  const out: BackupFile = { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt, tables: {} };
  for (const t of SYNCED_TABLES) {
    out.tables[t] = (tables[t] as SyncedRecordMap[typeof t][]).map((r) => toRow(t, r));
  }
  return out;
}

export class BackupError extends Error {}

export interface ParsedBackup {
  exportedAt: string;
  tables: Partial<BackupTables>;
}

/** Parses and validates a backup file's text. Throws BackupError (Italian message). */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupError('Il file non è un JSON valido.');
  }
  const f = data as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object' || f.app !== BACKUP_APP)
    throw new BackupError('Il file non è un backup di Conti.');
  if (f.format !== BACKUP_FORMAT)
    throw new BackupError(
      `Formato di backup ${String(f.format)} non supportato: aggiorna l'app e riprova.`,
    );
  if (!f.tables || typeof f.tables !== 'object')
    throw new BackupError('Il backup non contiene dati.');
  const tables: Partial<BackupTables> = {};
  for (const [name, rows] of Object.entries(f.tables)) {
    if (!(SYNCED_TABLES as readonly string[]).includes(name)) continue; // future tables: ignore
    const t = name as SyncedTable;
    if (!Array.isArray(rows)) throw new BackupError(`Tabella «${t}» non valida.`);
    try {
      (tables as Record<string, unknown[]>)[t] = rows.map((r: Row) => {
        const rec = fromRow(t, r);
        if (!rec.updatedAt) throw new RowError(`${t}: riga senza data di modifica`);
        return rec;
      });
    } catch (e) {
      throw new BackupError(
        `Dati non validi nel backup: ${e instanceof RowError ? e.message : String(e)}.`,
      );
    }
  }
  return { exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt : '', tables };
}

export interface RestorePlan {
  /** Records to write, per table. */
  writes: Partial<BackupTables>;
  added: number;
  updated: number;
  /** Already up to date (same or newer locally). */
  unchanged: number;
}

/** `local`: updatedAt of every local record, per table (deleted ones included). */
export function planRestore(
  backup: ParsedBackup,
  local: Partial<Record<SyncedTable, ReadonlyMap<string, string>>>,
): RestorePlan {
  const plan: RestorePlan = { writes: {}, added: 0, updated: 0, unchanged: 0 };
  for (const t of SYNCED_TABLES) {
    const rows = backup.tables[t] as SyncedRecordMap[typeof t][] | undefined;
    if (!rows?.length) continue;
    const have = local[t] ?? new Map<string, string>();
    const writes: SyncedRecordMap[typeof t][] = [];
    for (const r of rows) {
      const current = have.get(r.id);
      if (current === undefined) plan.added++;
      else if (r.updatedAt > current) plan.updated++;
      else {
        plan.unchanged++;
        continue;
      }
      writes.push(r);
    }
    if (writes.length) (plan.writes as Record<string, unknown[]>)[t] = writes;
  }
  return plan;
}

export function backupFileName(exportedAt: string): string {
  return `conti-backup-${exportedAt.slice(0, 10)}.json`;
}
