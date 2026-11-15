/** Unit tests of apps-script/Code.gs (run in a VM with fake Google services). */
import { describe, expect, it } from 'vitest';
import { createAppsScript } from '../../test/appsScriptHarness';

const gs = createAppsScript();
type Values = string[][];
const applyPush = gs.fn.applyPush as (
  v: Values,
  c: string[],
  r: Record<string, string>[],
  s: string,
) => { values: Values; written: number; conflicts: Record<string, string>[] };
const rowsChangedSince = gs.fn.rowsChangedSince as (
  v: Values,
  s: string,
) => Record<string, string>[];

describe('nextStampAfter', () => {
  const next = gs.fn.nextStampAfter as (last: string, now: Date) => string;
  it('is strictly increasing even within the same millisecond or with a clock going back', () => {
    const now = new Date('2026-11-15T10:00:00.000Z');
    expect(next('', now)).toBe('2026-11-15T10:00:00.000Z');
    expect(next('2026-11-15T10:00:00.000Z', now)).toBe('2026-11-15T10:00:00.001Z');
    expect(next('2026-11-15T11:00:00.000Z', now)).toBe('2026-11-15T11:00:00.001Z');
  });
});

describe('cells', () => {
  it('normalises hand-edited values and protects formulas', () => {
    const toStr = gs.fn.cellToString as (v: unknown) => string;
    expect(toStr(true)).toBe('TRUE');
    expect(toStr(1500)).toBe('1500');
    expect(toStr("'=x")).toBe('=x');
    expect((gs.fn.protectCell as (v: string) => string)('=SUM(A1)')).toBe("'=SUM(A1)");
  });
});

describe('applyPush', () => {
  const cols = ['id', 'updatedAt', 'name'];
  it('creates the header and appends new rows', () => {
    const r = applyPush([], cols, [{ id: 'a', updatedAt: '2026-01-01', name: 'A' }], 'S1');
    expect(r.values).toEqual([
      ['id', 'updatedAt', 'name', '_serverUpdatedAt'],
      ['a', '2026-01-01', 'A', 'S1'],
    ]);
    expect(r.written).toBe(1);
  });

  it('last write wins on updatedAt; older pushes come back as conflicts', () => {
    const start = applyPush([], cols, [{ id: 'a', updatedAt: '2026-01-02', name: 'new' }], 'S1');
    const older = applyPush(
      start.values,
      cols,
      [{ id: 'a', updatedAt: '2026-01-01', name: 'old' }],
      'S2',
    );
    expect(older.written).toBe(0);
    expect(older.conflicts).toEqual([
      { id: 'a', updatedAt: '2026-01-02', name: 'new', _serverUpdatedAt: 'S1' },
    ]);
    const newer = applyPush(
      start.values,
      cols,
      [{ id: 'a', updatedAt: '2026-01-03', name: 'x' }],
      'S2',
    );
    expect(newer.values[1]).toEqual(['a', '2026-01-03', 'x', 'S2']);
  });

  it('adds columns sent by a newer app version and keeps old data', () => {
    const v1 = applyPush([], cols, [{ id: 'a', updatedAt: '1', name: 'A' }], 'S1');
    const v2 = applyPush(
      v1.values,
      [...cols, 'extra'],
      [{ id: 'b', updatedAt: '1', name: 'B', extra: 'e' }],
      'S2',
    );
    expect(v2.values[0]).toEqual(['id', 'updatedAt', 'name', '_serverUpdatedAt', 'extra']);
    expect(v2.values[1]).toEqual(['a', '1', 'A', 'S1', '']);
    expect(v2.values[2]).toEqual(['b', '1', 'B', 'S2', 'e']);
  });
});

describe('rowsChangedSince', () => {
  it('returns rows stamped after `since`, all when empty', () => {
    const v: Values = [
      ['id', '_serverUpdatedAt'],
      ['a', '2026-01-01T00:00:00.000Z'],
      ['b', '2026-01-02T00:00:00.000Z'],
      ['', ''],
    ];
    expect(rowsChangedSince(v, '').map((r) => r.id)).toEqual(['a', 'b']);
    expect(rowsChangedSince(v, '2026-01-01T00:00:00.000Z').map((r) => r.id)).toEqual(['b']);
  });
});

describe('doPost', () => {
  it('rejects requests before setup and with a wrong key', () => {
    const fresh = createAppsScript();
    expect(fresh.post({ action: 'ping', key: 'x' })).toEqual({ ok: false, error: 'not_setup' });
    fresh.setup();
    expect(fresh.post({ action: 'ping', key: 'x' })).toEqual({ ok: false, error: 'unauthorized' });
  });
  it('setup creates every tab and a long random key', () => {
    const fresh = createAppsScript();
    const key = fresh.setup();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect([...fresh.sheets.keys()]).toContain('profile');
    expect(fresh.post({ action: 'ping', key })).toEqual({ ok: true, serverTime: '' });
  });
});
