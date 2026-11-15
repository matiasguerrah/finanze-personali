import { describe, expect, it } from 'vitest';
import {
  dueAlertKey,
  isIOSUserAgent,
  notificationSupport,
  pendingDueReminders,
} from './notifications';

const env = {
  hasNotificationApi: true,
  hasServiceWorker: true,
  isIOS: false,
  isStandalone: false,
};

describe('notificationSupport', () => {
  it('iOS in a Safari tab must be installed first', () => {
    expect(notificationSupport({ ...env, isIOS: true, hasNotificationApi: false })).toBe(
      'needsInstall',
    );
    expect(
      notificationSupport({ ...env, isIOS: true, isStandalone: true, permission: 'granted' }),
    ).toBe('granted');
  });
  it('iOS standalone without the API (iOS < 16.4) is unsupported', () => {
    expect(
      notificationSupport({ ...env, isIOS: true, isStandalone: true, hasNotificationApi: false }),
    ).toBe('unsupported');
  });
  it('desktop follows the permission', () => {
    expect(notificationSupport(env)).toBe('default');
    expect(notificationSupport({ ...env, permission: 'denied' })).toBe('denied');
    expect(notificationSupport({ ...env, hasServiceWorker: false })).toBe('unsupported');
  });
});

describe('isIOSUserAgent', () => {
  it('detects iPhone and iPadOS', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
  });
});

describe('pendingDueReminders', () => {
  const r = (id: string, nextDueDate: string, extra = {}) => ({
    id,
    nextDueDate,
    reminderDaysBefore: 3,
    active: true,
    deleted: false,
    ...extra,
  });
  it('only due-soon/overdue, active and not yet shown', () => {
    const list = [
      r('late', '2026-11-10'),
      r('soon', '2026-11-17'),
      r('far', '2026-12-30'),
      r('off', '2026-11-10', { active: false }),
    ];
    const shown = new Set([dueAlertKey(list[0]!)]);
    expect(pendingDueReminders(list, '2026-11-15', shown).map((x) => x.id)).toEqual(['soon']);
  });
  it('a new due date is a new reminder', () => {
    expect(dueAlertKey(r('x', '2026-12-01'))).not.toBe(dueAlertKey(r('x', '2027-01-01')));
  });
});
