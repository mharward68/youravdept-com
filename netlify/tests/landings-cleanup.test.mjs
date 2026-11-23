// YAVD Offers Module: picture cleanup protects landing pictures (Session 4.5, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landings-cleanup.test.mjs
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
const { cleanupImages, usedImageIds } = await import('../functions/lib/offer-images-cleanup.mjs');
const landingsFn = (await import('../functions/landings.mjs')).default;
const offersFn = (await import('../functions/offers.mjs')).default;

const HOUR = 60 * 60 * 1000;

/* ---------- in-memory JSON store with ETags ---------- */
function jsonBlobs() {
  const m = new Map();
  let n = 0;
  const s = {
    m, gets: [], failGet: null, failList: false,
    async get(k) {
      s.gets.push(k);
      if (s.failGet && s.failGet(k)) throw new Error('blobs read failed');
      const e = m.get(k); return e ? JSON.parse(e.v) : null;
    },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: e.meta || {} } : null; },
    async setJSON(k, v, o = {}) {
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: JSON.stringify(v), etag, meta: o.metadata || {} });
      return { modified: true, etag };
    },
    async list({ prefix = '' } = {}) {
      if (s.failList) throw new Error('blobs list failed');
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(k) { m.delete(k); }
  };
  return s;
}
const down = () => { const f = async () => { throw new Error('blobs down'); };
  return { get: f, getWithMetadata: f, setJSON: f, list: f, delete: f, getMetadata: f }; };

/* ---------- in-memory picture store (bytes plus metadata) ---------- */
function pictureBlobs() {
  const m = new Map();
  const s = {
    m, deletes: [], failList: false,
    add(ageHours, over = {}) {
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const uploadedAt = new Date(Date.now() - ageHours * HOUR).toISOString();
      m.set(id, { b: new Uint8Array(1000).fill(7), meta: { type: 'image/jpeg', bytes: 1000, width: 1600, height: 900, uploadedAt, ...over } });
      return id;
    },
    async set(k, b, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, { b, meta: o.metadata }); return { modified: true }; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: e.b.buffer, metadata: structuredClone(e.meta) } : null; },
    async getMetadata(k) { const e = m.get(k); return e ? { metadata: structuredClone(e.meta) } : null; },
    async list() { if (s.failList) throw new Error('blobs down'); return { blobs: [...m.keys()].map((key) => ({ key })) }; },
    async delete(k) { s.deletes.push(k); m.delete(k); }
  };
  return s;
}

let lands, offers, pics, authBlobs, errors;
const origError = console.error;
beforeEach(() => {
  lands = jsonBlobs();
  offers = jsonBlobs();
  pics = pictureBlobs();
  authBlobs = jsonBlobs();
  errors = [];
  console.error = (...a) => { errors.push(a.join(' ')); };
  landSt._setLandingsStoreFactoryForTests(() => lands);
  offSt._setOffersStoreFactoryForTests(() => offers);
  imgStore._setImagesStoreFactoryForTests(() => pics);
  auth._setStoreFactoryForTests(() => ({ set: authBlobs.setJSON, list: authBlobs.list, delete: authBlobs.delete }));
});
process.on('exit', () => { console.error = origError; });

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;
async function call(fn, path, body) {
  const r = await fn(new Request(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(), origin: BASE }, body: JSON.stringify(body) }), ctx);
  return { status: r.status, body: await r.json() };
}
const saveLanding = (body) => call(landingsFn, '/api/offers/landings', body);
const saveOffer = (body) => call(offersFn, '/api/offers', body);
const has = (id) => pics.m.has(id);
const storedLandings = () => JSON.parse(lands.m.get('all')?.v ?? '[]');

function page(over = {}) {
  return { name: 'Group 2027', slug: 'group-2027', eyebrow: 'For planners', headline: 'Book your 2027 show',
    body: 'Lock in your crew early.', ctaLabel: 'Book a call', ctaUrl: 'https://calendar.app.google/abc', status: 'live', ...over };
}
const pagePic = (id, over = {}) => page({ image: { id, alt: 'Stage at sunrise' }, ...over });
function offerDraft(over = {}) {
  return { ...C.emptyOffer(), id: undefined, name: 'Plain offer', page: '/booth-proof.html', audience: 'everyone',
    headline: 'Book 2027 now', body: 'Copy', startsAt: '2026-10-12T00:00:00-04:00',
    endsAt: '2026-12-31T23:59:00-05:00', draft: true, ...over };
}
// Puts a picture on a landing page, then ages it past the grace period.
async function landingWithOldPicture(over = {}) {
  const id = pics.add(0);
  const r = await saveLanding(pagePic(id, over));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  pics.m.get(id).meta.uploadedAt = new Date(Date.now() - 500 * HOUR).toISOString();
  return { id, landing: r.body.landing };
}

/* ---------- landing pictures are used ---------- */

