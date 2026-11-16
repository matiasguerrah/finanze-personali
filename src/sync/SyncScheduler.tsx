import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getSyncState, loadSyncState, syncNow } from './sync';

const HOURLY_MS = 60 * 60 * 1000;
/** Coming back to the app (tab switch, PWA resumed) pulls changes made on other devices. */
const ON_RETURN_MS = 2 * 60 * 1000;
/** After a local change, wait a little so a burst of edits goes up in one request. */
const AFTER_CHANGE_MS = 15_000;

function syncDue(lastAttemptAt: number | undefined, now: number, minGapMs: number): boolean {
  return lastAttemptAt === undefined || now - lastAttemptAt >= minGapMs;
}

/**
 * Renders nothing. Syncs on app open, when the connection comes back, when the page becomes
 * visible again (at most every 2 minutes), every hour while it stays visible, and shortly after
 * local changes.
 */
export function SyncScheduler() {
  const pending = useLiveQuery(() => db.outbox.count(), []);

  useEffect(() => {
    void loadSyncState().then(syncNow);
    const visibleAndDue = (gap: number) =>
      document.visibilityState === 'visible' &&
      syncDue(getSyncState().lastAttemptAt, Date.now(), gap);
    const onOnline = () => void syncNow();
    const onVisible = () => visibleAndDue(ON_RETURN_MS) && void syncNow();
    const timer = window.setInterval(() => visibleAndDue(HOURLY_MS) && void syncNow(), 60_000);
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
