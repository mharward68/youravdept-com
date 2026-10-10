// YAVD Offers Module: rules and saving tests (Session 1.4)
// Run from the website folder:  node --test netlify/tests/offers-rules.test.mjs
// Uses in-memory stand-ins for Netlify Blobs; never touches real storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const rules = await import('../functions/lib/offers-rules.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const offersFn = (await import('../functions/offers.mjs')).default;
const deleteFn = (await import('../functions/offers-delete.mjs')).default;
const exportFn = (await import('../functions/offers-export.mjs')).default;
const pagesMod = await import('../functions/offers-pages.mjs');
const restoreFn = (await import('../functions/offers-restore.mjs')).default;

/* ---------- in-memory Blobs with ETags ---------- */
export function memoryBlobs() {
  const m = new Map();
  let n = 0;
  const s = {
    m,
    beforeWrite: null,            // test hook: runs just before a write lands
    failHistory: false,
    async get(k) { const e = m.get(k); return e ? JSON.parse(e.v) : null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: e.meta || {} } : null; },
    async setJSON(k, v, o = {}) {
      if (s.failHistory && k.startsWith('history/')) throw new Error('blobs down');
      if (s.beforeWrite && k === 'all') { const f = s.beforeWrite; s.beforeWrite = null; await f(); }
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: JSON.stringify(v), etag, meta: o.metadata || {} });
      return { modified: true, etag };
    },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })) }; },
    async delete(k) { m.delete(k); }
  };
  return s;
}

let blobs, authBlobs;
beforeEach(() => {
  blobs = memoryBlobs();
  authBlobs = memoryBlobs();
  st._setOffersStoreFactoryForTests(() => blobs);
  auth._setStoreFactoryForTests(() => ({
    set: authBlobs.setJSON, list: authBlobs.list, delete: authBlobs.delete
  }));
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;
const post = (fn, path, body, extra = {}) => fn(new Request(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(), ...extra }, body: JSON.stringify(body) }), ctx);
const get = (fn, path) => fn(new Request(BASE + path, { headers: { cookie: cookie() } }), ctx);
const show = (label, status, body) => console.log(`  ${label} -> ${status} ${JSON.stringify(body)}`);

function everyone(over = {}) {
  return { ...C.emptyOffer(), id: undefined, name: '2027 offer for everyone', page: '/booth-proof', audience: 'everyone',
    headline: 'Book 2027 now', body: 'Line one\nLine two', startsAt: '2026-10-12T00:00:00-04:00',
    endsAt: '2026-12-31T23:59:00-05:00', draft: false, ...over };
}
function link(over = {}) {
  return everyone({ name: 'Industry group offer', audience: 'link', slug: 'group-2026', ...over });
}

/* ---------- rules ---------- */

test('two Everyone offers on one page at overlapping times: second save refused (409) with a plain message', async () => {
  const a = await post(offersFn, '/api/offers', everyone());
  const ab = await a.json();
  show('first Everyone offer on /booth-proof', a.status, { created: ab.created, status: ab.offer?.status, page: ab.offer?.page });
  assert.equal(a.status, 201);
  const b = await post(offersFn, '/api/offers', everyone({ name: 'Second everyone offer', page: '/booth-proof.html',
    startsAt: '2026-12-01T00:00:00-05:00', endsAt: '2027-01-15T23:59:00-05:00' }));
  const bb = await b.json();
  show('second Everyone offer, same page, overlapping', b.status, bb);
  assert.equal(b.status, 409);
  assert.match(bb.error, /already has an Everyone offer, "2027 offer for everyone"/);
  const list = await (await get(offersFn, '/api/offers')).json();
  assert.equal(list.offers.length, 1, 'refused offer was not stored');
});

test('Everyone offers on the same page with dates that do not overlap are allowed', async () => {
  await post(offersFn, '/api/offers', everyone());
  const r = await post(offersFn, '/api/offers', everyone({ name: 'Early 2027', startsAt: '2027-01-01T00:00:00-05:00', endsAt: '2027-02-01T23:59:00-05:00' }));
  show('second Everyone offer, same page, later dates', r.status, { created: (await r.json()).created });
  assert.equal(r.status, 201);
});

test('a draft never clashes; scheduling it does', async () => {
  await post(offersFn, '/api/offers', everyone());
  const d = await post(offersFn, '/api/offers', everyone({ name: 'Draft on same page', draft: true }));
  const db = await d.json();
  show('overlapping Everyone offer saved as draft', d.status, { status: db.offer.status });
  assert.equal(d.status, 201);
  const s = await post(offersFn, '/api/offers', { ...db.offer, draft: false });
  show('same draft, now scheduled', s.status, await s.json());
  assert.equal(s.status, 409);
});

