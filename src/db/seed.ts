/**
 * Default data. IDs are FIXED so that two devices seeding independently produce the same records
 * (no duplicates after sync), and timestamps are set far in the past so that any real user edit
 * always wins last-write-wins against a later seed on another device.
 *
 * Seeding is versioned: each step runs once per device and only inserts records that are missing.
 */
import type { ContiDB } from './db';
import { db as defaultDb } from './db';
import { createRepo, getSetting, setSetting } from './repo';
import type {
  Account,
  Category,
  CategorySystemKey,
  CategoryType,
  Recurring,
  Scope,
  TaxKind,
} from './types';
import { todayRome } from '../lib/dates';
import { nextYearlyOccurrence } from '../lib/recurring';

export const SEED_TIMESTAMP = '2000-01-01T00:00:00.000Z';

const seedId = (group: number, n: number) =>
  `00000000-0000-4000-8000-${String(group * 1000 + n).padStart(12, '0')}`;

type CategorySeed = [name: string, icon: string, color: string, systemKey?: CategorySystemKey];

const PERSONAL_EXPENSES: CategorySeed[] = [
  ['Spesa alimentare', 'ShoppingCart', 'green'],
  ['Bar e caffè', 'Coffee', 'amber'],
  ['Ristoranti', 'UtensilsCrossed', 'orange'],
  ['Trasporti', 'Bus', 'blue'],
  ['Carburante', 'Fuel', 'slate'],
  ['Casa/Affitto', 'House', 'indigo'],
  ['Bollette luce', 'Lightbulb', 'amber'],
  ['Bollette gas', 'Flame', 'orange'],
  ['Acqua', 'Droplets', 'cyan'],
  ['Internet/Telefono', 'Wifi', 'blue'],
  ['Abbonamenti digitali', 'Tv', 'violet'],
  ['Salute', 'HeartPulse', 'red'],
  ['Abbigliamento', 'Shirt', 'pink'],
  ['Svago', 'Gamepad2', 'violet'],
  ['Viaggi', 'Plane', 'cyan'],
  ['Regali', 'Gift', 'pink'],
  ['Altro', 'Shapes', 'slate'],
];

const BUSINESS_EXPENSES: CategorySeed[] = [
  ['Hardware e attrezzatura', 'Laptop', 'indigo'],
  ['Software e licenze', 'AppWindow', 'blue'],
  ['Cloud e hosting', 'Cloud', 'cyan'],
  ['Attrezzatura video', 'Video', 'red'],
  ['Formazione', 'GraduationCap', 'lime'],
  ['Trasferte lavoro', 'TrainFront', 'teal'],
  ['Coworking/Studio', 'Building2', 'slate'],
  ['Commercialista', 'Calculator', 'amber'],
  ['Contributi INPS', 'Landmark', 'teal', 'inps'],
  ['Imposta sostitutiva', 'Receipt', 'teal', 'substituteTax'],
];

const INCOME: Array<[...CategorySeed, Scope]> = [
  ['Fatture/Compensi', 'FileText', 'green', 'invoices', 'business'],
  ['Rimborsi', 'RotateCcw', 'cyan', undefined, 'personal'],
  ['Altro', 'Coins', 'slate', undefined, 'personal'],
];

function category(
  id: string,
  [name, icon, color, systemKey]: CategorySeed,
  type: CategoryType,
  defaultScope: Scope,
  sortOrder: number,
): Category {
  const c: Category = {
    id,
    name,
    icon,
    color,
    type,
    defaultScope,
    sortOrder,
    archived: false,
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    deleted: false,
  };
  if (systemKey) c.systemKey = systemKey;
  return c;
}

export function defaultCategories(): Category[] {
  return [
    ...PERSONAL_EXPENSES.map((s, i) => category(seedId(1, i + 1), s, 'expense', 'personal', i + 1)),
    ...BUSINESS_EXPENSES.map((s, i) =>
      category(seedId(2, i + 1), s, 'expense', 'business', 100 + i + 1),
    ),
    ...INCOME.map(([n, ic, col, key, scope], i) =>
      category(seedId(3, i + 1), [n, ic, col, key], 'income', scope, i + 1),
    ),
  ];
}

export const DEFAULT_ACCOUNT_ID = seedId(4, 1);

