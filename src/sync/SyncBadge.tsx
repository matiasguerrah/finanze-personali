import { Link } from 'react-router-dom';
import { CloudAlert, Cloud, CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useSyncStatus } from './useSyncStatus';

/** Compact sync indicator for the header; tapping it opens the sync settings. */
export function SyncBadge() {
  const s = useSyncStatus();
  if (!s || s.kind === 'notConfigured') return null;

  const view = {
    syncing: { Icon: RefreshCw, label: 'Sincronizzo…', tone: 'text-muted', spin: true },
    offline: {
      Icon: CloudOff,
      label: s.pending ? `Offline · ${s.pending}` : 'Offline',
      tone: 'text-muted',
    },
    error: { Icon: CloudAlert, label: 'Errore sync', tone: 'text-danger' },
    pending: { Icon: CloudUpload, label: `${s.pending} in attesa`, tone: 'text-warn' },
    synced: { Icon: Cloud, label: 'Sincronizzato', tone: 'text-muted' },
  }[s.kind];
  const { Icon, label, tone } = view;

  return (
    <Link
      to="/altro/sync"
      aria-label={`Stato sincronizzazione: ${label}`}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs font-medium hover:bg-surface ${tone}`}
    >
      <Icon
        size={16}
        aria-hidden="true"
        className={'spin' in view && view.spin ? 'animate-spin' : ''}
      />
      <span>{label}</span>
    </Link>
  );
}
