# Conti

PWA personale per le finanze personali e professionali (regime forfettario), offline-first, con un Google Sheet come database.

Funziona senza connessione: i dati stanno sul dispositivo e si sincronizzano con un Google Sheet tuo quando c'è rete. Non c'è nessun altro server e nessun account da creare.

## Cosa fa

- **Inserimento rapido** da griglia di categorie e tastierino, con interruttore **Personale/Lavoro** (le spese di lavoro e quelle personali possono stare sullo stesso conto), giroconti, tag, "Dividi" per separare una spesa in parte personale e parte di lavoro.
- **Conti** con saldi, **scadenze** ricorrenti con promemoria (comprese le quattro scadenze fiscali del forfettario), **soglie di spesa** per giorno, settimana o mese con avvisi.
- **Debiti**: prestiti con piano di ammortamento, avvisi di pagamento e rateizzazioni, residuo e data di estinzione.
- **Report**, export CSV/Excel e backup (vedi sotto).
- **Stima del forfettario** (vedi sotto).
- **Avvisi email** facoltativi dallo script Apps Script (vedi sotto).
- Un filtro globale **Tutto / Personale / Lavoro** vale per home, movimenti, report ed export.

## Guida all'uso

### Movimenti

- Tocca una categoria in **Home** (o il pulsante **+**) e inserisci l'importo col tastierino. Puoi cambiare conto, data, nota, tag e **Personale/Lavoro**; l'ambito proposto è "Lavoro" se lo è la categoria o il conto, finché non tocchi l'interruttore.
- Un **incasso di lavoro** richiede l'attività attiva in quella data (se ce n'è una sola è già scelta), più facoltativamente numero di fattura e cliente.
- Una **spesa** si può collegare a un debito: conta come pagamento di quel debito.
- **Giroconto**: sposta denaro tra due conti; cambia i saldi ma non è né entrata né uscita.
- In **Movimenti** scorri i mesi; dal menu di una riga: Modifica, **Dividi Personale/Lavoro** (la parte personale resta sul movimento, quella di lavoro diventa un movimento collegato; "Annulla divisione" le riunisce), Elimina con **Annulla**.

### Conti e saldo

- **Altro › Conti**: saldo iniziale, tipo, ambito predefinito. Un conto usato da movimenti non si elimina: si **archivia** (sparisce dalle scelte, i dati restano).
- Il **Saldo conti** in Home è il denaro sui conti: saldo iniziale + entrate − uscite ± giroconti, contando solo i movimenti con data fino a oggi.
- **I debiti non entrano nel saldo**: se hai 50 € sul conto e 100 € di debiti non ancora pagati, il saldo resta +50 €. Il residuo dei debiti è in **Altro › Debiti**; il saldo cala solo quando registri un pagamento.

### Scadenze

- Ricorrenze mensili, bimestrali, trimestrali, annuali o ogni N giorni, con giorni di preavviso. Le mensili tornano al giorno scelto dopo i mesi corti (31 gen → 28 feb → 31 mar).
- Importo vuoto = "da definire"; "stimato" mostra "~".
- **Segna come pagata** registra il movimento (importo, data e conto modificabili) e passa alla scadenza successiva; **Salta** passa oltre senza movimento. Entrambe si annullano dal messaggio.
- Le quattro scadenze fiscali (imposta e contributi, 30 giugno e 30 novembre) sono già presenti; l'importo può essere proposto dalla stima del forfettario.
- Il numero sull'icona **Scadenze** conta quelle scadute o entro il preavviso.

### Soglie di spesa e notifiche

- **Altro › Soglie e notifiche**: limite per giorno, settimana (da lunedì) o mese, su tutte le spese o su una categoria, per Tutto/Personale/Lavoro, con avviso a una percentuale (predefinita 80%).
- Le soglie su "tutte le spese" **escludono imposta sostitutiva e contributi INPS**; quelle su una categoria contano tutto.
- Ogni livello (avviso, superata) viene segnalato una sola volta per periodo, con un messaggio in app e, se l'app è in secondo piano, una notifica di sistema. Le notifiche delle scadenze arrivano all'apertura dell'app.

### Debiti

- **Altro › Debiti** gestisce due stati:
  - **Avviso** (cartella, multa, avviso bonario): importo e scadenza; mostra quanto manca e i giorni alla scadenza.
  - **Rateizzato** (prestito o avviso rateizzato): capitale, tasso annuo, data della prima rata e la rata mensile _oppure_ il numero di rate; l'app calcola il piano (ammortamento alla francese, al centesimo).
- **Registra pagamento / Registra rata** apre l'inserimento già compilato e collegato al debito. I pagamenti coprono le rate in ordine: un pagamento in più copre le successive, ritardi e anticipi spostano la data di estinzione.
- **Rateizza** trasforma un avviso in un piano, proponendo come capitale quanto resta da pagare; i pagamenti fatti prima della rateizzazione restano all'avviso.
- Il dettaglio mostra residuo, interessi, rate pagate e in ritardo, grafico del residuo e piano completo.

