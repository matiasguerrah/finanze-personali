# Conti

PWA personale per le finanze personali e professionali (regime forfettario), offline-first, con un Google Sheet come database.

> Il README completo (Google Sheet, Apps Script, deploy, installazione come PWA) arriverà nella fase 8.

## Sviluppo locale

Requisiti: Node 20 o superiore.

```bash
npm install
npm run dev        # http://localhost:5173 (con -- --host anche da cellulare in LAN)
npm test           # test Vitest
npm run lint && npm run typecheck
npm run build && npm run preview   # build di produzione con service worker (prova offline)
```

## Sincronizzazione con Google Sheet

I dati vivono sul dispositivo (IndexedDB) e vengono copiati in un Google Sheet tramite uno script Apps Script, uno per persona. Non c'è nessun altro server.

### Preparazione (una volta sola)

1. Crea un Google Sheet vuoto, ad esempio "Conti – dati".
2. Apri **Estensioni › Apps Script**, sostituisci il contenuto di `Code.gs` con [`apps-script/Code.gs`](apps-script/Code.gs) e salva. Da **Impostazioni progetto** attiva "Mostra il file manifest appsscript.json nell'editor" e copia anche [`apps-script/appsscript.json`](apps-script/appsscript.json): imposta il fuso Europe/Rome e il runtime V8.
3. Seleziona la funzione **`setup`** e premi **Esegui**, poi autorizza lo script. `setup` crea un tab per ogni tabella e genera la **chiave segreta**, che trovi nel **Registro di esecuzione**.
4. **Esegui il deployment › Nuovo deployment › App web** con "Esegui come: **me**" e "Chi ha accesso: **chiunque**". Copia l'URL che termina con `/exec`.
5. Nell'app apri **Altro › Sincronizzazione**, incolla URL e chiave e premi **Collega**. Ripeti su ogni dispositivo.

"Chiunque" è necessario perché l'app non fa il login Google. Senza la chiave segreta lo script rifiuta qualsiasi richiesta. URL e chiave restano solo nel dispositivo (tabella locale `settings`) e non finiscono mai nello Sheet.

Se modifichi `Code.gs`, pubblica con **Gestisci deployment › Modifica (matita) › Versione: nuova versione**: così l'URL resta lo stesso.

### Come funziona

- Ogni modifica locale entra in una coda (`outbox`). La sincronizzazione **invia** la coda in blocchi da 200 record e poi **riceve** dal server ciò che è cambiato dall'ultima volta.
- Parte all'apertura dell'app, quando torna la connessione, ogni 60 minuti con la pagina visibile, circa 15 secondi dopo una modifica e con il pulsante "Sincronizza ora".
- **Conflitti**: vince la modifica con `updatedAt` più recente (last-write-wins), sia sul server sia sul dispositivo.
- **Cancellazioni**: sono logiche (`deleted = TRUE`), quindi arrivano anche agli altri dispositivi.
- Lo Sheet ha un tab per tabella e tutte le celle in testo semplice. Le colonne nuove vengono aggiunte in automatico quando l'app le invia. `_serverUpdatedAt` è l'ora di scrittura sul server e cresce sempre.
- Se modifichi a mano una cella in modo non valido (ad esempio `4,50` in `amountCents`), quella riga viene ignorata e segnalata in **Altro › Sincronizzazione**. Le altre righe passano.
