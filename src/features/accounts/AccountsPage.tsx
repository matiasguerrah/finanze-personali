import { useState } from 'react';
import { ArrowLeftRight, Plus } from 'lucide-react';
import { useAccountBalances, useAccounts, useAccountUsage } from '../../db/hooks';
import { repo } from '../../db/repo';
import type { Account, AccountType, Scope } from '../../db/types';
import { totalBalance, validateAccount } from '../../lib/balances';
import { todayRome } from '../../lib/dates';
import { centsToInput, parseAmountToCents } from '../../lib/money';
import { Amount } from '../../components/Amount';
import { CategoryIcon } from '../../components/CategoryIcon';
import { BusinessBadge } from '../../components/BusinessBadge';
import { RowMenu } from '../../components/RowMenu';
import { Segmented } from '../../components/Segmented';
import { Sheet } from '../../components/Sheet';
import { ColorPicker, IconPicker } from '../../components/Pickers';
import { inputClass, labelClass, primaryButton } from '../../components/form';
import { useToast } from '../../state/toast';
import { useOpenEntry } from '../../state/entry';

const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Conto bancario',
  cash: 'Contanti',
  card: 'Carta',
  other: 'Altro',
};

export function AccountsPage() {
  const accounts = useAccounts();
  const balances = useAccountBalances(todayRome());
  const usage = useAccountUsage();
  const toast = useToast();
  const openEntry = useOpenEntry();
  const [editing, setEditing] = useState<Account | 'new' | null>(null);

  const open = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);
  const total = balances
    ? totalBalance(
        balances,
        open.map((a) => a.id),
      )
    : undefined;

  async function remove(a: Account) {
    const n = usage?.get(a.id) ?? 0;
    if (n > 0) {
      toast({
        message: `«${a.name}» è usato da ${n} movimenti o ricorrenze: archivialo invece di eliminarlo.`,
        tone: 'warn',
        durationMs: 6000,
      });
      return;
    }
    if (open.length <= 1 && !a.archived) {
      toast({ message: 'Serve almeno un conto attivo.', tone: 'warn' });
      return;
    }
    await repo.softDelete('accounts', a.id);
    toast({
      message: 'Conto eliminato',
      action: { label: 'Annulla', onClick: () => void repo.restore('accounts', a.id) },
    });
  }

  async function setArchived(a: Account, archived: boolean) {
    if (archived && open.length <= 1) {
      toast({ message: 'Serve almeno un conto attivo.', tone: 'warn' });
      return;
    }
    await repo.update('accounts', a.id, { archived });
    toast({ message: archived ? `«${a.name}» archiviato` : `«${a.name}» ripristinato` });
  }

  const row = (a: Account) => (
    <li key={a.id} className="flex items-center gap-2 p-3">
      <button
        type="button"
        onClick={() => setEditing(a)}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
      >
        <CategoryIcon icon={a.icon} color={a.color} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate font-medium">
            {a.name}
            {a.defaultScope === 'business' && <BusinessBadge />}
          </span>
          <span className="text-sm text-muted">{ACCOUNT_TYPE_LABEL[a.type]}</span>
        </span>
        {balances && (
          <Amount
            cents={balances.get(a.id) ?? 0}
            className={`shrink-0 font-medium ${(balances.get(a.id) ?? 0) < 0 ? 'text-danger' : ''}`}
          />
        )}
      </button>
      <RowMenu
        label={`Azioni per ${a.name}`}
        actions={[
          { label: 'Modifica', onSelect: () => setEditing(a) },
          a.archived
            ? { label: 'Ripristina', onSelect: () => void setArchived(a, false) }
            : { label: 'Archivia', onSelect: () => void setArchived(a, true) },
          { label: 'Elimina', danger: true, onSelect: () => void remove(a) },
        ]}
      />
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-surface p-4">
        <p className="text-sm text-muted">Saldo totale ad oggi</p>
        <p className="text-3xl font-semibold">
          {total !== undefined ? <Amount cents={total} /> : '…'}
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">{open.map(row)}</ul>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
          <Plus size={20} aria-hidden="true" /> Nuovo conto
        </button>
        <button
          type="button"
          onClick={() => openEntry({ mode: 'new', type: 'transfer' })}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold"
        >
          <ArrowLeftRight size={20} aria-hidden="true" /> Giroconto
        </button>
      </div>

      {archived.length > 0 && (
        <section aria-labelledby="archived-h">
          <h2 id="archived-h" className="mb-2 px-1 text-sm font-semibold text-muted">
            Archiviati
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface opacity-80">
            {archived.map(row)}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">
        Il saldo considera i movimenti fino a oggi: quelli con data futura entrano nel saldo il
        giorno indicato.
      </p>

      {editing && (
        <AccountForm
          account={editing === 'new' ? undefined : editing}
          nextSortOrder={Math.max(0, ...accounts.map((a) => a.sortOrder)) + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AccountForm({
  account,
  nextSortOrder,
  onClose,
}: {
  account?: Account;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank');
  const [defaultScope, setScope] = useState<Scope>(account?.defaultScope ?? 'personal');
  const [initial, setInitial] = useState(account ? centsToInput(account.initialBalanceCents) : '0');
  const [icon, setIcon] = useState(account?.icon ?? 'Landmark');
  const [color, setColor] = useState(account?.color ?? 'blue');
  const [submitted, setSubmitted] = useState(false);

  // Allow a negative initial balance (e.g. a credit card or an overdraft).
  const negative = initial.trim().startsWith('-');
  const parsed = parseAmountToCents(initial.trim().replace(/^-/, ''));
  const initialBalanceCents = parsed === null ? NaN : negative ? -parsed : parsed;
  const data = { name: name.trim(), type, defaultScope, initialBalanceCents, icon, color };
  const errors = validateAccount(data);

  async function save() {
    setSubmitted(true);
    if (errors.length) return;
    if (account) await repo.update('accounts', account.id, data);
    else await repo.create('accounts', { ...data, sortOrder: nextSortOrder, archived: false });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={account ? 'Modifica conto' : 'Nuovo conto'}>
      <label className={labelClass}>
        Nome
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Conto Fineco"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          Tipo
          <select
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Saldo iniziale (€)
          <input
            className={`${inputClass} tabular-nums`}
            inputMode="decimal"
            value={initial}
            onChange={(e) => setInitial(e.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Ambito proposto per i movimenti</span>
        <Segmented
          label="Ambito proposto per i movimenti"
          size="sm"
          value={defaultScope}
          onChange={setScope}
          options={[
            { value: 'personal', label: 'Personale' },
            { value: 'business', label: 'Lavoro' },
          ]}
        />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} color={color} onChange={setIcon} />
      {submitted && errors.length > 0 && (
        <ul role="alert" className="text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void save()} className={primaryButton}>
        Salva
      </button>
    </Sheet>
  );
}
