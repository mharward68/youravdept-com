/* Session 3.8: the popup shows the picture (Playwright, real browser).
 *
 * Serves the site folder from a small Node server, builds test pages with
 * injectOffer() on a copy of booth-proof.html, and drives them in Chromium
 * (Microsoft Edge on Michael's PC). Pictures are drawn in the browser and
 * served from memory at /api/offers/image/<id>, so no fixture files are needed.
 *
 * Playwright is a test tool, not a site dependency. It is found, in order, at:
 * import('playwright-core'), import('playwright'), $YAVD_PLAYWRIGHT (a folder
 * holding node_modules/playwright-core), %LOCALAPPDATA%\yavd-test-tools.
 * Browser: $YAVD_BROWSER, else Edge if installed, else Playwright's own.
 * Screenshots go to ai/review/3.8/ (or $YAVD_SHOTS).
 *
 * Run: node --test netlify/tests/offer-panel-image.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { injectOffer } from '../edge-lib/offer-edge.js';
import { INJECT } from '../../shared/offer-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.YAVD_SHOTS || path.join(ROOT, 'ai', 'review', '3.8');
const OLD_PANEL_REF = '54ec5de';   // the 1.2.0 popup, last change before Session 3.8
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ID_WIDE = 'a1'.repeat(16);
const ID_TALL = 'b2'.repeat(16);
const ID_GONE = 'c3'.repeat(16);

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
  const edge = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find((p) => fs.existsSync(p));
  return edge || undefined;
}

/* ---------- test offers ---------- */

const offer = (image, extra = {}) => ({
  id: 'off-3-8', name: 'Booth Proof pilot', slug: 'booth-proof-pilot',
  eyebrow: 'Booth Proof pilot',
  headline: 'See your booth before the show floor does',
  body: 'We render your booth, stage and screens to scale, so there are no surprises on move-in day.\n\n- A 3D walk-through you can share\n- Sightlines checked from every aisle\n- Fixed price, quoted in 48 hours',
  image,
  form: { enabled: true, fields: ['name', 'email', 'company', 'message'], required: ['name', 'email'],
          buttonLabel: 'Book my pilot', optionChoices: [], extraLabels: {}, thanks: 'Thank you. We will be in touch shortly.' },
  buttonUrl: null, ...extra
});
const imgFor = (placement, id = placement === 'top' ? ID_WIDE : ID_TALL) => ({
  id, alt: 'A conference stage lit in teal with two screens', placement,
  ...(id === ID_TALL ? { width: 960, height: 1200 } : { width: 1600, height: 900 })
});

