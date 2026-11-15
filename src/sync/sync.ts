/**
 * Browser orchestration: configuration, a single run at a time (also across tabs, via the Web
 * Locks API) and an observable status for the UI.
 */
import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { createRepo, getSetting, setSetting } from '../db/repo';
import { SYNCED_TABLES } from '../db/types';
import { httpTransport, syncErrorMessage } from './client';
import { ping, runSync, SyncError, type SyncResult } from './engine';

export const SYNC_URL = 'syncUrl';
export const SYNC_KEY = 'syncKey';
const LAST_SYNC = 'lastSyncAt';
const LAST_ERROR = 'lastSyncError';

export interface SyncState {
  running: boolean;
  /** Start of the last attempt, successful or not (ms since epoch, this session only). */
  lastAttemptAt?: number;
  lastSyncAt?: string;
  /** Italian, ready to show. */
  lastError?: string;
  lastResult?: SyncResult;
}

let state: SyncState = { running: false };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const getSyncState = (): SyncState => state;

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Loads the last outcome saved by a previous session (shown before the first sync). */
export async function loadSyncState(): Promise<void> {
  const [lastSyncAt, lastError] = await Promise.all([
    getSetting<string | undefined>(LAST_SYNC, undefined),
    getSetting<string | undefined>(LAST_ERROR, undefined),
  ]);
  setState({ lastSyncAt, lastError });
}

export async function getSyncConfig(): Promise<{ url: string; key: string } | null> {
  const [url, key] = await Promise.all([
    getSetting<string>(SYNC_URL, ''),
    getSetting<string>(SYNC_KEY, ''),
  ]);
  return url && key ? { url, key } : null;
}

function message(err: unknown): string {
  if (err instanceof SyncError) return syncErrorMessage(err.code);
  console.error('Sync failed', err);
  return `Errore imprevisto: ${String((err as Error)?.message ?? err)}`;
}

async function withLock(fn: () => Promise<void>): Promise<void> {
  if (!('locks' in navigator)) return fn();
  await navigator.locks.request('conti-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await fn(); // another tab is syncing: skip
  });
}

/** Runs one sync if configured, online and not already running. Never throws. */
export async function syncNow(): Promise<void> {
  if (state.running || !navigator.onLine) return;
  const config = await getSyncConfig();
  if (!config) return;
  await withLock(async () => {
    setState({ running: true, lastAttemptAt: Date.now() });
    try {
      const result = await runSync(db, httpTransport(config.url), config.key);
      const lastSyncAt = new Date().toISOString();
      await setSetting(LAST_SYNC, lastSyncAt);
      await setSetting(LAST_ERROR, undefined);
      setState({ lastSyncAt, lastError: undefined, lastResult: result });
    } catch (err) {
      const lastError = message(err);
      await setSetting(LAST_ERROR, lastError);
      setState({ lastError });
    } finally {
      setState({ running: false });
    }
  });
}

/** Checks URL and key without sending data. Returns an Italian error message or null. */
export async function testConnection(url: string, key: string): Promise<string | null> {
  try {
    await ping(httpTransport(url), key);
    return null;
  } catch (err) {
    return message(err);
  }
}

/** Queues every local record again (keeping timestamps): needed when switching to another Sheet. */
async function requeueAll(): Promise<void> {
  const repo = createRepo(db);
  for (const t of SYNCED_TABLES) {
    const rows = await db.table(t).toArray();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic over all tables
    if (rows.length) await repo.putRaw(t, rows as any, { enqueue: true });
  }
}

/**
 * Saves a new configuration. A different Sheet means pulling everything again and pushing every
 * local record (the outbox was emptied by the old Sheet).
 */
export async function saveSyncConfig(url: string, key: string): Promise<void> {
  const previous = await getSetting<string>(SYNC_URL, '');
  if (previous !== url) {
    await setSetting('lastPullServerTime', '');
    if (previous) await requeueAll();
  }
  await setSetting(SYNC_URL, url);
  await setSetting(SYNC_KEY, key);
  await setSetting(LAST_ERROR, undefined);
  setState({ lastError: undefined });
}

export async function clearSyncConfig(): Promise<void> {
  await setSetting(SYNC_URL, '');
  await setSetting(SYNC_KEY, '');
  await setSetting(LAST_ERROR, undefined);
  setState({ lastError: undefined });
}
