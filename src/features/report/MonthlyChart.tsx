import { useState, type PointerEvent } from 'react';
import { formatMonthYear } from '../../lib/dates';
import { formatCents } from '../../lib/money';

export interface Series {
  key: string;
  label: string;
  /** CSS colour (a theme variable). */
  color: string;
  values: number[];
}

const W = 340;
const H = 170;
const PAD = { top: 8, right: 4, bottom: 20, left: 34 };

/** "1,2k" style labels for the y axis (the exact value is in the tooltip). */
function compactEuro(cents: number): string {
  const e = cents / 100;
  if (Math.abs(e) >= 1000)
    return `${(e / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}k`;
  return Math.round(e).toLocaleString('it-IT');
}

/** A "nice" axis maximum (1, 2, 2.5 or 5 × 10^n) at or above `v`. */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Grouped monthly bars (one bar per series, side by side). Hover or tap a month to read its
 * values; the selected month is shown above the plot. A visually hidden table carries the same
 * data for screen readers. Legend only with 2+ series.
 */
export function MonthlyChart({
  months,
  series,
  title,
  extra,
}: {
  /** First day of each month, oldest first. */
  months: string[];
  series: Series[];
  title: string;
  /** Additional line in the readout for the selected month (e.g. running total). */
  extra?: (index: number) => string;
}) {
  const n = months.length;
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / n;
  const groupW = Math.min(slot * 0.72, 26 * series.length);
  const gap = series.length > 1 ? 2 : 0;
  const barW = (groupW - gap * (series.length - 1)) / series.length;
  const y = (c: number) => PAD.top + plotH * (1 - c / max);
  const shown = active ?? n - 1;

  function onPointer(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W - PAD.left;
    setActive(Math.max(0, Math.min(n - 1, Math.floor(px / slot))));
  }

  /** Bar with 4px rounded top, square at the baseline. */
  const bar = (x: number, v: number) => {
    const top = y(v);
    const h = PAD.top + plotH - top;
    if (h <= 0) return '';
    const r = Math.min(3, barW / 2, h);
    const bottom = PAD.top + plotH;
    return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + barW - r}Q${x + barW},${top} ${x + barW},${top + r}V${bottom}Z`;
  };

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="text-muted capitalize">{formatMonthYear(months[shown]!)}</span>
        <span className="flex flex-wrap gap-x-3">
          {series.map((s) => (
            <span key={s.key}>
              <span className="text-muted">{s.label.toLowerCase()} </span>
              <span className="font-semibold tabular-nums">{formatCents(s.values[shown]!)}</span>
            </span>
          ))}
          {extra && <span className="text-muted tabular-nums">{extra(shown)}</span>}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        aria-hidden="true"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setActive(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--app-line)"
            />
            <text
              x={PAD.left - 4}
              y={y(max * f) + 3}
              fontSize={9}
              textAnchor="end"
              fill="var(--app-muted)"
            >
              {compactEuro(max * f)}
            </text>
          </g>
        ))}
        <rect
          x={PAD.left + shown * slot}
          y={PAD.top}
          width={slot}
          height={plotH}
          fill="var(--app-fg)"
          opacity={active === null ? 0 : 0.06}
          rx={3}
        />
        {months.map((m, i) => {
          const x0 = PAD.left + i * slot + (slot - groupW) / 2;
          return (
            <g key={m} opacity={active !== null && active !== i ? 0.55 : 1}>
              {series.map((s, k) => (
                <path key={s.key} d={bar(x0 + k * (barW + gap), s.values[i]!)} fill={s.color} />
              ))}
              {(n <= 12 || i % 2 === 0) && (
                <text
                  x={PAD.left + i * slot + slot / 2}
                  y={H - 6}
                  fontSize={9}
                  textAnchor="middle"
                  fill="var(--app-muted)"
                >
                  {formatMonthYear(m).slice(0, 3)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <p className="flex gap-4 text-xs text-muted">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </p>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Mese</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((m, i) => (
            <tr key={m}>
              <th scope="row">{formatMonthYear(m)}</th>
              {series.map((s) => (
                <td key={s.key}>{formatCents(s.values[i]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
