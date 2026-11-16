import { describe, expect, it } from 'vitest';
import type { Debt, Transaction } from '../db/types';
import {
  debtPayments,
  debtStatus,
  noticeDueText,
  tryDebtStatus,
  validateDebt,
  validateNotice,
} from './debts';

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1',
  createdAt: '',
  updatedAt: '',
  deleted: false,
  name: 'Auto',
  state: 'installments',
  creditor: 'Banca',
  principalCents: 1_000_000,
  annualRateBp: 500,
  installmentCents: 85_607,
  startDate: '2026-01-15',
  plannedInstallments: 12,
  notes: '',
  ...over,
});
const pay = (amountCents: number, date: string, createdAt = `${date}T10:00:00.000Z`) => ({
  amountCents,
  date,
  createdAt,
});
const monthly = (n: number, amount = 85_607) =>
  Array.from({ length: n }, (_, i) => pay(amount, `2026-${String(i + 1).padStart(2, '0')}-15`));

describe('debtStatus', () => {
  it('nothing paid yet', () => {
    const s = debtStatus(debt(), [], '2026-01-10');
    expect(s).toMatchObject({
      paidCents: 0,
      installmentsPaid: 0,
      installmentsTotal: 12,
      installmentsLate: 0,
      principalRemainingCents: 1_000_000,
      paidBp: 0,
      paidOff: false,
      payoffDate: '2026-12-15',
      next: { n: 1, date: '2026-01-15', amountCents: 85_607 },
    });
    expect(s.remainingCents).toBe(s.totalCents);
    expect(s.totalCents).toBe(1_000_000 + s.interestTotalCents);
  });

  it('on schedule after 3 payments', () => {
    const s = debtStatus(debt(), monthly(3), '2026-03-20');
    expect(s.installmentsPaid).toBe(3);
    expect(s.installmentsLate).toBe(0);
    expect(s.principalRemainingCents).toBe(s.schedule[2]!.balanceCents);
    expect(s.remainingCents).toBe(s.totalCents - 3 * 85_607);
    expect(s.paidBp).toBe(Math.floor((3 * 85_607 * 10_000) / s.totalCents));
    expect(s.payoffDate).toBe('2026-12-15');
    expect(s.next).toEqual({ n: 4, date: '2026-04-15', amountCents: 85_607 });
  });

  it('late payments push the estimated payoff date', () => {
    const s = debtStatus(debt(), monthly(1), '2026-03-20');
    expect(s.installmentsLate).toBe(2);
    expect(s.payoffDate).toBe('2027-02-15');
  });

  it('paying ahead brings it earlier', () => {
    const s = debtStatus(debt(), [pay(4 * 85_607, '2026-01-15')], '2026-01-20');
    expect(s.installmentsPaid).toBe(4);
    expect(s.payoffDate).toBe('2026-09-15');
  });

  it('a partial payment leaves the rest of the installment to pay', () => {
    const s = debtStatus(debt(), [pay(50_000, '2026-01-15')], '2026-01-20');
    expect(s.installmentsPaid).toBe(0);
    expect(s.installmentsLate).toBe(1);
    expect(s.next).toEqual({ n: 1, date: '2026-01-15', amountCents: 35_607 });
  });

  it('tolerates a bank installment rounded 1 cent lower', () => {
    const s = debtStatus(debt(), monthly(6, 85_606), '2026-06-20');
    expect(s.installmentsPaid).toBe(6);
  });

  it('paid off: 100%, nothing left, date of the last payment', () => {
    const s0 = debtStatus(debt(), [], '2026-01-01');
    const last = s0.schedule.at(-1)!.paymentCents;
    const s = debtStatus(debt(), [...monthly(11), pay(last, '2026-12-10')], '2027-01-01');
    expect(s).toMatchObject({
      paidOff: true,
      remainingCents: 0,
      paidBp: 10_000,
      installmentsPaid: 12,
      installmentsLate: 0,
      principalRemainingCents: 0,
      payoffDate: '2026-12-10',
    });
    expect(s.next).toBeUndefined();
  });

  it('overpaying never shows negative numbers', () => {
    const s = debtStatus(debt(), [pay(2_000_000, '2026-01-15')], '2026-01-20');
    expect(s.remainingCents).toBe(0);
    expect(s.paidBp).toBe(10_000);
    expect(s.paidOff).toBe(true);
  });

  it('interest-free debt is linear', () => {
    const d = debt({
      annualRateBp: 0,
      principalCents: 120_000,
      installmentCents: 10_000,
      plannedInstallments: undefined,
    });
    const s = debtStatus(d, monthly(3, 10_000), '2026-03-20');
    expect(s.installmentsTotal).toBe(12);
    expect(s.interestTotalCents).toBe(0);
    expect(s.remainingCents).toBe(90_000);
    expect(s.principalRemainingCents).toBe(90_000);
    expect(s.paidBp).toBe(2_500);
  });
});

