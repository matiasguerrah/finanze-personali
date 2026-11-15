import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { useAccounts, useCategories, useTransactionsBetween } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { Transaction } from '../../db/types';
import {
  addMonthsISO,
  formatDayHeading,
  fromISODate,
  monthRange,
  todayRome,
} from '../../lib/dates';
import { filterByScope, groupByDay, totals } from '../../lib/transactions';
import { useScopeFilter } from '../../state/scopeFilter';
import { useToast } from '../../state/toast';
import { useOpenEntry } from '../../state/entry';
import { Amount } from '../../components/Amount';
import { TransactionRow } from './TransactionRow';
import { SplitSheet } from './SplitSheet';
import { mergeSplit } from './actions';

export function TransactionsPage() {
  const [month, setMonth] = useState(() => monthRange(todayRome()).from);
  const range = monthRange(month);
  const all = useTransactionsBetween(range.from, range.to);
  const categories = useCategories();
  const accounts = useAccounts();
  const { scope } = useScopeFilter();
  const toast = useToast();
  const openEntry = useOpenEntry();
  const [splitting, setSplitting] = useState<Transaction | null>(null);

  const txs = useMemo(() => filterByScope(all ?? [], scope), [all, scope]);
  const groups = useMemo(() => groupByDay(txs), [txs]);
  const t = totals(txs);
  const byId = <T extends { id: string }>(list: T[], id?: string) => list.find((x) => x.id === id);

  async function remove(tx: Transaction) {
    await repo.softDelete('transactions', tx.id);
    toast({
      message: 'Movimento eliminato',
      action: { label: 'Annulla', onClick: () => void repo.restore('transactions', tx.id) },
    });
  }

  const monthLabel = format(fromISODate(month), 'MMMM yyyy', { locale: it });
  const isCurrentMonth = month === monthRange(todayRome()).from;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Mese precedente"
          onClick={() => setMonth(addMonthsISO(month, -1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface"
        >
          <ChevronLeft />
        </button>
        <h2 className="text-lg font-semibold capitalize" aria-live="polite">
          {monthLabel}
        </h2>
        <button
          type="button"
          aria-label="Mese successivo"
          disabled={isCurrentMonth}
          onClick={() => setMonth(addMonthsISO(month, 1))}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface disabled:opacity-30"
        >
          <ChevronRight />
        </button>
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface p-4 text-center">
        <div>
          <dt className="text-xs text-muted">Entrate</dt>
          <dd className="font-semibold">
            <Amount cents={t.incomeCents} className="text-income" />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Uscite</dt>
          <dd className="font-semibold">
            <Amount cents={t.expenseCents} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Netto</dt>
          <dd className="font-semibold">
            <Amount cents={t.netCents} />
          </dd>
        </div>
      </dl>

      {all !== undefined && groups.length === 0 && (
        <p className="py-12 text-center text-muted">Nessun movimento in questo mese.</p>
      )}

      {/* Wait for categories too, or rows would flash "Senza categoria" on first load. */}
      {categories.length > 0 &&
        groups.map((g) => (
          <section key={g.date} aria-label={formatDayHeading(g.date)}>
            <header className="flex items-baseline justify-between px-2 pb-1 text-sm text-muted">
              <h3 className="font-medium first-letter:uppercase">{formatDayHeading(g.date)}</h3>
              <Amount cents={g.netCents} />
            </header>
            <ul className="flex flex-col divide-y divide-line">
              {g.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  category={byId(categories, tx.categoryId)}
                  account={byId(accounts, tx.accountId)}
                  toAccount={byId(accounts, tx.toAccountId)}
                  onEdit={() => openEntry({ mode: 'edit', tx })}
                  onDelete={() => void remove(tx)}
                  onSplit={
                    tx.type === 'expense' && !tx.splitGroupId ? () => setSplitting(tx) : undefined
                  }
                  onMerge={tx.splitGroupId ? () => void mergeSplit(tx) : undefined}
                />
              ))}
            </ul>
          </section>
        ))}

      {splitting && <SplitSheet tx={splitting} onClose={() => setSplitting(null)} />}
    </div>
  );
}
