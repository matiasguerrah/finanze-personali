import { describe, expect, it } from 'vitest';
import { uuidV4 } from './ids';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuidV4 (fallback for non-secure contexts)', () => {
  it('produces RFC 4122 version 4 ids', () => {
    for (let i = 0; i < 100; i++) expect(uuidV4()).toMatch(V4);
  });
  it('sets version and variant bits whatever the random bytes', () => {
    expect(uuidV4((a) => a.fill(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidV4((a) => a.fill(0))).toBe('00000000-0000-4000-8000-000000000000');
  });
  it('does not repeat', () => {
    expect(new Set(Array.from({ length: 1000 }, () => uuidV4())).size).toBe(1000);
  });
});
