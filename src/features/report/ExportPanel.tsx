import { useRef, useState, type ChangeEvent } from 'react';
import { DatabaseBackup, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { db } from '../../db/db';
import { useAccounts, useActivities, useCategories, useDebts } from '../../db/hooks';
import { SYNCED_TABLES, type SyncedRecordMap, type Transaction } from '../../db/types';
import { BackupError, backupFileName, type RestorePlan } from '../../lib/backup';
import { excludedFromGlobalBudgets } from '../../lib/budgets';
import { formatShortDate, type DateRange } from '../../lib/dates';
import {
  businessSummaryTable,
  movementsTable,
  rawTable,
  summaryTable,
  toCsv,
  type ExportTable,
  type Lookups,
} from '../../lib/export';
import { businessReport } from '../../lib/reports';
import { filterByScope } from '../../lib/transactions';
import { useScopeFilter } from '../../state/scopeFilter';
import { useToast } from '../../state/toast';
import { applyRestore, buildBackup, prepareRestore } from './backupActions';
import { downloadXlsx } from './xlsx';

const SCOPE_SUFFIX = { all: '', personal: '-personale', business: '-lavoro' } as const;

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const actionButton =
  'flex min-h-14 w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left hover:bg-surface-2 disabled:opacity-60';

export function ExportPanel({ range, year }: { range: DateRange; year: number }) {
  const { scope } = useScopeFilter();
  const categories = useCategories();
  const accounts = useAccounts();
  const activities = useActivities();
  const debts = useDebts();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [restore, setRestore] = useState<{ plan: RestorePlan; fileName: string } | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const lookups: Lookups = { categories, accounts, activities, debts: debts ?? [] };
  const period = `${range.from}_${range.to}${SCOPE_SUFFIX[scope]}`;

  async function periodTxs(): Promise<Transaction[]> {
    const all = await db.transactions
      .where('date')
      .between(range.from, range.to, true, true)
      .filter((t) => !t.deleted)
      .toArray();
    return filterByScope(all, scope);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const csv = () =>
    run('csv', async () => {
      const t = movementsTable(await periodTxs(), lookups);
      download(
        new Blob([toCsv(t)], { type: 'text/csv;charset=utf-8' }),
        `conti-movimenti-${period}.csv`,
      );
    });

  const xlsx = () =>
    run('xlsx', async () => {
      const txs = await periodTxs();
      const allTxs = await db.transactions.filter((t) => !t.deleted).toArray();
      const business = await db.transactions
        .where('date')
        .between(range.from, range.to, true, true)
        .filter((t) => !t.deleted && t.scope === 'business')
        .toArray();
      const report = businessReport(allTxs, year, excludedFromGlobalBudgets(categories));
      const tables: ExportTable[] = [
        summaryTable(txs, range, scope, lookups),
        movementsTable(txs, lookups),
        movementsTable(business, lookups, 'Movimenti professionali'),
        businessSummaryTable(report, lookups),
      ];
      for (const t of SYNCED_TABLES) {
        const rows = (await db.table(t).toArray()) as SyncedRecordMap[typeof t][];
        tables.push(rawTable(t, rows as never));
      }
      await downloadXlsx(tables, `conti-${period}.xlsx`);
    });

  const backup = () =>
    run('backup', async () => {
      const file = await buildBackup();
      download(
        new Blob([JSON.stringify(file)], { type: 'application/json' }),
        backupFileName(file.exportedAt),
      );
      toast({ message: 'Backup scaricato', tone: 'success' });
    });

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again
    if (!f) return;
    setError('');
    setRestore(null);
    try {
      setRestore({ plan: await prepareRestore(await f.text()), fileName: f.name });
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'Impossibile leggere il file.');
    }
  }

  const confirmRestore = () =>
    run('restore', async () => {
      if (!restore) return;
      await applyRestore(restore.plan);
      const { added, updated } = restore.plan;
      setRestore(null);
      toast({
        message: `Ripristino completato: ${added} aggiunti, ${updated} aggiornati.`,
        tone: 'success',
        durationMs: 6000,
      });
    });

  const scopeText = {
    all: 'tutti i movimenti',
    personal: 'solo personali',
    business: 'solo lavoro',
  }[scope];

  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted">
        Periodo dal {formatShortDate(range.from)} al {formatShortDate(range.to)}, {scopeText}.
      </p>
      <button type="button" className={actionButton} onClick={() => void csv()} disabled={!!busy}>
        <FileText size={22} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">Movimenti in CSV</span>
          <span className="text-sm text-muted">Per Excel, Numbers o il commercialista</span>
        </span>
      </button>
      <button type="button" className={actionButton} onClick={() => void xlsx()} disabled={!!busy}>
        <FileSpreadsheet size={22} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">
            {busy === 'xlsx' ? 'Preparazione del file…' : 'File Excel completo'}
          </span>
          <span className="text-sm text-muted">
            Riepilogo, movimenti, movimenti professionali, lavoro {year} e un foglio per ogni
            tabella
          </span>
        </span>
      </button>

      <h2 className="mt-3 px-1 text-sm font-semibold text-muted">Backup</h2>
      <button
        type="button"
        className={actionButton}
        onClick={() => void backup()}
        disabled={!!busy}
      >
        <DatabaseBackup size={22} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">Scarica backup completo</span>
          <span className="text-sm text-muted">Tutti i dati in un file JSON</span>
        </span>
      </button>
      <button
        type="button"
        className={actionButton}
        onClick={() => fileInput.current?.click()}
        disabled={!!busy}
      >
        <Upload size={22} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="font-medium">Ripristina da backup</span>
          <span className="text-sm text-muted">
            Aggiunge ciò che manca e le versioni più recenti; non cancella nulla
          </span>
        </span>
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="File di backup"
        onChange={(e) => void onFile(e)}
      />

      {restore && (
        <div
          className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-surface p-4"
          role="dialog"
          aria-labelledby="restore-h"
        >
          <h3 id="restore-h" className="font-semibold">
            Ripristinare «{restore.fileName}»?
          </h3>
          {restore.plan.added + restore.plan.updated === 0 ? (
            <p className="text-sm">
              Niente da ripristinare: i dati sul dispositivo sono già aggiornati.
            </p>
          ) : (
            <p className="text-sm">
              {restore.plan.added} record nuovi e {restore.plan.updated} da aggiornare (
              {restore.plan.unchanged} già aggiornati). Verranno inviati anche al Google Sheet alla
              prossima sincronizzazione.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRestore(null)}
              className="min-h-12 rounded-xl bg-surface-2 font-semibold"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={() => void confirmRestore()}
              disabled={restore.plan.added + restore.plan.updated === 0 || !!busy}
              className="min-h-12 rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50"
            >
              Ripristina
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
