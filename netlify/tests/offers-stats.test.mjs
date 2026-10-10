// YAVD Offers Module: views and leads counts tests (Session 1.9)
// Run from the website folder:  node --test netlify/tests/offers-stats.test.mjs
// Uses in-memory stand-ins for Netlify Blobs; never touches real storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const auth = await import('../functions/lib/offers-auth.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const S = await import('../functions/lib/offers-stats.mjs');
const statsFn = (await import('../functions/offers-stats.mjs')).default;
const C = await import('../../shared/offer-contract.js');

/* In-memory Blobs with ETags (same behaviour as the one in offers-rules.test.mjs;
   copied, because importing that file would run its tests here too). */
function memoryBlobs() {
  const m = new Map();
  let n = 0;
  return {
    async get(k) { const e = m.get(k); return e ? JSON.parse(e.v) : null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: e.meta || {} } : null; },
    async setJSON(k, v, o = {}) {
      await new Promise((r) => setImmediate(r));   // let parallel requests interleave
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: JSON.stringify(v), etag, meta: o.metadata || {} });
      return { modified: true, etag };
    },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

const RUNNING = '11111111-1111-4111-8111-111111111111';
const DRAFT   = '22222222-2222-4222-8222-222222222222';
const EXPIRED = '33333333-3333-4333-8333-333333333333';
const UPCOMING = '44444444-4444-4444-8444-444444444444';
const MISSING = '55555555-5555-4555-8555-555555555555';

function offer(id, over) {
  return { id, name: `TEST ${id.slice(0, 4)}`, slug: '', page: '/booth-proof.html', audience: 'everyone',
    headline: 'h', body: 'b', form: {}, buttonUrl: null, draft: false, previewKey: 'k'.repeat(32),
    rerunOf: null, createdAt: iso(-DAY), updatedAt: iso(-DAY),
    startsAt: iso(-DAY), endsAt: iso(DAY), ...over };
}

let offersBlobs, statsBlobs, storeNames;
beforeEach(async () => {
  offersBlobs = memoryBlobs();
  statsBlobs = memoryBlobs();
  storeNames = [];
  st._setOffersStoreFactoryForTests(() => offersBlobs);
  S._setStatsStoreFactoryForTests((dc) => { storeNames.push(S.statsStoreName(dc)); return statsBlobs; });
  S._clearOfferCacheForTests();
  await offersBlobs.setJSON('all', [
    offer(RUNNING),
    offer(DRAFT, { draft: true }),
    offer(EXPIRED, { startsAt: iso(-3 * DAY), endsAt: iso(-DAY) }),
    offer(UPCOMING, { startsAt: iso(DAY), endsAt: iso(2 * DAY) })
  ]);
});

