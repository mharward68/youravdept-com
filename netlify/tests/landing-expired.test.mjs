/* Session 4.10: the expiration popup on landing pages (Playwright, real browser).
 *
 * A small Node server wraps the real serving function (netlify/functions/
 * offer-landing.mjs) with in-memory landing and offer stores, and serves the
 * site folder for /assets/. Pages arrive exactly as visitors get them, with
 * the template's Content-Security-Policy header, so any inline style or
 * script the popup tried to use would show as a console error here.
 * The test picture is drawn in the browser and served from memory.
 * Analytics requests are answered with empty responses (never reach Google).
 *
 * Playwright is a test tool, not a site dependency. It is found, in order, at:
 * import('playwright-core'), import('playwright'), $YAVD_PLAYWRIGHT (a folder
 * holding node_modules/playwright-core), %LOCALAPPDATA%\yavd-test-tools.
 * Browser: $YAVD_BROWSER, else Edge if installed, else Playwright's own.
 * Screenshots go to ai/review/4.10/ (or $YAVD_SHOTS).
 *
 * Run: node --test netlify/tests/landing-expired.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const C = await import('../../shared/offer-contract.js');
const T = await import('../../shared/landing-template.js');
const landSt = await import('../functions/lib/landings-store.mjs');
const offSt = await import('../functions/lib/offers-store.mjs');
const mod = await import('../functions/offer-landing.mjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.YAVD_SHOTS || path.join(ROOT, 'ai', 'review', '4.10');
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const KEY = 'k'.repeat(32);
const PIC = 'd4'.repeat(16);
const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/* ---------- find Playwright and a browser ---------- */

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
  return [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((p) => fs.existsSync(p)) || undefined;
}

/* ---------- test records ---------- */

const SAMPLE_BODY = [
  'Exhibitors want proof that the show floor pays off. We film short, polished interviews at their booths while the show is running, then hand each one a finished clip they can post the same week.',
  '- Two minute booth interviews, filmed and edited on site\n- A branded clip for every participating exhibitor\n- A highlight reel your sales team can use to sell next year\'s floor',
  'You set the package price and keep the margin. We bring the crew, the gear and the edit suite.'
].join('\n\n');

function landing(over = {}) {
  return {
    id: 'l-' + (over.slug || 'exhibitor-video'), name: 'Exhibitor video 2027', slug: 'exhibitor-video',
    eyebrow: 'Exhibitor video offer',
    headline: 'Your exhibitors, on camera, [color=tealdark]selling next year\'s floor[/color]',
    body: SAMPLE_BODY,
    image: { id: PIC, alt: 'A conference stage lit in teal with two screens', width: 1600, height: 900 },
    ctaLabel: 'Book a 15 minute call', ctaUrl: 'https://calendar.app.google/Do7aNUGLhraagUKV6',
    status: 'live', previewKey: KEY,
    createdAt: '2026-11-23T15:00:00.000Z', updatedAt: '2026-11-23T15:00:00.000Z', archivedAt: null,
    ...over
  };
}
const offer = (over = {}) => ({ id: 'o1', name: 'Exhibitor video', draft: false, landing: 'exhibitor-video', startsAt: iso(-DAY), endsAt: iso(DAY), ...over });
const LONG_HEADLINE = 'Every general session, breakout and awards night in one fixed price production package, crewed and rehearsed before your attendees arrive';

/* ---------- stores ---------- */

const memStore = (initial) => ({ data: initial, async get() { return this.data === undefined ? null : structuredClone(this.data); } });
let lands = memStore([]), offs = memStore([]);
landSt._setLandingsStoreFactoryForTests(() => lands);
offSt._setOffersStoreFactoryForTests(() => offs);

function setData(landings, offers = []) {
  lands.data = landings;
  offs.data = offers;
  mod._clearCacheForTests();
}

/* ---------- server ---------- */

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
const extraPages = new Map();   // '/t/<name>.html' -> html (served with the landing CSP)
const hits = [];                // every path requested
let picture = null;
let server, base, browser;
const pw = await loadPlaywright();

