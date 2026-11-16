import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ChevronRight, Info } from 'lucide-react';
import { useTaxContext } from '../../db/hooks';
import type { Transaction } from '../../db/types';
import { formatShortDate } from '../../lib/dates';
import { BP_100, formatBp, formatCents } from '../../lib/money';
import {
  DISCLAIMER,
  setupStatus,
  taxYear,
  thresholdText,
  type TaxYear,
  type ThresholdLevel,
} from '../../lib/tax';
import { useOpenEntry } from '../../state/entry';
import { ActivityForm } from '../activities/ActivitiesPage';
import { TaxParamsForm } from './TaxParamsPage';

const card = 'flex flex-col gap-3 rounded-2xl bg-surface p-4';

/** Forfettario estimate for `year`: guided setup, set-aside, threshold, warnings. */
export function TaxPanel({ year, txs }: { year: number; txs: readonly Transaction[] }) {
  const ctx = useTaxContext();
  if (!ctx) return null;
  const setup = setupStatus(ctx, year);
  const y = taxYear(ctx, year);
  return (
    <>
      {!setup.complete && <SetupCard year={year} setup={setup} ctx={ctx} />}
      {y.estimate && <EstimateCard y={y} />}
      {y.unattributed.length > 0 && <UnattributedCard y={y} txs={txs} />}
      {y.byActivity.length > 0 && <ActivitiesCard y={y} ctx={ctx} />}
      {y.incomeCents > 0 && <ForfaitCard y={y} />}
      <p className="flex items-start gap-2 px-1 text-xs text-muted">
        <Info size={14} className="mt-px shrink-0" aria-hidden="true" />
        {DISCLAIMER}
      </p>
    </>
  );
}

type Ctx = NonNullable<ReturnType<typeof useTaxContext>>;

function SetupCard({
  year,
  setup,
  ctx,
}: {
  year: number;
  setup: ReturnType<typeof setupStatus>;
  ctx: Ctx;
}) {
  const [open, setOpen] = useState<'activity' | 'params' | null>(null);
  const params = [...ctx.params].sort((a, b) => a.validFromYear - b.validFromYear);
  const step = (done: boolean, n: number, title: string, text: string, onClick: () => void) => (
    <li className="flex items-start gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          done ? 'bg-accent text-accent-fg' : 'bg-surface-2'
        }`}
        aria-hidden="true"
      >
        {done ? <Check size={16} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">
          {title}
          {done && <span className="sr-only"> (fatto)</span>}
        </span>
        <span className="text-sm text-muted">{text}</span>
        {!done && (
          <button
            type="button"
            onClick={onClick}
            className="mt-1 min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-fg"
          >
            {n === 1 ? 'Aggiungi attività' : 'Inserisci parametri'}
          </button>
        )}
      </div>
    </li>
  );
  return (
    <section aria-labelledby="setup-h" className={`${card} border border-accent/40`}>
      <h2 id="setup-h" className="font-semibold">
        Configura la stima del forfettario
      </h2>
      <p className="text-sm text-muted">
        Servono due dati, che inserisci tu: l’app non contiene valori fiscali predefiniti. Fino ad
        allora vedi solo incassi e spese.
      </p>
      <ol className="flex flex-col gap-4">
        {step(
          setup.hasActivities,
          1,
          'La tua attività',
          'Codice ATECO e coefficiente di redditività.',
          () => setOpen('activity'),
        )}
        {step(
          setup.hasParams,
          2,
          `Parametri fiscali per il ${year}`,
          'Aliquota dell’imposta sostitutiva, aliquota dei contributi, eventuale quota fissa e soglia ricavi.',
          () => setOpen('params'),
        )}
      </ol>
      {open === 'activity' && (
        <ActivityForm nextSortOrder={ctx.activities.length + 1} onClose={() => setOpen(null)} />
      )}
      {open === 'params' && <TaxParamsForm all={params} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Row({ label, cents, hint }: { label: string; cents: number; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-0">
      <dt className="min-w-0">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </dt>
      <dd className="shrink-0 font-medium tabular-nums">{formatCents(cents)}</dd>
    </div>
  );
}

function EstimateCard({ y }: { y: TaxYear }) {
  const e = y.estimate!;
  const p = e.params;
  return (
    <section aria-labelledby="est-h" className={card}>
      <h2 id="est-h" className="font-semibold">
        Stima imposte e contributi {y.year}
      </h2>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Da accantonare</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatCents(e.setAsideCents)}</dd>
          <dd className="text-xs text-muted tabular-nums">
            {formatCents(e.setAsideMonthlyCents)} al mese
          </dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-muted">Netto disponibile</dt>
          <dd
            className={`text-lg font-semibold tabular-nums ${e.netCents < 0 ? 'text-danger' : ''}`}
          >
            {formatCents(e.netCents)}
          </dd>
          <dd className="text-xs text-muted">incassato meno accantonamento</dd>
        </div>
      </dl>
      <dl className="text-sm">
        <Row label="Reddito imponibile" cents={y.taxableCents} hint="incassi × coefficiente" />
        <Row
          label="Contributi INPS stimati"
          cents={e.contributionsCents}
          hint={`${formatBp(p.contributionRateBp)} dell’imponibile${
            p.fixedContributionCents > 0
              ? ` + ${formatCents(p.fixedContributionCents)} di quota fissa`
              : ''
          }`}
        />
        <Row
          label="Contributi versati nell’anno"
          cents={y.inpsPaidCents}
          hint="dedotti dall’imponibile per l’imposta"
        />
        <Row
          label="Imposta sostitutiva stimata"
          cents={e.taxCents}
          hint={`${formatBp(p.substituteTaxBp)} di ${formatCents(e.taxBaseCents)}`}
        />
        <Row label="Imposta sostitutiva versata nell’anno" cents={y.substituteTaxPaidCents} />
      </dl>
      {e.threshold.limitCents > 0 && (
        <ThresholdBar
          incomeCents={y.incomeCents}
          limitCents={e.threshold.limitCents}
          usedBp={e.threshold.usedBp}
          level={e.threshold.level}
        />
      )}
      <p className="text-xs text-muted">
        Parametri dal {p.validFromYear} ·{' '}
        <Link to="/altro/fiscale" className="underline">
          modifica
        </Link>
      </p>
    </section>
  );
}

const BAR: Record<ThresholdLevel, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  alert: 'bg-danger',
  over: 'bg-danger',
};

export function ThresholdBar({
  incomeCents,
  limitCents,
  usedBp,
  level,
}: {
  incomeCents: number;
  limitCents: number;
  usedBp: number;
  level: ThresholdLevel;
}) {
  const pct = Math.floor(usedBp / 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">Soglia ricavi</span>
        <span className="tabular-nums">
          {formatCents(incomeCents)}
          <span className="text-muted"> / {formatCents(limitCents)}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Soglia ricavi: ${pct}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        className="relative h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${BAR[level]}`}
          style={{ width: `${Math.min(usedBp, BP_100) / 100}%` }}
        />
      </div>
      <p
        className={`flex items-center gap-1.5 text-xs ${
          level === 'ok' ? 'text-muted' : level === 'warn' ? 'text-warn' : 'text-danger'
        }`}
      >
        {level !== 'ok' && <AlertTriangle size={14} aria-hidden="true" />}
        {thresholdText(level, usedBp)}
        {level === 'ok' && ` · restano ${formatCents(limitCents - incomeCents)}`}
      </p>
    </div>
  );
}

