/** HTTP transport to the Apps Script web app. */
import type { SyncRequest } from '../lib/sync/merge';
import { SyncError, type Transport } from './engine';

const TIMEOUT_MS = 45_000;

/**
 * text/plain keeps the request "simple" (no CORS preflight, which Apps Script cannot answer);
 * the 302 to googleusercontent.com is followed automatically.
 */
export function httpTransport(url: string): Transport {
  return async (req: SyncRequest) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(req),
        redirect: 'follow',
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch {
      throw new SyncError(ctrl.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new SyncError(`http_${res.status}`);
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SyncError('bad_response');
    }
  };
}

/** Apps Script web app URLs look like https://script.google.com/macros/s/<id>/exec */
export function isLikelyScriptUrl(url: string): boolean {
  return /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec\/?$/.test(
    url.trim(),
  );
}

const MESSAGES: Record<string, string> = {
  unauthorized: 'Chiave segreta errata: copiala di nuovo dal log di setup().',
  not_setup: 'Lo script non è inizializzato: esegui la funzione setup() dall’editor Apps Script.',
  network: 'Impossibile raggiungere lo script. Sei online? L’URL è corretto?',
  timeout: 'Lo script non ha risposto in tempo. Riprova tra poco.',
  bad_response:
    'Risposta non valida. Verifica che il deploy sia “Chiunque” e che l’URL termini con /exec.',
  busy: 'Lo Sheet è occupato da un’altra sincronizzazione. Riprova tra poco.',
  bad_request: 'Richiesta non valida.',
  not_configured: 'Sincronizzazione non configurata.',
};

export function syncErrorMessage(code: string): string {
  if (MESSAGES[code]) return MESSAGES[code];
  if (code.startsWith('http_')) return `Errore HTTP ${code.slice(5)} dallo script.`;
  return `Errore dello script: ${code}`;
}
