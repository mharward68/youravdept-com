/* Sessions 3.9 and 3.10: the editor's Image block, and saving the picture
 * with the offer (Playwright, real browser).
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
  logout: (await import('../functions/offers-logout.mjs')).default,
  del: (await import('../functions/offers-delete.mjs')).default,
  restore: (await import('../functions/offers-restore.mjs')).default,
  exportFn: (await import('../functions/offers-export.mjs')).default
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
const apiHits = [];   // "METHOD /path?query" for every /api request
let failUploads = false;
let server, base, browser;
const pw = await loadPlaywright();

function route(p) {
  if (p === '/api/offers') return [HANDLERS.offers, {}];
  if (p === '/api/offers/pages') return [HANDLERS.pages, {}];
  if (p === '/api/offers/stats') return [HANDLERS.stats, {}];
  if (p === '/api/offers/login') return [HANDLERS.login, {}];
  if (p === '/api/offers/logout') return [HANDLERS.logout, {}];
  if (p === '/api/offers/image') return [HANDLERS.upload, {}];
  if (p === '/api/offers/delete') return [HANDLERS.del, {}];
  if (p === '/api/offers/restore') return [HANDLERS.restore, {}];
  if (p === '/api/offers/export') return [HANDLERS.exportFn, {}];
  const m = /^\/api\/offers\/image\/([^/]+)$/.exec(p);
  if (m) return [HANDLERS.image, { id: m[1] }];
  return null;
}

async function serve(req, res) {
  const url = new URL(req.url, base);
  const p = decodeURIComponent(url.pathname);
  if (p.startsWith('/api/')) {
    apiHits.push(`${req.method} ${p}${url.search}`);
    if (failUploads && req.method === 'POST' && p === '/api/offers/image') {   // Session 3.10: storage trouble on upload
      res.writeHead(503, { 'content-type': 'application/json' }); res.end('{"error":"The picture did not upload. Try again in a minute."}'); return;
    }
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

async function signedInPage(viewport = { width: 1280, height: 900 }, { init } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  if (init) await ctx.addInitScript(init);
  await ctx.addCookies([{ name: C.AUTH.cookie, value: TOKEN, domain: 'localhost', path: '/api/offers', httpOnly: true }]);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text() + ' @ ' + (msg.location()?.url || '')); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));   // may race a closing context
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

/* =====================================================================
   Session 3.10: save, replace, remove, rerun
   ===================================================================== */

const stored = () => JSON.parse(offerStore.m.get('all')?.v ?? '[]');
const storedOffer = (id) => stored().find((o) => o.id === id);
const hitsSince = (i, exact) => apiHits.slice(i).filter((h) => h === exact).length;
const UPLOAD = 'POST /api/offers/image';
const POST_OFFER = 'POST /api/offers';

async function apiSave(offer) {
  const res = await HANDLERS.offers(new Request(`${base}/api/offers`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: `${C.AUTH.cookie}=${TOKEN}` },
    body: JSON.stringify(offer) }), CTX);
  const body = await res.json();
  assert.ok(res.status === 200 || res.status === 201, JSON.stringify(body));
  return body.offer;
}
function baseOffer(over = {}) {
  const o = { ...C.emptyOffer(), page: '/booth-proof.html', audience: 'everyone', headline: 'Book 2027 now',
    body: 'We run your stage.', draft: true, ...over };
  delete o.id;
  return o;
}

async function newSavableOffer(page, name) {
  await newOffer(page);
  await page.waitForSelector('#f-page option[value="/booth-proof.html"]', { state: 'attached' });
  await page.selectOption('#f-page', '/booth-proof.html');
  await page.fill('#f-name', name);
}

/** Click Save as draft; resolves with what happened. */
async function saveDraft(page) {
  await page.evaluate(() => { document.getElementById('oa-saving').textContent = ''; });
  await page.click('#oa-save-draft');
  await page.waitForFunction(() => {
    const t = document.getElementById('oa-saving').textContent;
    return t === 'Created.' || t === 'Saved.' || !document.getElementById('oa-ed-summary').hidden
      || !document.getElementById('oa-signin').hidden;
  }, null, { timeout: 15000 });
  return page.evaluate(() => ({
    saving: document.getElementById('oa-saving').textContent,
    summary: document.getElementById('oa-ed-summary').hidden ? '' : document.getElementById('oa-ed-summary').textContent,
    signin: !document.getElementById('oa-signin').hidden,
    banner: document.getElementById('oa-ed-banner').hidden ? '' : document.getElementById('oa-ed-banner').textContent
  }));
}
async function openCard(page, id) {
  await page.waitForSelector('#oa-dash:not([hidden])');
  await page.click(`.oa-card[data-id="${id}"] [data-act="edit"]`);
  await page.waitForSelector('#oa-editor:not([hidden])');
}
const expectedOnly = (errors, re) => errors.filter((e) => !re.test(e));

