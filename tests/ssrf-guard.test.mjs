import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFetch, MAX_RESPONSE_BYTES } from '../netlify/functions/ssrf-guard.js';

// Questi test riguardano solo la validazione statica (IP letterali), che
// non richiede rete né DNS reale, così restano affidabili anche in CI
// senza accesso a internet. I casi che richiedono una risoluzione DNS
// vera (hostname pubblici vs. hostname che risolvono a IP privati) non
// sono coperti qui per evitare dipendenze dalla rete durante i test.

test('safeFetch: rifiuta indirizzi IPv4 privati/riservati', async () => {
  const casi = [
    'http://127.0.0.1/',
    'http://localhost/', // risolve a loopback: gestito dal path DNS, ma proviamo comunque
    'http://169.254.169.254/latest/meta-data/', // metadata endpoint cloud
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://0.0.0.0/',
  ];

  for (const url of casi) {
    await assert.rejects(
      () => safeFetch(new URL(url)),
      undefined,
      `dovrebbe rifiutare ${url}`
    );
  }
});

test('safeFetch: rifiuta indirizzi IPv6 privati/riservati', async () => {
  const casi = ['http://[::1]/', 'http://[fe80::1]/', 'http://[fc00::1]/'];

  for (const url of casi) {
    await assert.rejects(
      () => safeFetch(new URL(url)),
      undefined,
      `dovrebbe rifiutare ${url}`
    );
  }
});

test('safeFetch: rifiuta protocolli non supportati', async () => {
  await assert.rejects(() => safeFetch(new URL('ftp://example.com/x.ics')));
  await assert.rejects(() => safeFetch(new URL('file:///etc/passwd')));
});

test('MAX_RESPONSE_BYTES: è un limite ragionevole (tra 1 e 20 MB)', () => {
  assert.ok(MAX_RESPONSE_BYTES >= 1024 * 1024);
  assert.ok(MAX_RESPONSE_BYTES <= 20 * 1024 * 1024);
});
