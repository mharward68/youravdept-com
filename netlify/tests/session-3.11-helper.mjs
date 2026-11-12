// Session 3.11 helper for session-3.11-verify.ps1 (not a test file: node --test
// never picks it up, and netlify/ is never published).
//
//   node netlify/tests/session-3.11-helper.mjs make <dir>
//       Writes the test pictures and manifest.json into <dir>, checked with the
//       server's own checkImage:
//         big-1.png .. big-8.png  real noisy PNGs of about 590 KB (accepted)
//         oversize.png            real noisy PNG of about 700 KB (413)
//         look-wide.png           1200x675 navy/teal picture for the top banner
//         look-tall.png           800x1000 navy/teal picture for left and right
//         anim.gif, evil.svg      refused types (415)
//       Prints one JSON line { ok, files: { name: { bytes, sha256, ... } } }.
//   node netlify/tests/session-3.11-helper.mjs page <html-file>
//       The injected offer block: { blocks, v, isTest, offerKeys, imageKeys,
//       image, offerName, mentionsPreviewKey }.
//   node netlify/tests/session-3.11-helper.mjs export <json-file>
//       Summary of one export file: sizes, part numbers, each picture's id and
//       the sha256 of its decoded bytes.
//   node netlify/tests/session-3.11-helper.mjs body <json-file> <id> <extra-json-file|-> <out-file>
//       Writes a save body for that offer to <out-file> (UTF-8, no BOM): the
//       whole offer as GET /api/offers or a save response gave it, minus
//       "status", with the keys in extra-json-file laid over it (e.g.
//       {"draft":true} or {"image":{...}}). The server keeps the stored value
//       of any key left out, but the full offer is sent, as the editor does.
//       Keeps the exact updatedAt string (PowerShell 7 would turn it into a
//       date, and PowerShell 5.1 mangles quotes and non-ASCII in native output).
//   node netlify/tests/session-3.11-helper.mjs same <before-json> <id> <after-json>
//       Compares one offer before and after a no-change save: every key equal
//       except updatedAt and status (a missing image counts as null, a
//       missing eyebrow as "": keys added by later contracts).

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { checkImage } from '../functions/lib/offer-image.mjs';
import { IMAGE, PUBLIC_IMAGE_KEYS, PUBLIC_OFFER_KEYS } from '../../shared/offer-contract.js';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/* ---------- PNG writer (no dependency) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const x of buf) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** RGB PNG from a pixel function (x, y) -> [r, g, b], or random noise when fn is null. */
function png(width, height, fn) {
  const row = 1 + width * 3;
  const raw = fn ? Buffer.alloc(row * height) : randomBytes(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0;                                   // filter: none
    if (!fn) continue;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fn(x, y);
      const p = y * row + 1 + x * 3;
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** Brand navy to teal, with soft rings, so the look is a real picture. */
function brand(width, height) {
  const navy = [0x0b, 0x1f, 0x3a], teal = [0x14, 0xa3, 0x9a];
  const cx = width * 0.68, cy = height * 0.4;
  return png(width, height, (x, y) => {
    const t = (x / width) * 0.6 + (y / height) * 0.4;
    const d = Math.hypot(x - cx, y - cy);
    const ring = Math.cos(d / 22) > 0.92 ? 28 : 0;
    return navy.map((n, i) => Math.min(255, Math.round(n + (teal[i] - n) * t) + ring));
  });
}

// GIF89a, 1x1 (the classic transparent pixel). Refused whatever header it carries.
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48"><script>alert(1)</script><rect width="64" height="48"/></svg>');

function make(dir) {
  mkdirSync(dir, { recursive: true });
  // 448 x 449 RGB noise: 449 rows of 1345 bytes = 603,905 raw bytes. Noise does
  // not compress, so the file lands near 590 KB, under the 600 KB cap.
  const want = {};
  for (let i = 1; i <= 8; i++) want[`big-${i}.png`] = { bytes: png(448, 449, null), expect: 'ok' };
  want['oversize.png'] = { bytes: png(520, 460, null), expect: 413 };
  want['look-wide.png'] = { bytes: brand(1200, 675), expect: 'ok' };
  want['look-tall.png'] = { bytes: brand(800, 1000), expect: 'ok' };
  want['anim.gif'] = { bytes: GIF, expect: 415 };
  want['evil.svg'] = { bytes: SVG, expect: 415 };

  const files = {};
  let ok = true;
  for (const [name, { bytes, expect }] of Object.entries(want)) {
    const c = checkImage(bytes);
    const got = c.ok ? 'ok' : c.status;
    const fine = got === expect && (name.startsWith('big-') ? bytes.length >= 580 * 1024 && bytes.length <= IMAGE.maxBytes : true);
    if (!fine) ok = false;
    writeFileSync(join(dir, name), bytes);
    files[name] = { bytes: bytes.length, sha256: sha256(bytes), check: got, expected: expect, fine,
      ...(c.ok ? { type: c.info.type, width: c.info.width, height: c.info.height } : {}) };
  }
  const out = { ok, files };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(out, null, 2));
  return out;
}

/* ---------- reading what the server sent ---------- */

function page(file) {
  const html = readFileSync(file, 'utf8');
  const re = /<script type="application\/json" id="yavd-offer-data">([\s\S]*?)<\/script>/g;
  const found = [...html.matchAll(re)];
  const out = { blocks: found.length, v: null, isTest: null, offerKeys: [], imageKeys: [], image: null,
    offerName: null, mentionsPreviewKey: false, expectedOfferKeys: PUBLIC_OFFER_KEYS, expectedImageKeys: PUBLIC_IMAGE_KEYS };
  if (!found.length) return out;
  const raw = found[0][1];
  out.mentionsPreviewKey = /previewKey/i.test(raw);
  try {
    const data = JSON.parse(raw);
    out.v = data.v ?? null;
    out.isTest = data.isTest ?? null;
    out.offerKeys = Object.keys(data.offer || {});
    out.offerName = data.offer?.name ?? null;
    out.image = data.offer?.image ?? null;
    out.imageKeys = out.image && typeof out.image === 'object' ? Object.keys(out.image) : [];
  } catch (err) {
    out.parseError = err.message;
  }
  return out;
}

function exportSummary(file) {
  const text = readFileSync(file);
  const out = { fileBytes: text.length };
  let data;
  try { data = JSON.parse(text.toString('utf8')); } catch (err) { return { ...out, parseError: err.message }; }
  Object.assign(out, {
    kind: data.kind ?? null, contract: data.contract ?? null, store: data.store ?? null,
    part: data.part ?? 1, parts: data.parts ?? null, next: data.next ?? null, count: data.count ?? null,
    imagesOmitted: data.imagesOmitted ?? null, imagesMissing: data.imagesMissing ?? null,
    imagesNote: data.imagesNote ?? null,
    images: (data.images || []).map((im) => {
      const bytes = Buffer.from(im.dataBase64 || '', 'base64');
      return { id: im.id, type: im.type, bytes: im.bytes, width: im.width, height: im.height,
        decodedBytes: bytes.length, sha256: sha256(bytes) };
    })
  });
  return out;
}

/** The offer with this id from a list response, a save response or a single offer. */
function findOffer(file, id) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (Array.isArray(data.offers)) return data.offers.find((o) => o.id === id) || null;
  if (data.offer && data.offer.id === id) return data.offer;
  return data.id === id ? data : null;
}

