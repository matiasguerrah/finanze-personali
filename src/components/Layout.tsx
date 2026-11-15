import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarClock, ChartPie, House, List, Menu, Plus } from 'lucide-react';
import { ScopeFilterBar } from './ScopeFilterBar';
import { useOpenEntry } from '../state/entry';
import { useRecurring } from '../db/hooks';
import { attentionCount } from '../lib/recurring';
import { todayRome } from '../lib/dates';
import { SyncBadge } from '../sync/SyncBadge';

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/movimenti', label: 'Movimenti', icon: List },
  { to: '/scadenze', label: 'Scadenze', icon: CalendarClock },
  { to: '/report', label: 'Report', icon: ChartPie },
  { to: '/altro', label: 'Altro', icon: Menu },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/$/, 'Conti'],
  [/^\/movimenti/, 'Movimenti'],
  [/^\/scadenze/, 'Scadenze'],
  [/^\/report/, 'Report'],
  [/^\/altro\/attivita/, 'Attività professionali'],
  [/^\/altro\/conti/, 'Conti'],
  [/^\/altro\/soglie/, 'Soglie di spesa'],
  [/^\/altro\/profilo/, 'Profilo'],
  [/^\/altro\/sync/, 'Sincronizzazione'],
  [/^\/altro/, 'Altro'],
];

/** Pages where the global Tutto/Personale/Lavoro filter applies. */
const FILTERED = /^\/($|movimenti|report)/;

export function Layout() {
  const { pathname } = useLocation();
  const openEntry = useOpenEntry();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'Conti';
  const recurring = useRecurring();
  const due = recurring ? attentionCount(recurring, todayRome()) : 0;
  const badge = (to: string) =>
    to === '/scadenze' && due > 0 ? (
      <span className="absolute -top-1.5 -right-2.5 min-w-5 rounded-full bg-red-700 px-1 text-center text-[11px] leading-5 font-bold text-white">
        {due}
        <span className="sr-only"> da pagare</span>
      </span>
    ) : null;

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <nav
        aria-label="Principale"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-1 border-r border-line p-4 md:flex"
      >
        <span className="mb-4 px-3 text-xl font-bold text-accent">Conti</span>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium ${
                isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface hover:text-fg'
              }`
            }
          >
            <span className="relative">
              <Icon size={20} aria-hidden="true" />
              {badge(to)}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-bg/95 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 backdrop-blur">
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="-my-2 ml-auto sm:order-last sm:ml-0">
            <SyncBadge />
          </div>
          {FILTERED.test(pathname) && <ScopeFilterBar className="ml-auto w-full sm:w-auto" />}
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-24">
          <Outlet />
        </main>
      </div>

      <button
        type="button"
        onClick={() => openEntry({ mode: 'new', type: 'expense' })}
        aria-label="Nuovo movimento"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg md:right-8 md:bottom-8"
      >
        <Plus size={28} aria-hidden="true" />
      </button>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Principale"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            <span className="relative">
              <Icon size={22} aria-hidden="true" />
              {badge(to)}
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
