/**
 * Sync data model: how each record becomes a Google Sheet row (all cells are plain text) and back,
 * plus the last-write-wins rule. The column lists are the single source of truth for the Sheet:
 * the client sends them with every push and the Apps Script adds missing columns by itself.
 */
import type {
  Account,
  Activity,
  BaseRecord,
  Budget,
  Category,
  Debt,
  Profile,
  Recurring,
  SyncedRecordMap,
  SyncedTable,
  TaxParams,
  Transaction,
} from '../../db/types';

/** How a value is written to a cell. `opt*` columns may be empty (field absent). */
export type ColumnKind = 'str' | 'int' | 'bool' | 'json' | 'optStr' | 'optInt';

interface Col<T> {
  name: Extract<keyof T, string>;
  kind: ColumnKind;
}

type Base = 'id' | 'createdAt' | 'updatedAt' | 'deleted';

/**
 * Declares the columns of a table. Fails to COMPILE if a field of the record type is missing,
 * so a new field can never be silently dropped by sync.
 */
function columns<T extends BaseRecord>() {
  return <const C extends readonly Col<T>[]>(
    cols: C &
      (Exclude<keyof T, Base | C[number]['name']> extends never
        ? unknown
        : { missingColumns: Exclude<keyof T, Base | C[number]['name']> }),
  ): readonly Col<T>[] => [
    { name: 'id' as Extract<keyof T, string>, kind: 'str' },
    { name: 'createdAt' as Extract<keyof T, string>, kind: 'str' },
    { name: 'updatedAt' as Extract<keyof T, string>, kind: 'str' },
    { name: 'deleted' as Extract<keyof T, string>, kind: 'bool' },
    ...cols,
  ];
}

export const COLUMNS: { [K in SyncedTable]: readonly Col<SyncedRecordMap[K]>[] } = {
  transactions: columns<Transaction>()([
    { name: 'date', kind: 'str' },
    { name: 'type', kind: 'str' },
    { name: 'amountCents', kind: 'int' },
    { name: 'scope', kind: 'str' },
    { name: 'categoryId', kind: 'str' },
    { name: 'accountId', kind: 'str' },
    { name: 'toAccountId', kind: 'optStr' },
    { name: 'activityId', kind: 'optStr' },
    { name: 'note', kind: 'str' },
    { name: 'tags', kind: 'json' },
    { name: 'recurringId', kind: 'optStr' },
    { name: 'debtId', kind: 'optStr' },
    { name: 'invoiceNumber', kind: 'optStr' },
    { name: 'client', kind: 'optStr' },
    { name: 'splitGroupId', kind: 'optStr' },
  ]),
  activities: columns<Activity>()([
    { name: 'name', kind: 'str' },
    { name: 'atecoCode', kind: 'str' },
    { name: 'coefficientBp', kind: 'int' },
    { name: 'activeFrom', kind: 'str' },
    { name: 'activeTo', kind: 'optStr' },
    { name: 'sortOrder', kind: 'int' },
  ]),
  categories: columns<Category>()([
    { name: 'name', kind: 'str' },
    { name: 'type', kind: 'str' },
    { name: 'defaultScope', kind: 'str' },
    { name: 'icon', kind: 'str' },
    { name: 'color', kind: 'str' },
    { name: 'sortOrder', kind: 'int' },
    { name: 'archived', kind: 'bool' },
    { name: 'systemKey', kind: 'optStr' },
  ]),
  accounts: columns<Account>()([
    { name: 'name', kind: 'str' },
    { name: 'type', kind: 'str' },
    { name: 'defaultScope', kind: 'str' },
    { name: 'initialBalanceCents', kind: 'int' },
    { name: 'icon', kind: 'str' },
    { name: 'color', kind: 'str' },
    { name: 'sortOrder', kind: 'int' },
    { name: 'archived', kind: 'bool' },
  ]),
  budgets: columns<Budget>()([
    { name: 'scope', kind: 'str' },
    { name: 'target', kind: 'str' },
    { name: 'categoryId', kind: 'optStr' },
    { name: 'period', kind: 'str' },
    { name: 'limitCents', kind: 'int' },
    { name: 'warnAtBp', kind: 'int' },
    { name: 'active', kind: 'bool' },
  ]),
  recurring: columns<Recurring>()([
    { name: 'name', kind: 'str' },
    { name: 'amountCents', kind: 'int' },
    { name: 'estimated', kind: 'bool' },
    { name: 'scope', kind: 'str' },
    { name: 'categoryId', kind: 'str' },
    { name: 'accountId', kind: 'str' },
    { name: 'frequency', kind: 'str' },
    { name: 'customDays', kind: 'optInt' },
    { name: 'nextDueDate', kind: 'str' },
    { name: 'anchorDay', kind: 'optInt' },
    { name: 'reminderDaysBefore', kind: 'int' },
    { name: 'active', kind: 'bool' },
    { name: 'taxKind', kind: 'optStr' },
  ]),
  debts: columns<Debt>()([
    { name: 'name', kind: 'str' },
    { name: 'creditor', kind: 'str' },
    { name: 'principalCents', kind: 'int' },
    { name: 'annualRateBp', kind: 'int' },
    { name: 'installmentCents', kind: 'int' },
    { name: 'startDate', kind: 'str' },
    { name: 'plannedInstallments', kind: 'optInt' },
    { name: 'notes', kind: 'str' },
  ]),
  taxParams: columns<TaxParams>()([
    { name: 'validFromYear', kind: 'int' },
    { name: 'substituteTaxBp', kind: 'int' },
    { name: 'contributionRateBp', kind: 'int' },
    { name: 'fixedContributionCents', kind: 'int' },
    { name: 'revenueThresholdCents', kind: 'int' },
  ]),
  profile: columns<Profile>()([
    { name: 'firstName', kind: 'str' },
    { name: 'lastName', kind: 'str' },
    { name: 'vatNumber', kind: 'str' },
    { name: 'taxCode', kind: 'str' },
    { name: 'pec', kind: 'str' },
  ]),
};

