// Session 1.5: edge decisions, injection and the cached offer source.
// Run: node --test netlify/tests/offer-edge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOfferSource, decideLink, decidePage, injectOffer, looksLikePage, parseSlug,
  safePagePath, carriedQuery, wantsForcedFailure, offersStoreNameFor, redirectResponse, FORCE_FAIL_HEADER
} from '../edge-lib/offer-edge.js';
import { INJECT } from '../../shared/offer-contract.js';

const NOW = new Date('2026-11-15T12:00:00-05:00');
const KEY_A = 'a'.repeat(32), KEY_D = 'd'.repeat(32), KEY_E = 'e'.repeat(32);
const base = (o) => ({
  name: 'x', headline: 'H', body: 'B', form: { enabled: true, fields: ['name'], required: [], buttonLabel: 'Send', optionChoices: [], extraLabels: {}, thanks: 'T' },
  buttonUrl: null, draft: false, rerunOf: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...o
});
const OFFERS = [
  base({ id: 'run', slug: 'group-2026', audience: 'link', page: '/booth-proof.html', previewKey: KEY_A,
         startsAt: '2026-11-01T00:00:00-04:00', endsAt: '2026-11-30T23:59:00-05:00' }),
  base({ id: 'old', slug: 'av-2025', audience: 'link', page: '/booth-proof.html', previewKey: 'b'.repeat(32),
         startsAt: '2025-01-01T00:00:00-05:00', endsAt: '2025-12-31T23:59:00-05:00' }),
  base({ id: 'draft', slug: 'draft-one', audience: 'link', page: '/fix-my-av-budget.html', previewKey: KEY_D, draft: true,
         startsAt: '', endsAt: '' }),
  base({ id: 'every', slug: '', audience: 'everyone', page: '/booth-proof.html', previewKey: KEY_E,
         startsAt: '2026-11-01T00:00:00-04:00', endsAt: '2026-12-31T23:59:00-05:00' }),
  base({ id: 'every-later', slug: '', audience: 'everyone', page: '/index.html', previewKey: 'f'.repeat(32),
         startsAt: '2027-01-01T00:00:00-05:00', endsAt: '2027-01-31T23:59:00-05:00' })
];

test('parseSlug: valid, case, trailing slash; rejects deeper or bad', () => {
  assert.equal(parseSlug('/offer/group-2026'), 'group-2026');
  assert.equal(parseSlug('/offer/Group-2026/'), 'group-2026');
  assert.equal(parseSlug('/offer/a/b'), null);
  assert.equal(parseSlug('/offer/'), null);
  assert.equal(parseSlug('/offer/x'), null);           // under 3 chars
  assert.equal(parseSlug('/offer/%zz'), null);
  assert.equal(parseSlug('/booth-proof'), null);
});

test('running link: served with that offer, not a test', () => {
  const d = decideLink(OFFERS, { slug: 'group-2026', previewKey: '', now: NOW });
  assert.deepEqual([d.action, d.offer.id, d.page, d.isTest, d.state], ['serve', 'run', '/booth-proof.html', false, 'link-running']);
});

test('expired link: 302 to its page', () => {
  const d = decideLink(OFFERS, { slug: 'av-2025', now: NOW });
  assert.deepEqual([d.action, d.to, d.state], ['redirect', '/booth-proof.html', 'link-expired']);
});

test('upcoming link: 302 to its page', () => {
  const d = decideLink(OFFERS, { slug: 'group-2026', now: new Date('2026-10-01T00:00:00Z') });
  assert.deepEqual([d.action, d.to, d.state], ['redirect', '/booth-proof.html', 'link-upcoming']);
});

test('draft link without key: never shown, 302 to its page', () => {
  const d = decideLink(OFFERS, { slug: 'draft-one', now: NOW });
  assert.deepEqual([d.action, d.to, d.state], ['redirect', '/fix-my-av-budget.html', 'link-draft']);
});

test('unknown slug and bad slug: 302 to /', () => {
  assert.deepEqual(decideLink(OFFERS, { slug: 'nope-nope', now: NOW }).to, '/');
  assert.deepEqual(decideLink(OFFERS, { slug: null, now: NOW }).state, 'unknown-slug');
  assert.deepEqual(decideLink(null, { slug: 'group-2026', now: NOW }).to, '/');
});

test('preview of a draft: served, marked test', () => {
  const d = decideLink(OFFERS, { slug: 'draft-one', previewKey: KEY_D, now: NOW });
  assert.deepEqual([d.action, d.offer.id, d.isTest, d.state], ['serve', 'draft', true, 'preview']);
});

test('preview of an expired link offer works; wrong slug or wrong key does not', () => {
  assert.equal(decideLink(OFFERS, { slug: 'av-2025', previewKey: 'b'.repeat(32), now: NOW }).state, 'preview');
  assert.equal(decideLink(OFFERS, { slug: 'group-2026', previewKey: KEY_D, now: NOW }).state, 'link-running');
  assert.equal(decideLink(OFFERS, { slug: 'av-2025', previewKey: 'z'.repeat(32), now: NOW }).state, 'link-expired');
  assert.equal(decideLink(OFFERS, { slug: 'av-2025', previewKey: 'short', now: NOW }).state, 'link-expired');
});

test('preview of an Everyone offer: any word after /offer/', () => {
  const d = decideLink(OFFERS, { slug: 'preview', previewKey: KEY_E, now: NOW });
  assert.deepEqual([d.action, d.offer.id, d.isTest], ['serve', 'every', true]);
});

test('Everyone offers are never reachable as a link without a key', () => {
  assert.equal(decideLink(OFFERS, { slug: 'preview', now: NOW }).state, 'unknown-slug');
});

