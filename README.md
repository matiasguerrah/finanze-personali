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

## Pubblicazione (GitHub Pages)

L'app è online su **https://matiasguerrah.github.io/finanze-personali/**.

Ogni push su `main` avvia il workflow `.github/workflows/deploy.yml`: lint, test, build con `BASE_PATH=/finanze-personali/` e pubblicazione. Se un controllo fallisce, resta online la versione precedente. Stato dei deploy: scheda **Actions** del repository.

Il repository è pubblico ma contiene solo il codice: i dati stanno nel browser di ogni dispositivo e nel tuo Google Sheet; URL e chiave dello script si inseriscono in **Altro › Sincronizzazione** e restano sul dispositivo.

Dopo un aggiornamento, l'app scarica la nuova versione in background all'apertura e si ricarica da sola; i dati non vengono toccati.

## Report, export e backup

In **Report**: panoramica (entrate/uscite, categorie, ultimi 12 mesi, soglie), sezione **Professionale** (incassi per mese, attività e cliente, spese di lavoro, incassi per anno) ed **Esporta**:

- **CSV** dei movimenti del periodo (separatore `;`, virgola decimale: si apre direttamente in Excel italiano).
- **Excel completo**: riepilogo, movimenti, movimenti professionali, riepilogo professionale dell'anno e un foglio per ogni tabella.
- **Backup JSON** di tutti i dati e **ripristino**: aggiunge i record mancanti e le versioni più recenti, non cancella nulla, e invia al Google Sheet ciò che ripristina.

## Stima del forfettario

È una **stima indicativa, da verificare con il commercialista**: l'app lo ricorda sempre accanto ai numeri.

### Configurazione

L'app non contiene valori fiscali predefiniti: li inserisci tu.

- **Altro › Attività professionali**: nome, codice ATECO, coefficiente di redditività, date di validità. Per cambiare codice crea una nuova attività e chiudi la vecchia con una data di fine: gli incassi già registrati restano alla vecchia.
- **Altro › Parametri fiscali**, per anno: aliquota dell'imposta sostitutiva, aliquota dei contributi, quota contributiva fissa (0 se non prevista), soglia ricavi annui. Ogni anno usa i parametri con l'anno di validità più recente, così una modifica non cambia le stime degli anni precedenti.
- Finché mancano attività o parametri, **Report › Professionale** mostra una configurazione guidata in due passi e solo incassi e spese, senza stime.

### Cosa calcola (anno solare, principio di cassa)

- **Reddito imponibile** = somma, per ogni attività, di incassi di lavoro attribuiti × coefficiente.
- **Contributi stimati** = imponibile × aliquota contributi + quota fissa.
- **Imposta stimata** = (imponibile − contributi INPS versati nell'anno) × aliquota imposta, mai negativa.
- **Da accantonare** = contributi + imposta, anche diviso per mese; **netto disponibile** = incassato − accantonamento.
- **Soglia ricavi**: barra con tutti gli incassi di lavoro dell'anno, avviso all'80% e al 95% (una volta per anno e livello, in app e come notifica di sistema ad app chiusa).
- **Per attività**: incassi, coefficiente e imponibile (gestisce il cambio di codice a metà anno e più attività contemporanee).
- **Spese reali e quota forfettaria**: spese di lavoro effettive (escluse imposte e contributi) confrontate con la parte di incassi non tassata. Se le superano: "valuta con il commercialista".
- **Incassi senza attività valida** (nessuna attività, o attività non attiva in quella data): esclusi dalla stima ed elencati; toccandone uno lo correggi.
- In **Home**, con il filtro Tutto o Lavoro, una scheda riassume accantonamento, incassato, netto, soglia e incassi da sistemare.

### Importi proposti per le scadenze fiscali

Nei parametri puoi indicare, facoltativamente, le percentuali di 1° e 2° acconto per imposta e contributi (in percentuale dell'importo dell'anno precedente). Con queste, le quattro scadenze fiscali mostrano in **Scadenze** un importo "~ stima" e "Segna come pagata" lo precompila, con il dettaglio. Il calcolo segue il metodo storico:

- **giugno** = saldo dell'anno precedente (stima meno acconti dovuti) + 1° acconto;
- **novembre** = 2° acconto.

Per i contributi gli acconti valgono sulla parte in percentuale (la quota fissa si paga a parte). Le soglie minime sotto cui gli acconti non sono dovuti non sono gestite.

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
