import { useEffect, useRef, useState } from 'react';
import { useActivities, useTaxContext } from '../../db/hooks';
import type { Account, Category, Recurring } from '../../db/types';
import { activeActivitiesOn, defaultActivityId } from '../../lib/activities';
import { formatShortDate, isISODate, todayRome } from '../../lib/dates';
import { centsToInput, formatCents, parseAmountToCents } from '../../lib/money';
import { advanceDueDate } from '../../lib/recurring';
import { DISCLAIMER, proposalForRecurring } from '../../lib/tax';
import { validateDraft, type TxDraftError } from '../../lib/transactions';
import { Sheet } from '../../components/Sheet';
import { inputClass, labelClass, primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';
import { markPaid } from './actions';

const ERROR_TEXT: Partial<Record<TxDraftError, string>> = {
  amount: 'Inserisci l’importo pagato.',
  category: 'La ricorrenza non ha una categoria valida: modificala.',
  account: 'Scegli un conto.',
  activityMissing: 'Scegli l’attività a cui attribuire l’incasso.',
  activityInactive: 'L’attività scelta non è attiva in questa data.',
};

interface Props {
  recurring: Recurring;
  /** Passed in already loaded, so the initial account is known on the first render. */
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
}

/** "Segna come pagata": amount, date and account can be changed before recording. */
export function PaySheet({ recurring: r, categories, accounts, onClose }: Props) {
  const activities = useActivities();
  const toast = useToast();

  const category = categories.find((c) => c.id === r.categoryId && !c.deleted);
  const type = category?.type ?? 'expense';
  const usable = accounts.filter((a) => !a.archived);
  const [amount, setAmount] = useState(r.amountCents > 0 ? centsToInput(r.amountCents) : '');
  const [date, setDate] = useState(todayRome());
  const [accountId, setAccountId] = useState(
    usable.some((a) => a.id === r.accountId) ? r.accountId : (usable[0]?.id ?? ''),
  );
  const [note, setNote] = useState(r.name);
  const [activityId, setActivityId] = useState<string | undefined>();
  const [showErrors, setShowErrors] = useState(false);

  // Fiscal deadlines with no fixed amount: propose the one estimated from the previous years.
  const taxCtx = useTaxContext();
  const proposal = taxCtx ? proposalForRecurring(taxCtx, r) : null;
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !proposal || r.amountCents > 0) return;
    prefilled.current = true;
    setAmount((a) => (a === '' ? centsToInput(proposal.totalCents) : a));
  }, [proposal, r.amountCents]);

  const needsActivity = type === 'income' && r.scope === 'business';
  const activeOnDate = isISODate(date) ? activeActivitiesOn(activities, date) : [];
  useEffect(() => {
    if (needsActivity && isISODate(date) && !activityId)
      setActivityId(defaultActivityId(activities, date));
  }, [needsActivity, activities, date, activityId]);

  const amountCents = parseAmountToCents(amount) ?? 0;
  const errors = validateDraft(
    {
      type,
      amountCents,
      scope: r.scope,
      date,
      categoryId: category ? r.categoryId : '',
      accountId,
      activityId: r.scope === 'business' ? activityId : undefined,
    },
    activities,
  );
  const dateValid = isISODate(date);
  const canSave = errors.length === 0 && dateValid;

  async function save() {
    if (!canSave) {
      setShowErrors(true);
      return;
    }
    const { undo } = await markPaid(r, {
      type,
      amountCents,
      date,
      accountId,
      activityId,
      note: note.trim(),
    });
    toast({
      message: `${r.name}: ${formatCents(amountCents)} registrati`,
      tone: 'success',
      action: { label: 'Annulla', onClick: () => void undo() },
    });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Segna come pagata">
      <p className="text-sm text-muted">
        <span className="font-medium text-fg">{r.name}</span> · scadenza{' '}
        {formatShortDate(r.nextDueDate)}. Dopo il salvataggio la prossima scadenza diventa il{' '}
        {formatShortDate(advanceDueDate(r.nextDueDate, r))}.
      </p>
      {proposal && (
        <div className="flex flex-col gap-1 rounded-xl bg-surface p-3 text-sm">
          <span className="font-medium">
            Importo proposto dalla stima: {formatCents(proposal.totalCents)}
          </span>
          {proposal.parts.map((p) => (
            <span key={p.label} className="flex justify-between text-muted tabular-nums">
              <span>{p.label}</span>
              <span>{formatCents(p.cents)}</span>
            </span>
          ))}
          <span className="text-xs text-muted">{DISCLAIMER}</span>
          {amountCents !== proposal.totalCents && (
            <button
              type="button"
              onClick={() => setAmount(centsToInput(proposal.totalCents))}
              className="mt-1 min-h-11 self-start rounded-xl bg-surface-2 px-3 font-medium"
            >
              Usa questo importo
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Importo pagato (€)
          <input
            className={`${inputClass} text-lg font-semibold tabular-nums`}
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
          />
        </label>
        <label className={labelClass}>
          Data
          <input
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className={`${labelClass} col-span-2`}>
          Conto
          <select
            className={inputClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {usable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {needsActivity && (
          <label className={`${labelClass} col-span-2`}>
            Attività
            <select
              className={inputClass}
              value={activityId ?? ''}
              onChange={(e) => setActivityId(e.target.value || undefined)}
            >
              <option value="">Scegli…</option>
              {activeOnDate.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={`${labelClass} col-span-2`}>
          Nota
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {showErrors && !canSave && (
        <ul role="alert" className="text-sm text-danger">
          {!dateValid && <li>Inserisci una data valida.</li>}
          {errors.map((e) => (
            <li key={e}>{ERROR_TEXT[e]}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void save()} className={primaryButton}>
        Registra pagamento
      </button>
    </Sheet>
  );
}
