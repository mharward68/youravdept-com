// YAVD Offers Module: an offer links to a landing page (Session 4.6, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/offers-landing-link.test.mjs
//
// Part 1 (always runs): prepareOffer and /api/offers with in-memory stand-ins for
// every Blobs store (offers, landings, pictures, sign-in). Never touches real storage.
// Part 2 (Playwright, skipped when it is not found, same lookup as
// offer-panel-image.test.mjs): the popup a visitor sees, in a real browser.
// The unlinked popup is compared with the popup as it was before this session
// (git ref OLD_PANEL_REF), and must be byte-identical.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const rules = await import('../functions/lib/offers-rules.mjs');
const offSt = await import('../functions/lib/offers-store.mjs');
const landSt = await import('../functions/lib/landings-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const offersFn = (await import('../functions/offers.mjs')).default;
const { injectOffer, offerSnippet } = await import('../edge-lib/offer-edge.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OLD_PANEL_REF = '56f1372';   // the popup as it was before Session 4.6 (last commit of 4.5)

/* ---------- in-memory JSON store with ETags (copied, not imported) ---------- */
function jsonBlobs() {
  const m = new Map();
  let n = 0;
  const s = {
    m, fail: false,
    async get(k) { if (s.fail) throw new Error('blobs down'); const e = m.get(k); return e ? JSON.parse(e.v) : null; },
    async getWithMetadata(k) {
      if (s.fail) throw new Error('blobs down');
      const e = m.get(k); return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: e.meta || {} } : null;
    },
    async setJSON(k, v, o = {}) {
      if (s.fail) throw new Error('blobs down');
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: JSON.stringify(v), etag, meta: o.metadata || {} });
      return { modified: true, etag };
    },
    async list({ prefix = '' } = {}) {
      if (s.fail) throw new Error('blobs down');
      return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(k) { m.delete(k); }
  };
  return s;
}
function pictureBlobs() {
  const m = new Map();
  return {
    m,
    async getMetadata(k) { const e = m.get(k); return e ? { metadata: structuredClone(e.meta) } : null; },
    async getWithMetadata(k) { const e = m.get(k); return e ? { data: e.b.buffer, metadata: structuredClone(e.meta) } : null; },
    async list() { return { blobs: [...m.keys()].map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}

let lands, offers, pics, authBlobs;
const origError = console.error;
beforeEach(() => {
  lands = jsonBlobs();
  offers = jsonBlobs();
  pics = pictureBlobs();
  authBlobs = jsonBlobs();
  console.error = () => {};   // cleanup and store logs are expected; asserted through results instead
  landSt._setLandingsStoreFactoryForTests(() => lands);
  offSt._setOffersStoreFactoryForTests(() => offers);
  imgStore._setImagesStoreFactoryForTests(() => pics);
  auth._setStoreFactoryForTests(() => ({ set: authBlobs.setJSON, list: authBlobs.list, delete: authBlobs.delete }));
});
process.on('exit', () => { console.error = origError; });

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const cookie = () => `yavd_offer_admin=${auth.makeToken(auth.authConfig())}`;
async function post(body) {
  const r = await offersFn(new Request(BASE + '/api/offers', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookie(), origin: BASE }, body: JSON.stringify(body) }), ctx);
  return { status: r.status, body: await r.json() };
}
async function list() {
  const r = await offersFn(new Request(BASE + '/api/offers', { method: 'GET', headers: { cookie: cookie(), origin: BASE } }), ctx);
  return { status: r.status, body: await r.json() };
}
const seed = (store, arr) => store.m.set('all', { v: JSON.stringify(arr), etag: '"seed"', meta: { seq: 1 } });
const storedOffers = () => JSON.parse(offers.m.get('all')?.v ?? '[]');

function landing(slug, status = 'live') {
  return { id: `land-${slug}`, name: `Page ${slug}`, slug, eyebrow: '', headline: 'Book 2027', body: 'Copy', image: null,
    ctaLabel: 'Book a call', ctaUrl: 'https://calendar.app.google/abc', status, previewKey: 'k'.repeat(32),
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', archivedAt: status === 'archived' ? '2026-11-02T00:00:00.000Z' : null };
}
const formOff = () => ({ ...C.emptyOffer().form, enabled: false, fields: [], required: [], buttonLabel: 'See the details' });
function offerInput(over = {}) {
  return { name: 'Group 2027', page: '/booth-proof.html', audience: 'everyone', headline: 'Book 2027 now', body: 'Copy',
    startsAt: '2026-10-12T00:00:00-04:00', endsAt: '2026-12-31T23:59:00-05:00', draft: true, form: formOff(), ...over };
}

/* ---------- Part 1: rules and saving ---------- */

test('a new offer saves landing: null, in contract key order', async () => {
  const r = await post(offerInput());
  console.log('  new offer ->', r.status, JSON.stringify({ landing: r.body.offer?.landing, buttonUrl: r.body.offer?.buttonUrl }));
  assert.equal(r.status, 201);
  assert.strictEqual(r.body.offer.landing, null);
  assert.deepEqual(Object.keys(r.body.offer).filter((k) => k !== 'status'), C.OFFER_KEYS);
  assert.strictEqual(storedOffers()[0].landing, null);
});

test('old offers come back as stored; a re-save adds landing: null and changes nothing else', async () => {
  const old = { ...C.emptyOffer(), id: 'old-1', name: 'Saved in 1.3.0', page: '/booth-proof.html', headline: 'Hello',
    buttonUrl: 'https://example.com/x', form: formOff(), previewKey: 'p'.repeat(32),
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
  delete old.landing;
  seed(offers, [old]);
  const g = await list();
  assert.equal(g.status, 200);
  const { status, ...asListed } = g.body.offers[0];
  assert.deepEqual(asListed, old, 'GET returns the stored offer exactly');
  assert.ok(!('landing' in asListed));
  assert.strictEqual(C.publicPayload(old).offer.landing, null, 'visitors read it as null');

  const r = await post({ id: 'old-1', updatedAt: old.updatedAt, name: old.name });
  console.log('  re-save old offer ->', r.status, JSON.stringify({ landing: r.body.offer?.landing, buttonUrl: r.body.offer?.buttonUrl }));
  assert.equal(r.status, 200);
  assert.strictEqual(r.body.offer.landing, null);
  assert.equal(r.body.offer.buttonUrl, 'https://example.com/x');
  for (const k of C.OFFER_KEYS) if (!['landing', 'updatedAt'].includes(k)) assert.deepEqual(r.body.offer[k], old[k], k);
});

test('link to a live landing page: saved, and the button is the landing link (typed buttonUrl ignored)', async () => {
  seed(lands, [landing('group-2027')]);
  const r = await post(offerInput({ landing: '  Group-2027 ', buttonUrl: 'javascript:alert(1)' }));
  console.log('  linked ->', r.status, JSON.stringify({ landing: r.body.offer?.landing, buttonUrl: r.body.offer?.buttonUrl }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.offer.landing, 'group-2027');
  assert.equal(r.body.offer.buttonUrl, C.landingPath('group-2027'));
  assert.equal(r.body.offer.buttonUrl, '/offers/landing-group-2027.html');
  assert.equal(C.publicPayload(r.body.offer).offer.landing, 'group-2027');
});

test('a draft landing page may be linked (it is still being written)', async () => {
  seed(lands, [landing('draft-page', 'draft')]);
  const r = await post(offerInput({ landing: 'draft-page' }));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.offer.landing, 'draft-page');
});

test('refused with the exact messages: missing, archived, form on; nothing saved', async () => {
  seed(lands, [landing('old-page', 'archived'), landing('group-2027')]);
  const cases = [
    ['missing', { landing: 'no-such-page' }, C.LANDING_MESSAGES.gone],
    ['archived', { landing: 'old-page' }, C.LANDING_MESSAGES.archivedLink],
    ['form on', { landing: 'group-2027', form: { ...C.emptyOffer().form, enabled: true, fields: ['email'], required: ['email'] } }, C.LANDING_MESSAGES.formOn],
    ['path trick', { landing: '../offers' }, C.LANDING_MESSAGES.gone],
    ['not text', { landing: 42 }, C.LANDING_MESSAGES.gone],
    ['an object', { landing: { slug: 'group-2027' } }, C.LANDING_MESSAGES.gone]
  ];
  for (const [name, over, msg] of cases) {
    const r = await post(offerInput(over));
    console.log(`  ${name} ->`, r.status, JSON.stringify(r.body.fields?.landing));
    assert.equal(r.status, 400, name);
    assert.equal(r.body.fields.landing, msg, name);
  }
  assert.equal(offers.m.has('all'), false, 'nothing saved');
});

test('an unchanged link still saves after the page was archived, and while landing storage is down', async () => {
  seed(lands, [landing('group-2027')]);
  const a = await post(offerInput({ landing: 'group-2027' }));
  assert.equal(a.status, 201);
  seed(lands, [landing('group-2027', 'archived')]);
  const b = await post({ id: a.body.offer.id, updatedAt: a.body.offer.updatedAt, headline: 'New headline' });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.offer.landing, 'group-2027');
  lands.fail = true;
  const c = await post({ id: b.body.offer.id, updatedAt: b.body.offer.updatedAt, headline: 'Newer headline', landing: 'group-2027' });
  console.log('  unchanged link, store down ->', c.status, JSON.stringify({ landing: c.body.offer?.landing }));
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.offer.landing, 'group-2027');
});

test('a new link while landing storage is down: 503, nothing saved', async () => {
  lands.fail = true;
  const r = await post(offerInput({ landing: 'group-2027' }));
  console.log('  new link, store down ->', r.status, r.body.error);
  assert.equal(r.status, 503);
  assert.match(r.body.error, /nothing was saved/);
  assert.equal(offers.m.has('all'), false);
});

test('removing the link: landing null, the form may go back on', async () => {
  seed(lands, [landing('group-2027')]);
  const a = await post(offerInput({ landing: 'group-2027' }));
  const b = await post({ id: a.body.offer.id, updatedAt: a.body.offer.updatedAt, landing: null,
    buttonUrl: 'https://example.com/next', form: { ...C.emptyOffer().form, enabled: true, fields: ['email'], required: ['email'] } });
  console.log('  unlinked ->', b.status, JSON.stringify({ landing: b.body.offer?.landing, buttonUrl: b.body.offer?.buttonUrl }));
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.strictEqual(b.body.offer.landing, null);
  assert.equal(b.body.offer.buttonUrl, 'https://example.com/next');
  assert.equal(b.body.offer.form.enabled, true);
});

test('prepareOffer is pure: the landing comes only from ctx.landings', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const p = rules.prepareOffer(offerInput({ landing: 'group-2027' }), { offers: [], now, landings: new Map([['group-2027', landing('group-2027')]]) });
  assert.equal(p.ok, true);
  assert.equal(p.offer.landing, 'group-2027');
  const q = rules.prepareOffer(offerInput({ landing: 'group-2027' }), { offers: [], now });
  assert.equal(q.ok, false);
  assert.equal(q.fields.landing, C.LANDING_MESSAGES.gone);
  const w = rules.prepareOffer(offerInput({ landing: 'group-2027' }), { offers: [], now, landings: new Map([['group-2027', landing('other-slug')]]) });
  assert.equal(w.fields.landing, C.LANDING_MESSAGES.gone, 'a record whose slug differs is not accepted');
});

