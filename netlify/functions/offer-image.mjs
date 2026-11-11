// YAVD Offers Module: GET /api/offers/image/:id   (Session 3.4, contract 1.3.0)
//
// Public: the popup loads offer pictures from here with no cookie.
//   200  the picture, under the type stored with it (never guessed from the
//        bytes again, never from the request), with:
//          X-Content-Type-Options: nosniff
//          X-Robots-Tag: noindex
//          Cache-Control: public, max-age=31536000, immutable   (ids are never reused)
//          Content-Disposition: inline
//          Content-Security-Policy: default-src 'none'; sandbox   (nothing can run from it)
//   404  bad id shape, unknown id, unusable record or storage failure, with
//        no-store. Never a 500, so a broken picture simply collapses the popup's
//        image slot instead of breaking the offer.
//
// Test-only: on non-production deploys the request header
// x-yavd-test-store-fail: 1 forces the storage failure (same switch as the edge).

import { imagesStore, getImage, isImageId } from './lib/offer-images-store.mjs';
import { wantsForcedFailure } from '../edge-lib/offer-edge.js';

const PREFIX = '/api/offers/image/';

const MISSING_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex',
  'x-content-type-options': 'nosniff',
  'content-type': 'text/plain; charset=utf-8'
});

function missing(method) {
  return new Response(method === 'HEAD' ? null : 'Not found', { status: 404, headers: MISSING_HEADERS });
}

/** The id from the route parameter, or from the path when the platform gives none. */
function idFrom(req, context) {
  const p = context?.params?.id;
  if (typeof p === 'string') return p;
  try {
    const path = new URL(req.url).pathname;
    return path.startsWith(PREFIX) ? path.slice(PREFIX.length) : '';
  } catch { return ''; }
}

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405, headers: { ...MISSING_HEADERS, allow: 'GET, HEAD' }
    });
  }

  const id = idFrom(req, context);
  if (!isImageId(id)) return missing(req.method);

  const deployContext = context?.deploy?.context ?? null;
  let found;
  try {
    if (wantsForcedFailure(req, deployContext)) throw new Error('forced test failure');
    found = await getImage(imagesStore(deployContext), id);
  } catch (err) {
    console.error('offer-image: read failed', err?.message);
    return missing(req.method);
  }
  if (!found) return missing(req.method);

  return new Response(req.method === 'HEAD' ? null : found.bytes, {
    status: 200,
    headers: {
      'content-type': found.meta.type,
      'content-length': String(found.meta.bytes),
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-disposition': 'inline',
      'content-security-policy': "default-src 'none'; sandbox"
    }
  });
};

export const config = { path: '/api/offers/image/:id', method: ['GET', 'HEAD'] };
