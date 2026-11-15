/** Browser side of local notifications. Decisions live in src/lib/notifications.ts. */
import { getSetting, setSetting } from '../db/repo';
import {
  isIOSUserAgent,
  notificationSupport,
  type NotificationSupport,
} from '../lib/notifications';

export const NOTIFICATIONS_SETTING = 'notificationsEnabled';

export function currentNotificationSupport(): NotificationSupport {
  const hasNotificationApi = typeof Notification !== 'undefined';
  return notificationSupport({
    hasNotificationApi,
    hasServiceWorker: 'serviceWorker' in navigator,
    isIOS: isIOSUserAgent(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    isStandalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    permission: hasNotificationApi ? Notification.permission : undefined,
  });
}

/** Asks the permission (must run inside a user gesture) and stores the preference. */
export async function enableNotifications(): Promise<NotificationSupport> {
  if (typeof Notification === 'undefined') return currentNotificationSupport();
  const result = await Notification.requestPermission();
  await setSetting(NOTIFICATIONS_SETTING, result === 'granted');
  return currentNotificationSupport();
}

export async function disableNotifications(): Promise<void> {
  await setSetting(NOTIFICATIONS_SETTING, false);
}

/**
 * Shows a system notification through the service worker (required on iOS and Android).
 * Returns false when notifications are off, not permitted or unavailable.
 */
export async function showLocalNotification(
  title: string,
  body: string,
  opts: { tag: string; path: string },
): Promise<boolean> {
  if (currentNotificationSupport() !== 'granted') return false;
  if (!(await getSetting<boolean>(NOTIFICATIONS_SETTING, false))) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.showNotification(title, {
      body,
      tag: opts.tag,
      icon: `${import.meta.env.BASE_URL}pwa-192.png`,
      badge: `${import.meta.env.BASE_URL}pwa-192.png`,
      lang: 'it-IT',
      // Opened by the notificationclick handler in public/sw-notify.js.
      data: { url: `${import.meta.env.BASE_URL}#${opts.path}` },
    });
    return true;
  } catch (err) {
    console.warn('Notification failed', err);
    return false;
  }
}
