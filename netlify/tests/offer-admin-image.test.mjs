/* Session 3.9: the editor's Image block (Playwright, real browser).
 *
 * Local harness: a small Node server wraps the REAL function handlers
 * (offers, pages, stats, picture view and upload, login) with in-memory
 * Blobs stores, and serves the site folder. The admin page runs in Chromium
 * (Microsoft Edge on Michael's PC). Test pictures are drawn in the browser,
 * so no new fixture files are needed (tiny-10.png comes from fixtures/).
 *
 * Playwright is a test tool, not a site dependency. It is found, in order, at:
 * import('playwright-core'), import('playwright'), $YAVD_PLAYWRIGHT (a folder
 * holding node_modules/playwright-core), %LOCALAPPDATA%\yavd-test-tools.
 * Browser: $YAVD_BROWSER, else Edge if installed, else Playwright's own.
 * Screenshots go to ai/review/3.9/ (or $YAVD_SHOTS).
 *
 * Run: node --test netlify/tests/offer-admin-image.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHOTS = process.env.YAVD_SHOTS || path.join(ROOT, 'ai', 'review', '3.9');
const FIX = path.join(ROOT, 'netlify', 'tests', 'fixtures');

const C = await import('../../shared/offer-contract.js');
const auth = await import('../functions/lib/offers-auth.mjs');
const st = await import('../functions/lib/offers-store.mjs');
const imgStore = await import('../functions/lib/offer-images-store.mjs');
const statsLib = await import('../functions/lib/offers-stats.mjs');
const { checkImage, IMAGE_MESSAGES } = await import('../functions/lib/offer-image.mjs');
const HANDLERS = {
  offers: (await import('../functions/offers.mjs')).default,
  pages: (await import('../functions/offers-pages.mjs')).default,
  stats: (await import('../functions/offers-stats.mjs')).default,
  image: (await import('../functions/offer-image.mjs')).default,
  upload: (await import('../functions/offer-image-upload.mjs')).default,
  login: (await import('../functions/offers-login.mjs')).default,
  logout: (await import('../functions/offers-logout.mjs')).default
};

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

/* ---------- in-memory Blobs (copied, never imported from another test file) ---------- */

