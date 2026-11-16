import { describe, expect, it } from 'vitest';
import {
  amortizationSchedule,
  installmentFor,
  MAX_INSTALLMENTS,
  monthlyInterest,
  termsErrors,
  type LoanTerms,
} from './amortization';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('installmentFor', () => {
  it('matches the textbook French installment', () => {
    // 10.000 € at 5% over 12 months → 856,07 €.
    expect(installmentFor(1_000_000, 500, 12)).toBe(85_607);
    // 150.000 € mortgage at 3% over 25 years → 711,32 €.
    expect(installmentFor(15_000_000, 300, 300)).toBe(71_132);
  });
  it('is linear with a 0 rate', () => {
    expect(installmentFor(120_000, 0, 12)).toBe(10_000);
    expect(installmentFor(100_000, 0, 3)).toBe(33_333);
  });
});

describe('monthlyInterest', () => {
  it('rounds to the nearest cent, half away from zero', () => {
    expect(monthlyInterest(1_000_000, 500)).toBe(4_167); // 41,6666…
    expect(monthlyInterest(120_000, 50)).toBe(50); // exactly 0,50
    expect(monthlyInterest(30_000, 50)).toBe(13); // 12,5 → 13
  });
});

describe('amortizationSchedule', () => {
  const loan: LoanTerms = {
    principalCents: 1_000_000,
    annualRateBp: 500,
    installmentCents: 85_607,
    firstDate: '2026-01-31',
    installments: 12,
  };

  it('repays exactly the principal; the last row closes the residual', () => {
    const s = amortizationSchedule(loan);
    expect(s).toHaveLength(12);
    expect(sum(s.map((r) => r.principalCents))).toBe(1_000_000);
    expect(s.at(-1)!.balanceCents).toBe(0);
    expect(s.slice(0, -1).every((r) => r.paymentCents === 85_607)).toBe(true);
    expect(Math.abs(s.at(-1)!.paymentCents - 85_607)).toBeLessThanOrEqual(12);
    for (const r of s) expect(r.paymentCents).toBe(r.principalCents + r.interestCents);
    expect(s[0]).toMatchObject({
      interestCents: 4_167,
      principalCents: 81_440,
      balanceCents: 918_560,
    });
    // Rounded row by row: 1 cent less than the 272,90 € of a float calculation.
    expect(sum(s.map((r) => r.interestCents))).toBe(27_289);
  });

  it('keeps the day of the first installment after short months', () => {
    const s = amortizationSchedule(loan);
    expect(s.slice(0, 4).map((r) => r.date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('derives the number of installments from the installment', () => {
    const { installments: _, ...noN } = loan;
    const s = amortizationSchedule(noN);
    // The bank's rounded installment leaves a few cents: absorbed by the 12th row, no 13th row.
    expect(s).toHaveLength(12);
    expect(s.at(-1)!.balanceCents).toBe(0);
    expect(s.at(-1)!.paymentCents - 85_607).toBeLessThanOrEqual(12);
    // A bigger installment ends earlier with a smaller final row.
    const fast = amortizationSchedule({ ...noN, installmentCents: 200_000 });
    expect(fast).toHaveLength(6);
    expect(fast.at(-1)!.paymentCents).toBeLessThan(200_000);
    expect(sum(fast.map((r) => r.principalCents))).toBe(1_000_000);
  });

  it('is linear at 0%, with the remainder on the last installment', () => {
    const s = amortizationSchedule({
      principalCents: 100_000,
      annualRateBp: 0,
      installmentCents: 33_333,
      firstDate: '2026-05-10',
      installments: 3,
    });
    expect(s.map((r) => r.paymentCents)).toEqual([33_333, 33_333, 33_334]);
    expect(s.every((r) => r.interestCents === 0)).toBe(true);
    // Without n: 30.000 € at 0% paying 7.000 € → 4 × 7.000 + 2.000.
    const d = amortizationSchedule({
      principalCents: 3_000_000,
      annualRateBp: 0,
      installmentCents: 700_000,
      firstDate: '2026-05-10',
    });
    expect(d.map((r) => r.paymentCents)).toEqual([700_000, 700_000, 700_000, 700_000, 200_000]);
  });

  it('a single installment pays everything', () => {
    const s = amortizationSchedule({ ...loan, installments: 1, installmentCents: 1_004_167 });
    expect(s).toEqual([
      {
        n: 1,
        date: '2026-01-31',
        paymentCents: 1_004_167,
        interestCents: 4_167,
        principalCents: 1_000_000,
        balanceCents: 0,
      },
    ]);
  });
});

describe('termsErrors', () => {
  const base = { principalCents: 1_000_000, annualRateBp: 500, installmentCents: 85_607 };
  it('accepts valid terms', () => {
    expect(termsErrors(base)).toEqual([]);
    expect(termsErrors({ ...base, installments: 12 })).toEqual([]);
  });
  it('reports bad fields', () => {
    expect(termsErrors({ principalCents: 0, annualRateBp: -1, installmentCents: 0 })).toEqual([
      'principal',
      'rate',
      'installment',
    ]);
    expect(termsErrors({ ...base, installments: 0 })).toEqual(['installments']);
    expect(termsErrors({ ...base, installments: 2.5 })).toEqual(['installments']);
  });
  it('rejects an installment that does not cover the interest', () => {
    expect(termsErrors({ ...base, installmentCents: 4_167 })).toEqual(['tooShort']);
    expect(termsErrors({ ...base, installmentCents: 4_167, installments: 12 })).toEqual([
      'tooShort',
    ]);
    expect(() =>
      amortizationSchedule({ ...base, installmentCents: 4_167, firstDate: '2026-01-01' }),
    ).toThrow();
  });
  it('rejects plans longer than 100 years', () => {
    expect(termsErrors({ ...base, installmentCents: 4_168 })).toEqual(['tooLong']);
    expect(termsErrors({ ...base, installments: MAX_INSTALLMENTS + 1 })).toEqual(['installments']);
  });
});
