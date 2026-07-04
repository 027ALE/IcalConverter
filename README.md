# Webcal → Itinerario / iCal Downloader

Sito statico che permette di:
- caricare un file `.ics` locale e generare un itinerario di viaggio leggibile (giorno per giorno, con orari, luoghi e tempi di trasferimento);
- oppure incollare un link `webcal://`/iCal (tipico dei calendari condivisi Apple/iCloud), recuperarlo tramite un proxy server-side e caricarlo direttamente come itinerario;
- salvare i link usati più spesso in una lista condivisa, con nome, consultabile da un menu a tendina;
- gestire la lista dei link salvati (modifica/eliminazione) da un pannello di amministrazione protetto da password.

## Come funziona

- `public/index.html` — unica pagina: form di caricamento file, form per cercare/salvare un link, tendina dei link salvati, pannello admin, e tutta la logica di parsing/rendering dell'itinerario.
- `netlify/functions/fetch-ical.js` — riceve un URL (`GET /api/fetch-ical?url=...`), lo converte da `webcal://` a `https://`, scarica il contenuto e lo restituisce come file `.ics` (usato sia per caricare l'itinerario sia, potenzialmente, per il download diretto).
- `netlify/functions/links.js` — gestisce la lista dei link salvati (`GET`/`POST`/`PUT`/`DELETE` su `/api/links`), persistita con Netlify Blobs:
  - chiunque può **cercare** un link e **salvarlo** (con un nome opzionale) nella lista condivisa;
  - solo chi conosce la password di amministrazione può **modificare** o **eliminare** i link salvati, dal pannello "Amministrazione link salvati" in fondo alla pagina.

Il proxy server-side è necessario perché i browser non permettono il download diretto di URL `webcal://` né il fetch cross-origin diretto verso i server iCloud/CalDAV dal client.

## Configurazione

Imposta la variabile d'ambiente `LINKS_ADMIN_PASSWORD` con la password che vuoi usare per il pannello di amministrazione:

- su Netlify: Site settings → Environment variables → aggiungi `LINKS_ADMIN_PASSWORD`.
- in locale: crea un file `.env` nella root del progetto con `LINKS_ADMIN_PASSWORD=la-tua-password` (letto automaticamente da `netlify dev`).

Se la variabile non è impostata, le funzioni di modifica/eliminazione restano disabilitate (rispondono sempre "password errata").

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
