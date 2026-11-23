// YAVD Offers Module: landing page storage tests (Session 4.3)
// Run from the website folder:  node --test netlify/tests/landings-store.test.mjs
// Uses an in-memory stand-in for Netlify Blobs; never touches real storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../shared/offer-contract.js');
const st = await import('../functions/lib/landings-store.mjs');

/* ---------- in-memory Blobs with ETags (same behaviour as @netlify/blobs 11.1.1) ---------- */
function memoryBlobs() {
  const m = new Map();
  let n = 0;
  const s = {
    m,
    writes: [],                 // every key written, in order
    failHistory: false,
    failAll: false,
    readGate: null,             // test hook: a promise every read of "all" waits on
    async get(k) { const e = m.get(k); return e ? JSON.parse(e.v) : null; },
    async getWithMetadata(k) {
      const e = m.get(k);
      const snap = e ? { data: JSON.parse(e.v), etag: e.etag, metadata: { ...(e.meta || {}) } } : null;
      if (s.readGate && k === 'all') await s.readGate();
      return snap;
    },
    async setJSON(k, v, o = {}) {
      if (s.failHistory && k.startsWith('history/')) throw new Error('blobs down');
      if (s.failAll && k === 'all') throw new Error('blobs down');
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: JSON.stringify(v), etag, meta: o.metadata || {} });
      s.writes.push(k);
      return { modified: true, etag };
    },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key, etag: m.get(key).etag })) }; },
    async delete(k) { m.delete(k); }
  };
  return s;
}

/** Makes the next `count` reads of "all" wait until all of them have read: a real race, every time. */
function barrier(store, count) {
  let waiting = 0;
  let release;
  const all = new Promise((r) => { release = r; });
  store.readGate = () => {
    waiting += 1;
    if (waiting >= count) { store.readGate = null; release(); }
    return all;
  };
}

function landing(id, slug, extra = {}) {
  return { id, name: `Page ${id}`, slug, eyebrow: '', headline: 'H', body: 'B', image: null, ctaLabel: 'Go', ctaUrl: '/contact',
    status: 'draft', previewKey: 'k', createdAt: '2026-11-23T10:00:00.000Z', updatedAt: '2026-11-23T10:00:00.000Z', archivedAt: null, ...extra };
}
const add = (l) => (list) => ({ landings: [...list, l], result: { id: l.id } });

let blobs;
beforeEach(() => {
  blobs = memoryBlobs();
  st._setLandingsStoreFactoryForTests(() => blobs);
});

/* ---------- store name and opening ---------- */

test('store name: production reads "offer-landings", every other deploy the -test store', () => {
  assert.equal(st.landingsStoreName('production'), 'offer-landings');
  assert.equal(st.landingsStoreName('branch-deploy'), 'offer-landings-test');
  assert.equal(st.landingsStoreName('deploy-preview'), 'offer-landings-test');
  assert.equal(st.landingsStoreName(undefined), 'offer-landings-test');
  assert.equal(C.STORES.landings, 'offer-landings');
});

test('store factory throwing becomes a 503 LandingStoreError', () => {
  st._setLandingsStoreFactoryForTests(() => { throw new Error('no blobs context'); });
  assert.throws(() => st.landingsStore('production'), (e) => e instanceof st.LandingStoreError && e.status === 503);
  st._setLandingsStoreFactoryForTests(() => blobs);
  assert.equal(st.landingsStore('production'), blobs);
});

/* ---------- round trip and history ---------- */

test('empty store loads as an empty list', async () => {
  const r = await st.loadLandings(blobs);
  assert.deepEqual(r, { landings: [], etag: undefined, exists: false, seq: 0 });
});

test('round trip: first save writes "all" only, the next writes history first, then "all"', async () => {
  const a = landing('a1', 'first-page');
  const r1 = await st.changeLandings(blobs, add(a), { action: 'create', landingId: 'a1' });
  assert.deepEqual(r1, { saved: true, result: { id: 'a1' } });
  assert.deepEqual(blobs.writes, ['all']);

  const loaded = await st.loadLandings(blobs);
  assert.deepEqual(loaded.landings, [a]);
  assert.equal(loaded.seq, 1);
  assert.ok(loaded.etag);

  const b = landing('b2', 'second-page');
  await st.changeLandings(blobs, add(b), { action: 'create', landingId: 'b2' });
  assert.equal(blobs.writes.length, 3);
  assert.match(blobs.writes[1], /^history\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-000000002$/);
  assert.equal(blobs.writes[2], 'all');
  const h = await blobs.get(blobs.writes[1]);
  assert.deepEqual(h.landings, [a], 'history holds the array as it was before the change');
  assert.equal(h.action, 'create');
  assert.equal(h.landingId, 'b2');
  assert.equal((await st.loadLandings(blobs)).seq, 2);
  console.log(`  writes: ${blobs.writes.join(' , ')}`);
});

