// YAVD Offers Module: read and check an uploaded picture (Session 3.2)
//
// Pure functions, no storage, no network. The server decides what a file is
// from its own bytes, never from its name, a header or anything the browser
// says. Tested in netlify/tests/offer-image.test.mjs.
//
// What it does
// - sniffImage(bytes): recognises a complete JPEG, PNG or WebP and reads its
//   width and height from the headers. Returns { type, width, height } or
//   null. Every read is bounds-checked, so a truncated or hostile file gives
//   null, never a crash. SVG, GIF, animated WebP and everything else give null.
// - checkImage(bytes): applies the IMAGE limits from the contract (byte cap,
//   pixel limits) and returns { ok: true, info } or
//   { ok: false, status, error } with a message the editor can show.
// - newImageId(): 32 random hex characters (IMAGE.idPattern).
// - IMAGE_MESSAGES: the editor messages, one place for 3.4, 3.5, 3.9, 3.10.
//
// "Complete" means the file also ends the way its format ends (JPEG end
// marker, PNG IEND chunk, WebP RIFF length), so a cut-off upload is refused
// rather than stored as a broken picture. The browser re-encodes every
// picture before upload, so clean endings are what it sends.
//
// Not a function itself: netlify/functions/lib/ holds no lib.mjs or index.mjs.

import { randomBytes } from 'node:crypto';
import { IMAGE } from '../../../shared/offer-contract.js';

/* ---------- messages (plan "Server messages"; tooSmall and tooManyPixels added in 3.2) ---------- */

export const IMAGE_MESSAGES = Object.freeze({
  wrongType: 'Use a JPG, PNG or WebP picture.',
  tooLarge: 'That picture is still over 600 KB after shrinking. Try a smaller or simpler one.',
  noAlt: 'Describe the picture in a few words (up to 125 characters).',
  gone: 'That picture is no longer available. Add it again.',
  uploadFailed: 'The picture did not upload. Your offer text was saved without a new picture.',
  tooSmall: `That picture is too small. Use one at least ${IMAGE.minSideServer} pixels on each side.`,
  tooManyPixels: `That picture is over ${IMAGE.maxSideServer} pixels on a side. Use a smaller one.`
});

/* ---------- byte helpers (all bounds-checked by the callers) ---------- */

