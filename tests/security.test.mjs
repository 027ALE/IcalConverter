import test from 'node:test';
import assert from 'node:assert/strict';

// Le function sotto test usano @netlify/blobs (solo per i link salvati:
// nessun dato utente ci passa più attraverso), che fuori dall'ambiente
// Netlify non ha credenziali. links.js gestisce l'errore internamente e
// torna una lista vuota, quindi i test qui sotto restano validi anche in
// locale/CI.
//
// Il ruolo applicativo è derivato SOLO dal ruolo nativo Netlify Identity
// (app_metadata.roles) iniettato nel JWT: qui lo simuliamo direttamente in
// context.clientContext.user.app_metadata.roles.

function fakeContext(email, roles = []) {
  if (!email) return {};
  return { clientContext: { user: { email, app_metadata: { roles } } } };
}

const fetchIcal = (await import('../netlify/functions/fetch-ical.js')).default;
const links = (await import('../netlify/functions/links.js')).default;
const auth = (await import('../netlify/functions/auth.js')).default;

test('fetch-ical: nessun utente -> 401', async () => {
  const req = new Request('https://example.com/api/fetch-ical');
  const res = await fetchIcal(req, fakeContext(null));
  assert.equal(res.status, 401);
});

test('fetch-ical: utente Identity autenticato (standard) -> passa l\'autorizzazione', async () => {
  const req = new Request('https://example.com/api/fetch-ical?url=https://x.test/cal.ics');
  const res = await fetchIcal(req, fakeContext('utente@example.com'));
  // Nessun 401/403: l'autorizzazione passa. Il fetch remoto verso un host
  // inesistente fallirà a valle (502/500), ma non è quello che testiamo qui.
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
});

test('links: nessun utente -> 401 su ogni metodo', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const req = new Request('https://example.com/api/links', { method });
    const res = await links(req, fakeContext(null));
    assert.equal(res.status, 401, `metodo ${method}`);
  }
});

test('links: utente standard può leggere e aggiungere', async () => {
  for (const method of ['GET', 'POST']) {
    const req = new Request('https://example.com/api/links', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ url: 'https://x.test/a.ics' }) : undefined,
    });
    const res = await links(req, fakeContext('utente@example.com'));
    assert.notEqual(res.status, 401, `metodo ${method}`);
    assert.notEqual(res.status, 403, `metodo ${method}`);
  }
});

test('links: utente standard NON può modificare o eliminare -> 403', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const req = new Request('https://example.com/api/links?id=x', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'PUT' ? JSON.stringify({ id: 'x', url: 'https://x.test/a.ics' }) : undefined,
    });
    const res = await links(req, fakeContext('utente@example.com'));
    assert.equal(res.status, 403, `metodo ${method}`);
  }
});

test('links: utente con ruolo admin può modificare o eliminare', async () => {
  for (const method of ['PUT', 'DELETE']) {
    const req = new Request('https://example.com/api/links?id=x', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'PUT' ? JSON.stringify({ id: 'x', url: 'https://x.test/a.ics' }) : undefined,
    });
    const res = await links(req, fakeContext('admin@example.com', ['admin']));
    assert.notEqual(res.status, 403, `metodo ${method}`);
  }
});

test('auth: nessun utente -> 401', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext(null));
  assert.equal(res.status, 401);
});

test('auth: ruolo Identity "admin" -> isAdmin true', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext('admin@example.com', ['admin']));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isAdmin, true);
  assert.equal(body.role, 'admin');
});

test('auth: utente Identity senza ruoli -> standard, isAdmin false, comunque autorizzato', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext('chiunque@example.com'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isAdmin, false);
  assert.equal(body.role, 'standard');
});
