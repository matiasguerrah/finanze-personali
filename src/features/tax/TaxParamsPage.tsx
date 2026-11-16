import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTaxParams } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { TaxParams } from '../../db/types';
import { todayRome, yearOf } from '../../lib/dates';
import {
  bpToPercentInput,
  centsToInput,
  formatBp,
  formatCents,
  parseAmountToCents,
  percentInputToBp,
} from '../../lib/money';
import { paramsForYear, validateTaxParams } from '../../lib/tax';
import { Sheet } from '../../components/Sheet';
import { RowMenu } from '../../components/RowMenu';
import { inputClass, labelClass, primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';

export function TaxParamsPage() {
  const params = useTaxParams();
  const [editing, setEditing] = useState<TaxParams | 'new' | null>(null);
  const toast = useToast();
  if (!params) return null;
  const current = paramsForYear(params, yearOf(todayRome()));
  const newest = [...params].reverse();

  async function remove(p: TaxParams) {
    await repo.softDelete('taxParams', p.id);
    toast({
      message: `Parametri dal ${p.validFromYear} eliminati`,
      action: { label: 'Annulla', onClick: () => void repo.restore('taxParams', p.id) },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        L’app non contiene valori fiscali predefiniti: inserisci quelli in vigore. Ogni anno usa i
        parametri con l’anno di validità più recente, così una modifica non cambia le stime degli
        anni precedenti.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
        {newest.length === 0 && (
          <li className="p-4 text-center text-muted">Nessun parametro inserito.</li>
        )}
        {newest.map((p) => (
          <li key={p.id} className="flex items-center gap-2 p-3">
            <button
              type="button"
              className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left"
              onClick={() => setEditing(p)}
            >
              <span className="font-medium">Dal {p.validFromYear}</span>
              <span className="text-sm text-muted">
                imposta {formatBp(p.substituteTaxBp)} · contributi {formatBp(p.contributionRateBp)}
                {p.fixedContributionCents > 0 &&
                  ` + ${formatCents(p.fixedContributionCents)} fissi`}{' '}
                · soglia {formatCents(p.revenueThresholdCents)}
              </span>
            </button>
            {current?.id === p.id && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg">
                In uso
              </span>
            )}
            <RowMenu
              label={`Azioni per i parametri dal ${p.validFromYear}`}
              actions={[
                { label: 'Modifica', onSelect: () => setEditing(p) },
                { label: 'Elimina', danger: true, onSelect: () => void remove(p) },
              ]}
            />
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
        <Plus size={20} aria-hidden="true" /> Parametri per un nuovo anno
      </button>
      {editing && (
        <TaxParamsForm
          params={editing === 'new' ? undefined : editing}
          all={params}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const pct = (bp: number | undefined) => (bp === undefined ? '' : bpToPercentInput(bp));
/** Empty optional field → undefined; invalid text → NaN, so validation reports it. */
const optPct = (s: string) => (s.trim() === '' ? undefined : (percentInputToBp(s) ?? NaN));

/** Create or edit the params valid from a year. `all` is used to prevent duplicate years. */
export function TaxParamsForm({
  params: p,
  all,
  onClose,
}: {
  params?: TaxParams;
  all: readonly TaxParams[];
  onClose: () => void;
}) {
  // A new record starts from the latest one (only the changed values need typing).
  const base = p ?? all[all.length - 1];
  const [year, setYear] = useState(String(p?.validFromYear ?? yearOf(todayRome())));
  const [tax, setTax] = useState(pct(base?.substituteTaxBp));
  const [contrib, setContrib] = useState(pct(base?.contributionRateBp));
  const [fixed, setFixed] = useState(base ? centsToInput(base.fixedContributionCents) : '0');
  const [threshold, setThreshold] = useState(base ? centsToInput(base.revenueThresholdCents) : '');
  const [taxFirst, setTaxFirst] = useState(pct(base?.taxFirstAdvanceBp));
  const [taxSecond, setTaxSecond] = useState(pct(base?.taxSecondAdvanceBp));
  const [cFirst, setCFirst] = useState(pct(base?.contributionFirstAdvanceBp));
  const [cSecond, setCSecond] = useState(pct(base?.contributionSecondAdvanceBp));
  const [submitted, setSubmitted] = useState(false);

  const data = {
    validFromYear: Number(year),
    substituteTaxBp: percentInputToBp(tax) ?? NaN,
    contributionRateBp: percentInputToBp(contrib) ?? NaN,
    fixedContributionCents: fixed.trim() === '' ? 0 : (parseAmountToCents(fixed) ?? NaN),
    revenueThresholdCents: parseAmountToCents(threshold) ?? NaN,
    taxFirstAdvanceBp: optPct(taxFirst),
    taxSecondAdvanceBp: optPct(taxSecond),
    contributionFirstAdvanceBp: optPct(cFirst),
    contributionSecondAdvanceBp: optPct(cSecond),
  };
  const errors = validateTaxParams(
    data,
    all.filter((o) => o.id !== p?.id),
  );

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    if (p) await repo.update('taxParams', p.id, data);
    else
      await repo.create(
        'taxParams',
        Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as typeof data,
      );
    onClose();
  }

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts: { hint?: string; placeholder?: string; numeric?: boolean } = {},
  ) => (
    <label className={labelClass}>
      {label}
      <input
        className={`${inputClass} tabular-nums`}
        inputMode={opts.numeric ? 'numeric' : 'decimal'}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => set(e.target.value)}
      />
      {opts.hint && <span className="text-xs">{opts.hint}</span>}
    </label>
  );

  return (
    <Sheet open onClose={onClose} title={p ? 'Modifica parametri fiscali' : 'Parametri fiscali'}>
      {field('Valgono dall’anno', year, setYear, { numeric: true })}
      <div className="grid grid-cols-2 gap-2">
        {field('Imposta sostitutiva (%)', tax, setTax)}
        {field('Contributi INPS (%)', contrib, setContrib)}
        {field('Quota contributiva fissa (€)', fixed, setFixed, { hint: '0 se non prevista' })}
        {field('Soglia ricavi annui (€)', threshold, setThreshold)}
      </div>
      <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold">Acconti (facoltativi)</legend>
        <p className="text-xs text-muted">
          In percentuale dell’importo dell’anno precedente. Servono solo a proporre gli importi
          delle scadenze di giugno e novembre; per i contributi valgono sulla parte in percentuale.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {field('Imposta: 1° acconto (%)', taxFirst, setTaxFirst)}
          {field('Imposta: 2° acconto (%)', taxSecond, setTaxSecond)}
          {field('Contributi: 1° acconto (%)', cFirst, setCFirst)}
          {field('Contributi: 2° acconto (%)', cSecond, setCSecond)}
        </div>
      </fieldset>
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