let FLOW_ID = '';     // the offer the add, alt-only, replace and remove tests work on
let FLOW_PIC = '';

test('3.10 add and save: one upload, then one offer save with { id, alt, placement }', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newSavableOffer(page, 'Flow offer');
    assert.equal(await pick(page, 'jpeg'), '');
    // no description: refused here, nothing sent
    let i = apiHits.length;
    let r = await saveDraft(page);
    assert.match(r.summary, /Describe the picture/);
    assert.equal(hitsSince(i, UPLOAD), 0, 'no upload without a description');
    await page.fill('#f-img-alt', 'A teal stage');
    await page.check('input[name="imgPlacement"][value="left"]');
    i = apiHits.length;
    r = await saveDraft(page);
    const hits = apiHits.slice(i).filter((h) => h.startsWith('POST'));
    console.log(`  requests: ${JSON.stringify(hits)}; ${r.saving}`);
    assert.equal(r.saving, 'Created.');
    assert.deepEqual(hits, [UPLOAD, POST_OFFER], 'one upload, then one offer save');
    const saved = stored().find((o) => o.name === 'Flow offer');
    FLOW_ID = saved.id; FLOW_PIC = saved.image.id;
    console.log(`  stored image: ${JSON.stringify(saved.image)}`);
    assert.match(FLOW_PIC, C.IMAGE.idPattern);
    assert.ok(picStore.m.has(FLOW_PIC), 'picture is in the store');
    assert.equal(saved.image.alt, 'A teal stage');
    assert.equal(saved.image.placement, 'left');
    assert.equal(saved.image.type, 'image/webp');
    assert.equal(await page.textContent('#f-img-name'), 'Saved picture');
    assert.equal(await page.getAttribute('#f-img-thumb', 'src'), C.imageUrl(FLOW_PIC));
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), false, 'clean after save');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 Leave guard fires for an unsaved picture and for a removed one', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newSavableOffer(page, 'Guard');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), true);   // the name is a change too; reset
    await page.click('#oa-ed-discard');
    await page.click('#oa-new');
    await page.waitForSelector('#oa-editor:not([hidden])');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), false, 'untouched new offer leaves freely');
    await page.click('#oa-new');
    await page.waitForSelector('#oa-editor:not([hidden])');
    assert.equal(await pick(page, 'jpeg'), '');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), true, 'only a picture added: guard shows');
    await page.click('#oa-ed-discard');
    await openCard(page, FLOW_ID);
    await page.click('#f-img-remove');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), true, 'only a picture removed: guard shows');
    await page.click('#oa-ed-discard');
    await openCard(page, FLOW_ID);
    await page.check('input[name="imgPlacement"][value="top"]');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), true, 'only the placement changed: guard shows');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 alt-only and placement-only changes save with no upload', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await openCard(page, FLOW_ID);
    await page.fill('#f-img-alt', 'A teal stage with two screens');
    let i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Saved.');
    assert.equal(hitsSince(i, UPLOAD), 0);
    assert.equal(storedOffer(FLOW_ID).image.alt, 'A teal stage with two screens');
    await page.check('input[name="imgPlacement"][value="right"]');
    i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Saved.');
    console.log(`  uploads for alt + placement saves: ${hitsSince(i, UPLOAD)}; stored ${JSON.stringify(storedOffer(FLOW_ID).image)}`);
    assert.equal(hitsSince(i, UPLOAD), 0);
    assert.equal(storedOffer(FLOW_ID).image.placement, 'right');
    assert.equal(storedOffer(FLOW_ID).image.id, FLOW_PIC);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 replace uploads once and gets a new id; remove sends null with no upload', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await openCard(page, FLOW_ID);
    assert.equal(await pick(page, 'png'), '');
    let i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Saved.');
    const after = storedOffer(FLOW_ID).image;
    console.log(`  replace: ${hitsSince(i, UPLOAD)} upload, id ${FLOW_PIC.slice(0, 8)}.. -> ${after.id.slice(0, 8)}.., alt kept "${after.alt}"`);
    assert.equal(hitsSince(i, UPLOAD), 1);
    assert.notEqual(after.id, FLOW_PIC);
    assert.equal(after.width, 900);
    assert.equal(after.alt, 'A teal stage with two screens');
    await page.click('#f-img-remove');
    i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Saved.');
    console.log(`  remove: ${hitsSince(i, UPLOAD)} uploads, stored image ${JSON.stringify(storedOffer(FLOW_ID).image)}`);
    assert.equal(hitsSince(i, UPLOAD), 0);
    assert.equal(storedOffer(FLOW_ID).image, null);
    assert.equal(await page.isVisible('#f-img-add'), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 upload failure still saves the text; the picture stays to try again', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newSavableOffer(page, 'Upload fails');
    assert.equal(await pick(page, 'webp'), '');
    await page.fill('#f-img-alt', 'Tall picture');
    failUploads = true;
    let i = apiHits.length;
    const r = await saveDraft(page);
    failUploads = false;
    const o = stored().find((x) => x.name === 'Upload fails');
    console.log(`  ${r.saving} banner "${r.banner}"; stored image ${JSON.stringify(o && o.image)}; uploads ${hitsSince(i, UPLOAD)}`);
    assert.equal(r.saving, 'Created.');
    assert.ok(o, 'offer text saved');
    assert.equal(o.image, null);
    assert.ok(r.banner.includes(IMAGE_MESSAGES.uploadFailed), r.banner);
    assert.match(await page.textContent('#f-img-size'), /Not saved yet\./);
    assert.equal(await page.inputValue('#f-img-alt'), 'Tall picture');
    await page.click('#oa-ed-back');
    assert.equal(await page.isVisible('#oa-ed-guard'), true, 'the picture is still an unsaved change');
    await page.click('#oa-ed-keep');
    assert.deepEqual(expectedOnly(errors, /status of 503/), [], 'only the expected 503 line');
    errors.length = 0;
    i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Saved.');
    assert.equal(hitsSince(i, UPLOAD), 1);
    assert.match(storedOffer(o.id).image.id, C.IMAGE.idPattern);
    assert.deepEqual(errors, []);
  } finally { failUploads = false; await ctx.close(); }
});

