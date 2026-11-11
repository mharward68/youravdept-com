// Session 3.4: upload and view routes. Run: node --test netlify/tests/offer-image-routes.test.mjs
//
// Calls the real handlers with an in-memory picture store (its own copy of
// memoryBlobs: never import another *.test.mjs file). Every store call is
// recorded so a test can prove a refused request never reached storage.
process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGE, ROUTES, imageUrl } from '../../shared/offer-contract.js';
import { authConfig, makeToken } from '../functions/lib/offers-auth.mjs';
import { IMAGE_MESSAGES } from '../functions/lib/offer-image.mjs';
import { _setImagesStoreFactoryForTests } from '../functions/lib/offer-images-store.mjs';
import upload, { config as uploadConfig } from '../functions/offer-image-upload.mjs';
import view, { config as viewConfig } from '../functions/offer-image.mjs';

const SITE = 'https://youravdept.com';
const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const cookie = () => `yavd_offer_admin=${makeToken(authConfig())}`;

function memoryBlobs() {
  const m = new Map();
  const calls = [];
  return {
    m, calls,
    async set(k, data, o = {}) {
      calls.push(['set', k]);
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      m.set(k, { bytes: Uint8Array.from(data), meta: structuredClone(o.metadata ?? {}) });
      return { modified: true, etag: `"${k}"` };
    },
    async getWithMetadata(k, o = {}) {
      calls.push(['getWithMetadata', k]);
      assert.equal(o.type, 'arrayBuffer');
      const e = m.get(k);
      return e ? { data: e.bytes.slice().buffer, metadata: structuredClone(e.meta), etag: `"${k}"` } : null;
    },
    async getMetadata(k) {
      calls.push(['getMetadata', k]);
      const e = m.get(k);
      return e ? { etag: `"${k}"`, metadata: structuredClone(e.meta) } : null;
    },
    async list() { calls.push(['list']); return { blobs: [...m.keys()].map((key) => ({ key })) }; },
    async delete(k) { calls.push(['delete', k]); m.delete(k); }
  };
}
function broken() {
  const down = async () => { throw new Error('blobs down: secret detail'); };
  return { calls: [], set: down, getWithMetadata: down, getMetadata: down, list: down, delete: down };
}

let blobs;
let factoryContexts;
beforeEach(() => {
  blobs = memoryBlobs();
  factoryContexts = [];
  _setImagesStoreFactoryForTests((ctx) => { factoryContexts.push(ctx); return blobs; });
});

const ctx = (context = 'production', params) => ({ deploy: { context }, ...(params ? { params } : {}) });

function post(bytes, { type = 'image/png', signedIn = true, origin = SITE, headers = {}, body } = {}) {
  const h = { ...headers };
  if (type !== null) h['content-type'] = type;
  if (signedIn) h.cookie = cookie();
  if (origin !== null) h.origin = origin;
  const init = { method: 'POST', headers: h };
  if (body !== undefined) { init.body = body; init.duplex = 'half'; }
  else if (bytes !== undefined) init.body = bytes;
  return new Request(SITE + ROUTES.apiImage, init);
}
function get(id, { method = 'GET', headers = {} } = {}) {
  return new Request(SITE + imageUrl(id), { method, headers });
}
const viewCtx = (id, context = 'production') => ctx(context, { id });

async function uploadOk(name, type) {
  const res = await upload(post(fx(name), { type }), ctx());
  assert.equal(res.status, 201, `${name}: ${await res.clone().text()}`);
  return res.json();
}

const assertJsonNoStore = (res) => {
  assert.match(res.headers.get('content-type') || '', /^application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('x-robots-tag') || '', /noindex/);
};

/* ---------- routes ---------- */

test('routes come from the frozen contract', () => {
  assert.equal(uploadConfig.path, ROUTES.apiImage);
  assert.equal(viewConfig.path, ROUTES.image);
  assert.deepEqual(uploadConfig.method, ['POST']);
  assert.deepEqual(viewConfig.method, ['GET', 'HEAD']);
});

/* ---------- upload refusals ---------- */