/* ---------- server ---------- */

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
const pages = new Map();       // '/t/<name>.html' -> html
const images = new Map();      // id -> Buffer (jpeg)
const imageHits = [];          // ids requested, in order
let holdImages = false;
const held = [];
let oldPanel = null;
let server, base, browser;
const pw = await loadPlaywright();   // top level: the skip flags below are read when tests are defined
try { oldPanel = execFileSync('git', ['show', `${OLD_PANEL_REF}:assets/offer-panel.js`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { oldPanel = null; }

function releaseImages() { holdImages = false; while (held.length) held.shift()(); }

function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const m = /^\/api\/offers\/image\/([0-9a-f]{32})$/.exec(p);
  if (m) {
    imageHits.push(m[1]);
    const send = () => {
      const buf = images.get(m[1]);
      if (!buf) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"gone"}'); return; }
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': buf.length });
      res.end(buf);
    };
    if (holdImages) held.push(send); else send();
    return;
  }
  if (p === '/api/offers/stats') { res.writeHead(204); res.end(); return; }   // counts: not tested here
  if (pages.has(p)) { res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' }); res.end(pages.get(p)); return; }
  if (p === '/__old/offer-panel.js') { res.writeHead(200, { 'content-type': MIME['.js'] }); res.end(oldPanel); return; }
  if (p === '/__draw') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end('<!doctype html><body></body>'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

function addPage(name, o, { isTest = false, old = false } = {}) {
  let html = injectOffer(fs.readFileSync(path.join(ROOT, 'booth-proof.html'), 'utf8'), o, isTest);
  if (old) html = html.replace(`src="${INJECT.js}"`, 'src="/__old/offer-panel.js"');
  pages.set(`/t/${name}.html`, html);
  return `${base}/t/${name}.html`;
}

/* ---------- browser helpers ---------- */

async function newPage(viewport, { closedBefore = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  // fonts: answer with empty CSS so screenshots and console do not depend on the network
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (closedBefore) await ctx.addInitScript(() => localStorage.setItem('yavd_offer_closed_off-3-8', String(Date.now())));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const where = msg.location()?.url || '';
    if (/Failed to load resource/.test(msg.text()) && where.includes(`/api/offers/image/${ID_GONE}`)) return;   // the broken-picture test
    errors.push('console: ' + msg.text() + ' @ ' + where);
  });
  page.on('dialog', (d) => d.dismiss());
  return { ctx, page, errors };
}
const openDialog = (page) => page.waitForSelector('.yavd-op-backdrop.is-open .yavd-op-dialog', { state: 'visible', timeout: 5000 });
const imgLoaded = (page) => page.waitForFunction(() => {
  const i = document.querySelector('.yavd-op-img');
  return i && i.complete && i.naturalWidth > 0;
}, null, { timeout: 5000 });
const box = (page, sel) => page.$eval(sel, (n) => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });

async function drawJpeg(page, w, h) {
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0B1A30'); bg.addColorStop(1, '#152B4A');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const s = Math.min(w, h);
    // lighting wash
    const wash = g.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, s * 0.9);
    wash.addColorStop(0, 'rgba(42,164,162,.55)'); wash.addColorStop(1, 'rgba(42,164,162,0)');
    g.fillStyle = wash; g.fillRect(0, 0, w, h);
    // two screens
    g.fillStyle = '#EAF6F6';
    const sw = w * 0.3, sh = sw * 9 / 16, sy = h * 0.22;
    g.fillRect(w * 0.12, sy, sw, sh); g.fillRect(w * 0.58, sy, sw, sh);
    g.fillStyle = '#2AA4A2';
    g.fillRect(w * 0.12 + sw * 0.08, sy + sh * 0.3, sw * 0.5, sh * 0.12);
    g.fillRect(w * 0.58 + sw * 0.08, sy + sh * 0.3, sw * 0.5, sh * 0.12);
    // stage deck
    g.fillStyle = '#1D3A61'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = '#2AA4A2'; g.fillRect(0, h * 0.72, w, Math.max(4, h * 0.012));
    // lectern
    g.fillStyle = '#0B1A30'; g.fillRect(w * 0.46, h * 0.56, w * 0.08, h * 0.17);
    g.fillStyle = '#2AA4A2'; g.font = `700 ${Math.round(s * 0.05)}px Arial`; g.textAlign = 'center';
    g.fillText('YOUR AV DEPARTMENT', w / 2, h * 0.9);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  }, [w, h]);
  return Buffer.from(b64, 'base64');
}

/* ---------- setup ---------- */