function memoryBlobs() {
  const m = new Map();
  let n = 0;
  const copy = (v) => (v instanceof Uint8Array || v instanceof ArrayBuffer ? new Uint8Array(v).slice() : v);
  return {
    m,
    async get(k, o = {}) { const e = m.get(k); if (!e) return null; return o.type === 'json' ? JSON.parse(e.v) : e.v; },
    async getWithMetadata(k, o = {}) {
      const e = m.get(k);
      if (!e) return null;
      const data = o.type === 'json' ? JSON.parse(e.v) : o.type === 'arrayBuffer' ? copy(e.v).buffer : e.v;
      return { data, etag: e.etag, metadata: structuredClone(e.meta || {}) };
    },
    async getMetadata(k) { const e = m.get(k); return e ? { metadata: structuredClone(e.meta || {}), etag: e.etag } : null; },
    async set(k, v, o = {}) {
      const e = m.get(k);
      if (o.onlyIfNew && e) return { modified: false };
      if (o.onlyIfMatch && (!e || e.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = `"e${++n}"`;
      m.set(k, { v: copy(v), etag, meta: o.metadata || {} });
      return { modified: true, etag };
    },
    async setJSON(k, v, o = {}) { return this.set(k, JSON.stringify(v), o); },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}
const offerStore = memoryBlobs();
const picStore = memoryBlobs();
const authStore = memoryBlobs();
const statStore = memoryBlobs();
st._setOffersStoreFactoryForTests(() => offerStore);
imgStore._setImagesStoreFactoryForTests(() => picStore);
auth._setStoreFactoryForTests(() => authStore);
statsLib._setStatsStoreFactoryForTests(() => statStore);

const CTX = { deploy: { context: 'branch-deploy' } };
const TOKEN = auth.makeToken(auth.authConfig());

/* ---------- server: real handlers plus the site folder ---------- */

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
const apiHits = [];   // "METHOD /path" for every /api request
let server, base, browser;
const pw = await loadPlaywright();

function route(p) {
  if (p === '/api/offers') return [HANDLERS.offers, {}];
  if (p === '/api/offers/pages') return [HANDLERS.pages, {}];
  if (p === '/api/offers/stats') return [HANDLERS.stats, {}];
  if (p === '/api/offers/login') return [HANDLERS.login, {}];
  if (p === '/api/offers/logout') return [HANDLERS.logout, {}];
  if (p === '/api/offers/image') return [HANDLERS.upload, {}];
  const m = /^\/api\/offers\/image\/([^/]+)$/.exec(p);
  if (m) return [HANDLERS.image, { id: m[1] }];
  return null;
}

async function serve(req, res) {
  const url = new URL(req.url, base);
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith('/api/')) {
    apiHits.push(`${req.method} ${p}`);
    const r = route(p);
    if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"error":"no route"}'); return; }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const out = await r[0](new Request(url, { method: req.method, headers, body }), { ...CTX, params: r[1] });
    const h = {};
    out.headers.forEach((v, k) => { if (k !== 'set-cookie') h[k] = v; });
    const cookies = out.headers.getSetCookie();
    if (cookies.length) h['set-cookie'] = cookies;
    res.writeHead(out.status, h);
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  if (p === '/__draw') { res.writeHead(200, { 'content-type': MIME['.html'] }); res.end('<!doctype html><body></body>'); return; }
  const file = path.join(ROOT, p === '/offer-admin' ? 'offer-admin.html' : p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

/* ---------- test pictures, drawn in the browser ---------- */

const PICS = {};   // name -> Buffer

async function drawPictures(page) {
  const out = await page.evaluate(() => {
    function scene(w, h, noise) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0B1A30'); bg.addColorStop(1, '#1D3A61');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const s = Math.min(w, h);
      const wash = g.createRadialGradient(w / 2, h * 0.1, 0, w / 2, h * 0.1, s * 0.9);
      wash.addColorStop(0, 'rgba(42,164,162,.6)'); wash.addColorStop(1, 'rgba(42,164,162,0)');
      g.fillStyle = wash; g.fillRect(0, 0, w, h);
      g.fillStyle = '#EAF6F6';
      const sw = w * 0.3, sh = sw * 9 / 16, sy = h * 0.2;
      g.fillRect(w * 0.12, sy, sw, sh); g.fillRect(w * 0.58, sy, sw, sh);
      g.fillStyle = '#1D3A61'; g.fillRect(0, h * 0.72, w, h * 0.28);
      g.fillStyle = '#2AA4A2'; g.fillRect(0, h * 0.72, w, Math.max(4, h * 0.012));
      g.font = `700 ${Math.round(s * 0.06)}px Arial`; g.textAlign = 'center';
      g.fillText('YOUR AV DEPARTMENT', w / 2, h * 0.9);
      if (noise) {   // camera-like grain so the file is photo-sized
        const d = g.getImageData(0, 0, w, h);
        for (let i = 0; i < d.data.length; i += 4) {
          const r = (Math.random() - 0.5) * noise;
          d.data[i] += r; d.data[i + 1] += r; d.data[i + 2] += r;
        }
        g.putImageData(d, 0, 0);
      }
      return c;
    }
    const b64 = (c, type, q) => c.toDataURL(type, q).split(',')[1];
    const pngAlpha = (() => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 600;
      const g = c.getContext('2d');
      g.fillStyle = '#2AA4A2'; g.beginPath(); g.arc(450, 300, 260, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#152B4A'; g.font = '800 72px Arial'; g.textAlign = 'center'; g.fillText('YAVD', 450, 325);
      return c;
    })();
    const noisy = document.createElement('canvas'); noisy.width = 1600; noisy.height = 1600;
    const ng = noisy.getContext('2d'); const nd = ng.createImageData(1600, 1600);
    for (let i = 0; i < nd.data.length; i++) nd.data[i] = (i % 4 === 3) ? 255 : Math.floor(Math.random() * 256);
    ng.putImageData(nd, 0, 0);
    return {
      jpeg: b64(scene(1600, 900, 0), 'image/jpeg', 0.9),
      png: b64(pngAlpha, 'image/png'),
      webp: b64(scene(1000, 1250, 0), 'image/webp', 0.9),
      photo4000: b64(scene(4000, 3000, 40), 'image/jpeg', 0.92),
      noise: b64(noisy, 'image/png')
    };
  });
  for (const [k, v] of Object.entries(out)) PICS[k] = Buffer.from(v, 'base64');
  PICS.tiny = fs.readFileSync(path.join(FIX, 'tiny-10.png'));
  PICS.svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#2AA4A2"/></svg>');
  PICS.gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  PICS.text = Buffer.from('This is a text file, not a picture. Renamed to .jpg on purpose.\n');
  PICS.heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(200)]);
}

/* ---------- a saved offer that already has a picture ---------- */

let SAVED_ID = '';
let SAVED_PIC = '';

async function seedSavedOffer() {
  const info = checkImage(new Uint8Array(PICS.jpeg)).info;
  const stored = await imgStore.putImage(picStore, new Uint8Array(PICS.jpeg), info);
  SAVED_PIC = stored.id;
  const offer = { ...C.emptyOffer(), name: 'Saved with a picture', page: '/booth-proof.html', audience: 'everyone',
    headline: 'Book 2027 now', body: 'We run your stage so you can run your event.',
    image: { id: SAVED_PIC, alt: 'A teal-lit stage with two screens', placement: 'right' }, draft: true };
  delete offer.id;
  const res = await HANDLERS.offers(new Request(`${base}/api/offers`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `${C.AUTH.cookie}=${TOKEN}` },
    body: JSON.stringify(offer) }), CTX);
  const body = await res.json();
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body.offer.image.id, SAVED_PIC);
  SAVED_ID = body.offer.id;
}

