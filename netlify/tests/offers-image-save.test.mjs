// YAVD Offers Module: saving an offer with a picture (Session 3.5, contract 1.3.0)
// Run from the website folder:  node --test netlify/tests/offers-image-save.test.mjs
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
const { IMAGE_MESSAGES } = await import('../functions/lib/offer-image.mjs');
const offersFn = (await import('../functions/offers.mjs')).default;

/* ---------- in-memory offers store (JSON, ETags) ---------- */
function offerBlobs() {
  const m = new Map();
  let n = 0;
  return {
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
}

/* ---------- in-memory picture store (metadata only is enough here) ---------- */
function pictureBlobs({ down = false } = {}) {
  const m = new Map();
  const calls = [];
  const fail = async () => { throw new Error('blobs down: secret detail'); };
  return {
    m, calls,
    add(meta) {
      const id = imgStore.isImageId(meta.id) ? meta.id : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
      m.set(id, { type: meta.type ?? 'image/jpeg', bytes: meta.bytes ?? 54321, width: meta.width ?? 1200,
        height: meta.height ?? 800, uploadedAt: '2026-11-11T12:00:00.000Z' });
      return id;
    },
    getMetadata: down ? fail : async (k) => { calls.push(['getMetadata', k]); const e = m.get(k); return e ? { metadata: structuredClone(e) } : null; },
    getWithMetadata: fail, set: fail, list: fail, delete: fail
  };
}

let blobs, pics, authBlobs;
beforeEach(() => {
  blobs = offerBlobs();
  pics = pictureBlobs();
  authBlobs = offerBlobs();
  st._setOffersStoreFactoryForTests(() => blobs);
  imgStore._setImagesStoreFactoryForTests(() => pics);
  auth._setStoreFactoryForTests(() => ({ set: authBlobs.setJSON, list: authBlobs.list, delete: authBlobs.delete }));
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;
const save = async (body) => {
  const r = await offersFn(new Request(BASE + '/api/offers', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie() }, body: JSON.stringify(body) }), ctx);
  return { status: r.status, body: await r.json() };
};
const show = (label, r) => console.log(`  ${label} -> ${r.status} ${JSON.stringify(r.body.offer ? { image: r.body.offer.image, notes: r.body.notes } : r.body)}`);
const stored = () => JSON.parse(blobs.m.get('all')?.v ?? '[]');

function draft(over = {}) {
  return { ...C.emptyOffer(), id: undefined, name: 'Picture offer', page: '/booth-proof.html', audience: 'everyone',
    headline: 'Book 2027 now', body: 'Copy', startsAt: '2026-10-12T00:00:00-04:00',
    endsAt: '2026-12-31T23:59:00-05:00', draft: true, ...over };
}

/* ---------- add, replace, remove ---------- */

test('add: facts come from the picture store; forged width, height, type and size are ignored; key order is IMAGE_KEYS', async () => {
  const id = pics.add({ type: 'image/webp', bytes: 31000, width: 1600, height: 900 });
  const r = await save(draft({ image: { id, alt: 'Stage with LED wall', placement: 'left',
    width: 99999, height: 1, type: 'image/svg+xml', bytes: 1, uploadedAt: 'x', extra: 'dropped' } }));
  show('new offer with a picture and forged facts', r);
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.offer.image, { id, alt: 'Stage with LED wall', placement: 'left', width: 1600, height: 900, type: 'image/webp', bytes: 31000 });
  assert.deepEqual(Object.keys(r.body.offer.image), [...C.IMAGE_KEYS]);
  assert.deepEqual(stored()[0].image, r.body.offer.image, 'the stored offer holds the same object');
});

test('placement defaults to top; an unknown placement is refused', async () => {
  const id = pics.add({});
  const a = await save(draft({ image: { id, alt: 'Room' } }));
  assert.equal(a.body.offer.image.placement, C.IMAGE.defaultPlacement);
  const b = await save(draft({ name: 'Other', image: { id, alt: 'Room', placement: 'center' } }));
  show('placement "center"', b);
  assert.equal(b.status, 400);
  assert.equal(b.body.fields['image.placement'], 'Choose Top, Left or Right.');
});

