# Webcal → Itinerario / iCal Downloader

Sito statico che permette di:
- caricare un file `.ics` locale e generare un itinerario di viaggio
  leggibile (giorno per giorno, con orari, luoghi e tempi di trasferimento);
- oppure incollare un link `webcal://`/iCal (tipico dei calendari condivisi
  Apple/iCloud), recuperarlo tramite un proxy server-side e caricarlo
  direttamente come itinerario;
- salvare i link usati più spesso in una lista condivisa, con nome,
  consultabile da un menu a tendina;
- gestire la lista dei link salvati (modifica/eliminazione) se si ha il
  ruolo `admin`.

L'accesso è gestito interamente da **Netlify Identity nativo**: login,
logout, creazione account e assegnazione dei ruoli avvengono tutti dal
pannello Netlify (o dal widget Identity lato client per login/logout).
**Il progetto non gestisce in alcun modo gli utenti**: non li crea, non li
invita, non li elenca e non ne persiste il ruolo da nessuna parte. Si limita
a leggere, ad ogni richiesta, il ruolo nativo già presente nel JWT.

## Come funziona

- `public/index.html` — unica pagina: form di caricamento file, form per
  cercare/salvare un link, tendina dei link salvati, pannello di
  amministrazione dei link (visibile solo al ruolo `admin`).
- `public/app.js` — tutta la logica di parsing/rendering dell'itinerario e
  di autenticazione lato client. È in un file separato (non inline) apposta
  per poter applicare una Content-Security-Policy senza `unsafe-inline` su
  `script-src` (vedi sezione "Verifica di sicurezza").
- `netlify/functions/fetch-ical.js` — riceve un URL
  (`GET /api/fetch-ical?url=...`), lo converte da `webcal://` a `https://`,
  scarica il contenuto e lo restituisce come file `.ics`.
- `netlify/functions/links.js` — gestisce la lista dei link salvati
  (`GET`/`POST`/`PUT`/`DELETE` su `/api/links`), persistita con Netlify Blobs
  (dati dell'app, non utenti).
- `netlify/functions/auth.js` — espone `GET /api/auth`: dice al frontend chi
  è l'utente corrente (email, ruolo), leggendo solo il JWT di Netlify
  Identity.
- `netlify/functions/auth-utils.js` — unico modulo con la logica di
  autenticazione/autorizzazione condivisa da tutte le function.

Il proxy server-side è necessario perché i browser non permettono il
download diretto di URL `webcal://` né il fetch cross-origin diretto verso i
server iCloud/CalDAV dal client.

## Ruoli

L'app conosce solo i **Ruoli nativi di Netlify Identity** (Identity → Users
→ seleziona utente → Roles), letti dal JWT (`app_metadata.roles`):

| Ruolo        | Chi lo assegna                              | Permessi |
|--------------|----------------------------------------------|----------|
| **admin**    | dal pannello Netlify Identity (ruolo "admin") | vede/scarica/salva link + modifica/elimina link |
| **standard** | assegnato implicitamente a chiunque sia autenticato e non abbia il ruolo "admin" | vede/scarica calendari, salva nuovi link |

Chi può creare un account e accedere all'app è deciso interamente da
Netlify (Site settings → Identity → Registration: "Invite only" per
limitare gli accessi, oppure aperta se si preferisce). Il progetto non
interviene in questa decisione.

## Configurazione

1. **Abilita Netlify Identity** sul sito: Site settings → Identity → Enable
   Identity.
2. **Registrazione**: scegli su Netlify se renderla "Invite only" (solo
   utenti invitati dal pannello Netlify) o aperta a tutti, in base alle tue
   esigenze.
3. **(Opzionale) Google**: se vuoi offrire anche il login con Google in
   aggiunta a email+password, abilitalo da Site settings → Identity →
   External providers. Il codice non lo richiede: se non lo abiliti, il
   widget mostra solo email+password.
4. **Assegna il ruolo "admin"** agli utenti che devono poter gestire i link
   salvati: Identity → Users → seleziona l'utente → Roles → aggiungi
   `admin`. Chiunque non abbia questo ruolo è automaticamente "standard".
5. Tutta la gestione utenti (creazione, inviti, ruoli, revoche) avviene
   **esclusivamente** dal pannello Netlify Identity: l'app non offre e non
   deve offrire nessuna UI o API per questo.

Se il sito non è pubblicato su Netlify o Identity non è attivo, il login non
sarà disponibile.

## Verifica di sicurezza

Dopo il deploy, apri `/security-check.html` (senza fare login) ed esegui i
test: verificano che nessuna funzione o dato salvato sia raggiungibile senza
autenticazione. Una volta confermato che tutti i test passano, rimuovi il
file (e `public/security-check.js`) dal progetto e rifai il deploy (vedi
istruzioni nella pagina stessa). La matrice completa dei permessi tra ruoli
è invece verificata da `npm test` (vedi sotto).

### Header di sicurezza (`netlify.toml`)

Il sito imposta, per tutte le risposte, una Content-Security-Policy e i
principali header di hardening (`X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`).

Punto importante: `script-src` nella CSP **non contiene `unsafe-inline`**.
Per questo tutto il JS applicativo è in file esterni (`public/app.js`,
`public/security-check.js`) invece che in `<script>` inline: così, anche in
presenza di un bug che permettesse di iniettare markup HTML, il browser
rifiuta comunque di eseguire qualunque script iniettato. Questo protegge in
particolare il JWT che il widget Netlify Identity tiene in `localStorage`.

`style-src` include invece `unsafe-inline` perché il CSS resta inline nelle
pagine: un CSS iniettato non può leggere `localStorage` né eseguire codice,
quindi il compromesso è accettabile.

Se in futuro si aggiungono script inline o si cambia dominio del widget
Identity, la CSP in `netlify.toml` va aggiornata di conseguenza.

## Tecnologie

- HTML/CSS/JS vanilla per il frontend, con il widget ufficiale
  `netlify-identity-widget` per login/registrazione/logout
- Netlify Functions (runtime Node, sintassi v2/ESM) per il proxy di
  download e la gestione dei link
- Netlify Identity per l'autenticazione e per i ruoli (nessun login,
  sessione o gestione utenti custom)
- Netlify Blobs (`@netlify/blobs`) solo per la persistenza della lista dei
  link salvati (dati dell'app, non utenti)

## Sviluppo locale

```bash
npm install
netlify dev
```

Apri il sito su `http://localhost:8888` (o la porta indicata). In locale
`netlify dev` emula sia Identity che Blobs se il sito è collegato (`netlify
link`) a un sito Netlify reale con Identity abilitato.

## Test automatici

```bash
npm test
```

Esegue `tests/security.test.mjs`, che verifica l'intera matrice di
autorizzazione (nessun utente, utente standard, utente con ruolo admin) su
tutte le function protette.
