// YAVD Offers Module: POST /api/offers/image   (Session 3.4, contract 1.3.0)
//
// Signed in only. The body is the raw picture bytes; content-type must be
// image/jpeg, image/png or image/webp (anything else is refused, and a
// non-simple content-type also makes a browser send a preflight first).
//
//   201 { id, width, height, type, bytes }   stored
//   401 / 403 / 405                          requireAdmin (sign-in, cross-site, method)
//   413                                      over IMAGE.maxBytes (declared or real)
//   415                                      wrong content-type, or bytes that are not a JPG/PNG/WebP
//   422                                      pixel limits
//   503                                      storage trouble (JSON error, nothing stored)
//
// The type and size come only from the bytes (checkImage), never from the
// header or the browser. Every response is JSON with no-store and noindex.
//
// Test-only: on non-production deploys the request header
// x-yavd-test-store-fail: 1 forces the storage failure (same switch as the edge).

import { requireAdmin, json } from './lib/offers-auth.mjs';
import { checkImage, IMAGE_MESSAGES } from './lib/offer-image.mjs';
import { imagesStore, putImage, ImageStoreError } from './lib/offer-images-store.mjs';
import { wantsForcedFailure } from '../edge-lib/offer-edge.js';
import { IMAGE } from '../../shared/offer-contract.js';

const UPLOAD_FAILED = 'The picture did not upload. Try again in a minute.';

/** "image/PNG; charset=x" -> "image/png" */
function mediaType(req) {
  return (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

/**
 * Reads the body, stopping as soon as it passes `max` bytes.
 * Returns a Uint8Array, or null when the body is too large.
 */
async function readCapped(req, max) {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.byteLength; }
  return out;
}

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['POST'] });
  if (refused) return refused;

  if (!IMAGE.mimeTypes.includes(mediaType(req))) {
    return json({ error: IMAGE_MESSAGES.wrongType }, 415);
  }

  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > IMAGE.maxBytes) {
    return json({ error: IMAGE_MESSAGES.tooLarge }, 413);
  }

  let bytes;
  try {
    bytes = await readCapped(req, IMAGE.maxBytes);
  } catch (err) {
    console.error('offer-image-upload: body read failed', err?.message);
    return json({ error: UPLOAD_FAILED }, 400);
  }
  if (bytes === null) return json({ error: IMAGE_MESSAGES.tooLarge }, 413);

  const check = checkImage(bytes);
  if (!check.ok) return json({ error: check.error }, check.status);

  const deployContext = context?.deploy?.context ?? null;
  try {
    if (wantsForcedFailure(req, deployContext)) throw new ImageStoreError(UPLOAD_FAILED);
    const saved = await putImage(imagesStore(deployContext), bytes, check.info);
    return json({ id: saved.id, width: saved.width, height: saved.height, type: saved.type, bytes: saved.bytes }, 201);
  } catch (err) {
    if (err instanceof ImageStoreError) return json({ error: err.message }, err.status);
    console.error('offer-image-upload: unexpected failure', err?.message);
    return json({ error: UPLOAD_FAILED }, 503);
  }
};

export const config = { path: '/api/offers/image', method: ['POST'] };
