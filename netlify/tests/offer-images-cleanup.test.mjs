// YAVD Offers Module: automatic picture cleanup (Session 3.6, contract 1.3.0)
// Run from the website folder:  node --test netlify/tests/offer-images-cleanup.test.mjs
// In-memory stand-ins for both Blobs stores (offers and pictures); never touches
// real storage. Helpers are copied, not imported from another *.test.mjs file.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const { cleanupImages, usedImageIds } = await import('../functions/lib/offer-images-cleanup.mjs');
const offersFn = (await import('../functions/offers.mjs')).default;
const deleteFn = (await import('../functions/offers-delete.mjs')).default;
const restoreFn = (await import('../functions/offers-restore.mjs')).default;

const HOUR = 60 * 60 * 1000;

/* ---------- in-memory offers store (JSON, ETags) ---------- */
function offerBlobs() {
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

/* ---------- in-memory picture store (bytes plus metadata) ---------- */
function pictureBlobs() {
  const m = new Map();
  const s = {
    m, deletes: [], failList: false, failMeta: null, failDelete: false,
    add(ageHours, over = {}) {
      const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const uploadedAt = new Date(Date.now() - ageHours * HOUR).toISOString();
      m.set(id, { b: new Uint8Array(1000).fill(7), meta: { type: 'image/jpeg', bytes: 1000, width: 800, height: 600, uploadedAt, ...over } });
      return id;
    },
    async set(k, b, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, { b, meta: o.metadata }); return { modified: true }; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: e.b.buffer, metadata: structuredClone(e.meta) } : null; },
    async getMetadata(k) {
      if (s.failMeta && s.failMeta(k)) throw new Error('metadata read failed');
      const e = m.get(k); return e ? { metadata: structuredClone(e.meta) } : null;
    },
    async list() { if (s.failList) throw new Error('blobs down'); return { blobs: [...m.keys()].map((key) => ({ key })) }; },
    async delete(k) { if (s.failDelete) throw new Error('delete failed'); s.deletes.push(k); m.delete(k); }
  };
  return s;
}

