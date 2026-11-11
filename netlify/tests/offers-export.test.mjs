// YAVD Offers Module: export with pictures (Session 3.7, contract 1.3.0)
// Run from the website folder:  node --test netlify/tests/offers-export.test.mjs
// In-memory stand-ins for the offers and picture stores; never touches real
// storage. Helpers are copied, not imported from another *.test.mjs file.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const auth = await import('../functions/lib/offers-auth.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const exportMod = await import('../functions/offers-export.mjs');
const exportFn = exportMod.default;
const LIMIT = exportMod.EXPORT_MAX_BYTES;

/* ---------- in-memory offers store ---------- */
function offerBlobs() {
  const m = new Map();
  return {
    m,
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: JSON.parse(e), etag: '"e1"', metadata: { seq: 1 } } : null; },
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); return { modified: true }; },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}

/* ---------- in-memory picture store (bytes + metadata) ---------- */
function pictureBlobs({ down = false, opens = true } = {}) {
  const m = new Map();
  const calls = [];
  const fail = async () => { throw new Error('blobs down: secret detail'); };
  return {
    m, calls, opens,
    add(bytes, over = {}) {
      const id = over.id ?? [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      m.set(id, { bytes: new Uint8Array(bytes), meta: { type: 'image/webp', bytes: bytes.length, width: 1600,
        height: 900, uploadedAt: '2026-11-11T12:00:00.000Z', ...over.meta } });
      return id;
    },
    getMetadata: down ? fail : async (k) => { calls.push(['getMetadata', k]); const e = m.get(k); return e ? { metadata: structuredClone(e.meta) } : null; },
    getWithMetadata: down ? fail : async (k) => {
      calls.push(['getWithMetadata', k]);
      const e = m.get(k);
      return e ? { data: e.bytes.slice().buffer, metadata: structuredClone(e.meta) } : null;
    },
    set: fail, list: fail, delete: fail
  };
}

let blobs, pics, openedPictures;
beforeEach(() => {
  blobs = offerBlobs();
  pics = pictureBlobs();
  openedPictures = 0;
  st._setOffersStoreFactoryForTests(() => blobs);
  imgStore._setImagesStoreFactoryForTests(() => {
    openedPictures++;
    if (!pics.opens) throw new Error('cannot open');
    return pics;
  });
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
const show = (label, r) => console.log(`  ${label} -> ${r.status} ${r.name ?? ''} size=${r.size} images=${(r.body.images ?? []).length} omitted=${(r.body.imagesOmitted ?? []).length} missing=${JSON.stringify(r.body.imagesMissing ?? null)} note=${JSON.stringify(r.body.imagesNote ?? r.body.error)}`);

const bytesOf = (n, seed = 1) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed * 7) & 255; return b; };
let nextId = 0;
function offer(over = {}) {
  nextId++;
  return { id: `o${String(nextId).padStart(8, '0')}`, name: `Offer ${nextId}`, slug: null, page: '/booth-proof.html',
    audience: 'everyone', headline: 'Book now', body: 'Copy', startsAt: '2026-10-12T04:00:00.000Z',
    endsAt: '2026-12-31T04:59:00.000Z', draft: false, previewKey: 'k'.repeat(32), updatedAt: '2026-11-01T12:00:00.000Z', ...over };
}
const withImage = (id, over = {}) => offer({ image: { id, alt: 'Stage', placement: 'top', width: 1600, height: 900, type: 'image/webp', bytes: pics.m.get(id)?.meta.bytes ?? 1000 }, ...over });
const seed = (offers) => blobs.m.set('all', JSON.stringify(offers));

/* ---------- tests ---------- */

test('no pictures: same file as before plus empty picture fields; picture store never opened', async () => {
  const offers = [offer(), offer({ draft: true })];
  seed(offers);
  const r = await get();
  show('two offers, no pictures', r);
  assert.equal(r.status, 200);
  assert.match(r.name, /^yavd-offers-test-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.body.kind, 'yavd-offers-export');
  assert.equal(r.body.contract, '1.3.0');
  assert.equal(r.body.count, 2);
  assert.deepEqual(r.body.images, []);
  assert.deepEqual(r.body.imagesOmitted, []);
  assert.deepEqual(r.body.imagesMissing, []);
  assert.equal(r.body.imagesNote, '');
  assert.equal(openedPictures, 0);
});

test('old offers (saved before 1.3.0, no image key) come back exactly as stored', async () => {
  const offers = [offer(), offer({ slug: 'av-company', audience: 'link' })];
  for (const o of offers) assert.equal('image' in o, false);
  seed(offers);
  const r = await get();
  show('pre-1.3.0 offers', r);
  assert.deepEqual(r.body.offers, offers);
  assert.equal(r.text.endsWith('\n'), true);
});

test('one picture: round trip, decoded bytes equal the stored bytes; key order and facts from the store', async () => {
  const stored = bytesOf(54321, 3);
  const id = pics.add(stored, { meta: { type: 'image/jpeg', width: 1200, height: 800 } });
  seed([withImage(id), offer()]);
  const r = await get();
  show('one picture', r);
  assert.equal(r.body.images.length, 1);
  const img = r.body.images[0];
  assert.deepEqual(Object.keys(img), ['id', 'type', 'bytes', 'width', 'height', 'dataBase64']);
  assert.deepEqual({ ...img, dataBase64: undefined }, { id, type: 'image/jpeg', bytes: 54321, width: 1200, height: 800, dataBase64: undefined });
  const decoded = new Uint8Array(Buffer.from(img.dataBase64, 'base64'));
  assert.equal(decoded.length, stored.length);
  assert.deepEqual(decoded, stored);
  assert.deepEqual(r.body.imagesOmitted, []);
  assert.deepEqual(r.body.imagesMissing, []);
});

test('a picture used by two offers is in the file once', async () => {
  const id = pics.add(bytesOf(2000));
  const other = pics.add(bytesOf(3000, 2));
  seed([withImage(id), withImage(other), withImage(id, { name: 'Copy' })]);
  const r = await get();
  show('duplicate reference', r);
  assert.deepEqual(r.body.images.map((i) => i.id), [id, other]);
  assert.equal(pics.calls.filter(([k, x]) => k === 'getWithMetadata' && x === id).length, 1);
});

test('only current offers count: a stored picture nobody refers to is left out', async () => {
  const used = pics.add(bytesOf(1000));
  pics.add(bytesOf(1000, 9));
  seed([withImage(used)]);
  const r = await get();
  assert.deepEqual(r.body.images.map((i) => i.id), [used]);
});

test('eight 590 KB pictures: part 1 stays under 4.5 MB, the rest spill to part 2, together they hold all eight once', async () => {
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(pics.add(bytesOf(590 * 1024, i)));
  seed(ids.map((id) => withImage(id)));
  const p1 = await get();
  show('part 1', p1);
  assert.equal(p1.status, 200);
  assert.ok(p1.size <= LIMIT, `part 1 is ${p1.size} bytes`);
  assert.equal(p1.body.images.length, 5);
  assert.deepEqual(p1.body.imagesOmitted, ids.slice(5));
  assert.match(p1.body.imagesNote, /Download part 2/);
  assert.equal(p1.body.count, 8);

  const p2 = await get('?images=rest');
  show('part 2', p2);
  assert.equal(p2.status, 200);
  assert.match(p2.name, /^yavd-offers-test-images-\d{4}-\d\d-\d\d-\d{4}\.json$/);
  assert.equal(p2.body.kind, 'yavd-offers-export-images');
  assert.equal(p2.body.store, 'offer-images-test');
  assert.equal('offers' in p2.body, false);
  assert.equal(p2.body.part, 2);
  assert.equal(p2.body.parts, 2);
  assert.equal(p2.body.next, null);
  assert.ok(p2.size <= LIMIT);
  assert.deepEqual(p2.body.images.map((i) => i.id), p1.body.imagesOmitted);
  assert.deepEqual(p2.body.imagesOmitted, []);
  assert.equal(p2.body.imagesNote, '');

  const all = [...p1.body.images, ...p2.body.images];
  assert.deepEqual(all.map((i) => i.id), ids);
  for (const img of all) assert.deepEqual(new Uint8Array(Buffer.from(img.dataBase64, 'base64')), pics.m.get(img.id).bytes);
});

test('twenty 590 KB pictures: four parts, each under the limit, each naming the next', async () => {
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push(pics.add(bytesOf(590 * 1024, i)));
  seed(ids.map((id) => withImage(id)));
  const p1 = await get();
  const files = [p1];
  let next = p1.body.imagesOmitted.length ? '?images=rest' : null;
  while (next) {
    const r = await get(next);
    files.push(r);
    next = r.body.next ? r.body.next.replace('/api/offers/export', '') : null;
  }
  for (const f of files) show(`part ${f.body.part ?? 1}`, f);
  assert.equal(files.length, 4);
  assert.match(files[2].name, /-images-part3-/);
  for (const f of files) assert.ok(f.size <= LIMIT, `${f.name} is ${f.size}`);
  assert.deepEqual(files.flatMap((f) => f.body.images.map((i) => i.id)), ids);
  const after = await get('?images=rest&part=5');
  show('part 5 (past the end)', after);
  assert.equal(after.status, 200);
  assert.deepEqual(after.body.images, []);
  assert.match(after.body.imagesNote, /Nothing more to download/);
});

test('a picture that cannot be read is listed in imagesMissing and the export still succeeds', async () => {
  const good = pics.add(bytesOf(1000));
  const gone = 'a'.repeat(32);
  const broken = pics.add(bytesOf(1000, 4), { meta: { type: 'image/svg+xml' } });
  seed([withImage(gone), withImage(good), withImage(broken)]);
  const r = await get();
  show('missing pictures', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 3);
  assert.deepEqual(r.body.images.map((i) => i.id), [good]);
  assert.deepEqual(r.body.imagesMissing, [gone, broken]);
  assert.match(r.body.imagesNote, /2 pictures could not be read/);
});

test('picture store down or cannot open: offers still export, every picture listed as missing, no detail leaks', async () => {
  const id = pics.add(bytesOf(1000));
  seed([withImage(id)]);
  pics = pictureBlobs({ down: true });
  let r = await get();
  show('store down', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.count, 1);
  assert.deepEqual(r.body.imagesMissing, [id]);
  assert.doesNotMatch(r.text, /secret detail/);
  pics = pictureBlobs({ opens: false });
  r = await get();
  show('store cannot open', r);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.imagesMissing, [id]);
  r = await get('?images=rest');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.images, []);
});

test('live deploy names the files live and uses the live stores', async () => {
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(pics.add(bytesOf(590 * 1024, i)));
  seed(ids.map((id) => withImage(id)));
  const live = { deploy: { context: 'production' } };
  const p1 = await get('', { context: live });
  const p2 = await get('?images=rest', { context: live });
  show('live part 1', p1);
  show('live part 2', p2);
  assert.match(p1.name, /^yavd-offers-live-/);
  assert.match(p2.name, /^yavd-offers-live-images-/);
  assert.equal(p2.body.store, 'offer-images');
});

test('signed out: 401 for both files, nothing read', async () => {
  seed([withImage(pics.add(bytesOf(1000)))]);
  for (const q of ['', '?images=rest']) {
    const r = await get(q, { signedIn: false });
    show(`signed out ${q || '(main)'}`, r);
    assert.equal(r.status, 401);
  }
  assert.equal(pics.calls.length, 0);
});

test('bad query values are refused with a plain message', async () => {
  seed([]);
  for (const q of ['?images=all', '?images=rest&part=1', '?images=rest&part=x', '?images=rest&part=51', '?part=2']) {
    const r = await get(q);
    show(`query ${q}`, r);
    assert.equal(r.status, 400);
  }
});
