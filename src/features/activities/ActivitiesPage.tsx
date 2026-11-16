import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import { db } from '../../db/db';
import { useActivities } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { Activity } from '../../db/types';
import { isActiveOn, validateActivity } from '../../lib/activities';
import { formatShortDate, isISODate, todayRome } from '../../lib/dates';
import { bpToPercentInput, formatBp, percentInputToBp } from '../../lib/money';
import { Sheet } from '../../components/Sheet';
import { RowMenu } from '../../components/RowMenu';
import { useToast } from '../../state/toast';

const inputClass = 'min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base text-fg';

export function ActivitiesPage() {
  const activities = useActivities();
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const toast = useToast();
  const today = todayRome();
  // Number of income records per activity, to prevent deleting referenced activities.
  const usage = useLiveQuery(async () => {
    const m = new Map<string, number>();
    await db.transactions
      .filter((t) => !t.deleted && !!t.activityId)
      .each((t) => m.set(t.activityId!, (m.get(t.activityId!) ?? 0) + 1));
    return m;
  }, []);

  async function remove(a: Activity) {
    const n = usage?.get(a.id) ?? 0;
    if (n > 0) {
      toast({
        message: `«${a.name}» ha ${n} movimenti collegati: chiudila impostando una data di fine.`,
        tone: 'warn',
        durationMs: 6000,
      });
      return;
    }
    await repo.softDelete('activities', a.id);
    toast({
      message: 'Attività eliminata',
      action: { label: 'Annulla', onClick: () => void repo.restore('activities', a.id) },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Per cambiare codice ATECO crea una nuova attività e imposta la data di fine su quella
        vecchia: gli incassi già registrati restano attribuiti alla vecchia.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
        {activities.length === 0 && (
          <li className="p-4 text-center text-muted">Nessuna attività configurata.</li>
        )}
        {activities.map((a) => {
          const active = isActiveOn(a, today);
          return (
            <li key={a.id} className="flex items-center gap-2 p-3">
              <button
                type="button"
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start text-left"
                onClick={() => setEditing(a)}
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-sm text-muted">
                  ATECO {a.atecoCode || '—'} · coefficiente {formatBp(a.coefficientBp)} · dal{' '}
                  {formatShortDate(a.activeFrom)}
                  {a.activeTo ? ` al ${formatShortDate(a.activeTo)}` : ''}
                </span>
              </button>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'
                }`}
              >
                {active ? 'Attiva' : a.activeFrom > today ? 'Futura' : 'Chiusa'}
              </span>
              <RowMenu
                label={`Azioni per ${a.name}`}
                actions={[
                  { label: 'Modifica', onSelect: () => setEditing(a) },
                  { label: 'Elimina', danger: true, onSelect: () => void remove(a) },
                ]}
              />
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setEditing('new')}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg"
      >
        <Plus size={20} aria-hidden="true" /> Nuova attività
      </button>
      {editing && (
        <ActivityForm
          activity={editing === 'new' ? undefined : editing}
          nextSortOrder={activities.length + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export function ActivityForm({
  activity,
  nextSortOrder,
  onClose,
}: {
  activity?: Activity;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(activity?.name ?? '');
  const [atecoCode, setAteco] = useState(activity?.atecoCode ?? '');
  const [coeff, setCoeff] = useState(activity ? bpToPercentInput(activity.coefficientBp) : '');
  const [activeFrom, setFrom] = useState(activity?.activeFrom ?? todayRome());
  const [activeTo, setTo] = useState(activity?.activeTo ?? '');
  const [submitted, setSubmitted] = useState(false);

  const coefficientBp = percentInputToBp(coeff) ?? 0;
  const data = {
    name: name.trim(),
    atecoCode: atecoCode.trim(),
    coefficientBp,
    activeFrom,
    activeTo: activeTo || undefined,
  };
  const errors = [
    ...validateActivity(data),
    ...(activeFrom && !isISODate(activeFrom) ? ['Data di inizio non valida.'] : []),
  ];

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    if (activity) await repo.update('activities', activity.id, data);
    else {
      const { activeTo: to, ...rest } = data;
      await repo.create('activities', {
        ...rest,
        ...(to ? { activeTo: to } : {}),
        sortOrder: nextSortOrder,
      });
    }
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={activity ? 'Modifica attività' : 'Nuova attività'}>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Nome
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Consulenza informatica"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Codice ATECO
          <input
            className={inputClass}
            value={atecoCode}
            onChange={(e) => setAteco(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Coefficiente di redditività (%)
          <input
            className={inputClass}
            inputMode="decimal"
            value={coeff}
            onChange={(e) => setCoeff(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Attiva dal
          <input
            type="date"
            className={inputClass}
            value={activeFrom}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Fino al (vuoto se attiva)
          <input
            type="date"
            className={inputClass}
            value={activeTo}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {submitted && errors.length > 0 && (
        <ul role="alert" className="text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void save()}
        className="min-h-12 rounded-xl bg-accent font-semibold text-accent-fg"
      >
        Salva
      </button>
    </Sheet>
  );
}
