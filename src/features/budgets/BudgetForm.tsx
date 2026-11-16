import { useState } from 'react';
import { repo } from '../../db/repo';
import type { Budget, BudgetPeriod, Category, ScopeFilter } from '../../db/types';
import { PERIOD_LABEL, validateBudget } from '../../lib/budgets';
import {
  bpToPercentInput,
  centsToInput,
  parseAmountToCents,
  percentInputToBp,
} from '../../lib/money';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { inputClass, labelClass, primaryButton } from '../../components/form';

interface Props {
  budget?: Budget;
  categories: Category[];
  onClose: () => void;
}

export function BudgetForm({ budget: b, categories, onClose }: Props) {
  const [target, setTarget] = useState<Budget['target']>(b?.target ?? 'category');
  const [categoryId, setCategoryId] = useState(b?.categoryId ?? '');
  const [scope, setScope] = useState<ScopeFilter>(b?.scope ?? 'all');
  const [period, setPeriod] = useState<BudgetPeriod>(b?.period ?? 'monthly');
  const [limit, setLimit] = useState(b ? centsToInput(b.limitCents) : '');
  const [warnAt, setWarnAt] = useState(bpToPercentInput(b?.warnAtBp ?? 8000));
  const [submitted, setSubmitted] = useState(false);

  const data = {
    target,
    categoryId: target === 'category' ? categoryId || undefined : undefined,
    scope,
    period,
    limitCents: parseAmountToCents(limit) ?? 0,
    warnAtBp: percentInputToBp(warnAt) ?? 0,
  };
  const errors = validateBudget(data);

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    if (b) await repo.update('budgets', b.id, data);
    else {
      const { categoryId: cid, ...rest } = data;
      await repo.create('budgets', { ...rest, ...(cid ? { categoryId: cid } : {}), active: true });
    }
    onClose();
  }

  const expenseCats = categories.filter(
    (c) => c.type === 'expense' && (!c.archived || c.id === categoryId),
  );

  return (
    <Sheet open onClose={onClose} title={b ? 'Modifica soglia' : 'Nuova soglia'}>
      <Segmented
        label="Cosa limitare"
        value={target}
        onChange={setTarget}
        options={[
          { value: 'category', label: 'Una categoria' },
          { value: 'global', label: 'Tutte le spese' },
        ]}
      />
      {target === 'global' && (
        <p className="-mt-2 text-sm text-muted">
          Imposta sostitutiva e contributi INPS non vengono conteggiati: sono pagamenti obbligati
          che farebbero saltare qualsiasi limite. Per tenerli d’occhio crea una soglia sulla loro
          categoria.
        </p>
      )}
      {target === 'category' && (
        <label className={labelClass}>
          Categoria
          <select
            className={inputClass}
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              // Business categories usually make sense only for business spending.
              const c = categories.find((x) => x.id === e.target.value);
              if (!b && c) setScope(c.defaultScope === 'business' ? 'business' : 'all');
            }}
          >
            <option value="" disabled>
              Scegli…
            </option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.defaultScope === 'business' ? ' (Lavoro)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Quali movimenti contare</span>
        <Segmented
          label="Quali movimenti contare"
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'Tutti' },
            { value: 'personal', label: 'Personali' },
            { value: 'business', label: 'Lavoro' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Periodo</span>
        <Segmented
          label="Periodo"
          size="sm"
          value={period}
          onChange={setPeriod}
          options={(['daily', 'weekly', 'monthly'] as const).map((p) => ({
            value: p,
            label: PERIOD_LABEL[p],
          }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Limite (€)
          <input
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Avvisami al (%)
          <input
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            value={warnAt}
            onChange={(e) => setWarnAt(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-muted">
        Le settimane vanno da lunedì a domenica. Ricevi un avviso quando raggiungi la percentuale
        indicata e un altro quando superi il limite, una sola volta per periodo.
      </p>
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
