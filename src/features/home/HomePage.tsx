import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import {
  useAccountBalances,
  useAccounts,
  useCategories,
  useRecurring,
  useTransactionsBetween,
} from '../../db/hooks';
import { totalBalance } from '../../lib/balances';
import { attentionCount } from '../../lib/recurring';
import type { CategoryType } from '../../db/types';
import { monthRange, todayRome } from '../../lib/dates';
import { filterByScope, totals } from '../../lib/transactions';
import { useScopeFilter } from '../../state/scopeFilter';
import { useOpenEntry } from '../../state/entry';
import { Segmented } from '../../components/Segmented';
import { Amount } from '../../components/Amount';
import { CategoryGrid } from '../quick-entry/CategoryGrid';
import { BudgetsSummary } from '../budgets/BudgetsSummary';

export function HomePage() {
  const [type, setType] = useState<CategoryType>('expense');
  const categories = useCategories();
  const { scope } = useScopeFilter();
  const openEntry = useOpenEntry();
  const today = todayRome();
  const range = monthRange(today);
  const accounts = useAccounts();
  const balances = useAccountBalances(today);
  const recurring = useRecurring();
  const due = recurring ? attentionCount(recurring, today) : 0;
  const balance = balances
    ? totalBalance(
        balances,
        accounts.filter((a) => !a.archived).map((a) => a.id),
      )
    : undefined;
  const monthTx = useTransactionsBetween(range.from, range.to);
  const t = useMemo(() => totals(filterByScope(monthTx ?? [], scope)), [monthTx, scope]);

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/altro/conti"
        className="flex min-h-11 items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-surface-2"
      >
        <span className="flex flex-1 flex-col">
          <span className="text-xs text-muted">Saldo conti</span>
          <span className="text-2xl font-semibold">
            {balance !== undefined ? <Amount cents={balance} /> : '…'}
          </span>
        </span>
        <ChevronRight size={18} className="text-muted" aria-hidden="true" />
      </Link>

      {due > 0 && (
        <Link
          to="/scadenze"
          className="flex min-h-11 items-center gap-3 rounded-2xl border border-warn/40 bg-surface p-4 hover:bg-surface-2"
        >
          <CalendarClock size={20} className="text-warn" aria-hidden="true" />
          <span className="flex-1 font-medium">
            {due === 1 ? '1 scadenza da pagare' : `${due} scadenze da pagare`}
          </span>
          <ChevronRight size={18} className="text-muted" aria-hidden="true" />
        </Link>
      )}

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface p-4">
          <dt className="text-xs text-muted">Uscite del mese</dt>
          <dd className="text-2xl font-semibold">
            <Amount cents={t.expenseCents} />
          </dd>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <dt className="text-xs text-muted">Entrate del mese</dt>
          <dd className="text-2xl font-semibold">
            <Amount cents={t.incomeCents} className="text-income" />
          </dd>
        </div>
      </dl>

      <Segmented
        label="Tipo di movimento"
        value={type}
        onChange={setType}
        options={[
          { value: 'expense', label: 'Spesa' },
          { value: 'income', label: 'Entrata' },
        ]}
      />

      <CategoryGrid
        categories={categories}
        type={type}
        scope={scope}
        onPick={(c) => openEntry({ mode: 'new', type, categoryId: c.id })}
      />

      <BudgetsSummary scope={scope} />
    </div>
  );
}
