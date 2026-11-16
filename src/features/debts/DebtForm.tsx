import { useState } from 'react';
import { repo } from '../../db/repo';
import type { Debt, DebtState } from '../../db/types';
import { amortizationSchedule, installmentFor } from '../../lib/amortization';
import { TERMS_ERROR_TEXT, validateDebt, validateNotice } from '../../lib/debts';
import { formatMonthYear, formatShortDate, todayRome } from '../../lib/dates';
import {
  bpToPercentInput,
  centsToInput,
  formatCents,
  parseAmountToCents,
  percentInputToBp,
} from '../../lib/money';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { inputClass, labelClass, primaryButton } from '../../components/form';

type Mode = 'installment' | 'count';

/**
 * The user knows either the monthly installment (from the bank) or the number of installments:
 * the other is computed. In "count" mode the installment is derived and plannedInstallments set;
 * in "installment" mode the count comes from the plan.
 *
 * A notice only needs its amount and due date. Turning it into a plan ("Rateizza", opened with
 * `initialState="installments"`) proposes the notice amount as the amount to repay and keeps the
 * notice fields as history.
 */
export function DebtForm({
  debt: d,
  initialState,
  suggestedPrincipalCents,
  onClose,
}: {
  debt?: Debt;
  initialState?: DebtState;
  /** "Rateizza": what is still due on the notice, proposed as the amount to repay. */
  suggestedPrincipalCents?: number;
  onClose: () => void;
}) {
  const [state, setState] = useState<DebtState>(initialState ?? d?.state ?? 'installments');
  const [noticeAmount, setNoticeAmount] = useState(
    d?.noticeAmountCents ? centsToInput(d.noticeAmountCents) : '',
  );
  const [noticeDue, setNoticeDue] = useState(d?.noticeDueDate ?? '');
  const [name, setName] = useState(d?.name ?? '');
  const [creditor, setCreditor] = useState(d?.creditor ?? '');
  const [principal, setPrincipal] = useState(
    suggestedPrincipalCents
      ? centsToInput(suggestedPrincipalCents)
      : d?.principalCents
        ? centsToInput(d.principalCents)
        : d?.noticeAmountCents
          ? centsToInput(d.noticeAmountCents)
          : '',
  );
  const [rate, setRate] = useState(d ? bpToPercentInput(d.annualRateBp) : '0');
  const [mode, setMode] = useState<Mode>(
    d?.plannedInstallments !== undefined ? 'count' : 'installment',
  );
  const [installment, setInstallment] = useState(
    d?.installmentCents && d.state === 'installments' ? centsToInput(d.installmentCents) : '',
  );
  const [count, setCount] = useState(d?.plannedInstallments?.toString() ?? '');
  const [startDate, setStartDate] = useState(d?.startDate ?? todayRome());
  const [notes, setNotes] = useState(d?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);

  const principalCents = parseAmountToCents(principal) ?? 0;
  const annualRateBp = percentInputToBp(rate) ?? -1;
  const n = /^\d+$/.test(count.trim()) ? Number(count.trim()) : 0;
  const countValid = n >= 1 && n <= 1200 && principalCents > 0 && annualRateBp >= 0;
  const installmentCents =
    mode === 'count'
      ? countValid
        ? installmentFor(principalCents, annualRateBp, n)
        : 0
      : (parseAmountToCents(installment) ?? 0);

  const terms = {
    principalCents,
    annualRateBp,
    installmentCents,
    ...(mode === 'count' ? { installments: n } : {}),
  };
  const noticeAmountCents = parseAmountToCents(noticeAmount) ?? 0;
  const isNotice = state === 'notice';
  const errors = isNotice
    ? validateNotice({ name, noticeAmountCents, noticeDueDate: noticeDue })
    : // In "count" mode the installment is computed: a missing count is reported once, as such.
      validateDebt({ name, startDate, ...terms }).filter(
        (e) => mode === 'installment' || e !== TERMS_ERROR_TEXT.installment,
      );
  const plan =
    !isNotice && errors.length === 0
      ? amortizationSchedule({ ...terms, firstDate: startDate })
      : null;
  const interest = plan?.reduce((s, r) => s + r.interestCents, 0) ?? 0;

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    const notice = {
      noticeAmountCents: noticeAmountCents || undefined,
      noticeDueDate: noticeDue || undefined,
    };
    // A notice keeps whatever plan fields it had (unused until it is rateizzato).
    const planFields = isNotice
      ? {
          principalCents: d?.principalCents ?? 0,
          annualRateBp: d?.annualRateBp ?? 0,
          installmentCents: d?.installmentCents ?? 0,
          startDate: d?.startDate ?? noticeDue,
          plannedInstallments: d?.plannedInstallments,
        }
      : {
          principalCents,
          annualRateBp,
          installmentCents,
          startDate,
          plannedInstallments: mode === 'count' ? n : undefined,
        };
    // Turning a notice into a plan: payments recorded from now on count towards the plan.
    const rateizedAt =
      d?.state === 'notice' && state === 'installments' ? new Date().toISOString() : d?.rateizedAt;
    const data = {
      name: name.trim(),
      state,
      rateizedAt,
      creditor: creditor.trim(),
      ...notice,
      ...planFields,
      notes: notes.trim(),
    };
    if (d) await repo.update('debts', d.id, data);
    else {
      // Drop undefined optionals so the stored record has no empty keys.
      const clean = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== undefined),
      ) as typeof data;
      await repo.create('debts', clean);
    }
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={initialState === 'installments' ? 'Rateizza' : d ? 'Modifica debito' : 'Nuovo debito'}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Stato</span>
        <Segmented
          label="Stato"
          size="sm"
          value={state}
          onChange={(v) => {
            if (v === 'installments' && !principal && noticeAmountCents)
              setPrincipal(centsToInput(noticeAmountCents));
            setState(v);
          }}
          options={[
            { value: 'notice', label: 'Avviso' },
            { value: 'installments', label: 'Rateizzato' },
          ]}
        />
      </div>
      <label className={labelClass}>
        Nome
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isNotice ? 'Es. Avviso bonario 2024' : 'Es. Finanziamento auto'}
        />
      </label>
      <label className={labelClass}>
        Creditore (facoltativo)
        <input
          className={inputClass}
          value={creditor}
          onChange={(e) => setCreditor(e.target.value)}
          placeholder={
            isNotice ? 'Es. Agenzia delle Entrate, INPS' : 'Es. banca, finanziaria, amico'
          }
        />
      </label>
      {isNotice ? (
        <div className="grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Importo iniziale (€)
            <input
              className={`${inputClass} tabular-nums`}
              inputMode="decimal"
              value={noticeAmount}
              onChange={(e) => setNoticeAmount(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Scadenza
            <input
              type="date"
              className={inputClass}
              value={noticeDue}
              onChange={(e) => setNoticeDue(e.target.value)}
            />
          </label>
        </div>
      ) : (
        <>
          {noticeAmountCents > 0 && (
            <p className="rounded-xl bg-surface p-3 text-sm text-muted">
              Avviso iniziale {formatCents(noticeAmountCents)}
              {noticeDue && `, scadenza ${formatShortDate(noticeDue)}`}. Inserisci sotto l’importo
              rateizzato (può differire, ad es. per sanzioni ridotte o interessi).
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={labelClass}>
              Importo finanziato (€)
              <input
                className={`${inputClass} tabular-nums`}
                inputMode="decimal"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
              />
            </label>
            <label className={labelClass}>
              Tasso annuo, TAN (%)
              <input
                className={`${inputClass} tabular-nums`}
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted">Cosa conosci</span>
            <Segmented
              label="Cosa conosci"
              size="sm"
              value={mode}
              onChange={(m) => {
                // Carry the computed value over, so switching does not lose information.
                if (m === 'installment' && installmentCents > 0)
                  setInstallment(centsToInput(installmentCents));
                if (m === 'count' && plan) setCount(String(plan.length));
                setMode(m);
              }}
              options={[
                { value: 'installment', label: 'La rata mensile' },
                { value: 'count', label: 'Il numero di rate' },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {mode === 'installment' ? (
              <label className={labelClass}>
                Rata mensile (€)
                <input
                  className={`${inputClass} tabular-nums`}
                  inputMode="decimal"
                  value={installment}
                  onChange={(e) => setInstallment(e.target.value)}
                />
              </label>
            ) : (
              <label className={labelClass}>
                Numero di rate
                <input
                  className={`${inputClass} tabular-nums`}
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
            )}
            <label className={labelClass}>
              Prima rata
              <input
                type="date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
          </div>
          {plan && (
            <p className="rounded-xl bg-surface p-3 text-sm" aria-live="polite">
              {mode === 'count' ? (
                <>
                  Rata calcolata{' '}
                  <strong className="tabular-nums">{formatCents(installmentCents)}</strong> per{' '}
                  {plan.length} mesi
                </>
              ) : (
                <>
                  <strong>{plan.length} rate</strong> mensili
                </>
              )}
              , ultima a {formatMonthYear(plan.at(-1)!.date)}. Interessi totali{' '}
              <span className="tabular-nums">{formatCents(interest)}</span>.
            </p>
          )}
        </>
      )}
      <label className={labelClass}>
        Note (facoltative)
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
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
