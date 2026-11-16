import { describe, expect, it } from 'vitest';
import type { Activity, TaxParams } from '../db/types';
import {
  fiscalProposal,
  paramsForYear,
  proposalForRecurring,
  setupStatus,
  taxYear,
  pendingThresholdAlert,
  thresholdLevel,
  thresholdText,
  validateTaxParams,
  type TaxContext,
  type TaxTx,
} from './tax';

// Test values only: real rates are entered by the user.
let n = 0;
const tx = (over: Partial<TaxTx>): TaxTx => ({
  id: `t${++n}`,
  type: 'income',
  scope: 'business',
  date: '2026-03-10',
  amountCents: 100_000,
  categoryId: 'invoices',
  deleted: false,
  ...over,
});

const activity = (over: Partial<Activity>): Activity => ({
  id: 'A',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  name: 'Consulenza',
  atecoCode: '62.02.00',
  coefficientBp: 7800,
  activeFrom: '2020-01-01',
  sortOrder: 1,
  ...over,
});

const params = (over: Partial<TaxParams>): TaxParams => ({
  id: `p${over.validFromYear ?? 2020}`,
  createdAt: '',
  updatedAt: '',
  deleted: false,
  validFromYear: 2020,
  substituteTaxBp: 500,
  contributionRateBp: 2607,
  fixedContributionCents: 0,
  revenueThresholdCents: 8_500_000,
  ...over,
});

const categories = [
  { id: 'invoices', systemKey: 'invoices' as const },
  { id: 'inps', systemKey: 'inps' as const },
  { id: 'tax', systemKey: 'substituteTax' as const },
  { id: 'software' },
];

const ctx = (over: Partial<TaxContext>): TaxContext => ({
  transactions: [],
  activities: [activity({})],
  params: [params({})],
  categories,
  ...over,
});

describe('paramsForYear', () => {
  const ps = [
    params({ validFromYear: 2024, substituteTaxBp: 1500 }),
    params({ validFromYear: 2026, substituteTaxBp: 500 }),
    params({ validFromYear: 2028, deleted: true }),
  ];
  it('uses the latest validFromYear ≤ year, ignoring deleted rows', () => {
    expect(paramsForYear(ps, 2023)).toBeNull();
    expect(paramsForYear(ps, 2024)?.substituteTaxBp).toBe(1500);
    expect(paramsForYear(ps, 2025)?.substituteTaxBp).toBe(1500);
    expect(paramsForYear(ps, 2026)?.substituteTaxBp).toBe(500);
    expect(paramsForYear(ps, 2030)?.validFromYear).toBe(2026);
  });
});

