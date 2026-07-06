// identity-client.js — client minimale per Netlify Identity (GoTrue),
// senza alcuna libreria esterna e senza caricare nulla da domini di terze
// parti. Parla solo con /.netlify/identity/* sullo STESSO dominio del
// sito: nessuna richiesta verso identity.netlify.com.
//
// Perché: il widget ufficiale (netlify-identity-widget.js) carica script e
// frame da identity.netlify.com. Alcuni ad-blocker e protezioni
// anti-tracciamento del browser bloccano quel dominio (il nome "identity"
// corrisponde ai filtri anti-fingerprinting), impedendo l'apertura del
// login. Le chiamate dirette a /.netlify/identity/* invece restano sempre
// sullo stesso dominio del sito e non vengono mai bloccate per questo
// motivo.
//
// L'unico dato salvato lato client è il JWT di sessione (in localStorage),
// esattamente come faceva già il widget: nessun cambiamento nel modello di
// sicurezza del progetto.
(function () {
  const STORAGE_KEY = 'ical_identity_session';
  const API = window.location.origin + '/.netlify/identity';

  function save(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }
  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  async function throwFromResponse(res) {
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* risposta non JSON */
    }
    const msg =
      (body && (body.error_description || body.msg || body.error)) ||
      `Errore (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  async function login(email, password) {
    const res = await fetch(`${API}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        username: email,
        password: password,
      }),
    });
    if (!res.ok) return throwFromResponse(res);
    const token = await res.json();
    const session = Object.assign({}, token, { saved_at: Date.now() });
    save(session);
    return session;
  }

  async function signup(email, password) {
    const res = await fetch(`${API}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return throwFromResponse(res);
    return res.json();
  }

  async function recover(email) {
    const res = await fetch(`${API}/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return throwFromResponse(res);
    return true;
  }

  // Completa un invito, una conferma email o un recupero password
  // (il "token" arriva dall'hash dell'URL nell'email di Netlify).
  async function verify(type, token, password) {
    const body = { type: type, token: token };
    if (password) body.password = password;
    const res = await fetch(`${API}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return throwFromResponse(res);
    const token_resp = await res.json();
    const session = Object.assign({}, token_resp, { saved_at: Date.now() });
    save(session);
    return session;
  }

  async function refresh() {
    const session = load();
    if (!session || !session.refresh_token) return null;
    const res = await fetch(`${API}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refresh_token,
      }),
    });
    if (!res.ok) {
      clear();
      return null;
    }
    const token = await res.json();
    const newSession = Object.assign({}, token, { saved_at: Date.now() });
    save(newSession);
    return newSession;
  }

  // Ritorna un access_token valido, rinnovandolo se scaduto o vicino alla
  // scadenza (token GoTrue durano 1 ora).
  async function getValidAccessToken() {
    let session = load();
    if (!session) return null;
    const ageSeconds = (Date.now() - (session.saved_at || 0)) / 1000;
    const expiresIn = session.expires_in || 3600;
    if (ageSeconds > expiresIn - 60) {
      session = await refresh();
    }
    return session ? session.access_token : null;
  }

  function logout() {
    clear();
  }

  // Individua un token di invito/conferma/recupero nell'hash dell'URL e lo
  // rimuove dalla barra indirizzi una volta letto (per non lasciarlo
  // visibile o riutilizzabile da un refresh della pagina).
  function consumeHashToken() {
    const hash = window.location.hash || '';
    const match = hash.match(
      /(confirmation_token|invite_token|recovery_token|email_change_token)=([^&]+)/
    );
    if (!match) return null;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    const typeMap = {
      confirmation_token: 'signup',
      invite_token: 'invite',
      recovery_token: 'recovery',
      email_change_token: 'email_change',
    };
    return { type: typeMap[match[1]], token: decodeURIComponent(match[2]) };
  }

  window.IdentityClient = {
    login,
    signup,
    recover,
    verify,
    refresh,
    logout,
    getValidAccessToken,
    consumeHashToken,
    load,
  };
})();
