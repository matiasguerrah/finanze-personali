import { useState, type ReactNode } from 'react';
import { CircleCheck, Plus } from 'lucide-react';
import { useAccounts, useCategories, useRecurring, useTaxContext } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { Recurring } from '../../db/types';
import { formatShortDate, todayRome } from '../../lib/dates';
import { proposalForRecurring } from '../../lib/tax';
import { dueText, frequencyText, groupByDueStatus, type DueStatus } from '../../lib/recurring';
import { Amount } from '../../components/Amount';
import { BusinessBadge } from '../../components/BusinessBadge';
import { CategoryIcon } from '../../components/CategoryIcon';
import { RowMenu } from '../../components/RowMenu';
import { primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';
import { skipOccurrence } from './actions';
import { RecurringForm } from './RecurringForm';
import { PaySheet } from './PaySheet';

const SECTIONS: Array<{ key: DueStatus | 'inactive'; title: string; tone: string }> = [
  { key: 'overdue', title: 'Scadute', tone: 'text-danger' },
  { key: 'dueSoon', title: 'In scadenza', tone: 'text-warn' },
  { key: 'upcoming', title: 'Prossime', tone: 'text-muted' },
  { key: 'inactive', title: 'Sospese', tone: 'text-muted' },
];

export function RecurringPage() {
  const list = useRecurring();
  const categories = useCategories();
  const accounts = useAccounts();
  const toast = useToast();
  const today = todayRome();
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null);
  const [paying, setPaying] = useState<Recurring | null>(null);
  const taxCtx = useTaxContext();

  // Wait for accounts too: the forms take their initial account from this list.
  if (list === undefined || accounts.length === 0) return null;
  const groups = groupByDueStatus(list, today);

  async function skip(r: Recurring) {
    const { undo } = await skipOccurrence(r);
    toast({
      message: `«${r.name}» saltata: prossima scadenza spostata`,
      action: { label: 'Annulla', onClick: () => void undo() },
    });
  }

  async function remove(r: Recurring) {
    await repo.softDelete('recurring', r.id);
    toast({
      message: 'Ricorrenza eliminata',
      action: { label: 'Annulla', onClick: () => void repo.restore('recurring', r.id) },
    });
  }

  async function setActive(r: Recurring, active: boolean) {
    await repo.update('recurring', r.id, { active });
    toast({ message: active ? `«${r.name}» riattivata` : `«${r.name}» sospesa` });
  }

  function row(r: Recurring, status: DueStatus | 'inactive') {
    const category = categories.find((c) => c.id === r.categoryId);
    const account = accounts.find((a) => a.id === r.accountId);
    const needsAttention = status === 'overdue' || status === 'dueSoon';
    let amount: ReactNode;
    const proposal = r.amountCents === 0 && taxCtx ? proposalForRecurring(taxCtx, r) : null;
    if (proposal)
      amount = (
        <span className="flex flex-col items-end">
          <span className="font-medium">
            <span className="text-muted">
              ~<span className="sr-only">circa </span>
            </span>
            <Amount cents={proposal.totalCents} />
          </span>
          <span className="text-xs text-muted">stima</span>
        </span>
      );
    else if (r.amountCents === 0) amount = <span className="text-sm text-muted">da definire</span>;
    else
      amount = (
        <span className="font-medium">
          {r.estimated && (
            <span className="text-muted" title="Importo stimato">
              ~<span className="sr-only">circa </span>
            </span>
          )}
          <Amount cents={r.amountCents} type={category?.type} />
        </span>
      );

    return (
      <li key={r.id} className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(r)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          >
            {category ? (
              <CategoryIcon icon={category.icon} color={category.color} size="sm" />
            ) : (
              <span className="h-9 w-9 shrink-0 rounded-full bg-surface-2" aria-hidden="true" />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">
                {r.name}
                {r.scope === 'business' && (
                  <span className="ml-1.5 inline-block align-[-1px]">
                    <BusinessBadge />
                  </span>
                )}
              </span>
              <span className="text-sm text-muted">
                {formatShortDate(r.nextDueDate)}
                {status !== 'inactive' && (
                  <span
                    className={needsAttention ? SECTIONS.find((s) => s.key === status)!.tone : ''}
                  >
                    {' '}
                    · {dueText(r.nextDueDate, today)}
                  </span>
                )}
                {' · '}
                {frequencyText(r)}
                {account ? ` · ${account.name}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right">{amount}</span>
          </button>
          <RowMenu
            label={`Azioni per ${r.name}`}
            actions={[
              { label: 'Modifica', onSelect: () => setEditing(r) },
              ...(r.active
                ? [
                    { label: 'Segna come pagata', onSelect: () => setPaying(r) },
                    { label: 'Salta questa scadenza', onSelect: () => void skip(r) },
                    { label: 'Sospendi', onSelect: () => void setActive(r, false) },
                  ]
                : [{ label: 'Riattiva', onSelect: () => void setActive(r, true) }]),
              { label: 'Elimina', danger: true, onSelect: () => void remove(r) },
            ]}
          />
        </div>
        {needsAttention && (
          <button
            type="button"
            onClick={() => setPaying(r)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-semibold"
          >
            <CircleCheck size={18} aria-hidden="true" /> Segna come pagata
          </button>
        )}
      </li>
    );
  }

  const empty = list.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {empty && <p className="py-8 text-center text-muted">Nessuna ricorrenza configurata.</p>}
      {!empty && groups.overdue.length === 0 && groups.dueSoon.length === 0 && (
        <p className="rounded-2xl bg-surface p-4 text-center text-muted">
          Niente da pagare nei prossimi giorni.
        </p>
      )}

      {SECTIONS.map(({ key, title, tone }) => {
        const items = groups[key];
        if (items.length === 0) return null;
        return (
          <section key={key} aria-labelledby={`sec-${key}`}>
            <h2 id={`sec-${key}`} className={`mb-2 px-1 text-sm font-semibold ${tone}`}>
              {title} <span className="font-normal">({items.length})</span>
            </h2>
            <ul
              className={`flex flex-col divide-y divide-line rounded-2xl bg-surface ${
                key === 'inactive' ? 'opacity-80' : ''
              }`}
            >
              {items.map((r) => row(r, key))}
            </ul>
          </section>
        );
      })}

      <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
        <Plus size={20} aria-hidden="true" /> Nuova ricorrenza
      </button>

      {editing && (
        <RecurringForm
          recurring={editing === 'new' ? undefined : editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
        />
      )}
      {paying && (
        <PaySheet
          recurring={paying}
          categories={categories}
          accounts={accounts}
          onClose={() => setPaying(null)}
        />
      )}
    </div>
  );
}
