import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAllTransactions, useCategories } from '../../db/hooks';
import type { Category, Transaction } from '../../db/types';
import { excludedFromGlobalBudgets } from '../../lib/budgets';
import { formatShortDate, todayRome, yearOf, type DateRange } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import {
  businessIncomeByYear,
  businessReport,
  byCategory,
  monthlyTotals,
  PERIOD_PRESET_LABEL,
  presetRange,
  type PeriodPreset,
} from '../../lib/reports';
import { filterByScope, totals } from '../../lib/transactions';
import { useScopeFilter } from '../../state/scopeFilter';
import { Segmented } from '../../components/Segmented';
import { CategoryIcon } from '../../components/CategoryIcon';
import { inputClass } from '../../components/form';
import { BudgetsSummary } from '../budgets/BudgetsSummary';
import { MonthlyChart } from './MonthlyChart';
import { RankedBars } from './RankedBars';
import { ExportPanel } from './ExportPanel';
import { TaxPanel } from '../tax/TaxPanel';

type Tab = 'overview' | 'business' | 'export';
/** URL segment of each section: #/report, #/report/professionale, #/report/esporta. */
const TAB_PATH: Record<Tab, string> = {
  overview: '',
  business: 'professionale',
  export: 'esporta',
};

export function ReportPage() {
  const { tab: segment = '' } = useParams();
  const navigate = useNavigate();
  const tab = (Object.keys(TAB_PATH) as Tab[]).find((t) => TAB_PATH[t] === segment) ?? 'overview';
  const setTab = (t: Tab) => navigate(`/report${TAB_PATH[t] ? `/${TAB_PATH[t]}` : ''}`);
  const [preset, setPreset] = useState<PeriodPreset>('thisMonth');
  const today = todayRome();
  const [year, setYear] = useState(yearOf(today));
  const txs = useAllTransactions();
  const categories = useCategories();
  const range = presetRange(preset, today);

  if (!txs || categories.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Sezione del report"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Panoramica' },
          { value: 'business', label: 'Professionale' },
          { value: 'export', label: 'Esporta' },
        ]}
      />
      {tab !== 'business' && <PeriodSelect preset={preset} onChange={setPreset} range={range} />}
      {tab === 'overview' && (
        <Overview txs={txs} categories={categories} range={range} today={today} />
      )}
      {tab === 'business' && (
        <Business txs={txs} categories={categories} year={year} onYear={setYear} today={today} />
      )}
      {tab === 'export' && <ExportPanel range={range} year={year} />}
    </div>
  );
}