test('upload: signed out gets 401 and nothing reaches storage', async () => {
  const res = await upload(post(fx('good.png'), { signedIn: false }), ctx());
  assert.equal(res.status, 401);
  assertJsonNoStore(res);
  assert.deepEqual(await res.json(), { error: 'Sign in required' });
  assert.equal(blobs.calls.length, 0);
  assert.equal(factoryContexts.length, 0);
});

test('upload: a forged or expired cookie gets 401', async () => {
  const expired = makeToken(authConfig(), Date.now() - 13 * 3600 * 1000);
  for (const c of ['yavd_offer_admin=v1.1.2.3', `yavd_offer_admin=${expired}`]) {
    const req = post(fx('good.png'), { signedIn: false, headers: { cookie: c } });
    assert.equal((await upload(req, ctx())).status, 401);
  }
  assert.equal(blobs.calls.length, 0);
});

test('upload: cross-site request refused with 403', async () => {
  const res = await upload(post(fx('good.png'), { origin: 'https://evil.example' }), ctx());
  assert.equal(res.status, 403);
  assertJsonNoStore(res);
  assert.equal(blobs.calls.length, 0);
});

test('upload: only POST', async () => {
  const req = new Request(SITE + ROUTES.apiImage, { method: 'GET', headers: { cookie: cookie() } });
  const res = await upload(req, ctx());
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
});

test('upload: wrong or missing content-type is 415 with the editor message', async () => {
  for (const type of [null, 'text/plain', 'image/svg+xml', 'image/gif', 'application/octet-stream', 'multipart/form-data; boundary=x', 'image/pngx']) {
    const res = await upload(post(fx('good.png'), { type }), ctx());
    assert.equal(res.status, 415, String(type));
    assertJsonNoStore(res);
    assert.deepEqual(await res.json(), { error: IMAGE_MESSAGES.wrongType });
  }
  assert.equal(blobs.calls.length, 0);
});

test('upload: content-type is matched without case or parameters', async () => {
  const res = await upload(post(fx('good.png'), { type: 'Image/PNG; charset=binary' }), ctx());
  assert.equal(res.status, 201);
});

test('upload: an SVG (or GIF, or HTML) sent as image/png is refused 415; the bytes decide', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>');
  const gif = Buffer.from('GIF89a\x20\x00\x20\x00\x00\x00\x00;', 'latin1');
  const html = Buffer.from('<!doctype html><script>alert(1)</script>');
  for (const bytes of [svg, gif, html, fx('good.jpg').subarray(0, 200)]) {
    const res = await upload(post(bytes, { type: 'image/png' }), ctx());
    assert.equal(res.status, 415);
    assert.deepEqual(await res.json(), { error: IMAGE_MESSAGES.wrongType });
  }
  assert.equal(blobs.calls.length, 0);
});

test('upload: a JPEG sent as image/png is stored as JPEG (type only from the bytes)', async () => {
  const out = await uploadOk('good.jpg', 'image/png');
  assert.equal(out.type, 'image/jpeg');
  assert.equal(blobs.m.get(out.id).meta.type, 'image/jpeg');
});

test('upload: empty body is 415', async () => {
  const res = await upload(post(new Uint8Array(0)), ctx());
  assert.equal(res.status, 415);
  assert.equal(blobs.calls.length, 0);
});

test('upload: a declared length over the cap is 413 before the body is read', async () => {
  let pulled = false;
  // highWaterMark 0: the stream only pulls when someone actually reads it.
  const body = new ReadableStream({ pull() { pulled = true; throw new Error('must not read'); } }, { highWaterMark: 0 });
  const res = await upload(post(undefined, { body, headers: { 'content-length': String(IMAGE.maxBytes + 1) } }), ctx());
  assert.equal(res.status, 413);
  assertJsonNoStore(res);
  assert.deepEqual(await res.json(), { error: IMAGE_MESSAGES.tooLarge });
  assert.equal(pulled, false);
  assert.equal(blobs.calls.length, 0);
});

test('upload: a real length over the cap is 413 and reading stops at the cap', async () => {
  // No content-length: a stream of 64 KB chunks that would go on for 10 MB.
  const chunk = new Uint8Array(64 * 1024);
  let sent = 0;
  const body = new ReadableStream({
    pull(c) { if (sent >= 10 * 1024 * 1024) return c.close(); sent += chunk.length; c.enqueue(chunk); }
  });
  const res = await upload(post(undefined, { body }), ctx());
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: IMAGE_MESSAGES.tooLarge });
  assert.ok(sent <= IMAGE.maxBytes + 2 * chunk.length, `read ${sent} bytes`);
  assert.equal(blobs.calls.length, 0);
});