function body(file, id, extraFile, outFile) {
  const o = findOffer(file, id);
  if (!o) return { error: `offer ${id} not found in ${file}` };
  if (!outFile) return { error: 'body needs an out-file' };
  const extra = extraFile && extraFile !== '-' ? JSON.parse(readFileSync(extraFile, 'utf8').replace(/^\uFEFF/, '')) : {};
  const { status, ...rest } = o;
  const out = { ...rest, ...extra, id: o.id, updatedAt: o.updatedAt };
  writeFileSync(outFile, JSON.stringify(out));
  return { id: out.id, updatedAt: out.updatedAt, keys: Object.keys(out).length, extra: Object.keys(extra) };
}

// Keys added by later contracts. An offer saved before them has no such key;
// its next save writes the empty value, which every reader treats the same
// (seen on TEST in 3.11: a 1.6 offer gained eyebrow "").
const FILLED_ON_SAVE = { image: null, eyebrow: '' };

function same(beforeFile, id, afterFile) {
  const a = findOffer(beforeFile, id);
  const b = findOffer(afterFile, id);
  if (!a || !b) return { same: false, diffs: ['offer missing'] };
  const skip = new Set(['updatedAt', 'status']);
  const diffs = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skip.has(k)) continue;
    const av = k in FILLED_ON_SAVE ? (a[k] ?? FILLED_ON_SAVE[k]) : a[k];
    const bv = k in FILLED_ON_SAVE ? (b[k] ?? FILLED_ON_SAVE[k]) : b[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push(k);
  }
  return { same: diffs.length === 0, diffs, updatedAtMoved: a.updatedAt !== b.updatedAt };
}

/* ---------- command line ---------- */

const [cmd, ...rest] = process.argv.slice(2);
let result;
try {
  if (cmd === 'make') result = make(rest[0]);
  else if (cmd === 'page') result = page(rest[0]);
  else if (cmd === 'export') result = exportSummary(rest[0]);
  else if (cmd === 'body') result = body(rest[0], rest[1], rest[2], rest[3]);
  else if (cmd === 'same') result = same(rest[0], rest[1], rest[2]);
  else result = { error: 'Use: make <dir> | page <html> | export <json> | body <json> <id> <extra-json|-> <out> | same <before> <id> <after>' };
} catch (err) {
  result = { error: err.message };
}
process.stdout.write(JSON.stringify(result) + '\n');
process.exitCode = result.error || result.ok === false ? 1 : 0;
