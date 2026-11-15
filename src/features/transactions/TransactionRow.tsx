import { ArrowLeftRight, Pencil, Split, Trash2, Merge } from 'lucide-react';
import type { Account, Category, Transaction } from '../../db/types';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Amount } from '../../components/Amount';
import { BusinessBadge } from '../../components/BusinessBadge';
import { RowMenu, type MenuAction } from '../../components/RowMenu';

interface Props {
  tx: Transaction;
  category?: Category;
  account?: Account;
  /** Destination account, for transfers. */
  toAccount?: Account;
  onEdit: () => void;
  onDelete: () => void;
  onSplit?: () => void;
  onMerge?: () => void;
}

/**
 * Mobile: swipe left (native horizontal scroll with snap) to reveal the actions.
 * Desktop: "⋮" menu. Tapping the row opens the editor on both.
 */
export function TransactionRow({
  tx,
  category,
  account,
  toAccount,
  onEdit,
  onDelete,
  onSplit,
  onMerge,
}: Props) {
  const name = category?.name ?? (tx.type === 'transfer' ? 'Giroconto' : 'Senza categoria');
  const accounts =
    tx.type === 'transfer' ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}` : account?.name;
  const subtitle = [tx.note, tx.client, accounts].filter(Boolean).join(' · ');

  const actions: MenuAction[] = [
    { label: 'Modifica', onSelect: onEdit },
    ...(onSplit ? [{ label: 'Dividi Personale/Lavoro', onSelect: onSplit }] : []),
    ...(onMerge ? [{ label: 'Annulla divisione', onSelect: onMerge }] : []),
    { label: 'Elimina', onSelect: onDelete, danger: true },
  ];

  const swipeBtn =
    'flex w-20 flex-col items-center justify-center gap-1 text-xs font-medium text-white';

  return (
    <li className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto md:overflow-visible">
      <div className="flex w-full shrink-0 snap-start items-center gap-1 bg-bg">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface"
        >
          {category ? (
            <CategoryIcon icon={category.icon} color={category.color} size="sm" />
          ) : (
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2"
              aria-hidden="true"
            >
              {tx.type === 'transfer' && <ArrowLeftRight size={18} />}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5 truncate font-medium">
              {name}
              {tx.scope === 'business' && <BusinessBadge />}
              {tx.splitGroupId && (
                <span title="Movimento diviso" className="text-muted">
                  <Split size={13} aria-hidden="true" />
                  <span className="sr-only">diviso</span>
                </span>
              )}
            </span>
            {subtitle && <span className="truncate text-sm text-muted">{subtitle}</span>}
          </span>
          <Amount cents={tx.amountCents} type={tx.type} className="shrink-0 font-medium" />
        </button>
        <div className="hidden md:block">
          <RowMenu actions={actions} label={`Azioni per ${name}`} />
        </div>
      </div>
      {/* Swipe actions (mobile only) */}
      <div className="flex shrink-0 snap-end md:hidden" aria-hidden="false">
        <button type="button" onClick={onEdit} className={`${swipeBtn} bg-slate-600`}>
          <Pencil size={18} aria-hidden="true" />
          Modifica
        </button>
        {onSplit && (
          <button type="button" onClick={onSplit} className={`${swipeBtn} bg-violet-700`}>
            <Split size={18} aria-hidden="true" />
            Dividi
          </button>
        )}
        {onMerge && (
          <button type="button" onClick={onMerge} className={`${swipeBtn} bg-violet-700`}>
            <Merge size={18} aria-hidden="true" />
            Unisci
          </button>
        )}
        <button type="button" onClick={onDelete} className={`${swipeBtn} bg-red-700`}>
          <Trash2 size={18} aria-hidden="true" />
          Elimina
        </button>
      </div>
    </li>
  );
}