describe('taxYear', () => {
  it('single activity: taxable, contributions, tax net of INPS paid, set-aside and net', () => {
    const y = taxYear(
      ctx({
        transactions: [
          tx({ activityId: 'A', amountCents: 1_000_000, date: '2026-02-01' }),
          tx({ activityId: 'A', amountCents: 2_000_000, date: '2026-09-15' }),
          tx({ type: 'expense', categoryId: 'inps', amountCents: 200_000, date: '2026-06-30' }),
          tx({ type: 'expense', categoryId: 'tax', amountCents: 90_000, date: '2026-06-30' }),
          tx({ amountCents: 5_000_000, date: '2025-12-31' }), // other year
          tx({ amountCents: 5_000_000, deleted: true }),
          tx({ amountCents: 5_000_000, scope: 'personal' }), // not business
        ],
      }),
      2026,
    );
    expect(y.incomeCents).toBe(3_000_000);
    expect(y.byActivity).toEqual([
      {
        activityId: 'A',
        incomeCents: 3_000_000,
        count: 2,
        coefficientBp: 7800,
        taxableCents: 2_340_000,
        forfaitExpenseCents: 660_000,
      },
    ]);
    expect(y.taxableCents).toBe(2_340_000);
    expect(y.inpsPaidCents).toBe(200_000);
    expect(y.substituteTaxPaidCents).toBe(90_000);
    const e = y.estimate!;
    expect(e.contributionsVariableCents).toBe(610_038); // 2.340.000 × 26,07%
    expect(e.contributionsCents).toBe(610_038);
    expect(e.taxBaseCents).toBe(2_140_000);
    expect(e.taxCents).toBe(107_000);
    expect(e.setAsideCents).toBe(717_038);
    expect(e.setAsideMonthlyCents).toBe(59_753);
    expect(e.netCents).toBe(3_000_000 - 717_038);
    expect(y.unattributed).toEqual([]);
  });

  it('code change mid-year: income goes to the activity active on its date', () => {
    const y = taxYear(
      ctx({
        activities: [
          activity({ id: 'old', coefficientBp: 7800, activeTo: '2026-06-30', sortOrder: 1 }),
          activity({ id: 'new', coefficientBp: 6700, activeFrom: '2026-07-01', sortOrder: 2 }),
        ],
        transactions: [
          tx({ activityId: 'old', amountCents: 1_000_000, date: '2026-03-01' }),
          tx({ activityId: 'new', amountCents: 1_000_000, date: '2026-09-01' }),
          // Still pointing to the closed code after its end date: excluded and reported.
          tx({ id: 'late', activityId: 'old', amountCents: 50_000, date: '2026-07-15' }),
        ],
      }),
      2026,
    );
    expect(y.byActivity.map((l) => [l.activityId, l.taxableCents])).toEqual([
      ['old', 780_000],
      ['new', 670_000],
    ]);
    expect(y.taxableCents).toBe(1_450_000);
    expect(y.incomeCents).toBe(2_050_000); // the threshold still sees every incasso
    expect(y.unattributed).toEqual([
      { id: 'late', date: '2026-07-15', amountCents: 50_000, reason: 'inactive' },
    ]);
    expect(y.unattributedCents).toBe(50_000);
  });

  it('two activities at the same time with different coefficients', () => {
    const y = taxYear(
      ctx({
        activities: [
          activity({ id: 'dev', coefficientBp: 7800, sortOrder: 1 }),
          activity({ id: 'shop', coefficientBp: 4000, sortOrder: 2 }),
        ],
        transactions: [
          tx({ activityId: 'shop', amountCents: 500_000 }),
          tx({ activityId: 'dev', amountCents: 2_000_000 }),
          tx({ amountCents: 30_000 }), // no activity
          tx({ type: 'expense', categoryId: 'software', amountCents: 800_000 }),
          tx({ type: 'expense', categoryId: 'software', amountCents: 99_999, scope: 'personal' }),
        ],
      }),
      2026,
    );
    expect(y.byActivity.map((l) => [l.activityId, l.taxableCents, l.forfaitExpenseCents])).toEqual([
      ['dev', 1_560_000, 440_000],
      ['shop', 200_000, 300_000],
    ]);
    expect(y.taxableCents).toBe(1_760_000);
    expect(y.forfaitExpensesCents).toBe(740_000);
    expect(y.realExpensesCents).toBe(800_000);
    expect(y.realExceedsForfait).toBe(true);
    expect(y.unattributed.map((u) => u.reason)).toEqual(['missing']);
  });

  it('parameter change between years: each year uses its own params, older years unchanged', () => {
    const c = ctx({
      params: [
        params({ validFromYear: 2025, substituteTaxBp: 1500, revenueThresholdCents: 6_500_000 }),
        params({ validFromYear: 2027, substituteTaxBp: 500, revenueThresholdCents: 8_500_000 }),
      ],
      transactions: [
        tx({ activityId: 'A', amountCents: 1_000_000, date: '2026-05-01' }),
        tx({ activityId: 'A', amountCents: 1_000_000, date: '2027-05-01' }),
      ],
    });
    expect(taxYear(c, 2026).estimate!.taxCents).toBe(117_000); // 780.000 × 15%
    expect(taxYear(c, 2026).estimate!.threshold.limitCents).toBe(6_500_000);
    expect(taxYear(c, 2027).estimate!.taxCents).toBe(39_000); // 780.000 × 5%
    expect(taxYear(c, 2024).estimate).toBeNull();
  });

  it('tax is never negative when contributions paid exceed the taxable', () => {
    const y = taxYear(
      ctx({
        transactions: [
          tx({ activityId: 'A', amountCents: 100_000 }),
          tx({ type: 'expense', categoryId: 'inps', amountCents: 500_000 }),
        ],
      }),
      2026,
    );
    expect(y.estimate!.taxBaseCents).toBe(0);
    expect(y.estimate!.taxCents).toBe(0);
  });

  it('adds the fixed contribution quota even with no income', () => {
    const y = taxYear(ctx({ params: [params({ fixedContributionCents: 450_000 })] }), 2026);
    expect(y.estimate!.contributionsCents).toBe(450_000);
    expect(y.estimate!.contributionsVariableCents).toBe(0);
    expect(y.estimate!.netCents).toBe(-450_000);
  });

  it('rounds the taxable once per activity, keeping income = taxable + forfait exactly', () => {
    const y = taxYear(
      ctx({
        transactions: [
          tx({ activityId: 'A', amountCents: 1 }),
          tx({ activityId: 'A', amountCents: 1 }),
          tx({ activityId: 'A', amountCents: 1 }),
        ],
      }),
      2026,
    );
    expect(y.byActivity[0]!.taxableCents).toBe(2); // 3 × 78% = 2,34
    expect(y.byActivity[0]!.forfaitExpenseCents).toBe(1);
  });

  it('places revenue on the threshold bar with 80% / 95% / over levels', () => {
    const at = (cents: number) =>
      taxYear(
        ctx({
          params: [params({ revenueThresholdCents: 1_000_000 })],
          transactions: [tx({ activityId: 'A', amountCents: cents })],
        }),
        2026,
      ).estimate!.threshold;
    expect(at(799_999)).toMatchObject({ usedBp: 8000, level: 'warn' }); // 79,9999% rounds up
    expect(at(700_000)).toMatchObject({ usedBp: 7000, level: 'ok' });
    expect(at(950_000).level).toBe('alert');
    expect(at(1_000_000)).toMatchObject({ usedBp: 10_000, level: 'alert' });
    expect(at(1_000_100).level).toBe('over');
    expect(thresholdLevel(7999)).toBe('ok');
    expect(thresholdText('warn', 8123)).toBe('Attenzione: 81% della soglia, oltre l’80%');
    expect(thresholdText('over', 10_050)).toBe('Soglia superata (100%)');
  });
});

