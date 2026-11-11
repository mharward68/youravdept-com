// Session 3.3: the picture store. Run: node --test netlify/tests/offer-images-store.test.mjs
//
// The in-memory store mirrors the Blobs calls the module uses: set (with
// metadata and onlyIfNew), getWithMetadata (type arrayBuffer), getMetadata,
// list and delete. Every call is recorded so a test can prove a bad id never
// reaches storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGE } from '../../shared/offer-contract.js';
import { checkImage } from '../functions/lib/offer-image.mjs';
import * as S from '../functions/lib/offer-images-store.mjs';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

function memoryBlobs() {
  const m = new Map();
  const calls = [];
  const s = {
    m, calls,
    async set(k, data, o = {}) {
      calls.push(['set', k]);
      if (o.onlyIfNew && m.has(k)) return { modified: false };
      const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
      m.set(k, { bytes: Uint8Array.from(bytes), meta: structuredClone(o.metadata ?? {}) });
      return { modified: true, etag: `"${k}"` };
    },
    async getWithMetadata(k, o = {}) {
      calls.push(['getWithMetadata', k]);
      assert.equal(o.type, 'arrayBuffer');
      const e = m.get(k);
      if (!e) return null;
      return { data: e.bytes.slice().buffer, metadata: structuredClone(e.meta), etag: `"${k}"` };
    },
    async getMetadata(k) {
      calls.push(['getMetadata', k]);
      const e = m.get(k);
      return e ? { etag: `"${k}"`, metadata: structuredClone(e.meta) } : null;
    },
    async list() {
      calls.push(['list']);
      return { blobs: [...m.keys()].map((key) => ({ key, etag: `"${key}"` })), directories: [] };
    },
    async delete(k) { calls.push(['delete', k]); m.delete(k); }
  };
  return s;
}

function broken() {
  const down = async () => { throw new Error('blobs down'); };
  return { set: down, getWithMetadata: down, getMetadata: down, list: down, delete: down };
}

let blobs;
beforeEach(() => {
  blobs = memoryBlobs();
  S._setImagesStoreFactoryForTests(() => blobs);
});

const NOW = new Date('2026-11-11T16:00:00.000Z');
const checked = (name) => { const b = fx(name); const r = checkImage(b); assert.ok(r.ok, name); return { b, info: r.info }; };

test('store name: base on production, "-test" everywhere else', () => {
  assert.equal(S.imagesStoreName('production'), 'offer-images');
  for (const ctx of ['deploy-preview', 'branch-deploy', 'dev', undefined, '']) {
    assert.equal(S.imagesStoreName(ctx), 'offer-images-test', String(ctx));
  }
});

test('imagesStore uses the factory with the deploy context; a factory that throws is a clean error', () => {
  let seen;
  S._setImagesStoreFactoryForTests((ctx) => { seen = ctx; return blobs; });
  assert.equal(S.imagesStore('production'), blobs);
  assert.equal(seen, 'production');
  S._setImagesStoreFactoryForTests(() => { throw new Error('no blobs here'); });
  assert.throws(() => S.imagesStore('production'), (e) => e instanceof S.ImageStoreError && e.status === 503);
});

test('round trip for JPEG, PNG and WebP: bytes identical, details from the checked file', async () => {
  for (const name of ['good.jpg', 'good.png', 'good-lossless.webp', 'good-vp8x-alpha.webp']) {
    const { b, info } = checked(name);
    const put = await S.putImage(blobs, b, info, NOW);
    assert.match(put.id, IMAGE.idPattern);
    assert.deepEqual(put, { id: put.id, type: info.type, bytes: b.length, width: info.width, height: info.height, uploadedAt: NOW.toISOString() });

    const got = await S.getImage(blobs, put.id);
    assert.ok(got.bytes instanceof Uint8Array);
    assert.ok(Buffer.from(got.bytes).equals(b), `${name} bytes identical`);
    assert.deepEqual(Object.keys(got.meta), ['type', 'bytes', 'width', 'height', 'uploadedAt']);
    assert.deepEqual(got.meta, { type: info.type, bytes: b.length, width: info.width, height: info.height, uploadedAt: NOW.toISOString() });

    assert.deepEqual(await S.headImage(blobs, put.id), got.meta);
    console.log(`  ${name} -> ${put.id} ${put.type} ${put.width}x${put.height} ${put.bytes} B`);
  }
  // head reads metadata only, never the bytes
  const before = blobs.calls.filter((c) => c[0] === 'getWithMetadata').length;
  const { b, info } = checked('good.png');
  const { id } = await S.putImage(blobs, b, info, NOW);
  await S.headImage(blobs, id);
  assert.equal(blobs.calls.filter((c) => c[0] === 'getWithMetadata').length, before);
});

test('every put gets a new id and writes with onlyIfNew', async () => {
  const { b, info } = checked('good.jpg');
  const ids = new Set();
  for (let i = 0; i < 20; i++) ids.add((await S.putImage(blobs, b, info, NOW)).id);
  assert.equal(ids.size, 20);
  let opts;
  const spy = { ...blobs, set: async (k, d, o) => { opts = o; return blobs.set(k, d, o); } };
  await S.putImage(spy, b, info, NOW);
  assert.equal(opts.onlyIfNew, true);
});