/* ---------- browser helpers ---------- */

async function signedInPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: C.AUTH.cookie, value: TOKEN, domain: 'localhost', path: '/api/offers', httpOnly: true }]);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text() + ' @ ' + (msg.location()?.url || '')); });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(`${base}/offer-admin`);
  await page.waitForSelector('#oa-dash:not([hidden])', { timeout: 10000 });
  return { ctx, page, errors };
}

async function newOffer(page) {
  await page.click('#oa-new');
  await page.waitForSelector('#oa-editor:not([hidden])');
  await page.fill('#f-name', 'Picture test');
}

const MIME_OF = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', photo4000: 'image/jpeg', noise: 'image/png',
  tiny: 'image/png', svg: 'image/svg+xml', gif: 'image/gif', text: 'image/jpeg', heic: 'image/heic' };
const NAME_OF = { jpeg: 'stage.jpg', png: 'logo.png', webp: 'tall.webp', photo4000: 'IMG_4000.jpg', noise: 'noise.png',
  tiny: 'tiny.png', svg: 'drawing.svg', gif: 'anim.gif', text: 'notes.jpg', heic: 'IMG_0001.heic' };

/** Pick a test picture; resolves when the block shows a picture or a message. */
async function pick(page, key) {
  await page.evaluate(() => { document.getElementById('f-img-msg').textContent = ''; });
  const before = await page.$eval('#f-img-size', (n) => n.textContent);
  await page.setInputFiles('#f-img-file', { name: NAME_OF[key], mimeType: MIME_OF[key], buffer: PICS[key] });
  await page.waitForFunction((prev) => {
    const msg = document.getElementById('f-img-msg').textContent;
    const busy = document.getElementById('f-img-busy').textContent;
    const size = document.getElementById('f-img-size').textContent;
    return !busy && (msg || (size && size !== prev));
  }, before, { timeout: 20000 });
  return page.$eval('#f-img-msg', (n) => n.textContent);
}

/** The picture the editor holds, read back from its own blob: address. */
async function heldPicture(page) {
  return page.evaluate(async () => {
    const src = document.getElementById('f-img-thumb').getAttribute('src');
    const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
    const head = String.fromCharCode(...buf.slice(0, 4)) + '/' + String.fromCharCode(...buf.slice(8, 12));
    const img = new Image(); img.src = src; await img.decode();
    return { src, bytes: buf.length, head, w: img.naturalWidth, h: img.naturalHeight };
  });
}