test('link offers may overlap Everyone offers and each other; a link name is one offer at a time', async () => {
  await post(offersFn, '/api/offers', everyone());
  const l1 = await post(offersFn, '/api/offers', link());
  const l2 = await post(offersFn, '/api/offers', link({ name: 'AV company offer', slug: 'av-company', endsAt: '2026-11-30T23:59:00-05:00' }));
  show('link offer over the Everyone offer', l1.status, {});
  show('second link offer, same page and dates', l2.status, {});
  assert.deepEqual([l1.status, l2.status], [201, 201]);
  const dup = await post(offersFn, '/api/offers', link({ name: 'Same link name', startsAt: '2026-11-01T00:00:00-04:00' }));
  const dupB = await dup.json();
  show('reused link name, overlapping dates', dup.status, dupB);
  assert.equal(dup.status, 409);
  assert.equal(Object.keys(dupB.fields)[0], 'slug');
  const later = await post(offersFn, '/api/offers', link({ name: 'Rerun next year', startsAt: '2027-01-01T00:00:00-05:00', endsAt: '2027-03-01T23:59:00-05:00' }));
  show('reused link name, later dates (a rerun)', later.status, {});
  assert.equal(later.status, 201);
});

test('every field is checked; messages name the field', async () => {
  const r = await post(offersFn, '/api/offers', {
    ...everyone(), name: '', audience: 'link', slug: 'Bad Slug!', page: 'javascript:alert(1)',
    startsAt: 'tomorrow', endsAt: '2026-01-01T00:00:00Z', buttonUrl: 'javascript:alert(1)',
    form: { enabled: true, fields: ['name', 'guide', 'option_choice', 'extra_1'], required: ['phone'], optionChoices: [], extraLabels: {} }
  });
  const b = await r.json();
  show('bad input', r.status, b);
  assert.equal(r.status, 400);
  for (const k of ['name', 'slug', 'page', 'startsAt', 'buttonUrl', 'form.fields', 'form.required', 'form.optionChoices', 'form.extraLabels.extra_1']) {
    assert.ok(b.fields[k], `message for ${k}`);
  }
  const r2 = await post(offersFn, '/api/offers', everyone({ startsAt: '2026-12-01T00:00:00-05:00', endsAt: '2026-11-01T00:00:00-04:00' }));
  const b2 = await r2.json();
  show('stop before start', r2.status, b2.fields);
  assert.equal(b2.fields.endsAt, 'The stop time must be after the start time.');
});

test('offer text is stored as plain text: HTML removed, line breaks kept, extra keys dropped', async () => {
  const r = await post(offersFn, '/api/offers', everyone({
    headline: '<b>Big</b> <script>alert(1)</script>news‮',
    body: 'Hello <img src=x onerror=alert(1)>there\r\n\r\n\r\n\r\nSecond <scr<script>ipt>para',
    status: 'running', isAdmin: true, previewKey: 'attacker-chosen'
  }));
  const b = await r.json();
  show('HTML in headline and copy', r.status, { headline: b.offer.headline, body: b.offer.body, notes: b.notes });
  assert.equal(b.offer.headline, 'Big alert(1)news');
  assert.equal(b.offer.body, 'Hello there\n\nSecond para');
  assert.ok(!('isAdmin' in b.offer));
  assert.notEqual(b.offer.previewKey, 'attacker-chosen');
  assert.equal(b.offer.previewKey.length, C.PREVIEW_KEY_LENGTH);
  assert.deepEqual(Object.keys(b.offer).filter((k) => k !== 'status'), [...C.OFFER_KEYS]);
});

test('drafts may be incomplete; scheduling needs page, headline and dates', async () => {
  const d = await post(offersFn, '/api/offers', { name: 'Just an idea', form: C.emptyOffer().form });
  show('draft with only a name', d.status, { status: (await d.json()).offer?.status });
  assert.equal(d.status, 201);
  const s = await post(offersFn, '/api/offers', { name: 'Not ready', draft: false, audience: 'link', form: C.emptyOffer().form });
  const sb = await s.json();
  show('scheduling with only a name', s.status, sb.fields);
  assert.equal(s.status, 400);
  for (const k of ['page', 'headline', 'startsAt', 'endsAt', 'slug']) assert.ok(sb.fields[k], k);
});

/* ---------- saving, history, concurrency ---------- */

