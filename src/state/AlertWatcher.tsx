import { useEffect, useMemo, useRef } from 'react';
import { useBudgets, useCategories, useRecurring, useTransactionsBetween } from '../db/hooks';
import { getSetting, setSetting } from '../db/repo';
import {
  budgetAlertMessage,
  budgetLabel,
  coveringRange,
  evaluateBudgets,
  pendingBudgetAlerts,
  pruneAlertKeys,
} from '../lib/budgets';
import { addDaysISO, formatShortDate, todayRome } from '../lib/dates';
import { formatCents } from '../lib/money';
import { dueAlertKey, pendingDueReminders } from '../lib/notifications';
import { dueText } from '../lib/recurring';
import { useToast } from './toast';
import { showLocalNotification } from './notify';

const SHOWN_SETTING = 'shownAlerts';

/**
 * Renders nothing. Recomputes budgets whenever transactions or budgets change (any source: quick
 * entry, "Segna come pagata", split, later sync) and announces each threshold once per period:
 * a toast in the app and, when the app is in the background, a system notification.
 * On app open it also sends one system notification per due/overdue recurrence.
 */
export function AlertWatcher() {
  const toast = useToast();
  const today = todayRome();
  const budgets = useBudgets();
  const categories = useCategories();
  const recurring = useRecurring();
  const range = useMemo(() => coveringRange(budgets ?? [], today), [budgets, today]);
  const txs = useTransactionsBetween(range.from, range.to);
  // Serialises runs: live queries can fire in quick succession.
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    if (budgets === undefined || txs === undefined || recurring === undefined) return;
    if (categories.length === 0) return;
    const evals = evaluateBudgets(budgets, txs, today);

    queue.current = queue.current.then(async () => {
      const shown = new Set(await getSetting<string[]>(SHOWN_SETTING, []));
      const newKeys: string[] = [];

      for (const { evaluation: e, keys } of pendingBudgetAlerts(evals, shown)) {
        const cat = categories.find((c) => c.id === e.budget.categoryId);
        const message = budgetAlertMessage(budgetLabel(e.budget, cat?.name), e, formatCents);
        toast({ message, tone: e.status === 'over' ? 'danger' : 'warn', durationMs: 7000 });
        if (document.visibilityState !== 'visible')
          await showLocalNotification('Conti · soglia', message, {
            tag: keys[0]!,
            path: '/altro/soglie',
          });
        newKeys.push(...keys);
      }

      for (const r of pendingDueReminders(recurring, today, shown)) {
        const amount = r.amountCents > 0 ? ` · ${formatCents(r.amountCents)}` : '';
        const sent = await showLocalNotification(
          `Scadenza: ${r.name}`,
          `${formatShortDate(r.nextDueDate)} (${dueText(r.nextDueDate, today)})${amount}`,
          { tag: dueAlertKey(r), path: '/scadenze' },
        );
        // Only remember reminders actually delivered: enabling notifications later still sends them.
        if (sent) newKeys.push(dueAlertKey(r));
      }

      if (newKeys.length === 0) return;
      const merged = pruneAlertKeys([...shown, ...newKeys], addDaysISO(today, -62));
      await setSetting(SHOWN_SETTING, merged);
    });
    queue.current = queue.current.catch((err: unknown) => console.error('Alert check failed', err));
  }, [budgets, txs, recurring, categories, today, toast]);

  return null;
}
