# Quiz Live

Interazione dal vivo con il pubblico (sondaggi, nuvole di parole, ruota dei premi,
lotteria dei numeri e quiz di memoria) per presentazioni HTML, con lo stile Blue State
e oro della presentazione che accompagna.

- **Pagina del pubblico** (`/`): si entra con il solo nome e si vede ciò che è «sul palco», normalmente nulla. Quando il relatore apre un’attività, questa compare in diretta. Tutti possono giocare. Ogni attività occupa una schermata del telefono: alla chiusura compare prima l’esito; la soluzione e la propria risposta si aprono con i pulsanti «Mostra».
- **Pagina di amministrazione** (`/admin`): crea e modifica attività, raggruppale in presentazioni, mettile sul palco manualmente, visualizza risultati e classifiche e gestisci la chiave API. L’accesso richiede la password amministratore (`ADMIN_PASSWORD`).
- **API per le presentazioni** (`/api/v1`): una chiave API globale permette a una presentazione HTML di aprire e chiudere le attività al cambio di slide e leggere i risultati in diretta per disegnare i propri grafici.

Esiste un solo palco, quindi una sola presentazione alla volta: nessun codice d’ingresso.
Basta scrivere il proprio nome.

## Presentazioni e punti

Una **presentazione** raggruppa le attività di un intervento (Admin → Presentazioni).
I punti dei giochi si sommano nella sua classifica. Mettere sul palco una delle sue
attività la rende la presentazione in corso; resta tale anche quando si svuota il palco,
finché non ne inizia un’altra o viene terminata (da Admin o con
`POST /api/v1/stage/presentation`). Mentre è in corso, quando non c’è nulla a cui
rispondere, i telefoni mostrano i primi tre e la propria posizione.

I punti vengono assegnati all’estrazione o alla rivelazione, salvati e cancellati insieme
alle risposte: fino a 1000 per attività, moltiplicati per l’accuratezza della risposta,
con una penalità che arriva alla metà nei primi 30 secondi dall’apertura
(`src/activities/scoring.ts`). Modificare una risposta ne aggiorna il tempo di invio.

| Tipo | Accuratezza |
| --- | --- |
| Quiz di memoria | 1 se corretto, altrimenti 0 |
| Indovina il numero vero | 1 per la cifra esatta, fino a 0 con un errore del 100% |
| Lotteria dei numeri | 1 − distanza / 100 dal numero estratto |

Sondaggi, nuvole di parole, interesse all’acquisto e ruota non hanno una risposta giusta
e non assegnano punti. Un’attività con **Conta per la classifica** disattivato continua
ad assegnarli e mostrarli sul telefono, ma non li somma in classifica. Riattivando
l’opzione vengono inclusi di nuovo. Le classifiche esportano i nomi scelti all’accesso,
mai gli identificativi personali.

## Tecnologie

Un processo Node 24, senza compilazione del server:

