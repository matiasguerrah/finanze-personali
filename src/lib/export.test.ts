import { describe, expect, it } from 'vitest';
import type { Account, Activity, Category, Debt, Transaction } from '../db/types';
import {
  businessSummaryTable,
  movementsTable,
  rawTable,
  summaryTable,
  toCsv,
  type Lookups,
} from './export';
import { businessReport } from './reports';

const base = {
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deleted: false,
};
const l: Lookups = {
  categories: [
    { ...base, id: 'food', name: 'Spesa', type: 'expense' } as Category,
    { ...base, id: 'inv', name: 'Fatture', type: 'income' } as Category,
  ],
  accounts: [
    { ...base, id: 'bank', name: 'Conto' } as Account,
    { ...base, id: 'cash', name: 'Contanti' } as Account,
  ],
  activities: [{ ...base, id: 'web', name: 'Web', atecoCode: '62.01.00' } as Activity],
  debts: [{ ...base, id: 'd', name: 'Auto' } as Debt],
};
const tx = (over: Partial<Transaction>): Transaction => ({
  ...base,
  id: Math.random().toString(),
  date: '2026-11-10',
  type: 'expense',
  amountCents: 1234,
  scope: 'personal',
  categoryId: 'food',
  accountId: 'bank',
  note: '',
  tags: [],
  ...over,
});

describe('movementsTable', () => {
  it('one row per live movement, oldest first, signed amounts, names resolved', () => {
    const t = movementsTable(
      [
        tx({ date: '2026-11-12', note: 'pane', tags: ['casa', 'cibo'], debtId: 'd' }),
        tx({
          date: '2026-11-01',
          type: 'income',
          scope: 'business',
          categoryId: 'inv',
          amountCents: 100_000,
          activityId: 'web',
          invoiceNumber: '7',
          client: 'Acme',
        }),
        tx({
          date: '2026-11-05',
          type: 'transfer',
          categoryId: '',
          toAccountId: 'cash',
          amountCents: 5000,
        }),
        tx({ deleted: true }),
      ],
      l,
    );
    expect(t.rows).toHaveLength(3);
    expect(toCsv(t).split('\r\n').slice(1, 4)).toEqual([
      '01/11/2026;Entrata;Lavoro;Fatture;Conto;;1000,00;;;Web;62.01.00;7;Acme;',
      '05/11/2026;Giroconto;Personale;;Conto;Contanti;50,00;;;;;;;',
      '12/11/2026;Uscita;Personale;Spesa;Conto;;-12,34;pane;casa, cibo;;;;;Auto',
    ]);
  });
});

describe('toCsv', () => {
  it('BOM, semicolons, CRLF, quoting and formula neutralisation', () => {
    const csv = toCsv(
      movementsTable(
        [tx({ note: 'a;b "c"' }), tx({ note: '=HYPERLINK("x")' }), tx({ note: '-5 sconto' })],
        l,
      ),
    );
    expect(csv.startsWith('\uFEFFData;Tipo;Ambito;')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv).toContain(';"a;b ""c""";');
    expect(csv).toContain(`;"'=HYPERLINK(""x"")";`);
    expect(csv).toContain(';-5 sconto;'); // a number-like text stays as is
  });
  it('money: small, negative and large values', () => {
    const csv = toCsv({
      name: 'x',
      header: ['v'],
      rows: [
        [{ kind: 'money', cents: 5 }],
        [{ kind: 'money', cents: -1 }],
        [{ kind: 'money', cents: 123456789 }],
      ],
    });
    expect(csv.split('\r\n').slice(1, 4)).toEqual(['0,05', '-0,01', '1234567,89']);
  });
});

describe('summaryTable', () => {
  it('totals and category sections', () => {
    const t = summaryTable(
      [
        tx({ amountCents: 3000 }),
        tx({ amountCents: 1000 }),
        tx({ type: 'income', categoryId: 'inv', amountCents: 10_000 }),
      ],
      { from: '2026-11-01', to: '2026-11-30' },
      'all',
      l,
    );
    const csv = toCsv(t);
    expect(csv).toContain('Entrate;100,00');
    expect(csv).toContain('Uscite;40,00');
    expect(csv).toContain('Saldo;60,00');
    expect(csv).toContain('Spesa;40,00;100,00%;2');
    expect(t.boldRows).toHaveLength(2);
  });
});

describe('businessSummaryTable', () => {
  it('lists months with running totals, activities and clients', () => {
    const r = businessReport(
      [
        tx({
          type: 'income',
          scope: 'business',
          amountCents: 50_000,
          date: '2026-02-01',
          activityId: 'web',
          client: 'Acme',
          invoiceNumber: '1',
        }),
      ],
      2026,
      new Set(),
    );
    const csv = toCsv(businessSummaryTable(r, l));
    expect(csv).toContain('Incassi;500,00');
    expect(csv).toContain('2026-02;500,00;500,00');
    expect(csv).toContain('2026-12;0,00;500,00');
    expect(csv).toContain('Web;500,00;1');
    expect(csv).toContain('Acme;500,00;1');
  });
});

describe('rawTable', () => {
  it('uses the Sheet columns and skips deleted rows', () => {
    const t = rawTable('transactions', [
      tx({ id: 'a', tags: ['x'] }),
      tx({ id: 'b', deleted: true }),
    ]);
    expect(t.header.slice(0, 5)).toEqual(['id', 'createdAt', 'updatedAt', 'deleted', 'date']);
    expect(t.rows).toHaveLength(1);
    expect(toCsv(t)).toContain(
      'a;2026-01-01T00:00:00.000Z;2026-01-01T00:00:00.000Z;FALSE;2026-11-10;expense;1234;',
    );
  });
});