### Profilo e attività

- **Altro › Profilo**: nome, partita IVA, codice fiscale e PEC, con controllo di validità. Si sincronizza come gli altri dati.
- **Altro › Attività professionali**: vedi [Stima del forfettario](#stima-del-forfettario).

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

## Installazione come app

Apri https://matiasguerrah.github.io/finanze-personali/ e:

- **iPhone / iPad** (Safari): pulsante **Condividi › Aggiungi alla schermata Home**. Le notifiche locali funzionano solo dall'app installata (iOS 16.4 o successivo): attivale in **Altro › Soglie e notifiche**.
- **Android** (Chrome): menu **⋮ › Installa app** (o "Aggiungi a schermata Home").
- **Computer** (Chrome, Edge): icona **Installa** nella barra degli indirizzi, oppure menu › **Installa Conti**. Safari su Mac: **File › Aggiungi al Dock**.

Ogni dispositivo ha il suo database: collega la sincronizzazione su ciascuno (stesso URL e stessa chiave). Su iPhone il browser Safari e l'app installata sono due spazi separati: usa sempre l'app installata.

Le notifiche dell'app (soglie e scadenze) partono solo quando la apri; per avvisi che arrivano anche ad app chiusa attiva gli **avvisi email**.

## Report, export e backup

In **Report**: panoramica (entrate/uscite, categorie, ultimi 12 mesi, soglie), sezione **Professionale** (incassi per mese, attività e cliente, spese di lavoro, incassi per anno) ed **Esporta**:

- **CSV** dei movimenti del periodo (separatore `;`, virgola decimale: si apre direttamente in Excel italiano).
- **Excel completo**: riepilogo, movimenti, movimenti professionali, riepilogo professionale dell'anno e un foglio per ogni tabella.
- **Backup JSON** di tutti i dati e **ripristino**: prima mostra quanti record aggiunge e aggiorna, poi aggiunge i record mancanti e le versioni più recenti, non cancella nulla, e invia al Google Sheet ciò che ripristina.

Il periodo e il filtro Tutto/Personale/Lavoro scelti valgono anche per l'export. Su iPhone, nell'app installata, un download apre il pannello di condivisione: scegli **Salva in File**.

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
3. Nella tendina accanto a **▷ Esegui** scegli la funzione **`setup`** e premi **Esegui**, poi autorizza lo script (se compare "Google non ha verificato questa app": **Avanzate › Vai a … (non sicuro) › Consenti**; è normale, lo script è tuo). `setup` crea un tab per ogni tabella e genera la **chiave segreta**, che trovi nel **Registro di esecuzione**.
4. **Esegui il deployment › Nuovo deployment › App web** con "Esegui come: **me**" e "Chi ha accesso: **chiunque**". Copia l'URL che termina con `/exec`.
5. Nell'app apri **Altro › Sincronizzazione**, incolla URL e chiave e premi **Collega**. Ripeti su ogni dispositivo.

"Chiunque" è necessario perché l'app non fa il login Google. Senza la chiave segreta lo script rifiuta qualsiasi richiesta. URL e chiave restano solo nel dispositivo (tabella locale `settings`) e non finiscono mai nello Sheet.

### Aggiornare lo script

Quando `apps-script/Code.gs` cambia nel repository, l'editor Apps Script **non** si aggiorna da solo:

1. Apri https://raw.githubusercontent.com/matiasguerrah/finanze-personali/main/apps-script/Code.gs, seleziona tutto (⌘A) e copia.
2. Nell'editor apri `Code.gs`, seleziona tutto (⌘A), incolla e salva (⌘S).
3. Controllo: nella tendina accanto a **▷ Esegui** devono comparire anche `installAlertsTrigger`, `checkAlerts` e `dailySummary` (se l'elenco finisce con `rowToObject`, è ancora la versione vecchia).

Cosa usa quale versione:

- **Sincronizzazione** (`doPost`): usa la versione _pubblicata_ nel deployment, non quella salvata nell'editor. Serve ripubblicare solo se cambia la sincronizzazione: **Esegui il deployment › Gestisci deployment › Modifica (matita) › Versione: nuova versione** (l'URL resta lo stesso).
- **Avvisi email** (trigger): usano sempre il codice _salvato_ nell'editor. Basta salvare.

Non serve rieseguire `setup`: non rigenera la chiave e non tocca i dati.

### Come funziona

- Ogni modifica locale entra in una coda (`outbox`). La sincronizzazione **invia** la coda in blocchi da 200 record e poi **riceve** dal server ciò che è cambiato dall'ultima volta.
- Parte all'apertura dell'app, quando torna la connessione, ogni 60 minuti con la pagina visibile, circa 15 secondi dopo una modifica e con il pulsante "Sincronizza ora".
- **Conflitti**: vince la modifica con `updatedAt` più recente (last-write-wins), sia sul server sia sul dispositivo.
- **Cancellazioni**: sono logiche (`deleted = TRUE`), quindi arrivano anche agli altri dispositivi.
- Lo Sheet ha un tab per tabella e tutte le celle in testo semplice. Le colonne nuove vengono aggiunte in automatico quando l'app le invia. `_serverUpdatedAt` è l'ora di scrittura sul server e cresce sempre.
- Se modifichi a mano una cella in modo non valido (ad esempio `4,50` in `amountCents`), quella riga viene ignorata e segnalata in **Altro › Sincronizzazione**. Le altre righe passano.

## Avvisi email (facoltativi)

Lo stesso script può mandarti un'email, anche quando l'app è chiusa:

- **Ogni ora** (`checkAlerts`): soglie di spesa raggiunte o superate, scadenze in arrivo o scadute (comprese quelle fiscali), soglia ricavi all'80%, al 95% e superata. Manda un'email solo se c'è qualcosa di nuovo e non ripete mai lo stesso avviso (le chiavi già inviate stanno nelle proprietà dello script, `SENT_ALERTS`).
- **Ogni mattina verso le 8** (`dailySummary`, facoltativo): le spese del giorno prima, separate tra personali e di lavoro. Se non ci sono spese non manda nulla.

Per attivarli, dopo aver aggiornato `Code.gs` nell'editor Apps Script:

1. Seleziona **`installAlertsTrigger`** e premi **Esegui**; autorizza l'invio di email e l'esecuzione in background.
2. Se vuoi anche il riepilogo, esegui **`installDailySummaryTrigger`**.
3. Per spegnere tutto: **`removeAllTriggers`**.

Le email arrivano all'account Google proprietario dello script. Per un altro indirizzo aggiungi in **Impostazioni progetto › Proprietà script** la proprietà `ALERT_EMAIL`. Gli avvisi usano i dati presenti nello Sheet, quindi vedono le modifiche dopo la sincronizzazione. Gli avvisi email e quelli dell'app sono indipendenti: lo stesso avviso può arrivare in entrambi.

I trigger non toccano la sincronizzazione: non serve un nuovo deployment.

Per verificare:

- Icona **sveglia (Trigger)** nella barra laterale dell'editor: `checkAlerts` "Ogni ora" (e `dailySummary` se attivato).
- Icona **Esecuzioni**: ogni ora compare `checkAlerts` "Completata". Se un'esecuzione fallisce, Google manda un'email di errore.
- Per provare subito, scegli `checkAlerts` nella tendina e premi **Esegui**: se c'è qualcosa di nuovo da segnalare l'email arriva subito; rieseguendo non arriva più nulla.
- Per ricevere di nuovo tutti gli avvisi già inviati (solo per prova), elimina la proprietà `SENT_ALERTS` in **Impostazioni progetto › Proprietà script**.

## Icone

La sorgente è [`public/favicon.svg`](public/favicon.svg). I PNG (`pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` a tutto campo per Android, `apple-touch-icon.png` 180×180 senza trasparenza per iOS) sono generati da quell'SVG; se lo cambi, rigenerali alle stesse dimensioni. Su telefono la nuova icona compare solo reinstallando l'app (rimuovila e aggiungila di nuovo alla schermata Home; con la sincronizzazione attiva i dati tornano dallo Sheet).

## Accessibilità

Contrasto AA in tema chiaro e scuro, focus sempre visibile, pulsante "Vai al contenuto", target di almeno 44 px, icone sempre con etichetta testuale, grafici con tabella equivalente per screen reader. Verificato con axe-core (WCAG 2.1 A/AA) su tutte le schermate e nei pannelli principali.

## Problemi comuni

- **Un dispositivo mostra dati diversi dall'altro**: premi **Altro › Sincronizzazione › Sincronizza ora** su entrambi. La sincronizzazione parte anche da sola tornando sull'app (se l'ultimo tentativo è di almeno 2 minuti prima).
- **Su iPhone mancano dati inseriti da Safari** (o viceversa): Safari e l'app installata hanno database separati; usa l'app installata e collega lì la sincronizzazione.
- **Le notifiche non arrivano su iPhone**: servono l'app installata (iOS 16.4+) e il permesso concesso da **Altro › Soglie e notifiche**. Le notifiche dell'app partono solo quando la apri; per avvisi ad app chiusa usa gli avvisi email.
- **Nessuna email di avviso**: controlla che l'editor abbia il `Code.gs` aggiornato e che il trigger esista (vedi [Avvisi email](#avvisi-email-facoltativi)); gli avvisi vedono solo i dati già sincronizzati.
- **Una riga dello Sheet viene ignorata**: è stata modificata a mano con un valore non valido; il dettaglio è in **Altro › Sincronizzazione**.
- **Dopo un aggiornamento vedo ancora la versione vecchia**: chiudi e riapri l'app; si aggiorna da sola al primo avvio dopo il deploy.