function UnattributedCard({ y, txs }: { y: TaxYear; txs: readonly Transaction[] }) {
  const openEntry = useOpenEntry();
  const byId = new Map(txs.map((t) => [t.id, t]));
  return (
    <section aria-labelledby="un-h" className={`${card} border border-warn/40`} role="status">
      <h2 id="un-h" className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} className="text-warn" aria-hidden="true" />
        {y.unattributed.length === 1
          ? '1 incasso senza attività valida'
          : `${y.unattributed.length} incassi senza attività valida`}
      </h2>
      <p className="text-sm text-muted">
        {formatCents(y.unattributedCents)} non entrano nella stima. Tocca un incasso per assegnargli
        l’attività attiva in quella data.
      </p>
      <ul className="flex flex-col divide-y divide-line">
        {y.unattributed.map((u) => {
          const tx = byId.get(u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                disabled={!tx}
                onClick={() => tx && openEntry({ mode: 'edit', tx })}
                className="flex min-h-11 w-full items-center gap-3 py-2 text-left text-sm"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {formatShortDate(u.date)}
                    {tx?.client ? ` · ${tx.client}` : tx?.note ? ` · ${tx.note}` : ''}
                  </span>
                  <span className="text-xs text-muted">
                    {u.reason === 'missing'
                      ? 'nessuna attività'
                      : 'attività non attiva in questa data'}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatCents(u.amountCents)}</span>
                <ChevronRight size={16} className="text-muted" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ActivitiesCard({ y, ctx }: { y: TaxYear; ctx: Ctx }) {
  const name = new Map(ctx.activities.map((a) => [a.id, a]));
  return (
    <section aria-labelledby="act-h" className={card}>
      <h2 id="act-h" className="font-semibold">
        Per attività
      </h2>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted">
            <th scope="col" className="pb-1 text-left font-normal">
              Attività
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Incassi
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Imponibile
            </th>
          </tr>
        </thead>
        <tbody>
          {y.byActivity.map((l) => {
            const a = name.get(l.activityId);
            return (
              <tr key={l.activityId} className="border-t border-line">
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  <span className="block">{a?.name ?? 'Attività eliminata'}</span>
                  <span className="block text-xs text-muted">
                    ATECO {a?.atecoCode || '—'} · {formatBp(l.coefficientBp)}
                  </span>
                </th>
                <td className="py-2 text-right">{formatCents(l.incomeCents)}</td>
                <td className="py-2 text-right font-medium">{formatCents(l.taxableCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function ForfaitCard({ y }: { y: TaxYear }) {
  const max = Math.max(y.realExpensesCents, y.forfaitExpensesCents, 1);
  const bar = (label: string, cents: number, cls: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium tabular-nums">{formatCents(cents)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div
          className={`h-full rounded-full ${cls}`}
          style={{ width: `${(cents / max) * 100}%` }}
        />
      </div>
    </div>
  );
  return (
    <section aria-labelledby="ff-h" className={card}>
      <h2 id="ff-h" className="font-semibold">
        Spese reali e quota forfettaria
      </h2>
      {bar('Spese reali di lavoro', y.realExpensesCents, 'bg-[var(--app-chart-out)]')}
      {bar('Spesa forfettaria riconosciuta', y.forfaitExpensesCents, 'bg-[var(--app-chart-in)]')}
      <p className="text-xs text-muted">
        Spese reali escluse imposte e contributi. La quota forfettaria è la parte di incassi non
        tassata (incassi × (100% − coefficiente)).
      </p>
      {y.realExceedsForfait && (
        <p className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <Info size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          Le spese reali superano la quota forfettaria: valuta con il commercialista.
        </p>
      )}
    </section>
  );
}
