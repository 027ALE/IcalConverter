# AGENTS.md

## Architettura

Sito statico + due Netlify Functions, nessun framework build.

- `public/index.html` — unica pagina. Genera l'itinerario da un file `.ics` caricato localmente oppure da un link webcal/iCal recuperato tramite `fetch-ical`. Include anche la UI per cercare/salvare link e il pannello di amministrazione dei link salvati.
- `netlify/functions/fetch-ical.js` — Netlify Function v2 (ESM, `export default` + `export const config`). Espone `/api/fetch-ical?url=...`.
  - Normalizza `webcal://` in `https://`.
  - Valida che il protocollo sia http/https.
  - Effettua il fetch del calendario remoto e verifica che il body contenga `BEGIN:VCALENDAR`.
  - Ritorna il body con `Content-Type: text/calendar` e `Content-Disposition: attachment` così il browser lo scarica come `.ics`.
  - Richiede autenticazione tramite gli header `x-app-auth-username` e `x-app-auth-password`.
- `netlify/functions/links.js` — Netlify Function v2 (ESM). Espone `/api/links` e gestisce la lista condivisa dei link salvati, persistita con **Netlify Blobs** (`@netlify/blobs`, store `webcal-links`, chiave `links.json`).
  - Tutti i metodi richiedono autenticazione tramite gli header `x-app-auth-username` e `x-app-auth-password`.
- `netlify/functions/auth.js` — Netlify Function v2 (ESM). Espone `/api/auth` e autentica la schermata principale dell'app.

## Convenzioni

- Nessuna build step: `netlify.toml` punta `publish` a `public/` e `functions` a `netlify/functions/`.
- `package.json` ha `"type": "module"` per abilitare la sintassi ESM nelle function e dichiara la dipendenza `@netlify/blobs`.
- `fetch-ical.js` resta puramente un proxy di download, senza persistenza.
- `links.js` è l'unica function con stato: usa Netlify Blobs (storage gestito da Netlify, zero configurazione infrastrutturale) invece di un database esterno.
- L'accesso al sito e alle API avviene tramite Netlify Identity con il provider Google configurato in Access & Security → Authentication. Se Identity non è abilitato o il provider non è configurato, il flusso di login non sarà disponibile.

## Decisioni non ovvie

- Il proxy server-side per `fetch-ical` è necessario perché `webcal://` non è un protocollo scaricabile direttamente dal browser, e il fetch diretto da JS client-side verso i server CalDAV/iCloud fallirebbe per CORS.
- La validazione del contenuto (`BEGIN:VCALENDAR`) previene di servire come iCal risposte di errore HTML dell'endpoint remoto.
- I link salvati tramite `POST /api/links` sono **pubblici e condivisi** tra tutti i visitatori del sito (nessuna password richiesta per aggiungerli, coerente con l'idea di una lista di calendari comuni). Solo la modifica (`PUT`) e l'eliminazione (`DELETE`) sono protette da password, per evitare che chiunque possa cancellare i link salvati da altri.
- L'autenticazione è stateless lato server: username e password vengono rimandati dal client ad ogni richiesta protetta tramite header, non c'è sessione/cookie. Il client li tiene solo in memoria (variabili JS), non in localStorage.
