import test from 'node:test';
import assert from 'node:assert/strict';

process.env.APP_ADMIN_EMAILS = 'admin@example.com';

// Le function sotto test usano @netlify/blobs, che fuori dall'ambiente
// Netlify non ha credenziali: readRoles/writeRoles gestiscono l'errore e
// tornano un oggetto vuoto, quindi i test qui sotto restano validi anche in
// locale/CI e coprono comunque i casi di sicurezza più critici (401/403,
// whitelist-only, ruolo admin definito solo da env var).

function fakeContext(email) {
  if (!email) return {};
  return { clientContext: { user: { email } } };
}

const fetchIcal = (await import('../netlify/functions/fetch-ical.js')).default;
const links = (await import('../netlify/functions/links.js')).default;
const users = (await import('../netlify/functions/users.js')).default;
const auth = (await import('../netlify/functions/auth.js')).default;

test('fetch-ical: nessun utente -> 401', async () => {
  const req = new Request('https://example.com/api/fetch-ical');
  const res = await fetchIcal(req, fakeContext(null));
  assert.equal(res.status, 401);
});

test('fetch-ical: utente non autorizzato (non invitato) -> 403', async () => {
  const req = new Request('https://example.com/api/fetch-ical?url=https://x.test/cal.ics');
  const res = await fetchIcal(req, fakeContext('estraneo@example.com'));
  assert.equal(res.status, 403);
});

test('links: nessun utente -> 401 su ogni metodo', async () => {
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    const req = new Request('https://example.com/api/links', { method });
    const res = await links(req, fakeContext(null));
    assert.equal(res.status, 401, `metodo ${method}`);
  }
});

test('links: utente non invitato -> 403', async () => {
  const req = new Request('https://example.com/api/links');
  const res = await links(req, fakeContext('estraneo@example.com'));
  assert.equal(res.status, 403);
});

test('users: nessun utente -> 401', async () => {
  const req = new Request('https://example.com/api/users');
  const res = await users(req, fakeContext(null));
  assert.equal(res.status, 401);
});

test('users: utente autenticato ma non admin -> 403', async () => {
  const req = new Request('https://example.com/api/users');
  const res = await users(req, fakeContext('estraneo@example.com'));
  assert.equal(res.status, 403);
});

test('users: admin definito da env può accedere alla lista', async () => {
  const req = new Request('https://example.com/api/users');
  const res = await users(req, fakeContext('admin@example.com'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.users));
  assert.ok(body.users.some((u) => u.email === 'admin@example.com' && u.role === 'admin'));
});

test('auth: nessun utente -> 401', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext(null));
  assert.equal(res.status, 401);
});

test('auth: admin -> isAdmin true', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext('admin@example.com'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.isAdmin, true);
});

test('auth: utente non invitato -> 403 (whitelist-only, mai accesso di default)', async () => {
  const req = new Request('https://example.com/api/auth');
  const res = await auth(req, fakeContext('chiunque@example.com'));
  assert.equal(res.status, 403);
});