describe('debtPayments', () => {
  it('only non-deleted expenses linked to the debt', () => {
    const t = (over: Partial<Transaction>) =>
      ({ debtId: 'd1', type: 'expense', deleted: false, ...over }) as Transaction;
    const txs = [
      t({ id: 'a' }),
      t({ id: 'b', deleted: true }),
      t({ id: 'c', debtId: 'x' }),
      t({ id: 'd', type: 'income' }),
    ];
    expect(debtPayments('d1', txs).map((x) => x.id)).toEqual(['a']);
  });
});

describe('validateDebt', () => {
  it('collects field and plan errors in Italian', () => {
    expect(
      validateDebt({
        name: ' ',
        startDate: '',
        principalCents: 1_000_000,
        annualRateBp: 500,
        installmentCents: 100,
      }),
    ).toEqual([
      'Il nome è obbligatorio.',
      'Inserisci la data della prima rata.',
      'La rata non copre nemmeno gli interessi del primo mese.',
    ]);
  });
});

describe('notice (avviso)', () => {
  const notice = (over: Partial<Debt> = {}) =>
    debt({
      state: 'notice',
      noticeAmountCents: 123_456,
      noticeDueDate: '2026-12-15',
      // Plan fields are ignored for a notice.
      principalCents: 0,
      installmentCents: 0,
      plannedInstallments: undefined,
      ...over,
    });

  it('before the due date: everything to pay, due date as end', () => {
    const s = debtStatus(notice(), [], '2026-11-16');
    expect(s).toMatchObject({
      totalCents: 123_456,
      remainingCents: 123_456,
      interestTotalCents: 0,
      installmentsTotal: 1,
      installmentsLate: 0,
      payoffDate: '2026-12-15',
      paidOff: false,
      next: { n: 1, date: '2026-12-15', amountCents: 123_456 },
    });
  });

  it('partial payment, then overdue: still the due date, not shifted', () => {
    const s = debtStatus(notice(), [pay(23_456, '2026-12-01')], '2026-12-20');
    expect(s).toMatchObject({
      remainingCents: 100_000,
      installmentsLate: 1,
      payoffDate: '2026-12-15',
      next: { amountCents: 100_000 },
    });
  });

  it('paid off on the payment date', () => {
    const s = debtStatus(notice(), [pay(123_456, '2026-12-10')], '2026-12-20');
    expect(s).toMatchObject({ paidOff: true, remainingCents: 0, payoffDate: '2026-12-10' });
  });

  it('validation', () => {
    expect(
      validateNotice({ name: 'Avviso 2024', noticeAmountCents: 1, noticeDueDate: '2026-12-15' }),
    ).toEqual([]);
    expect(validateNotice({ name: '', noticeAmountCents: 0 })).toEqual([
      'Il nome è obbligatorio.',
      "Inserisci l'importo dell'avviso.",
      'Inserisci la scadenza.',
    ]);
  });
});

describe('tryDebtStatus', () => {
  it('returns null instead of throwing on broken stored terms', () => {
    expect(tryDebtStatus(debt({ installmentCents: 0 }), [], '2026-01-01')).toBeNull();
    expect(tryDebtStatus(debt({ state: 'notice' }), [], '2026-01-01')).toBeNull();
    expect(tryDebtStatus(debt(), [], '2026-01-01')).not.toBeNull();
  });
});

describe('noticeDueText', () => {
  it('counts calendar days in both directions', () => {
    expect(noticeDueText('2026-12-15', '2026-12-15')).toBe('scade oggi');
    expect(noticeDueText('2026-12-16', '2026-12-15')).toBe('scade domani');
    expect(noticeDueText('2027-01-14', '2026-12-15')).toBe('scade tra 30 giorni');
    expect(noticeDueText('2026-12-14', '2026-12-15')).toBe('scaduto da 1 giorno');
    expect(noticeDueText('2026-03-01', '2026-03-31')).toBe('scaduto da 30 giorni');
  });
});

describe('notice rateizzato', () => {
  it('payments recorded before the rateizzazione paid the notice, not the plan', () => {
    const d = debt({
      noticeAmountCents: 123_456,
      noticeDueDate: '2026-12-15',
      rateizedAt: '2026-11-20T15:00:00.000Z',
      principalCents: 100_000,
      annualRateBp: 0,
      installmentCents: 10_000,
      plannedInstallments: 10,
      startDate: '2026-12-16',
    });
    const s = debtStatus(
      d,
      [
        pay(23_456, '2026-11-10'),
        // Same day as the rateizzazione, recorded before it: still the notice.
        pay(1_000, '2026-11-20', '2026-11-20T14:59:00.000Z'),
        pay(10_000, '2026-12-16'),
        pay(10_000, '2027-01-16'),
      ],
      '2027-01-20',
    );
    expect(s).toMatchObject({
      paidBeforePlanCents: 24_456,
      paidCents: 20_000,
      installmentsPaid: 2,
      remainingCents: 80_000,
      installmentsLate: 0,
    });
  });
});
