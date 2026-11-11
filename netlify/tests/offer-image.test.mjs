// Session 3.2: read and check an image. Run: node --test netlify/tests/offer-image.test.mjs
//
// Fixtures in netlify/tests/fixtures/ were encoded by Microsoft Edge's own
// canvas (headless), so they are real encoder output. The simple VP8 and VP8L
// WebP files are the inner chunks of Edge's extended (VP8X) files, rewrapped.
// All ten were decoded back in Edge at the sizes listed in GOOD below.
// Cases that need odd bytes (truncation, comments, animation) are made here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGE } from '../../shared/offer-contract.js';
import { sniffImage, checkImage, newImageId, IMAGE_MESSAGES } from '../functions/lib/offer-image.mjs';

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

const GOOD = [
  ['good.jpg', 'image/jpeg', 64, 48],
  ['good.png', 'image/png', 64, 48],
  ['good-alpha.png', 'image/png', 40, 30],
  ['good-lossy.webp', 'image/webp', 64, 48],          // simple VP8
  ['good-lossless.webp', 'image/webp', 64, 48],       // simple VP8L
  ['good-vp8x-alpha.webp', 'image/webp', 64, 48],     // VP8X + ICCP + ALPH + VP8
  ['good-vp8x-lossless.webp', 'image/webp', 64, 48]   // VP8X + ICCP + VP8L
];

const MESSAGES = new Set(Object.values(IMAGE_MESSAGES));

/** Asserts a refusal, prints its message in the test output, returns it. */
function refused(t, bytes, status, message) {
  const r = checkImage(bytes);
  assert.equal(r.ok, false);
  assert.equal(r.status, status);
  assert.equal(r.error, message);
  assert.ok(MESSAGES.has(r.error));
  t.diagnostic(`${r.status} ${r.error}`);
  return r;
}

const webp = (...chunks) => {
  const body = Buffer.concat(chunks);
  const h = Buffer.alloc(12);
  h.write('RIFF', 0, 'latin1'); h.writeUInt32LE(4 + body.length, 4); h.write('WEBP', 8, 'latin1');
  return Buffer.concat([h, body]);
};
const chunk = (id, data) => {
  const h = Buffer.alloc(8);
  h.write(id, 0, 'latin1'); h.writeUInt32LE(data.length, 4);
  return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
/** The chunks of a WebP file, as [id, data] pairs. */
function chunksOf(b) {
  const out = [];
  for (let p = 12; p + 8 <= b.length;) {
    const id = b.toString('latin1', p, p + 4), size = b.readUInt32LE(p + 4);
    out.push([id, b.subarray(p + 8, p + 8 + size)]);
    p += 8 + size + (size & 1);
  }
  return out;
}

/* ---------- good pictures ---------- */

for (const [name, type, width, height] of GOOD) {
  test(`accepts ${name} as ${type} ${width}x${height}`, () => {
    const bytes = fx(name);
    assert.deepEqual(sniffImage(bytes), { type, width, height });
    assert.deepEqual(checkImage(bytes), { ok: true, info: { type, width, height, bytes: bytes.length } });
  });
}

test('accepts an ArrayBuffer and a plain Uint8Array as well as a Buffer', () => {
  const b = fx('good.png');
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  assert.equal(checkImage(ab).ok, true);
  assert.equal(checkImage(new Uint8Array(ab)).ok, true);
});

test('JPEG: a comment segment before the frame header is skipped', () => {
  const b = fx('good.jpg');
  const text = Buffer.from('Shot by YAVD\0', 'latin1');
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, text.length + 2]), text]);
  const withCom = Buffer.concat([b.subarray(0, 2), com, b.subarray(2)]);
  assert.deepEqual(sniffImage(withCom), { type: 'image/jpeg', width: 64, height: 48 });
});

test('JPEG: a progressive frame (SOF2) is read too', () => {
  const b = Buffer.from(fx('good.jpg'));
  const p = b.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(p > 0);
  b[p + 1] = 0xc2;
  assert.deepEqual(sniffImage(b), { type: 'image/jpeg', width: 64, height: 48 });
});

