import { describe, expect, it } from 'vitest';
import type { Transaction } from '../db/types';
import {
  businessIncomeByYear,
  businessReport,
  byCategory,
  monthlyTotals,
  presetRange,
} from './reports';

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    type: 'expense',
    amountCents: 1000,
    date: '2026-11-10',
    categoryId: 'food',
    scope: 'personal',
    deleted: false,
    ...over,
  }) as Transaction;

describe('presetRange', () => {
  it('computes calendar ranges from today', () => {
    expect(presetRange('thisMonth', '2026-03-15')).toEqual({
      from: '2026-03-01',
      to: '2026-03-31',
    });
    expect(presetRange('lastMonth', '2026-03-31')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(presetRange('lastMonth', '2026-01-10')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(presetRange('thisYear', '2026-03-15')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(presetRange('lastYear', '2026-03-15')).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(presetRange('last12', '2026-03-15')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });
});

describe('byCategory', () => {
  const range = { from: '2026-11-01', to: '2026-11-30' };
  it('groups one type in range, biggest first, with floored shares', () => {
    const r = byCategory(
      [
        tx({ amountCents: 2000 }),
        tx({ amountCents: 1000, categoryId: 'bar' }),
        tx({ amountCents: 1000, categoryId: 'bar' }),
        tx({ amountCents: 3000, categoryId: 'rent' }),
        tx({ amountCents: 9999, type: 'income', categoryId: 'inv' }),
        tx({ amountCents: 9999, type: 'transfer', categoryId: '' }),
        tx({ amountCents: 9999, deleted: true }),
        tx({ amountCents: 9999, date: '2026-10-31' }),
      ],
      'expense',
      range,
    );
    expect(r.totalCents).toBe(7000);
    expect(r.rows).toEqual([
      { categoryId: 'rent', cents: 3000, count: 1, shareBp: 4285 },
      { categoryId: 'bar', cents: 2000, count: 2, shareBp: 2857 },
      { categoryId: 'food', cents: 2000, count: 1, shareBp: 2857 },
    ]);
    expect(r.rows.reduce((s, x) => s + x.shareBp, 0)).toBeLessThanOrEqual(10_000);
  });
  it('empty range → zero total, no rows', () => {
    expect(byCategory([], 'expense', range)).toEqual({ totalCents: 0, rows: [] });
  });
});

describe('monthlyTotals', () => {
  it('returns every month, zeros included, oldest first', () => {
    const m = monthlyTotals(
      [
        tx({ date: '2026-11-03', amountCents: 500 }),
        tx({ date: '2026-11-20', type: 'income', amountCents: 9000 }),
        tx({ date: '2026-09-01', amountCents: 700 }),
        tx({ date: '2026-09-02', type: 'transfer', amountCents: 5 }),
        tx({ date: '2025-11-30', amountCents: 1 }), // outside the 3 months
      ],
      '2026-11-16',
      3,
    );
    expect(m).toEqual([
      { month: '2026-09', from: '2026-09-01', incomeCents: 0, expenseCents: 700 },
      { month: '2026-10', from: '2026-10-01', incomeCents: 0, expenseCents: 0 },
      { month: '2026-11', from: '2026-11-01', incomeCents: 9000, expenseCents: 500 },
    ]);
  });
  it('crosses the year boundary', () => {
    expect(monthlyTotals([], '2026-02-10', 4).map((x) => x.month)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });
});

describe('businessReport', () => {
  const fiscal = new Set(['inps', 'tax']);
  const biz = (over: Partial<Transaction>) => tx({ scope: 'business', ...over });
  const txs = [
    biz({
      type: 'income',
      date: '2026-01-31',
      amountCents: 100_000,
      activityId: 'web',
      client: 'Acme',
      invoiceNumber: '1',
    }),
    biz({
      type: 'income',
      date: '2026-03-05',
      amountCents: 50_000,
      activityId: 'video',
      client: ' acme ',
      invoiceNumber: '2',
    }),
    biz({ type: 'income', date: '2026-03-20', amountCents: 20_000, client: '' }),
    biz({ type: 'income', date: '2025-12-31', amountCents: 999 }), // previous year
    tx({ type: 'income', date: '2026-02-01', amountCents: 777 }), // personal
    biz({ date: '2026-02-10', amountCents: 3_000, categoryId: 'sw' }),
    biz({ date: '2026-06-30', amountCents: 40_000, categoryId: 'inps' }),
    biz({ date: '2026-06-30', amountCents: 10_000, categoryId: 'tax' }),
    biz({ type: 'income', date: '2026-04-01', amountCents: 5, deleted: true }),
  ];

  it('totals, taxes apart from ordinary expenses, invoices', () => {
    const r = businessReport(txs, 2026, fiscal);
    expect(r).toMatchObject({
      incomeCents: 170_000,
      expenseCents: 3_000,
      taxesCents: 50_000,
      invoiceCount: 2,
    });
  });

  it('monthly income with running total', () => {
    const r = businessReport(txs, 2026, fiscal);
    expect(r.months).toHaveLength(12);
    expect(r.months.slice(0, 4).map((m) => [m.month, m.incomeCents, m.cumulativeCents])).toEqual([
      ['2026-01', 100_000, 100_000],
      ['2026-02', 0, 100_000],
      ['2026-03', 70_000, 170_000],
      ['2026-04', 0, 170_000],
    ]);
    expect(r.months[11]!.cumulativeCents).toBe(170_000);
  });

  it('by activity, by client (case/space-insensitive) and expenses by category', () => {
    const r = businessReport(txs, 2026, fiscal);
    expect(r.byActivity).toEqual([
      { key: 'web', cents: 100_000, count: 1 },
      { key: 'video', cents: 50_000, count: 1 },
      { key: '', cents: 20_000, count: 1 },
    ]);
    expect(r.byClient).toEqual([
      { key: 'Acme', cents: 150_000, count: 2 },
      { key: '', cents: 20_000, count: 1 },
    ]);
    expect(r.expensesByCategory.map((e) => e.key)).toEqual(['inps', 'tax', 'sw']);
  });

  it('income by year', () => {
    expect(businessIncomeByYear(txs)).toEqual([
      { year: 2026, cents: 170_000 },
      { year: 2025, cents: 999 },
    ]);
  });
});
