# Webcal → Itinerario / iCal Downloader

Sito statico che permette di:
- caricare un file `.ics` locale e generare un itinerario di viaggio leggibile (giorno per giorno, con orari, luoghi e tempi di trasferimento);
- oppure incollare un link `webcal://`/iCal (tipico dei calendari condivisi Apple/iCloud), recuperarlo tramite un proxy server-side e caricarlo direttamente come itinerario;
- salvare i link usati più spesso in una lista condivisa, con nome, consultabile da un menu a tendina;
- gestire la lista dei link salvati (modifica/eliminazione) da un pannello di amministrazione protetto da accesso autenticato.

## Come funziona

- `public/index.html` — unica pagina: form di caricamento file, form per cercare/salvare un link, tendina dei link salvati, pannello admin, e tutta la logica di parsing/rendering dell'itinerario.
- `netlify/functions/fetch-ical.js` — riceve un URL (`GET /api/fetch-ical?url=...`), lo converte da `webcal://` a `https://`, scarica il contenuto e lo restituisce come file `.ics` (usato sia per caricare l'itinerario sia, potenzialmente, per il download diretto).
- `netlify/functions/links.js` — gestisce la lista dei link salvati (`GET`/`POST`/`PUT`/`DELETE` su `/api/links`), persistita con Netlify Blobs.
- `netlify/functions/auth.js` — espone `/api/auth` per verificare che l'utente sia autenticato tramite Netlify Identity e consente di usare le API solo dopo aver effettuato l'accesso.

Il proxy server-side è necessario perché i browser non permettono il download diretto di URL `webcal://` né il fetch cross-origin diretto verso i server iCloud/CalDAV dal client.

## Configurazione

Per usare il login con Google, abilita Netlify Identity sul sito e configura il provider Google da Access & Security → Authentication. Il frontend usa il widget di Identity per aprire il flusso OAuth e il backend controlla l’utente tramite il contesto di autenticazione di Netlify.

Se il sito non è pubblicato su Netlify o Identity non è attivo, il flusso di login non sarà disponibile.

## Tecnologie

- HTML/CSS/JS vanilla per il frontend
- Netlify Functions (runtime Node, sintassi v2/ESM) per il proxy di download e la gestione dei link
- Netlify Blobs (`@netlify/blobs`) per la persistenza della lista dei link salvati

## Sviluppo locale

```bash
npm install
netlify dev
```

Apri il sito su `http://localhost:8888` (o la porta indicata), incolla un link webcal per testare il caricamento dell'itinerario e prova a salvarlo nella lista.
