# Webcal → Itinerario / iCal Downloader

Sito statico che permette di:
- caricare un file `.ics` locale e generare un itinerario di viaggio
  leggibile (giorno per giorno, con orari, luoghi e tempi di trasferimento);
- oppure incollare un link `webcal://`/iCal (tipico dei calendari condivisi
  Apple/iCloud), recuperarlo tramite un proxy server-side e caricarlo
  direttamente come itinerario;
- salvare i link usati più spesso in una lista condivisa, con nome,
  consultabile da un menu a tendina;
- gestire la lista dei link salvati (modifica/eliminazione) se si ha ruolo
  `intermedio` o `admin`;
- invitare nuovi utenti e assegnare loro un ruolo, se si ha ruolo `admin`.

L'accesso è **riservato**: solo le email invitate dall'amministratore
possono usare l'app. Login e logout sono gestiti interamente da **Netlify
Identity nativo** (email+password di default; provider OAuth come Google
opzionali, configurabili solo dal pannello Netlify).

## Come funziona

- `public/index.html` — unica pagina: form di caricamento file, form per
  cercare/salvare un link, tendina dei link salvati, pannello
  amministrazione (link + utenti), e tutta la logica di
  parsing/rendering dell'itinerario.
- `netlify/functions/fetch-ical.js` — riceve un URL
  (`GET /api/fetch-ical?url=...`), lo converte da `webcal://` a `https://`,
  scarica il contenuto e lo restituisce come file `.ics`.
- `netlify/functions/links.js` — gestisce la lista dei link salvati
  (`GET`/`POST`/`PUT`/`DELETE` su `/api/links`), persistita con Netlify Blobs.
- `netlify/functions/users.js` — gestisce gli utenti abilitati e i loro
  ruoli (`GET`/`POST`/`PUT`/`DELETE` su `/api/users`), riservata all'admin.
- `netlify/functions/auth.js` — espone `GET /api/auth`: dice al frontend chi
  è l'utente corrente (email, ruolo, permessi), leggendo solo il JWT di
  Netlify Identity.
- `netlify/functions/auth-utils.js` — unico modulo con la logica di
  autenticazione/autorizzazione condivisa da tutte le function.

Il proxy server-side è necessario perché i browser non permettono il
download diretto di URL `webcal://` né il fetch cross-origin diretto verso i
server iCloud/CalDAV dal client.

## Ruoli

| Ruolo | Chi lo assegna | Permessi |
|---|---|---|
| **admin** | variabile d'ambiente `APP_ADMIN_EMAILS` (mai da UI) | tutto: link, utenti, ruoli |
| **intermedio** | l'admin, dal pannello "Utenti" | vede/scarica/salva link + modifica/elimina link |
| **standard** | l'admin, dal pannello "Utenti" | vede/scarica calendari, salva nuovi link |
| *nessuno* | — | nessun accesso: whitelist-only |

## Configurazione

1. **Abilita Netlify Identity** sul sito: Site settings → Identity → Enable
   Identity.
2. **Registrazione**: impostala su *Invite only* (Site settings → Identity →
   Registration) così nessuno può auto-registrarsi: l'unico modo per entrare
   è essere invitati dall'admin.
3. **(Opzionale) Google**: se vuoi comunque offrire il login con Google in
   aggiunta a email+password, abilitalo da Site settings → Identity →
   External providers. Il codice non lo richiede: se non lo abiliti, il
   widget mostra solo email+password.
4. **Imposta la variabile d'ambiente `APP_ADMIN_EMAILS`** (Site settings →
   Environment variables) con l'email (o le email, separate da virgola)
   dell'amministratore, es. `admin@tuodominio.it`. Solo questa/e email
   avranno sempre pieno accesso, incluso il pannello "Utenti".
5. **Primo accesso dell'admin**: l'admin deve avere un account Netlify
   Identity con la stessa email indicata in `APP_ADMIN_EMAILS` — se non
   esiste ancora, va creato/invitato una prima volta dal pannello Netlify
   Identity del sito (Identity tab → Invite users), poi da lì in avanti può
   gestire tutti gli altri utenti direttamente dall'app.
6. Da quel momento, l'admin invita gli altri utenti **dall'app stessa**
   (pannello "Utenti"): inserisce l'email e il ruolo, l'utente riceve
   un'email nativa di Netlify Identity per impostare la password.

Se il sito non è pubblicato su Netlify o Identity non è attivo, il login non
sarà disponibile.

## Verifica di sicurezza

Dopo il deploy, apri `/security-check.html` (senza fare login) ed esegui i
test: verificano che nessuna funzione o dato salvato sia raggiungibile senza
autenticazione. Una volta confermato che tutti i test passano, rimuovi il
file dal progetto e rifai il deploy (vedi istruzioni nella pagina stessa).
La matrice completa dei permessi tra ruoli è invece verificata da
`npm test` (vedi sotto).

## Tecnologie

- HTML/CSS/JS vanilla per il frontend, con il widget ufficiale
  `netlify-identity-widget` per login/registrazione/logout
- Netlify Functions (runtime Node, sintassi v2/ESM) per il proxy di
  download, la gestione dei link e la gestione utenti
- Netlify Identity per l'autenticazione (nessun login/sessione custom)
- Netlify Blobs (`@netlify/blobs`) per la persistenza della lista dei link
  salvati e dei ruoli utente

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
autorizzazione (nessun utente, utente non invitato, ruoli standard/
intermedio/admin) su tutte le function protette.
