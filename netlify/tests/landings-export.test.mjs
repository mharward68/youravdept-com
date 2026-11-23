// YAVD Offers Module: export includes landing pages (Session 4.7, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landings-export.test.mjs
// In-memory stand-ins for the offers, landings and picture stores; never
// touches real storage. Helpers are copied, not imported from another
// *.test.mjs file.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const landStore = await import('../functions/lib/landings-store.mjs');
const exportMod = await import('../functions/offers-export.mjs');
const exportFn = exportMod.default;
const LIMIT = exportMod.EXPORT_MAX_BYTES;

/* ---------- in-memory JSON store (offers and landings) ---------- */
function jsonBlobs({ readFails = false } = {}) {
  const m = new Map();
  const calls = [];
  return {
    m, calls,
    async getWithMetadata(k) {
      calls.push(['getWithMetadata', k]);
      if (readFails) throw new Error('blobs down: secret detail');
      const e = m.get(k);
      return e ? { data: JSON.parse(e), etag: '"e1"', metadata: { seq: 1 } } : null;
    },
    async setJSON() { throw new Error('export must never write'); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete() { throw new Error('export must never delete'); }
  };
}

/* ---------- in-memory picture store (bytes + metadata) ---------- */
function pictureBlobs() {
  const m = new Map();
  const calls = [];
  const fail = async () => { throw new Error('export must never write pictures'); };
  return {
    m, calls,
    add(bytes, over = {}) {
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      m.set(id, { bytes: new Uint8Array(bytes), meta: { type: 'image/webp', bytes: bytes.length, width: 1600,
        height: 900, uploadedAt: '2026-11-11T12:00:00.000Z', ...over.meta } });
      return id;
    },
    getMetadata: async (k) => { calls.push(['getMetadata', k]); const e = m.get(k); return e ? { metadata: structuredClone(e.meta) } : null; },
    getWithMetadata: async (k) => {
      calls.push(['getWithMetadata', k]);
      const e = m.get(k);
      return e ? { data: e.bytes.slice().buffer, metadata: structuredClone(e.meta) } : null;
    },
    set: fail, list: fail, delete: fail
  };
}

let offerStore, landStoreMem, pics, landingsOpen;
beforeEach(() => {
  offerStore = jsonBlobs();
  landStoreMem = jsonBlobs();
  pics = pictureBlobs();
  landingsOpen = true;
  st._setOffersStoreFactoryForTests(() => offerStore);
  landStore._setLandingsStoreFactoryForTests(() => {
    if (!landingsOpen) throw new Error('cannot open: secret detail');
    return landStoreMem;
  });
  imgStore._setImagesStoreFactoryForTests(() => pics);
  auth._setStoreFactoryForTests(() => ({ set: async () => ({ modified: true }), list: async () => ({ blobs: [] }), delete: async () => {} }));
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;
async function get(query = '', { signedIn = true, context = ctx } = {}) {
  const headers = signedIn ? { cookie: cookie() } : {};
  const r = await exportFn(new Request(`${BASE}/api/offers/export${query}`, { headers }), context);
  const text = await r.text();
  const name = r.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? null;
  return { status: r.status, text, size: Buffer.byteLength(text), body: JSON.parse(text), name, headers: r.headers };
}
const show = (label, r) => console.log(`  ${label} -> ${r.status} ${r.name ?? ''} size=${r.size} offers=${r.body.count ?? '-'} landings=${r.body.landingsCount ?? '-'} images=${(r.body.images ?? []).length} omitted=${(r.body.imagesOmitted ?? []).length} landingsMissing=${r.body.landingsMissing} note=${JSON.stringify(r.body.imagesNote ?? r.body.error)}`);

const bytesOf = (n, seed = 1) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };
const picture = (id) => ({ id, alt: 'Stage', placement: 'top', width: 1600, height: 900, type: 'image/webp', bytes: pics.m.get(id)?.meta.bytes ?? 1000 });
let nextId = 0;
function offer(over = {}) {
  nextId++;
  return { id: `o${String(nextId).padStart(8, '0')}`, name: `Offer ${nextId}`, slug: null, page: '/booth-proof.html',
    audience: 'everyone', headline: 'Book now', body: 'Copy', startsAt: '2026-10-12T04:00:00.000Z',
    endsAt: '2026-12-31T04:59:00.000Z', draft: false, previewKey: 'k'.repeat(32), landing: null,
    updatedAt: '2026-11-01T12:00:00.000Z', ...over };
}
function landing(over = {}) {
  nextId++;
  const rec = { id: `l${String(nextId).padStart(8, '0')}`, name: `Landing ${nextId}`, slug: `page-${nextId}`,
    eyebrow: 'For planners', headline: 'Stage that works', body: 'Landing copy', image: null,
    ctaLabel: 'Book a call', ctaUrl: 'https://calendar.app.google/x', status: 'live', previewKey: 'p'.repeat(32),
    createdAt: '2026-11-20T12:00:00.000Z', updatedAt: '2026-11-21T12:00:00.000Z', archivedAt: null, ...over };
  assert.deepEqual(Object.keys(rec), C.LANDING_KEYS);   // same shape as the contract
  return rec;
}
const seedOffers = (list) => offerStore.m.set('all', JSON.stringify(list));
const seedLandings = (list) => landStoreMem.m.set('all', JSON.stringify(list));

/* ---------- tests ---------- */

test('export holds offers and landing pages, records exactly as stored, preview keys included; landing pictures after offer pictures', async () => {
  const offerPic = pics.add(bytesOf(3000, 1));
  const landPic = pics.add(bytesOf(4000, 2));
  const offers = [offer({ image: picture(offerPic) }), offer({ draft: true })];
  const landings = [
    landing({ image: picture(landPic) }),
    landing({ status: 'draft' }),
    landing({ status: 'archived', archivedAt: '2026-11-22T12:00:00.000Z' })
  ];
  seedOffers(offers);
  seedLandings(landings);
  const r = await get();
  show('offers and landings', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.kind, 'yavd-offers-export');
  assert.equal(r.body.contract, '1.4.0');
  assert.deepEqual(r.body.offers, offers);
  assert.deepEqual(r.body.landings, landings);
  assert.equal(r.body.landingsCount, 3);
  assert.equal(r.body.landingsStore, 'offer-landings-test');
  assert.equal(r.body.landingsMissing, false);
  assert.equal(r.body.landingsNote, '');
  assert.equal(r.body.landings[1].previewKey, 'p'.repeat(32));
  assert.deepEqual(r.body.images.map((i) => i.id), [offerPic, landPic]);
  const decoded = new Uint8Array(Buffer.from(r.body.images[1].dataBase64, 'base64'));
  assert.deepEqual(decoded, pics.m.get(landPic).bytes);
  assert.deepEqual(r.body.imagesOmitted, []);
  assert.deepEqual(r.body.imagesMissing, []);
  assert.equal(r.body.imagesNote, '');
  // key order: landing keys sit between the offers and the pictures
  const keys = Object.keys(r.body);
  assert.ok(keys.indexOf('offers') < keys.indexOf('landings') && keys.indexOf('landings') < keys.indexOf('images'));
  // the landing store was only read, the "all" key once
  assert.deepEqual(landStoreMem.calls, [['getWithMetadata', 'all']]);
});

test('a picture shared by an offer and a landing page is in the file once and read once', async () => {
  const shared = pics.add(bytesOf(5000, 3));
  const onlyLanding = pics.add(bytesOf(2000, 4));
  seedOffers([offer({ image: picture(shared) })]);
  seedLandings([landing({ image: picture(onlyLanding) }), landing({ image: picture(shared) }), landing({ image: picture(onlyLanding) })]);
  const r = await get();
  show('shared picture', r);
  assert.deepEqual(r.body.images.map((i) => i.id), [shared, onlyLanding]);
  assert.equal(pics.calls.filter(([k, x]) => k === 'getWithMetadata' && x === shared).length, 1);
  assert.equal(pics.calls.filter(([k, x]) => k === 'getWithMetadata' && x === onlyLanding).length, 1);
});

test('no offers, only a landing page with a picture: the picture is exported', async () => {
  const id = pics.add(bytesOf(1500, 5));
  seedOffers([]);
  seedLandings([landing({ image: picture(id) })]);
  const r = await get();
  show('landing only', r);
  assert.equal(r.body.count, 0);
  assert.deepEqual(r.body.images.map((i) => i.id), [id]);
});

test('eight 590 KB pictures (four offers, four landings): landing pictures push past the limit, parts split, all eight once in order', async () => {
  const offerIds = [];
  const landIds = [];
  for (let i = 0; i < 4; i++) offerIds.push(pics.add(bytesOf(590 * 1024, i)));
  for (let i = 0; i < 4; i++) landIds.push(pics.add(bytesOf(590 * 1024, 10 + i)));
  seedOffers(offerIds.map((id) => offer({ image: picture(id) })));
  seedLandings(landIds.map((id) => landing({ image: picture(id) })));
  const p1 = await get();
  show('part 1', p1);
  assert.equal(p1.status, 200);
  assert.ok(p1.size <= LIMIT, `part 1 is ${p1.size} bytes`);
  assert.equal(p1.body.images.length, 5);
  assert.deepEqual(p1.body.images.map((i) => i.id), [...offerIds, landIds[0]]);
  assert.deepEqual(p1.body.imagesOmitted, landIds.slice(1));
  assert.match(p1.body.imagesNote, /Download part 2/);
  assert.equal(p1.body.landingsCount, 4);

  const p2 = await get('?images=rest');
  show('part 2', p2);
  assert.equal(p2.status, 200);
  assert.ok(p2.size <= LIMIT, `part 2 is ${p2.size} bytes`);
  assert.equal(p2.body.kind, 'yavd-offers-export-images');
  assert.equal('landings' in p2.body, false);
  assert.equal(p2.body.landingsMissing, false);
  assert.equal(p2.body.parts, 2);
  assert.equal(p2.body.next, null);
  assert.deepEqual(p2.body.images.map((i) => i.id), landIds.slice(1));

  const all = [...p1.body.images, ...p2.body.images];
  assert.deepEqual(all.map((i) => i.id), [...offerIds, ...landIds]);
  for (const img of all) assert.deepEqual(new Uint8Array(Buffer.from(img.dataBase64, 'base64')), pics.m.get(img.id).bytes);
});

test('many large landing records still keep part 1 under the limit (the records count towards part 1)', async () => {
  const ids = [];
  for (let i = 0; i < 7; i++) ids.push(pics.add(bytesOf(590 * 1024, 20 + i)));
  const long = 'Sound, light and video that just works. '.repeat(100);   // about 4 KB each
  const landings = [];
  for (let i = 0; i < 60; i++) landings.push(landing({ body: long, image: i < 7 ? picture(ids[i]) : null }));
  seedOffers([]);
  seedLandings(landings);
  const p1 = await get();
  show('60 large landings, part 1', p1);
  assert.ok(p1.size > 240 * 1024, 'the records really are large');
  assert.ok(p1.size <= LIMIT, `part 1 is ${p1.size} bytes`);
  const p2 = await get('?images=rest');
  show('60 large landings, part 2', p2);
  assert.ok(p2.size <= LIMIT);
  assert.deepEqual([...p1.body.images, ...p2.body.images].map((i) => i.id), ids);
  assert.equal(p1.body.images.length < 7, true, 'the records pushed at least one picture to part 2');
});

test('landing store unreadable: offers and their pictures still export, landingsMissing true, plain note, no detail leaks', async () => {
  const id = pics.add(bytesOf(1000, 6));
  const offers = [offer({ image: picture(id) })];
  seedOffers(offers);
  landStoreMem = jsonBlobs({ readFails: true });
  let r = await get();
  show('landing read fails', r);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.offers, offers);
  assert.deepEqual(r.body.images.map((i) => i.id), [id]);
  assert.deepEqual(r.body.landings, []);
  assert.equal(r.body.landingsCount, 0);
  assert.equal(r.body.landingsMissing, true);
  assert.equal(r.body.landingsNote, exportMod.LANDINGS_MISSING_NOTE);
  assert.match(r.body.landingsNote, /landing pages could not be read/);
  assert.equal(r.body.imagesNote, exportMod.LANDINGS_MISSING_NOTE);   // the admin page shows imagesNote
  assert.doesNotMatch(r.text, /secret detail/);

  landingsOpen = false;
  r = await get();
  show('landing store cannot open', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.equal(r.body.landingsMissing, true);
  assert.doesNotMatch(r.text, /secret detail/);

  r = await get('?images=rest');
  show('part 2 while landings unreadable', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.landingsMissing, true);
  assert.match(r.body.imagesNote, /landing pages could not be read/);
});

test('landing store holding something that is not a list: offers still export, landingsMissing true', async () => {
  seedOffers([offer()]);
  landStoreMem.m.set('all', JSON.stringify({ not: 'a list' }));
  const r = await get();
  show('landing store wrong format', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.equal(r.body.landingsMissing, true);
  assert.deepEqual(r.body.landings, []);
});

test('the note sits after the pictures note when both apply', async () => {
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(pics.add(bytesOf(590 * 1024, 30 + i)));
  seedOffers(ids.map((id) => offer({ image: picture(id) })));
  landStoreMem = jsonBlobs({ readFails: true });
  const r = await get();
  show('both notes', r);
  assert.ok(r.size <= LIMIT);
  assert.match(r.body.imagesNote, /^Some pictures did not fit in this file\. Download part 2 as well to keep every picture\. The landing pages could not be read/);
});

test('live deploy reads the live landing store and names it', async () => {
  seedOffers([]);
  seedLandings([landing()]);
  const r = await get('', { context: { deploy: { context: 'production' } } });
  show('live', r);
  assert.equal(r.body.landingsStore, 'offer-landings');
  assert.equal(r.body.landingsCount, 1);
});

test('signed out: 401 and the landing store is never read', async () => {
  seedLandings([landing()]);
  const r = await get('', { signedIn: false });
  show('signed out', r);
  assert.equal(r.status, 401);
  assert.equal(landStoreMem.calls.length, 0);
});