test('the change function gets a private copy: changing it in place cannot touch the store', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' });
  const r = await st.changeLandings(blobs, (list) => { list[0].name = 'Mutated'; return { stop: 'nope' }; }, { action: 'edit' });
  assert.deepEqual(r, { saved: false, stop: 'nope' });
  assert.equal((await st.loadLandings(blobs)).landings[0].name, 'Page a1');
  assert.equal(blobs.writes.length, 1, 'a stop writes nothing, not even history');
});

test('a change that returns no array is refused (500), nothing written', async () => {
  await assert.rejects(st.changeLandings(blobs, () => ({ landings: 'x' }), { action: 'edit' }),
    (e) => e instanceof st.LandingStoreError && e.status === 500);
  assert.equal(blobs.writes.length, 0);
});

test('history keeps only the newest 20, sorted by change number', async () => {
  for (let i = 0; i < 26; i++) {
    await st.changeLandings(blobs, add(landing(`id${i}`, `page-${i}`)), { action: 'create', now: () => new Date('2026-11-23T12:00:00.000Z') });
  }
  const hist = await st.listLandingHistory(blobs);
  assert.equal(hist.length, C.HISTORY_KEEP);
  assert.equal(st.landingHistorySeq(hist[0]), 26, 'newest first, even with identical times');
  assert.equal(st.landingHistorySeq(hist.at(-1)), 7);
  console.log(`  history entries after 26 saves: ${hist.length} (seq ${st.landingHistorySeq(hist[0])} to ${st.landingHistorySeq(hist.at(-1))})`);
});

test('history summary describes each saved version', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create', landingId: 'a1' });
  await st.changeLandings(blobs, add(landing('b2', 'second-page')), { action: 'create', landingId: 'b2' });
  await blobs.setJSON('history/2026-01-01T00:00:00.000Z-000000000', 'not a record');
  const s = await st.landingHistorySummary(blobs);
  assert.equal(s.length, 2);
  assert.equal(s[0].landingId, 'b2');
  assert.equal(s[0].count, 1);
  assert.deepEqual(s[0].landings, [{ id: 'a1', name: 'Page a1', slug: 'first-page', status: 'draft', updatedAt: '2026-11-23T10:00:00.000Z' }]);
  assert.equal(s[1].readable, false);
});

test('restore puts a saved version back, keeps the replaced one in history, and refuses bad keys', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' });
  await st.changeLandings(blobs, add(landing('b2', 'second-page')), { action: 'create' });
  const [key] = await st.listLandingHistory(blobs);
  const r = await st.restoreLandingHistory(blobs, key);
  assert.deepEqual(r, { saved: true, result: { restored: key, count: 1 } });
  assert.deepEqual((await st.loadLandings(blobs)).landings.map((l) => l.id), ['a1']);
  const [newest] = await st.listLandingHistory(blobs);
  const h = await blobs.get(newest);
  assert.equal(h.action, 'restore');
  assert.deepEqual(h.landings.map((l) => l.id), ['a1', 'b2'], 'the restore itself can be undone');

  for (const bad of ['all', 'history/../all', 'history/2026-11-23T12:00:00.000Z-abcdef', 'history/2026-11-23T12:00:00.000Z-000000099', 42]) {
    await assert.rejects(st.restoreLandingHistory(blobs, bad), (e) => e.status === 404, String(bad));
  }
  assert.equal(st.isLandingHistoryKey(key), true);
});

/* ---------- concurrency ---------- */

