import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useDebtPayments, useDebts } from '../../db/hooks';
import type { Debt } from '../../db/types';
import {
  DEBT_STATE_LABEL,
  debtPayments,
  noticeDueText,
  tryDebtStatus,
  type DebtStatus,
} from '../../lib/debts';
import { formatMonthYear, formatShortDate, todayRome } from '../../lib/dates';
import { Amount } from '../../components/Amount';
import { primaryButton } from '../../components/form';
import { DebtForm } from './DebtForm';

export function DebtsPage() {
  const debts = useDebts();
  const payments = useDebtPayments();
  const [creating, setCreating] = useState(false);
  const today = todayRome();

  if (!debts || !payments) return null;
  const rows = debts.map((d) => ({
    debt: d,
    s: tryDebtStatus(d, debtPayments(d.id, payments), today),
  }));
  const open = rows.filter((r) => !r.s?.paidOff);
  const closed = rows.filter((r) => r.s?.paidOff);
  const totalRemaining = open.reduce((t, r) => t + (r.s?.remainingCents ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {open.length > 0 && (
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-sm text-muted">Restano da pagare, interessi compresi</p>
          <p className="text-3xl font-semibold">
            <Amount cents={totalRemaining} />
          </p>
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
          Nessun debito. Aggiungi un avviso da pagare, un prestito o una rateizzazione per seguire
          scadenze, rate, residuo e data di estinzione.
        </p>
      )}

      {open.length > 0 && (
        <ul className="flex flex-col gap-3">
          {open.map((r) => (
            <DebtCard key={r.debt.id} debt={r.debt} s={r.s} today={today} />
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setCreating(true)} className={primaryButton}>
        <Plus size={20} aria-hidden="true" /> Nuovo debito
      </button>

      {closed.length > 0 && (
        <section aria-labelledby="closed-h">
          <h2 id="closed-h" className="mb-2 px-1 text-sm font-semibold text-muted">
            Estinti
          </h2>
          <ul className="flex flex-col gap-3 opacity-80">
            {closed.map((r) => (
              <DebtCard key={r.debt.id} debt={r.debt} s={r.s} today={today} />
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-xs text-muted">
        I conteggi si basano sulle spese collegate al debito: nel tastierino scegli il debito in
        «Collega a un debito», oppure usa «Registra rata» o «Registra pagamento» nella pagina del
        debito.
      </p>

      {creating && <DebtForm onClose={() => setCreating(false)} />}
    </div>
  );
}

export function StateBadge({ debt }: { debt: Debt }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
        debt.state === 'notice' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent'
      }`}
    >
      {DEBT_STATE_LABEL[debt.state]}
    </span>
  );
}

function DebtCard({ debt, s, today }: { debt: Debt; s: DebtStatus | null; today: string }) {
  const header = (right: React.ReactNode) => (
    <span className="flex items-baseline gap-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{debt.name}</span>
          <StateBadge debt={debt} />
        </span>
        {debt.creditor && <span className="truncate text-sm text-muted">{debt.creditor}</span>}
      </span>
      {right}
      <ChevronRight size={18} className="shrink-0 self-center text-muted" aria-hidden="true" />
    </span>
  );
  const link = 'flex flex-col gap-2 rounded-2xl bg-surface p-4 hover:bg-surface-2';
  if (!s)
    return (
      <li>
        <Link to={`/altro/debiti/${debt.id}`} className={link}>
          {header(null)}
          <span className="text-sm text-danger">Dati incompleti: apri il debito e correggilo.</span>
        </Link>
      </li>
    );
  const pct = Math.floor(s.paidBp / 100);
  const notice = debt.state === 'notice';
  return (
    <li>
      <Link to={`/altro/debiti/${debt.id}`} className={link}>
        {header(
          <span className="shrink-0 text-right">
            <Amount cents={s.remainingCents} className="font-semibold" />
            <span className="block text-xs text-muted">da pagare</span>
          </span>,
        )}
        <span
          role="progressbar"
          aria-label={`${debt.name}: estinto al ${pct}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${s.paidBp / 100}%` }}
          />
        </span>
        <span className="flex justify-between gap-2 text-xs text-muted">
          {notice && !s.paidOff ? (
            <>
              <span className={s.installmentsLate > 0 ? 'text-warn' : ''}>
                {noticeDueText(s.payoffDate, today)}
              </span>
              <span>scadenza {formatShortDate(s.payoffDate)}</span>
            </>
          ) : (
            <>
              <span>
                {notice
                  ? `pagato ${pct}%`
                  : `${s.installmentsPaid}/${s.installmentsTotal} rate · ${pct}%`}
                {!notice && s.installmentsLate > 0 && (
                  <span className="text-warn">
                    {' '}
                    ·{' '}
                    {s.installmentsLate === 1
                      ? '1 rata in ritardo'
                      : `${s.installmentsLate} rate in ritardo`}
                  </span>
                )}
              </span>
              <span>
                {s.paidOff ? 'estinto a ' : 'fine prevista '}
                {formatMonthYear(s.payoffDate)}
              </span>
            </>
          )}
        </span>
      </Link>
    </li>
  );
}
