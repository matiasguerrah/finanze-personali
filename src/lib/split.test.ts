import { describe, expect, it } from 'vitest';
import { splitByAmount, splitByPercent } from './split';

describe('split', () => {
  it('by amount keeps the total exact', () => {
    expect(splitByAmount(3999, 1500)).toEqual({ personalCents: 2499, businessCents: 1500 });
  });

  it('by percent rounds the business part and gives the rest to personal', () => {
    expect(splitByPercent(3999, 5000)).toEqual({ personalCents: 1999, businessCents: 2000 });
    expect(splitByPercent(1, 5000)).toBeNull(); // would leave personal at 0
    const r = splitByPercent(2999, 3333)!;
    expect(r.personalCents + r.businessCents).toBe(2999);
  });

  it('rejects empty or full splits', () => {
    expect(splitByAmount(1000, 0)).toBeNull();
    expect(splitByAmount(1000, 1000)).toBeNull();
    expect(splitByPercent(1000, 0)).toBeNull();
    expect(splitByPercent(1000, 10000)).toBeNull();
  });
});
