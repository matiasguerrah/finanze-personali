import { describe, expect, it } from 'vitest';
import {
  applyBp,
  centsToInput,
  divRound,
  formatCents,
  parseAmountToCents,
  percentInputToBp,
  roundHalfAwayFromZero,
} from './money';

describe('parseAmountToCents', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,01', 1],
    ['0,1', 10],
    ['1.234,56', 123456],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['€ 3', 300],
    [' 7 ', 700],
    ['12,', 1200],
    ['0', 0],
  ])('%s → %i', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,234', '-5', '1,2,3', '12.345,678', '1e3'])('rejects %s', (input) => {
    expect(parseAmountToCents(input)).toBeNull();
  });

  it('never uses float arithmetic (classic 0.1 + 0.2 trap)', () => {
    expect(parseAmountToCents('0,29')).toBe(29);
    expect(parseAmountToCents('1,005'.slice(0, 4))).toBe(100);
    expect(parseAmountToCents('4,35')).toBe(435);
  });
});

describe('divRound / applyBp', () => {
  it('rounds half away from zero exactly', () => {
    expect(divRound(5, 10)).toBe(1);
    expect(divRound(4, 10)).toBe(0);
    expect(divRound(-5, 10)).toBe(-1);
    expect(divRound(-4, 10)).toBe(0);
    expect(Object.is(divRound(0, -3), 0)).toBe(true);
  });

  it('applies basis points to cents', () => {
    expect(applyBp(10000, 6700)).toBe(6700); // 67% of €100
    expect(applyBp(333, 5000)).toBe(167); // 166.5 → 167
    expect(applyBp(1, 5000)).toBe(1); // 0.5 → 1
    expect(applyBp(1, 4999)).toBe(0);
    expect(applyBp(123456789, 2607)).toBe(32185185); // 3218518.5... big amount
    expect(applyBp(-333, 5000)).toBe(-167);
  });

  it('rejects non-integers', () => {
    expect(() => applyBp(1.5, 100)).toThrow();
    expect(() => applyBp(100, 0.5)).toThrow();
  });
});

describe('roundHalfAwayFromZero', () => {
  it('absorbs float noise', () => {
    expect(roundHalfAwayFromZero(1.005 * 100)).toBe(101);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
  });
});

describe('formatting', () => {
  it('formats it-IT EUR', () => {
    // Intl uses a non-breaking space before €.
    expect(formatCents(123456).replace(/\s/g, ' ')).toBe('1.234,56 €');
    expect(formatCents(-5).replace(/\s/g, ' ')).toBe('-0,05 €');
  });

  it('round-trips input strings', () => {
    expect(centsToInput(123450)).toBe('1234,50');
    expect(centsToInput(1200)).toBe('12');
    expect(centsToInput(7)).toBe('0,07');
    expect(parseAmountToCents(centsToInput(98765))).toBe(98765);
  });

  it('parses percentages into bp', () => {
    expect(percentInputToBp('67')).toBe(6700);
    expect(percentInputToBp('26,23%')).toBe(2623);
    expect(percentInputToBp('4,5')).toBe(450);
  });
});
