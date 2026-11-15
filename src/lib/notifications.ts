/** Pure decisions about local notifications (the browser calls live in src/state/notify.ts). */
import type { ISODate, Recurring } from '../db/types';
import { dueStatus } from './recurring';

export interface NotificationEnv {
  hasNotificationApi: boolean;
  hasServiceWorker: boolean;
  isIOS: boolean;
  /** Running as an installed PWA (display-mode: standalone or navigator.standalone). */
  isStandalone: boolean;
  permission?: 'default' | 'granted' | 'denied';
}

export type NotificationSupport =
  | 'needsInstall' // iOS/iPadOS in a Safari tab: web push only works from the Home Screen app
  | 'unsupported'
  | 'default'
  | 'granted'
  | 'denied';

export function notificationSupport(env: NotificationEnv): NotificationSupport {
  if (env.isIOS && !env.isStandalone) return 'needsInstall';
  if (!env.hasNotificationApi || !env.hasServiceWorker) return 'unsupported';
  return env.permission ?? 'default';
}

/** iPhone/iPod/iPad, including iPadOS which reports itself as a Mac with touch. */
export function isIOSUserAgent(ua: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

/** One reminder per recurrence and due date. */
export function dueAlertKey(r: Pick<Recurring, 'id' | 'nextDueDate'>): string {
  return `due:${r.id}:${r.nextDueDate}`;
}

/** Active recurrences that are overdue or within their reminder window and not notified yet. */
export function pendingDueReminders<
  R extends Pick<Recurring, 'id' | 'nextDueDate' | 'reminderDaysBefore' | 'active' | 'deleted'>,
>(list: R[], today: ISODate, shown: ReadonlySet<string>): R[] {
  return list.filter(
    (r) =>
      !r.deleted && r.active && dueStatus(r, today) !== 'upcoming' && !shown.has(dueAlertKey(r)),
  );
}
