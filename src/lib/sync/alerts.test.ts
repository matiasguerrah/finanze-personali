/**
 * Email alerts of apps-script/Code.gs. Records are written with the app's own `toRow`, exactly as
 * sync puts them in the Sheet, and the results are checked against the app's logic.
 */
import { describe, expect, it } from 'vitest';
import { createAppsScript } from '../../test/appsScriptHarness';
import type {
  Budget,
  Category,
  Recurring,
  SyncedRecordMap,
  SyncedTable,
  TaxParams,
  Transaction,
} from '../../db/types';
import { toRow } from './merge';
import { evaluateBudgets, excludedFromGlobalBudgets, pendingBudgetAlerts } from '../budgets';
import { pendingDueReminders } from '../notifications';

type Rows = Record<string, string>[];
type Tables = Partial<Record<SyncedTable, Rows>>;
interface Mail {
  subject: string;
  body: string;
  keys: string[];
}

const gs = createAppsScript();
const computeAlerts = gs.fn.computeAlerts as (t: Tables, today: string, sent: string[]) => Mail;
const dailySummaryEmail = gs.fn.dailySummaryEmail as (
  t: Tables,
  day: string,
) => Omit<Mail, 'keys'> | null;
const periodRange = gs.fn.periodRange as (p: string, d: string) => { from: string; to: string };
const pruneSentKeys = gs.fn.pruneSentKeys as (k: string[], cutoff: string) => string[];
const formatEuro = gs.fn.formatEuro as (c: number) => string;

const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
let n = 0;
const tx = (o: Partial<Transaction>): Transaction => ({
  ...base,
  id: `t${++n}`,
  deleted: false,
  date: '2026-11-16',
  type: 'expense',
  amountCents: 1000,
  scope: 'personal',
  categoryId: 'food',
  accountId: 'acc',
  note: '',
  tags: [],
  ...o,
});
const budget = (o: Partial<Budget>): Budget => ({
  ...base,
  id: `b${++n}`,
  deleted: false,
  scope: 'all',
  target: 'global',
  period: 'monthly',
  limitCents: 10_000,
  warnAtBp: 8000,
  active: true,
  ...o,
});
const recurring = (o: Partial<Recurring>): Recurring => ({
  ...base,
  id: `r${++n}`,
  deleted: false,
  name: 'Affitto',
  amountCents: 80_000,
  estimated: false,
  scope: 'personal',
  categoryId: 'home',
  accountId: 'acc',
  frequency: 'monthly',
  nextDueDate: '2026-11-20',
  reminderDaysBefore: 5,
  active: true,
  ...o,
});
const category = (id: string, o: Partial<Category> = {}): Category => ({
  ...base,
  id,
  deleted: false,
  name: id,
  type: 'expense',
  defaultScope: 'personal',
  icon: 'Tag',
  color: 'blue',
  sortOrder: 1,
  archived: false,
  ...o,
});
const params = (o: Partial<TaxParams>): TaxParams => ({
  ...base,
  id: 'p',
  deleted: false,
  validFromYear: 2026,
  substituteTaxBp: 500,
  contributionRateBp: 2607,
  fixedContributionCents: 0,
  revenueThresholdCents: 1_000_000,
  ...o,
});

const rows = <T extends SyncedTable>(t: T, records: SyncedRecordMap[T][]) =>
  records.map((r) => toRow(t, r));

const categories = [
  category('food', { name: 'Spesa alimentare' }),
  category('inps', { name: 'Contributi INPS', systemKey: 'inps', defaultScope: 'business' }),
  category('soft', { name: 'Software', defaultScope: 'business' }),
];

