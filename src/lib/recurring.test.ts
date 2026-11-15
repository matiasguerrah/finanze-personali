import { describe, expect, it } from 'vitest';
import {
  advanceDueDate,
  anchorDayFor,
  attentionCount,
  dueStatus,
  dueText,
  frequencyText,
  groupByDueStatus,
  nextYearlyOccurrence,
  validateRecurring,
} from './recurring';

describe('advanceDueDate', () => {
  it('handles every frequency', () => {
    expect(advanceDueDate('2026-11-15', { frequency: 'monthly' })).toBe('2026-12-15');
    expect(advanceDueDate('2026-11-15', { frequency: 'bimonthly' })).toBe('2027-01-15');
    expect(advanceDueDate('2026-11-15', { frequency: 'quarterly' })).toBe('2027-02-15');
    expect(advanceDueDate('2026-06-30', { frequency: 'yearly' })).toBe('2027-06-30');
    expect(advanceDueDate('2026-11-15', { frequency: 'custom', customDays: 10 })).toBe(
      '2026-11-25',
    );
  });

  it('returns to the anchor day after a short month', () => {
    const s = { frequency: 'monthly' as const, anchorDay: 31 };
    expect(advanceDueDate('2027-01-31', s)).toBe('2027-02-28');
    expect(advanceDueDate('2027-02-28', s)).toBe('2027-03-31');
    expect(advanceDueDate('2027-03-31', s)).toBe('2027-04-30');
    expect(advanceDueDate('2028-01-31', s)).toBe('2028-02-29'); // leap year
  });

  it('without anchor keeps the clamped day', () => {
    expect(advanceDueDate('2027-01-31', { frequency: 'monthly' })).toBe('2027-02-28');
    expect(advanceDueDate('2027-02-28', { frequency: 'monthly' })).toBe('2027-03-28');
  });

  it('yearly on 29 February', () => {
    const s = { frequency: 'yearly' as const, anchorDay: 29 };
    expect(advanceDueDate('2028-02-29', s)).toBe('2029-02-28');
  });

  it('custom with an invalid interval still moves forward', () => {
    expect(advanceDueDate('2026-11-15', { frequency: 'custom' })).toBe('2026-11-16');
  });
});

describe('anchorDayFor', () => {
  it('only for month-based frequencies', () => {
    expect(anchorDayFor('2026-01-31', 'monthly')).toBe(31);
    expect(anchorDayFor('2026-06-30', 'yearly')).toBe(30);
    expect(anchorDayFor('2026-06-30', 'custom')).toBeUndefined();
  });
});

describe('nextYearlyOccurrence', () => {
  it('this year if not passed yet, otherwise next year', () => {
    expect(nextYearlyOccurrence(11, 30, '2026-11-15')).toBe('2026-11-30');
    expect(nextYearlyOccurrence(6, 30, '2026-11-15')).toBe('2027-06-30');
    expect(nextYearlyOccurrence(11, 30, '2026-11-30')).toBe('2026-11-30');
  });
});

const r = (
  id: string,
  nextDueDate: string,
  extra: { active?: boolean; deleted?: boolean } = {},
) => ({
  id,
  nextDueDate,
  reminderDaysBefore: 3,
  active: true,
  deleted: false,
  ...extra,
});

describe('dueStatus', () => {
  const today = '2026-11-15';
  it('overdue / due soon / upcoming', () => {
    expect(dueStatus(r('a', '2026-11-14'), today)).toBe('overdue');
    expect(dueStatus(r('a', '2026-11-15'), today)).toBe('dueSoon');
    expect(dueStatus(r('a', '2026-11-18'), today)).toBe('dueSoon');
    expect(dueStatus(r('a', '2026-11-19'), today)).toBe('upcoming');
    expect(dueStatus({ nextDueDate: '2026-11-15', reminderDaysBefore: 0 }, today)).toBe('dueSoon');
  });
});

describe('groupByDueStatus / attentionCount', () => {
  const today = '2026-11-15';
  const list = [
    r('late', '2026-11-01'),
    r('soon', '2026-11-16'),
    r('later', '2026-12-30'),
    r('next', '2026-12-01'),
    r('off', '2026-11-01', { active: false }),
    r('gone', '2026-11-01', { deleted: true }),
  ];
  it('groups and sorts by due date', () => {
    const g = groupByDueStatus(list, today);
    expect(g.overdue.map((x) => x.id)).toEqual(['late']);
    expect(g.dueSoon.map((x) => x.id)).toEqual(['soon']);
    expect(g.upcoming.map((x) => x.id)).toEqual(['next', 'later']);
    expect(g.inactive.map((x) => x.id)).toEqual(['off']);
  });
  it('counts only active, non-deleted items needing attention', () => {
    expect(attentionCount(list, today)).toBe(2);
  });
});

describe('validateRecurring', () => {
  const ok = {
    name: 'Affitto',
    amountCents: 75000,
    categoryId: 'c',
    accountId: 'a',
    frequency: 'monthly' as const,
    nextDueDate: '2026-12-01',
    reminderDaysBefore: 3,
  };
  it('accepts a valid record and amount 0 (still unknown)', () => {
    expect(validateRecurring(ok)).toEqual([]);
    expect(validateRecurring({ ...ok, amountCents: 0 })).toEqual([]);
  });
  it('rejects missing fields', () => {
    expect(validateRecurring({ ...ok, name: '', categoryId: '' })).toHaveLength(2);
    expect(validateRecurring({ ...ok, nextDueDate: '2026-02-30' })).toHaveLength(1);
    expect(validateRecurring({ ...ok, reminderDaysBefore: -1 })).toHaveLength(1);
  });
  it('custom needs a day interval', () => {
    expect(validateRecurring({ ...ok, frequency: 'custom' })).toHaveLength(1);
    expect(validateRecurring({ ...ok, frequency: 'custom', customDays: 15 })).toEqual([]);
  });
});

describe('labels', () => {
  it('dueText', () => {
    const t = '2026-11-15';
    expect(dueText('2026-11-15', t)).toBe('oggi');
    expect(dueText('2026-11-16', t)).toBe('domani');
    expect(dueText('2026-11-20', t)).toBe('tra 5 giorni');
    expect(dueText('2026-11-14', t)).toBe('scaduta ieri');
    expect(dueText('2026-11-10', t)).toBe('scaduta da 5 giorni');
  });
  it('frequencyText', () => {
    expect(frequencyText({ frequency: 'quarterly' })).toBe('trimestrale');
    expect(frequencyText({ frequency: 'custom', customDays: 15 })).toBe('ogni 15 giorni');
  });
});
