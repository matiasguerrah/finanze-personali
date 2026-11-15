import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Segmented } from '../../components/Segmented';
import { Amount } from '../../components/Amount';
import type { Transaction } from '../../db/types';
import { parseAmountToCents, percentInputToBp } from '../../lib/money';
import { splitByAmount, splitByPercent } from '../../lib/split';
import { useToast } from '../../state/toast';
import { splitTransaction } from './actions';

export function SplitSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('50');
  const toast = useToast();

  const result =
    mode === 'percent'
      ? (() => {
          const bp = percentInputToBp(value);
          return bp === null ? null : splitByPercent(tx.amountCents, bp);
        })()
      : (() => {
          const c = parseAmountToCents(value);
          return c === null ? null : splitByAmount(tx.amountCents, c);
        })();

  async function apply() {
    if (!result) return;
    await splitTransaction(tx, result);
    toast({ message: 'Movimento diviso tra Personale e Lavoro', tone: 'success' });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Dividi tra Personale e Lavoro">
      <p className="text-sm text-muted">
        Totale <Amount cents={tx.amountCents} className="font-medium text-fg" />. Indica la quota
        professionale: il resto resta personale.
      </p>
      <Segmented
        label="Modalità"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setValue(m === 'percent' ? '50' : '');
        }}
        options={[
          { value: 'percent', label: 'Percentuale' },
          { value: 'amount', label: 'Importo' },
        ]}
      />
      <label className="flex flex-col gap-1 text-sm text-muted">
        {mode === 'percent' ? 'Quota Lavoro (%)' : 'Quota Lavoro (€)'}
        <input
          inputMode="decimal"
          autoFocus
          className="min-h-11 rounded-xl border border-line bg-bg px-3 text-lg text-fg tabular-nums"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-3 text-sm">
        <dt className="text-muted">Personale</dt>
        <dd className="text-right font-medium">
          {result ? <Amount cents={result.personalCents} /> : '—'}
        </dd>
        <dt className="text-muted">Lavoro</dt>
        <dd className="text-right font-medium">
          {result ? <Amount cents={result.businessCents} /> : '—'}
        </dd>
      </dl>
      {!result && value !== '' && (
        <p role="alert" className="text-sm text-danger">
          Entrambe le quote devono essere maggiori di zero.
        </p>
      )}
      <button
        type="button"
        disabled={!result}
        onClick={() => void apply()}
        className="min-h-12 rounded-xl bg-accent font-semibold text-accent-fg disabled:bg-surface-2 disabled:text-muted"
      >
        Dividi
      </button>
    </Sheet>
  );
}
