import { Link } from 'react-router-dom';
import {
  Banknote,
  Briefcase,
  ChevronRight,
  Cloud,
  Gauge,
  Percent,
  UserRound,
  Wallet,
} from 'lucide-react';

const ITEMS = [
  {
    to: '/altro/profilo',
    label: 'Profilo',
    hint: 'Nome, partita IVA, codice fiscale, PEC',
    icon: UserRound,
  },
  {
    to: '/altro/conti',
    label: 'Conti',
    hint: 'Saldi, giroconti, conti archiviati',
    icon: Wallet,
  },
  {
    to: '/altro/debiti',
    label: 'Debiti',
    hint: 'Prestiti e finanziamenti: rate, residuo, estinzione',
    icon: Banknote,
  },
  {
    to: '/altro/soglie',
    label: 'Soglie e notifiche',
    hint: 'Limiti di spesa per giorno, settimana o mese',
    icon: Gauge,
  },
  {
    to: '/altro/sync',
    label: 'Sincronizzazione',
    hint: 'Google Sheet, stato e ultimo invio',
    icon: Cloud,
  },
  {
    to: '/altro/attivita',
    label: 'Attività professionali',
    hint: 'Codici ATECO e coefficienti',
    icon: Briefcase,
  },
  {
    to: '/altro/fiscale',
    label: 'Parametri fiscali',
    hint: 'Aliquote, contributi, soglia ricavi, acconti',
    icon: Percent,
  },
];

export function MorePage() {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-2xl bg-surface">
      {ITEMS.map(({ to, label, hint, icon: Icon }) => (
        <li key={to}>
          <Link to={to} className="flex min-h-14 items-center gap-3 p-4 hover:bg-surface-2">
            <Icon size={20} className="text-muted" aria-hidden="true" />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted">{hint}</span>
            </span>
            <ChevronRight size={18} className="text-muted" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