- [Hono](https://hono.dev) per HTTP, eseguito come TypeScript da Node tramite rimozione dei tipi (`src/server`).
- React 19 + Vite + Tailwind 4 per l’applicazione a pagina singola (`src/client`).
- SQLite tramite `node:sqlite`, integrato in Node: un file, nessuna dipendenza nativa e nessun ORM.
- Server-Sent Events per gli aggiornamenti in diretta.
- Accesso con nome e cookie di sessione; per l’amministrazione serve anche `ADMIN_PASSWORD`.

## Sviluppo

```sh
pnpm install
cp .env.example .env   # ADMIN_PASSWORD=dev-password
pnpm dev               # http://localhost:5173 (Vite) → inoltra /api e /auth a :8787
```

Apri `/admin` ed entra con un nome qualsiasi e la password di `.env`. La pagina del
pubblico chiede solo il nome: usa una finestra privata o un altro browser per simulare
una seconda persona, oppure curl:

```sh
curl -c jar -H 'content-type: application/json' -d '{"name":"Ada"}' localhost:5173/auth/login
```

Prova `examples/demo-presentation.html?url=http://localhost:5173&key=<chiave API>`
(la chiave è in Admin → API), con un sondaggio il cui slug sia `dinner-poll`.

```sh
pnpm test        # Vitest
pnpm typecheck
pnpm check       # Biome (pnpm check:fix per correggere)
```

## Accesso

- **Pubblico**: un nome da 1 a 40 caratteri. Ogni persona riceve un identificativo casuale, conservato se accede di nuovo dallo stesso browser, anche come amministratore. Il cookie dura `SESSION_DAYS` giorni (7 per impostazione predefinita). Un nome è occupato finché qualcuno lo usa in una sessione attiva, ignorando maiuscole e spazi: alla seconda persona viene chiesto di aggiungere un’iniziale. Uscendo si libera il nome; chi lo prende dopo riparte da zero.
- **Amministrazione**: `/admin` richiede nome e `ADMIN_PASSWORD`. Anche gli amministratori possono giocare. Cambiare la password non disconnette chi è già entrato: per farlo occorre ripartire con un nuovo database o attendere la scadenza delle sessioni.

## Configurazione

| Variabile | Valore predefinito | Descrizione |
| --- | --- | --- |
| `PUBLIC_URL` | `http://localhost:5173` | Origine aperta dagli utenti. Con `https:` il cookie di sessione è Secure. |
| `PORT` | `8787` | Porta del server. |
| `DATABASE_PATH` | `data/live-audience.db` | `/data/live-audience.db` in Docker. |
| `ADMIN_PASSWORD` | | Obbligatoria, almeno 8 caratteri: password della pagina di amministrazione. |
| `SESSION_DAYS` | `7` | Durata delle sessioni in giorni. |

## Distribuzione

Ogni push su `main` pubblica `ghcr.io/diubii/live-audience:latest` (amd64 e arm64).

```sh
docker run -p 8787:8787 -v live-audience-data:/data \
  -e PUBLIC_URL=https://live.diubi.dev \
  -e ADMIN_PASSWORD=... \
  ghcr.io/diubii/live-audience:latest
```

- Esegui **una sola replica**: lo stato è in un file SQLite e gli aggiornamenti passano per un bus di eventi interno al processo. Un piccolo contenitore gestisce facilmente una sala piena.
- Conserva `/data` in un volume persistente. Fanne una copia di sicurezza per conservare le risposte.
- I Server-Sent Events attraversano Cloudflare e Traefik senza modifiche; il server invia un ping ogni 20 secondi per mantenere aperte le connessioni inattive.
- `GET /healthz` restituisce `ok`.

## API per le presentazioni

Admin → API mostra la chiave, un esempio da incollare e l’elenco degli endpoint:

```html
<script type="module">
  import { LiveAudience } from "https://live.diubi.dev/live-audience.js"
  const live = new LiveAudience({ url: "https://live.diubi.dev", key: "la_..." })

  await live.open("dinner-poll")   // sul palco, risposte aperte; sostituisce l’attività precedente
  await live.show("dinner-poll")   // sul palco, risposte chiuse
  await live.close()               // chiude le risposte dell’attività sul palco
  await live.reopen()              // le riapre
  await live.clear()               // schermata d’attesa
  await live.results("dinner-poll")
  await live.reset("dinner-poll")  // cancella tutte le risposte
  const stop = live.onResults("dinner-poll", ({ results }) => draw(results))  // in diretta
  live.onStage((stage) => console.log(stage))

  await live.startPresentation("welcome-talk")  // oppure apri una delle sue attività
  await live.leaderboard("welcome-talk")        // { leaderboard: [{ rank, name, points }] }
  live.onLeaderboard(({ leaderboard }) => drawPodium(leaderboard))  // presentazione in corso
  live.onAudience(({ connected, answered }) => drawCounter(connected, answered))  // presenti e risposte
  await live.endPresentation()
</script>
```

Per integrare le slide senza scrivere un comando per ciascuna, aggiungi `data-live="<slug>"`
a una slide (con `data-live-status="closed"` per mostrarla a risposte chiuse, oppure
`data-live="clear"` per la schermata d’attesa) e chiama
`live.applySlide(currentSlideElement)` a ogni cambio di slide.
Vedi `examples/demo-presentation.html`.

HTTP: `Authorization: Bearer <chiave>` (oppure `?key=`, necessario a `EventSource`).
CORS è aperto a ogni origine, compreso `file://`.

| Endpoint | Descrizione |
| --- | --- |
| `GET /api/v1/stage` | `{ status: "open" \| "closed", activity: { id, slug, type, title } \| null, presentation: { id, slug, title } \| null }` |
| `POST /api/v1/stage` | `{ "activity": "<slug>", "status": "open" \| "closed" }`; se omesso, status è open. |
| `POST /api/v1/stage/open` · `/close` · `/clear` | Apre o chiude le risposte, oppure svuota il palco. |
| `POST /api/v1/stage/presentation` | `{ "presentation": "<slug>" \| null }`: avvia o termina una presentazione. |
| `GET /api/v1/activities` | Tutte le attività con configurazione, `countsToLeaderboard` e numero di risposte. |
| `GET /api/v1/activities/:slug/results` | `{ id, slug, type, title, results }` |
| `POST /api/v1/activities/:slug/reset` | Cancella tutte le risposte. |
| `POST /api/v1/activities/:slug/draw` | Estrae una lotteria, rivela un numero vero o un quiz; esito, vincitore e punti persistono. |
| `GET /api/v1/audience` | `{ connected, answered, activity }`: persone con la pagina del pubblico aperta (più schede contano una volta) e risposte all’attività sul palco; `activity` è il suo slug, oppure null se il palco è vuoto. |
| `GET /api/v1/presentations` | Tutte le presentazioni. |
| `GET /api/v1/presentations/:slug/leaderboard` | `{ id, slug, title, leaderboard: [{ rank, name, points }] }`, dal primo in giù; i pari merito condividono la posizione. |
| `GET /api/v1/events[?activity=<slug>]` | SSE: eventi `stage`, `results` per l’attività sul palco (o quella indicata), `leaderboard` per la presentazione in corso e `audience` (come `GET /audience`) quando qualcuno entra, esce o risponde. |

I risultati dei sondaggi sono `{ question, totalVoters, options: [{ id, label, votes, percent }] }`.
Non includono mai chi ha risposto.

Le nuvole di parole accettano parole libere o brevi frasi, una per riga. In Admin crea
una **Nuvola di parole**, imposta la domanda e il massimo di voci per persona
(1–10, valore predefinito 3), poi mettila sul palco. Ogni voce può contenere fino a
60 caratteri. Varianti di maiuscole, Unicode e spazi vengono unite; le frasi restano
insieme e le ripetizioni contano una volta per persona. Una nuova risposta sostituisce
le voci precedenti della stessa persona, finché le risposte sono aperte.

L’anteprima mostra le parole più frequenti con testo più grande. I risultati per le
presentazioni sono `{ prompt, totalRespondents, words: [{ text, count }] }`, ordinati
per frequenza e senza identità dei partecipanti. Funzionano gli stessi endpoint per
palco, risultati, azzeramento e SSE.

Per un esempio autonomo crea una nuvola con slug `gadget-ideas` e apri
`examples/demo-word-cloud.html?url=http://localhost:5173&key=<chiave API>&activity=gadget-ideas`.
L’esempio riceve la nuvola in diretta e permette al relatore di aprire o chiudere le risposte.

La chiave è l’unica protezione di questa API: tienila fuori dai repository pubblici
e rigenerala da Admin → API se viene divulgata. Le vecchie chiavi smettono subito di funzionare.

## Tipi di attività e loro estensione

**Interesse all’acquisto** (`type: "purchase-interest"`) usa la configurazione `{ question }`
e risposte sì/no: `{ buy: false }`, oppure `{ buy: true, price: number }`, con prezzo
intero non negativo in euro per il sì. Le risposte no scartano l’eventuale prezzo.
L’ultima risposta di ogni persona sostituisce la precedente fino alla chiusura.
I risultati sono `{ question, totalRespondents, yes, no, noPercent, bands }`; ogni fascia
contiene `{ min, max, label, count, percent }`. Le fasce sono da 10 €: 0–10 inclusi,
11–20, 21–30 e così via. Vengono restituite solo le fasce popolate, in ordine crescente;
i no formano una barra separata. Le percentuali usano il totale dei partecipanti e
non vengono esportate identità.

I giochi con vincitore non chiedono di nuovo il nome: usano quello dell’accesso,
salvato con ogni risposta. L’API esporta solo quei nomi, mai gli identificativi.

**Indovina il numero vero** (`type: "number-estimate"`) richiede `{ number }`, un intero
tra 0 e 1.000.000. La configurazione è `{ prompt, target }`; il pubblico riceve solo
`{ prompt }`. L’endpoint di estrazione rivela la cifra configurata, sceglie la stima
più vicina ed estrae un vincitore a sorte tra i pari merito. I risultati contengono
`{ prompt, totalParticipants, draw }`, con draw pari a
`{ number, distance, tied, winner: { name, number } | null, drawnAt }`.
Le altre stime e gli identificativi non escono dall’API. È possibile rivelare la cifra
senza partecipanti e senza vincitore. Dopo le prime risposte serve un azzeramento
per riaprire o modificare il numero da indovinare.

**Quiz di memoria** (`type: "memory-quiz"`) accetta `{ answer }` come testo libero.
La configurazione è `{ question, scoring, acceptedAnswers: string[] }`; il pubblico
riceve solo `{ question, scoring }`. Con `scoring: "points"` (predefinito per i nuovi
quiz), ogni risposta corretta assegna punti in base alla velocità, nessuno scopre
se ha indovinato prima della rivelazione e vince la risposta corretta più veloce.
Con `scoring: "first"` (anche per i quiz salvati prima dell’introduzione dei punti),
la prima risposta corretta vince, assegna punti e chiude subito il quiz.

I campi opzionali `answerMode: "choice" | "order"` e `choices: string[]` aggiungono
scelta multipla e ordinamento (2–4 opzioni o 2–6 elementi distinti da ordinare).
Le opzioni sono pubbliche; `acceptedAnswers` resta privato. Le risposte ordinate
uniscono ogni elemento una sola volta con ` → `. Il pubblico trascina gli elementi
con dito o mouse, oppure li seleziona e li sposta con le frecce della tastiera.
Le vecchie configurazioni a testo libero restano valide. Maiuscole, varianti Unicode,
spazi e `. ! ?` finali vengono ignorati; scrivere più possibili risposte in una stringa
non vale come risposta corretta. Si può correggere una risposta finché il quiz è aperto.

I risultati sono `{ question, totalParticipants, draw }`, con `draw` null fino alla
vittoria o rivelazione, poi `{ answer, winner: { name, answer } | null, correct?, drawnAt }`.
`correct` conta le risposte corrette solo nella modalità a punti. Si esportano solo
nome e risposta del vincitore, senza altre risposte o identificativi. Soluzione,
vincitore, punteggi e chiusura vengono salvati insieme. Per riaprire serve azzerare;
nuovi tentativi e ricaricamenti non cambiano il vincitore.
`POST /activities/:slug/draw` (o Admin → Rivela la risposta) chiude e rivela il quiz;
se nessuno ha risolto un quiz «prima risposta corretta», non viene inventato un vincitore.

**Lotteria dei numeri** (`type: "number-lottery"`) accetta `{ number }`, un intero da
0 a 100 per partecipante autenticato, con configurazione `{ prompt }`. Il numero
si può cambiare fino all’estrazione. `POST /api/v1/activities/:slug/draw` (disponibile
anche sotto `/api/admin`) chiude le risposte ed estrae sul server un numero tra 0 e
100 inclusi. Vince la distanza assoluta minore; in caso di parità si estrae sempre
un solo vincitore a sorte tra i più vicini. La regola è annunciata sia sul telefono
sia nella presentazione.

I risultati sono `{ prompt, totalParticipants, entries: [{ name, number }], draw }`;
`draw` è null prima dell’estrazione, poi `{ number, distance, closest, winners, drawnAt }`,
con un vincitore. Vengono esposti solo nomi e numeri, non gli identificativi.
L’esito persiste in SQLite e viene trasmesso con SSE; nuovi tentativi e ricaricamenti
non ripetono l’estrazione. L’azzeramento cancella risposte ed esito e permette un nuovo
turno. Dopo l’estrazione non si può riaprire senza azzerare.
`LiveAudience.draw(slug)` richiama l’endpoint di estrazione.

**Ruota della fortuna** (`type: "wheel"`) iscrive ogni partecipante autenticato una volta.
La configurazione è `{ prompt }`, la risposta è `{}` (basta iscriversi), i risultati
sono `{ prompt, totalParticipants, names: string[] }`, con i nomi di tutti gli iscritti
e senza identificativi. Account distinti con lo stesso nome hanno possibilità separate.
Si usano i normali endpoint per risposte, palco, azzeramento, risultati e SSE. Chiudi
le iscrizioni prima di leggere i nomi definitivi e girare la ruota, così i ritardatari
non cambiano l’estrazione. Il vincitore viene estratto dalla slide; l’API non lo salva
né lo rimuove automaticamente.

Ogni tipo vive in `src/activities/<type>/` e comprende:

1. **`definition.ts`**: dati e funzioni pure, usati da server e browser.

   ```ts
   export const wordCloud = defineActivity<Config, Response, Results>({
     type: "word-cloud",            // salvato nel DB: non rinominarlo mai
     label: "Nuvola di parole",
     description: "Ogni persona invia fino a tre parole.",
     configSchema,                  // zod: ciò che salva l’amministratore
     defaultConfig: () => ({ prompt: "", maxWords: 3 }),
     responseSchema: (config) => …, // zod: risposta di una persona, validata rispetto alla configurazione
     aggregate: (config, responses) => …, // risultati per le presentazioni; evitare dati personali
     audienceConfig: (config) => …, // facoltativo: nasconde parti della configurazione al pubblico
     drawLabel: "Rivela la risposta", // facoltativo: tipi decisi dall’endpoint di estrazione
   })
   ```

2. **`ui.tsx`**: componenti React.

   ```tsx
   export const wordCloudUI = defineActivityUI({
     definition: wordCloud,
     Editor,    // ({ config, onChange }) per la pagina di amministrazione
     Audience,  // ({ config, me, outcome, response, open, submit }) per i telefoni;
                // me.name è il nome d’accesso, outcome contiene l’esito dopo l’estrazione
     Results,   // anteprima facoltativa per l’amministrazione (altrimenti JSON)
   })
   ```

3. Registrazione in `src/activities/registry.ts` e `src/activities/ui-registry.ts`.

Salvataggio, validazione, risposta unica per persona, controllo del palco, API e
aggiornamenti in diretta sono già disponibili. `src/activities/poll/` è l’implementazione
di riferimento. I messaggi standard di validazione sono in italiano tramite `src/validation.ts`.

## Sincronizzare le domande della presentazione di Chiara

Il quiz supporta `pointsMultiplier: 2` per le domande a punti doppi; il valore normale
è 1, anche per le attività precedenti. L'amministratore può modificarlo in **Valore dei punti**.
Il moltiplicatore viene applicato dal server ai punti salvati e alla classifica.

Per preparare le attività dall'HTML, comprese le soluzioni e le indicazioni degli `aside`:

```sh
python3 scripts/extract-chiara.py ../presentazione-chiara/prove/slideshow.slides.html data/chiara-activities.json
node src/server/sync-activities.ts data/chiara-activities.json data/live-audience.db
```

Il secondo comando mostra un'anteprima. Dopo aver controllato le configurazioni del
file JSON, sincronizza il database locale con il server dell'app fermo:

```sh
node src/server/sync-activities.ts data/chiara-activities.json data/live-audience.db --apply
```

L'applicazione crea prima un backup SQLite in `data/backups/`. L'importazione mantiene
gli identificativi e il palco, non elimina attività o risposte e si interrompe se una
configurazione da cambiare contiene già risposte o un esito salvato. Tutto il gruppo
viene aggiornato in una transazione. Il file JSON contiene le soluzioni: resta sotto
`data/`, escluso da Git, e non va pubblicato tra le risorse del client.

Le quattro foto degli attori diventano i relativi nomi sui telefoni. Le immagini da
riconoscere restano nella proiezione; birra e dinosauro richiedono una risposta scritta.
Gli elementi decorativi della rivelazione non diventano opzioni. La sezione che segue
`domande-doppi-punti` usa il moltiplicatore 2, come confermato per questa presentazione.
