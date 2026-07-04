import test from 'node:test';
import assert from 'node:assert/strict';

import fetchIcalHandler from '../netlify/functions/fetch-ical.js';
import linksHandler from '../netlify/functions/links.js';

test('fetch-ical richiede autenticazione', async () => {
  const req = new Request('https://example.com/api/fetch-ical');
  const res = await fetchIcalHandler(req);
  assert.equal(res.status, 401);
});

test('links richiede autenticazione', async () => {
  const req = new Request('https://example.com/api/links');
  const res = await linksHandler(req);
  assert.equal(res.status, 401);
});
