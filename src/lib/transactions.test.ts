import { describe, expect, it } from 'vitest';
import { groupByDay, parseTags, proposedScope, totals, validateDraft } from './transactions';

const acts = [{ id: 'a', activeFrom: '2026-01-01', deleted: false }];

describe('proposedScope', () => {
  it('prefers business if category or account says so', () => {
    expect(proposedScope('personal', 'personal')).toBe('personal');
    expect(proposedScope('business', 'personal')).toBe('business');
    expect(proposedScope('personal', 'business')).toBe('business');
    expect(proposedScope(undefined, undefined)).toBe('personal');
  });
});

describe('validateDraft', () => {
  const draft = {
    type: 'income' as const,
    amountCents: 100000,
    scope: 'business' as const,
    date: '2026-03-01',
    categoryId: 'c',
    accountId: 'acc',
  };
  it('requires an active activity for business income', () => {
    expect(validateDraft(draft, acts)).toEqual(['activityMissing']);
    expect(validateDraft({ ...draft, activityId: 'a' }, acts)).toEqual([]);
    expect(validateDraft({ ...draft, activityId: 'a', date: '2025-12-31' }, acts)).toEqual([
      'activityInactive',
    ]);
  });
  it('requires a positive integer amount', () => {
    expect(validateDraft({ ...draft, scope: 'personal', amountCents: 0 }, acts)).toEqual([
      'amount',
    ]);
    expect(validateDraft({ ...draft, scope: 'personal', amountCents: 1.5 }, acts)).toEqual([
      'amount',
    ]);
  });
  it('validates transfers without category or activity', () => {
    const tr = { ...draft, type: 'transfer' as const, categoryId: '', toAccountId: 'cash' };
    expect(validateDraft(tr, acts)).toEqual([]);
    expect(validateDraft({ ...tr, toAccountId: undefined }, acts)).toEqual(['toAccount']);
    expect(validateDraft({ ...tr, toAccountId: 'acc' }, acts)).toEqual(['sameAccount']);
  });
});

describe('totals and grouping', () => {
  const txs = [
    { type: 'expense' as const, amountCents: 450, scope: 'personal' as const, date: '2026-11-08' },
    { type: 'income' as const, amountCents: 10000, scope: 'business' as const, date: '2026-11-08' },
    {
      type: 'transfer' as const,
      amountCents: 5000,
      scope: 'personal' as const,
      date: '2026-11-07',
    },
    { type: 'expense' as const, amountCents: 1999, scope: 'personal' as const, date: '2026-11-07' },
  ];
  it('ignores transfers in totals', () => {
    expect(totals(txs)).toEqual({ incomeCents: 10000, expenseCents: 2449, netCents: 7551 });
  });
  it('groups consecutive days with net', () => {
    const g = groupByDay(txs);
    expect(g.map((x) => [x.date, x.items.length, x.netCents])).toEqual([
      ['2026-11-08', 2, 9550],
      ['2026-11-07', 2, -1999],
    ]);
  });
});

describe('parseTags', () => {
  it('normalises', () => {
    expect(parseTags(' #Lavoro, cliente-x  lavoro ')).toEqual(['lavoro', 'cliente-x']);
    expect(parseTags('')).toEqual([]);
  });
});
