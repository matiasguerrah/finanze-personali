import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  Activity,
  Budget,
  Category,
  Debt,
  OutboxEntry,
  Recurring,
  Setting,
  TaxParams,
  Transaction,
} from './types';

export class ContiDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  activities!: EntityTable<Activity, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  recurring!: EntityTable<Recurring, 'id'>;
  debts!: EntityTable<Debt, 'id'>;
  taxParams!: EntityTable<TaxParams, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;

  constructor(name = 'conti') {
    super(name);
    // Booleans (deleted, active, archived) cannot be indexed in IndexedDB: filter in memory.
    this.version(1).stores({
      transactions:
        'id, date, type, scope, categoryId, accountId, activityId, recurringId, debtId, splitGroupId, updatedAt, *tags',
      activities: 'id, activeFrom, sortOrder',
      categories: 'id, type, sortOrder',
      accounts: 'id, sortOrder',
      budgets: 'id, scope, categoryId',
      recurring: 'id, nextDueDate',
      debts: 'id',
      taxParams: 'id, validFromYear',
      settings: 'key',
      outbox: '++seq, &[table+recordId]',
    });
  }
}

export const db = new ContiDB();
