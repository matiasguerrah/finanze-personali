import { useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { getSetting } from '../db/repo';
import { inputClass, labelClass, primaryButton } from '../components/form';
import { useToast } from '../state/toast';
import { isLikelyScriptUrl } from './client';
import {
  clearSyncConfig,
  saveSyncConfig,
  SYNC_KEY,
  SYNC_URL,
  syncNow,
  testConnection,
  useSyncState,
} from './sync';
import { useSyncStatus } from './useSyncStatus';

const dateTime = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_TEXT = {
  notConfigured: 'Non configurata: i dati restano solo su questo dispositivo.',
  syncing: 'Sincronizzazione in corso…',
  offline: 'Offline: le modifiche partiranno quando torni online.',
  error: 'Ultima sincronizzazione non riuscita.',
  pending: 'Modifiche in attesa di invio.',
  synced: 'Tutto sincronizzato.',
};

export function SyncSettingsPage() {
  const status = useSyncStatus();
  const { lastResult } = useSyncState();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [checking, setChecking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getSetting<string>(SYNC_URL, ''), getSetting<string>(SYNC_KEY, '')]).then(
      ([u, k]) => {
        setUrl(u);
        setKey(k);
      },
    );
  }, []);

  async function connect() {
    const u = url.trim();
    const k = key.trim();
    if (!isLikelyScriptUrl(u)) {
      setFormError(
        'L’URL deve essere quello del deploy: https://script.google.com/macros/s/…/exec',
      );
      return;
    }
    if (!k) {
      setFormError('Incolla la chiave segreta.');
      return;
    }
    setChecking(true);
    setFormError(null);
    const err = await testConnection(u, k);
    setChecking(false);
    if (err) {
      setFormError(err);
      return;
    }
    await saveSyncConfig(u, k);
    toast({ message: 'Connesso al Google Sheet', tone: 'success' });
    await syncNow();
  }

  async function disconnect() {
    await clearSyncConfig();
    setUrl('');
    setKey('');
    toast({ message: 'Sincronizzazione disattivata. I dati restano su questo dispositivo.' });
  }

  if (!status) return null;
  const configured = status.kind !== 'notConfigured';

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="state-h"
        aria-live="polite"
        className="flex flex-col gap-2 rounded-2xl bg-surface p-4"
      >
        <h2 id="state-h" className="font-semibold">
          Stato
        </h2>
        <p className={status.kind === 'error' ? 'text-danger' : ''}>{STATUS_TEXT[status.kind]}</p>
        {status.lastError && <p className="text-sm text-danger">{status.lastError}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Modifiche in attesa</dt>
          <dd className="tabular-nums">{status.pending}</dd>
          <dt className="text-muted">Ultima sincronizzazione</dt>
          <dd>{status.lastSyncAt ? dateTime.format(new Date(status.lastSyncAt)) : 'mai'}</dd>
          {lastResult && (
            <>
              <dt className="text-muted">Ultimo giro</dt>
              <dd>
                {lastResult.pushed} inviati, {lastResult.pulled} ricevuti
                {lastResult.conflicts ? `, ${lastResult.conflicts} conflitti risolti` : ''}
              </dd>
            </>
          )}
        </dl>
        {lastResult && lastResult.skipped.length > 0 && (
          <details className="text-sm text-warn">
            <summary className="min-h-11 cursor-pointer py-2">
              {lastResult.skipped.length} righe dello Sheet ignorate perché non leggibili
            </summary>
            <ul className="list-disc pl-5">
              {lastResult.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
        {configured && (
          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={status.kind === 'syncing' || status.kind === 'offline'}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 font-semibold disabled:opacity-50"
          >
            <RefreshCw
              size={18}
              aria-hidden="true"
              className={status.kind === 'syncing' ? 'animate-spin' : ''}
            />
            Sincronizza ora
          </button>
        )}
      </section>

      <section aria-labelledby="conn-h" className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
        <h2 id="conn-h" className="font-semibold">
          Collegamento al Google Sheet
        </h2>
        <label className={labelClass}>
          URL dell’app web (Apps Script)
          <input
            className={inputClass}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://script.google.com/macros/s/…/exec"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Chiave segreta
          <span className="flex gap-2">
            <input
              className={inputClass}
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Nascondi chiave' : 'Mostra chiave'}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg"
            >
              {showKey ? (
                <EyeOff size={18} aria-hidden="true" />
              ) : (
                <Eye size={18} aria-hidden="true" />
              )}
            </button>
          </span>
        </label>
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <button
          type="button"
          onClick={() => void connect()}
          disabled={checking}
          className={`${primaryButton} disabled:opacity-60`}
        >
          {checking ? 'Verifico…' : configured ? 'Verifica e salva' : 'Collega'}
        </button>
        {configured && (
          <button
            type="button"
            onClick={() => void disconnect()}
            className="min-h-11 text-sm font-semibold text-muted underline underline-offset-2"
          >
            Disattiva la sincronizzazione
          </button>
        )}
        <p className="text-xs text-muted">
          URL e chiave restano solo su questo dispositivo: non vengono mai scritti nello Sheet.
        </p>
      </section>

      <details className="rounded-2xl bg-surface p-4 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">
          Come preparare il Google Sheet (una volta sola)
        </summary>
        <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5">
          <li>Crea un nuovo Google Sheet vuoto (es. “Conti – dati”).</li>
          <li>
            Menu <strong>Estensioni › Apps Script</strong>. Sostituisci il contenuto di{' '}
            <code>Code.gs</code> con il file <code>apps-script/Code.gs</code> del progetto e salva.
          </li>
          <li>
            Nell’editor scegli la funzione <strong>setup</strong> e premi <strong>Esegui</strong>.
            Autorizza l’accesso quando richiesto. Dal <strong>Registro di esecuzione</strong> copia
            la chiave segreta.
          </li>
          <li>
            <strong>Esegui il deployment › Nuovo deployment</strong>, tipo <strong>App web</strong>:
            “Esegui come: <strong>me</strong>”, “Chi ha accesso: <strong>chiunque</strong>”. Copia
            l’URL che termina con <code>/exec</code>.
          </li>
          <li>Incolla URL e chiave qui sopra e premi “Collega”. Ripeti su ogni dispositivo.</li>
        </ol>
        <p className="mt-2 text-muted">
          Se aggiorni <code>Code.gs</code>, usa “Gestisci deployment › Modifica › Nuova versione”:
          così l’URL resta lo stesso.
        </p>
      </details>
    </div>
  );
}