test('3.10 sign-in expires during save: sign in again, the picture is kept and saves', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newSavableOffer(page, 'Expired sign-in');
    assert.equal(await pick(page, 'jpeg'), '');
    await page.fill('#f-img-alt', 'Kept across sign-in');
    await page.check('input[name="imgPlacement"][value="right"]');
    const src = await page.getAttribute('#f-img-thumb', 'src');
    await ctx.clearCookies();
    let i = apiHits.length;
    const r = await saveDraft(page);
    assert.equal(r.signin, true);
    assert.equal(hitsSince(i, UPLOAD), 1, 'the upload met the 401');
    assert.equal(stored().some((x) => x.name === 'Expired sign-in'), false, 'nothing saved');
    const ls = await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
    assert.equal(ls, '{}{}', 'nothing kept in browser storage');
    await page.fill('#oa-password', 'correct-horse-battery-1');
    await page.click('#oa-signin-btn');
    await page.waitForSelector('#oa-editor:not([hidden])');
    await page.waitForSelector('#f-img-yes:not([hidden])');
    assert.equal(await page.getAttribute('#f-img-thumb', 'src'), src, 'the same held picture');
    assert.match(await page.textContent('#f-img-size'), /Not saved yet\./);
    assert.equal(await page.inputValue('#f-img-alt'), 'Kept across sign-in');
    assert.equal(await page.$eval('input[name="imgPlacement"]:checked', (x) => x.value), 'right');
    await preview(page, { placement: 'right', alt: 'Kept across sign-in' });
    i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Created.');
    const o = stored().find((x) => x.name === 'Expired sign-in');
    console.log(`  after sign-in: ${hitsSince(i, UPLOAD)} upload, stored ${JSON.stringify(o.image)}`);
    assert.equal(hitsSince(i, UPLOAD), 1);
    assert.equal(o.image.placement, 'right');
    assert.equal(o.image.alt, 'Kept across sign-in');
    assert.deepEqual(expectedOnly(errors, /status of 401/), [], 'only the expected 401 line');
  } finally { await ctx.close(); }
});

