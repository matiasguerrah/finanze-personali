import { describe, expect, it } from 'vitest';
import { applyKey } from './keypad';
import { parseAmountToCents } from './money';

const type = (keys: string[]) => keys.reduce(applyKey, '');

describe('applyKey', () => {
  it('builds amounts', () => {
    expect(type(['4', ',', '5'])).toBe('4,5');
    expect(parseAmountToCents(type(['4', ',', '5']))).toBe(450);
    expect(type([',', '9', '9'])).toBe('0,99');
  });
  it('limits decimals and leading zeros', () => {
    expect(type(['1', ',', '2', '3', '4'])).toBe('1,23');
    expect(type(['0', '0', '7'])).toBe('7');
    expect(type(['1', ',', ','])).toBe('1,');
  });
  it('handles backspace', () => {
    expect(type(['1', '2', 'back'])).toBe('1');
    expect(type(['back'])).toBe('');
  });
});