function toBytes(input) {
  if (input instanceof Uint8Array) return input;            // includes Buffer
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return null;
}
const be16 = (b, p) => (b[p] << 8) | b[p + 1];
const be32 = (b, p) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const le16 = (b, p) => b[p] | (b[p + 1] << 8);
const le24 = (b, p) => b[p] | (b[p + 1] << 8) | (b[p + 2] << 16);
const le32 = (b, p) => (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + b[p + 3] * 0x1000000;
const ascii = (b, p, n) => (p + n <= b.length ? String.fromCharCode(...b.subarray(p, p + n)) : '');

/* ---------- JPEG ---------- */

// SOF markers that carry the frame size. C4 (DHT), C8 (JPG) and CC (DAC) are not frames.
const isSof = (m) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function sniffJpeg(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  // Must end with the EOI marker (trailing zero padding allowed).
  let end = b.length;
  while (end > 2 && b[end - 1] === 0x00) end--;
  if (end < 4 || b[end - 2] !== 0xff || b[end - 1] !== 0xd9) return null;

  let p = 2;
  while (p < end) {
    if (b[p] !== 0xff) return null;                        // segments must start on a marker
    while (p < end && b[p] === 0xff) p++;                  // fill bytes
    if (p >= end) return null;
    const m = b[p++];
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;  // markers with no length
    if (m === 0xd8 || m === 0xd9 || m === 0xda) return null; // SOI again, EOI or scan before any frame
    if (p + 2 > end) return null;
    const len = be16(b, p);
    if (len < 2 || p + len > end) return null;
    if (isSof(m)) {
      if (len < 7) return null;
      const height = be16(b, p + 3);
      const width = be16(b, p + 5);
      if (!width || !height) return null;                  // height 0 = defined later (DNL): refused
      return { type: 'image/jpeg', width, height };
    }
    p += len;
  }
  return null;
}

/* ---------- PNG ---------- */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function sniffPng(b) {
  // signature (8) + IHDR chunk (4 len, 4 type, 13 data, 4 crc) + IEND chunk (12)
  if (b.length < 8 + 25 + 12) return null;
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) return null;
  if (be32(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return null;
  if (be32(b, b.length - 12) !== 0 || ascii(b, b.length - 8, 4) !== 'IEND') return null;
  const width = be32(b, 16);
  const height = be32(b, 20);
  if (!width || !height) return null;
  return { type: 'image/png', width, height };
}

/* ---------- WebP ---------- */

function vp8Size(b, p, size) {          // p = start of chunk data
  if (size < 10 || p + 10 > b.length) return null;
  if ((b[p] & 1) !== 0) return null;                       // must be a key frame
  if (b[p + 3] !== 0x9d || b[p + 4] !== 0x01 || b[p + 5] !== 0x2a) return null;
  return { width: le16(b, p + 6) & 0x3fff, height: le16(b, p + 8) & 0x3fff };
}

function vp8lSize(b, p, size) {
  if (size < 5 || p + 5 > b.length || b[p] !== 0x2f) return null;
  const bits = le32(b, p + 1);
  if ((bits >>> 29) !== 0) return null;                    // version must be 0
  return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

function sniffWebp(b) {
  if (b.length < 20 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const riff = le32(b, 4);
  if (riff < 12 || riff % 2 !== 0 || 8 + riff > b.length) return null; // cut off, or malformed

  const end = 8 + riff;
  const first = ascii(b, 12, 4);
  const firstSize = le32(b, 16);
  if (20 + firstSize > end) return null;
  let dims = null;

  if (first === 'VP8 ') dims = vp8Size(b, 20, firstSize);
  else if (first === 'VP8L') dims = vp8lSize(b, 20, firstSize);
  else if (first === 'VP8X') {
    if (firstSize < 10) return null;
    if (b[20] & 0x02) return null;                         // animation flag: refused
    // Walk the chunks: there must be one still image and no animation frames.
    let p = 12, hasImage = false;
    while (p + 8 <= end) {
      const id = ascii(b, p, 4);
      const size = le32(b, p + 4);
      if (p + 8 + size > end) return null;
      if (id === 'ANIM' || id === 'ANMF') return null;
      if (id === 'VP8 ') { if (!vp8Size(b, p + 8, size)) return null; hasImage = true; }
      if (id === 'VP8L') { if (!vp8lSize(b, p + 8, size)) return null; hasImage = true; }
      p += 8 + size + (size & 1);
    }
    if (!hasImage) return null;
    dims = { width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
  }
  if (!dims || !dims.width || !dims.height) return null;
  return { type: 'image/webp', width: dims.width, height: dims.height };
}

/* ---------- public API ---------- */

/** { type, width, height } for a complete JPEG, PNG or WebP; null for anything else. */
export function sniffImage(input) {
  const b = toBytes(input);
  if (!b || b.length === 0) return null;
  const info = sniffJpeg(b) || sniffPng(b) || sniffWebp(b);
  if (!info || !IMAGE.mimeTypes.includes(info.type)) return null;
  return info;
}

/**
 * Applies the contract limits. Size is checked before any parsing.
 * ok:   { ok: true, info: { type, width, height, bytes } }
 * fail: { ok: false, status, error }   (413 too large, 415 wrong type, 422 pixel limits)
 */
export function checkImage(input) {
  const b = toBytes(input);
  if (!b || b.length === 0) return { ok: false, status: 415, error: IMAGE_MESSAGES.wrongType };
  if (b.length > IMAGE.maxBytes) return { ok: false, status: 413, error: IMAGE_MESSAGES.tooLarge };
  const info = sniffImage(b);
  if (!info) return { ok: false, status: 415, error: IMAGE_MESSAGES.wrongType };
  const longest = Math.max(info.width, info.height);
  const shortest = Math.min(info.width, info.height);
  if (longest > IMAGE.maxSideServer) return { ok: false, status: 422, error: IMAGE_MESSAGES.tooManyPixels };
  if (shortest < IMAGE.minSideServer) return { ok: false, status: 422, error: IMAGE_MESSAGES.tooSmall };
  return { ok: true, info: { ...info, bytes: b.length } };
}

/** 32 random lowercase hex characters, never reused in practice (128 bits). */
export function newImageId() {
  return randomBytes(16).toString('hex');
}
