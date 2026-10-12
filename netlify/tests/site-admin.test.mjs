// YAVD site admin tests (2026-10-12): /admin, /site-map, takedowns, link check.
// Run from the website folder:  node --test netlify/tests/site-admin.test.mjs
// Reads the real .html files in this folder. Uses in-memory stand-ins for
// Netlify Blobs; never touches real storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const auth = await import('../functions/lib/offers-auth.mjs');
const offersStoreLib = await import('../functions/lib/offers-store.mjs');
const lib = await import('../functions/lib/site-admin.mjs');
const shared = await import('../../shared/site-admin.js');
const login = (await import('../functions/offers-login.mjs')).default;
const session = (await import('../functions/offers-session.mjs')).default;
const sitePages = (await import('../functions/site-pages.mjs')).default;
const siteLinks = (await import('../functions/site-links.mjs')).default;
const takedown = (await import('../functions/site-takedown.mjs')).default;

/* ---------- in-memory Blobs ---------- */

function attemptStore() {
  const m = new Map();
  return {
    async set(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, v); return { modified: true }; },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}
function jsonStore(initial) {
  let value = initial, n = initial === undefined ? 0 : 1;
  return {
    get value() { return value; },
    async getWithMetadata() { return value === undefined ? null : { data: structuredClone(value), etag: `e${n}`, metadata: {} }; },
    async setJSON(_k, v, o = {}) {
      if (o.onlyIfNew && value !== undefined) return { modified: false };
      if (o.onlyIfMatch && o.onlyIfMatch !== `e${n}`) return { modified: false };
      value = structuredClone(v); n++; return { modified: true };
    }
  };
}

