/**
 * Progress of a debt from its plan and the expenses linked to it (`debtId`).
 *
 * Payments are matched to the plan cumulatively: an installment counts as paid once the total
 * paid reaches the plan's running total up to it. Each installment allows 1 cent of slack, so a
 * bank rounding its installment differently by a cent does not leave every row "not paid".
 * Extra payments simply cover the next rows (the plan is not recomputed).
 *
 * A notice (state 'notice') is treated as a plan of a single installment of the notice amount on
 * its due date: partial payments, "late" and "paid off" then work exactly as for a loan.
 */
import type { Debt, ISODate, Transaction } from '../db/types';
import { daysBetween } from './dates';
import {
  amortizationSchedule,
  installmentDate,
  termsErrors,
  type AmortizationRow,
  type LoanTerms,
  type TermsError,
} from './amortization';

export function debtTerms(d: Debt): LoanTerms {
  if (d.state === 'notice') {
    const amount = d.noticeAmountCents ?? 0;
    return {
      principalCents: amount,
      annualRateBp: 0,
      installmentCents: amount,
      firstDate: d.noticeDueDate ?? '',
      installments: 1,
    };
  }
  const t: LoanTerms = {
    principalCents: d.principalCents,
    annualRateBp: d.annualRateBp,
    installmentCents: d.installmentCents,
    firstDate: d.startDate,
  };
  if (d.plannedInstallments !== undefined) t.installments = d.plannedInstallments;
  return t;
}

/** Expenses that pay this debt (deleted ones excluded). */
export function debtPayments(debtId: string, txs: readonly Transaction[]): Transaction[] {
  return txs.filter((t) => t.debtId === debtId && t.type === 'expense' && !t.deleted);
}

export interface DebtStatus {
  schedule: AmortizationRow[];
  /** Capital + interest over the whole plan. */
  totalCents: number;
  interestTotalCents: number;
  /** Paid towards this plan (for a rateizzato notice, only payments since the rateizzazione). */
  paidCents: number;
  /** Paid towards the notice before it was rateizzato (not counted in the plan). */
  paidBeforePlanCents: number;
  /** Still to pay, interest included (never negative). */
  remainingCents: number;
  /** Principal still owed after the installments already covered. */
  principalRemainingCents: number;
  /** paid / total in basis points, capped at 10000. */
  paidBp: number;
  installmentsPaid: number;
  installmentsTotal: number;
  /** Installments due by today and not covered yet. */
  installmentsLate: number;
  /** Next installment to pay, with the part not covered yet; undefined when paid off. */
  next?: { n: number; date: ISODate; amountCents: number };
  /** Paid off: date of the last payment. Otherwise the plan's end, shifted by delays/advances. */
  payoffDate: ISODate;
  paidOff: boolean;
}

export function debtStatus(
  debt: Debt,
  allPayments: readonly Pick<Transaction, 'amountCents' | 'date' | 'createdAt'>[],
  today: ISODate,
): DebtStatus {
  const schedule = amortizationSchedule(debtTerms(debt));
  const since = debt.state === 'installments' ? debt.rateizedAt : undefined;
  const payments = since ? allPayments.filter((p) => p.createdAt >= since) : allPayments;
  const paidBeforePlanCents =
    allPayments.reduce((s, p) => s + p.amountCents, 0) -
    payments.reduce((s, p) => s + p.amountCents, 0);
  const N = schedule.length;
  const totalCents = schedule.reduce((s, r) => s + r.paymentCents, 0);
  const interestTotalCents = schedule.reduce((s, r) => s + r.interestCents, 0);
  const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);

  let covered = 0;
  let cumulative = 0;
  for (const r of schedule) {
    if (paidCents + r.n < cumulative + r.paymentCents) break; // r.n = 1 cent slack per row
    cumulative += r.paymentCents;
    covered++;
  }
  const paidOff = covered === N;
  const dueByToday = schedule.filter((r) => r.date <= today).length;
  const lastPayment = payments.reduce<ISODate | undefined>(
    (m, p) => (m === undefined || p.date > m ? p.date : m),
    undefined,
  );
  const nextRow = schedule[covered];

  const status: DebtStatus = {
    schedule,
    totalCents,
    interestTotalCents,
    paidCents,
    paidBeforePlanCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    principalRemainingCents:
      covered === 0 ? debt.principalCents : schedule[covered - 1]!.balanceCents,
    paidBp: Math.min(10_000, Math.floor((paidCents * 10_000) / totalCents)),
    installmentsPaid: covered,
    installmentsTotal: N,
    installmentsLate: Math.max(0, dueByToday - covered),
    payoffDate: paidOff
      ? (lastPayment ?? schedule[N - 1]!.date)
      : debt.state === 'notice'
        ? schedule[0]!.date // the due date: a notice has no plan to shift
        : // Each missing installment pushes the end one month later; each advance brings it earlier.
          installmentDate(debt.startDate, N - 1 + dueByToday - covered),
    paidOff,
  };
  if (nextRow) {
    status.next = {
      n: nextRow.n,
      date: nextRow.date,
      amountCents: Math.max(0, cumulative + nextRow.paymentCents - paidCents),
    };
  }
  return status;
}

/**
 * Like debtStatus, but null when the stored terms cannot produce a plan (e.g. a row edited by
 * hand in the Google Sheet), so a page can ask to fix the debt instead of crashing.
 */
export function tryDebtStatus(
  debt: Debt,
  payments: readonly Pick<Transaction, 'amountCents' | 'date' | 'createdAt'>[],
  today: ISODate,
): DebtStatus | null {
  const t = debtTerms(debt);
  if (termsErrors(t).length || !/^\d{4}-\d{2}-\d{2}$/.test(t.firstDate)) return null;
  return debtStatus(debt, payments, today);
}

export const TERMS_ERROR_TEXT: Record<TermsError, string> = {
  principal: "Inserisci l'importo finanziato.",
  rate: 'Il tasso deve essere tra 0% e 100%.',
  installment: 'Inserisci la rata mensile.',
  installments: 'Il numero di rate deve essere tra 1 e 1200.',
  tooShort: 'La rata non copre nemmeno gli interessi del primo mese.',
  tooLong: 'Con questa rata servirebbero più di 100 anni: controlla gli importi.',
};

export function validateDebt(
  d: Pick<Debt, 'name' | 'startDate'> & Omit<LoanTerms, 'firstDate'>,
): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Il nome è obbligatorio.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.startDate)) errors.push('Inserisci la data della prima rata.');
  return [...errors, ...termsErrors(d).map((e) => TERMS_ERROR_TEXT[e])];
}

export function validateNotice(
  d: Pick<Debt, 'name' | 'noticeAmountCents' | 'noticeDueDate'>,
): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push('Il nome è obbligatorio.');
  if (
    !d.noticeAmountCents ||
    d.noticeAmountCents <= 0 ||
    !Number.isSafeInteger(d.noticeAmountCents)
  )
    errors.push("Inserisci l'importo dell'avviso.");
  if (!d.noticeDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(d.noticeDueDate))
    errors.push('Inserisci la scadenza.');
  return errors;
}

/** "scade oggi" / "scade domani" / "scade tra 12 giorni" / "scaduto da 3 giorni". */
export function noticeDueText(dueDate: ISODate, today: ISODate): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return 'scade oggi';
  if (days === 1) return 'scade domani';
  if (days > 1) return `scade tra ${days} giorni`;
  return days === -1 ? 'scaduto da 1 giorno' : `scaduto da ${-days} giorni`;
}

export const DEBT_STATE_LABEL = { notice: 'Avviso', installments: 'Rateizzato' } as const;