test('JPEG: trailing zero padding after the end marker is allowed', () => {
  const b = Buffer.concat([fx('good.jpg'), Buffer.alloc(40)]);
  assert.equal(checkImage(b).ok, true);
});

test('exactly the byte cap is accepted', () => {
  const b = fx('good.jpg');
  const atCap = Buffer.concat([b, Buffer.alloc(IMAGE.maxBytes - b.length)]);
  assert.equal(atCap.length, IMAGE.maxBytes);
  assert.equal(checkImage(atCap).ok, true);
});

/* ---------- refused: wrong type ---------- */

test('refuses SVG text', (t) => {
  refused(t, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><script>alert(1)</script></svg>'),
    415, IMAGE_MESSAGES.wrongType);
  refused(t, Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'), 415, IMAGE_MESSAGES.wrongType);
});

test('refuses a real GIF', (t) => {
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  assert.equal(gif.toString('latin1', 0, 6), 'GIF89a');
  refused(t, gif, 415, IMAGE_MESSAGES.wrongType);
});

test('refuses a program (.exe) and a PDF, whatever they are named', (t) => {
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
  refused(t, exe, 415, IMAGE_MESSAGES.wrongType);
  refused(t, Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'), 415, IMAGE_MESSAGES.wrongType);
});

test('refuses HTML sent as a JPEG: the claimed name and type are never consulted', (t) => {
  const html = Buffer.from('<!doctype html><html><body><img src=x onerror=alert(1)></body></html>');
  // Extra arguments (a name, a claimed type) are ignored by design: only bytes count.
  assert.equal(sniffImage(html, 'photo.jpg', 'image/jpeg'), null);
  refused(t, html, 415, IMAGE_MESSAGES.wrongType);
  // And a real PNG claimed to be a JPEG is still a PNG.
  assert.equal(sniffImage(fx('good.png'), 'photo.jpg', 'image/jpeg').type, 'image/png');
});

test('refuses zero-length and non-byte input', (t) => {
  refused(t, Buffer.alloc(0), 415, IMAGE_MESSAGES.wrongType);
  for (const bad of [null, undefined, 'hello', 42, {}, []]) {
    assert.equal(sniffImage(bad), null);
    assert.equal(checkImage(bad).status, 415);
  }
});

test('refuses an animated WebP (flag set, or animation chunks present)', (t) => {
  const b = Buffer.from(fx('good-vp8x-alpha.webp'));
  b[20] |= 0x02;
  refused(t, b, 415, IMAGE_MESSAGES.wrongType);

  const [[, x], ...rest] = chunksOf(fx('good-vp8x-alpha.webp'));
  const withAnmf = webp(chunk('VP8X', x), chunk('ANMF', Buffer.alloc(16)), ...rest.map(([id, d]) => chunk(id, d)));
  refused(t, withAnmf, 415, IMAGE_MESSAGES.wrongType);
});

test('refuses a VP8X WebP with no image inside', (t) => {
  const [[, x], [, iccp]] = chunksOf(fx('good-vp8x-alpha.webp'));
  refused(t, webp(chunk('VP8X', x), chunk('ICCP', iccp)), 415, IMAGE_MESSAGES.wrongType);
});

test('refuses a JPEG whose height is left for later (DNL, height 0)', (t) => {
  const b = Buffer.from(fx('good.jpg'));
  const p = b.indexOf(Buffer.from([0xff, 0xc0]));
  b[p + 5] = 0; b[p + 6] = 0;
  refused(t, b, 415, IMAGE_MESSAGES.wrongType);
});

/* ---------- refused: truncated, every possible cut ---------- */

for (const [name] of GOOD) {
  test(`refuses ${name} cut off at every length`, (t) => {
    const b = fx(name);
    for (let n = 0; n < b.length; n++) {
      const r = checkImage(b.subarray(0, n));
      assert.equal(r.ok, false, `cut at ${n} of ${b.length} was accepted`);
      assert.equal(r.error, IMAGE_MESSAGES.wrongType);
    }
    t.diagnostic(`${b.length} cuts refused: 415 ${IMAGE_MESSAGES.wrongType}`);
  });
}

/* ---------- refused: size and pixels ---------- */

test('refuses over the byte cap, before reading the picture', (t) => {
  const over = Buffer.concat([fx('good.jpg'), Buffer.alloc(700 * 1024)]);
  assert.ok(over.length > IMAGE.maxBytes);
  refused(t, over, 413, IMAGE_MESSAGES.tooLarge);
  // One byte over is enough.
  const b = fx('good.jpg');
  refused(t, Buffer.concat([b, Buffer.alloc(IMAGE.maxBytes - b.length + 1)]), 413, IMAGE_MESSAGES.tooLarge);
});

test('refuses more than 4096 pixels on a side (5000 px wide PNG)', (t) => {
  assert.deepEqual(sniffImage(fx('wide-5000.png')), { type: 'image/png', width: 5000, height: 20 });
  refused(t, fx('wide-5000.png'), 422, IMAGE_MESSAGES.tooManyPixels);
});

test('refuses fewer than 16 pixels on a side (10 px PNG and JPEG)', (t) => {
  refused(t, fx('tiny-10.png'), 422, IMAGE_MESSAGES.tooSmall);
  refused(t, fx('tiny-10.jpg'), 422, IMAGE_MESSAGES.tooSmall);
});

test('PNG with a hostile 4-billion-pixel header is refused, not trusted', (t) => {
  const b = Buffer.from(fx('good.png'));
  b.writeUInt32BE(0xffffffff, 16);
  assert.equal(sniffImage(b).width, 0xffffffff);
  refused(t, b, 422, IMAGE_MESSAGES.tooManyPixels);
});

/* ---------- hostile bytes never crash ---------- */

test('3000 random corruptions of every good file never throw', () => {
  let seed = 32;                                           // fixed seed: same run every time
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0x100000000);
  for (const [name] of GOOD) {
    const base = fx(name);
    for (let i = 0; i < 3000 / GOOD.length; i++) {
      const b = Buffer.from(base);
      const flips = 1 + Math.floor(rand() * 8);
      for (let f = 0; f < flips; f++) b[Math.floor(rand() * b.length)] = Math.floor(rand() * 256);
      const r = checkImage(b);
      if (r.ok) {
        assert.ok(IMAGE.mimeTypes.includes(r.info.type));
        assert.ok(Number.isInteger(r.info.width) && r.info.width >= IMAGE.minSideServer && r.info.width <= IMAGE.maxSideServer);
        assert.ok(Number.isInteger(r.info.height) && r.info.height >= IMAGE.minSideServer && r.info.height <= IMAGE.maxSideServer);
      } else {
        assert.ok(MESSAGES.has(r.error));
      }
    }
  }
});

/* ---------- ids ---------- */

test('newImageId: 32 lowercase hex, matches the contract pattern, no repeats in 2000', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = newImageId();
    assert.match(id, IMAGE.idPattern);
    seen.add(id);
  }
  assert.equal(seen.size, 2000);
});

test('messages: the five plan messages are unchanged', () => {
  assert.equal(IMAGE_MESSAGES.wrongType, 'Use a JPG, PNG or WebP picture.');
  assert.equal(IMAGE_MESSAGES.tooLarge, 'That picture is still over 600 KB after shrinking. Try a smaller or simpler one.');
  assert.equal(IMAGE_MESSAGES.noAlt, 'Describe the picture in a few words (up to 125 characters).');
  assert.equal(IMAGE_MESSAGES.gone, 'That picture is no longer available. Add it again.');
  assert.equal(IMAGE_MESSAGES.uploadFailed, 'The picture did not upload. Your offer text was saved without a new picture.');
});