let takedowns, offers;
beforeEach(() => {
  auth._setStoreFactoryForTests(() => attemptStore());
  takedowns = jsonStore(undefined);
  offers = jsonStore([]);
  lib._setTakedownStoreFactoryForTests(() => takedowns);
  offersStoreLib._setOffersStoreFactoryForTests(() => offers);
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
async function cookie() {
  const res = await login(new Request(`${BASE}/api/offers/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'correct-horse-battery-1' }) }), ctx);
  assert.equal(res.status, 200);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}
const get = (path, c) => new Request(`${BASE}${path}`, { headers: c ? { cookie: c } : {} });
const post = (path, body, c, extra = {}) => new Request(`${BASE}${path}`, { method: 'POST',
  headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}), ...extra }, body: JSON.stringify(body) });

/* ---------- shared rules ---------- */

test('addresses, confirm words, labels and groups', () => {
  assert.equal(shared.prettyAddress('/booth-proof.html'), '/booth-proof');
  assert.equal(shared.prettyAddress('/library/index.html'), '/library/');
  assert.equal(shared.prettyAddress('/index.html'), '/');
  assert.equal(shared.confirmWord('/booth-proof.html'), 'booth-proof');
  assert.equal(shared.confirmWord('/library/av365.html'), 'library/av365');
  assert.equal(shared.pageLabel('/booth-proof-pilot.html', 'Booth Proof Pilot | Your AV Department'), 'Booth Proof Pilot');
  assert.equal(shared.pageLabel('/index.html', 'Your AV Department | AV'), 'Home');
  assert.equal(shared.pageGroup('/booth-proof-dates.html'), 'Booth Proof');
  assert.equal(shared.pageGroup('/field-notes/index.html'), 'Library and Field Notes');
  assert.equal(shared.pageGroup('/michaelh.html'), 'Digital Cards');
  assert.equal(shared.pageGroup('/onyva.html'), 'Onyva');
  assert.equal(shared.pageGroup('/our-story.html'), 'Main pages');
});

test('takedown matching covers every address of a page, never a protected page', () => {
  const list = [{ page: '/booth-proof.html' }, { page: '/index.html' }, { page: '/library/index.html' }];
  for (const p of ['/booth-proof', '/booth-proof.html', '/Booth-Proof/', '/booth-proof?x=1']) assert.ok(shared.findTakedown(list, p), p);
  assert.ok(shared.findTakedown(list, '/library/'));
  assert.equal(shared.findTakedown(list, '/'), null);
  assert.equal(shared.findTakedown(list, '/booth-proof-pilot'), null);
  assert.equal(shared.findTakedown([], '/booth-proof'), null);
});

test('hrefTarget resolves relative, root and full-site links; ignores the rest', () => {
  assert.equal(lib.hrefTarget('booth-proof-dates.html', '/booth-proof.html'), '/booth-proof-dates.html');
  assert.equal(lib.hrefTarget('../our-story.html', '/library/av365.html'), '/our-story.html');
  assert.equal(lib.hrefTarget('/booth-proof', '/index.html'), '/booth-proof.html');
  assert.equal(lib.hrefTarget('https://www.youravdept.com/how-we-get-paid#x', '/index.html'), '/how-we-get-paid.html');
  assert.equal(lib.hrefTarget('index.html#why-free', '/our-story.html'), '/index.html');
  for (const h of ['#top', 'mailto:a@b.c', 'tel:1', 'https://calendar.app.google/x', 'library/pdf/av365.pdf', 'michaelh.vcf']) {
    assert.equal(lib.hrefTarget(h, '/index.html'), null, h);
  }
});

/* ---------- against the real site files ---------- */

const root = lib.siteRoot();
const files = await lib.readSiteFiles(root);

test('site map lists every real page, none of the admin files', () => {
  const pages = lib.pagesFrom(files);
  const paths = pages.map((p) => p.page);
  for (const p of ['/index.html', '/booth-proof.html', '/library/av365.html', '/field-notes/index.html', '/just-the-audio/index.html', '/trishah.html']) {
    assert.ok(paths.includes(p), p);
  }
  for (const p of shared.NOT_IN_SITE_MAP) assert.ok(!paths.includes(p), p);
  assert.ok(pages.length >= 28, `got ${pages.length}`);
  assert.ok(pages.every((p) => p.title && !p.title.includes('&') && shared.GROUP_ORDER.includes(p.group)));
  console.log(`  ${pages.length} pages:`, pages.map((p) => `${p.title} (${p.address})`).join('; '));
});

test('no page still carries the old site map pop-up, and every footer page opens /admin', () => {
  for (const f of files) {
    assert.ok(!/sitemapModal|openSitemap/.test(f.html), f.page);
    if (f.html.includes('id="copyrightLine"')) assert.ok(f.html.includes("window.location.href = '/admin'"), f.page);
  }
});

test('link report: booth-proof-dates is linked from the product page', () => {
  const r = lib.linkReport(files, '/booth-proof-dates.html');
  assert.ok(r.linkedFrom.some((x) => x.page === '/booth-proof.html'));
  console.log('  /booth-proof-dates linked from:', r.linkedFrom.map((x) => `${x.address} x${x.count}`).join(', '));
});

test('link report: redirect rules and offers pointing at a page', () => {
  const r = lib.linkReport(files, '/onyva-welcome.html', {
    redirectsText: '/onyva-landing /onyva-welcome.html 301!\n/onyva-welcome /onyva-welcome.html 200\n# /x /onyva-welcome.html',
    offers: [{ id: 'a', name: 'Draft one', page: '/onyva-welcome.html', draft: true }]
  });
  assert.deepEqual(r.redirects.map((x) => x.from), ['/onyva-landing']);
  assert.deepEqual(r.offers.map((o) => o.status), ['draft']);
  assert.equal(lib.blockingOffers(r).length, 0);
  const running = lib.linkReport([], '/onyva-welcome.html', { offers: [{ id: 'b', name: 'Live', page: '/onyva-welcome.html',
    draft: false, startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' }] });
  assert.equal(lib.blockingOffers(running).length, 1);
});

/* ---------- routes ---------- */

test('every new route refuses anyone not signed in', async () => {
  assert.equal((await session(get('/api/offers/session'))).status, 401);
  assert.equal((await sitePages(get('/api/offers/site/pages'), ctx)).status, 401);
  assert.equal((await siteLinks(get('/api/offers/site/links?page=/booth-proof.html'), ctx)).status, 401);
  assert.equal((await takedown(post('/api/offers/site/takedown', { page: '/booth-proof.html', action: 'down', confirm: 'booth-proof' }), ctx)).status, 401);
});

test('signed in: session ok, pages listed, links checked', async () => {
  const c = await cookie();
  assert.equal((await session(get('/api/offers/session', c))).status, 200);
  const pages = await (await sitePages(get('/api/offers/site/pages', c), ctx)).json();
  assert.ok(pages.pages.length >= 28 && pages.pages.every((p) => p.takenDown === false));
  const r = await siteLinks(get('/api/offers/site/links?page=/booth-proof-dates', c), ctx);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.page, '/booth-proof-dates.html');
  assert.equal(body.blocked, false);
  assert.equal((await siteLinks(get('/api/offers/site/links?page=/nope', c), ctx)).status, 400);
});

test('take down needs the confirm word, then Undo puts it back', async () => {
  const c = await cookie();
  const wrong = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot', action: 'down', confirm: 'yes' }, c), ctx);
  assert.equal(wrong.status, 400);
  assert.equal(takedowns.value, undefined);

  const ok = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot', action: 'down', confirm: 'booth-proof-pilot' }, c), ctx);
  assert.equal(ok.status, 200);
  assert.deepEqual(takedowns.value.map((t) => t.page), ['/booth-proof-pilot.html']);
  assert.ok(shared.findTakedown(takedowns.value, '/booth-proof-pilot'));

  const again = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot.html', action: 'down', confirm: 'booth-proof-pilot' }, c), ctx);
  assert.equal(again.status, 409);

  const list = await (await sitePages(get('/api/offers/site/pages', c), ctx)).json();
  assert.equal(list.pages.find((p) => p.page === '/booth-proof-pilot.html').takenDown, true);

  const undo = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot', action: 'restore' }, c), ctx);
  assert.equal(undo.status, 200);
  assert.deepEqual(takedowns.value, []);
  assert.equal((await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot', action: 'restore' }, c), ctx)).status, 409);
});

test('protected pages, unknown pages and scheduled offers block a takedown', async () => {
  const c = await cookie();
  assert.equal((await takedown(post('/api/offers/site/takedown', { page: '/', action: 'down', confirm: 'home' }, c), ctx)).status, 409);
  assert.equal((await takedown(post('/api/offers/site/takedown', { page: '/admin', action: 'down', confirm: 'admin' }, c), ctx)).status, 409);
  assert.equal((await takedown(post('/api/offers/site/takedown', { page: '/nope', action: 'down', confirm: 'nope' }, c), ctx)).status, 404);
  offers = jsonStore([{ id: 'x', name: 'Booth Proof: 2027 shows', page: '/booth-proof.html', audience: 'everyone',
    draft: false, startsAt: '2099-01-01T00:00:00Z', endsAt: '2099-02-01T00:00:00Z' }]);
  offersStoreLib._setOffersStoreFactoryForTests(() => offers);
  const res = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof', action: 'down', confirm: 'booth-proof' }, c), ctx);
  assert.equal(res.status, 409);
  console.log('  scheduled offer ->', res.status, (await res.json()).error);
  assert.equal(takedowns.value, undefined);
});

test('cross-site takedown is refused', async () => {
  const c = await cookie();
  const res = await takedown(post('/api/offers/site/takedown', { page: '/booth-proof-pilot', action: 'down', confirm: 'booth-proof-pilot' }, c,
    { origin: 'https://evil.example' }), ctx);
  assert.equal(res.status, 403);
});
