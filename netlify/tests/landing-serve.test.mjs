// YAVD Offers Module: serving landing pages (Session 4.9, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landing-serve.test.mjs
// In-memory stand-ins for the landing and offer stores; never touches real storage.
// Also proves the popup and takedown edge functions skip /offers/ and that every
// existing page is still treated exactly as before.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const C = await import('../../shared/offer-contract.js');
const T = await import('../../shared/landing-template.js');
const landSt = await import('../functions/lib/landings-store.mjs');
const offSt = await import('../functions/lib/offers-store.mjs');
const edge = await import('../edge-lib/offer-edge.js');
const mod = await import('../functions/offer-landing.mjs');
const fn = mod.default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEY = 'p'.repeat(32);
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/* ---------- in-memory stores ---------- */
function store(initial) {
  const s = { data: initial, reads: 0, async get() { s.reads++; return s.data === undefined ? null : structuredClone(s.data); } };
  return s;
}
const down = () => ({ reads: 0, async get() { throw new Error('blobs down: secret detail'); } });

let lands, offs, opened;
beforeEach(() => {
  lands = store([]);
  offs = store([]);
  opened = [];
  landSt._setLandingsStoreFactoryForTests((ctx) => { opened.push(['landings', ctx]); return lands; });
  offSt._setOffersStoreFactoryForTests((ctx) => { opened.push(['offers', ctx]); return offs; });
  mod._clearCacheForTests();
});

function landing(over = {}) {
  return {
    id: 'l-' + (over.slug || 'group-2026'), name: 'Group 2026', slug: 'group-2026',
    eyebrow: 'Limited offer', headline: 'Half price for groups', body: 'Copy.\n\n- One\n- Two',
    image: null, ctaLabel: 'Book a call', ctaUrl: 'https://calendar.app.google/Do7aNUGLhraagUKV6',
    status: 'live', previewKey: KEY,
    createdAt: '2026-11-23T15:00:00.000Z', updatedAt: '2026-11-23T15:00:00.000Z', archivedAt: null,
    ...over
  };
}
function offer(over = {}) {
  return { id: 'o1', name: 'Offer', draft: false, landing: 'group-2026', startsAt: iso(-DAY), endsAt: iso(DAY), ...over };
}

const ctxOf = (c) => ({ deploy: { context: c } });
async function get(p, { method = 'GET', ctx = 'production', headers = {}, host = 'https://youravdept.com' } = {}) {
  const res = await fn(new Request(host + p, { method, headers }), ctxOf(ctx));
  const body = res.body ? await res.text() : '';
  return { res, body, state: res.headers.get('x-yavd-landing') };
}

/* ---------- each state ---------- */

test('running: the page, with the template headers', async () => {
  lands.data = [landing()];
  offs.data = [offer()];
  const { res, body, state } = await get('/offers/landing-group-2026.html');
  assert.equal(res.status, 200);
  assert.equal(state, 'running');
  assert.ok(body.includes('<h1>Half price for groups</h1>'));
  assert.ok(body.includes('class="yl-btn"'));
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(res.headers.get('content-security-policy'), T.CSP);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(res.headers.get('x-yavd-landing-src'), null, 'no source header on production');
  // Exactly what the renderer gives.
  assert.equal(body, T.renderLanding(landing(), { state: 'running' }).html);
});

test('a live page with no linked offer is running', async () => {
  lands.data = [landing()];
  const { res, state } = await get('/offers/landing-group-2026.html');
  assert.equal(res.status, 200);
  assert.equal(state, 'running');
});

test('the address: with and without .html, any case, trailing slash', async () => {
  lands.data = [landing()];
  for (const p of ['/offers/landing-group-2026.html', '/offers/landing-group-2026', '/offers/landing-group-2026/',
    '/offers/LANDING-Group-2026.HTML', '/offers/landing-group-2026.html?utm_source=linkedin']) {
    const { res, state } = await get(p);
    assert.equal(res.status, 200, p);
    assert.equal(state, 'running', p);
  }
});

test('expired: the page with the expiration data and no button', async () => {
  lands.data = [landing()];
  offs.data = [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })];
  const { res, body, state } = await get('/offers/landing-group-2026.html');
  assert.equal(res.status, 200);
  assert.equal(state, 'expired');
  assert.ok(body.includes(`id="${T.EXPIRED_DATA_ID}"`));
  assert.equal(body.includes('class="yl-btn"'), false);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
});

test('archived: the page with the expiration data, even with a running offer', async () => {
  lands.data = [landing({ status: 'archived', archivedAt: '2026-11-23T16:00:00.000Z' })];
  offs.data = [offer()];
  const { res, body, state } = await get('/offers/landing-group-2026');
  assert.equal(res.status, 200);
  assert.equal(state, 'archived');
  assert.ok(body.includes(`id="${T.EXPIRED_DATA_ID}"`));
});

