import { describe, expect, it } from 'vitest';
import { SYNCED_TABLES, type Account, type Transaction } from '../db/types';
import { defaultAccounts, defaultCategories } from '../db/seed';
import {
  BackupError,
  backupFileName,
  makeBackup,
  parseBackup,
  planRestore,
  type BackupTables,
} from './backup';

const empty = (): BackupTables =>
  Object.fromEntries(SYNCED_TABLES.map((t) => [t, []])) as unknown as BackupTables;

const tx: Transaction = {
  id: 't1',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deleted: false,
  date: '2026-11-01',
  type: 'expense',
  amountCents: 1234,
  scope: 'personal',
  categoryId: 'c',
  accountId: 'a',
  note: 'caffè; "doppio"',
  tags: ['bar', 'mattina'],
};

describe('backup round trip', () => {
  it('every table survives JSON → parse unchanged', () => {
    const tables = empty();
    tables.transactions = [tx];
    tables.categories = defaultCategories();
    tables.accounts = defaultAccounts();
    const text = JSON.stringify(makeBackup(tables, '2026-11-16T08:00:00.000Z'));
    const parsed = parseBackup(text);
    expect(parsed.exportedAt).toBe('2026-11-16T08:00:00.000Z');
    expect(parsed.tables.transactions).toEqual([tx]);
    expect(parsed.tables.categories).toEqual(defaultCategories());
    expect(parsed.tables.accounts).toEqual(defaultAccounts());
    expect(parsed.tables.debts).toEqual([]);
  });

  it('accepts a UTF-8 BOM', () => {
    const text = '\uFEFF' + JSON.stringify(makeBackup(empty(), '2026-11-16T08:00:00.000Z'));
    expect(parseBackup(text).tables.transactions).toEqual([]);
  });
});

describe('parseBackup rejects bad files with a clear message', () => {
  const bad = (text: string) => {
    try {
      parseBackup(text);
    } catch (e) {
      expect(e).toBeInstanceOf(BackupError);
      return (e as Error).message;
    }
    throw new Error('expected a BackupError');
  };
  it('not JSON / not ours / future format / no tables', () => {
    expect(bad('{oops')).toBe('Il file non è un JSON valido.');
    expect(bad('{"hello":1}')).toBe('Il file non è un backup di Conti.');
    expect(bad('{"app":"conti","format":2,"tables":{}}')).toMatch(/Formato di backup 2/);
    expect(bad('{"app":"conti","format":1}')).toBe('Il backup non contiene dati.');
  });
  it('a broken cell names table and column', () => {
    const f = makeBackup({ ...empty(), transactions: [tx] }, '2026-11-16T08:00:00.000Z');
    f.tables.transactions![0]!.amountCents = '12,34';
    expect(bad(JSON.stringify(f))).toBe(
      'Dati non validi nel backup: transactions.amountCents: «12,34» non è un intero.',
    );
  });
  it('ignores unknown tables from a newer app', () => {
    const f = { ...makeBackup(empty(), 'x'), tables: { futureTable: [{ id: 1 }] } };
    expect(parseBackup(JSON.stringify(f)).tables).toEqual({});
  });
});

describe('planRestore', () => {
  const acc = (id: string, updatedAt: string) =>
    ({ ...defaultAccounts()[0]!, id, updatedAt }) as Account;

  it('adds missing, updates older, keeps newer local versions', () => {
    const backup = parseBackup(
      JSON.stringify(
        makeBackup(
          {
            ...empty(),
            accounts: [
              acc('new', '2026-01-01T00:00:00.000Z'),
              acc('older-locally', '2026-05-01T00:00:00.000Z'),
              acc('newer-locally', '2026-05-01T00:00:00.000Z'),
              acc('same', '2026-05-01T00:00:00.000Z'),
            ],
          },
          'x',
        ),
      ),
    );
    const plan = planRestore(backup, {
      accounts: new Map([
        ['older-locally', '2026-04-01T00:00:00.000Z'],
        ['newer-locally', '2026-06-01T00:00:00.000Z'],
        ['same', '2026-05-01T00:00:00.000Z'],
        ['only-local', '2026-01-01T00:00:00.000Z'],
      ]),
    });
    expect(plan).toMatchObject({ added: 1, updated: 1, unchanged: 2 });
    expect(plan.writes.accounts!.map((a) => a.id)).toEqual(['new', 'older-locally']);
    expect(plan.writes.transactions).toBeUndefined();
  });
});

it('backupFileName', () => {
  expect(backupFileName('2026-11-16T08:00:00.000Z')).toBe('conti-backup-2026-11-16.json');
});