test('upload: exactly the cap is allowed past the size check (then judged by its bytes)', async () => {
  const padded = new Uint8Array(IMAGE.maxBytes);
  const res = await upload(post(padded), ctx());
  assert.equal(res.status, 415); // not 413: the size was fine, the bytes are not a picture
});

test('upload: pixel limits are 422 with the editor message', async () => {
  for (const [name, msg] of [['tiny-10.png', IMAGE_MESSAGES.tooSmall], ['tiny-10.jpg', IMAGE_MESSAGES.tooSmall], ['wide-5000.png', IMAGE_MESSAGES.tooManyPixels]]) {
    const res = await upload(post(fx(name)), ctx());
    assert.equal(res.status, 422, name);
    assert.deepEqual(await res.json(), { error: msg });
  }
  assert.equal(blobs.calls.length, 0);
});

/* ---------- upload and view: the happy path ---------- */

test('good JPEG, PNG and WebP: 201, stored, served back byte-identical with no cookie', async () => {
  const cases = [
    ['good.jpg', 'image/jpeg'], ['good.png', 'image/png'], ['good-alpha.png', 'image/png'],
    ['good-lossy.webp', 'image/webp'], ['good-lossless.webp', 'image/webp'], ['good-vp8x-alpha.webp', 'image/webp']
  ];
  const ids = new Set();
  for (const [name, type] of cases) {
    const file = fx(name);
    const res = await upload(post(file, { type }), ctx());
    assert.equal(res.status, 201, name);
    assertJsonNoStore(res);
    const out = await res.json();
    assert.deepEqual(Object.keys(out), ['id', 'width', 'height', 'type', 'bytes'], name);
    assert.match(out.id, IMAGE.idPattern);
    assert.equal(out.type, type);
    assert.equal(out.bytes, file.length);
    assert.ok(out.width >= IMAGE.minSideServer && out.height >= IMAGE.minSideServer);
    ids.add(out.id);

    const v = await view(get(out.id), viewCtx(out.id)); // no cookie at all
    assert.equal(v.status, 200, name);
    assert.equal(v.headers.get('content-type'), type);
    assert.equal(v.headers.get('content-length'), String(file.length));
    const served = Buffer.from(await v.arrayBuffer());
    assert.ok(served.equals(file), `${name} served byte-identical`);
  }
  assert.equal(ids.size, cases.length, 'every upload gets its own id');
});

