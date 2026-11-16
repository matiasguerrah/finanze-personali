import { describe, expect, it } from 'vitest';
import type { SyncedRecordMap, SyncedTable } from '../../db/types';
import { SYNCED_TABLES } from '../../db/types';
import { chunk, columnNames, fromRow, RowError, shouldApplyRemote, toRow } from './merge';

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-11-15T10:00:00.000Z',
  updatedAt: '2026-11-15T10:00:00.000Z',
  deleted: false,
};

/** One record per table with every optional field set (round-trip must be lossless). */
const FULL: { [K in SyncedTable]: SyncedRecordMap[K] } = {
  transactions: {
    ...base,
    date: '2026-11-15',
    type: 'transfer',
    amountCents: 123456,
    scope: 'business',
    categoryId: '',
    accountId: 'a1',
    toAccountId: 'a2',
    activityId: 'act',
    note: '=SUM(A1) caffè, "virgolette"',
    tags: ['viaggio', 'cliente-x'],
    recurringId: 'r',
    debtId: 'd',
    invoiceNumber: '12/2026',
    client: 'ACME',
    splitGroupId: 'g',
  },
  activities: {
    ...base,
    name: 'Consulenza',
    atecoCode: '62.01.00',
    coefficientBp: 6700,
    activeFrom: '2024-01-01',
    activeTo: '2026-06-30',
    sortOrder: 1,
  },
  categories: {
    ...base,
    name: 'Contributi INPS',
    type: 'expense',
    defaultScope: 'business',
    icon: 'Landmark',
    color: 'teal',
    sortOrder: 109,
    archived: true,
    systemKey: 'inps',
  },
  accounts: {
    ...base,
    name: 'Carta',
    type: 'card',
    defaultScope: 'personal',
    initialBalanceCents: -1500,
    icon: 'CreditCard',
    color: 'violet',
    sortOrder: 3,
    archived: false,
  },
  budgets: {
    ...base,
    scope: 'all',
    target: 'category',
    categoryId: 'c',
    period: 'weekly',
    limitCents: 1000,
    warnAtBp: 8000,
    active: true,
  },
  recurring: {
    ...base,
    name: 'Palestra',
    amountCents: 0,
    estimated: true,
    scope: 'personal',
    categoryId: 'c',
    accountId: 'a',
    frequency: 'custom',
    customDays: 28,
    nextDueDate: '2026-12-01',
    anchorDay: 31,
    reminderDaysBefore: 3,
    active: false,
    taxKind: 'secondAdvance',
  },
  debts: {
    ...base,
    name: 'Prestito auto',
    state: 'installments',
    noticeAmountCents: 950000,
    noticeDueDate: '2025-12-15',
    rateizedAt: '2025-12-10T09:00:00.000Z',
    creditor: 'Banca',
    principalCents: 1000000,
    annualRateBp: 450,
    installmentCents: 20000,
    startDate: '2026-01-01',
    plannedInstallments: 60,
    notes: '',
  },
  taxParams: {
    ...base,
    validFromYear: 2026,
    substituteTaxBp: 500,
    contributionRateBp: 2607,
    fixedContributionCents: 0,
    revenueThresholdCents: 8500000,
  },
  profile: {
    ...base,
    firstName: 'Mario',
    lastName: 'Rossi',
    vatNumber: '01234567897',
    taxCode: 'RSSMRA85T10A562S',
    pec: 'mario.rossi@pec.example.it',
  },
};

describe('row serialisation', () => {
  it.each(SYNCED_TABLES)('%s round-trips every field', (t) => {
    const row = toRow(t, FULL[t]);
    expect(Object.values(row).every((v) => typeof v === 'string')).toBe(true);
    expect(fromRow(t, row)).toEqual(FULL[t]);
    expect(Object.keys(row)).toEqual(columnNames(t));
  });

  it('empty optional cells become absent fields', () => {
    const { activeTo: _a, ...open } = FULL.activities;
    const row = toRow('activities', open);
    expect(row.activeTo).toBe('');
    expect('activeTo' in fromRow('activities', row)).toBe(false);
  });

  it('accepts booleans in any case and tolerates missing new columns', () => {
    const row = toRow('categories', FULL.categories);
    expect(fromRow('categories', { ...row, archived: 'true', deleted: 'false' }).archived).toBe(
      true,
    );
    const { systemKey: _s, ...older } = row; // a Sheet created before this column existed
    expect('systemKey' in fromRow('categories', older)).toBe(false);
  });

  it('rejects malformed cells instead of storing garbage', () => {
    const row = toRow('transactions', FULL.transactions);
    expect(() => fromRow('transactions', { ...row, amountCents: '12,50' })).toThrow(RowError);
    expect(() => fromRow('transactions', { ...row, tags: '[oops' })).toThrow(RowError);
    expect(() => fromRow('transactions', { ...row, id: '' })).toThrow(RowError);
  });
});

describe('shouldApplyRemote', () => {
  it('only strictly newer remote versions win', () => {
    const r = { updatedAt: '2026-11-15T10:00:00.001Z' };
    expect(shouldApplyRemote(undefined, r)).toBe(true);
    expect(shouldApplyRemote({ updatedAt: '2026-11-15T10:00:00.000Z' }, r)).toBe(true);
    expect(shouldApplyRemote({ updatedAt: r.updatedAt }, r)).toBe(false);
    expect(shouldApplyRemote({ updatedAt: '2026-11-15T11:00:00.000Z' }, r)).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into fixed-size batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