test('before: 302 to the home page, never cached; a valid preview key shows it', async () => {
  lands.data = [landing()];
  offs.data = [offer({ startsAt: iso(DAY), endsAt: iso(3 * DAY) })];
  const r = await get('/offers/landing-group-2026.html');
  assert.equal(r.res.status, 302);
  assert.equal(r.res.headers.get('location'), '/');
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
  assert.equal(r.state, 'before');
  assert.equal(r.body, '');
  const p = await get(`/offers/landing-group-2026.html?preview=${KEY}`);
  assert.equal(p.res.status, 200);
  assert.equal(p.state, 'preview');
  assert.equal(p.res.headers.get('cache-control'), 'private, no-store');
  assert.ok(p.body.includes('class="yl-btn"'), 'looks like the running page');
});

test('draft: 302 without the key or with a wrong one; the page with the right key', async () => {
  lands.data = [landing({ status: 'draft' })];
  for (const q of ['', '?preview=', `?preview=${'q'.repeat(32)}`, `?preview=${KEY}x`, `?preview=${KEY.slice(1)}`, `?PREVIEW=${KEY}`]) {
    const r = await get(`/offers/landing-group-2026.html${q}`);
    assert.equal(r.res.status, 302, q);
    assert.equal(r.res.headers.get('location'), '/', q);
    assert.equal(r.state, 'draft', q);
    assert.equal(r.res.headers.get('cache-control'), 'no-store', q);
  }
  const p = await get(`/offers/landing-group-2026.html?preview=${KEY}`);
  assert.equal(p.res.status, 200);
  assert.equal(p.state, 'preview');
  assert.equal(p.res.headers.get('cache-control'), 'private, no-store');
  assert.equal(p.res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok(p.body.includes('Draft preview'));
  assert.equal(p.body.includes('googletagmanager'), false, 'no analytics on a preview');
  assert.equal(p.body.includes(KEY), false, 'the key is never written into the page');
});

test('a preview key does not change running, expired or archived pages', async () => {
  lands.data = [landing()];
  offs.data = [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })];
  const r = await get(`/offers/landing-group-2026.html?preview=${KEY}`);
  assert.equal(r.state, 'expired');
  assert.equal(r.res.headers.get('cache-control'), 'public, max-age=60');
});

test('unknown slug: 302 to the home page', async () => {
  lands.data = [landing()];
  const r = await get('/offers/landing-nobody-here.html');
  assert.equal(r.res.status, 302);
  assert.equal(r.res.headers.get('location'), '/');
  assert.equal(r.state, 'unknown');
  assert.equal(r.res.headers.get('cache-control'), 'no-store');
});

test('anything else under /offers/ is a 404, never cached, never indexed', async () => {
  lands.data = [landing()];
  for (const p of ['/offers/', '/offers/other.html', '/offers/landing-.html', '/offers/landing-ab.html', '/offers/landing-Bad_Slug.html',
    '/offers/landing-group-2026.htm', '/offers/landing-a%2fb.html', '/offers/landing-%2e%2e.html', '/offers/x/landing-group-2026.html',
    '/offers/landing-group-2026.html/extra', '/offers/landing-group--2026.html']) {
    const r = await get(p);
    assert.equal(r.res.status, 404, p);
    assert.equal(r.res.headers.get('cache-control'), 'no-store', p);
    assert.equal(r.res.headers.get('x-robots-tag'), 'noindex, nofollow', p);
    assert.equal(r.body, 'Not found', p);
  }
  assert.equal(lands.reads, 0, 'a bad address never reads storage');
});

/* ---------- storage trouble ---------- */

test('landing store unreadable and nothing cached: quiet 302 to the home page', async () => {
  landSt._setLandingsStoreFactoryForTests(() => down());
  const r = await get('/offers/landing-group-2026.html');
  assert.equal(r.res.status, 302);
  assert.equal(r.res.headers.get('location'), '/');
  assert.equal(r.state, 'store-failed');
  assert.equal(r.body.includes('secret'), false);
});

test('landing store cannot even be opened: the same quiet 302', async () => {
  landSt._setLandingsStoreFactoryForTests(() => { throw new Error('no blobs context'); });
  const r = await get('/offers/landing-group-2026.html');
  assert.equal(r.res.status, 302);
  assert.equal(r.state, 'store-failed');
});

test('landing store stored something that is not a list: quiet 302', async () => {
  lands.data = { not: 'a list' };
  const r = await get('/offers/landing-group-2026.html');
  assert.equal(r.res.status, 302);
  assert.equal(r.state, 'store-failed');
});

