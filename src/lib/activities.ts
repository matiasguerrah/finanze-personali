import type { Activity, ISODate, Transaction } from '../db/types';
import { BP_100 } from './money';

type ActivityLike = Pick<Activity, 'id' | 'activeFrom' | 'activeTo' | 'deleted' | 'sortOrder'>;

/** Active on `date` if activeFrom ≤ date and activeTo is empty or ≥ date. */
export function isActiveOn(
  a: Pick<Activity, 'activeFrom' | 'activeTo' | 'deleted'>,
  date: ISODate,
) {
  return !a.deleted && a.activeFrom <= date && (!a.activeTo || a.activeTo >= date);
}

export function activeActivitiesOn<A extends ActivityLike>(activities: A[], date: ISODate): A[] {
  return activities.filter((a) => isActiveOn(a, date)).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The activity to preselect for business income: only when exactly one is active. */
export function defaultActivityId(activities: ActivityLike[], date: ISODate): string | undefined {
  const active = activeActivitiesOn(activities, date);
  return active.length === 1 ? active[0]?.id : undefined;
}

export type ActivityAssignment = 'ok' | 'notRequired' | 'missing' | 'inactive';

/** activityId is mandatory for business income and must be active on the transaction date. */
export function checkActivityAssignment(
  tx: Pick<Transaction, 'type' | 'scope' | 'date' | 'activityId'>,
  activities: Pick<Activity, 'id' | 'activeFrom' | 'activeTo' | 'deleted'>[],
): ActivityAssignment {
  const required = tx.type === 'income' && tx.scope === 'business';
  if (!tx.activityId) return required ? 'missing' : 'notRequired';
  const activity = activities.find((a) => a.id === tx.activityId);
  if (!activity || !isActiveOn(activity, tx.date)) return required ? 'inactive' : 'ok';
  return 'ok';
}

export function validateActivity(
  a: Pick<Activity, 'name' | 'coefficientBp' | 'activeFrom' | 'activeTo'>,
): string[] {
  const errors: string[] = [];
  if (!a.name.trim()) errors.push('Il nome è obbligatorio.');
  if (!Number.isInteger(a.coefficientBp) || a.coefficientBp <= 0 || a.coefficientBp > BP_100)
    errors.push('Il coefficiente deve essere compreso tra 0% e 100%.');
  if (!a.activeFrom) errors.push('La data di inizio è obbligatoria.');
  if (a.activeTo && a.activeTo < a.activeFrom)
    errors.push('La data di fine non può precedere quella di inizio.');
  return errors;
}