test('replace: a new id takes the new picture\'s facts', async () => {
  const first = pics.add({ width: 1000, height: 500 });
  const second = pics.add({ width: 640, height: 640, type: 'image/png' });
  const a = (await save(draft({ image: { id: first, alt: 'One' } }))).body.offer;
  const r = await save({ ...a, image: { id: second, alt: 'Two', placement: 'right' } });
  show('replace picture', r);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.offer.image, { id: second, alt: 'Two', placement: 'right', width: 640, height: 640, type: 'image/png', bytes: 54321 });
});

test('remove: image null takes the picture off the offer and leaves the picture itself in storage', async () => {
  const id = pics.add({});
  const a = (await save(draft({ image: { id, alt: 'One' } }))).body.offer;
  const r = await save({ ...a, image: null });
  show('remove picture', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.offer.image, null);
  assert.equal(stored()[0].image, null);
  assert.ok(pics.m.has(id), 'cleanup (3.6) removes pictures, never the save');
});

test('change only alt, or only placement: same id reuses stored facts with no picture-store call', async () => {
  const id = pics.add({ width: 1200, height: 800 });
  let o = (await save(draft({ image: { id, alt: 'Old words', placement: 'top' } }))).body.offer;
  pics.calls.length = 0;
  pics.m.delete(id);   // even if the picture store forgot it, an unchanged picture needs no lookup
  let r = await save({ ...o, image: { ...o.image, alt: 'New words', width: 5 } });
  show('alt only', r);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.offer.image, { ...o.image, alt: 'New words' });
  o = r.body.offer;
  r = await save({ ...o, image: { id, alt: o.image.alt, placement: 'right' } });
  show('placement only', r);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.offer.image, { ...o.image, placement: 'right' });
  assert.deepEqual(pics.calls, [], 'no picture lookup for an unchanged picture');
});

