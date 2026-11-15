import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSyncState, loadSyncState, syncNow } from './sync';

const HOURLY_MS = 60 * 60 * 1000;
/** After a local change, wait a little so a burst of edits goes up in one request. */
const AFTER_CHANGE_MS = 15_000;

/**
 * Renders nothing. Syncs on app open, when the connection comes back, every hour while the page
 * is visible (also when it becomes visible again after an hour), and shortly after local changes.
 */
export function SyncScheduler() {
  const pending = useLiveQuery(() => db.outbox.count(), []);

  useEffect(() => {
    void loadSyncState().then(syncNow);
    const due = () => {
      const last = getSyncState().lastAttemptAt;
      return document.visibilityState === 'visible' && (!last || Date.now() - last >= HOURLY_MS);
    };
    const onOnline = () => void syncNow();
    const onVisible = () => due() && void syncNow();
    const timer = window.setInterval(onVisible, 60_000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => void syncNow(), AFTER_CHANGE_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  return null;
}