test('a picture used only by a landing page, 500 hours old, survives the cleanup an offer save runs', async () => {
  const { id } = await landingWithOldPicture();
  await offers.setJSON('all', [{ ...offerDraft(), id: 'o1', image: null }]);   // offers that do not use it
  // The cleanup an offer save runs, with the landings store passed (offers.mjs passes it from 4.6).
  const out = await cleanupImages(pics, offers, new Date(), lands);
  console.log('  landing-only picture after offer save cleanup ->', JSON.stringify({ kept: out.kept.length, deleted: out.deleted.length, errors: out.errors }));
  assert.ok(has(id));
  assert.deepEqual(out.deleted, []);
  assert.deepEqual(out.kept, [id]);
  assert.ok((await usedImageIds(offers, lands)).has(id));
  assert.equal((await usedImageIds(offers)).has(id), false, 'offers alone do not hold it: only the landing check keeps it');
});

test('a landing save keeps its own picture and removes an old unused one', async () => {
  const { id, landing } = await landingWithOldPicture();
  const orphan = pics.add(25);
  const r = await saveLanding({ ...landing, headline: 'Edited' });
  console.log('  landing save ->', r.status, 'own picture there:', has(id), ' orphan there:', has(orphan));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(has(id));
  assert.equal(has(orphan), false);
  assert.deepEqual(pics.deletes, [orphan]);
});

test('a landing save keeps pictures that offers use', async () => {
  const offerPic = pics.add(0);
  const o = await saveOffer(offerDraft({ image: { id: offerPic, alt: 'LED wall' } }));
  assert.equal(o.status, 201, JSON.stringify(o.body));
  pics.m.get(offerPic).meta.uploadedAt = new Date(Date.now() - 500 * HOUR).toISOString();
  const r = await saveLanding(page());
  assert.equal(r.status, 201);
  assert.ok(has(offerPic));
  assert.deepEqual(pics.deletes, []);
});

test('a picture used only by a saved landing version survives', async () => {
  const { id, landing } = await landingWithOldPicture();
  const r = await saveLanding({ ...landing, image: null });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(storedLandings()[0].image, null, 'no current landing uses it');
  assert.ok(has(id), 'kept by the saved version from before the removal');
  const out = await cleanupImages(pics, offers, new Date(), lands);
  assert.deepEqual(out.deleted, []);
  assert.ok(has(id));
});

test('a picture used by nothing is removed after 24 hours, kept before', async () => {
  const old = pics.add(25);
  const fresh = pics.add(23);
  const r = await saveLanding(page());
  console.log('  landing save, unused 25 h and 23 h pictures ->', r.status, 'old there:', has(old), ' fresh there:', has(fresh));
  assert.equal(r.status, 201);
  assert.equal(has(old), false);
  assert.ok(has(fresh));
});

test('only the newest 20 saved landing versions count; a picture only in the 21st is not used', async () => {
  const pic = pics.add(48);
  for (let i = 1; i <= 25; i++) {
    const landings = i === 1 ? [{ id: 'x', image: { id: pic } }] : [{ id: 'x', image: null }];
    lands.m.set(`history/2026-11-11T12:00:00.000Z-${String(i).padStart(9, '0')}`, { v: JSON.stringify({ landings }), etag: 'h', meta: {} });
  }
  lands.m.set('all', { v: '[]', etag: 'a', meta: { seq: 26 } });
  const used = await usedImageIds(offers, lands);
  assert.equal(lands.gets.length, 20, 'reads exactly 20 landing versions');
  assert.equal(used.has(pic), false);
  // ... and the same picture in the 20th newest IS used
  lands.m.set('history/2026-11-11T12:00:00.000Z-000000006', { v: JSON.stringify({ landings: [{ id: 'x', image: { id: pic } }] }), etag: 'h', meta: {} });
  assert.ok((await usedImageIds(offers, lands)).has(pic));
  const out = await cleanupImages(pics, offers, new Date(), lands);
  assert.deepEqual(out.deleted, []);
});

/* ---------- every doubt deletes nothing ---------- */

test('landing store unreadable deletes nothing: store down, list down, a version unreadable, a version in an odd shape, "all" not a list', async () => {
  const a = pics.add(48), b = pics.add(48);
  const cases = [];

  cases.push(['store down', await cleanupImages(pics, offers, new Date(), down())]);

  await saveLanding(page());          // healthy save: removes a and b (unused, 48 h old)
  const a2 = pics.add(48), b2 = pics.add(48);
  await saveLanding({ ...storedLandings()[0], headline: 'Second' });   // makes a saved version
  assert.equal(has(a2) || has(b2), false, 'a healthy landing save does delete unused pictures');
  const c = pics.add(48), d = pics.add(48);

  lands.failList = true;
  cases.push(['history list down', await cleanupImages(pics, offers, new Date(), lands)]);
  lands.failList = false;

  lands.failGet = (k) => k.startsWith('history/');
  cases.push(['saved version unreadable', await cleanupImages(pics, offers, new Date(), lands)]);
  lands.failGet = null;

  const hk = [...lands.m.keys()].find((k) => k.startsWith('history/'));
  const good = lands.m.get(hk);
  lands.m.set(hk, { v: JSON.stringify({ landings: 'garbage' }), etag: 'x', meta: {} });
  cases.push(['saved version odd shape', await cleanupImages(pics, offers, new Date(), lands)]);
  lands.m.set(hk, { v: 'null', etag: 'x', meta: {} });
  cases.push(['saved version empty', await cleanupImages(pics, offers, new Date(), lands)]);
  lands.m.set(hk, good);

  const all = lands.m.get('all');
  lands.m.set('all', { ...all, v: JSON.stringify({ not: 'a list' }) });
  cases.push(['"all" not a list', await cleanupImages(pics, offers, new Date(), lands)]);
  lands.m.set('all', all);

  for (const [label, out] of cases) {
    console.log(`  ${label} ->`, JSON.stringify({ deleted: out.deleted.length, error: out.errors[0] }));
    assert.deepEqual(out.deleted, [], label);
    assert.match(out.errors[0], /^nothing deleted/, label);
  }
  assert.ok(has(c) && has(d), 'nothing deleted');
  assert.equal(has(a) || has(b), false, 'removed by the healthy landing save, not by a failed cleanup');

  // once the store reads again, the same call removes them
  const ok = await cleanupImages(pics, offers, new Date(), lands);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.deleted.sort(), [c, d].sort());
});

