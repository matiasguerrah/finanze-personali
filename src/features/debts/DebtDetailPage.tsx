import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarClock, Check, Pencil, Receipt, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { useCategories, useDebtPayments } from '../../db/hooks';
import { repo } from '../../db/repo';
import { debtPayments, noticeDueText, tryDebtStatus } from '../../lib/debts';
import { formatBp, formatCents } from '../../lib/money';
import { formatMonthYear, formatShortDate, todayRome } from '../../lib/dates';
import { Amount } from '../../components/Amount';
import { primaryButton } from '../../components/form';
import { useOpenEntry } from '../../state/entry';
import { useToast } from '../../state/toast';
import { DebtForm } from './DebtForm';
import { ResidualChart } from './ResidualChart';
import { StateBadge } from './DebtsPage';

export function DebtDetailPage() {
  const { id = '' } = useParams();
  const debt = useLiveQuery(() => db.debts.get(id), [id]);
  const allPayments = useDebtPayments();
  const categories = useCategories();
  const openEntry = useOpenEntry();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<false | 'edit' | 'rateize'>(false);
  const today = todayRome();

  if (debt === undefined || !allPayments) return null;
  if (debt.deleted) return <p className="text-muted">Questo debito è stato eliminato.</p>;

  const payments = debtPayments(debt.id, allPayments).sort((a, b) => b.date.localeCompare(a.date));
  const s = tryDebtStatus(debt, payments, today);
  const form = editing && (
    <DebtForm
      debt={debt}
      {...(editing === 'rateize' && s
        ? { initialState: 'installments' as const, suggestedPrincipalCents: s.remainingCents }
        : {})}
      onClose={() => setEditing(false)}
    />
  );
  if (!s)
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-surface p-4 text-sm text-danger" role="alert">
          I dati di «{debt.name}» sono incompleti (forse modificati a mano nel Google Sheet):
          correggili per vedere i conteggi.
        </p>
        <button type="button" onClick={() => setEditing('edit')} className={primaryButton}>
          <Pencil size={18} aria-hidden="true" /> Modifica
        </button>
        {form}
      </div>
    );
  const notice = debt.state === 'notice';
  const pct = Math.floor(s.paidBp / 100);
  const debtCategory = categories.find((c) => c.systemKey === 'debtPayments' && !c.archived);

  function registerInstallment() {
    openEntry({
      mode: 'new',
      type: 'expense',
      debtId: debt!.id,
      ...(debtCategory ? { categoryId: debtCategory.id } : {}),
      ...(s?.next ? { amountCents: s.next.amountCents } : {}),
    });
  }

  async function remove() {
    await repo.softDelete('debts', debt!.id);
    navigate('/altro/debiti');
    toast({
      message: `«${debt!.name}» eliminato. Le spese collegate restano nei movimenti.`,
      action: { label: 'Annulla', onClick: () => void repo.restore('debts', debt!.id) },
    });
  }

  const stat = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{debt.name}</h2>
            <StateBadge debt={debt} />
          </div>
          <p className="text-sm text-muted">
            {(notice
              ? [debt.creditor]
              : [
                  debt.creditor,
                  `TAN ${formatBp(debt.annualRateBp)}`,
                  `rata ${formatCents(debt.installmentCents)}`,
                ]
            )
              .filter(Boolean)
              .join(' · ')}
          </p>
          {!notice && debt.noticeAmountCents !== undefined && (
            <p className="text-sm text-muted">
              Da avviso di {formatCents(debt.noticeAmountCents)}
              {debt.noticeDueDate && ` con scadenza ${formatShortDate(debt.noticeDueDate)}`}
              {debt.rateizedAt &&
                `, rateizzato il ${formatShortDate(todayRome(new Date(debt.rateizedAt)))}`}
              {s.paidBeforePlanCents > 0 &&
                ` (già pagati ${formatCents(s.paidBeforePlanCents)}, non contati nelle rate)`}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted">{s.paidOff ? 'Estinto' : 'Restano da pagare'}</p>
          <p className="text-3xl font-semibold">
            <Amount cents={s.remainingCents} />
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={`Estinto al ${pct}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${s.paidBp / 100}%` }} />
        </div>
        {notice ? (
          <dl className="grid grid-cols-2 gap-3">
            {stat('Importo iniziale', formatCents(s.totalCents))}
            {stat('Pagato', `${formatCents(s.paidCents)} (${pct}%)`)}
            {stat(
              s.paidOff ? 'Pagato il' : 'Scadenza',
              formatShortDate(s.paidOff ? s.payoffDate : debt.noticeDueDate!),
            )}
            {!s.paidOff &&
              stat(
                'Stato',
                <span className={s.installmentsLate > 0 ? 'text-warn' : ''}>
                  {noticeDueText(debt.noticeDueDate!, today)}
                </span>,
              )}
          </dl>
        ) : (
          <dl className="grid grid-cols-2 gap-3">
            {stat('Pagato', `${formatCents(s.paidCents)} (${pct}%)`)}
            {stat('Capitale residuo', formatCents(s.principalRemainingCents))}
            {stat('Rate pagate', `${s.installmentsPaid} di ${s.installmentsTotal}`)}
            {stat(
              s.paidOff ? 'Estinto il' : 'Estinzione stimata',
              s.paidOff ? formatShortDate(s.payoffDate) : formatMonthYear(s.payoffDate),
            )}
            {stat('Interessi totali', formatCents(s.interestTotalCents))}
            {stat('Totale da restituire', formatCents(s.totalCents))}
          </dl>
        )}
        {!notice && s.installmentsLate > 0 && (
          <p className="text-sm text-warn" role="status">
            {s.installmentsLate === 1
              ? '1 rata scaduta non risulta pagata'
              : `${s.installmentsLate} rate scadute non risultano pagate`}
            : la data di estinzione slitta di conseguenza.
          </p>
        )}
        {s.next && (
          <button type="button" onClick={registerInstallment} className={primaryButton}>
            <Receipt size={20} aria-hidden="true" />{' '}
            {notice ? 'Registra pagamento' : `Registra rata ${s.next.n}`} ·{' '}
            {formatCents(s.next.amountCents)}
          </button>
        )}
        {s.next && !notice && (
          <p className="-mt-1 text-center text-xs text-muted">
            in scadenza il {formatShortDate(s.next.date)}
          </p>
        )}
        {notice && !s.paidOff && (
          <button
            type="button"
            onClick={() => setEditing('rateize')}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold"
          >
            <CalendarClock size={20} aria-hidden="true" /> Rateizza
          </button>
        )}
      </section>

      {!notice && (
        <section
          aria-labelledby="chart-h"
          className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
        >
          <h2 id="chart-h" className="font-semibold">
            Capitale residuo nel tempo
          </h2>
          <ResidualChart
            schedule={s.schedule}
            principalCents={debt.principalCents}
            covered={s.installmentsPaid}
            today={today}
          />
        </section>
      )}

      <section aria-labelledby="payments-h" className="flex flex-col gap-2">
        <h2 id="payments-h" className="px-1 text-sm font-semibold text-muted">
          Pagamenti collegati ({payments.length})
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-2xl bg-surface p-4 text-sm text-muted">
            Ancora nessun pagamento collegato a questo debito.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
            {payments.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => openEntry({ mode: 'edit', tx: t })}
                  className="flex min-h-11 w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
                >
                  <span className="flex-1">
                    {formatShortDate(t.date)}
                    {t.note && <span className="block text-sm text-muted">{t.note}</span>}
                  </span>
                  <Amount cents={t.amountCents} className="font-medium" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!notice && (
        <details className="rounded-2xl bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">
            Piano di ammortamento ({s.installmentsTotal} rate)
          </summary>
          <div className="overflow-x-auto px-1 pb-3 sm:px-2">
            <table className="w-full text-right text-xs tabular-nums sm:text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th scope="col" className="px-1 py-2 sm:p-2 text-left">
                    N.
                  </th>
                  <th scope="col" className="px-1 py-2 sm:p-2 text-left">
                    Data
                  </th>
                  <th scope="col" className="px-1 py-2 sm:p-2">
                    Rata
                  </th>
                  <th scope="col" className="px-1 py-2 sm:p-2">
                    Interessi
                  </th>
                  <th scope="col" className="hidden px-1 py-2 sm:table-cell sm:p-2">
                    Capitale
                  </th>
                  <th scope="col" className="px-1 py-2 sm:p-2">
                    Residuo
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.schedule.map((r) => {
                  const paid = r.n <= s.installmentsPaid;
                  return (
                    <tr key={r.n} className={`border-t border-line ${paid ? 'text-muted' : ''}`}>
                      <td className="px-1 py-2 sm:p-2 text-left">
                        <span className="inline-flex items-center gap-1">
                          {r.n}
                          {paid && <Check size={14} aria-label="pagata" />}
                        </span>
                      </td>
                      <td className="px-1 py-2 sm:p-2 text-left whitespace-nowrap">
                        {formatShortDate(r.date)}
                      </td>
                      <td className="px-1 py-2 sm:p-2">{formatCents(r.paymentCents)}</td>
                      <td className="px-1 py-2 sm:p-2">{formatCents(r.interestCents)}</td>
                      <td className="hidden px-1 py-2 sm:table-cell sm:p-2">
                        {formatCents(r.principalCents)}
                      </td>
                      <td className="px-1 py-2 sm:p-2">{formatCents(r.balanceCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {debt.notes && <p className="rounded-2xl bg-surface p-4 text-sm">{debt.notes}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing('edit')}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold"
        >
          <Pencil size={18} aria-hidden="true" /> Modifica
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold text-danger"
        >
          <Trash2 size={18} aria-hidden="true" /> Elimina
        </button>
      </div>

      {form}
    </div>
  );
}
