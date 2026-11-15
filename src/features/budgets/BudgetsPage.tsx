import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useBudgets, useCategories, useTransactionsBetween } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { Budget } from '../../db/types';
import { budgetLabel, coveringRange, evaluateBudgets, PERIOD_LABEL } from '../../lib/budgets';
import { todayRome } from '../../lib/dates';
import { RowMenu } from '../../components/RowMenu';
import { primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';
import { BudgetBar } from './BudgetBar';
import { BudgetForm } from './BudgetForm';
import { NotificationsCard } from './NotificationsCard';

export function BudgetsPage() {
  const budgets = useBudgets();
  const categories = useCategories();
  const toast = useToast();
  const today = todayRome();
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const range = useMemo(() => coveringRange(budgets ?? [], today), [budgets, today]);
  const txs = useTransactionsBetween(range.from, range.to);

  if (budgets === undefined || txs === undefined) return null;
  const active = evaluateBudgets(budgets, txs, today);
  const inactive = budgets.filter((b) => !b.active);
  const label = (b: Budget) => budgetLabel(b, categories.find((c) => c.id === b.categoryId)?.name);

  async function remove(b: Budget) {
    await repo.softDelete('budgets', b.id);
    toast({
      message: 'Soglia eliminata',
      action: { label: 'Annulla', onClick: () => void repo.restore('budgets', b.id) },
    });
  }

  const menu = (b: Budget) => (
    <RowMenu
      label={`Azioni per ${label(b)}`}
      actions={[
        { label: 'Modifica', onSelect: () => setEditing(b) },
        b.active
          ? {
              label: 'Sospendi',
              onSelect: () => void repo.update('budgets', b.id, { active: false }),
            }
          : {
              label: 'Riattiva',
              onSelect: () => void repo.update('budgets', b.id, { active: true }),
            },
        { label: 'Elimina', danger: true, onSelect: () => void remove(b) },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <NotificationsCard />

      <section aria-labelledby="active-h" className="flex flex-col gap-2">
        <h2 id="active-h" className="px-1 text-sm font-semibold text-muted">
          Soglie attive
        </h2>
        {active.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-center text-muted">
            Nessuna soglia. Crea un limite per una categoria o per tutte le spese.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
            {active.map((e) => (
              <li key={e.budget.id} className="flex items-center gap-1 py-3 pr-1 pl-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setEditing(e.budget)}
                >
                  <BudgetBar
                    evaluation={e}
                    label={label(e.budget)}
                    periodLabel={PERIOD_LABEL[e.budget.period]}
                  />
                </button>
                {menu(e.budget)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
        <Plus size={20} aria-hidden="true" /> Nuova soglia
      </button>

      {inactive.length > 0 && (
        <section aria-labelledby="inactive-h">
          <h2 id="inactive-h" className="mb-2 px-1 text-sm font-semibold text-muted">
            Sospese
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface opacity-80">
            {inactive.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2 pr-1 pl-4">
                <span className="flex-1">
                  {label(b)}
                  <span className="text-sm text-muted"> · {PERIOD_LABEL[b.period]}</span>
                </span>
                {menu(b)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <BudgetForm
          budget={editing === 'new' ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
