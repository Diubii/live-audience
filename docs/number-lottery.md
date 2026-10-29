# Lotteria dei numeri

I partecipanti accedono, inviano un intero da 0 a 100 con il nome scelto all’accesso e
possono cambiarlo fino all’estrazione del relatore. Vince la distanza assoluta minore.
In caso di parità si estrae un solo vincitore a sorte tra i più vicini: la regola è
annunciata sulla pagina del pubblico e nella presentazione prima della rivelazione.
Nomi o numeri uguali sono possibilità separate se inviati da account distinti.

L’attività `number-lottery` usa validazione, salvataggio delle risposte e registri esistenti.
L’endpoint amministratore/con chiave API `POST /activities/:slug/draw` genera un intero
uniforme con `randomInt(0, 101)` di Node ed estrae a sorte una delle risposte più vicine.
Non accetta un numero da indovinare fornito dal chiamante. Chiusura del palco e
salvataggio dell’esito nelle impostazioni SQLite avvengono in un’unica transazione.
Le richieste successive restituiscono l’esito salvato, anche dopo un riavvio.
La riapertura viene rifiutata finché l’endpoint di azzeramento non cancella risposte
ed esito. Eliminare l’attività elimina anche l’esito. Non servono migrazioni o dipendenze.
Nomi d’accesso e numeri sono dati per la presentazione; gli identificativi restano privati.

I risultati sono `{ prompt, totalParticipants, entries: [{ name, number }], draw }`,
con draw null prima dell’estrazione oppure `{ number, distance, closest, winners, drawnAt }`
dopo. Il flusso SSE dei risultati trasmette l’esito. L’animazione della presentazione
è decorativa: rivela il risultato salvato dal server, senza generarne un secondo.
Ricaricando la pagina si ripristina lo stesso esito.

Implementazione e verifiche:

1. Definizione/UI, endpoint di estrazione persistente, riapertura/azzeramento/eliminazione;
   verificare limiti interi, distanza minima, parità, permessi, modifiche tardive e idempotenza.
2. Aggiungere una slide di lotteria dei gadget a entrambe le presentazioni dell’assemblea,
   con annuncio della regola sui pari merito e animazione delle palline. Conservare ruota
   e altri contenuti esistenti.
3. Verificare nel browser partecipazione/estrazione/ricaricamento/parità, il layout delle
   due presentazioni e i controlli obbligatori `pnpm typecheck && pnpm check && pnpm test`,
   seguiti dalla compilazione.
