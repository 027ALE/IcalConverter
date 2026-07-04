# AGENTS.md

## Architettura

Sito statico + due Netlify Functions, nessun framework build.

- `public/index.html` — unica pagina. Genera l'itinerario da un file `.ics` caricato localmente oppure da un link webcal/iCal recuperato tramite `fetch-ical`. Include anche la UI per cercare/salvare link e il pannello di amministrazione dei link salvati.
- `netlify/functions/fetch-ical.js` — Netlify Function v2 (ESM, `export default` + `export const config`). Espone `/api/fetch-ical?url=...`.
  - Normalizza `webcal://` in `https://`.
  - Valida che il protocollo sia http/https.
  - Effettua il fetch del calendario remoto e verifica che il body contenga `BEGIN:VCALENDAR`.
  - Ritorna il body con `Content-Type: text/calendar` e `Content-Disposition: attachment` così il browser lo scarica come `.ics`.
- `netlify/functions/links.js` — Netlify Function v2 (ESM). Espone `/api/links` e gestisce la lista condivisa dei link salvati, persistita con **Netlify Blobs** (`@netlify/blobs`, store `webcal-links`, chiave `links.json`).
  - `GET` — lettura pubblica della lista. Se viene passato l'header `x-admin-password`, viene anche usato per validare il login admin (password errata → 401).
  - `POST` — aggiunta pubblica di un nuovo link `{ url, label? }`, nessuna autenticazione richiesta.
  - `PUT` — modifica di un link esistente `{ id, url, label? }`, richiede header `x-admin-password` corretto.
  - `DELETE` — rimozione di un link (`?id=...`), richiede header `x-admin-password` corretto.

## Convenzioni

- Nessuna build step: `netlify.toml` punta `publish` a `public/` e `functions` a `netlify/functions/`.
- `package.json` ha `"type": "module"` per abilitare la sintassi ESM nelle function e dichiara la dipendenza `@netlify/blobs`.
- `fetch-ical.js` resta puramente un proxy di download, senza persistenza.
- `links.js` è l'unica function con stato: usa Netlify Blobs (storage gestito da Netlify, zero configurazione infrastrutturale) invece di un database esterno.
- La password di amministrazione va impostata nella variabile d'ambiente `LINKS_ADMIN_PASSWORD` (nelle Environment variables del sito su Netlify; in locale in un file `.env` letto da `netlify dev`). Se la variabile non è impostata, le operazioni admin (login, PUT, DELETE) falliscono sempre con 401.

## Decisioni non ovvie

- Il proxy server-side per `fetch-ical` è necessario perché `webcal://` non è un protocollo scaricabile direttamente dal browser, e il fetch diretto da JS client-side verso i server CalDAV/iCloud fallirebbe per CORS.
- La validazione del contenuto (`BEGIN:VCALENDAR`) previene di servire come iCal risposte di errore HTML dell'endpoint remoto.
- I link salvati tramite `POST /api/links` sono **pubblici e condivisi** tra tutti i visitatori del sito (nessuna password richiesta per aggiungerli, coerente con l'idea di una lista di calendari comuni). Solo la modifica (`PUT`) e l'eliminazione (`DELETE`) sono protette da password, per evitare che chiunque possa cancellare i link salvati da altri.
- L'autenticazione admin è stateless lato server: la password viene rimandata dal client ad ogni richiesta protetta (`x-admin-password`), non c'è sessione/cookie. Il client la tiene solo in memoria (variabile JS), non in localStorage.
