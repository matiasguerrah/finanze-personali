import { useState } from 'react';
import { repo } from '../../db/repo';
import type { Account, Category, Recurring, RecurringFrequency, Scope } from '../../db/types';
import { todayRome } from '../../lib/dates';
import { centsToInput, parseAmountToCents } from '../../lib/money';
import { anchorDayFor, FREQUENCY_LABEL, validateRecurring } from '../../lib/recurring';
import { proposedScope } from '../../lib/transactions';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { inputClass, labelClass, primaryButton } from '../../components/form';

interface Props {
  recurring?: Recurring;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
}

export function RecurringForm({ recurring: r, categories, accounts, onClose }: Props) {
  const [name, setName] = useState(r?.name ?? '');
  const [amount, setAmount] = useState(r && r.amountCents > 0 ? centsToInput(r.amountCents) : '');
  const [estimated, setEstimated] = useState(r?.estimated ?? false);
  const [categoryId, setCategoryId] = useState(r?.categoryId ?? '');
  const [accountId, setAccountId] = useState(
    r?.accountId ?? accounts.find((a) => !a.archived)?.id ?? '',
  );
  const [scope, setScope] = useState<Scope | undefined>(r?.scope);
  const [frequency, setFrequency] = useState<RecurringFrequency>(r?.frequency ?? 'monthly');
  const [customDays, setCustomDays] = useState(r?.customDays ? String(r.customDays) : '');
  const [nextDueDate, setNextDueDate] = useState(r?.nextDueDate ?? todayRome());
  const [reminder, setReminder] = useState(String(r?.reminderDaysBefore ?? 3));
  const [submitted, setSubmitted] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const account = accounts.find((a) => a.id === accountId);
  const effectiveScope = scope ?? proposedScope(category?.defaultScope, account?.defaultScope);
  const amountCents = amount.trim() === '' ? 0 : (parseAmountToCents(amount) ?? NaN);

  // Keep the stored anchor day while the schedule is unchanged (e.g. 31 while on 28 Feb).
  const scheduleUnchanged = r && r.nextDueDate === nextDueDate && r.frequency === frequency;
  const anchorDay = scheduleUnchanged ? r.anchorDay : anchorDayFor(nextDueDate, frequency);

  const data = {
    name: name.trim(),
    amountCents,
    estimated,
    scope: effectiveScope,
    categoryId,
    accountId,
    frequency,
    customDays: frequency === 'custom' ? Number(customDays) : undefined,
    nextDueDate,
    anchorDay,
    reminderDaysBefore: reminder.trim() === '' ? NaN : Number(reminder),
  };
  const errors = validateRecurring(data);

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    if (r) await repo.update('recurring', r.id, data);
    else {
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      ) as typeof data;
      await repo.create('recurring', { ...clean, active: true });
    }
    onClose();
  }

  const selectable = (type: Category['type']) =>
    categories.filter((c) => c.type === type && (!c.archived || c.id === categoryId));
  const selectableAccounts = accounts.filter((a) => !a.archived || a.id === accountId);

  return (
    <Sheet open onClose={onClose} title={r ? 'Modifica ricorrenza' : 'Nuova ricorrenza'}>
      {r?.taxKind && (
        <p className="rounded-xl bg-surface p-3 text-sm text-muted">
          Scadenza fiscale del regime forfettario. Lascia l’importo vuoto per usare quello proposto
          dalla stima (serve inserire le percentuali degli acconti nei parametri fiscali).
        </p>
      )}
      <label className={labelClass}>
        Nome
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Affitto, Netflix, Assicurazione auto"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Importo (€)
          <input
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            value={amount}
            placeholder="da definire"
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end pb-1 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--app-accent)]"
            checked={estimated}
            onChange={(e) => setEstimated(e.target.checked)}
          />
          Importo stimato (varia)
        </label>
      </div>
      <label className={labelClass}>
        Categoria
        <select
          className={inputClass}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            if (!r) setScope(undefined); // follow the new category's default
          }}
        >
          <option value="" disabled>
            Scegli…
          </option>
          <optgroup label="Spese">
            {selectable('expense').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.defaultScope === 'business' ? ' (Lavoro)' : ''}
              </option>
            ))}
          </optgroup>
          <optgroup label="Entrate">
            {selectable('income').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.defaultScope === 'business' ? ' (Lavoro)' : ''}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <Segmented
        label="Ambito"
        size="sm"
        value={effectiveScope}
        onChange={setScope}
        options={[
          { value: 'personal', label: 'Personale' },
          { value: 'business', label: 'Lavoro' },
        ]}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Conto
          <select
            className={inputClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {selectableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Frequenza
          <select
            className={inputClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
          >
            {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {frequency === 'custom' && (
          <label className={`${labelClass} col-span-2`}>
            Ogni quanti giorni
            <input
              className={inputClass}
              inputMode="numeric"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        )}
        <label className={labelClass}>
          Prossima scadenza
          <input
            type="date"
            className={inputClass}
            value={nextDueDate}
            onChange={(e) => setNextDueDate(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Preavviso (giorni)
          <input
            className={inputClass}
            inputMode="numeric"
            value={reminder}
            onChange={(e) => setReminder(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      {submitted && errors.length > 0 && (
        <ul role="alert" className="text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void save()} className={primaryButton}>
        Salva
      </button>
    </Sheet>
  );
}
