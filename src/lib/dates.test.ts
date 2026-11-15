import { describe, expect, it } from 'vitest';
import {
  addMonthsISO,
  daysBetween,
  formatDayHeading,
  isISODate,
  monthRange,
  todayRome,
  weekRange,
} from './dates';

describe('todayRome', () => {
  it('uses the Rome calendar day, not UTC', () => {
    // 23:30 UTC on 31 Dec = 00:30 on 1 Jan in Rome (CET, UTC+1).
    expect(todayRome(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    // 22:30 UTC on 30 Jun = 00:30 on 1 Jul in Rome (CEST, UTC+2).
    expect(todayRome(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    expect(todayRome(new Date('2026-06-30T21:30:00Z'))).toBe('2026-06-30');
  });
});

describe('ranges', () => {
  it('weeks start on Monday', () => {
    expect(weekRange('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }); // Sunday
    expect(weekRange('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' }); // Monday
  });

  it('months', () => {
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('adds months clamping to month end', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('counts days across DST changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-11-10', '2026-11-08')).toBe(-2);
  });
});

describe('isISODate', () => {
  it('validates real dates only', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('26-02-28')).toBe(false);
  });
});

describe('formatDayHeading', () => {
  it('uses Oggi/Ieri and Italian names', () => {
    expect(formatDayHeading('2026-11-08', '2026-11-08')).toBe('Oggi');
    expect(formatDayHeading('2026-11-07', '2026-11-08')).toBe('Ieri');
    expect(formatDayHeading('2026-11-02', '2026-11-08')).toBe('lunedì 2 novembre');
    expect(formatDayHeading('2025-11-03', '2026-11-08')).toBe('lunedì 3 novembre 2025');
  });
});
