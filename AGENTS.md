# AGENTS.md

## Architettura

Sito statico + tre Netlify Functions, nessun framework build.

- `public/index.html` — markup della pagina (form di caricamento file, form
  per cercare/salvare un link, tendina dei link salvati, pannello di
  amministrazione dei link salvati visibile solo al ruolo `admin`).
  **Non esiste nessuna UI di gestione utenti**: la creazione di account e
  l'assegnazione dei ruoli avvengono esclusivamente dal pannello Netlify
  Identity.
- `public/app.js` — tutta la logica JS di `index.html` (parsing/rendering
  itinerario, chiamate alle API, flusso Netlify Identity). Volutamente in un
  file esterno e non inline: la CSP in `netlify.toml` non concede
  `unsafe-inline` su `script-src`, quindi uno script iniettato via HTML non
  verrebbe comunque eseguito dal browser.
- `public/security-check.html` + `public/security-check.js` — pagina/script
  temporanei di collaudo (vedi sezione dedicata più sotto). Da rimuovere una
  volta verificato che tutto è a posto.
- `netlify/functions/auth-utils.js` — modulo condiviso con TUTTA la logica di
  autenticazione/autorizzazione. Nessun'altra function duplica questa logica.
- `netlify/functions/auth.js` — Netlify Function v2 (ESM). Espone
  `GET /api/auth`: ritorna email e ruolo dell'utente corrente, leggendo solo
  il JWT di Netlify Identity iniettato da Netlify in
  `context.clientContext.user`. Nessun POST/DELETE: login e logout sono
  gestiti al 100% dal widget Netlify Identity lato client.
- `netlify/functions/fetch-ical.js` — Netlify Function v2 (ESM). Espone
  `GET /api/fetch-ical?url=...`.
  - Normalizza `webcal://` in `https://`.
  - Valida che il protocollo sia http/https.
  - Effettua il fetch del calendario remoto e verifica che il body contenga
    `BEGIN:VCALENDAR`.
  - Ritorna il body con `Content-Type: text/calendar` e
    `Content-Disposition: attachment` così il browser lo scarica come `.ics`.
  - Richiede un utente autenticato (ruolo minimo `standard`).
- `netlify/functions/links.js` — Netlify Function v2 (ESM). Espone
  `/api/links` e gestisce la lista condivisa dei link salvati, persistita con
  **Netlify Blobs** (`@netlify/blobs`, store `webcal-links`, chiave
  `links.json`). Questo è l'UNICO uso di Blobs nel progetto ed è dato
  applicativo (link salvati), non dato utente.
  - `GET`/`POST` richiedono ruolo minimo `standard`.
  - `PUT`/`DELETE` richiedono ruolo minimo `admin`.

**Non esiste una function `users.js` né un endpoint `/api/users`.** La
gestione utenti non è responsabilità di questo progetto: chiunque volesse
aggiungerla starebbe reintroducendo esattamente ciò che è stato rimosso
intenzionalmente.

## Modello di autenticazione e autorizzazione

**Autenticazione = solo Netlify Identity nativo.** Non esiste nessun login
custom, nessuna password gestita da noi, nessun cookie di sessione. Il
frontend usa esclusivamente il widget `netlify-identity-widget` per
login/registrazione/logout (email+password è il metodo di default del
widget; eventuali provider OAuth come Google si aggiungono/rimuovono da
Netlify → Site settings → Identity → External providers, senza toccare il
codice). Ogni chiamata alle nostre API allega
`Authorization: Bearer <jwt-identity>`; Netlify inietta l'utente decodificato
in `context.clientContext.user` di ogni function — è l'UNICA fonte di verità
su "chi ha fatto la richiesta".

**Autorizzazione = 2 ruoli, entrambi nativi di Netlify Identity**, letti da
`auth-utils.js` direttamente da `user.app_metadata.roles` (il campo che
Netlify popola nel JWT a partire dai Ruoli assegnati all'utente dal pannello
Identity → Users → Roles):

| Ruolo         | Definito da                                             | Può fare |
|---------------|----------------------------------------------------------|----------|
| `admin`       | ruolo "admin" assegnato dal pannello Netlify Identity     | tutto: link, incluse modifica/eliminazione |
| `standard`    | implicito: qualunque utente Identity autenticato senza il ruolo "admin" | vedere/scaricare calendari, salvare nuovi link |

Non esiste un terzo livello, non esiste una whitelist applicativa, non
esiste nessuna persistenza di ruoli o email lato app: l'unica fonte di
verità sul ruolo è il JWT di Netlify Identity, ad ogni singola richiesta.

## Variabili d'ambiente richieste

Nessuna. Non c'è più `APP_ADMIN_EMAILS` né altra variabile legata a utenti o
ruoli: tutto è configurato dal pannello Netlify Identity (Site settings →
Identity → Enable Identity, poi Users → Roles per assegnare `admin`).

## Convenzioni

- Nessuna build step: `netlify.toml` punta `publish` a `public/` e
  `functions` a `netlify/functions/`.
- `package.json` ha `"type": "module"` per abilitare la sintassi ESM nelle
  function e dichiara la dipendenza `@netlify/blobs`, usata esclusivamente
  da `links.js` per i link salvati.
- `fetch-ical.js` resta puramente un proxy di download, senza persistenza.
- `links.js` è la sola function con stato applicativo: usa Netlify Blobs
  (storage gestito da Netlify, zero configurazione infrastrutturale) invece
  di un database esterno. Nessun dato utente è mai scritto su Blobs o
  altrove dal progetto.
- Ogni function protetta usa `requireRole(req, context, minRole)` da
  `auth-utils.js`: un solo punto di verità per l'autorizzazione.

## Decisioni non ovvie

- Il proxy server-side per `fetch-ical` è necessario perché `webcal://` non è
  un protocollo scaricabile direttamente dal browser, e il fetch diretto da
  JS client-side verso i server CalDAV/iCloud fallirebbe per CORS.
- La validazione del contenuto (`BEGIN:VCALENDAR`) previene di servire come
  iCal risposte di errore HTML dell'endpoint remoto.
- Aggiungere un link (`POST /api/links`) richiede comunque un utente
  Identity autenticato (ruolo minimo `standard`): non esiste nessun
  endpoint scrivibile senza autenticazione.
- La gestione utenti è stata deliberatamente rimossa dal progetto: creare,
  invitare, elencare o revocare utenti, così come assegnare/cambiare ruoli,
  sono operazioni che vanno fatte **solo** dal pannello Netlify Identity.
  Questo evita qualunque logica "super user" o whitelist custom lato app,
  qualunque uso di Blobs per dati utente, e mantiene l'intera superficie di
  gestione accessi allo standard nativo di Netlify.

## Pagina di collaudo `security-check.html`

`public/security-check.html` esegue, senza fare login, chiamate reali contro
tutte le API dell'app e verifica che rispondano `401` (nessun accesso non
autorizzato a funzioni o dati). È pensata per essere aperta una volta dopo
il deploy per confermare che il sistema è "a prova di accesso indesiderato",
poi rimossa dal progetto: una pagina statica non può auto-cancellarsi dal
sito pubblicato (Netlify serve solo file già distribuiti, non modificabili
da una richiesta del browser), quindi il passo finale — eliminare il file e
rifare il deploy — resta manuale, come spiegato nella pagina stessa.
Non sostituisce `tests/security.test.mjs`, che copre anche la matrice di
permessi tra i ruoli standard/admin (verificabile solo lato server, con
`npm test`).
