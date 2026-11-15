import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, BellOff, Share } from 'lucide-react';
import { getSetting } from '../../db/repo';
import {
  currentNotificationSupport,
  disableNotifications,
  enableNotifications,
  NOTIFICATIONS_SETTING,
  showLocalNotification,
} from '../../state/notify';
import { useToast } from '../../state/toast';

export function NotificationsCard() {
  const [support, setSupport] = useState(currentNotificationSupport);
  const enabled = useLiveQuery(() => getSetting<boolean>(NOTIFICATIONS_SETTING, false), []);
  const toast = useToast();
  const on = support === 'granted' && enabled === true;

  async function turnOn() {
    const s = await enableNotifications();
    setSupport(s);
    if (s === 'granted') toast({ message: 'Notifiche attivate', tone: 'success' });
  }

  async function test() {
    const ok = await showLocalNotification('Conti', 'Le notifiche funzionano.', {
      tag: 'test',
      path: '/altro/soglie',
    });
    if (!ok) toast({ message: 'Impossibile mostrare la notifica.', tone: 'warn' });
  }

  let body;
  if (support === 'needsInstall')
    body = (
      <p className="text-sm text-muted">
        Su iPhone e iPad le notifiche funzionano solo dall’app installata (iOS 16.4 o successivo).
        In Safari tocca <Share size={14} className="inline align-[-2px]" aria-hidden="true" />{' '}
        <strong>Condividi › Aggiungi alla schermata Home</strong>, poi apri Conti dall’icona e torna
        qui.
      </p>
    );
  else if (support === 'unsupported')
    body = <p className="text-sm text-muted">Questo browser non supporta le notifiche.</p>;
  else if (support === 'denied')
    body = (
      <p className="text-sm text-muted">
        Le notifiche sono bloccate: riattivale dalle impostazioni del browser per questo sito.
      </p>
    );
  else if (on)
    body = (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void test()}
          className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold"
        >
          Invia una prova
        </button>
        <button
          type="button"
          onClick={() => void disableNotifications()}
          className="min-h-11 rounded-xl px-4 text-sm font-semibold text-muted underline underline-offset-2"
        >
          Disattiva
        </button>
      </div>
    );
  else
    body = (
      <button
        type="button"
        onClick={() => void turnOn()}
        className="min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg"
      >
        Attiva notifiche
      </button>
    );

  return (
    <section aria-labelledby="notif-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
      <h2 id="notif-h" className="flex items-center gap-2 font-semibold">
        {on ? (
          <Bell size={18} className="text-accent" aria-hidden="true" />
        ) : (
          <BellOff size={18} className="text-muted" aria-hidden="true" />
        )}
        Notifiche {on ? 'attive' : 'disattivate'}
      </h2>
      <p className="text-sm text-muted">
        Gli avvisi delle soglie compaiono sempre nell’app. Con le notifiche attive ricevi anche i
        promemoria delle scadenze, quando apri Conti.
      </p>
      {body}
    </section>
  );
}