export function defaultAccounts(): Account[] {
  const common = { createdAt: SEED_TIMESTAMP, updatedAt: SEED_TIMESTAMP, deleted: false };
  return [
    {
      ...common,
      id: DEFAULT_ACCOUNT_ID,
      name: 'Conto corrente',
      type: 'bank',
      defaultScope: 'personal',
      initialBalanceCents: 0,
      icon: 'Landmark',
      color: 'blue',
      sortOrder: 1,
      archived: false,
    },
    {
      ...common,
      id: seedId(4, 2),
      name: 'Contanti',
      type: 'cash',
      defaultScope: 'personal',
      initialBalanceCents: 0,
      icon: 'Wallet',
      color: 'green',
      sortOrder: 2,
      archived: false,
    },
  ];
}

/** Seed category ids that the fiscal recurrences point to (see BUSINESS_EXPENSES order). */
export const INPS_CATEGORY_ID = seedId(2, 9);
export const SUBSTITUTE_TAX_CATEGORY_ID = seedId(2, 10);

/**
 * Fiscal deadlines of the regime forfettario: balance + first advance (30 June) and second
 * advance (30 November), separately for the substitute tax and INPS contributions so each payment
 * lands in its own category. Amounts start at 0 ("da definire"): the tax estimate (phase 7) will
 * propose them. `today` decides the first due date of each one.
 */
export function defaultFiscalRecurrences(today: string): Recurring[] {
  const rows: Array<
    [n: number, name: string, categoryId: string, taxKind: TaxKind, month: number]
  > = [
    [
      1,
      'Imposta sostitutiva: saldo e 1° acconto',
      SUBSTITUTE_TAX_CATEGORY_ID,
      'balanceAndFirstAdvance',
      6,
    ],
    [2, 'Imposta sostitutiva: 2° acconto', SUBSTITUTE_TAX_CATEGORY_ID, 'secondAdvance', 11],
    [3, 'Contributi INPS: saldo e 1° acconto', INPS_CATEGORY_ID, 'balanceAndFirstAdvance', 6],
    [4, 'Contributi INPS: 2° acconto', INPS_CATEGORY_ID, 'secondAdvance', 11],
  ];
  return rows.map(([n, name, categoryId, taxKind, month]) => ({
    id: seedId(5, n),
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    deleted: false,
    name,
    amountCents: 0,
    estimated: true,
    scope: 'business',
    categoryId,
    accountId: DEFAULT_ACCOUNT_ID,
    frequency: 'yearly',
    nextDueDate: nextYearlyOccurrence(month, 30, today),
    anchorDay: 30,
    reminderDaysBefore: 14,
    active: true,
    taxKind,
  }));
}

/** Expense category proposed when paying an installment from the Debiti page (seed step 3). */
export const DEBT_PAYMENTS_CATEGORY_ID = seedId(1, 18);

export function debtPaymentsCategory(): Category {
  // sortOrder 18: after the step-1 personal categories, which cannot be renumbered.
  return category(
    DEBT_PAYMENTS_CATEGORY_ID,
    ['Rate e prestiti', 'Banknote', 'red', 'debtPayments'],
    'expense',
    'personal',
    18,
  );
}

/** Ordered seed steps. Append new steps; never change or reorder existing ones. */
const STEPS: Array<(db: ContiDB) => Promise<void>> = [
  async (db) => {
    const repo = createRepo(db);
    const missing = async <T extends { id: string }>(rows: T[], t: 'categories' | 'accounts') => {
      const existing = new Set((await db.table(t).toCollection().primaryKeys()) as string[]);
      return rows.filter((r) => !existing.has(r.id));
    };
    await repo.putRaw('categories', await missing(defaultCategories(), 'categories'), {
      enqueue: true,
    });
    await repo.putRaw('accounts', await missing(defaultAccounts(), 'accounts'), { enqueue: true });
  },
  // 2: fiscal recurrences (phase 2).
  async (db) => {
    const repo = createRepo(db);
    const existing = new Set((await db.recurring.toCollection().primaryKeys()) as string[]);
    const rows = defaultFiscalRecurrences(todayRome()).filter((r) => !existing.has(r.id));
    await repo.putRaw('recurring', rows, { enqueue: true });
  },
  // 3: category for debt installments (phase 5).
  async (db) => {
    const repo = createRepo(db);
    if (await db.categories.get(DEBT_PAYMENTS_CATEGORY_ID)) return;
    await repo.putRaw('categories', [debtPaymentsCategory()], { enqueue: true });
  },
];

export async function runSeed(db: ContiDB = defaultDb): Promise<void> {
  const done = await getSetting<number>('seedVersion', 0, db);
  for (let v = done; v < STEPS.length; v++) {
    await STEPS[v]!(db);
    await setSetting('seedVersion', v + 1, db);
  }
}