test('an existing offer saved without an image key keeps its picture', async () => {
  const id = pics.add({});
  const o = (await save(draft({ image: { id, alt: 'Kept' } }))).body.offer;
  const { image, ...noImage } = o;
  const r = await save({ ...noImage, headline: 'Text only edit' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.offer.image, image);
});

/* ---------- alt text ---------- */

test('missing alt is refused, on a draft too, and nothing is written', async () => {
  const id = pics.add({});
  for (const alt of [undefined, '', '   ', '<b></b>']) {
    const r = await save(draft({ image: { id, alt } }));
    assert.equal(r.status, 400, `alt ${JSON.stringify(alt)}`);
    assert.equal(r.body.fields['image.alt'], IMAGE_MESSAGES.noAlt);
  }
  const s = await save(draft({ draft: false, image: { id } }));
  show('scheduled, no alt', s);
  assert.equal(s.body.fields['image.alt'], IMAGE_MESSAGES.noAlt);
  assert.equal(blobs.m.has('all'), false, 'nothing stored');
});

test('alt text: 125 characters accepted, 126 refused; non-text refused', async () => {
  const id = pics.add({});
  const ok = await save(draft({ image: { id, alt: 'a'.repeat(125) } }));
  assert.equal(ok.status, 201);
  const long = await save(draft({ name: 'Long', image: { id, alt: 'a'.repeat(126) } }));
  show('126-character alt', long);
  assert.equal(long.status, 400);
  assert.equal(long.body.fields['image.alt'], 'Keep it to 125 characters (now 126).');
  const num = await save(draft({ name: 'Num', image: { id, alt: 42 } }));
  assert.equal(num.body.fields['image.alt'], 'Must be text.');
});

test('HTML in alt is stripped, invisible characters dropped, with a note', async () => {
  const id = pics.add({});
  const r = await save(draft({ image: { id, alt: '<img src=x onerror=alert(1)>Stage <b>wide</b>‮ shot\n' } }));
  show('HTML in alt', r);
  assert.equal(r.status, 201);
  assert.equal(r.body.offer.image.alt, 'Stage wide shot');
  assert.ok(r.body.notes.some((n) => /image\.alt/.test(n)));
});

/* ---------- unknown, forged and broken ---------- */

test('an id the picture store does not have is refused with the "gone" message', async () => {
  const r = await save(draft({ image: { id: 'a'.repeat(32), alt: 'Ghost' } }));
  show('unknown picture id', r);
  assert.equal(r.status, 400);
  assert.equal(r.body.fields['image.id'], IMAGE_MESSAGES.gone);
  assert.equal(blobs.m.has('all'), false);
});

test('a badly shaped id or image value is refused without asking the picture store', async () => {
  for (const image of [{ id: '../offers/all', alt: 'x' }, { id: 'A'.repeat(32), alt: 'x' }, { alt: 'x' }, 'abc', ['x'], 7]) {
    const r = await save(draft({ image }));
    assert.equal(r.status, 400, JSON.stringify(image));
    assert.equal(r.body.fields['image.id'], IMAGE_MESSAGES.gone);
  }
  assert.deepEqual(pics.calls, []);
});

test('picture storage down: a new picture answers 503 and nothing is written; a text-only edit still saves', async () => {
  const id = pics.add({});
  const o = (await save(draft({ image: { id, alt: 'One' } }))).body.offer;
  const before = blobs.m.get('all').v;
  const down = pictureBlobs({ down: true });
  imgStore._setImagesStoreFactoryForTests(() => down);
  const r = await save({ ...o, image: { id: 'b'.repeat(32), alt: 'Two' } });
  show('new picture while storage is down', r);
  assert.equal(r.status, 503);
  assert.match(r.body.error, /nothing was saved/);
  assert.doesNotMatch(r.body.error, /secret/);
  assert.equal(blobs.m.get('all').v, before, 'offers unchanged');
  const t = await save({ ...o, headline: 'Still editable' });
  assert.equal(t.status, 200, 'same picture: no lookup, so the save goes through');

  imgStore._setImagesStoreFactoryForTests(() => { throw new Error('no blobs'); });
  const n = await save(draft({ name: 'New', image: { id: 'c'.repeat(32), alt: 'x' } }));
  assert.equal(n.status, 503);
});

/* ---------- old offers, rerun, history ---------- */

test('an offer saved before 1.3.0 (no image key) saves exactly as before, with image null', async () => {
  const old = { ...C.emptyOffer(), id: '11111111-2222-4333-8444-555555555555', name: 'Old offer', previewKey: 'k'.repeat(C.PREVIEW_KEY_LENGTH),
    page: '/booth-proof.html', headline: 'Old', createdAt: '2026-10-10T12:00:00.000Z', updatedAt: '2026-10-10T12:00:00.000Z' };
  delete old.image;
  await blobs.setJSON('all', [old], { metadata: { seq: 1 } });
  const r = await save({ ...old, headline: 'Old, edited' });
  show('edit an old offer', r);
  assert.equal(r.status, 200);
  assert.equal(r.body.offer.image, null);
  const { image, status, updatedAt, headline, ...rest } = r.body.offer;
  const { updatedAt: u0, headline: h0, ...oldRest } = old;
  assert.deepEqual(rest, oldRest, 'every other field unchanged');
  assert.deepEqual(pics.calls, []);
});

test('rerun: a new offer may point at the picture another offer uses', async () => {
  const id = pics.add({ width: 800, height: 600 });
  const a = (await save(draft({ image: { id, alt: '2026 stage' } }))).body.offer;
  const r = await save(draft({ name: 'Rerun', rerunOf: a.id, image: { ...a.image, alt: '2027 stage' } }));
  show('rerun carrying the picture', r);
  assert.equal(r.status, 201);
  assert.equal(r.body.offer.rerunOf, a.id);
  assert.equal(r.body.offer.image.id, id);
  assert.equal(r.body.offer.image.width, 800);
  assert.equal(stored().filter((o) => o.image?.id === id).length, 2);
});

test('history and restore carry the image object', async () => {
  const id = pics.add({});
  const a = (await save(draft({ image: { id, alt: 'Kept in history' } }))).body.offer;
  await save({ ...a, image: null });
  const [newest] = await st.listHistory(blobs);
  const h = await blobs.get(newest);
  assert.deepEqual(h.offers[0].image, a.image, 'saved version holds the picture');
  await st.restoreHistory(blobs, newest);
  assert.deepEqual(stored()[0].image, a.image, 'restored offer has its picture back');
});