/** The preview's popup: class, picture and text boxes, once drawn. */
async function preview(page, want = {}) {
  await page.waitForFunction((w) => {
    const d = document.getElementById('oa-pv').contentDocument;
    const dlg = d && d.querySelector('.yavd-op-dialog');
    if (!dlg) return false;
    const img = d.querySelector('.yavd-op-img');
    if (w.placement && !dlg.classList.contains('is-img-' + w.placement)) return false;
    if (w.none) return !img && !/is-img-/.test(dlg.className);
    if (w.alt !== undefined && (!img || img.alt !== w.alt)) return false;
    return !w.placement || (img && img.complete && img.naturalWidth > 0);
  }, want, { timeout: 5000 });
  return page.evaluate(() => {
    const d = document.getElementById('oa-pv').contentDocument;
    const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const img = d.querySelector('.yavd-op-img');
    const scroll = d.querySelector('.yavd-op-scroll');
    return {
      cls: d.querySelector('.yavd-op-dialog').className,
      firstChild: scroll.firstElementChild.className,
      img: img ? { src: img.getAttribute('src'), alt: img.alt, w: img.getAttribute('width'), h: img.getAttribute('height'),
        decoding: img.getAttribute('decoding'), loaded: img.complete && img.naturalWidth > 0, fit: getComputedStyle(img).objectFit } : null,
      media: r(d.querySelector('.yavd-op-media')),
      text: r(scroll.children[img ? 1 : 0]),
      dialog: r(d.querySelector('.yavd-op-dialog'))
    };
  });
}

/* ---------- setup ---------- */