test('offers store unreadable: the page shows as running, without the expiration popup', async () => {
  lands.data = [landing()];
  offSt._setOffersStoreFactoryForTests(() => down());
  const r = await get('/offers/landing-group-2026.html');
  assert.equal(r.res.status, 200);
  assert.equal(r.state, 'running');
  assert.equal(r.body.includes(T.EXPIRED_DATA_ID), false);
  assert.ok(r.body.includes('class="yl-btn"'));
});

test('test switch x-yavd-test-store-fail: 1 forces the failure on test deploys only', async () => {
  lands.data = [landing()];
  const t = await get('/offers/landing-group-2026.html', { ctx: 'branch-deploy', headers: { 'x-yavd-test-store-fail': '1' } });
  assert.equal(t.res.status, 302);
  assert.equal(t.state, 'store-failed');
  assert.equal(t.res.headers.get('x-yavd-landing-src'), 'failed/-; ctx=branch-deploy');
  const p = await get('/offers/landing-group-2026.html', { ctx: 'production', headers: { 'x-yavd-test-store-fail': '1' } });
  assert.equal(p.res.status, 200, 'ignored on production');
  assert.equal(p.state, 'running');
});

test('the right store for each deploy, and the source header on test deploys', async () => {
  lands.data = [landing()];
  const r = await get('/offers/landing-group-2026.html', { ctx: 'branch-deploy', host: 'https://offers--your-av-dept.netlify.app' });
  assert.equal(r.res.status, 200);
  assert.deepEqual(opened, [['landings', 'branch-deploy'], ['offers', 'branch-deploy']]);
  assert.equal(r.res.headers.get('x-yavd-landing-src'), 'store/store; ctx=branch-deploy');
  assert.ok(r.body.includes('content="https://offers--your-av-dept.netlify.app/offers/landing-group-2026.html"'));
  assert.equal(landSt.landingsStoreName('branch-deploy'), 'offer-landings-test');
  assert.equal(landSt.landingsStoreName('production'), 'offer-landings');
});

test('one read per store per minute per instance: a save shows after the cache refreshes', async () => {
  lands.data = [landing()];
  await get('/offers/landing-group-2026.html');
  await get('/offers/landing-group-2026.html');
  assert.equal(lands.reads, 1);
  assert.equal(offs.reads, 1);
  lands.data = [landing({ headline: 'Changed' })];
  const cached = await get('/offers/landing-group-2026.html');
  assert.ok(cached.body.includes('Half price for groups'), 'served from the 60 s cache');
  mod._clearCacheForTests();
  const fresh = await get('/offers/landing-group-2026.html');
  assert.ok(fresh.body.includes('<h1>Changed</h1>'));
});

/* ---------- methods ---------- */

test('HEAD: same status and headers, no body', async () => {
  lands.data = [landing()];
  const g = await get('/offers/landing-group-2026.html');
  const h = await get('/offers/landing-group-2026.html', { method: 'HEAD' });
  assert.equal(h.res.status, 200);
  assert.equal(h.body, '');
  assert.equal(h.state, 'running');
  for (const k of ['content-type', 'cache-control', 'x-robots-tag', 'content-security-policy']) {
    assert.equal(h.res.headers.get(k), g.res.headers.get(k), k);
  }
  const h404 = await get('/offers/nothing.html', { method: 'HEAD' });
  assert.equal(h404.res.status, 404);
  assert.equal(h404.body, '');
});

test('other methods: 405', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const r = await get('/offers/landing-group-2026.html', { method });
    assert.equal(r.res.status, 405, method);
    assert.equal(r.res.headers.get('allow'), 'GET, HEAD');
  }
});

test('preview key comparison', () => {
  assert.equal(mod.previewKeyMatches(KEY, KEY), true);
  assert.equal(mod.previewKeyMatches(KEY, 'q'.repeat(32)), false);
  assert.equal(mod.previewKeyMatches(KEY, KEY + 'x'), false);
  assert.equal(mod.previewKeyMatches(undefined, undefined), false);
  assert.equal(mod.previewKeyMatches('', ''), false);
  assert.equal(mod.previewKeyMatches(KEY, null), false);
});

test('function route: /offers/*, GET and HEAD', () => {
  assert.deepEqual(mod.config, { path: '/offers/*', method: ['GET', 'HEAD'] });
  const p = new URLPattern({ pathname: mod.config.path });
  assert.ok(p.test({ pathname: C.landingPath('group-2026') }));
  assert.equal(p.test({ pathname: '/offers-form.html' }), false);
  assert.equal(p.test({ pathname: '/offer/group-2026' }), false);
});