let blobs, pics, authBlobs, picsFactory, errors;
const origError = console.error;
beforeEach(() => {
  blobs = offerBlobs();
  pics = pictureBlobs();
  authBlobs = offerBlobs();
  picsFactory = () => pics;
  errors = [];
  console.error = (...a) => { errors.push(a.join(' ')); };
  st._setOffersStoreFactoryForTests(() => blobs);
  imgStore._setImagesStoreFactoryForTests((c) => picsFactory(c));
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
const save = (body) => call(offersFn, '/api/offers', body);
const has = (id) => pics.m.has(id);
const stored = () => JSON.parse(blobs.m.get('all')?.v ?? '[]');

function draft(over = {}) {
  return { ...C.emptyOffer(), id: undefined, name: 'Picture offer', page: '/booth-proof.html', audience: 'everyone',
    headline: 'Book 2027 now', body: 'Copy', startsAt: '2026-10-12T00:00:00-04:00',
    endsAt: '2026-12-31T23:59:00-05:00', draft: true, ...over };
}
const withPic = (id, over = {}) => draft({ image: { id, alt: 'Stage with LED wall' }, ...over });

/* ---------- the rules ---------- */

test('a picture used by a current offer is kept, however old', async () => {
  const id = pics.add(500);
  const r = await save(withPic(id));
  assert.equal(r.status, 201);
  const out = await cleanupImages(pics, blobs, new Date());
  console.log('  used by current offer ->', JSON.stringify({ kept: out.kept.length, deleted: out.deleted.length, errors: out.errors }));
  assert.ok(has(id));
  assert.deepEqual(out.deleted, []);
  assert.deepEqual(out.kept, [id]);
});

test('a picture used only by a saved version is kept', async () => {
  const id = pics.add(500);
  const a = (await save(withPic(id))).body.offer;
  const b = await save({ ...a, image: null });
  assert.equal(b.status, 200);
  assert.equal(stored()[0].image, null, 'no current offer uses it');
  assert.ok(has(id), 'kept by the saved version from before the removal');
  const used = await usedImageIds(blobs);
  assert.ok(used.has(id));
});

test('an unused picture older than 24 hours is deleted on the next save', async () => {
  const old = pics.add(25);
  const r = await save(draft());
  console.log('  save with an unused 25 h old picture ->', r.status, 'picture still there:', has(old));
  assert.equal(r.status, 201);
  assert.equal(has(old), false);
  assert.deepEqual(pics.deletes, [old]);
});

test('an unused picture 23 hours old is kept (grace period)', async () => {
  const fresh = pics.add(23);
  const r = await save(draft());
  console.log('  save with an unused 23 h old picture ->', r.status, 'picture still there:', has(fresh));
  assert.equal(r.status, 201);
  assert.ok(has(fresh));
  assert.deepEqual(pics.deletes, []);
});

test('grace boundary uses the "now" passed in: 24 h kept, 24 h + 1 ms deleted', async () => {
  const id = pics.add(0);
  const up = Date.parse(pics.m.get(id).meta.uploadedAt);
  let out = await cleanupImages(pics, blobs, new Date(up + 24 * HOUR));
  assert.deepEqual(out.deleted, []);
  out = await cleanupImages(pics, blobs, new Date(up + 24 * HOUR + 1));
  assert.deepEqual(out.deleted, [id]);
});

test('a picture with no usable upload time, or one in the future, is kept', async () => {
  const noTime = pics.add(100, { uploadedAt: 'not a date' });
  const future = pics.add(-48);
  const badMeta = pics.add(100, { type: 'image/svg+xml' });
  const out = await cleanupImages(pics, blobs, new Date());
  assert.deepEqual(out.deleted, []);
  for (const id of [noTime, future, badMeta]) assert.ok(has(id));
});

/* ---------- replace, versions, delete and restore ---------- */

test('replace: the old picture stays while a saved version refers to it, and goes when the 21st version drops out', async () => {
  const first = pics.add(48);
  let o = (await save(withPic(first))).body.offer;
  const second = pics.add(48);      // added after that save, or the save would have cleaned it up as unused
  o = (await save({ ...o, image: { id: second, alt: 'Two' } })).body.offer;
  assert.equal(o.image.id, second);
  assert.ok(has(first), 'kept right after the replace (the version before it holds it)');
  for (let k = 1; k <= 19; k++) o = (await save({ ...o, headline: `Edit ${k}` })).body.offer;
  assert.ok(has(first), 'still kept after 19 more saves: the replace version is the 20th');
  o = (await save({ ...o, headline: 'Edit 20' })).body.offer;
  console.log('  after 20 more saves: old picture there:', has(first), ' current picture there:', has(second),
    ' saved versions:', [...blobs.m.keys()].filter((k) => k.startsWith('history/')).length);
  assert.equal(has(first), false, 'deleted once its only version is the 21st');
  assert.ok(has(second));
  assert.equal(o.image.id, second);
});

test('only the newest 20 saved versions are read; a picture only in the 21st is not counted as used', async () => {
  const pic = pics.add(48);
  for (let i = 1; i <= 25; i++) {
    const offers = i === 1 ? [{ id: 'x', image: { id: pic } }] : [{ id: 'x', image: null }];
    blobs.m.set(`history/2026-11-11T12:00:00.000Z-${String(i).padStart(9, '0')}`, { v: JSON.stringify({ offers }), etag: 'h', meta: {} });
  }
  blobs.m.set('all', { v: '[]', etag: 'a', meta: { seq: 26 } });
  const used = await usedImageIds(blobs);
  assert.equal(blobs.gets.length, 20, 'reads exactly 20 versions');
  assert.equal(used.has(pic), false);
  const out = await cleanupImages(pics, blobs, new Date());
  assert.deepEqual(out.deleted, [pic]);
});

test('delete a draft with a picture, save something else, restore it: the picture is still there', async () => {
  const id = pics.add(48);
  const o = (await save(withPic(id))).body.offer;
  const del = await call(deleteFn, '/api/offers/delete', { id: o.id });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(stored().length, 0);
  assert.ok(has(id), 'delete does not run cleanup');
  const other = await save(draft({ name: 'Another offer' }));
  assert.equal(other.status, 201);
  assert.ok(has(id), 'cleanup after the next save keeps it: the saved version from before the delete holds it');
  const key = [...blobs.m.keys()].filter((k) => k.startsWith('history/'))
    .find((k) => JSON.parse(blobs.m.get(k).v).offers.some((x) => x.id === o.id));
  const res = await call(restoreFn, '/api/offers/restore', { key });
  console.log('  restore ->', res.status, 'offer back with picture:', stored().find((x) => x.id === o.id)?.image?.id === id, ' picture there:', has(id));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(stored().find((x) => x.id === o.id).image.id, id);
  assert.ok(has(id));
});

test('delete and restore do not run cleanup', async () => {
  const a = (await save(draft({ name: 'One' }))).body.offer;
  const id2 = pics.add(48);           // old and unused: the next save would remove it
  await call(deleteFn, '/api/offers/delete', { id: a.id });
  assert.ok(has(id2), 'delete left it');
  const key = [...blobs.m.keys()].find((k) => k.startsWith('history/'));
  const res = await call(restoreFn, '/api/offers/restore', { key });
  assert.equal(res.status, 200);
  assert.ok(has(id2), 'restore left it');
});

/* ---------- failures delete nothing and never fail a save ---------- */

test('cleanup throwing does not fail the save: picture list down, picture store cannot open', async () => {
  const old = pics.add(48);
  pics.failList = true;
  const a = await save(draft());
  console.log('  picture list down ->', a.status, a.body.ok, '| log:', errors.find((e) => e.includes('cleanup')));
  assert.equal(a.status, 201);
  assert.equal(a.body.ok, true);
  assert.ok(has(old));
  assert.ok(errors.some((e) => e.includes('picture cleanup')));

  picsFactory = () => { throw new Error('cannot open'); };
  const b = await save(draft({ name: 'Second' }));
  console.log('  picture store cannot open ->', b.status, b.body.ok);
  assert.equal(b.status, 201);
  assert.equal(stored().length, 2, 'both saves landed');
});

test('cleanup failing on delete does not fail the save', async () => {
  const old = pics.add(48);
  pics.failDelete = true;
  const r = await save(draft());
  assert.equal(r.status, 201);
  assert.ok(has(old));
  assert.ok(errors.some((e) => e.includes('delete failed')));
});

test('unreadable history means nothing is deleted', async () => {
  const old = pics.add(48);
  await save(draft());               // removes the first old picture, makes a first offer
  assert.equal(has(old), false);
  const a = pics.add(48), b = pics.add(48);
  blobs.failGet = (k) => k.startsWith('history/');
  const r = await save(draft({ name: 'Two' }));
  assert.equal(r.status, 201, 'the save still lands');
  assert.ok(has(a) && has(b), 'nothing deleted');
  blobs.failGet = null;

  // a saved version that is not in the expected shape counts as unreadable too
  const hk = [...blobs.m.keys()].find((k) => k.startsWith('history/'));
  blobs.m.set(hk, { v: JSON.stringify({ offers: 'garbage' }), etag: 'x', meta: {} });
  const out = await cleanupImages(pics, blobs, new Date());
  console.log('  bad saved version ->', JSON.stringify({ deleted: out.deleted.length, errors: out.errors }));
  assert.deepEqual(out.deleted, []);
  assert.match(out.errors[0], /nothing deleted/);

  blobs.failList = true;
  const out2 = await cleanupImages(pics, blobs, new Date());
  assert.deepEqual(out2.deleted, []);
  assert.ok(has(a) && has(b));
});

test('one unreadable picture detail stops every delete', async () => {
  const a = pics.add(48), b = pics.add(48), c = pics.add(48);
  pics.failMeta = (k) => k === [a, b, c].sort()[1];
  const out = await cleanupImages(pics, blobs, new Date());
  assert.deepEqual(out.deleted, []);
  assert.ok(has(a) && has(b) && has(c));
  assert.match(out.errors[0], /details unreadable/);
});

test('a text-only save with an old unused picture around still removes it; offers saved before 1.3.0 (no image key) are fine', async () => {
  blobs.m.set('all', { v: JSON.stringify([{ id: 'legacy', name: 'Old' }]), etag: 'l', meta: { seq: 1 } });
  const old = pics.add(30);
  const r = await save(draft({ name: 'New' }));
  assert.equal(r.status, 201);
  assert.equal(has(old), false);
  assert.equal(stored().length, 2);
});