export function columnNames(table: SyncedTable): string[] {
  return COLUMNS[table].map((c) => c.name);
}

/** A Sheet row as exchanged with the Apps Script: column name → text. */
export type Row = Record<string, string>;

export function toRow<T extends SyncedTable>(table: T, record: SyncedRecordMap[T]): Row {
  const row: Row = {};
  const r = record as unknown as Record<string, unknown>;
  for (const { name, kind } of COLUMNS[table]) {
    const v = r[name];
    if (v === undefined || v === null) row[name] = '';
    else if (kind === 'bool') row[name] = v ? 'TRUE' : 'FALSE';
    else if (kind === 'json') row[name] = JSON.stringify(v);
    else row[name] = String(v);
  }
  return row;
}

export class RowError extends Error {}

/** Parses a row; throws RowError on malformed cells (e.g. a number edited by hand in the Sheet). */
export function fromRow<T extends SyncedTable>(table: T, row: Row): SyncedRecordMap[T] {
  const out: Record<string, unknown> = {};
  for (const { name, kind } of COLUMNS[table]) {
    const raw = row[name] ?? '';
    const s = typeof raw === 'string' ? raw : String(raw);
    switch (kind) {
      case 'str':
        out[name] = s;
        break;
      case 'optStr':
        if (s !== '') out[name] = s;
        break;
      case 'bool':
        out[name] = s.toUpperCase() === 'TRUE';
        break;
      case 'int':
      case 'optInt': {
        if (s === '' && kind === 'optInt') break;
        const n = Number(s);
        if (!Number.isSafeInteger(n))
          throw new RowError(`${table}.${name}: «${s}» non è un intero`);
        out[name] = n;
        break;
      }
      case 'json':
        try {
          out[name] = s === '' ? [] : JSON.parse(s);
        } catch {
          throw new RowError(`${table}.${name}: JSON non valido`);
        }
        break;
    }
  }
  if (!out.id) throw new RowError(`${table}: riga senza id`);
  return out as unknown as SyncedRecordMap[T];
}

/** Last-write-wins: a remote version replaces the local one only if strictly newer. */
export function shouldApplyRemote(
  local: Pick<BaseRecord, 'updatedAt'> | undefined,
  remote: Pick<BaseRecord, 'updatedAt'>,
): boolean {
  return !local || remote.updatedAt > local.updatedAt;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---- Wire protocol (client ⇄ Apps Script) ----

export interface PushRequest {
  action: 'push';
  key: string;
  tables: Partial<Record<SyncedTable, { columns: string[]; rows: Row[] }>>;
}
export interface PullRequest {
  action: 'pull';
  key: string;
  /** `_serverUpdatedAt` of the last pull ('' = everything). */
  since: string;
}
export interface PingRequest {
  action: 'ping';
  key: string;
}
export type SyncRequest = PushRequest | PullRequest | PingRequest;

export interface PushResponse {
  ok: true;
  serverTime: string;
  written: number;
  /** Rows the server kept because its copy is newer: the client must adopt them. */
  conflicts: Partial<Record<SyncedTable, Row[]>>;
}
export interface PullResponse {
  ok: true;
  serverTime: string;
  tables: Partial<Record<SyncedTable, Row[]>>;
}
export interface PingResponse {
  ok: true;
  serverTime: string;
}
export interface ErrorResponse {
  ok: false;
  error: string;
}