describe('periodRange (Code.gs) matches the app', () => {
  it('day, ISO week from Monday, calendar month', () => {
    expect(periodRange('daily', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-16' });
    expect(periodRange('weekly', '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Sunday
    expect(periodRange('weekly', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(periodRange('monthly', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('monthly', '2028-02-10').to).toBe('2028-02-29');
    expect(periodRange('monthly', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('formats euro the Italian way', () => {
    expect(formatEuro(123456789)).toBe('1.234.567,89 €');
    expect(formatEuro(5)).toBe('0,05 €');
    expect(formatEuro(-1050)).toBe('-10,50 €');
  });
});

describe('computeAlerts', () => {
  const today = '2026-11-16';
  const budgets = [
    budget({ id: 'global', limitCents: 10_000 }), // INPS excluded → 85 € = warn
    budget({ id: 'inpsCat', target: 'category', categoryId: 'inps', limitCents: 30_000 }), // over
    budget({ id: 'weekBiz', scope: 'business', period: 'weekly', limitCents: 50_000 }), // ok
    budget({ id: 'off', active: false, limitCents: 1 }),
  ];
  const txs = [
    tx({ amountCents: 8_500 }),
    tx({ amountCents: 50_000, categoryId: 'inps', scope: 'business' }),
    tx({ amountCents: 9_999, date: '2026-10-31' }), // previous month
    tx({ amountCents: 9_999, deleted: true }),
    tx({ amountCents: 9_999, type: 'income', categoryId: 'inv' }),
  ];
  const recs = [
    recurring({ id: 'rent', nextDueDate: '2026-11-20' }), // in 4 days, window 5 → due
    recurring({ id: 'far', nextDueDate: '2026-12-20' }),
    recurring({ id: 'late', name: 'Bolletta', nextDueDate: '2026-11-10', amountCents: 0 }),
    recurring({ id: 'paused', nextDueDate: '2026-11-17', active: false }),
    recurring({
      id: 'tax',
      name: 'Imposta sostitutiva: 2° acconto',
      nextDueDate: '2026-11-30',
      reminderDaysBefore: 14,
      amountCents: 0,
      taxKind: 'secondAdvance',
    }),
  ];
  const tables: Tables = {
    budgets: rows('budgets', budgets),
    transactions: rows('transactions', txs),
    categories: rows('categories', categories),
    recurring: rows('recurring', recs),
  };

  it('finds the same budget and due-date alerts as the app, with the same keys', () => {
    const mail = computeAlerts(tables, today, []);
    const appBudgetKeys = pendingBudgetAlerts(
      evaluateBudgets(budgets, txs, today, excludedFromGlobalBudgets(categories)),
      new Set(),
    ).flatMap((a) => a.keys);
    const appDueKeys = pendingDueReminders(recs, today, new Set()).map(
      (r) => `due:${r.id}:${r.nextDueDate}`,
    );
    expect(new Set(mail.keys)).toEqual(new Set([...appBudgetKeys, ...appDueKeys]));
    expect(mail.subject).toBe('Conti: 5 nuovi avvisi');
    expect(mail.body).toContain('Spese tutte (questo mese): attenzione, 85,00 € su 100,00 € (85%)');
    expect(mail.body).toContain('Contributi INPS (questo mese): SUPERATA, 500,00 € su 300,00 €');
    expect(mail.body).toContain('Bolletta: 10/11/2026 (scaduta da 6 giorni) · importo da definire');
    expect(mail.body).toContain('Affitto: 20/11/2026 (tra 4 giorni) · 800,00 €');
    expect(mail.body).toContain(
      'Imposta sostitutiva: 2° acconto: 30/11/2026 (tra 14 giorni) · importo stimato nell’app',
    );
  });

  it('never repeats an alert, and reports only what is new', () => {
    const first = computeAlerts(tables, today, []);
    expect(computeAlerts(tables, today, first.keys)).toBeNull();
    const more = computeAlerts(
      { ...tables, transactions: rows('transactions', [...txs, tx({ amountCents: 2_000 })]) },
      today,
      first.keys,
    );
    // The global budget went from warn to over: only that is new.
    expect(more.keys).toEqual(['budget:global:2026-11-01:over', 'budget:global:2026-11-01:warn']);
  });

  it('a new month starts the budget alerts again', () => {
    const first = computeAlerts(tables, today, []);
    const dec = computeAlerts(
      {
        ...tables,
        transactions: rows('transactions', [tx({ date: '2026-12-02', amountCents: 9_000 })]),
        recurring: [],
      },
      '2026-12-02',
      first.keys,
    );
    expect(dec.keys).toEqual(['budget:global:2026-12-01:warn']);
  });

  it('revenue threshold: 80% / 95% / over, once each, using the params of the year', () => {
    const at = (cents: number, sent: string[] = []) =>
      computeAlerts(
        {
          taxParams: rows('taxParams', [
            params({ validFromYear: 2020, revenueThresholdCents: 1 }),
            params({ id: 'p2', validFromYear: 2026 }),
            params({ id: 'p3', validFromYear: 2027, revenueThresholdCents: 1 }),
          ]),
          transactions: rows('transactions', [
            tx({ type: 'income', scope: 'business', amountCents: cents, categoryId: 'inv' }),
            tx({ type: 'income', scope: 'business', amountCents: 99_999_999, date: '2025-05-01' }),
          ]),
        },
        today,
        sent,
      );
    expect(at(700_000)).toBeNull();
    expect(at(850_000).keys).toEqual(['revenue:2026:warn']);
    expect(at(850_000).body).toContain(
      'Ricavi 2026: 8.500,00 € su 10.000,00 € — 85% della soglia, oltre l’80%',
    );
    expect(at(960_000, ['revenue:2026:warn']).keys).toEqual([
      'revenue:2026:warn',
      'revenue:2026:alert',
    ]);
    expect(at(960_000, ['revenue:2026:warn', 'revenue:2026:alert'])).toBeNull();
    expect(at(1_200_000).body).toContain('soglia superata (120%)');
  });

  it('prunes old dated keys and duplicates, keeps undated ones', () => {
    expect(
      pruneSentKeys(
        ['budget:x:2026-08-01:warn', 'due:r:2026-11-20', 'revenue:2026:warn', 'due:r:2026-11-20'],
        '2026-09-15',
      ),
    ).toEqual(['due:r:2026-11-20', 'revenue:2026:warn']);
  });
});

describe('dailySummaryEmail', () => {
  it('lists the day expenses by scope and category, nothing when there were none', () => {
    const t: Tables = {
      categories: rows('categories', categories),
      transactions: rows('transactions', [
        tx({ date: '2026-11-15', amountCents: 1_250 }),
        tx({ date: '2026-11-15', amountCents: 750 }),
        tx({ date: '2026-11-15', amountCents: 4_900, scope: 'business', categoryId: 'soft' }),
        tx({ date: '2026-11-15', amountCents: 99_999, type: 'income', categoryId: 'inv' }),
        tx({ date: '2026-11-15', amountCents: 99_999, deleted: true }),
        tx({ date: '2026-11-16', amountCents: 99_999 }),
      ]),
    };
    const mail = dailySummaryEmail(t, '2026-11-15')!;
    expect(mail.subject).toBe('Conti: spese del 15/11/2026 — 69,00 €');
    expect(mail.body).toContain('Personali: 20,00 €\n• Spesa alimentare 20,00 €');
    expect(mail.body).toContain('Lavoro: 49,00 €\n• Software 49,00 €');
    expect(dailySummaryEmail(t, '2026-11-14')).toBeNull();
  });
});

describe('checkAlerts / triggers (fake Google services)', () => {
  it('emails once, remembers the keys, and the trigger installers replace old triggers', () => {
    const app = createAppsScript();
    app.setup();
    app.setNow(new Date('2026-11-16T10:00:00Z'));
    const key = app.props.get('SYNC_KEY');
    app.post({
      action: 'push',
      key,
      tables: {
        recurring: {
          columns: Object.keys(toRow('recurring', recurring({}))),
          rows: rows('recurring', [recurring({ id: 'rent' })]),
        },
      },
    });
    app.fn.checkAlerts!();
    app.fn.checkAlerts!();
    expect(app.mails).toHaveLength(1);
    expect(app.mails[0]!.to).toBe('owner@example.com');
    expect(JSON.parse(app.props.get('SENT_ALERTS')!)).toEqual(['due:rent:2026-11-20']);

    app.props.set('ALERT_EMAIL', 'altro@example.com');
    app.setNow(new Date('2026-11-17T08:00:00Z'));
    app.post({
      action: 'push',
      key,
      tables: {
        transactions: {
          columns: Object.keys(toRow('transactions', tx({}))),
          rows: rows('transactions', [tx({ date: '2026-11-16', amountCents: 300 })]),
        },
      },
    });
    app.fn.dailySummary!();
    expect(app.mails[1]).toMatchObject({
      to: 'altro@example.com',
      subject: 'Conti: spese del 16/11/2026 — 3,00 €',
    });

    app.fn.installAlertsTrigger!();
    app.fn.installAlertsTrigger!();
    app.fn.installDailySummaryTrigger!();
    expect(app.triggers).toEqual([
      { handler: 'checkAlerts', spec: 'every 1h' },
      { handler: 'dailySummary', spec: 'every 1d at 8' },
    ]);
    app.fn.removeAllTriggers!();
    expect(app.triggers).toEqual([]);
  });
});
