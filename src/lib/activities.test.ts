import { describe, expect, it } from 'vitest';
import {
  activeActivitiesOn,
  checkActivityAssignment,
  defaultActivityId,
  isActiveOn,
  validateActivity,
} from './activities';

const base = { deleted: false };
const it62 = { ...base, id: 'old', activeFrom: '2024-01-01', activeTo: '2026-06-30', sortOrder: 1 };
const it63 = { ...base, id: 'new', activeFrom: '2026-07-01', sortOrder: 2 };
const video = { ...base, id: 'video', activeFrom: '2026-09-01', sortOrder: 3 };
const all = [it62, it63, video];

describe('isActiveOn', () => {
  it('includes both boundaries', () => {
    expect(isActiveOn(it62, '2024-01-01')).toBe(true);
    expect(isActiveOn(it62, '2026-06-30')).toBe(true);
    expect(isActiveOn(it62, '2026-07-01')).toBe(false);
    expect(isActiveOn(it63, '2030-01-01')).toBe(true);
  });

  it('ignores deleted activities', () => {
    expect(isActiveOn({ ...it63, deleted: true }, '2026-08-01')).toBe(false);
  });
});

describe('default activity', () => {
  it('preselects only when exactly one is active', () => {
    expect(defaultActivityId(all, '2026-03-01')).toBe('old');
    expect(defaultActivityId(all, '2026-08-01')).toBe('new');
    expect(defaultActivityId(all, '2026-10-01')).toBeUndefined();
    expect(activeActivitiesOn(all, '2026-10-01').map((a) => a.id)).toEqual(['new', 'video']);
    expect(defaultActivityId(all, '2023-01-01')).toBeUndefined();
  });
});

describe('checkActivityAssignment', () => {
  const income = { type: 'income' as const, scope: 'business' as const };
  it('requires an activity for business income', () => {
    expect(checkActivityAssignment({ ...income, date: '2026-08-01' }, all)).toBe('missing');
    expect(checkActivityAssignment({ ...income, date: '2026-08-01', activityId: 'new' }, all)).toBe(
      'ok',
    );
  });

  it('flags an activity not active on the (changed) date', () => {
    expect(checkActivityAssignment({ ...income, date: '2026-08-01', activityId: 'old' }, all)).toBe(
      'inactive',
    );
  });

  it('is optional for expenses and personal income', () => {
    expect(
      checkActivityAssignment({ type: 'expense', scope: 'business', date: '2026-08-01' }, all),
    ).toBe('notRequired');
    expect(
      checkActivityAssignment({ type: 'income', scope: 'personal', date: '2026-08-01' }, all),
    ).toBe('notRequired');
  });
});

describe('validateActivity', () => {
  it('checks coefficient and dates', () => {
    expect(validateActivity({ name: 'X', coefficientBp: 6700, activeFrom: '2026-01-01' })).toEqual(
      [],
    );
    expect(
      validateActivity({
        name: '',
        coefficientBp: 0,
        activeFrom: '2026-01-01',
        activeTo: '2025-01-01',
      }),
    ).toHaveLength(3);
  });
});