/* ---------- the popup and takedown edge functions skip /offers/ ---------- */

const pagePaths = () => {
  const out = [];
  for (const dir of ['', 'library', 'field-notes']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      if (!f.endsWith('.html')) continue;
      const p = `/${dir ? dir + '/' : ''}${f}`;
      out.push(p, p.replace(/\.html$/, ''));
    }
  }
  out.push('/', '/just-the-audio/', '/just-the-audio/app/');
  return out;
};

const excludedBy = (cfg, pathname) => cfg.excludedPath.some((x) => new URLPattern({ pathname: x }).test({ pathname }));

test('skip list: /offers/ is never a page to the edge, every existing page still is', () => {
  for (const p of ['/offers/landing-group-2026.html', '/offers/landing-group-2026', '/OFFERS/landing-x.html', '/offers/']) {
    assert.equal(edge.looksLikePage(p), false, p);
  }
  const pages = pagePaths();
  assert.ok(pages.length > 60, `found ${pages.length} page addresses`);
  for (const p of pages) {
    if (p.startsWith('/offer-admin') || p.startsWith('/offers-form')) continue;   // skipped before 4.9 too
    assert.equal(edge.looksLikePage(p), true, p);
  }
});

test('the skip list changed by exactly one entry, so every other address decides as before', async () => {
  const old = execFileSync('git', ['show', 'session-4.8:netlify/edge-lib/offer-edge.js'], { cwd: ROOT, encoding: 'utf8' });
  const oldList = JSON.parse(old.match(/const SKIP_PREFIXES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const now = fs.readFileSync(path.join(ROOT, 'netlify/edge-lib/offer-edge.js'), 'utf8');
  const newList = JSON.parse(now.match(/const SKIP_PREFIXES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  assert.deepEqual(newList.filter((x) => x !== '/offers/'), oldList);
  assert.ok(newList.includes('/offers/'));
  // Old and new looksLikePage agree on every existing page and asset-like address.
  const oldFn = (p) => {
    const s = String(p || '/').toLowerCase();
    if (oldList.some((x) => s.startsWith(x))) return false;
    const last = s.split('/').pop();
    return !last.includes('.') || last.endsWith('.html');
  };
  for (const p of [...pagePaths(), '/assets/offer-panel.js', '/api/offers', '/offer/x', '/offers-form.html', '/offer-admin', '/favicon.ico', '/michaelh.vcf']) {
    assert.equal(edge.looksLikePage(p), oldFn(p), p);
  }
});

test('offer-page and page-takedown exclude /offers/* and still run on every existing page', async () => {
  const page = (await import('../edge-functions/offer-page.js')).config;
  const takedown = (await import('../edge-functions/page-takedown.js')).config;
  for (const cfg of [page, takedown]) {
    assert.equal(cfg.path, '/*');
    assert.ok(cfg.excludedPath.includes('/offers/*'));
    assert.equal(excludedBy(cfg, C.landingPath('group-2026')), true);
    assert.equal(excludedBy(cfg, '/offers/landing-group-2026'), true);
  }
  for (const p of pagePaths()) {
    if (/^\/(offer-admin|offers-form|admin|site-map)/.test(p)) continue;        // excluded before 4.9 too
    assert.equal(excludedBy(page, p), false, `offer-page ${p}`);
    assert.equal(excludedBy(takedown, p), false, `takedown ${p}`);
  }
});

test('the edge functions changed only their excludedPath line', () => {
  for (const f of ['netlify/edge-functions/offer-page.js', 'netlify/edge-functions/page-takedown.js']) {
    const diff = execFileSync('git', ['diff', '--unified=0', 'session-4.8', '--', f], { cwd: ROOT, encoding: 'utf8' });
    const changed = diff.split('\n').filter((l) => /^[+-](?![+-])/.test(l));
    assert.equal(changed.length, 2, `${f}:\n${changed.join('\n')}`);
    assert.ok(changed.every((l) => l.includes('excludedPath') || l.includes("'/offer/*'")), f);
    assert.ok(changed[1].includes("'/offers/*'"), f);
  }
});

test('netlify.toml: noindex header rule for /offers/*', () => {
  const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
  assert.match(toml, /\[\[headers\]\]\s*\n\s*for = "\/offers\/\*"\s*\n\s*\[headers\.values\]\s*\n\s*X-Robots-Tag = "noindex, nofollow"/);
  assert.equal(/from = "\/offers\/\*"/.test(toml), false, 'no forced rewrite unless 4.15 shows it is needed');
});

test('no static file sits under /offers/ (the function must win the route)', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'offers')), false);
});
