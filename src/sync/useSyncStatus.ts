import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSetting } from '../db/repo';
import { SYNC_KEY, SYNC_URL, useSyncState } from './sync';

export type SyncStatusKind =
  'notConfigured' | 'syncing' | 'offline' | 'error' | 'pending' | 'synced';

export interface SyncStatus {
  kind: SyncStatusKind;
  pending: number;
  lastSyncAt?: string;
  lastError?: string;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Status for the header badge and the settings page. */
export function useSyncStatus(): SyncStatus | undefined {
  const s = useSyncState();
  const online = useOnline();
  const data = useLiveQuery(async () => {
    const [url, key, pending] = await Promise.all([
      getSetting<string>(SYNC_URL, ''),
      getSetting<string>(SYNC_KEY, ''),
      db.outbox.count(),
    ]);
    return { configured: Boolean(url && key), pending };
  }, []);
  if (!data) return undefined;
  const { configured, pending } = data;
  const kind: SyncStatusKind = !configured
    ? 'notConfigured'
    : s.running
      ? 'syncing'
      : !online
        ? 'offline'
        : s.lastError
          ? 'error'
          : pending > 0
            ? 'pending'
            : 'synced';
  return { kind, pending, lastSyncAt: s.lastSyncAt, lastError: s.lastError };
}