test('3.10 delete a draft with a picture, then put it back from Saved versions', { skip: skip() }, async () => {
  const seeded = await apiSave(baseOffer({ name: 'Delete me', image: { id: SAVED_PIC, alt: 'Stage', placement: 'top' } }));
  const { ctx, page, errors } = await signedInPage();
  try {
    await openCard(page, seeded.id);
    await page.click('#oa-del');
    await page.click('#oa-del-yes');
    await page.waitForSelector('#oa-dash:not([hidden])');
    assert.equal(storedOffer(seeded.id), undefined);
    await page.click('#oa-versions-btn');
    await page.waitForSelector('#oa-v-list .oa-v > button');
    const what = await page.textContent('#oa-v-list .oa-v:first-child .oa-v-what');
    assert.match(what, /delete of "Delete me"/);
    await page.click('#oa-v-list .oa-v:first-child > button');
    await page.click('#oa-v-list .oa-v:first-child .oa-btn-danger');
    await page.waitForSelector('#oa-dash:not([hidden])');
    await page.waitForFunction((id) => {
      const i = document.querySelector(`.oa-card[data-id="${id}"] .oa-card-thumb`);
      return i && i.complete && i.naturalWidth > 0;
    }, seeded.id, { timeout: 5000 });
    console.log(`  restored image ${JSON.stringify(storedOffer(seeded.id).image)}; picture in store: ${picStore.m.has(SAVED_PIC)}`);
    assert.equal(storedOffer(seeded.id).image.id, SAVED_PIC);
    assert.equal(picStore.m.has(SAVED_PIC), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 rerun copies the picture (same id, no upload)', { skip: skip() }, async () => {
  const old = await apiSave(baseOffer({ name: 'Ran last month', draft: false,
    startsAt: '2026-10-01T00:00:00-04:00', endsAt: '2026-10-05T23:59:59-04:00',
    image: { id: SAVED_PIC, alt: 'Last month stage', placement: 'left' } }));
  const { ctx, page, errors } = await signedInPage();
  try {
    await page.click(`.oa-card[data-id="${old.id}"] [data-act="rerun"]`);
    await page.waitForSelector('#f-img-yes:not([hidden])');
    assert.equal(await page.inputValue('#f-img-alt'), 'Last month stage');
    assert.equal(await page.$eval('input[name="imgPlacement"]:checked', (x) => x.value), 'left');
    await page.fill('#f-name', 'Ran last month (again)');
    const i = apiHits.length;
    assert.equal((await saveDraft(page)).saving, 'Created.');
    const copy = stored().find((x) => x.name === 'Ran last month (again)');
    console.log(`  rerun: uploads ${hitsSince(i, UPLOAD)}, image ${JSON.stringify(copy.image)}, rerunOf ok ${copy.rerunOf === old.id}`);
    assert.equal(hitsSince(i, UPLOAD), 0);
    assert.equal(copy.image.id, SAVED_PIC);
    assert.equal(copy.image.placement, 'left');
    assert.equal(copy.rerunOf, old.id);
    assert.equal(storedOffer(old.id).image.id, SAVED_PIC, 'the original keeps it too');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.10 server field errors for the picture show in their slot', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await openCard(page, SAVED_ID);
    await page.fill('#f-img-alt', '<b></b>');   // passes the local check, empty once the server strips tags
    const r = await saveDraft(page);
    const slot = await page.textContent('[data-err="image.alt"]');
    console.log(`  summary "${r.summary.slice(0, 70)}"; slot "${slot}"`);
    assert.equal(slot, IMAGE_MESSAGES.noAlt);
    assert.equal(await page.getAttribute('#f-img-alt', 'aria-invalid'), 'true');
    assert.deepEqual(expectedOnly(errors, /status of 400/), []);
  } finally { await ctx.close(); }
});

test('3.10 export: pictures that do not fit get the server sentence and a second download button', { skip: skip() }, async () => {
  // seven 590 KB pictures (fake bytes: the store does not check content) on seven drafts
  const BIG = 590 * 1024;
  for (let n = 0; n < 7; n++) {
    const id = (n + 16).toString(16).padStart(2, '0').repeat(16);
    await picStore.set(id, Buffer.alloc(BIG, n), { metadata: { type: 'image/jpeg', bytes: BIG, width: 800, height: 600, uploadedAt: new Date().toISOString() } });
    await apiSave(baseOffer({ name: `Export ${n}`, image: { id, alt: 'Fake', placement: 'top' } }));
  }
  // Downloads are recorded in the page (name and text) instead of saved:
  // Playwright's own download handling left a rejection behind on close.
  const init = () => {
    window.__downloads = [];
    const real = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute('download') && this.href.startsWith('blob:')) {
        const entry = { name: this.download, text: null };
        window.__downloads.push(entry);
        fetch(this.href).then((r) => r.text()).then((t) => { entry.text = t; });
        return;
      }
      return real.call(this);
    };
  };
  const { ctx, page, errors } = await signedInPage(undefined, { init });
  const downloaded = async (n) => {
    await page.waitForFunction((k) => window.__downloads.length >= k && window.__downloads[k - 1].text !== null, n, { timeout: 15000 });
    return page.evaluate((k) => window.__downloads[k - 1], n);
  };
  try {
    const i = apiHits.length;
    await page.click('#oa-export');
    const d1 = await downloaded(1);
    await page.waitForSelector('#oa-export-note:not([hidden])');
    const note = await page.textContent('#oa-export-note');
    console.log(`  file 1 ${d1.name}; note "${note}"`);
    assert.match(note, /Download part 2 as well/);
    assert.ok(JSON.parse(d1.text).imagesOmitted.length >= 1);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(SHOTS, '7-export-note.png'), clip: { x: 0, y: 0, width: 1280, height: 260 } });
    await page.click('#oa-export-more');
    const d2 = await downloaded(2);
    const exportsHit = apiHits.slice(i).filter((h) => h.includes('export'));
    console.log(`  file 2 ${d2.name}; requests ${JSON.stringify(exportsHit)}`);
    assert.match(d2.name, /-images-/);
    const part2 = JSON.parse(d2.text);
    assert.equal(part2.kind, 'yavd-offers-export-images');
    assert.ok(part2.images.length >= 1);
    assert.deepEqual(exportsHit, ['GET /api/offers/export', 'GET /api/offers/export?images=rest']);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => { const b = document.getElementById('oa-export-note'); return b.hidden ? '' : b.textContent; });
    console.log(`  note after part ${part2.part} of ${part2.parts}: "${after}"`);
    if (part2.part === part2.parts) assert.equal(after, '', 'nothing more to say after the last part');
    // the fake pictures do not decode as thumbnails; that is quiet (no console line)
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