test('editing: stale copy refused (409); fresh copy saved; server fields never change; history kept', async () => {
  const created = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  const first = await post(offersFn, '/api/offers', { ...created, headline: 'Edit one' });
  const firstB = await first.json();
  assert.equal(first.status, 200);
  const stale = await post(offersFn, '/api/offers', { ...created, headline: 'Edit from an old tab' });
  show('save from a stale copy', stale.status, await stale.json());
  assert.equal(stale.status, 409);
  const again = await post(offersFn, '/api/offers', { ...firstB.offer, headline: 'Edit two', id: created.id, createdAt: 'x' });
  const againB = await again.json();
  show('save from the fresh copy', again.status, { headline: againB.offer.headline });
  assert.equal(again.status, 200);
  assert.equal(againB.offer.previewKey, created.previewKey);
  assert.equal(againB.offer.createdAt, created.createdAt);
  const hist = await st.listHistory(blobs);
  console.log(`  history entries after 3 saves: ${hist.length}`);
  assert.equal(hist.length, 2, 'first save had nothing before it; each later save kept the previous list');
});

test('history keeps only the newest 20', async () => {
  let o = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  for (let i = 0; i < 25; i++) o = (await (await post(offersFn, '/api/offers', { ...o, headline: `Edit ${i}` })).json()).offer;
  const hist = await st.listHistory(blobs);
  console.log(`  history entries after 26 saves: ${hist.length}`);
  assert.equal(hist.length, C.HISTORY_KEEP);
});

test('two saves at the same moment: neither is lost (ETag guard retries)', async () => {
  await post(offersFn, '/api/offers', everyone());
  blobs.beforeWrite = async () => {
    // Another save lands between this request's read and write.
    const r = await post(offersFn, '/api/offers', link({ name: 'Saved at the same moment' }));
    assert.equal(r.status, 201);
  };
  const r = await post(offersFn, '/api/offers', link({ name: 'AV company offer', slug: 'av-company' }));
  const names = (await (await get(offersFn, '/api/offers')).json()).offers.map((o) => o.name);
  show('racing save', r.status, names);
  assert.equal(r.status, 201);
  assert.deepEqual(names.sort(), ['2027 offer for everyone', 'AV company offer', 'Saved at the same moment']);
});

test('history write fails: nothing is saved (503)', async () => {
  const created = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  blobs.failHistory = true;
  const r = await post(offersFn, '/api/offers', { ...created, headline: 'Should not save' });
  show('history store down', r.status, await r.json());
  assert.equal(r.status, 503);
  blobs.failHistory = false;
  const list = (await (await get(offersFn, '/api/offers')).json()).offers;
  assert.equal(list[0].headline, 'Book 2027 now');
});

test('unreadable stored data is never overwritten (500), storage down gives 503', async () => {
  await blobs.setJSON('all', { not: 'an array' });
  const r = await post(offersFn, '/api/offers', everyone());
  show('stored data not an array', r.status, await r.json());
  assert.equal(r.status, 500);
  assert.deepEqual(await blobs.get('all'), { not: 'an array' });
  st._setOffersStoreFactoryForTests(() => ({ getWithMetadata: async () => { throw new Error('down'); } }));
  const g = await get(offersFn, '/api/offers');
  show('storage down, GET', g.status, await g.json());
  assert.equal(g.status, 503);
});

test('restore puts back a saved version, and the restore itself is undoable', async () => {
  const o = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  await post(offersFn, '/api/offers', { ...o, headline: 'Changed by mistake' });
  const [newest] = await st.listHistory(blobs);
  const r = await st.restoreHistory(blobs, newest);
  const list = (await (await get(offersFn, '/api/offers')).json()).offers;
  console.log(`  restore -> ${JSON.stringify(r.result)}; headline now "${list[0].headline}"; history entries ${(await st.listHistory(blobs)).length}`);
  assert.equal(list[0].headline, 'Book 2027 now');
  assert.equal((await st.listHistory(blobs)).length, 2);
});

/* ---------- list, delete, rerun, export, pages ---------- */

