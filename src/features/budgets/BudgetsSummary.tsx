import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBudgets, useCategories, useTransactionsBetween } from '../../db/hooks';
import type { ScopeFilter } from '../../db/types';
import {
  budgetLabel,
  coveringRange,
  evaluateBudgets,
  excludedFromGlobalBudgets,
  PERIOD_LABEL,
} from '../../lib/budgets';
import { todayRome } from '../../lib/dates';
import { BudgetBar } from './BudgetBar';

const ORDER = { over: 0, warn: 1, ok: 2 };

/** Progress bars for the Home dashboard, following the global scope filter, worst first. */
export function BudgetsSummary({ scope }: { scope: ScopeFilter }) {
  const budgets = useBudgets();
  const categories = useCategories();
  const today = todayRome();
  const visible = useMemo(
    () => (budgets ?? []).filter((b) => scope === 'all' || b.scope === scope),
    [budgets, scope],
  );
  const range = useMemo(() => coveringRange(visible, today), [visible, today]);
  const txs = useTransactionsBetween(range.from, range.to);

  if (!txs || visible.length === 0 || categories.length === 0) return null;
  const evals = evaluateBudgets(visible, txs, today, excludedFromGlobalBudgets(categories)).sort(
    (a, b) => ORDER[a.status] - ORDER[b.status],
  );
  if (evals.length === 0) return null;

  return (
    <section aria-labelledby="budgets-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 id="budgets-h" className="font-semibold">
          Soglie
        </h2>
        <Link
          to="/altro/soglie"
          className="-my-3 inline-flex min-h-11 items-center text-sm text-accent underline-offset-2 hover:underline"
        >
          Gestisci
        </Link>
      </div>
      {evals.map((e) => (
        <BudgetBar
          key={e.budget.id}
          evaluation={e}
          label={budgetLabel(e.budget, categories.find((c) => c.id === e.budget.categoryId)?.name)}
          periodLabel={PERIOD_LABEL[e.budget.period]}
        />
      ))}
    </section>
  );
}