describe('setupStatus', () => {
  it('needs at least one activity and params for the year', () => {
    expect(setupStatus({ activities: [], params: [] }, 2026)).toEqual({
      hasActivities: false,
      hasParams: false,
      complete: false,
    });
    expect(
      setupStatus({ activities: [activity({})], params: [params({ validFromYear: 2027 })] }, 2026)
        .complete,
    ).toBe(false);
    expect(setupStatus({ activities: [activity({})], params: [params({})] }, 2026).complete).toBe(
      true,
    );
  });
});

describe('fiscalProposal (metodo storico)', () => {
  const withAdvances = params({
    validFromYear: 2024,
    taxFirstAdvanceBp: 4000,
    taxSecondAdvanceBp: 6000,
    contributionFirstAdvanceBp: 4000,
    contributionSecondAdvanceBp: 4000,
  });
  const c = ctx({
    params: [withAdvances],
    transactions: [
      tx({ activityId: 'A', amountCents: 1_000_000, date: '2025-04-01' }), // tax 39.000
      tx({ activityId: 'A', amountCents: 2_000_000, date: '2026-04-01' }),
      tx({ type: 'expense', categoryId: 'inps', amountCents: 100_000, date: '2026-06-30' }),
      // 2026: taxable 1.560.000, base 1.460.000 → tax 73.000; contributions 406.692
    ],
  });

  it('June: balance of the previous year + first advance', () => {
    expect(fiscalProposal(c, 'balanceAndFirstAdvance', 'tax', 2027)).toEqual({
      totalCents: 63_200,
      parts: [
        { label: 'Saldo imposta 2026', cents: 34_000 }, // 73.000 − 39.000 × 100%
        { label: '1° acconto imposta 2027', cents: 29_200 }, // 73.000 × 40%
      ],
    });
    // Contributions: advances on the proportional part, 40% + 40%.
    expect(fiscalProposal(c, 'balanceAndFirstAdvance', 'contributions', 2027)).toEqual({
      totalCents: 406_692,
      parts: [
        { label: 'Saldo contributi 2026', cents: 406_692 - 162_677 },
        { label: '1° acconto contributi 2027', cents: 162_677 },
      ],
    });
  });

  it('November: second advance on the previous year', () => {
    expect(fiscalProposal(c, 'secondAdvance', 'tax', 2027)?.totalCents).toBe(43_800);
    expect(fiscalProposal(c, 'secondAdvance', 'contributions', 2027)?.totalCents).toBe(162_677);
  });

  it('first year of activity: no advances were due, so the balance is the whole amount', () => {
    expect(fiscalProposal(c, 'balanceAndFirstAdvance', 'tax', 2026)?.parts).toEqual([
      { label: 'Saldo imposta 2025', cents: 39_000 },
      { label: '1° acconto imposta 2026', cents: 15_600 },
    ]);
  });

  it('never proposes a negative amount (advances paid exceed the year)', () => {
    const low = ctx({
      params: [withAdvances],
      transactions: [
        tx({ activityId: 'A', amountCents: 1_000_000, date: '2025-04-01' }),
        tx({ activityId: 'A', amountCents: 100_000, date: '2026-04-01' }),
      ],
    });
    const p = fiscalProposal(low, 'balanceAndFirstAdvance', 'tax', 2027)!;
    expect(p.parts[0]!.cents).toBe(3_900 - 39_000);
    expect(p.totalCents).toBe(0);
  });

  it('returns null without advance percentages or without an estimate for the previous year', () => {
    expect(fiscalProposal(ctx({}), 'secondAdvance', 'tax', 2027)).toBeNull();
    expect(
      fiscalProposal(
        ctx({ params: [{ ...withAdvances, validFromYear: 2027 }] }),
        'secondAdvance',
        'tax',
        2027,
      ),
    ).toBeNull();
  });

  it('maps a fiscal recurrence to tax or contributions by its category', () => {
    const due = '2027-11-30';
    expect(
      proposalForRecurring(c, { taxKind: 'secondAdvance', categoryId: 'tax', nextDueDate: due })
        ?.totalCents,
    ).toBe(43_800);
    expect(
      proposalForRecurring(c, { taxKind: 'secondAdvance', categoryId: 'inps', nextDueDate: due })
        ?.totalCents,
    ).toBe(162_677);
    expect(proposalForRecurring(c, { categoryId: 'tax', nextDueDate: due })).toBeNull();
    expect(
      proposalForRecurring(c, {
        taxKind: 'secondAdvance',
        categoryId: 'software',
        nextDueDate: due,
      }),
    ).toBeNull();
  });
});