/* ---------- Part 2: the popup (real browser) ---------- */

async function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return await import(name); } catch { /* next */ }
  }
  const dirs = [process.env.YAVD_PLAYWRIGHT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'yavd-test-tools')].filter(Boolean);
  for (const d of dirs) {
    const entry = path.join(d, 'node_modules', 'playwright-core', 'index.mjs');
    if (fs.existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  return null;
}
function browserPath() {
  if (process.env.YAVD_BROWSER) return process.env.YAVD_BROWSER;
  const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']
    .find((p) => fs.existsSync(p));
  return edge || undefined;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
const pages = new Map();
const pw = await loadPlaywright();
let oldPanel = null;
try { oldPanel = execFileSync('git', ['show', `${OLD_PANEL_REF}:assets/offer-panel.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { oldPanel = null; }
let server, base, browser;

function serve(req, res) {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/offers/stats') { res.writeHead(204); res.end(); return; }
  if (pages.has(p)) { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); res.end(pages.get(p)); return; }
  if (p === '/__old/offer-panel.js') { res.writeHead(200, { 'content-type': MIME['.js'] }); res.end(oldPanel); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}
function addPage(name, o, { old = false } = {}) {
  let html = injectOffer(fs.readFileSync(path.join(ROOT, 'booth-proof.html'), 'utf8'), o, false);
  if (old) html = html.replace(`src="${C.INJECT.js}"`, 'src="/__old/offer-panel.js"');
  pages.set(`/t/${name}.html`, html);
  return `${base}/t/${name}.html`;
}
async function popupHtml(url) {
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await bctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await bctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.dismiss());
  try {
    await page.goto(url);
    await page.waitForSelector('.yavd-op-backdrop.is-open .yavd-op-dialog', { state: 'visible', timeout: 5000 });
    const html = await page.$eval('.yavd-op', (n) => n.outerHTML);
    const btn = await page.$eval('.yavd-op-dialog', (d) => { const a = d.querySelector('a.yavd-op-btn'); return a ? { href: a.getAttribute('href'), text: a.textContent } : null; });
    assert.deepEqual(errors, []);
    return { html: html.replace(/yavd-op-[a-z0-9]{6}(?=[-"])/g, 'UID'), btn };
  } finally { await bctx.close(); }
}

before(async () => {
  if (!pw) return;
  server = http.createServer(serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}`;
  browser = await pw.chromium.launch({ executablePath: browserPath(), headless: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});
const skip = () => (pw ? false : 'Playwright not found (see the header of offer-panel-image.test.mjs)');
const skipOld = () => skip() || (!oldPanel && `git show ${OLD_PANEL_REF} unavailable`);

const popupOffer = (over = {}) => ({
  id: 'off-4-6', name: 'Group 2027', slug: '', eyebrow: 'For planners', headline: 'Book your 2027 show',
  body: 'Lock in your crew early.', image: null, form: formOff(), buttonUrl: 'https://example.com/plain', landing: null, ...over
});

test('popup for a linked offer: the button goes to the landing page', { skip: skip() }, async () => {
  const { btn, html } = await popupHtml(addPage('linked', popupOffer({ landing: 'group-2027', buttonUrl: 'https://example.com/stale' })));
  console.log('  linked popup button ->', JSON.stringify(btn));
  assert.deepEqual(btn, { href: '/offers/landing-group-2027.html', text: 'See the details' });
  assert.ok(!html.includes('example.com/stale'));
});

test('popup with an unusable landing value falls back to the button link', { skip: skip() }, async () => {
  for (const bad of ['../../x', 'UPPER-Case', 'a', 42]) {
    const { btn } = await popupHtml(addPage(`bad-${String(bad).length}`, popupOffer({ landing: bad })));
    assert.deepEqual(btn, { href: 'https://example.com/plain', text: 'See the details' }, String(bad));
  }
});

test('popup for an unlinked offer is byte-identical to before (form off, form on, no landing key)', { skip: skipOld() }, async () => {
  const formOn = { ...C.emptyOffer().form, enabled: true, fields: ['name', 'email'], required: ['email'], buttonLabel: 'Book it' };
  const variants = [
    ['form-off', popupOffer()],
    ['form-on', popupOffer({ form: formOn, buttonUrl: null })],
    ['no-key', (() => { const o = popupOffer(); delete o.landing; return o; })()]
  ];
  for (const [name, o] of variants) {
    const before = await popupHtml(addPage(`${name}-old`, o, { old: true }));
    const now = await popupHtml(addPage(`${name}-new`, o));
    console.log(`  ${name}: ${now.html.length} chars, identical: ${now.html === before.html}`);
    assert.ok(before.html.length > 500, name);
    assert.equal(now.html, before.html, name);
  }
});

test('the edge payload a visitor gets carries the landing slug (or null)', () => {
  const read = (o) => JSON.parse(/<script[^>]*>([\s\S]*?)<\/script>/.exec(offerSnippet(o, false))[1]).offer;
  assert.equal(read(popupOffer({ landing: 'group-2027' })).landing, 'group-2027');
  const o = popupOffer(); delete o.landing;
  assert.strictEqual(read(o).landing, null);
});
