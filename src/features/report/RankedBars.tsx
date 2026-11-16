import type { ReactNode } from 'react';
import { formatCents } from '../../lib/money';

export interface RankedRow {
  key: string;
  label: string;
  icon?: ReactNode;
  cents: number;
  /** Shown under the label, e.g. "3 movimenti". */
  hint?: string;
}

/**
 * Ranked horizontal bars (categories, clients, activities). Bars are relative to the biggest
 * row; the percentage is of the total. Values are written out, so nothing relies on colour.
 */
export function RankedBars({
  rows,
  totalCents,
  empty,
  limit = 8,
}: {
  rows: RankedRow[];
  totalCents: number;
  empty: string;
  limit?: number;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  const shown: RankedRow[] = rest.length
    ? [
        ...top,
        {
          key: '__other',
          label: `Altre ${rest.length}`,
          cents: rest.reduce((s, r) => s + r.cents, 0),
        },
      ]
    : top;
  const max = Math.max(...shown.map((r) => r.cents), 1);
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((r) => {
        const pct = totalCents ? Math.round((r.cents * 100) / totalCents) : 0;
        return (
          <li key={r.key} className="flex items-center gap-3">
            {r.icon}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {r.label}
                  {r.hint && <span className="text-muted"> · {r.hint}</span>}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{formatCents(r.cents)}</span>
                  <span className="text-muted"> {pct}%</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(r.cents / max) * 100}%` }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
