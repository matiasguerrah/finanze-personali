/**
 * Export tables in a neutral format, rendered to CSV here and to .xlsx by the export feature.
 * Cells are typed so each renderer can format them properly (Excel: real numbers and dates).
 */
import type {
  Account,
  Activity,
  Category,
  Debt,
  ScopeFilter,
  SyncedRecordMap,
  SyncedTable,
  Transaction,
} from '../db/types';
import type { DateRange } from './dates';
import { toRow, columnNames } from './sync/merge';
import { byCategory, type BusinessReport } from './reports';
import { totals } from './transactions';

export type Cell =
  | { kind: 'text'; value: string }
  | { kind: 'money'; cents: number }
  | { kind: 'date'; iso: string }
  | { kind: 'int'; value: number }
  | { kind: 'percentBp'; bp: number };

export interface ExportTable {
  /** Sheet name (≤ 31 chars, no []:*?/\ for Excel). */
  name: string;
  header: string[];
  rows: Cell[][];
  /** Rows rendered in bold (e.g. section titles in the summary). */
  boldRows?: number[];
}

const text = (value: string): Cell => ({ kind: 'text', value });
const money = (cents: number): Cell => ({ kind: 'money', cents });
const date = (iso: string): Cell => ({ kind: 'date', iso });

const TYPE_LABEL = { expense: 'Uscita', income: 'Entrata', transfer: 'Giroconto' } as const;
const SCOPE_LABEL = { personal: 'Personale', business: 'Lavoro' } as const;
const SCOPE_FILTER_LABEL: Record<ScopeFilter, string> = {
  all: 'Tutto',
  personal: 'Personale',
  business: 'Lavoro',
};

export interface Lookups {
  categories: readonly Category[];
  accounts: readonly Account[];
  activities: readonly Activity[];
  debts: readonly Debt[];
}

function byId<T extends { id: string }>(rows: readonly T[]) {
  const m = new Map(rows.map((r) => [r.id, r]));
  return (id: string | undefined) => (id ? m.get(id) : undefined);
}

/** Signed amount: income +, expense −; transfers positive (they are not income or expense). */
export function signedForExport(t: Pick<Transaction, 'type' | 'amountCents'>): number {
  return t.type === 'expense' ? -t.amountCents : t.amountCents;
}

const MOVEMENT_HEADER = [
  'Data',
  'Tipo',
  'Ambito',
  'Categoria',
  'Conto',
  'Conto destinazione',
  'Importo (€)',
  'Nota',
  'Tag',
  'Attività',
  'Codice ATECO',
  'N. fattura',
  'Cliente',
  'Debito',
];

/** Movements sorted by date (oldest first, so running totals in Excel make sense). */
export function movementsTable(
  txs: readonly Transaction[],
  l: Lookups,
  name = 'Movimenti',
): ExportTable {
  const cat = byId(l.categories);
  const acc = byId(l.accounts);
  const act = byId(l.activities);
  const debt = byId(l.debts);
  const rows = [...txs]
    .filter((t) => !t.deleted)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => {
      const a = act(t.activityId);
      return [
        date(t.date),
        text(TYPE_LABEL[t.type]),
        text(SCOPE_LABEL[t.scope]),
        text(t.type === 'transfer' ? '' : (cat(t.categoryId)?.name ?? '')),
        text(acc(t.accountId)?.name ?? ''),
        text(acc(t.toAccountId)?.name ?? ''),
        money(signedForExport(t)),
        text(t.note),
        text(t.tags.join(', ')),
        text(a?.name ?? ''),
        text(a?.atecoCode ?? ''),
        text(t.invoiceNumber ?? ''),
        text(t.client ?? ''),
        text(debt(t.debtId)?.name ?? ''),
      ];
    });
  return { name, header: MOVEMENT_HEADER, rows };
}

/** Totals and expenses by category for the exported period. */
export function summaryTable(
  txs: readonly Transaction[],
  range: DateRange,
  scope: ScopeFilter,
  l: Pick<Lookups, 'categories'>,
): ExportTable {
  const live = txs.filter((t) => !t.deleted);
  const t = totals(live);
  const cat = byId(l.categories);
  const exp = byCategory(live, 'expense', range);
  const inc = byCategory(live, 'income', range);
  const rows: Cell[][] = [
    [text('Periodo'), text(`${range.from} – ${range.to}`)],
    [text('Ambito'), text(SCOPE_FILTER_LABEL[scope])],
    [text('Entrate'), money(t.incomeCents)],
    [text('Uscite'), money(t.expenseCents)],
    [text('Saldo'), money(t.netCents)],
    [],
  ];
  const bold: number[] = [];
  const section = (title: string, data: ReturnType<typeof byCategory>) => {
    bold.push(rows.length);
    rows.push([text(title), text('Importo (€)'), text('Quota'), text('Movimenti')]);
    for (const r of data.rows)
      rows.push([
        text(cat(r.categoryId)?.name ?? 'Senza categoria'),
        money(r.cents),
        { kind: 'percentBp', bp: r.shareBp },
        { kind: 'int', value: r.count },
      ]);
    rows.push([]);
  };
  section('Uscite per categoria', exp);
  section('Entrate per categoria', inc);
  return { name: 'Riepilogo', header: ['Voce', 'Valore'], rows, boldRows: bold };
}

