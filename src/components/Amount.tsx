import { formatCents } from '../lib/money';
import type { TxType } from '../db/types';

interface Props {
  cents: number;
  /** When given, expenses show "−" and income is coloured. */
  type?: TxType;
  className?: string;
}

export function Amount({ cents, type, className = '' }: Props) {
  const text =
    type === 'expense'
      ? `−${formatCents(cents)}`
      : type === 'income'
        ? `+${formatCents(cents)}`
        : formatCents(cents);
  const color = type === 'income' ? 'text-income' : '';
  return <span className={`tabular-nums ${color} ${className}`}>{text}</span>;
}