test('an id clash never overwrites: second try uses a new id, two clashes is an error', async () => {
  const { b, info } = checked('good.jpg');
  let n = 0;
  const once = { ...blobs, set: async (k, d, o) => (++n === 1 ? { modified: false } : blobs.set(k, d, o)) };
  const put = await S.putImage(once, b, info, NOW);
  assert.equal(n, 2);
  assert.ok(await S.getImage(blobs, put.id));
  const never = { ...blobs, set: async () => ({ modified: false }) };
  await assert.rejects(S.putImage(never, b, info, NOW), (e) => e instanceof S.ImageStoreError && e.status === 503);
});

test('put refuses details that do not match the file, before any storage call', async () => {
  const { b, info } = checked('good.png');
  const bad = [
    null,
    { ...info, bytes: b.length + 1 },
    { ...info, type: 'image/svg+xml' },
    { ...info, type: 'image/gif' },
    { ...info, width: 0 },
    { ...info, height: 1.5 },
    { ...info, width: undefined }
  ];
  for (const i of bad) {
    await assert.rejects(S.putImage(blobs, b, i, NOW), (e) => e instanceof S.ImageStoreError && e.status === 400, JSON.stringify(i));
  }
  await assert.rejects(S.putImage(blobs, new Uint8Array(0), info, NOW), (e) => e.status === 400);
  await assert.rejects(S.putImage(blobs, 'not bytes', info, NOW), (e) => e.status === 400);
  assert.equal(blobs.calls.length, 0);
});

test('unknown id is null for get and head', async () => {
  const id = 'a'.repeat(32);
  assert.equal(await S.getImage(blobs, id), null);
  assert.equal(await S.headImage(blobs, id), null);
});

test('a bad id shape is refused before any storage call', async () => {
  const BAD = ['', 'A'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), '../offers/all', 'all', `${'a'.repeat(32)}\n`,
    `history/${'a'.repeat(24)}`, null, undefined, 42, { id: 'a'.repeat(32) }, ['a'.repeat(32)]];
  for (const id of BAD) {
    assert.equal(S.isImageId(id), false, String(id));
    assert.equal(await S.getImage(blobs, id), null);
    assert.equal(await S.headImage(blobs, id), null);
    await assert.rejects(S.deleteImage(blobs, id), (e) => e instanceof S.ImageStoreError && e.status === 400);
  }
  assert.deepEqual(blobs.calls, []);
});

test('list returns picture ids only, sorted; delete removes one and is quiet when already gone', async () => {
  const { b, info } = checked('good.jpg');
  const a = (await S.putImage(blobs, b, info, NOW)).id;
  const c = (await S.putImage(blobs, b, info, NOW)).id;
  blobs.m.set('stray-key', { bytes: new Uint8Array([1]), meta: {} });
  assert.deepEqual(await S.listImages(blobs), [a, c].sort());

  await S.deleteImage(blobs, a);
  assert.equal(await S.getImage(blobs, a), null);
  assert.deepEqual(await S.listImages(blobs), [c]);
  await S.deleteImage(blobs, a); // already gone: no error
  assert.deepEqual(await S.listImages(memoryBlobs()), []);   // empty store
});

test('a record with unusable metadata or a size mismatch reads as missing', async () => {
  const { b, info } = checked('good.png');
  const { id } = await S.putImage(blobs, b, info, NOW);
  const good = blobs.m.get(id).meta;
  const cases = [
    {},
    { ...good, type: 'text/html' },
    { ...good, type: 'image/svg+xml' },
    { ...good, width: -1 },
    { ...good, uploadedAt: 'yesterday' },
    { ...good, bytes: good.bytes + 1 }      // head cannot see this one, get can
  ];
  for (const meta of cases) {
    blobs.m.get(id).meta = meta;
    assert.equal(await S.getImage(blobs, id), null, JSON.stringify(meta));
  }
  for (const meta of cases.slice(0, -1)) {
    blobs.m.get(id).meta = meta;
    assert.equal(await S.headImage(blobs, id), null, JSON.stringify(meta));
  }
});

test('storage throwing becomes ImageStoreError (503) on every call', async () => {
  const s = broken();
  const { b, info } = checked('good.jpg');
  const id = 'b'.repeat(32);
  const runs = [
    ['putImage', () => S.putImage(s, b, info, NOW)],
    ['getImage', () => S.getImage(s, id)],
    ['headImage', () => S.headImage(s, id)],
    ['listImages', () => S.listImages(s)],
    ['deleteImage', () => S.deleteImage(s, id)]
  ];
  for (const [name, run] of runs) {
    await assert.rejects(run(), (e) => {
      assert.ok(e instanceof S.ImageStoreError, name);
      assert.equal(e.status, 503);
      assert.doesNotMatch(e.message, /blobs down/);
      console.log(`  ${name} -> ${e.status} ${e.message}`);
      return true;
    });
  }
});
