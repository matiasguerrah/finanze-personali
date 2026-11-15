import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight, Briefcase, ChevronDown, User } from 'lucide-react';
import { repo, setSetting } from '../../db/repo';
import type { Account, Activity, Category, Scope, Transaction, TxType } from '../../db/types';
import { Sheet } from '../../components/Sheet';
import { Keypad } from '../../components/Keypad';
import { Segmented } from '../../components/Segmented';
import { CategoryIcon } from '../../components/CategoryIcon';
import { applyKey } from '../../lib/keypad';
import { centsToInput, formatCents, parseAmountToCents } from '../../lib/money';
import { formatShortDate, isISODate, todayRome } from '../../lib/dates';
import { activeActivitiesOn, defaultActivityId, isActiveOn } from '../../lib/activities';
import { parseTags, proposedScope, validateDraft, type TxDraftError } from '../../lib/transactions';
import { useToast } from '../../state/toast';
import { useScopeFilter } from '../../state/scopeFilter';
import type { EntryRequest } from '../../state/entry';
import { CategoryGrid } from './CategoryGrid';

const ERROR_TEXT: Record<TxDraftError, string> = {
  amount: 'Inserisci un importo.',
  category: 'Scegli una categoria.',
  account: 'Scegli un conto.',
  toAccount: 'Scegli il conto di destinazione.',
  sameAccount: 'I due conti del giroconto devono essere diversi.',
  activityMissing: "Scegli l'attività a cui attribuire l'incasso.",
  activityInactive: "L'attività scelta non è attiva in questa data: riassegnala.",
};

const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base placeholder:text-muted';

export interface EntryData {
  categories: Category[];
  accounts: Account[];
  activities: Activity[];
  lastAccountId: string;
}

interface Props {
  request: EntryRequest;
  /** Loaded once by EntryProvider, so the sheet renders complete on the first frame. */
  data: EntryData;
  onClose: () => void;
}

