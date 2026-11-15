import { describe, expect, it } from 'vitest';
import type { Budget } from '../db/types';
import {
  budgetAlertKey,
  alPercent,
  budgetAlertMessage,
  budgetLabel,
  percentUsed,
  budgetStatus,
  countsTowards,
  coveringRange,
  evaluateBudgets,
  pendingBudgetAlerts,
  periodRange,
  progressBp,
  pruneAlertKeys,
  validateBudget,
} from './budgets';

const budget = (over: Partial<Budget>): Budget => ({
  id: 'b',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  scope: 'all',
  target: 'global',
  period: 'monthly',
  limitCents: 10000,
  warnAtBp: 8000,
  active: true,
  ...over,
});

const tx = (
  amountCents: number,
  extra: Partial<{
    type: 'expense' | 'income' | 'transfer';
    scope: 'personal' | 'business';
    categoryId: string;
    date: string;
    deleted: boolean;
  }> = {},
) => ({
  type: 'expense' as const,
  amountCents,
  scope: 'personal' as const,
  categoryId: 'food',
  date: '2026-11-15',
  deleted: false,
  ...extra,
});

describe('periodRange', () => {
  it('day, ISO week from Monday, month', () => {
    expect(periodRange('daily', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
    // 15 Nov 2026 is a Sunday: the week started on Monday 9.
    expect(periodRange('weekly', '2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(periodRange('monthly', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });
  it('coveringRange spans weeks crossing the month start', () => {
    const r = coveringRange([{ period: 'weekly' }, { period: 'monthly' }], '2026-12-02');
    expect(r).toEqual({ from: '2026-11-30', to: '2026-12-31' });
  });
});

describe('countsTowards', () => {
  it('only expenses, matching scope and category', () => {
    const b = budget({ scope: 'personal', target: 'category', categoryId: 'food' });
    expect(countsTowards(b, tx(100))).toBe(true);
    expect(countsTowards(b, tx(100, { type: 'income' }))).toBe(false);
    expect(countsTowards(b, tx(100, { type: 'transfer' }))).toBe(false);
    expect(countsTowards(b, tx(100, { scope: 'business' }))).toBe(false);
    expect(countsTowards(b, tx(100, { categoryId: 'bar' }))).toBe(false);
    expect(countsTowards(b, tx(100, { deleted: true }))).toBe(false);
    expect(countsTowards(budget({}), tx(100, { scope: 'business', categoryId: 'x' }))).toBe(true);
  });
});

describe('budgetStatus', () => {
  it('ok / warn (inclusive) / over (strict)', () => {
    expect(budgetStatus(7999, 10000, 8000)).toBe('ok');
    expect(budgetStatus(8000, 10000, 8000)).toBe('warn');
    expect(budgetStatus(10000, 10000, 8000)).toBe('warn');
    expect(budgetStatus(10001, 10000, 8000)).toBe('over');
  });
  it('progress is capped', () => {
    expect(progressBp(5000, 10000)).toBe(5000);
    expect(progressBp(25000, 10000)).toBe(10000);
    expect(progressBp(1, 3)).toBe(3333);
  });
});

describe('evaluateBudgets', () => {
  it('sums the current period only and skips inactive budgets', () => {
    const evals = evaluateBudgets(
      [
        budget({ id: 'm' }),
        budget({ id: 'd', period: 'daily' }),
        budget({ id: 'off', active: false }),
      ],
      [tx(6000), tx(3000, { date: '2026-11-02' }), tx(5000, { date: '2026-10-31' })],
      '2026-11-15',
    );
    expect(evals.map((e) => [e.budget.id, e.spentCents, e.status])).toEqual([
      ['m', 9000, 'warn'],
      ['d', 6000, 'ok'],
    ]);
    expect(evals[0]!.remainingCents).toBe(1000);
  });
});

describe('alerts', () => {
  const range = { from: '2026-11-01', to: '2026-11-30' };
  const ev = (status: 'ok' | 'warn' | 'over') => ({
    budget: budget({}),
    range,
    spentCents: 0,
    remainingCents: 0,
    status,
  });
  it('shows each level once per period', () => {
    expect(pendingBudgetAlerts([ev('ok')], new Set())).toEqual([]);
    const w = pendingBudgetAlerts([ev('warn')], new Set());
    expect(w[0]!.keys).toEqual(['budget:b:2026-11-01:warn']);
    expect(pendingBudgetAlerts([ev('warn')], new Set(w[0]!.keys))).toEqual([]);
    // Going over after a warning still alerts.
    expect(pendingBudgetAlerts([ev('over')], new Set(w[0]!.keys))).toHaveLength(1);
  });
  it('over consumes the warn key too', () => {
    const o = pendingBudgetAlerts([ev('over')], new Set());
    expect(o[0]!.keys).toContain(budgetAlertKey('b', range, 'warn'));
  });
  it('prunes old keys', () => {
    const keys = ['budget:b:2026-09-01:warn', 'budget:b:2026-11-01:over', 'due:r:2026-10-31'];
    expect(pruneAlertKeys(keys, '2026-10-15')).toEqual([
      'budget:b:2026-11-01:over',
      'due:r:2026-10-31',
    ]);
  });
});

describe('validateBudget', () => {
  it('requires category, positive limit and a sensible warning level', () => {
    expect(validateBudget({ target: 'global', limitCents: 100, warnAtBp: 8000 })).toEqual([]);
    expect(validateBudget({ target: 'category', limitCents: 0, warnAtBp: 0 })).toHaveLength(3);
  });
});

describe('labels and messages', () => {
  it('budgetLabel', () => {
    expect(budgetLabel({ scope: 'all', target: 'global' }, undefined)).toBe('Spese totali');
    expect(budgetLabel({ scope: 'business', target: 'global' }, undefined)).toBe('Spese di lavoro');
    expect(budgetLabel({ scope: 'all', target: 'category' }, 'Bar')).toBe('Bar');
    expect(budgetLabel({ scope: 'personal', target: 'category' }, 'Bar')).toBe('Bar (personale)');
  });
  it('alPercent', () => {
    expect([1, 8, 11, 18, 80, 85, 90, 100].map(alPercent)).toEqual([
      "all'1%",
      "all'8%",
      "all'11%",
      'al 18%',
      "all'80%",
      "all'85%",
      'al 90%',
      'al 100%',
    ]);
  });
  it('percentUsed floors', () => {
    expect(percentUsed(7999, 10000)).toBe(79);
    expect(percentUsed(12000, 10000)).toBe(120);
  });
  it('budgetAlertMessage', () => {
    const fmt = (c: number) => `${c / 100} €`;
    const b = budget({ limitCents: 20000, period: 'weekly' });
    expect(budgetAlertMessage('Bar', { budget: b, spentCents: 17000, status: 'warn' }, fmt)).toBe(
      "Soglia «Bar» all'85%: 170 € su 200 € questa settimana.",
    );
    expect(budgetAlertMessage('Bar', { budget: b, spentCents: 23000, status: 'over' }, fmt)).toBe(
      'Soglia «Bar» superata: 230 € su 200 € questa settimana.',
    );
  });
});