function PeriodSelect({
  preset,
  onChange,
  range,
}: {
  preset: PeriodPreset;
  onChange: (p: PeriodPreset) => void;
  range: DateRange;
}) {
  return (
    <label className="flex items-center gap-3 text-sm text-muted">
      Periodo
      <select
        className={`${inputClass} flex-1 text-fg`}
        value={preset}
        onChange={(e) => onChange(e.target.value as PeriodPreset)}
      >
        {Object.entries(PERIOD_PRESET_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <span className="sr-only">
        dal {formatShortDate(range.from)} al {formatShortDate(range.to)}
      </span>
    </label>
  );
}

function Tile({ label, cents, tone }: { label: string; cents: number; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${tone ?? ''}`}>{formatCents(cents)}</dd>
    </div>
  );
}

const categoryRows = (
  rows: { categoryId: string; cents: number; count: number }[],
  cats: Category[],
) =>
  rows.map((r) => {
    const c = cats.find((x) => x.id === r.categoryId);
    return {
      key: r.categoryId,
      label: c?.name ?? 'Senza categoria',
      icon: c ? <CategoryIcon icon={c.icon} color={c.color} size="sm" /> : undefined,
      cents: r.cents,
      hint: r.count === 1 ? '1 movimento' : `${r.count} movimenti`,
    };
  });

function Overview({
  txs,
  categories,
  range,
  today,
}: {
  txs: Transaction[];
  categories: Category[];
  range: DateRange;
  today: string;
}) {
  const { scope } = useScopeFilter();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const scoped = useMemo(() => filterByScope(txs, scope), [txs, scope]);
  const inRange = scoped.filter((t) => t.date >= range.from && t.date <= range.to);
  const t = totals(inRange);
  const cats = byCategory(scoped, kind, range);
  // The 12 months up to the end of the period (or today, for periods still running).
  const end = range.to < today ? range.to : today;
  const months = monthlyTotals(scoped, end, 12);

  return (
    <>
      <dl className="grid grid-cols-3 gap-2">
        <Tile label="Entrate" cents={t.incomeCents} tone="text-income" />
        <Tile label="Uscite" cents={t.expenseCents} />
        <Tile label="Saldo" cents={t.netCents} tone={t.netCents < 0 ? 'text-danger' : ''} />
      </dl>

      <section aria-labelledby="cat-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="cat-h" className="font-semibold">
            Per categoria
          </h2>
          <Segmented
            label="Tipo di movimento"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'expense', label: 'Uscite' },
              { value: 'income', label: 'Entrate' },
            ]}
          />
        </div>
        <RankedBars
          rows={categoryRows(cats.rows, categories)}
          totalCents={cats.totalCents}
          empty={
            kind === 'expense' ? 'Nessuna uscita nel periodo.' : 'Nessuna entrata nel periodo.'
          }
        />
      </section>

      <section aria-labelledby="trend-h" className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
        <h2 id="trend-h" className="font-semibold">
          Andamento degli ultimi 12 mesi
        </h2>
        <MonthlyChart
          title="Entrate e uscite per mese"
          months={months.map((m) => m.from)}
          series={[
            {
              key: 'in',
              label: 'Entrate',
              color: 'var(--app-chart-in)',
              values: months.map((m) => m.incomeCents),
            },
            {
              key: 'out',
              label: 'Uscite',
              color: 'var(--app-chart-out)',
              values: months.map((m) => m.expenseCents),
            },
          ]}
        />
      </section>

      <BudgetsSummary scope={scope} />
    </>
  );
}

function Business({
  txs,
  categories,
  year,
  onYear,
  today,
}: {
  txs: Transaction[];
  categories: Category[];
  year: number;
  onYear: (y: number) => void;
  today: string;
}) {
  const fiscal = useMemo(() => excludedFromGlobalBudgets(categories), [categories]);
  const r = useMemo(() => businessReport(txs, year, fiscal), [txs, year, fiscal]);
  const byYear = useMemo(() => businessIncomeByYear(txs), [txs]);
  const years = [...new Set([yearOf(today), ...byYear.map((y) => y.year)])].sort((a, b) => b - a);
  const months = r.months.filter((m) => year < yearOf(today) || m.from <= today);

  return (
    <>
      <label className="flex items-center gap-3 text-sm text-muted">
        Anno
        <select
          className={`${inputClass} flex-1 text-fg`}
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <p className="-mt-2 px-1 text-xs text-muted">
        Solo movimenti «Lavoro», per data di incasso o pagamento (principio di cassa).
      </p>

      <dl className="grid grid-cols-2 gap-2">
        <Tile label="Incassi" cents={r.incomeCents} tone="text-income" />
        <Tile label="Spese di lavoro" cents={r.expenseCents} />
        <Tile label="Imposte e contributi pagati" cents={r.taxesCents} />
        <div className="rounded-2xl bg-surface p-3">
          <dt className="text-xs text-muted">Fatture registrate</dt>
          <dd className="text-lg font-semibold tabular-nums">{r.invoiceCount}</dd>
        </div>
      </dl>

      <TaxPanel year={year} txs={txs} />

      {months.length > 0 && (
        <section aria-labelledby="bm-h" className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <h2 id="bm-h" className="font-semibold">
            Incassi per mese
          </h2>
          <MonthlyChart
            title={`Incassi per mese, ${year}`}
            months={months.map((m) => m.from)}
            series={[
              {
                key: 'in',
                label: 'Incassi',
                color: 'var(--app-chart-in)',
                values: months.map((m) => m.incomeCents),
              },
            ]}
            extra={(i) => `da inizio anno ${formatCents(months[i]!.cumulativeCents)}`}
          />
        </section>
      )}

      <section aria-labelledby="bc-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 id="bc-h" className="font-semibold">
          Compensi per cliente
        </h2>
        <RankedBars
          totalCents={r.incomeCents}
          empty="Nessun incasso nell'anno."
          rows={r.byClient.map((c) => ({
            key: c.key || '__none',
            label: c.key || 'Senza cliente',
            cents: c.cents,
            hint: c.count === 1 ? '1 incasso' : `${c.count} incassi`,
          }))}
        />
      </section>

      <section aria-labelledby="be-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 id="be-h" className="font-semibold">
          Spese di lavoro per categoria
        </h2>
        <RankedBars
          totalCents={r.expenseCents + r.taxesCents}
          empty="Nessuna spesa di lavoro nell'anno."
          rows={categoryRows(
            r.expensesByCategory.map((e) => ({
              categoryId: e.key,
              cents: e.cents,
              count: e.count,
            })),
            categories,
          )}
        />
      </section>

      {byYear.length > 0 && (
        <section aria-labelledby="by-h" className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <h2 id="by-h" className="font-semibold">
            Incassi per anno
          </h2>
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {byYear.map((y) => (
                <tr key={y.year} className="border-t border-line first:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    {y.year}
                  </th>
                  <td className="py-2 text-right font-medium">{formatCents(y.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