function countReq(body, { origin = BASE, type = 'application/json' } = {}) {
  const headers = { 'content-type': type };
  if (origin) headers.origin = origin;
  return new Request(`${BASE}/api/offers/stats`, {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
const cookie = () => `${C.AUTH.cookie}=${auth.makeToken(auth.authConfig())}`;
async function getStats(withCookie = true) {
  const res = await statsFn(new Request(`${BASE}/api/offers/stats`, {
    headers: withCookie ? { cookie: cookie() } : {}
  }), ctx);
  return { res, body: await res.json() };
}
async function send(body, opts) {
  const res = await statsFn(countReq(body, opts), ctx);
  return { status: res.status, state: res.headers.get('x-yavd-stat'), res };
}

test('a view and a lead on a running offer each add exactly one', async () => {
  let r = await send({ id: RUNNING, event: 'view' });
  assert.equal(r.status, 204); assert.equal(r.state, 'counted');
  assert.deepEqual((await getStats()).body.stats[RUNNING], { views: 1, leads: 0 });
  r = await send({ id: RUNNING, event: 'lead' });
  assert.equal(r.state, 'counted');
  assert.deepEqual((await getStats()).body.stats[RUNNING], { views: 1, leads: 1 });
  r = await send({ id: RUNNING, event: 'view' });
  assert.deepEqual((await getStats()).body.stats[RUNNING], { views: 2, leads: 1 });
});

test('the count response carries no counts or offer data', async () => {
  const r = await send({ id: RUNNING, event: 'view' });
  assert.equal(await r.res.text(), '');
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
});

test('drafts (what a draft preview would send), expired, upcoming and unknown offers never count', async () => {
  assert.equal((await send({ id: DRAFT, event: 'view' })).state, 'not-running');
  assert.equal((await send({ id: DRAFT, event: 'lead' })).state, 'not-running');
  assert.equal((await send({ id: EXPIRED, event: 'view' })).state, 'not-running');
  assert.equal((await send({ id: UPCOMING, event: 'view' })).state, 'not-running');
  assert.equal((await send({ id: MISSING, event: 'view' })).state, 'unknown');
  assert.deepEqual((await getStats()).body.stats, {});
});

test('cross-site, missing origin, non-JSON, oversized and malformed requests are refused', async () => {
  assert.equal((await send({ id: RUNNING, event: 'view' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await send({ id: RUNNING, event: 'view' }, { origin: null })).status, 403);
  assert.equal((await send({ id: RUNNING, event: 'view' }, { type: 'text/plain' })).status, 415);
  assert.equal((await send({ id: RUNNING, event: 'view', pad: 'x'.repeat(600) })).status, 413);
  assert.equal((await send('{nope')).status, 400);
  assert.equal((await send({ id: 'all', event: 'view' })).status, 400);
  assert.equal((await send({ id: RUNNING, event: 'click' })).status, 400);
  assert.equal((await send({ id: RUNNING, event: 'toString' })).status, 400);
  assert.equal((await send({ id: RUNNING, event: '__proto__' })).status, 400);
  assert.deepEqual((await getStats()).body.stats, {});
});

test('reading counts needs sign-in; other methods refused', async () => {
  const { res } = await getStats(false);
  assert.equal(res.status, 401);
  const del = await statsFn(new Request(`${BASE}/api/offers/stats`, { method: 'DELETE' }), ctx);
  assert.equal(del.status, 405);
});

test('test deploys use the -test stats store, production the live one', async () => {
  await send({ id: RUNNING, event: 'view' });
  assert.ok(storeNames.length && storeNames.every((n) => n === 'offer-stats-test'));
  assert.equal(S.statsStoreName('production'), 'offer-stats');
  assert.equal((await getStats()).body.store, 'offer-stats-test');
});

test('twenty parallel views all land (conditional writes, no lost counts)', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, () => send({ id: RUNNING, event: 'view' })));
  const counted = rs.filter((r) => r.state === 'counted').length;
  const stored = (await getStats()).body.stats[RUNNING].views;
  assert.equal(stored, counted, 'every "counted" answer is in the store');
  assert.equal(stored, 20);
});

test('a write that keeps colliding gives up as busy without corrupting the record', async () => {
  await statsBlobs.setJSON(RUNNING, { views: 7, leads: 2 });
  const store = {
    getWithMetadata: (k) => statsBlobs.getWithMetadata(k),
    setJSON: async () => ({ modified: false })     // someone else always wins
  };
  await assert.rejects(S.bumpStat(store, RUNNING, 'view', { pause: async () => {} }), /busy/);
  assert.deepEqual(await statsBlobs.get(RUNNING), { views: 7, leads: 2 });
});

test('storage failure: the count answers 503 quietly, the admin read says so plainly', async () => {
  st._setOffersStoreFactoryForTests(() => ({ getWithMetadata: async () => { throw new Error('down'); } }));
  const r = await send({ id: RUNNING, event: 'view' });
  assert.equal(r.status, 503); assert.equal(r.state, 'store-failed');
  S._setStatsStoreFactoryForTests(() => ({ list: async () => { throw new Error('down'); } }));
  const { res, body } = await getStats();
  assert.equal(res.status, 503);
  assert.match(body.error, /unavailable/);
});

test('odd stored values read as zero, never as text or negatives', () => {
  assert.deepEqual(S.normalizeStats(null), { views: 0, leads: 0 });
  assert.deepEqual(S.normalizeStats({ views: '5', leads: -2 }), { views: 0, leads: 0 });
  assert.deepEqual(S.normalizeStats({ views: 3.5, leads: 4 }), { views: 0, leads: 4 });
});