test('a landings store that is null or not a store deletes nothing', async () => {
  const old = pics.add(48);
  for (const [label, bad] of [['null', null], ['empty object', {}], ['a string', 'offer-landings'], ['a Date', new Date()]]) {
    const out = await cleanupImages(pics, offers, new Date(), bad);
    console.log(`  landings store ${label} ->`, JSON.stringify({ deleted: out.deleted.length, error: out.errors[0] }));
    assert.deepEqual(out.deleted, [], label);
    assert.match(out.errors[0], /nothing deleted: landings store missing or not a store/, label);
    await assert.rejects(usedImageIds(offers, bad), /landings store missing/);
  }
  assert.ok(has(old));
});

test('no usable "now" deletes nothing', async () => {
  const old = pics.add(48);
  for (const bad of [null, 'yesterday', new Date('nonsense')]) {
    const out = await cleanupImages(pics, offers, bad, lands);
    assert.deepEqual(out.deleted, []);
    assert.match(out.errors[0], /no usable time/);
  }
  assert.ok(has(old));
});

test('landings store left off: the 3.6 offers-only call is unchanged (kept until 4.6 passes the store)', async () => {
  const old = pics.add(48);
  const out = await cleanupImages(pics, offers, new Date());
  assert.deepEqual(out.deleted, [old]);
});

test('cleanup trouble never fails a landing save, and nothing is deleted', async () => {
  const old = pics.add(48);
  pics.failList = true;
  const a = await saveLanding(page());
  console.log('  picture list down ->', a.status, a.body.ok, '| log:', errors.find((e) => e.includes('picture cleanup')));
  assert.equal(a.status, 201);
  assert.equal(a.body.ok, true);
  assert.ok(has(old));
  assert.ok(errors.some((e) => e.includes('landings: picture cleanup')));
  pics.failList = false;

  offSt._setOffersStoreFactoryForTests(() => down());
  const b = await saveLanding(page({ name: 'Second', slug: 'second-page' }));
  assert.equal(b.status, 201, 'offers store down: the landing save still lands');
  assert.ok(has(old), 'offers unreadable: nothing deleted');
  assert.equal(storedLandings().length, 2);
});

test('proof: with the landing check removed, the landing-only picture is deleted', async () => {
  const libDir = new URL('../functions/lib/', import.meta.url).href;
  const sharedDir = new URL('../../shared/', import.meta.url).href;
  const src = await readFile(new URL('offer-images-cleanup.mjs', libDir), 'utf8');
  const check = 'if (landingsStore !== undefined) await addLandingIds(used, landingsStore);';
  assert.ok(src.includes(check), 'the cleanup module has the landing check');
  const stripped = src.replace(check, '')
    .replaceAll("from './", `from '${libDir}`)
    .replaceAll("from '../../../shared/", `from '${sharedDir}`);
  const broken = await import('data:text/javascript,' + encodeURIComponent(stripped));

  const { id } = await landingWithOldPicture();
  const out = await broken.cleanupImages(pics, offers, new Date(), lands);
  console.log('  landing check removed ->', JSON.stringify({ deleted: out.deleted.length, pictureThere: has(id) }));
  assert.deepEqual(out.deleted, [id], 'without the check the landing picture is lost');
  assert.equal(has(id), false);
});

test('an offer save through offers.mjs keeps a landing-only picture (Session 4.6)', async () => {
  const { id } = await landingWithOldPicture();
  const o = await saveOffer(offerDraft());
  assert.equal(o.status, 201);
  assert.ok(has(id), 'offers.mjs cleanup deleted a landing-only picture');
});

test('offers.mjs passes the landings store to cleanup (Session 4.6)', async () => {
  const src = await readFile(new URL('../functions/offers.mjs', import.meta.url), 'utf8');
  // Session 4.6: the 4.5 pattern ([^)]*) could not step over "imagesStore(deployContext)", so it
  // could never match the planned call. Checked as the literal call instead.
  assert.ok(src.includes('cleanupImages(imagesStore(deployContext), store, new Date(), landingsStore(deployContext))'),
    'offers.mjs does not pass the landings store');
});