test('list shows each offer with its worked-out status, and test data goes to the -test store', async () => {
  await post(offersFn, '/api/offers', everyone({ name: 'Running', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' }));
  await post(offersFn, '/api/offers', everyone({ name: 'Upcoming', page: '/index.html', startsAt: '2098-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' }));
  await post(offersFn, '/api/offers', everyone({ name: 'Expired', page: '/library/', startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-02-01T00:00:00Z' }));
  await post(offersFn, '/api/offers', everyone({ name: 'Draft', draft: true }));
  const b = await (await get(offersFn, '/api/offers')).json();
  const s = Object.fromEntries(b.offers.map((o) => [o.name, o.status]));
  show('GET /api/offers', 200, { store: b.store, statuses: s, pages: b.offers.map((o) => o.page) });
  assert.deepEqual(s, { Running: 'running', Upcoming: 'upcoming', Expired: 'expired', Draft: 'draft' });
  assert.equal(b.store, 'offers-test');
  assert.equal(st.offersStoreName('production'), 'offers');
});

test('delete: drafts only', async () => {
  const live = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  const draft = (await (await post(offersFn, '/api/offers', everyone({ name: 'Throwaway', draft: true }))).json()).offer;
  const a = await post(deleteFn, '/api/offers/delete', { id: live.id });
  show('delete a scheduled offer', a.status, await a.json());
  const b = await post(deleteFn, '/api/offers/delete', { id: draft.id });
  show('delete a draft', b.status, await b.json());
  const c = await post(deleteFn, '/api/offers/delete', { id: draft.id });
  show('delete it again', c.status, await c.json());
  assert.deepEqual([a.status, b.status, c.status], [409, 200, 404]);
});

test('rerun: a copy of an expired offer keeps the link and points back to the original', async () => {
  const old = (await (await post(offersFn, '/api/offers', link({ startsAt: '2025-01-01T00:00:00Z', endsAt: '2025-02-01T00:00:00Z' }))).json()).offer;
  const { id, previewKey, createdAt, updatedAt, ...copy } = old;
  const r = await post(offersFn, '/api/offers', { ...copy, rerunOf: old.id, startsAt: '2026-11-01T00:00:00-04:00', endsAt: '2026-11-30T23:59:00-05:00' });
  const b = await r.json();
  show('rerun', r.status, { slug: b.offer.slug, rerunOf: b.offer.rerunOf === old.id, newId: b.offer.id !== old.id, newKey: b.offer.previewKey !== previewKey });
  assert.equal(r.status, 201);
  const bad = await post(offersFn, '/api/offers', { ...copy, rerunOf: 'no-such-offer', startsAt: '2027-11-01T00:00:00-04:00', endsAt: '2027-11-30T23:59:00-05:00' });
  assert.equal(bad.status, 400);
});

test('export: one JSON file with every offer, saved and opened again', async () => {
  await post(offersFn, '/api/offers', everyone());
  await post(offersFn, '/api/offers', link());
  await post(offersFn, '/api/offers', link({ name: 'AV company offer', slug: 'av-company', endsAt: '2026-11-30T23:59:00-05:00' }));
  const r = await get(exportFn, '/api/offers/export');
  const disp = r.headers.get('content-disposition');
  const name = disp.match(/filename="([^"]+)"/)[1];
  const dir = await mkdtemp(join(tmpdir(), 'yavd-export-'));
  const file = join(dir, name);
  await writeFile(file, await r.text());
  const opened = JSON.parse(await readFile(file, 'utf8'));
  console.log(`  export -> ${r.status} ${disp}`);
  console.log(`  saved ${file}; opened again: count=${opened.count}, store=${opened.store}, names=${JSON.stringify(opened.offers.map((o) => o.name))}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(name, /^yavd-offers-test-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  assert.equal(opened.count, 3);
  assert.equal(opened.offers.length, 3);
});

test('page list: real .html files, titles read, admin pages left out', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yavd-site-'));
  await mkdir(join(root, 'library'));
  await writeFile(join(root, 'index.html'), '<title>Home &amp; more</title>');
  await writeFile(join(root, 'booth-proof.html'), '<html><head><title>\n Booth Proof </title>');
  await writeFile(join(root, 'offers-form.html'), '<title>blueprint</title>');
  await writeFile(join(root, 'library', 'av365.html'), '<title>AV365</title>');
  await writeFile(join(root, 'notes.txt'), 'x');
  const pages = await pagesMod.listPages(root);
  console.log(`  pages -> ${JSON.stringify(pages)}`);
  assert.deepEqual(pages, [
    { path: '/index.html', title: 'Home & more' },
    { path: '/booth-proof.html', title: 'Booth Proof' },
    { path: '/library/av365.html', title: 'AV365' }
  ]);
});

test('every route still refuses signed-out callers and cross-site posts', async () => {
  for (const [fn, method, path] of [[offersFn, 'GET', '/api/offers'], [offersFn, 'POST', '/api/offers'],
    [deleteFn, 'POST', '/api/offers/delete'], [exportFn, 'GET', '/api/offers/export'], [pagesMod.default, 'GET', '/api/offers/pages'],
    [restoreFn, 'GET', '/api/offers/restore'], [restoreFn, 'POST', '/api/offers/restore']]) {
    const r = await fn(new Request(BASE + path, { method }), ctx);
    assert.equal(r.status, 401, `${method} ${path}`);
  }
  const x = await post(offersFn, '/api/offers', everyone(), { origin: 'https://evil.example' });
  const t = await offersFn(new Request(BASE + '/api/offers', { method: 'POST', headers: { cookie: cookie(), 'content-type': 'text/plain' }, body: '{}' }), ctx);
  console.log(`  signed out: all 401 | cross-site POST -> ${x.status} | text/plain POST -> ${t.status}`);
  assert.deepEqual([x.status, t.status], [403, 415]);
});

/* ---------- restore route (contract 1.1.0) ---------- */

test('restore route: lists saved versions newest first, puts one back, and the restore is itself undoable', async () => {
  const o = (await (await post(offersFn, '/api/offers', everyone())).json()).offer;
  const edited = (await (await post(offersFn, '/api/offers', { ...o, headline: 'Changed by mistake' })).json()).offer;
  await post(offersFn, '/api/offers', link());
  const l = await get(restoreFn, '/api/offers/restore');
  const lb = await l.json();
  show('GET /api/offers/restore', l.status, lb.versions.map((v) => ({ action: v.action, count: v.count, names: v.offers.map((x) => x.name) })));
  assert.equal(l.status, 200);
  assert.equal(lb.versions.length, 2);
  assert.equal(lb.versions[0].count, 1, 'newest first: the list before the link offer was added');
  assert.ok(!JSON.stringify(lb).includes(o.previewKey), 'version list never carries preview keys');

  // Put back the version from before the mistaken edit (the oldest one).
  const target = lb.versions[1].key;
  const r = await post(restoreFn, '/api/offers/restore', { key: target });
  const rb = await r.json();
  const now = (await (await get(offersFn, '/api/offers')).json()).offers;
  show('POST restore oldest version', r.status, { ...rb, headlineNow: now[0].headline, offersNow: now.length });
  assert.equal(r.status, 200);
  assert.equal(now.length, 1);
  assert.equal(now[0].headline, 'Book 2027 now');
  assert.notEqual(edited.headline, now[0].headline);

  const after = (await (await get(restoreFn, '/api/offers/restore')).json()).versions;
  assert.equal(after[0].action, 'restore');
  assert.equal(after[0].count, 2, 'the list replaced by the restore was kept');
});

test('restore route: bad or unknown keys refused, nothing changed', async () => {
  await post(offersFn, '/api/offers', everyone());
  const before = await blobs.get('all');
  const a = await post(restoreFn, '/api/offers/restore', { key: 'all' });
  const b = await post(restoreFn, '/api/offers/restore', { key: '../all' });
  const c = await post(restoreFn, '/api/offers/restore', { key: 'history/2020-01-01T00:00:00.000Z-abcdef' });
  const d = await restoreFn(new Request(BASE + '/api/offers/restore', { method: 'POST', headers: { cookie: cookie(), 'content-type': 'text/plain' }, body: '{}' }), ctx);
  console.log(`  key "all" -> ${a.status} | "../all" -> ${b.status} | unknown version -> ${c.status} ${JSON.stringify(await c.json())} | text/plain -> ${d.status}`);
  assert.deepEqual([a.status, b.status, c.status, d.status], [400, 400, 404, 415]);
  assert.deepEqual(await blobs.get('all'), before);
});

test('saved versions keep their real order even when saves land in the same millisecond', async () => {
  const frozen = () => new Date('2026-10-10T14:00:00.000Z');   // every change at the same moment
  for (let i = 1; i <= 6; i++) {
    await st.changeOffers(blobs, (offers) => ({ offers: [...offers, { id: `o${i}`, name: `Offer ${i}` }] }), { action: 'save', now: frozen });
  }
  const keys = await st.listHistory(blobs);
  const counts = [];
  for (const k of keys) counts.push((await blobs.get(k)).offers.length);
  console.log(`  6 saves in one millisecond -> versions newest first hold ${JSON.stringify(counts)} offers; keys end ${keys.map((k) => k.slice(-3)).join(',')}`);
  assert.deepEqual(counts, [5, 4, 3, 2, 1]);
  // Older-style key (hex ending, from before this fix) sorts as oldest and is still accepted
  await blobs.setJSON('history/2026-10-10T15:00:00.000Z-abcdef', { offers: [] });
  const withOld = await st.listHistory(blobs);
  assert.equal(withOld.at(-1), 'history/2026-10-10T15:00:00.000Z-abcdef');
  assert.ok(st.isHistoryKey(withOld.at(-1)) && st.isHistoryKey(keys[0]));
});