/* ---------- Session 3.11b: the editor's Cancel button (and Escape) ---------- */

const SHOTS_311B = process.env.YAVD_SHOTS_311B || path.join(ROOT, 'ai', 'review', '3.11b');
const onDash = (page) => page.isVisible('#oa-dash');
const guardUp = (page) => page.isVisible('#oa-ed-guard');
// Records every blob: address the page lets go of.
const TRACK_REVOKE = () => {
  window.__revoked = [];
  const orig = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (u) => { window.__revoked.push(u); return orig(u); };
};

test('3.11b clean editor: Cancel and Escape go straight to the dashboard with no API call', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await page.click('#oa-new');
    await page.waitForSelector('#oa-editor:not([hidden])');
    assert.equal(await page.textContent('#oa-cancel'), 'Cancel');
    assert.equal(await page.getAttribute('#oa-cancel', 'class'), 'oa-btn', 'plain button, never primary');
    assert.equal(await page.isVisible('#oa-ed-back'), true, 'Back to offers is still there');
    await page.waitForTimeout(300);   // let the page list load finish
    let i = apiHits.length;
    await page.click('#oa-cancel');
    assert.equal(await onDash(page), true);
    assert.equal(await guardUp(page), false);
    assert.deepEqual(apiHits.slice(i), [], 'Cancel sends nothing');
    // Escape on a saved offer, untouched
    await openCard(page, SAVED_ID);
    await page.waitForTimeout(300);
    i = apiHits.length;
    await page.keyboard.press('Escape');
    assert.equal(await onDash(page), true, 'Escape leaves a clean editor');
    assert.deepEqual(apiHits.slice(i).filter((h) => !h.startsWith('GET /api/offers/image/')), [], 'Escape sends nothing');
    // Escape on the dashboard does nothing
    await page.keyboard.press('Escape');
    assert.equal(await onDash(page), true);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.11b dirty editor: Cancel shows the guard, Stay keeps the edits, Leave discards; screenshot', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    await newSavableOffer(page, 'Cancel test');
    fs.mkdirSync(SHOTS_311B, { recursive: true });
    await page.locator('#oa-save-sched').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS_311B, 'cancel.png') });   // viewport: the action bar is sticky
    const i = apiHits.length;
    await page.click('#oa-cancel');
    assert.equal(await guardUp(page), true, 'guard shows');
    assert.match(await page.textContent('#oa-ed-guard-text'), /Leave without saving/);
    assert.equal(await page.isVisible('#oa-editor'), true);
    // Escape while the guard is open does nothing
    await page.keyboard.press('Escape');
    assert.equal(await guardUp(page), true, 'Escape ignored while the guard is open');
    await page.click('#oa-ed-keep');
    assert.equal(await guardUp(page), false);
    assert.equal(await page.inputValue('#f-name'), 'Cancel test', 'Stay keeps the edits');
    // Escape in a text field, dirty: same guard
    await page.focus('#f-name');
    await page.keyboard.press('Escape');
    assert.equal(await guardUp(page), true, 'Escape on a dirty editor shows the guard');
    await page.click('#oa-ed-discard');
    assert.equal(await onDash(page), true, 'Leave discards');
    assert.equal(hitsSince(i, POST_OFFER), 0, 'nothing saved');
    assert.equal(stored().some((o) => o.name === 'Cancel test'), false);
    await page.click('#oa-new');
    await page.waitForSelector('#oa-editor:not([hidden])');
    assert.equal(await page.inputValue('#f-name'), '', 'the discarded edits are gone');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('3.11b a new picture is kept on Stay and released on Leave', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage(undefined, { init: TRACK_REVOKE });
  try {
    await page.click('#oa-new');
    await page.waitForSelector('#oa-editor:not([hidden])');
    assert.equal(await pick(page, 'jpeg'), '');
    const src = await page.getAttribute('#f-img-thumb', 'src');
    assert.match(src, /^blob:/);
    await page.click('#oa-cancel');
    assert.equal(await guardUp(page), true, 'a picture alone is a change');
    await page.click('#oa-ed-keep');
    assert.equal(await page.getAttribute('#f-img-thumb', 'src'), src, 'Stay keeps the picture');
    assert.equal((await heldPicture(page)).src, src, 'still readable');
    await page.click('#oa-cancel');
    await page.click('#oa-ed-discard');
    assert.equal(await onDash(page), true);
    const revoked = await page.evaluate(() => window.__revoked);
    console.log(`  revoked on Leave: ${revoked.includes(src)}`);
    assert.ok(revoked.includes(src), 'the blob: address is released');
    assert.deepEqual(errors, [], 'leaving makes no console errors');
    const readable = await page.evaluate(async (u) => { try { await fetch(u); return true; } catch { return false; } }, src);
    assert.equal(readable, false, 'the released picture can no longer be read');
    assert.equal(await page.getAttribute('#f-img-thumb', 'src'), null, 'no picture left in the editor');
    // the only console line is the one our own read of the released address made
    assert.deepEqual(expectedOnly(errors, /ERR_FILE_NOT_FOUND @ blob:/), []);
  } finally { await ctx.close(); }
});

