import type { Budget } from '../../db/types';
import { alPercent, percentUsed, progressBp, type BudgetEvaluation } from '../../lib/budgets';
import { Amount } from '../../components/Amount';

const BAR = { ok: 'bg-accent', warn: 'bg-warn', over: 'bg-danger' };
const TEXT = { ok: 'text-muted', warn: 'text-warn', over: 'text-danger' };

/** Label, spent/limit and a progress bar coloured by status (text states it too, not only colour). */
export function BudgetBar({
  evaluation: e,
  label,
  periodLabel,
}: {
  evaluation: BudgetEvaluation<Budget>;
  label: string;
  periodLabel: string;
}) {
  const pct = percentUsed(e.spentCents, e.budget.limitCents);
  const state =
    e.status === 'over' ? 'Superata' : e.status === 'warn' ? `Attenzione, ${alPercent(pct)}` : '';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 text-sm">
          <Amount cents={e.spentCents} className="font-medium" />
          <span className="text-muted">
            {' '}
            / <Amount cents={e.budget.limitCents} />
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${pct}% del limite`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${BAR[e.status]}`}
          style={{ width: `${progressBp(e.spentCents, e.budget.limitCents) / 100}%` }}
        />
      </div>
      <div className={`flex justify-between text-xs ${TEXT[e.status]}`}>
        <span>
          {periodLabel}
          {state && ` · ${state}`}
        </span>
        <span className="tabular-nums">
          {e.remainingCents >= 0 ? (
            <>
              restano <Amount cents={e.remainingCents} />
            </>
          ) : (
            <>
              oltre di <Amount cents={-e.remainingCents} />
            </>
          )}
        </span>
      </div>
    </div>
  );
}