async function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  hits.push(p);
  if (p.startsWith('/offers/')) {
    const r = await mod.default(new Request(base + req.url, { method: req.method }), { deploy: { context: 'production' } });
    const head = {};
    r.headers.forEach((v, k) => { head[k] = v; });
    res.writeHead(r.status, head);
    res.end(r.body ? Buffer.from(await r.arrayBuffer()) : undefined);
    return;
  }
  if (p === `/api/offers/image/${PIC}` && picture) {
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': picture.length });
    res.end(picture);
    return;
  }
  if (extraPages.has(p)) {
    res.writeHead(200, { 'content-type': MIME['.html'], 'content-security-policy': T.CSP, 'cache-control': 'no-store' });
    res.end(extraPages.get(p));
    return;
  }
  if (p === '/__draw') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end('<!doctype html><body></body>'); return; }
  const file = path.join(ROOT, decodeURIComponent(p));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const skip = !pw ? 'Playwright not found (see the header of this file)' : false;

before(async () => {
  if (skip) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  server = http.createServer((q, s) => { serve(q, s).catch((e) => { s.writeHead(500); s.end(String(e)); }); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await pw.chromium.launch({ executablePath: browserPath() });
  // Draw the test picture: a stage with two screens, in brand colours.
  const page = await browser.newPage();
  await page.goto(base + '/__draw');
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 900;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 900); sky.addColorStop(0, '#0B1A2E'); sky.addColorStop(1, '#152B4A');
    g.fillStyle = sky; g.fillRect(0, 0, 1600, 900);
    for (const x of [260, 800, 1340]) {
      const beam = g.createRadialGradient(x, 0, 10, x, 300, 520); beam.addColorStop(0, 'rgba(42,164,162,.55)'); beam.addColorStop(1, 'rgba(42,164,162,0)');
      g.fillStyle = beam; g.fillRect(0, 0, 1600, 900);
    }
    g.fillStyle = '#2AA4A2'; g.fillRect(170, 190, 520, 300); g.fillRect(910, 190, 520, 300);
    g.fillStyle = '#EAF6F6'; g.fillRect(185, 205, 490, 270); g.fillRect(925, 205, 490, 270);
    g.fillStyle = '#152B4A'; g.font = 'bold 54px Arial'; g.textAlign = 'center';
    g.fillText('YOUR EVENT', 430, 355); g.fillText('ON SCREEN', 1170, 355);
    g.fillStyle = '#1D3A61'; g.fillRect(0, 640, 1600, 260);
    g.fillStyle = '#2AA4A2'; g.fillRect(0, 636, 1600, 8);
    g.fillStyle = '#0B1A2E';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(40 + i * 40, 900, 26, Math.PI, 0); g.fill(); }
    return c.toDataURL('image/jpeg', 0.86);
  });
  picture = Buffer.from(dataUrl.split(',')[1], 'base64');
  await page.close();
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

beforeEach(() => { hits.length = 0; extraPages.clear(); });

/* ---------- helpers ---------- */

async function openPage(urlPath, { viewport = DESKTOP, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.route(/googletagmanager\.com|google-analytics\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const res = await page.goto(base + urlPath, { waitUntil: 'load' });
  return { ctx, page, res, problems };
}
const popup = (page) => page.locator('.yle-backdrop');
async function waitOpen(page) {
  await page.waitForSelector('.yle-backdrop.is-open', { timeout: 3000 });
}
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, name), fullPage });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { cls: a && a.className, tag: a && a.tagName, text: a && a.textContent.trim().slice(0, 40), inDialog: !!(a && a.closest('.yle-dialog')) };
});

/* ---------- running, before, draft: no popup ---------- */

test('running page: no expiration popup, no offer popup, button shown (desktop and phone)', { skip }, async () => {
  setData([landing()], [offer()]);
  for (const [vp, name] of [[DESKTOP, 'running-desktop.png'], [PHONE, 'running-phone.png']]) {
    const { ctx, page, res, problems } = await openPage('/offers/landing-exhibitor-video.html', { viewport: vp });
    assert.equal(res.headers()['x-yavd-landing'], 'running');
    await page.waitForTimeout(1200);
    assert.equal(await popup(page).count(), 0, 'no expiration popup');
    assert.equal(await page.locator('.yavd-op').count(), 0, 'no offer popup');
    assert.ok(!hits.some((h) => h.includes('landing-expired') || h.includes('offer-panel')), 'neither popup script requested');
    assert.equal(await page.locator('.yl-btn').getAttribute('href'), 'https://calendar.app.google/Do7aNUGLhraagUKV6');
    assert.ok(await page.locator('.yl-pic img').evaluate((i) => i.complete && i.naturalWidth === 1600), 'picture loaded');
    assert.ok(await noOverflow(page), 'no sideways scroll');
    await shot(page, name, true);
    assert.deepEqual(problems, []);
    await ctx.close();
  }
});