export function EntrySheet({ request, data, onClose }: Props) {
  const editing = request.mode === 'edit' ? request.tx : undefined;
  const { categories, accounts, activities, lastAccountId } = data;
  const { scope: scopeFilter } = useScopeFilter();
  const toast = useToast();

  const [type, setType] = useState<TxType>(
    editing ? editing.type : request.mode === 'new' ? request.type : 'expense',
  );
  const isTransfer = type === 'transfer';
  const [categoryId, setCategoryId] = useState(
    editing?.categoryId ?? (request.mode === 'new' ? request.categoryId : undefined) ?? '',
  );
  const [step, setStep] = useState<'category' | 'amount'>(
    categoryId || isTransfer ? 'amount' : 'category',
  );
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amountCents) : '');
  const [accountId, setAccountId] = useState(
    () =>
      editing?.accountId ??
      (
        accounts.find((a) => a.id === lastAccountId && !a.archived) ??
        accounts.find((a) => !a.archived)
      )?.id ??
      '',
  );
  const [toAccountId, setToAccountId] = useState(
    () => editing?.toAccountId ?? accounts.find((a) => !a.archived && a.id !== accountId)?.id ?? '',
  );
  const [date, setDate] = useState(editing?.date ?? todayRome());
  const [scope, setScope] = useState<Scope | undefined>(editing?.scope);
  const [note, setNote] = useState(editing?.note ?? '');
  const [tags, setTags] = useState(editing?.tags.join(', ') ?? '');
  const [activityId, setActivityId] = useState(editing?.activityId);
  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoiceNumber ?? '');
  const [client, setClient] = useState(editing?.client ?? '');
  const [showMore, setShowMore] = useState(Boolean(editing?.tags.length));
  const [showErrors, setShowErrors] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === accountId);

  const account = accounts.find((a) => a.id === accountId);
  // Until the user taps the toggle, the scope follows category/account defaults.
  const effectiveScope: Scope =
    scope ?? proposedScope(isTransfer ? undefined : category?.defaultScope, account?.defaultScope);
  const isBusinessIncome = type === 'income' && effectiveScope === 'business';
  const activeOnDate = useMemo(
    () => (isISODate(date) ? activeActivitiesOn(activities, date) : []),
    [activities, date],
  );

  // New business income: preselect the activity when exactly one is active on the date.
  useEffect(() => {
    if (editing || !isBusinessIncome) return;
    const current = activities.find((a) => a.id === activityId);
    if (current && isActiveOn(current, date)) return;
    setActivityId(defaultActivityId(activities, date));
  }, [editing, isBusinessIncome, activities, activityId, date]);

  const amountCents = parseAmountToCents(amount) ?? 0;
  const draft = {
    type,
    amountCents,
    scope: effectiveScope,
    date,
    categoryId,
    accountId,
    toAccountId: isTransfer ? toAccountId : undefined,
    activityId: effectiveScope === 'business' && !isTransfer ? activityId : undefined,
  };
  const errors = validateDraft(draft, activities);
  const dateValid = isISODate(date);
  const canSave = errors.length === 0 && dateValid;
  const selectedActivity = activities.find((a) => a.id === activityId);

  async function save() {
    if (!canSave) {
      setShowErrors(true);
      return;
    }
    const business = effectiveScope === 'business' && !isTransfer;
    const fields = {
      date,
      type,
      amountCents,
      scope: effectiveScope,
      categoryId: isTransfer ? '' : categoryId,
      accountId,
      toAccountId: isTransfer ? toAccountId : undefined,
      note: note.trim(),
      tags: parseTags(tags),
      activityId: business ? activityId : undefined,
      invoiceNumber:
        business && type === 'income' && invoiceNumber.trim() ? invoiceNumber.trim() : undefined,
      client: business && type === 'income' && client.trim() ? client.trim() : undefined,
    } satisfies Partial<Transaction>;

    await setSetting('lastAccountId', accountId);
    const label = `${formatCents(amountCents)} · ${isTransfer ? 'Giroconto' : (category?.name ?? '')}`;
    if (editing) {
      await repo.update('transactions', editing.id, fields);
      toast({ message: `Modificato ${label}` });
    } else {
      // Drop undefined optionals so the stored record has no empty keys.
      const clean = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      ) as typeof fields;
      const created = await repo.create('transactions', clean);
      toast({
        message: `Salvato ${label}`,
        tone: 'success',
        action: {
          label: 'Annulla',
          onClick: () => void repo.softDelete('transactions', created.id),
        },
      });
    }
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (step !== 'amount') return;
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
      if (e.key === 'Enter' && target.tagName === 'INPUT') void save();
      return;
    }
    if (/^[0-9]$/.test(e.key)) setAmount((a) => applyKey(a, e.key));
    else if (e.key === ',' || e.key === '.') setAmount((a) => applyKey(a, ','));
    else if (e.key === 'Backspace') setAmount((a) => applyKey(a, 'back'));
    else if (e.key === 'Enter') void save();
    else return;
    e.preventDefault();
  }

  const title = editing
    ? 'Modifica movimento'
    : { expense: 'Nuova spesa', income: 'Nuova entrata', transfer: 'Nuovo giroconto' }[type];

  return (
    <Sheet open onClose={onClose} title={title}>
      <div onKeyDown={onKeyDown} className="flex flex-col gap-4">
        {step === 'category' ? (
          <>
            <Segmented
              label="Tipo"
              value={type}
              onChange={(t) => {
                setType(t);
                setCategoryId('');
                if (t === 'transfer') setStep('amount');
              }}
              options={[
                { value: 'expense', label: 'Spesa' },
                { value: 'income', label: 'Entrata' },
                { value: 'transfer', label: 'Giroconto' },
              ]}
            />
            {isTransfer ? (
              <button
                type="button"
                onClick={() => setStep('amount')}
                className="min-h-12 rounded-xl bg-surface-2 font-semibold"
              >
                Continua con il giroconto
              </button>
            ) : (
              <CategoryGrid
                type={type}
                categories={categories}
                scope={editing ? 'all' : scopeFilter}
                selectedId={categoryId}
                onPick={(c) => {
                  setCategoryId(c.id);
                  if (!editing) setScope(undefined); // follow the new category's default
                  setStep('amount');
                }}
              />
            )}
          </>
        ) : (
          <>
            {/* Category + amount */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep('category')}
                className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl pr-2 hover:bg-surface"
                aria-label={
                  isTransfer
                    ? 'Giroconto. Cambia tipo'
                    : `Categoria: ${category?.name ?? 'nessuna'}. Cambia`
                }
              >
                {isTransfer ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2"
                  >
                    <ArrowLeftRight size={22} />
                  </span>
                ) : (
                  category && <CategoryIcon icon={category.icon} color={category.color} size="md" />
                )}
                <span className="truncate font-medium">
                  {isTransfer ? 'Giroconto' : (category?.name ?? 'Categoria')}
                </span>
                <ChevronDown size={16} className="shrink-0 text-muted" aria-hidden="true" />
              </button>
              <output
                aria-label="Importo"
                className={`ml-auto shrink-0 text-right text-3xl font-semibold whitespace-nowrap tabular-nums sm:text-4xl ${amount ? '' : 'text-muted'}`}
              >
                {type === 'expense' ? '−' : type === 'income' ? '+' : ''}€ {amount || '0'}
              </output>
            </div>

            {/* Scope, account, date */}
            <div className="grid grid-cols-2 gap-2">
              {!isTransfer && (
                <Segmented
                  label="Ambito del movimento"
                  size="sm"
                  className="col-span-2"
                  value={effectiveScope}
                  onChange={setScope}
                  options={[
                    {
                      value: 'personal',
                      label: 'Personale',
                      icon: <User size={16} aria-hidden="true" />,
                    },
                    {
                      value: 'business',
                      label: 'Lavoro',
                      icon: <Briefcase size={16} aria-hidden="true" />,
                    },
                  ]}
                />
              )}
              <label className="flex flex-col gap-1 text-xs text-muted">
                {isTransfer ? 'Dal conto' : 'Conto'}
                <select
                  className={inputClass + ' text-fg'}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {isTransfer && (
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Al conto
                  <select
                    className={inputClass + ' text-fg'}
                    value={toAccountId}
                    onChange={(e) => setToAccountId(e.target.value)}
                  >
                    <option value="" disabled>
                      Scegli…
                    </option>
                    {activeAccounts
                      .filter((a) => a.id !== accountId || a.id === toAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label
                className={`flex flex-col gap-1 text-xs text-muted ${isTransfer ? 'col-span-2' : ''}`}
              >
                Data
                <input
                  type="date"
                  required
                  className={inputClass + ' text-fg'}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>

            {/* Activity: required for business income, optional for business expenses */}
            {effectiveScope === 'business' && !isTransfer && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-xs text-muted">
                  Attività{isBusinessIncome ? '' : ' (facoltativa)'}
                </legend>
                {activeOnDate.length === 0 ? (
                  <p className="text-sm text-warn">
                    Nessuna attività attiva il {dateValid ? formatShortDate(date) : '—'}. Aggiungila
                    da Altro › Attività professionali.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activeOnDate.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={activityId === a.id}
                        onClick={() =>
                          setActivityId(activityId === a.id && !isBusinessIncome ? undefined : a.id)
                        }
                        className={`min-h-11 rounded-full border px-4 text-sm ${
                          activityId === a.id
                            ? 'border-accent bg-accent text-accent-fg'
                            : 'border-line hover:bg-surface'
                        }`}
                      >
                        {a.name}
                        <span className="sr-only"> (ATECO {a.atecoCode})</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedActivity && dateValid && !isActiveOn(selectedActivity, date) && (
                  <p className="text-sm text-danger">
                    «{selectedActivity.name}» non è attiva il {formatShortDate(date)}: scegline
                    un’altra.
                  </p>
                )}
              </fieldset>
            )}

            {isBusinessIncome && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={inputClass}
                  placeholder="N. fattura"
                  aria-label="Numero fattura"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Cliente"
                  aria-label="Cliente"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              </div>
            )}

            <input
              className={inputClass}
              placeholder="Nota (facoltativa)"
              aria-label="Nota"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {showMore ? (
              <input
                className={inputClass}
                placeholder="Tag, separati da virgola"
                aria-label="Tag"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            ) : (
              <button
                type="button"
                className="-mt-2 min-h-11 self-start text-sm text-muted underline underline-offset-2"
                onClick={() => setShowMore(true)}
              >
                Aggiungi tag
              </button>
            )}

            <Keypad onKey={(k) => setAmount((a) => applyKey(a, k))} />

            {showErrors && !canSave && (
              <ul className="text-sm text-danger" role="alert">
                {!dateValid && <li>Inserisci una data valida.</li>}
                {errors.map((e) => (
                  <li key={e}>{ERROR_TEXT[e]}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void save()}
              aria-disabled={!canSave}
              className={`sticky bottom-[env(safe-area-inset-bottom)] min-h-14 rounded-xl shadow-[0_-12px_12px_var(--app-bg)] text-lg font-semibold ${
                canSave ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'
              }`}
            >
              Salva
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