before(async () => {
  if (!pw) return;
  server = http.createServer(serve);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}`;
  browser = await pw.chromium.launch({ executablePath: browserPath(), headless: true });
  const { ctx, page } = await newPage(DESKTOP);
  await page.goto(`${base}/__draw`);
  images.set(ID_WIDE, await drawJpeg(page, 1600, 900));
  images.set(ID_TALL, await drawJpeg(page, 960, 1200));
  await ctx.close();
  fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});
const skip = () => (pw ? false : 'Playwright not found (see the header of this file)');

/* ---------- tests ---------- */

for (const placement of ['top', 'left', 'right']) {
  for (const [vpName, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
    test(`${placement} on ${vpName}: placed, no jump, screenshot`, { skip: skip() }, async () => {
      const url = addPage(`${placement}-${vpName}`, offer(imgFor(placement)));
      const { ctx, page, errors } = await newPage(vp);
      holdImages = true;   // keep the picture back until the popup is measured
      try {
        await page.goto(url);
        await openDialog(page);
        await page.waitForTimeout(100);
        const cls = await page.$eval('.yavd-op-dialog', (d) => d.className);
        assert.match(cls, new RegExp(`\\bis-img-${placement}\\b`));
        const before = await box(page, '.yavd-op-dialog');
        const imgBefore = await box(page, '.yavd-op-img');
        assert.ok(imgBefore.h > 50, `space held before load (${imgBefore.h})`);
        releaseImages();
        await imgLoaded(page);
        await page.waitForTimeout(100);
        const afterB = await box(page, '.yavd-op-dialog');
        const imgAfter = await box(page, '.yavd-op-img');
        assert.ok(Math.abs(afterB.h - before.h) <= 1, `dialog height ${before.h} -> ${afterB.h}`);
        assert.ok(Math.abs(imgAfter.h - imgBefore.h) <= 1, `picture height ${imgBefore.h} -> ${imgAfter.h}`);

        const dialog = afterB;
        const head = await box(page, '.yavd-op-headline');
        const close = await box(page, '.yavd-op-close');
        const attrs = await page.$eval('.yavd-op-img', (i) => ({ src: i.getAttribute('src'), alt: i.alt, w: i.getAttribute('width'), h: i.getAttribute('height'), fit: getComputedStyle(i).objectFit }));
        assert.equal(attrs.src, `/api/offers/image/${imgFor(placement).id}`);
        assert.equal(attrs.alt, 'A conference stage lit in teal with two screens');
        assert.notEqual(attrs.fit, 'cover');
        assert.ok(imgAfter.y + imgAfter.h <= dialog.y + dialog.h + 1, 'picture inside the dialog');
        // the headline never sits on the picture
        const overlapX = Math.min(head.x + head.w, imgAfter.x + imgAfter.w) - Math.max(head.x, imgAfter.x);
        const overlapY = Math.min(head.y + head.h, imgAfter.y + imgAfter.h) - Math.max(head.y, imgAfter.y);
        assert.ok(overlapX <= 0 || overlapY <= 0, 'headline and picture do not overlap');

        if (vpName === 'desktop' && placement !== 'top') {
          assert.ok(Math.abs(dialog.w - 720) <= 1, `side dialog is 720 wide (${dialog.w})`);
          const share = imgAfter.w / (dialog.w - 60);
          assert.ok(share > 0.3 && share < 0.42, `picture column about 38% (${share.toFixed(2)})`);
          if (placement === 'left') assert.ok(imgAfter.x + imgAfter.w <= head.x, 'picture left of text');
          else assert.ok(imgAfter.x >= head.x + head.w, 'picture right of text');
        } else {
          // top banner, or any placement on a phone: full width, above the text
          assert.ok(imgAfter.y + imgAfter.h <= head.y, 'picture above the headline');
          assert.ok(Math.abs(imgAfter.w - dialog.w) <= 1, `full width (${imgAfter.w} vs ${dialog.w})`);
          if (vpName === 'desktop') assert.ok(Math.abs(dialog.w - 520) <= 1, `top keeps 520 (${dialog.w})`);
        }
        assert.ok(close.y >= dialog.y, 'close button still inside');
        await page.screenshot({ path: path.join(SHOTS, `${placement}-${vpName}.png`) });
        assert.deepEqual(errors, []);
      } finally { releaseImages(); await ctx.close(); }
    });
  }
}

test('broken picture address: popup falls back to the plain text popup', { skip: skip() }, async () => {
  const url = addPage('broken', offer(imgFor('left', ID_GONE)));
  const { ctx, page, errors } = await newPage(DESKTOP);
  try {
    await page.goto(url);
    await openDialog(page);
    await page.waitForFunction(() => !document.querySelector('.yavd-op-media'), null, { timeout: 5000 });
    const cls = await page.$eval('.yavd-op-dialog', (d) => d.className);
    assert.doesNotMatch(cls, /is-img-/);
    const w = (await box(page, '.yavd-op-dialog')).w;
    assert.ok(Math.abs(w - 520) <= 1, `back to 520 wide (${w})`);
    assert.ok(imageHits.includes(ID_GONE));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('bad picture details never build an address', { skip: skip() }, async () => {
  const bad = [
    { ...imgFor('top'), id: '../../offers' },
    { ...imgFor('top'), id: 'A1'.repeat(16) },
    { ...imgFor('top'), width: 0 },
    { ...imgFor('top'), height: '900' },
    'not an object'
  ];
  for (const [i, image] of bad.entries()) {
    const url = addPage(`bad-${i}`, offer(image));
    const { ctx, page, errors } = await newPage(DESKTOP);
    try {
      const hitsBefore = imageHits.length;
      await page.goto(url);
      await openDialog(page);
      assert.equal(await page.$('.yavd-op-media'), null, `case ${i}: no picture block`);
      assert.equal(imageHits.length, hitsBefore, `case ${i}: no request`);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  }
});

test('unknown placement falls back to the top banner', { skip: skip() }, async () => {
  const url = addPage('odd-place', offer({ ...imgFor('top'), placement: 'middle' }));
  const { ctx, page } = await newPage(DESKTOP);
  try {
    await page.goto(url);
    await openDialog(page);
    assert.match(await page.$eval('.yavd-op-dialog', (d) => d.className), /\bis-img-top\b/);
  } finally { await ctx.close(); }
});

test('no picture: popup markup is exactly the 1.2.0 popup', { skip: skip() || (!oldPanel && `git show ${OLD_PANEL_REF} unavailable`) }, async () => {
  const snapshot = async (old) => {
    const url = addPage(old ? 'none-old' : 'none-new', offer(null), { old });
    const { ctx, page, errors } = await newPage(DESKTOP);
    try {
      await page.goto(url);
      await openDialog(page);
      const html = await page.$eval('.yavd-op', (n) => n.outerHTML);
      assert.deepEqual(errors, []);
      return html.replace(/yavd-op-[a-z0-9]{6}(?=[-"])/g, 'UID');
    } finally { await ctx.close(); }
  };
  const before = await snapshot(true);
  const now = await snapshot(false);
  assert.ok(before.length > 1000);
  assert.equal(now, before);
});

test('keyboard: Tab order and Escape are the same with and without a picture', { skip: skip() }, async () => {
  const walk = async (image, vp) => {
    const url = addPage(`kbd-${image ? image.placement : 'none'}-${vp.width}`, offer(image));
    const { ctx, page, errors } = await newPage(vp);
    try {
      await page.goto(url);
      await openDialog(page);
      const order = [];
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        order.push(await page.evaluate(() => { const a = document.activeElement; return a.name || a.className || a.tagName; }));
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.yavd-op-backdrop', { state: 'hidden' });
      const tabShown = await page.$eval('.yavd-op-tab', (t) => !t.hidden && document.activeElement === t);
      assert.deepEqual(errors, []);
      return { order, tabShown };
    } finally { await ctx.close(); }
  };
  for (const vp of [DESKTOP, PHONE]) {
    const plain = await walk(null, vp);
    assert.equal(plain.tabShown, true);
    assert.deepEqual(plain.order.slice(0, 7), ['yavd-op-close', 'name', 'email', 'company', 'message', 'yavd-op-btn', 'yavd-op-close']);
    for (const p of ['top', 'left', 'right']) assert.deepEqual(await walk(imgFor(p), vp), plain, `${p} at ${vp.width}`);
  }
});

test('closed recently: the picture downloads only when the visitor reopens', { skip: skip() }, async () => {
  const url = addPage('closed-before', offer(imgFor('top')));
  const { ctx, page, errors } = await newPage(DESKTOP, { closedBefore: true });
  try {
    const hitsBefore = imageHits.length;
    await page.goto(url);
    await page.waitForSelector('.yavd-op-tab', { state: 'visible' });
    await page.waitForTimeout(2000);   // longer than the 1.5 s open delay
    assert.equal(imageHits.length, hitsBefore, 'no request while only the tab shows');
    await page.click('.yavd-op-tab');
    await openDialog(page);
    await imgLoaded(page);
    assert.equal(imageHits.length, hitsBefore + 1);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('thank-you screen drops the picture', { skip: skip() }, async () => {
  const url = addPage('thanks', offer(imgFor('left')));
  const { ctx, page, errors } = await newPage(DESKTOP);
  await page.route('**/offers-form.html', (r) => r.fulfill({ status: 200, body: 'ok' }));
  try {
    await page.goto(url);
    await openDialog(page);
    await imgLoaded(page);
    await page.fill('input[name="name"]', 'Pat Test');
    await page.fill('input[name="email"]', 'pat@example.com');
    await page.click('.yavd-op-form .yavd-op-btn');
    await page.waitForSelector('.yavd-op-thanks');
    assert.equal(await page.$('.yavd-op-media'), null);
    assert.doesNotMatch(await page.$eval('.yavd-op-dialog', (d) => d.className), /is-img-/);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('carried item: phone preview badge clears the close button', { skip: skip() }, async () => {
  const url = addPage('badge-phone', offer(null), { isTest: true });
  const { ctx, page, errors } = await newPage(PHONE);
  try {
    await page.goto(url);
    await openDialog(page);
    const badge = await box(page, '.yavd-op-test');
    const close = await box(page, '.yavd-op-close');
    const overlapX = Math.min(badge.x + badge.w, close.x + close.w) - Math.max(badge.x, close.x);
    const overlapY = Math.min(badge.y + badge.h, close.y + close.h) - Math.max(badge.y, close.y);
    assert.ok(overlapX <= 0 || overlapY <= 0, `badge ${JSON.stringify(badge)} vs close ${JSON.stringify(close)}`);
    await page.screenshot({ path: path.join(SHOTS, 'badge-phone.png') });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