test('decidePage: running Everyone offer on either address of the page', () => {
  assert.equal(decidePage(OFFERS, '/booth-proof', NOW)?.id, 'every');
  assert.equal(decidePage(OFFERS, '/Booth-Proof.html', NOW)?.id, 'every');
  assert.equal(decidePage(OFFERS, '/', NOW), null);                 // only upcoming there
  assert.equal(decidePage(OFFERS, '/fix-my-av-budget', NOW), null); // link offers never attach to pages
  assert.equal(decidePage(OFFERS, '/booth-proof', new Date('2027-02-01T00:00:00Z')), null);
});

test('looksLikePage', () => {
  for (const p of ['/', '/booth-proof', '/booth-proof.html', '/library/', '/field-notes/index.html']) assert.equal(looksLikePage(p), true, p);
  for (const p of ['/michaelh-qr.png', '/library/pdf/av365.pdf', '/api/offers', '/offer/x', '/offer-admin', '/assets/offer-panel.js', '/michaelh.vcf'])
    assert.equal(looksLikePage(p), false, p);
});

test('safePagePath and carriedQuery', () => {
  assert.equal(safePagePath('/booth-proof.html'), '/booth-proof.html');
  for (const p of ['//evil.com', 'https://evil.com', '/a\\b', '', null, '/a b']) assert.equal(safePagePath(p), null, String(p));
  assert.equal(carriedQuery(new URLSearchParams('preview=abc&utm_source=li')), '?utm_source=li');
  assert.equal(carriedQuery(new URLSearchParams('preview=abc')), '');
});

test('injectOffer: before </body>, once, escaped, public keys only', () => {
  const evil = base({ id: 'x1', slug: 's', headline: '</script><script>alert(1)</script>', previewKey: KEY_A, page: '/p.html' });
  const html = '<html><body><p>hi</p></BODY></html>';
  const out = injectOffer(html, evil, true);
  assert.ok(out.indexOf(INJECT.dataElementId) < out.indexOf('</BODY>'));
  assert.ok(!out.includes('</script><script>alert'));
  assert.ok(!out.includes(KEY_A), 'preview key must never reach the page');
  const json = /<script type="application\/json" id="yavd-offer-data">(.*?)<\/script>/.exec(out)[1];
  const parsed = JSON.parse(json);
  assert.equal(parsed.isTest, true);
  assert.equal(parsed.offer.headline, evil.headline);
  assert.deepEqual(Object.keys(parsed.offer).sort(), ['body', 'buttonUrl', 'form', 'headline', 'id', 'name', 'slug']);
  assert.equal(injectOffer(out, evil, true), out, 'never twice');
  assert.ok(injectOffer('<p>no body tag</p>', evil, false).startsWith('<p>no body tag</p><link'));
});

test('forced failure only outside production; store names', () => {
  const req = new Request('https://x/', { headers: { [FORCE_FAIL_HEADER]: '1' } });
  assert.equal(wantsForcedFailure(req, 'branch-deploy'), true);
  assert.equal(wantsForcedFailure(req, 'production'), false);
  assert.equal(wantsForcedFailure(req, null), false);
  assert.equal(offersStoreNameFor('production'), 'offers');
  assert.equal(offersStoreNameFor('branch-deploy'), 'offers-test');
});

test('redirectResponse: 302, no-store, noindex', () => {
  const r = redirectResponse('/booth-proof.html', 'link-expired');
  assert.deepEqual([r.status, r.headers.get('location'), r.headers.get('cache-control'), r.headers.get('x-robots-tag')],
    [302, '/booth-proof.html', 'no-store', 'noindex, nofollow']);
});

function fakeStore(behaviour) {
  let reads = 0;
  return { get reads() { return reads; }, open: () => ({ get: async () => { reads++; return behaviour(reads); } }) };
}

test('source: caches for a minute, then reads again', async () => {
  let t = 0;
  const s = fakeStore(() => OFFERS);
  const src = createOfferSource({ open: s.open, clock: () => t });
  assert.equal((await src.get('offers-test')).from, 'store');
  t = 59_000; assert.equal((await src.get('offers-test')).from, 'cache');
  t = 61_000; assert.equal((await src.get('offers-test')).from, 'store');
  assert.equal(s.reads, 2);
});

test('source: empty store is an empty list; non-list is a failure', async () => {
  assert.deepEqual((await createOfferSource({ open: fakeStore(() => null).open }).get('n')), { ok: true, offers: [], from: 'store' });
  assert.equal((await createOfferSource({ open: fakeStore(() => ({ a: 1 })).open }).get('n')).ok, false);
});

test('source: failure with nothing cached -> ok:false; with a cache -> stale copy', async () => {
  let t = 0;
  const s = fakeStore((n) => { if (n > 1) throw new Error('down'); return OFFERS; });
  const src = createOfferSource({ open: s.open, clock: () => t });
  assert.equal((await src.get('n')).from, 'store');
  t = 120_000;
  const r = await src.get('n');
  assert.deepEqual([r.ok, r.from, r.offers.length], [true, 'stale', OFFERS.length]);
  const cold = createOfferSource({ open: fakeStore(() => { throw new Error('down'); }).open });
  assert.deepEqual(await cold.get('n'), { ok: false, offers: [], from: 'failed' });
});

test('source: slow read times out and fails safe', async () => {
  const src = createOfferSource({ open: () => ({ get: () => new Promise(() => {}) }), timeoutMs: 30 });
  assert.equal((await src.get('n')).from, 'failed');
});

test('source: forced failure skips the cache too', async () => {
  const src = createOfferSource({ open: fakeStore(() => OFFERS).open });
  await src.get('n');
  assert.equal((await src.get('n', { forceFail: true })).ok, false);
});
