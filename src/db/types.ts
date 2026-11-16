/**
 * Data model. Every synced table has a matching tab in the Google Sheet with the same columns.
 *
 * Conventions:
 * - money: integer cents (`...Cents`)
 * - percentages / rates: integer basis points (`...Bp`, 10000 = 100%)
 * - calendar dates: `YYYY-MM-DD` in Europe/Rome
 * - timestamps: ISO 8601 UTC (`2026-11-08T13:00:00.000Z`)
 */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string; // ISO 8601 UTC

export type Scope = 'personal' | 'business';
export type ScopeFilter = Scope | 'all';
export type TxType = 'expense' | 'income' | 'transfer';
export type CategoryType = 'expense' | 'income';

export interface BaseRecord {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deleted: boolean;
}

export interface Transaction extends BaseRecord {
  date: ISODate;
  type: TxType;
  /** Always positive; the sign is given by `type`. */
  amountCents: number;
  scope: Scope;
  /** Empty string for transfers. */
  categoryId: string;
  accountId: string;
  /** Destination account, only for transfers. */
  toAccountId?: string;
  /** Required for business income. */
  activityId?: string;
  note: string;
  tags: string[];
  recurringId?: string;
  debtId?: string;
  invoiceNumber?: string;
  client?: string;
  /** Shared by the two halves created by the "Dividi" action. */
  splitGroupId?: string;
}

export interface Activity extends BaseRecord {
  name: string;
  atecoCode: string;
  coefficientBp: number;
  activeFrom: ISODate;
  /** Empty/undefined while still active. */
  activeTo?: ISODate;
  sortOrder: number;
}

/** Categories the app logic needs to recognise regardless of their (editable) name. */
export type CategorySystemKey = 'inps' | 'substituteTax' | 'invoices' | 'debtPayments';

export interface Category extends BaseRecord {
  name: string;
  type: CategoryType;
  defaultScope: Scope;
  /** lucide-react icon name, see src/components/icons.ts */
  icon: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  systemKey?: CategorySystemKey;
}

export type AccountType = 'bank' | 'cash' | 'card' | 'other';

export interface Account extends BaseRecord {
  name: string;
  type: AccountType;
  defaultScope: Scope;
  initialBalanceCents: number;
  icon: string;
  color: string;
  sortOrder: number;
  archived: boolean;
}

export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export interface Budget extends BaseRecord {
  scope: ScopeFilter;
  target: 'global' | 'category';
  categoryId?: string;
  period: BudgetPeriod;
  limitCents: number;
  warnAtBp: number;
  active: boolean;
}

export type RecurringFrequency = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'custom';
export type TaxKind = 'balanceAndFirstAdvance' | 'secondAdvance';

export interface Recurring extends BaseRecord {
  name: string;
  amountCents: number;
  estimated: boolean;
  scope: Scope;
  categoryId: string;
  accountId: string;
  frequency: RecurringFrequency;
  /** Only for `custom` frequency. */
  customDays?: number;
  nextDueDate: ISODate;
  /**
   * Day of month (1–31) the due date returns to, for month-based frequencies: without it a
   * 31 Jan monthly payment would drift to 28 Feb and then stay on the 28th forever.
   */
  anchorDay?: number;
  reminderDaysBefore: number;
  active: boolean;
  taxKind?: TaxKind;
}

/**
 * notice: a single amount due by a date (e.g. avviso bonario, cartella).
 * installments: a monthly repayment plan (loan, or a notice that has been rateizzato).
 */
export type DebtState = 'notice' | 'installments';

export interface Debt extends BaseRecord {
  name: string;
  state: DebtState;
  /** Amount and due date of the original notice; kept after it becomes a plan. */
  noticeAmountCents?: number;
  noticeDueDate?: ISODate;
  /**
   * When a notice became a plan (ISO UTC timestamp): payments recorded before it paid the notice,
   * not the plan. A timestamp, not a date, so a partial payment and the rateizzazione on the same
   * day are still told apart.
   */
  rateizedAt?: string;
  creditor: string;
  principalCents: number;
  annualRateBp: number;
  installmentCents: number;
  startDate: ISODate;
  plannedInstallments?: number;
  notes: string;
}

export interface TaxParams extends BaseRecord {
  validFromYear: number;
  substituteTaxBp: number;
  contributionRateBp: number;
  fixedContributionCents: number;
  revenueThresholdCents: number;
  /**
   * Advances (acconti) as a share of the previous year's amount ("metodo storico"), used only to
   * propose the amounts of the fiscal deadlines. Optional: without them nothing is proposed.
   */
  taxFirstAdvanceBp?: number;
  taxSecondAdvanceBp?: number;
  /** Applied to the proportional part of the contributions (the fixed quota is paid apart). */
  contributionFirstAdvanceBp?: number;
  contributionSecondAdvanceBp?: number;
}

/**
 * The owner's identity data. A single record with the fixed id PROFILE_ID, so devices that create
 * it independently converge on the same row. The ATECO codes live in `activities` (they change
 * over time), not here. Every field may be empty.
 */
export interface Profile extends BaseRecord {
  firstName: string;
  lastName: string;
  /** Partita IVA, 11 digits without the IT prefix. */
  vatNumber: string;
  /** Codice fiscale, uppercase. */
  taxCode: string;
  pec: string;
}

export const PROFILE_ID = '00000000-0000-4000-8000-000000009001';

/** Local-only key/value store (never synced). */
export interface Setting {
  key: string;
  value: unknown;
}

export const SYNCED_TABLES = [
  'transactions',
  'activities',
  'categories',
  'accounts',
  'budgets',
  'recurring',
  'debts',
  'taxParams',
  'profile',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface SyncedRecordMap {
  transactions: Transaction;
  activities: Activity;
  categories: Category;
  accounts: Account;
  budgets: Budget;
  recurring: Recurring;
  debts: Debt;
  taxParams: TaxParams;
  profile: Profile;
}

/** Local-only queue of changes waiting to be pushed. One row per (table, recordId). */
export interface OutboxEntry {
  seq?: number;
  table: SyncedTable;
  recordId: string;
  payload: BaseRecord;
  queuedAt: ISODateTime;
}

/** Fields the caller provides when creating a record. */
export type NewRecord<T extends BaseRecord> = Omit<T, keyof BaseRecord> & { id?: string };