before(async () => {
  if (!pw) return;
  server = http.createServer((q, s) => serve(q, s).catch((e) => { console.error(e); s.writeHead(500); s.end(); }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://localhost:${server.address().port}`;
  browser = await pw.chromium.launch({ executablePath: browserPath(), headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/__draw`);
  await drawPictures(page);
  await ctx.close();
  await seedSavedOffer();
  fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});
const skip = () => (pw ? false : 'Playwright not found (see the header of this file)');

/* ---------- tests ---------- */

test('spike: a blob: picture shows in the sandboxed preview (allow-same-origin, no scripts)', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    const sandbox = await page.$eval('#oa-pv', (f) => f.getAttribute('sandbox'));
    assert.equal(sandbox, 'allow-same-origin', 'preview stays script-free');
    assert.equal(await pick(page, 'jpeg'), '');
    const pv = await preview(page, { placement: 'top' });
    console.log(`  preview img src ${pv.img.src.slice(0, 40)}... loaded=${pv.img.loaded}`);
    assert.match(pv.img.src, /^blob:http:\/\/localhost:\d+\//);
    assert.equal(pv.img.loaded, true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

for (const key of ['jpeg', 'png', 'webp']) {
  test(`picking a ${key.toUpperCase()}: checked, shrunk, re-encoded, shown with name and size`, { skip: skip() }, async () => {
    const { ctx, page, errors } = await signedInPage();
    try {
      await newOffer(page);
      assert.equal(await pick(page, key), '');
      assert.equal(await page.isVisible('#f-img-yes'), true);
      assert.equal(await page.isVisible('#f-img-none'), false);
      const held = await heldPicture(page);
      const name = await page.textContent('#f-img-name');
      const size = await page.textContent('#f-img-size');
      console.log(`  ${key}: ${PICS[key].length} B in -> ${held.bytes} B ${held.head} ${held.w}x${held.h}; "${name}" "${size}"`);
      assert.equal(held.head, 'RIFF/WEBP', 'Edge writes WebP');
      assert.ok(held.bytes <= C.IMAGE.targetBytes, `under 400 KB (${held.bytes})`);
      assert.ok(Math.max(held.w, held.h) <= C.IMAGE.maxSideBrowser);
      assert.equal(name, NAME_OF[key]);
      assert.match(size, /shrunk to \d+ \u00d7 \d+ px, \d+ KB, WebP\. Not saved yet\./);
      assert.equal(await page.$eval('#f-img-thumb', (i) => i.complete && i.naturalWidth > 0), true);
      // the server accepts exactly what the editor holds (3.10 will send it)
      const bytes = await page.evaluate(async () => [...new Uint8Array(await (await fetch(document.getElementById('f-img-thumb').src)).arrayBuffer())]);
      const chk = checkImage(new Uint8Array(bytes));
      assert.equal(chk.ok, true, JSON.stringify(chk));
      assert.equal(chk.info.width, held.w);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'f-img-alt', 'focus moves to the description');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  });
}

test('a 4000 px photo ends at 1600 px and under 600 KB; editor screenshot', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    await page.fill('#f-headline', '');
    await page.click('#f-headline');
    await page.keyboard.type('See your stage before show day');
    assert.equal(await pick(page, 'photo4000'), '');
    const held = await heldPicture(page);
    console.log(`  photo: ${PICS.photo4000.length} B 4000x3000 in -> ${held.bytes} B ${held.w}x${held.h} ${held.head}`);
    assert.equal(held.w, 1600);
    assert.equal(held.h, 1200);
    assert.ok(held.bytes <= C.IMAGE.maxBytes, `under 600 KB (${held.bytes})`);
    assert.ok(PICS.photo4000.length > C.IMAGE.maxBytes, 'the source really was over the cap');
    await page.fill('#f-img-alt', 'A conference stage lit in teal with two screens');
    await preview(page, { placement: 'top', alt: 'A conference stage lit in teal with two screens' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, '1-editor-with-picture.png'), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('SVG, GIF, HEIC and a renamed text file are refused before decoding; too-small and too-large too', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    for (const key of ['svg', 'gif', 'heic', 'text']) {
      const msg = await pick(page, key);
      console.log(`  ${NAME_OF[key]} -> "${msg}"`);
      assert.equal(msg, IMAGE_MESSAGES.wrongType);
      assert.equal(await page.isVisible('#f-img-yes'), false, 'no picture held');
    }
    const small = await pick(page, 'tiny');
    console.log(`  tiny.png (10 px) -> "${small}"`);
    assert.equal(small, IMAGE_MESSAGES.tooSmall);
    const big = await pick(page, 'noise');
    console.log(`  noise.png (${PICS.noise.length} B, pure noise) -> "${big}"`);
    assert.equal(big, IMAGE_MESSAGES.tooLarge);
    assert.equal(await page.isVisible('#f-img-yes'), false);
    await preview(page, { none: true });
    // a refused pick never replaces a picture already held
    assert.equal(await pick(page, 'jpeg'), '');
    const first = await page.getAttribute('#f-img-thumb', 'src');
    assert.equal(await pick(page, 'gif'), IMAGE_MESSAGES.wrongType);
    assert.equal(await page.getAttribute('#f-img-thumb', 'src'), first);
    assert.equal(await page.isVisible('#f-img-yes'), true);
    assert.equal(apiHits.filter((h) => h.startsWith('POST /api/offers/image')).length, 0, 'nothing uploaded in 3.9');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('alt text: counter shows n / 125, stops at 125, preview alt follows', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    assert.equal(await pick(page, 'jpeg'), '');
    const counter = () => page.$eval('#f-img-alt', (n) => n.nextElementSibling.textContent);
    assert.equal(await counter(), '0 / 125');
    await page.fill('#f-img-alt', 'Stage with two screens');
    assert.equal(await counter(), '22 / 125');
    await preview(page, { placement: 'top', alt: 'Stage with two screens' });
    await page.fill('#f-img-alt', '');
    await page.click('#f-img-alt');
    await page.keyboard.type('x'.repeat(140));
    const len = await page.$eval('#f-img-alt', (n) => n.value.length);
    console.log(`  typed 140, kept ${len}, counter "${await counter()}"`);
    assert.equal(len, 125);
    assert.equal(await counter(), '125 / 125');
    assert.equal(await page.getAttribute('#f-img-alt', 'maxlength'), String(C.IMAGE.altMax));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('placement changes the preview in Desktop and Phone modes; screenshots', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage({ width: 1400, height: 1000 });
  try {
    await newOffer(page);
    await page.click('#f-headline');
    await page.keyboard.type('See your stage before show day');
    await page.click('#f-body');
    await page.keyboard.type('We render your stage and screens to scale, so there are no surprises on move-in day.');
    assert.equal(await pick(page, 'webp'), '');
    await page.fill('#f-img-alt', 'A tall stage picture');
    const n = { top: 2, left: 3, right: 4 };
    for (const mode of ['desktop', 'phone']) {
      await page.click(`[data-pv="${mode}"]`);
      for (const placement of ['top', 'left', 'right']) {
        await page.check(`input[name="imgPlacement"][value="${placement}"]`);
        const pv = await preview(page, { placement, alt: 'A tall stage picture' });
        console.log(`  ${mode} ${placement}: ${pv.cls}; media ${Math.round(pv.media.x)},${Math.round(pv.media.y)} ${Math.round(pv.media.w)}w; text ${Math.round(pv.text.x)},${Math.round(pv.text.y)}; dialog ${Math.round(pv.dialog.w)}w`);
        assert.equal(pv.firstChild, 'yavd-op-media', 'picture is the first child of the scroll area, as in the popup');
        assert.equal(pv.img.w, '1000'); assert.equal(pv.img.h, '1250');
        assert.equal(pv.img.decoding, 'async');
        assert.notEqual(pv.img.fit, 'cover');
        if (placement === 'top' || mode === 'phone') {
          assert.ok(pv.media.y + pv.media.h <= pv.text.y + 1, 'picture above the text');
        } else if (placement === 'left') {
          assert.ok(pv.media.x + pv.media.w <= pv.text.x + 1, 'picture left of the text');
          assert.ok(pv.dialog.w > 600, 'side layout widens the dialog');
        } else {
          assert.ok(pv.text.x + pv.text.w <= pv.media.x + 1, 'picture right of the text');
        }
        await page.waitForTimeout(100);
        if (mode === 'desktop') await page.locator('.oa-ed-side').screenshot({ path: path.join(SHOTS, `${n[placement]}-preview-desktop-${placement}.png`) });
        else if (placement === 'left') await page.locator('.oa-ed-side').screenshot({ path: path.join(SHOTS, '5-preview-phone-left.png') });
      }
    }
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('Remove clears the picture, the description, the placement and the preview', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    assert.equal(await pick(page, 'png'), '');
    await page.fill('#f-img-alt', 'Logo');
    await page.check('input[name="imgPlacement"][value="left"]');
    await preview(page, { placement: 'left' });
    const src = await page.getAttribute('#f-img-thumb', 'src');
    await page.click('#f-img-remove');
    await preview(page, { none: true });
    assert.equal(await page.isVisible('#f-img-yes'), false);
    assert.equal(await page.isVisible('#f-img-add'), true);
    assert.equal(await page.inputValue('#f-img-alt'), '');
    assert.equal(await page.$eval('input[name="imgPlacement"]:checked', (r) => r.value), 'top');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-img-add');
    await page.waitForTimeout(300);   // the preview redraw after Remove has run
    assert.deepEqual(errors, [], 'nothing in the page asks for the released picture');
    const revoked = await page.evaluate(async (u) => { try { await fetch(u); return false; } catch { return true; } }, src);
    assert.equal(revoked, true, 'the blob: address is released');
    // our own fetch of the released address logs one expected console line
    assert.equal(errors.length, 1);
    assert.match(errors[0], /ERR_FILE_NOT_FOUND @ blob:/);
    errors.length = 0;
    // and a new pick works after a remove
    assert.equal(await pick(page, 'jpeg'), '');
    assert.equal(await page.isVisible('#f-img-yes'), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('a saved picture: dashboard thumbnail, editor shows it with its description and placement', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    const card = page.locator(`.oa-card[data-id="${SAVED_ID}"]`);
    await card.locator('.oa-card-thumb').waitFor();
    await page.waitForFunction((id) => {
      const i = document.querySelector(`.oa-card[data-id="${id}"] .oa-card-thumb`);
      return i && i.complete && i.naturalWidth > 0;
    }, SAVED_ID);
    const th = await card.locator('.oa-card-thumb').evaluate((i) => ({ src: i.getAttribute('src'), alt: i.alt }));
    assert.equal(th.src, C.imageUrl(SAVED_PIC));
    assert.equal(th.alt, '', 'decorative: the offer name follows it');
    await card.screenshot({ path: path.join(SHOTS, '6-dashboard-card-thumbnail.png') });
    await card.locator('[data-act="edit"]').click();
    await page.waitForSelector('#oa-editor:not([hidden])');
    await page.waitForSelector('#f-img-yes:not([hidden])');
    assert.equal(await page.textContent('#f-img-name'), 'Saved picture');
    assert.match(await page.textContent('#f-img-size'), /^1600 \u00d7 900 px, \d+ KB, JPG$/);
    assert.equal(await page.inputValue('#f-img-alt'), 'A teal-lit stage with two screens');
    assert.equal(await page.$eval('input[name="imgPlacement"]:checked', (r) => r.value), 'right');
    const pv = await preview(page, { placement: 'right', alt: 'A teal-lit stage with two screens' });
    assert.equal(pv.img.src, C.imageUrl(SAVED_PIC));
    // a card whose picture is gone loses its thumbnail quietly
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('no picture: the preview has no media block and no placement class (as before 3.9)', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newOffer(page);
    const pv = await preview(page, { none: true });
    assert.doesNotMatch(pv.cls, /is-img-/);
    assert.notEqual(pv.firstChild, 'yavd-op-media');
    assert.equal(await page.isVisible('#f-img-add'), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
