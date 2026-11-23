// YAVD Offers Module: GET /offers/landing-<slug>.html   (Session 4.9, contract 1.4.0)
//
// Public. Serves one landing page from the landing store through the fixed
// template in shared/landing-template.js (also answers without ".html", in
// any letter case and with a trailing slash: landingSlugFromPath).
//
// What each state gives (landingState, worked out from the landing and its
// linked offers, never stored):
//   running                 the page
//   expired, archived       the page, no button, with the expiration data (popup: 4.10)
//   before                  302 to "/" (no-store)
//   draft                   302 to "/", or the page with ?preview=<its key> (no-store, no analytics)
//   unknown slug            302 to "/"
//   anything else under /offers/   404 (no-store, noindex)
// A valid preview key also shows a live page that is still "before" its offer.
//
// Stability: the landing store unreadable with nothing cached sends visitors to
// "/" quietly (never an error page). The offers store unreadable shows the page
// from the landing alone (a live page reads as running, so no expiration popup).
// Reads are strong and cached 60 s per instance, as the edge functions do.
//
// Diagnostics: response header x-yavd-landing = running, expired, archived,
// before, draft, preview, unknown, store-failed or error. On test deploys only,
// x-yavd-landing-src = <landings from>/<offers from>; ctx=<deploy context>.
// Test-only: on non-production deploys the request header
// x-yavd-test-store-fail: 1 forces the landing storage failure (same switch as the edge).

import { PREVIEW_KEY_LENGTH, PREVIEW_PARAM, UNKNOWN_SLUG_TARGET, landingSlugFromPath, landingState } from '../../shared/offer-contract.js';
import { renderLanding } from '../../shared/landing-template.js';
import { NOINDEX, createOfferSource, isTestContext, wantsForcedFailure } from '../edge-lib/offer-edge.js';
import { landingsStore } from './lib/landings-store.mjs';
import { offersStore } from './lib/offers-store.mjs';

export const LANDING_STATE_HEADER = 'x-yavd-landing';

// One cached reader per store. The cache key is the deploy context, and open()
// turns it into the right store ("-test" off production, storeName rule).
const landingSource = createOfferSource({ open: (ctx) => landingsStore(ctx) });
const offerSource = createOfferSource({ open: (ctx) => offersStore(ctx) });

/** Tests only: forget the cached lists. */
export function _clearCacheForTests() { landingSource._clear(); offerSource._clear(); }

/** Constant-time comparison of two preview keys of the contract length. */
export function previewKeyMatches(stored, given) {
  if (typeof stored !== 'string' || typeof given !== 'string') return false;
  if (stored.length !== PREVIEW_KEY_LENGTH || given.length !== PREVIEW_KEY_LENGTH) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) diff |= stored.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function redirect(state, extra = {}) {
  return new Response(null, {
    status: 302,
    headers: { location: UNKNOWN_SLUG_TARGET, 'cache-control': 'no-store', 'x-robots-tag': NOINDEX, [LANDING_STATE_HEADER]: state, ...extra }
  });
}

function notFound(method) {
  return new Response(method === 'HEAD' ? null : 'Not found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': NOINDEX,
      'x-content-type-options': 'nosniff', [LANDING_STATE_HEADER]: 'unknown'
    }
  });
}

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': NOINDEX, allow: 'GET, HEAD' }
    });
  }
  const deployContext = context?.deploy?.context ?? null;
  const test = isTestContext(deployContext);
  let url;
  try { url = new URL(req.url); } catch { return notFound(req.method); }

  // Raw pathname, never decoded (BUILD_NOTES: landingSlugFromPath).
  const slug = landingSlugFromPath(url.pathname);
  if (!slug) return notFound(req.method);

  try {
    const lands = await landingSource.get(deployContext, { forceFail: wantsForcedFailure(req, deployContext) });
    const src = (offersFrom) => (test ? { 'x-yavd-landing-src': `${lands.from}/${offersFrom}; ctx=${deployContext}` } : {});
    if (!lands.ok) return redirect('store-failed', src('-'));

    const landing = lands.offers.find((l) => l && typeof l === 'object' && l.slug === slug);
    if (!landing) return redirect('unknown', src('-'));

    const offs = await offerSource.get(deployContext);
    const offers = offs.ok ? offs.offers : [];
    const state = landingState(landing, offers, new Date());
    const extra = src(offs.from);

    const key = url.searchParams.get(PREVIEW_PARAM);
    const preview = (state === 'draft' || state === 'before') && previewKeyMatches(landing.previewKey, key);

    if (!preview && (state === 'draft' || state === 'before')) return redirect(state, extra);

    const { html, headers } = renderLanding(landing, {
      state: preview ? (state === 'draft' ? 'draft' : 'running') : state,
      isPreview: preview,
      origin: test ? url.origin : undefined
    });
    return new Response(req.method === 'HEAD' ? null : html, {
      status: 200,
      headers: { ...headers, [LANDING_STATE_HEADER]: preview ? 'preview' : state, ...extra }
    });
  } catch (err) {
    console.error('offer-landing: failed', err?.message);
    return redirect('error');
  }
};

export const config = { path: '/offers/*', method: ['GET', 'HEAD'] };
