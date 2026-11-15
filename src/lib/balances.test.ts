import { describe, expect, it } from 'vitest';
import { accountBalances, totalBalance, validateAccount } from './balances';

const accounts = [
  { id: 'bank', initialBalanceCents: 100000, deleted: false },
  { id: 'cash', initialBalanceCents: 5000, deleted: false },
  { id: 'gone', initialBalanceCents: 999, deleted: true },
];
const tx = (
  type: 'expense' | 'income' | 'transfer',
  amountCents: number,
  accountId: string,
  extra: { toAccountId?: string; date?: string; deleted?: boolean } = {},
) => ({ type, amountCents, accountId, date: '2026-11-10', deleted: false, ...extra });

describe('accountBalances', () => {
  it('applies income, expenses and transfers', () => {
    const b = accountBalances(accounts, [
      tx('income', 20000, 'bank'),
      tx('expense', 450, 'cash'),
      tx('transfer', 10000, 'bank', { toAccountId: 'cash' }),
    ]);
    expect(b.get('bank')).toBe(100000 + 20000 - 10000);
    expect(b.get('cash')).toBe(5000 - 450 + 10000);
    expect(b.has('gone')).toBe(false);
  });

  it('transfers do not change the total', () => {
    const b = accountBalances(accounts, [tx('transfer', 3333, 'bank', { toAccountId: 'cash' })]);
    expect(totalBalance(b)).toBe(105000);
    expect(totalBalance(b, ['cash'])).toBe(8333);
  });

  it('ignores deleted and future transactions', () => {
    const b = accountBalances(
      accounts,
      [
        tx('expense', 100, 'bank', { deleted: true }),
        tx('expense', 200, 'bank', { date: '2026-12-01' }),
        tx('expense', 300, 'bank', { date: '2026-11-15' }),
      ],
      '2026-11-15',
    );
    expect(b.get('bank')).toBe(100000 - 300);
  });

  it('ignores transactions on unknown or deleted accounts', () => {
    const b = accountBalances(accounts, [
      tx('expense', 100, 'gone'),
      tx('transfer', 500, 'bank', { toAccountId: 'gone' }),
    ]);
    expect(b.get('bank')).toBe(99500);
    expect(totalBalance(b)).toBe(104500);
  });
});

describe('validateAccount', () => {
  it('requires a name', () => {
    expect(validateAccount({ name: ' ', initialBalanceCents: 0 })).toHaveLength(1);
    expect(validateAccount({ name: 'Carta', initialBalanceCents: -1500 })).toEqual([]);
  });
});