describe('validateTaxParams', () => {
  const ok = {
    validFromYear: 2026,
    substituteTaxBp: 500,
    contributionRateBp: 2607,
    fixedContributionCents: 0,
    revenueThresholdCents: 8_500_000,
  };
  it('accepts valid params and rejects bad values and duplicate years', () => {
    expect(validateTaxParams(ok, [])).toEqual([]);
    expect(validateTaxParams(ok, [{ validFromYear: 2026, deleted: true }])).toEqual([]);
    expect(validateTaxParams(ok, [{ validFromYear: 2026, deleted: false }])).toHaveLength(1);
    expect(
      validateTaxParams(
        {
          ...ok,
          validFromYear: 1999,
          substituteTaxBp: 10_001,
          contributionRateBp: -1,
          fixedContributionCents: -1,
          revenueThresholdCents: 0,
          taxFirstAdvanceBp: 20_000,
        },
        [],
      ),
    ).toHaveLength(6);
  });
});

describe('pendingThresholdAlert', () => {
  it('announces each level once per year, skipping lower levels already passed', () => {
    expect(pendingThresholdAlert(2026, 'ok', new Set())).toBeNull();
    expect(pendingThresholdAlert(2026, 'warn', new Set())).toEqual(['revenue:2026:warn']);
    expect(pendingThresholdAlert(2026, 'warn', new Set(['revenue:2026:warn']))).toBeNull();
    expect(pendingThresholdAlert(2026, 'alert', new Set(['revenue:2026:warn']))).toEqual([
      'revenue:2026:warn',
      'revenue:2026:alert',
    ]);
    expect(pendingThresholdAlert(2027, 'warn', new Set(['revenue:2026:warn']))).toEqual([
      'revenue:2027:warn',
    ]);
  });
});
