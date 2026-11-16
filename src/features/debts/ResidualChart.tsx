import { useState, type PointerEvent } from 'react';
import type { ISODate } from '../../db/types';
import type { AmortizationRow } from '../../lib/amortization';
import { addMonthsISO, formatMonthYear } from '../../lib/dates';
import { formatCents } from '../../lib/money';

const W = 340;
const H = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 8 };

interface Point {
  date: ISODate;
  balanceCents: number;
}

/**
 * Principal still owed over time: one point before the first installment, then one per row.
 * Solid up to the installments already covered, dashed for the rest of the plan; a vertical line
 * marks today. Pointer/touch shows the value of the nearest month. The plan table on the same page
 * is the accessible text alternative.
 */
export function ResidualChart({
  schedule,
  principalCents,
  covered,
  today,
}: {
  schedule: AmortizationRow[];
  principalCents: number;
  covered: number;
  today: ISODate;
}) {
  const points: Point[] = [
    { date: addMonthsISO(schedule[0]!.date, -1), balanceCents: principalCents },
    ...schedule.map((r) => ({ date: r.date, balanceCents: r.balanceCents })),
  ];
  const [hover, setHover] = useState<number | null>(null);
  const n = points.length - 1;
  const x = (i: number) => PAD.left + (i / n) * (W - PAD.left - PAD.right);
  const y = (c: number) => PAD.top + (1 - c / principalCents) * (H - PAD.top - PAD.bottom);
  const path = (from: number, to: number) =>
    points
      .slice(from, to + 1)
      .map((p, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(p.balanceCents).toFixed(1)}`)
      .join('');
  const baseline = y(0);
  const area = `${path(0, n)}L${x(n)},${baseline}L${x(0)},${baseline}Z`;

  // "Today" between the last date ≤ today and the next one.
  const before = points.filter((p) => p.date <= today).length - 1;
  const todayX = before < 0 ? null : before >= n ? null : x(before + 0.5);

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * n);
    setHover(Math.max(0, Math.min(n, i)));
  }

  const shown = hover ?? Math.min(covered, n);
  const p = points[shown]!;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{formatMonthYear(p.date)}</span>
        <span>
          <span className="text-muted">residuo </span>
          <span className="font-semibold tabular-nums">{formatCents(p.balanceCents)}</span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        role="img"
        aria-label={`Capitale residuo da ${formatCents(principalCents)} a zero tra ${formatMonthYear(points[0]!.date)} e ${formatMonthYear(points[n]!.date)}`}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={baseline}
          y2={baseline}
          stroke="var(--app-line)"
        />
        <path d={area} fill="var(--app-accent)" opacity={0.12} />
        {covered < n && (
          <path
            d={path(covered, n)}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinejoin="round"
          />
        )}
        {covered > 0 && (
          <path
            d={path(0, covered)}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {todayX !== null && (
          <g>
            <line
              x1={todayX}
              x2={todayX}
              y1={PAD.top}
              y2={baseline}
              stroke="var(--app-muted)"
              strokeDasharray="2 3"
            />
            <text
              x={todayX}
              y={PAD.top + 8}
              dx={todayX > W / 2 ? -4 : 4}
              textAnchor={todayX > W / 2 ? 'end' : 'start'}
              fontSize={10}
              fill="var(--app-muted)"
            >
              oggi
            </text>
          </g>
        )}
        <line
          x1={x(shown)}
          x2={x(shown)}
          y1={PAD.top}
          y2={baseline}
          stroke="var(--app-fg)"
          opacity={hover === null ? 0 : 0.25}
        />
        <circle
          cx={x(shown)}
          cy={y(p.balanceCents)}
          r={4.5}
          fill="var(--app-accent)"
          stroke="var(--app-surface)"
          strokeWidth={2}
        />
        <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--app-muted)">
          {formatMonthYear(points[0]!.date)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize={10} fill="var(--app-muted)" textAnchor="end">
          {formatMonthYear(points[n]!.date)}
        </text>
      </svg>
      <p className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true">
            <line x1="0" x2="18" y1="2" y2="2" stroke="var(--app-accent)" strokeWidth="2" />
          </svg>
          rate pagate
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true">
            <line
              x1="0"
              x2="18"
              y1="2"
              y2="2"
              stroke="var(--app-accent)"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>
          piano futuro
        </span>
      </p>
    </figure>
  );
}