test('two parallel saves cannot overwrite each other: both land, in some order', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' });
  barrier(blobs, 2);   // both saves read the same version before either writes
  const [r1, r2] = await Promise.all([
    st.changeLandings(blobs, add(landing('b2', 'second-page')), { action: 'create' }),
    st.changeLandings(blobs, add(landing('c3', 'third-page')), { action: 'create' })
  ]);
  assert.equal(r1.saved && r2.saved, true);
  const ids = (await st.loadLandings(blobs)).landings.map((l) => l.id).sort();
  assert.deepEqual(ids, ['a1', 'b2', 'c3']);
  assert.equal((await st.loadLandings(blobs)).seq, 3);
  console.log(`  after a forced race: ${ids.join(', ')}`);
});

test('proof the guard is real: without onlyIfMatch the same race loses a save', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' });
  const unguarded = { ...blobs, setJSON: (k, v, o = {}) => { const { onlyIfMatch, ...rest } = o; return blobs.setJSON(k, v, rest); } };
  barrier(blobs, 2);
  await Promise.all([
    st.changeLandings(unguarded, add(landing('b2', 'second-page')), { action: 'create' }),
    st.changeLandings(unguarded, add(landing('c3', 'third-page')), { action: 'create' })
  ]);
  const ids = (await st.loadLandings(blobs)).landings.map((l) => l.id);
  assert.equal(ids.length, 2, `one save was lost without the condition (kept: ${ids.join(', ')})`);
  console.log(`  without the guard: kept ${ids.join(', ')} (one save lost, as expected)`);
});

test('many parallel saves: every one is saved or refused with 409, none is lost', async () => {
  await st.changeLandings(blobs, add(landing('a0', 'page-zero')), { action: 'create' });
  const N = 8;
  barrier(blobs, N);
  const results = await Promise.allSettled(
    Array.from({ length: N }, (_, i) => st.changeLandings(blobs, add(landing(`p${i}`, `page-${i}x`)), { action: 'create' })));
  const saved = results.filter((r) => r.status === 'fulfilled' && r.value.saved).length;
  const refused = results.filter((r) => r.status === 'rejected');
  for (const r of refused) assert.equal(r.reason.status, 409);
  const stored = (await st.loadLandings(blobs)).landings;
  assert.equal(stored.length, 1 + saved, 'stored count matches the saves that said yes');
  assert.ok(saved >= 1);
  console.log(`  ${N} parallel saves: ${saved} saved, ${refused.length} refused with 409, ${stored.length} stored`);
});

/* ---------- refusals and storage failures ---------- */

test('a stored value that is not an array refuses every write (500)', async () => {
  await blobs.setJSON('all', { not: 'an array' });
  blobs.writes.length = 0;
  await assert.rejects(st.loadLandings(blobs), (e) => e.status === 500);
  await assert.rejects(st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' }), (e) => e.status === 500);
  const key = 'history/2026-11-23T12:00:00.000Z-000000001';
  await blobs.setJSON(key, { landings: [] });
  await assert.rejects(st.restoreLandingHistory(blobs, key), (e) => e.status === 500);
  assert.deepEqual(await blobs.get('all'), { not: 'an array' }, 'never overwritten');
});

test('storage throwing on read becomes a 503 LandingStoreError', async () => {
  const down = { getWithMetadata: async () => { throw new Error('down'); } };
  await assert.rejects(st.loadLandings(down), (e) => e instanceof st.LandingStoreError && e.status === 503);
  await assert.rejects(st.changeLandings(down, add(landing('a1', 'first-page'))), (e) => e.status === 503);
  await assert.rejects(st.listLandingHistory({ list: async () => { throw new Error('down'); } }), (e) => e.status === 503);
});

test('history write failing saves nothing (503)', async () => {
  await st.changeLandings(blobs, add(landing('a1', 'first-page')), { action: 'create' });
  blobs.failHistory = true;
  await assert.rejects(st.changeLandings(blobs, add(landing('b2', 'second-page')), { action: 'create' }), (e) => e.status === 503);
  assert.deepEqual((await st.loadLandings(blobs)).landings.map((l) => l.id), ['a1']);
});

test('write of "all" failing becomes 503; trim failing does not fail the save', async () => {
  blobs.failAll = true;
  await assert.rejects(st.changeLandings(blobs, add(landing('a1', 'first-page'))), (e) => e.status === 503);
  blobs.failAll = false;
  const noList = { ...blobs, list: async () => { throw new Error('list down'); } };
  const r = await st.changeLandings(noList, add(landing('a1', 'first-page')), { action: 'create' });
  assert.equal(r.saved, true);
});