test('view: response headers as listed', async () => {
  const { id } = await uploadOk('good.png', 'image/png');
  const v = await view(get(id), viewCtx(id));
  assert.equal(v.status, 200);
  assert.equal(v.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(v.headers.get('x-robots-tag'), 'noindex');
  assert.equal(v.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(v.headers.get('content-disposition'), 'inline');
  assert.equal(v.headers.get('content-security-policy'), "default-src 'none'; sandbox");
  assert.equal(v.headers.get('set-cookie'), null);
});

test('view: the stored type is served, never one from the request', async () => {
  const { id } = await uploadOk('good.jpg', 'image/jpeg');
  const v = await view(get(id, { headers: { accept: 'text/html', 'content-type': 'text/html' } }), viewCtx(id));
  assert.equal(v.headers.get('content-type'), 'image/jpeg');
});

test('view: HEAD gives the headers and no body', async () => {
  const { id, bytes } = await uploadOk('good.png', 'image/png');
  const v = await view(get(id, { method: 'HEAD' }), viewCtx(id));
  assert.equal(v.status, 200);
  assert.equal(v.headers.get('content-length'), String(bytes));
  assert.equal((await v.arrayBuffer()).byteLength, 0);
});

test('view: reads the id from the path when the platform passes no params', async () => {
  const { id } = await uploadOk('good.png', 'image/png');
  const v = await view(get(id), ctx('production'));
  assert.equal(v.status, 200);
});

test('view: other methods are 405', async () => {
  const id = 'a'.repeat(32);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const v = await view(new Request(SITE + imageUrl(id), { method }), viewCtx(id));
    assert.equal(v.status, 405, method);
    assert.equal(v.headers.get('allow'), 'GET, HEAD');
  }
});

/* ---------- view: 404s ---------- */

const assert404 = async (v) => {
  assert.equal(v.status, 404);
  assert.equal(v.headers.get('cache-control'), 'no-store');
  assert.equal(v.headers.get('x-content-type-options'), 'nosniff');
  assert.match(v.headers.get('content-type'), /^text\/plain/);
};

test('view: a bad id shape is 404 and never reaches storage', async () => {
  const bad = ['', 'abc', 'A'.repeat(32), 'g'.repeat(32), 'a'.repeat(31), 'a'.repeat(33),
    '../offers/all', 'all', `${'a'.repeat(32)}/x`, `${'a'.repeat(32)}.png`, '%2e%2e%2fall'];
  for (const id of bad) {
    await assert404(await view(get('placeholder'), viewCtx(id)));
  }
  // Same through the path fallback.
  await assert404(await view(new Request(`${SITE}/api/offers/image/..%2Foffers%2Fall`), ctx('production')));
  await assert404(await view(new Request(`${SITE}/api/offers/image/`), ctx('production')));
  assert.equal(blobs.calls.length, 0);
});

test('view: an unknown id is 404 with no-store', async () => {
  const id = 'b'.repeat(32);
  await assert404(await view(get(id), viewCtx(id)));
  assert.deepEqual(blobs.calls, [['getWithMetadata', id]]);
});

test('view: a record with unusable details is 404, never served', async () => {
  const id = 'c'.repeat(32);
  blobs.m.set(id, { bytes: Uint8Array.from(fx('good.png')), meta: { type: 'text/html', bytes: fx('good.png').length, width: 1, height: 1, uploadedAt: '2026-11-11T16:00:00.000Z' } });
  await assert404(await view(get(id), viewCtx(id)));
});

/* ---------- storage failures ---------- */

test('storage down: view is a quiet 404, upload is a clean JSON 503 that leaks nothing', async () => {
  _setImagesStoreFactoryForTests(() => broken());
  const id = 'd'.repeat(32);
  await assert404(await view(get(id), viewCtx(id)));

  const res = await upload(post(fx('good.png')), ctx());
  assert.equal(res.status, 503);
  assertJsonNoStore(res);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.doesNotMatch(body.error, /secret|blobs/i);
});

test('storage cannot even open: view 404, upload 503', async () => {
  _setImagesStoreFactoryForTests(() => { throw new Error('no blobs'); });
  const id = 'e'.repeat(32);
  await assert404(await view(get(id), viewCtx(id)));
  const res = await upload(post(fx('good.png')), ctx());
  assert.equal(res.status, 503);
  assertJsonNoStore(res);
});

test('test switch: x-yavd-test-store-fail forces the failure off production only', async () => {
  const { id } = await uploadOk('good.png', 'image/png');
  const fail = { 'x-yavd-test-store-fail': '1' };

  for (const c of ['branch-deploy', 'deploy-preview', 'dev']) {
    blobs.calls.length = 0;
    await assert404(await view(get(id, { headers: fail }), viewCtx(id, c)));
    const res = await upload(post(fx('good.png'), { headers: fail }), ctx(c));
    assert.equal(res.status, 503, c);
    assertJsonNoStore(res);
    assert.ok((await res.json()).error);
    assert.equal(blobs.calls.filter(([op]) => op === 'set').length, 0, `${c}: nothing stored`);
  }

  // Production ignores the header.
  assert.equal((await view(get(id, { headers: fail }), viewCtx(id, 'production'))).status, 200);
  assert.equal((await upload(post(fx('good.png'), { headers: fail }), ctx('production'))).status, 201);
});

test('the deploy context picks the store (production vs test)', async () => {
  await upload(post(fx('good.png')), ctx('branch-deploy'));
  const { id } = await uploadOk('good.png', 'image/png');
  await view(get(id), viewCtx(id, 'deploy-preview'));
  assert.deepEqual(factoryContexts, ['branch-deploy', 'production', 'deploy-preview']);
});
