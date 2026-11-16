import { Link } from 'react-router-dom';
import { Briefcase, ChevronRight } from 'lucide-react';
import { useTaxContext } from '../../db/hooks';
import { yearOf } from '../../lib/dates';
import { formatCents } from '../../lib/money';
import { taxYear, thresholdText } from '../../lib/tax';

/** Home card for the business side: set-aside so far and the revenue threshold. */
export function WorkSummaryCard({ today }: { today: string }) {
  const ctx = useTaxContext();
  if (!ctx) return null;
  const y = taxYear(ctx, yearOf(today));
  const e = y.estimate;
  if (!e || y.incomeCents === 0) return null;
  const t = e.threshold;
  const tone = t.level === 'ok' ? 'text-muted' : t.level === 'warn' ? 'text-warn' : 'text-danger';
  return (
    <Link
      to="/report/professionale"
      className="flex min-h-11 items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-surface-2"
    >
      <Briefcase size={20} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted">Lavoro {y.year} · da accantonare</span>
        <span className="text-lg font-semibold tabular-nums">{formatCents(e.setAsideCents)}</span>
        <span className="text-xs text-muted tabular-nums">
          incassati {formatCents(y.incomeCents)} · netto {formatCents(e.netCents)}
        </span>
        {t.limitCents > 0 && (
          <span className={`text-xs ${tone}`}>{thresholdText(t.level, t.usedBp)}</span>
        )}
        {y.unattributed.length > 0 && (
          <span className="text-xs text-warn">
            {y.unattributed.length === 1
              ? '1 incasso senza attività valida'
              : `${y.unattributed.length} incassi senza attività valida`}
          </span>
        )}
      </span>
      <ChevronRight size={18} className="text-muted" aria-hidden="true" />
    </Link>
  );
}
