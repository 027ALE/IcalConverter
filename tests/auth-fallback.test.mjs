import test from 'node:test';
import assert from 'node:assert/strict';

// Questi test coprono il percorso di riserva aggiunto in auth-utils.js:
// quando `context.clientContext.user` non è popolato (bug intermittente
// noto della piattaforma Netlify) ma il client ha comunque mandato un
// Authorization: Bearer <jwt> valido, la function deve verificarlo
// interrogando direttamente l'endpoint GoTrue (/.netlify/identity/user)
// invece di rispondere 401 a prescindere.
//
// Simuliamo l'endpoint GoTrue sostituendo temporaneamente `globalThis.fetch`.

const auth = (await import('../netlify/functions/auth.js')).default;

function withFakeFetch(responder, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => responder(String(url), options);
  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

test('requireRole: usa GoTrue come riserva se clientContext.user manca ma il Bearer è valido', async () => {
  await withFakeFetch(
    async (url) => {
      assert.match(url, /\/\.netlify\/identity\/user$/);
      return new Response(
        JSON.stringify({ email: 'utente@example.com', app_metadata: { roles: [] } }),
        { status: 200 }
      );
    },
    async () => {
      const req = new Request('https://example.com/api/auth', {
        headers: { Authorization: 'Bearer token-valido' },
      });
      // clientContext senza .user: simula il bug della piattaforma.
      const res = await auth(req, { clientContext: {} });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.user.email, 'utente@example.com');
      assert.equal(body.role, 'standard');
    }
  );
});

test('requireRole: 401 se GoTrue rifiuta il token (fallback attivo ma token non valido)', async () => {
  await withFakeFetch(
    async () => new Response(JSON.stringify({ error: 'invalid token' }), { status: 401 }),
    async () => {
      const req = new Request('https://example.com/api/auth', {
        headers: { Authorization: 'Bearer token-scaduto' },
      });
      const res = await auth(req, { clientContext: {} });
      assert.equal(res.status, 401);
    }
  );
});

test('requireRole: 401 se manca del tutto l\'header Authorization (nessun fallback possibile)', async () => {
  await withFakeFetch(
    async () => {
      throw new Error('fetch non dovrebbe essere chiamato senza un Bearer token');
    },
    async () => {
      const req = new Request('https://example.com/api/auth');
      const res = await auth(req, { clientContext: {} });
      assert.equal(res.status, 401);
    }
  );
});

test('requireRole: privilegia clientContext.user quando già presente (nessuna chiamata di rete)', async () => {
  await withFakeFetch(
    async () => {
      throw new Error('fetch non dovrebbe essere chiamato se clientContext.user è già presente');
    },
    async () => {
      const req = new Request('https://example.com/api/auth', {
        headers: { Authorization: 'Bearer qualunque' },
      });
      const res = await auth(req, {
        clientContext: { user: { email: 'diretto@example.com', app_metadata: { roles: ['admin'] } } },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.user.email, 'diretto@example.com');
      assert.equal(body.isAdmin, true);
    }
  );
});