/** Professional summary for a year (income by month/activity/client, expenses). */
export function businessSummaryTable(
  r: BusinessReport,
  l: Pick<Lookups, 'categories' | 'activities'>,
): ExportTable {
  const cat = byId(l.categories);
  const act = byId(l.activities);
  const rows: Cell[][] = [
    [text('Anno'), { kind: 'int', value: r.year }],
    [text('Incassi'), money(r.incomeCents)],
    [text('Spese di lavoro (escluse imposte e contributi)'), money(r.expenseCents)],
    [text('Imposta sostitutiva e contributi INPS pagati'), money(r.taxesCents)],
    [text('Fatture registrate'), { kind: 'int', value: r.invoiceCount }],
    [],
  ];
  const bold: number[] = [];
  const title = (cells: string[]) => {
    bold.push(rows.length);
    rows.push(cells.map(text));
  };
  title(['Mese', 'Incassi (€)', 'Cumulato (€)']);
  for (const m of r.months)
    rows.push([text(m.month), money(m.incomeCents), money(m.cumulativeCents)]);
  rows.push([]);
  title(['Attività', 'Incassi (€)', 'Movimenti']);
  for (const a of r.byActivity)
    rows.push([
      text(a.key ? (act(a.key)?.name ?? 'Attività eliminata') : 'Senza attività'),
      money(a.cents),
      { kind: 'int', value: a.count },
    ]);
  rows.push([]);
  title(['Cliente', 'Incassi (€)', 'Movimenti']);
  for (const c of r.byClient)
    rows.push([text(c.key || 'Senza cliente'), money(c.cents), { kind: 'int', value: c.count }]);
  rows.push([]);
  title(['Spese di lavoro per categoria', 'Importo (€)', 'Movimenti']);
  for (const e of r.expensesByCategory)
    rows.push([
      text(cat(e.key)?.name ?? 'Senza categoria'),
      money(e.cents),
      { kind: 'int', value: e.count },
    ]);
  return { name: `Lavoro ${r.year}`, header: ['Voce', 'Valore'], rows, boldRows: bold };
}

const RAW_SHEET_NAME: Record<SyncedTable, string> = {
  transactions: 'Dati movimenti',
  activities: 'Dati attività',
  categories: 'Dati categorie',
  accounts: 'Dati conti',
  budgets: 'Dati soglie',
  recurring: 'Dati ricorrenze',
  debts: 'Dati debiti',
  taxParams: 'Dati parametri fiscali',
  profile: 'Dati profilo',
};

/** One table as stored (same columns as the Google Sheet), deleted rows excluded. */
export function rawTable<T extends SyncedTable>(
  table: T,
  records: readonly SyncedRecordMap[T][],
): ExportTable {
  const header = columnNames(table);
  return {
    name: RAW_SHEET_NAME[table],
    header,
    rows: records
      .filter((r) => !r.deleted)
      .map((r) => {
        const row = toRow(table, r);
        return header.map((h) => text(row[h] ?? ''));
      }),
  };
}

// ---------------------------------------------------------------------------------------------
// CSV (Excel/Numbers in Italian: semicolon separator, decimal comma, dd/mm/yyyy, UTF-8 BOM)

function csvValue(c: Cell | undefined): string {
  if (!c) return '';
  switch (c.kind) {
    case 'text':
      return c.value;
    case 'money': {
      const neg = c.cents < 0;
      const abs = Math.abs(c.cents);
      return `${neg ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
    }
    case 'date':
      return `${c.iso.slice(8, 10)}/${c.iso.slice(5, 7)}/${c.iso.slice(0, 4)}`;
    case 'int':
      return String(c.value);
    case 'percentBp':
      return `${Math.floor(c.bp / 100)},${String(c.bp % 100).padStart(2, '0')}%`;
  }
}

function csvEscape(s: string): string {
  // Neutralise spreadsheet formulas (CSV injection) in free text such as notes.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(t: ExportTable): string {
  const lines = [t.header, ...t.rows.map((r) => r.map(csvValue))].map((cells) =>
    cells.map(csvEscape).join(';'),
  );
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
