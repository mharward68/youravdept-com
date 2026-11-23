// YAVD Offers Module: landing admin routes (Session 4.4, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landings-routes.test.mjs
// In-memory stand-ins for every Blobs store (landings, offers, pictures, sign-in);
// never touches real storage. Helpers are copied, not imported from another test file.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const offSt = await import('../functions/lib/offers-store.mjs');
const landSt = await import('../functions/lib/landings-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const { IMAGE_MESSAGES } = await import('../functions/lib/offer-image.mjs');
const landingsMod = await import('../functions/landings.mjs');
const archiveMod = await import('../functions/landings-archive.mjs');
const landingsFn = landingsMod.default;
const archiveFn = archiveMod.default;

/* ---------- in-memory JSON store with ETags ---------- */
function jsonBlobs() {
  const m = new Map();
  let n = 0;
  const s = {
    m,
    async get(k) { const e = m.get(k); return e ? JSON.parse(e.v) : null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: e.meta || {} } : null; },
    async setJSON(k, v, o = {}) {
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
  return s;
}
const down = () => { const f = async () => { throw new Error('blobs down: secret detail'); };
  return { get: f, getWithMetadata: f, setJSON: f, list: f, delete: f, getMetadata: f }; };

/* ---------- in-memory picture store (metadata only) ---------- */
function pictureBlobs() {
  const m = new Map();
  const calls = [];
  return {
    m, calls,
    add(id, meta = {}) {
      m.set(id, { type: 'image/jpeg', bytes: 54321, width: 1200, height: 800, uploadedAt: '2026-11-11T12:00:00.000Z', ...meta });
      return id;
    },
    async getMetadata(k) { calls.push(k); const e = m.get(k); return e ? { metadata: structuredClone(e) } : null; }
  };
}

let lands, offers, pics, authBlobs;
beforeEach(() => {
  lands = jsonBlobs();
  offers = jsonBlobs();
  pics = pictureBlobs();
  authBlobs = jsonBlobs();
  landSt._setLandingsStoreFactoryForTests(() => lands);
  offSt._setOffersStoreFactoryForTests(() => offers);
  imgStore._setImagesStoreFactoryForTests(() => pics);
  auth._setStoreFactoryForTests(() => ({ set: authBlobs.setJSON, list: authBlobs.list, delete: authBlobs.delete }));
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;

async function call(fn, path, { method = 'POST', body, signedIn = true, headers = {} } = {}) {
  const h = { ...headers };
  if (signedIn) h.cookie = cookie();
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fn(new Request(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), ctx);
  const text = await r.text();
  return { status: r.status, headers: r.headers, body: text ? JSON.parse(text) : null };
}
const list = (o) => call(landingsFn, '/api/offers/landings', { method: 'GET', ...o });
const save = (body, o) => call(landingsFn, '/api/offers/landings', { body, ...o });
const archive = (body, o) => call(archiveFn, '/api/offers/landings/archive', { body, ...o });
const storedLandings = () => JSON.parse(lands.m.get('all')?.v ?? '[]');
const show = (label, r) => console.log(`  ${label} -> ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);

function page(over = {}) {
  return { name: 'Group 2027', slug: 'group-2027', eyebrow: 'For planners', headline: 'Book your 2027 show',
    body: 'Lock in your crew early.', ctaLabel: 'Book a call', ctaUrl: 'https://calendar.app.google/abc', status: 'live', ...over };
}
function offer(over = {}) {
  return { ...C.emptyOffer(), id: 'o1', name: 'Linked offer', slug: 'group', page: '/booth-proof.html', audience: 'everyone',
    headline: 'H', body: 'B', startsAt: '2026-01-01T00:00:00-05:00', endsAt: '2099-01-01T00:00:00-05:00', draft: false,
    landing: 'group-2027', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over };
}

/* ---------- sign-in ---------- */

test('signed out: 401 on every route and method, nothing written', async () => {
  const rs = [
    await list({ signedIn: false }),
    await save(page(), { signedIn: false }),
    await archive({ id: 'x', archived: true }, { signedIn: false })
  ];
  for (const r of rs) assert.equal(r.status, 401);
  assert.equal(lands.m.size, 0);
  assert.equal((await call(archiveFn, '/api/offers/landings/archive', { method: 'GET' })).status, 405);
  assert.equal((await call(landingsFn, '/api/offers/landings', { method: 'DELETE' })).status, 405);
  const cross = await save(page(), { headers: { origin: 'https://evil.example' } });
  assert.equal(cross.status, 403, 'cross-site POST refused even when signed in');
  console.log(`  signed out: ${rs.map((r) => r.status).join(', ')}; cross-site ${cross.status}`);
});

test('proof the 401 comes from requireAdmin: the same routes with the check removed let a signed-out caller in', async () => {
  const fnDir = new URL('../functions/', import.meta.url).href;
  const sharedDir = new URL('../../shared/', import.meta.url).href;
  for (const [file, req] of [
    ['landings.mjs', () => list({ signedIn: false })],
    ['landings-archive.mjs', () => archive({ id: 'missing', archived: true }, { signedIn: false })]
  ]) {
    const src = await readFile(new URL(file, fnDir), 'utf8');
    const check = /const refused = requireAdmin\([^;]*;\s*if \(refused\) return refused;/;
    assert.match(src, check, `${file} starts with the sign-in check`);
    const stripped = src.replace(check, '')
      .replaceAll("from './", `from '${fnDir}`)
      .replaceAll("from '../../shared/", `from '${sharedDir}`);
    const mod = await import('data:text/javascript,' + encodeURIComponent(stripped));
    const r = await (file === 'landings.mjs'
      ? call(mod.default, '/api/offers/landings', { method: 'GET', signedIn: false })
      : call(mod.default, '/api/offers/landings/archive', { body: { id: 'missing', archived: true }, signedIn: false }));
    assert.notEqual(r.status, 401, `${file} without the check no longer refuses`);
    console.log(`  ${file} without requireAdmin, signed out -> ${r.status}; real file -> ${(await req()).status}`);
  }
});

/* ---------- create and update ---------- */

test('create: 201 with the record in contract order and a preview path; responses are no-store and noindex', async () => {
  const r = await save(page());
  show('create', r);
  assert.equal(r.status, 201);
  assert.equal(r.body.created, true);
  assert.deepEqual(Object.keys(r.body.landing), C.LANDING_KEYS);
  assert.equal(r.body.previewPath, `/offers/landing-group-2027.html?preview=${r.body.landing.previewKey}`);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.deepEqual(storedLandings(), [r.body.landing]);
});

test('create with { landing } wrapper, and a draft may be incomplete', async () => {
  const r = await save({ landing: { name: 'Rough idea', slug: 'rough-idea' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.landing.status, 'draft');
});

test('update: 200 with the new copy; a stale copy is refused 409 and nothing changes', async () => {
  const a = (await save(page())).body.landing;
  const u = await save({ ...a, headline: 'New headline' });
  assert.equal(u.status, 200);
  assert.equal(u.body.created, false);
  assert.equal(u.body.landing.headline, 'New headline');
  const stale = await save({ ...a, headline: 'Old copy wins?' });
  show('stale edit', stale);
  assert.equal(stale.status, 409);
  assert.equal(storedLandings()[0].headline, 'New headline');
});

test('field problems: 400 with field messages; tags stripped; http and javascript links refused', async () => {
  const r = await save(page({ ctaUrl: 'javascript:alert(1)', headline: '' }));
  show('bad fields', r);
  assert.equal(r.status, 400);
  assert.equal(r.body.fields.ctaUrl, C.LANDING_MESSAGES.ctaUrl);
  assert.ok(r.body.fields.headline);
  assert.equal((await save(page({ ctaUrl: 'http://example.com' }))).status, 400);
  const t = await save(page({ headline: '<script>x</script>Hello' }));
  assert.equal(t.status, 201);
  assert.doesNotMatch(t.body.landing.headline, /</);
  assert.equal(storedLandings().length, 1);
});

test('slug clash 409 (case-insensitive), unknown id 404 gone', async () => {
  await save(page());
  const c = await save(page({ name: 'Other', slug: 'GROUP-2027' }));
  show('slug clash', c);
  assert.equal(c.status, 409);
  assert.equal(c.body.fields.slug, C.LANDING_MESSAGES.slugTaken);
  const g = await save(page({ id: 'nope', updatedAt: '2026-01-01T00:00:00.000Z' }));
  assert.equal(g.status, 404);
  assert.equal(g.body.error, C.LANDING_MESSAGES.gone);
});

test('bad requests: not JSON 415, broken JSON 400, too large 413 with page wording', async () => {
  const r1 = await landingsFn(new Request(BASE + '/api/offers/landings', { method: 'POST', headers: { cookie: cookie(), 'content-type': 'text/plain' }, body: 'x' }), ctx);
  assert.equal(r1.status, 415);
  const r2 = await landingsFn(new Request(BASE + '/api/offers/landings', { method: 'POST', headers: { cookie: cookie(), 'content-type': 'application/json' }, body: '{' }), ctx);
  assert.equal(r2.status, 400);
  const big = await save(page({ body: 'x'.repeat(70 * 1024) }));
  assert.equal(big.status, 413);
  assert.equal(big.body.error, landingsMod.TOO_LARGE);
});

/* ---------- pictures ---------- */

test('picture: facts come from the picture store; missing picture gives the gone message; same picture is not looked up again', async () => {
  const id = pics.add('a'.repeat(32), { width: 1600, height: 900 });
  const r = await save(page({ image: { id, alt: 'Stage at sunrise', placement: 'left', width: 1, bytes: 1 } }));
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.landing.image, { id, alt: 'Stage at sunrise', placement: 'top', width: 1600, height: 900, type: 'image/jpeg', bytes: 54321 });
  pics.calls.length = 0;
  const same = await save({ ...r.body.landing, headline: 'Edited' });
  assert.equal(same.status, 200);
  assert.deepEqual(pics.calls, [], 'unchanged picture: no lookup');

  const gone = await save(page({ name: 'P2', slug: 'second-page', image: { id: 'b'.repeat(32), alt: 'x' } }));
  show('missing picture', gone);
  assert.equal(gone.status, 400);
  assert.equal(gone.body.fields['image.id'], IMAGE_MESSAGES.gone);
});

test('picture storage down: a new picture answers 503, nothing written', async () => {
  imgStore._setImagesStoreFactoryForTests(() => down());
  const r = await save(page({ image: { id: 'c'.repeat(32), alt: 'x' } }));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, landingsMod.IMAGE_UNAVAILABLE);
  assert.doesNotMatch(r.body.error, /secret/);
  assert.equal(lands.m.size, 0);
});

/* ---------- list ---------- */

test('list: each landing with its state and linked offers, oldest first', async () => {
  const a = (await save(page())).body.landing;
  await save({ name: 'Draft page', slug: 'draft-page' });
  await offers.setJSON('all', [offer(), offer({ id: 'o2', name: 'Other offer', slug: 'other', landing: 'somewhere-else' }),
    offer({ id: 'o3', name: 'Draft offer', slug: null, draft: true })]);
  const r = await list();
  show('list', { status: r.status, body: r.body.landings.map((l) => [l.slug, l.state, l.linkedOffers.map((o) => o.id)]) });
  assert.equal(r.status, 200);
  assert.equal(r.body.store, 'offer-landings-test');
  assert.equal(r.body.contract, '1.4.0');
  assert.deepEqual(r.body.notes, []);
  assert.deepEqual(r.body.landings.map((l) => l.slug), ['group-2027', 'draft-page']);
  assert.equal(r.body.landings[0].state, 'running');
  assert.deepEqual(r.body.landings[0].linkedOffers, [
    { id: 'o1', name: 'Linked offer', slug: 'group', draft: false },
    { id: 'o3', name: 'Draft offer', slug: null, draft: true }]);
  assert.equal(r.body.landings[1].state, 'draft');
  assert.equal(r.body.landings[0].id, a.id);

  await offers.setJSON('all', [offer({ endsAt: '2026-02-01T00:00:00-05:00' })]);
  assert.equal((await list()).body.landings[0].state, 'expired');
});

test('list: offers store unreadable still lists the landings, with a note', async () => {
  await save(page());
  offSt._setOffersStoreFactoryForTests(() => down());
  const r = await list();
  show('offers store down', { status: r.status, body: { notes: r.body.notes, n: r.body.landings.length } });
  assert.equal(r.status, 200);
  assert.equal(r.body.landings.length, 1);
  assert.deepEqual(r.body.landings[0].linkedOffers, []);
  assert.deepEqual(r.body.notes, [landingsMod.OFFERS_UNREADABLE]);
  offSt._setOffersStoreFactoryForTests(() => { throw new Error('no blobs'); });
  assert.equal((await list()).status, 200);
});

test('empty list, and a landings store that cannot be read answers 503', async () => {
  const e = await list();
  assert.deepEqual(e.body.landings, []);
  landSt._setLandingsStoreFactoryForTests(() => down());
  const r = await list();
  assert.equal(r.status, 503);
  assert.doesNotMatch(r.body.error, /secret/);
  assert.equal((await save(page())).status, 503);
  assert.equal((await archive({ id: 'x', archived: true })).status, 503);
});

/* ---------- archive and restore ---------- */

test('archive and restore: Live to Archived to Live, history kept, updatedAt moves, offers keep their link', async () => {
  const a = (await save(page())).body.landing;
  await offers.setJSON('all', [offer()]);
  const hBefore = (await landSt.listLandingHistory(lands)).length;

  const r = await archive({ id: a.id, archived: true });
  show('archive', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.changed, true);
  assert.equal(r.body.landing.status, 'archived');
  assert.equal(r.body.landing.state, 'archived');
  assert.ok(r.body.landing.archivedAt);
  assert.ok(r.body.landing.updatedAt > a.updatedAt);
  assert.deepEqual(r.body.landing.linkedOffers.map((o) => o.id), ['o1']);
  assert.equal(storedLandings()[0].status, 'archived');
  assert.deepEqual(Object.keys(storedLandings()[0]), C.LANDING_KEYS);

  const again = await archive({ id: a.id, archived: true });
  assert.equal(again.status, 200);
  assert.equal(again.body.changed, false);

  const stale = await save({ ...a, headline: 'From an old window' });
  assert.equal(stale.status, 409, 'an editor opened before the archive cannot save over it');

  const back = await archive({ id: a.id, archived: false });
  show('restore', back);
  assert.equal(back.status, 200);
  assert.equal(back.body.landing.status, 'live');
  assert.equal(back.body.landing.archivedAt, null);
  assert.equal(back.body.landing.slug, 'group-2027');

  const hist = await landSt.listLandingHistory(lands);
  assert.equal(hist.length, hBefore + 2, 'archive and restore each kept the previous version');
  const newest = await lands.get(hist[0]);
  assert.equal(newest.action, 'restore');
  assert.equal(newest.landingId, a.id);
});

test('archive: a Draft is refused 409 and stays a draft; restore on a draft or live page changes nothing', async () => {
  const d = (await save({ name: 'Draft page', slug: 'draft-page' })).body.landing;
  const r = await archive({ id: d.id, archived: true });
  show('archive a draft', r);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, archiveMod.DRAFT_ARCHIVE);
  assert.equal(storedLandings()[0].status, 'draft');
  const rd = await archive({ id: d.id, archived: false });
  assert.equal(rd.status, 200);
  assert.equal(rd.body.changed, false);
  assert.equal(rd.body.landing.status, 'draft');
  const l = (await save(page())).body.landing;
  const rl = await archive({ id: l.id, archived: false });
  assert.equal(rl.body.changed, false);
});

test('archive: bad bodies 400, unknown id 404', async () => {
  for (const b of [{}, { id: 'x' }, { id: 'x', archived: 'yes' }, { id: '', archived: true }, { id: 5, archived: false }, null]) {
    assert.equal((await archive(b)).status, 400, JSON.stringify(b));
  }
  const g = await archive({ id: 'missing', archived: true });
  assert.equal(g.status, 404);
  assert.equal(g.body.error, C.LANDING_MESSAGES.gone);
});

test('routes are the contract paths', () => {
  assert.equal(landingsMod.config.path, C.ROUTES.apiLandings);
  assert.equal(archiveMod.config.path, C.ROUTES.apiLandingArchive);
});