test('3.11b Cancel is disabled and Escape ignored while a save runs; Escape ignored over the delete dialog', { skip: skip() }, async () => {
  const { ctx, page, errors } = await signedInPage();
  try {
    let release;
    const gate = new Promise((r) => { release = r; });
    await page.route('**/api/offers', async (r) => {
      if (r.request().method() === 'POST') await gate;
      await r.continue();
    });
    await newSavableOffer(page, 'Slow save');
    await page.click('#oa-save-draft');
    await page.waitForFunction(() => document.getElementById('oa-saving').textContent === 'Saving…');
    assert.equal(await page.isDisabled('#oa-cancel'), true, 'Cancel disabled during the save');
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#oa-editor'), true, 'Escape ignored during the save');
    assert.equal(await guardUp(page), false);
    release();
    await page.waitForFunction(() => document.getElementById('oa-saving').textContent === 'Created.');
    assert.equal(await page.isDisabled('#oa-cancel'), false, 'enabled again after the save');
    await page.unroute('**/api/offers');
    // the new draft is saved, so Delete draft shows; Escape over its dialog does nothing
    await page.click('#oa-del');
    assert.equal(await page.isVisible('#oa-del-guard'), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#oa-editor'), true, 'Escape ignored while the delete dialog is open');
    assert.equal(await page.isVisible('#oa-del-guard'), true);
    await page.click('#oa-del-no');
    await page.click('#oa-cancel');
    assert.equal(await onDash(page), true, 'saved and clean: Cancel leaves');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