test('before and draft pages (seen with the preview key): no popup', { skip }, async () => {
  for (const [ls, os, want] of [
    [[landing()], [offer({ startsAt: iso(DAY), endsAt: iso(2 * DAY) })], 'preview'],
    [[landing({ status: 'draft' })], [], 'preview']
  ]) {
    setData(ls, os);
    const { ctx, page, res, problems } = await openPage(`/offers/landing-exhibitor-video.html?preview=${KEY}`);
    assert.equal(res.headers()['x-yavd-landing'], want);
    await page.waitForTimeout(1200);
    assert.equal(await popup(page).count(), 0);
    assert.ok(!hits.some((h) => h.includes('landing-expired')));
    assert.deepEqual(problems, []);
    await ctx.close();
  }
});

/* ---------- expired and archived: the popup ---------- */

test('expired page: popup opens after about 600 ms with the exact contract wording (desktop)', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  const { ctx, page, res, problems } = await openPage('/offers/landing-exhibitor-video.html');
  assert.equal(res.headers()['x-yavd-landing'], 'expired');
  assert.equal(await page.locator('.yl-btn').count(), 0, 'page button hidden when expired');
  // Built but not open straight away.
  await page.waitForSelector('.yle-backdrop', { state: 'attached' });
  assert.equal(await popup(page).evaluate((b) => b.hidden), true, 'hidden before the delay');
  const t0 = Date.now();
  await waitOpen(page);
  assert.ok(Date.now() - t0 < 2500);
  const d = page.locator('.yle-dialog');
  assert.equal(await d.getAttribute('role'), 'dialog');
  assert.equal(await d.getAttribute('aria-modal'), 'true');
  const labelId = await d.getAttribute('aria-labelledby');
  assert.equal(await page.locator('#' + labelId).textContent(), C.LANDING_EXPIRED.text, 'labelled by the contract text');
  assert.equal(await page.locator('.yle-text').textContent(), C.LANDING_EXPIRED.text);
  assert.equal(await page.locator('.yle-btn').textContent(), C.LANDING_EXPIRED.buttonLabel);
  assert.equal(await page.locator('.yle-btn').getAttribute('href'), C.LANDING_EXPIRED.buttonUrl);
  assert.equal(await page.locator('.yle-mail a').textContent(), C.LANDING_EXPIRED.email);
  assert.equal(await page.locator('.yle-mail a').getAttribute('href'), 'mailto:' + C.LANDING_EXPIRED.email);
  assert.equal(await page.locator('.yle-close').getAttribute('aria-label'), 'Close');
  // Every word in the dialog comes from the contract (plus the close mark).
  const words = (await d.innerText()).replace(/\u00d7/g, '').replace(/\s+/g, ' ').trim();
  assert.equal(words, [C.LANDING_EXPIRED.text, C.LANDING_EXPIRED.buttonLabel, C.LANDING_EXPIRED.email].join(' '));
  assert.ok((await focusInfo(page)).inDialog, 'focus moved into the dialog');
  assert.equal(await page.locator('main').getAttribute('inert'), '', 'page behind is inert');
  await page.waitForTimeout(400);   // let the fade finish for the picture
  await shot(page, 'expired-desktop.png');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('expired page on a phone: the popup fits the screen and the button is full width', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  const { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html', { viewport: PHONE });
  await waitOpen(page);
  await page.waitForTimeout(400);
  const box = await page.locator('.yle-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= PHONE.width, 'dialog inside the screen width');
  assert.ok(box.y >= 0 && box.y + box.height <= PHONE.height, 'dialog inside the screen height');
  const btn = await page.locator('.yle-btn').boundingBox();
  assert.ok(btn.width > box.width - 60, 'button spans the dialog');
  assert.ok(btn.height >= 44, 'button is a comfortable tap target');
  const close = await page.locator('.yle-close').boundingBox();
  assert.ok(close.width >= 44 && close.height >= 44, 'close is a comfortable tap target');
  assert.ok(await noOverflow(page));
  await shot(page, 'expired-phone.png');
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('archived page: the same popup', { skip }, async () => {
  setData([landing({ status: 'archived', archivedAt: '2026-11-23T16:00:00.000Z' })], [offer()]);
  const { ctx, page, res, problems } = await openPage('/offers/landing-exhibitor-video.html');
  assert.equal(res.headers()['x-yavd-landing'], 'archived');
  await waitOpen(page);
  assert.equal(await page.locator('.yle-text').textContent(), C.LANDING_EXPIRED.text);
  assert.equal(await page.locator('.yl-btn').count(), 0);
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ---------- closing ---------- */

test('closes on the close button, Escape and the backdrop; focus returns; page usable again', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  for (const how of ['button', 'escape', 'backdrop']) {
    const { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html');
    await waitOpen(page);
    if (how === 'button') await page.locator('.yle-close').click();
    if (how === 'escape') await page.keyboard.press('Escape');
    if (how === 'backdrop') await page.mouse.click(8, 8);
    assert.equal(await popup(page).evaluate((b) => b.hidden), true, how + ' closes');
    assert.equal(await page.locator('main').getAttribute('inert'), null, how + ': page no longer inert');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('yle-lock')), false, how + ': scroll lock off');
    const f = await focusInfo(page);
    assert.equal(f.tag, 'H1', how + ': focus goes to the page heading (nothing was focused before)');
    // The page scrolls again.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    assert.ok(await page.evaluate(() => window.scrollY > 0), how + ': page scrolls after close');
    // A click inside the dialog never closes it (checked once).
    if (how === 'button') assert.equal(await page.locator('.yle-backdrop').count(), 1);
    assert.deepEqual(problems, []);
    await ctx.close();
  }
  // Clicking the dialog itself (not the backdrop) leaves it open.
  const { ctx, page } = await openPage('/offers/landing-exhibitor-video.html');
  await waitOpen(page);
  await page.locator('.yle-text').click();
  assert.equal(await popup(page).evaluate((b) => b.hidden), false, 'a click on the text keeps it open');
  await ctx.close();
});

test('focus goes back to what was focused before it opened', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  const { ctx, page } = await openPage('/offers/landing-exhibitor-video.html');
  // Focus the logo link before the popup opens (inside the 600 ms).
  await page.locator('.yl-brand').focus();
  await waitOpen(page);
  await page.keyboard.press('Escape');
  assert.equal((await focusInfo(page)).cls, 'yl-brand');
  await ctx.close();
});

test('keyboard only: Tab stays inside the popup and cycles; Shift+Tab goes backwards', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  const { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html');
  await waitOpen(page);
  const seq = [];
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); seq.push((await focusInfo(page)).cls || (await focusInfo(page)).tag); }
  assert.deepEqual(seq, ['yle-close', 'yle-btn', 'A', 'yle-close'], 'close, Contact button, email, back to close');
  await page.keyboard.press('Shift+Tab');
  assert.equal((await focusInfo(page)).tag, 'A', 'Shift+Tab wraps to the email');
  // Focus cannot be pushed onto the page behind.
  await page.evaluate(() => document.querySelector('.yl-brand').focus());
  assert.ok((await focusInfo(page)).inDialog, 'focus pulled back into the dialog');
  // Enter on the close button closes it; Tab then walks the page.
  await page.locator('.yle-close').focus();
  await page.keyboard.press('Enter');
  assert.equal(await popup(page).evaluate((b) => b.hidden), true);
  await page.keyboard.press('Tab');
  assert.ok(!(await focusInfo(page)).inDialog, 'after close, Tab moves through the page');
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ---------- content edge cases (review screens) ---------- */

test('no picture: page still reads well (running, desktop)', { skip }, async () => {
  setData([landing({ image: null })], [offer()]);
  const { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html');
  assert.equal(await page.locator('.yl-pic').count(), 0);
  assert.ok(!hits.some((h) => h.startsWith('/api/offers/image/')), 'no picture request');
  await shot(page, 'no-picture.png', true);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('long headline on a phone: wraps, no sideways scroll, popup still fits when expired', { skip }, async () => {
  setData([landing({ headline: LONG_HEADLINE })], [offer()]);
  let { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html', { viewport: PHONE });
  assert.ok(await noOverflow(page));
  const h1 = await page.locator('h1').boundingBox();
  assert.ok(h1.width <= PHONE.width, 'headline inside the screen');
  await shot(page, 'long-headline.png', true);
  assert.deepEqual(problems, []);
  await ctx.close();
  setData([landing({ headline: LONG_HEADLINE })], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  ({ ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html', { viewport: PHONE }));
  await waitOpen(page);
  const box = await page.locator('.yle-dialog').boundingBox();
  assert.ok(box.y + box.height <= PHONE.height);
  assert.deepEqual(problems, []);
  await ctx.close();
});

test('reduced motion: no fade or slide, popup still opens and closes', { skip }, async () => {
  setData([landing()], [offer({ startsAt: iso(-3 * DAY), endsAt: iso(-DAY) })]);
  const { ctx, page, problems } = await openPage('/offers/landing-exhibitor-video.html', { reducedMotion: 'reduce' });
  await waitOpen(page);
  const t = await page.evaluate(() => {
    const b = getComputedStyle(document.querySelector('.yle-backdrop'));
    const d = getComputedStyle(document.querySelector('.yle-dialog'));
    return { b: b.transitionDuration, d: d.transitionDuration, tf: d.transform };
  });
  assert.equal(t.b, '0s');
  assert.equal(t.d, '0s');
  assert.equal(t.tf, 'none');
  await page.keyboard.press('Escape');
  assert.equal(await popup(page).evaluate((b) => b.hidden), true);
  assert.deepEqual(problems, []);
  await ctx.close();
});

/* ---------- defence: the script trusts nothing it reads ---------- */

function pageWithData(data) {
  const { html } = T.renderLanding(landing(), { state: 'expired', isPreview: true });
  const block = new RegExp(`(<script type="application/json" id="${T.EXPIRED_DATA_ID}">)[^<]*(</script>)`);
  assert.ok(block.test(html), 'template still writes the data block');
  return html.replace(block, (_, a, b) => a + C.payloadToScriptJson(data) + b);
}

test('bad data: no javascript: button, markup shown as text, broken or missing block shows nothing', { skip }, async () => {
  extraPages.set('/t/evil.html', pageWithData({ text: '<img src=x onerror="window.__pwned=1">Gone', buttonLabel: 'Go', buttonUrl: 'javascript:alert(1)', email: 'x" onclick="1', state: 'expired' }));
  extraPages.set('/t/http.html', pageWithData({ ...C.LANDING_EXPIRED, buttonUrl: 'http://example.com/', state: 'archived' }));
  extraPages.set('/t/running.html', pageWithData({ ...C.LANDING_EXPIRED, state: 'running' }));
  extraPages.set('/t/broken.html', T.renderLanding(landing(), { state: 'expired', isPreview: true }).html
    .replace(new RegExp(`(id="${T.EXPIRED_DATA_ID}">)[^<]*`), '$1{not json'));
  extraPages.set('/t/none.html', T.renderLanding(landing(), { state: 'expired', isPreview: true }).html
    .replace(new RegExp(`<script type="application/json" id="${T.EXPIRED_DATA_ID}">[^<]*</script>`), ''));

  let { ctx, page, problems } = await openPage('/t/evil.html');
  await waitOpen(page);
  assert.equal(await page.locator('.yle-text').textContent(), '<img src=x onerror="window.__pwned=1">Gone', 'shown as text');
  assert.equal(await page.locator('.yle-dialog img').count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.equal(await page.locator('.yle-btn').count(), 0, 'javascript: link left out');
  assert.equal(await page.locator('.yle-mail').count(), 0, 'bad email left out');
  assert.deepEqual(problems, []);
  await ctx.close();

  ({ ctx, page } = await openPage('/t/http.html'));
  await waitOpen(page);
  assert.equal(await page.locator('.yle-btn').count(), 0, 'http:// link left out');
  assert.equal(await page.locator('.yle-mail a').textContent(), C.LANDING_EXPIRED.email);
  await ctx.close();

  for (const name of ['running', 'broken', 'none']) {
    ({ ctx, page, problems } = await openPage(`/t/${name}.html`));
    await page.waitForTimeout(1000);
    assert.equal(await popup(page).count(), 0, name + ': no popup');
    assert.deepEqual(problems, [], name + ': no script error');
    await ctx.close();
  }
});

test('the popup script and style are plain ASCII and use no inline styles or HTML strings', { skip: false }, () => {
  const js = fs.readFileSync(path.join(ROOT, 'assets', 'landing-expired.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'assets', 'landing-expired.css'), 'utf8');
  assert.ok(/^[\x00-\x7f]*$/.test(js), 'JS is ASCII');
  assert.ok(/^[\x00-\x7f]*$/.test(css), 'CSS is ASCII');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\b|setAttribute\('style'|eval\(|new Function/.test(js), 'no HTML strings or inline styles');
  assert.ok(!js.includes('offer-panel') && !css.includes('yavd-op'), 'no code shared with the offer popup');
  assert.ok(!js.includes('no longer available'), 'the wording is not copied into the script');
  assert.equal(T.EXPIRED_ASSETS.js, '/assets/landing-expired.js');
  assert.equal(T.EXPIRED_ASSETS.css, '/assets/landing-expired.css');
});
