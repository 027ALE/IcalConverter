# AGENTS.md

## Architettura

Sito statico + quattro Netlify Functions, nessun framework build.

- `public/index.html` — unica pagina. Genera l'itinerario da un file `.ics`
  caricato localmente oppure da un link webcal/iCal recuperato tramite
  `fetch-ical`. Include anche la UI per cercare/salvare link, il pannello di
  amministrazione dei link salvati e il pannello di gestione utenti.
- `public/security-check.html` — pagina temporanea di collaudo (vedi sezione
  dedicata più sotto). Da rimuovere una volta verificato che tutto è a posto.
- `netlify/functions/auth-utils.js` — modulo condiviso con TUTTA la logica di
  autenticazione/autorizzazione. Nessun'altra function duplica questa logica.
- `netlify/functions/auth.js` — Netlify Function v2 (ESM). Espone
  `GET /api/auth`: ritorna email, ruolo e permessi dell'utente corrente,
  leggendo solo il JWT di Netlify Identity iniettato da Netlify in
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
  - Richiede un utente autenticato con ruolo minimo `standard`.
- `netlify/functions/links.js` — Netlify Function v2 (ESM). Espone
  `/api/links` e gestisce la lista condivisa dei link salvati, persistita con
  **Netlify Blobs** (`@netlify/blobs`, store `webcal-links`, chiave
  `links.json`).
  - `GET`/`POST` richiedono ruolo minimo `standard`.
  - `PUT`/`DELETE` richiedono ruolo minimo `intermedio`.
- `netlify/functions/users.js` — Netlify Function v2 (ESM). Espone
  `/api/users`, riservata esclusivamente al ruolo `admin`.
  - `GET` elenca gli utenti abilitati e il loro ruolo.
  - `POST` invita una nuova email con ruolo `standard` o `intermedio`:
    salva il ruolo su Blobs e invia l'invito nativo di Netlify Identity
    (nessun sistema di invio email custom).
  - `PUT` cambia il ruolo di un utente già invitato.
  - `DELETE` revoca l'accesso di un'email (rimuove il ruolo dai Blobs).

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

**Autorizzazione = 3 ruoli applicativi**, risolti da `auth-utils.js`:

| Ruolo         | Definito da                              | Può fare |
|---------------|-------------------------------------------|----------|
| `admin`       | variabile d'ambiente `APP_ADMIN_EMAILS`   | tutto, incluso gestire gli utenti |
| `intermedio`  | Netlify Blobs (store `app-roles`)         | standard + modificare/eliminare link salvati |
| `standard`    | Netlify Blobs (store `app-roles`)         | vedere/scaricare calendari, salvare nuovi link |
| *(nessuno)*   | email non presente né in `APP_ADMIN_EMAILS` né nei Blobs | nessun accesso: whitelist-only, mai opt-out di default |

L'admin è **sempre e solo** definito dalla variabile d'ambiente: non è mai
scrivibile da UI o da Blobs, così l'amministratore non può mai bloccarsi
fuori per errore. Gli altri ruoli sono assegnati dall'admin dal pannello
"Utenti" e persistiti su Blobs.

## Variabili d'ambiente richieste

- `APP_ADMIN_EMAILS` — lista di email (separate da virgola) degli
  amministratori, es. `admin@esempio.it`. **Obbligatoria**: senza questa
  variabile nessuno può accedere al pannello utenti.

Netlify Identity deve essere abilitato sul sito (Site settings → Identity →
Enable Identity). Non serve più `APP_AUTH_JWT_SECRET`/`JWT_SECRET`
(rimossi con l'eliminazione della sessione custom) né `APP_AUTH_ALLOWED_EMAILS`
/`APP_AUTH_ADMIN_EMAILS` (rimpiazzate dal nuovo modello a ruoli).

## Convenzioni

- Nessuna build step: `netlify.toml` punta `publish` a `public/` e
  `functions` a `netlify/functions/`.
- `package.json` ha `"type": "module"` per abilitare la sintassi ESM nelle
  function e dichiara la dipendenza `@netlify/blobs` (la dipendenza `jose`
  non è più necessaria: non c'è più nessun JWT custom da firmare/verificare).
- `fetch-ical.js` resta puramente un proxy di download, senza persistenza.
- `links.js` e `users.js` sono le uniche function con stato: usano Netlify
  Blobs (storage gestito da Netlify, zero configurazione infrastrutturale)
  invece di un database esterno.
- Ogni function protetta usa `requireRole(req, context, minRole)` da
  `auth-utils.js`: un solo punto di verità per l'autorizzazione, per evitare
  la divergenza tra endpoint che causava instabilità nella versione
  precedente (in cui ogni function ripeteva la propria logica di controllo).

## Decisioni non ovvie

- Il proxy server-side per `fetch-ical` è necessario perché `webcal://` non è
  un protocollo scaricabile direttamente dal browser, e il fetch diretto da
  JS client-side verso i server CalDAV/iCloud fallirebbe per CORS.
- La validazione del contenuto (`BEGIN:VCALENDAR`) previene di servire come
  iCal risposte di errore HTML dell'endpoint remoto.
- Aggiungere un link (`POST /api/links`) richiede comunque un utente
  autenticato e autorizzato (ruolo minimo `standard`): non esiste più nessun
  endpoint scrivibile senza autenticazione, per garantire che nessuno accede
  a funzioni o dati salvati senza che l'amministratore lo desideri.
- L'invito di un nuovo utente (`POST /api/users`) usa l'API admin nativa di
  GoTrue/Netlify Identity (`{identity.url}/invite` con
  `Authorization: Bearer {identity.token}`, entrambi iniettati da Netlify in
  `context.clientContext.identity`): l'utente riceve una mail nativa di
  Netlify per impostare la password, senza alcun sistema di invio email
  gestito da noi.
- Revocare l'accesso (`DELETE /api/users`) rimuove solo il ruolo applicativo
  dai Blobs: da quel momento l'email, anche se ha ancora un account Identity
  attivo, non supera più `requireRole` in nessuna function (nessun accesso
  possibile). L'eventuale eliminazione dell'account Identity stesso resta
  un'operazione manuale dal pannello Netlify, se desiderata.

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
permessi tra i ruoli (verificabile solo lato server, con `npm test`).
