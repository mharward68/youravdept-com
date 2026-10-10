// YAVD Offers Module: edge logic (Session 1.5)
//
// Pure decisions for the two edge functions, kept apart from Netlify so they
// can be tested with plain `node --test`. No imports beyond the frozen
// contract. Nothing here touches storage directly: the edge functions pass a
// `source` made by createOfferSource(), which wraps Netlify Blobs.
//
// Rules applied (shared/offer-contract.js RULES):
//   - /offer/<slug> inside its dates: serve the offer's page with that offer.
//   - Outside its dates (or a draft): 302 to the offer's page.
//   - Unknown slug: 302 to /.
//   - ?preview=<key>: show that offer in any status, marked as a test.
//   - Normal page: attach the running Everyone offer for that page, if any.
//   - A link offer beats an Everyone offer: the link function fetches the
//     page with INNER_HEADER set, and the page function skips such requests.
//   - Storage unreadable: the normal page, never an error.

import {
  CACHE_SECONDS, INJECT, OFFER_LINK_PREFIX, OUT_OF_DATES_STATUS, PREVIEW_KEY_LENGTH,
  PREVIEW_PARAM, STORES, UNKNOWN_SLUG_TARGET, KEYS,
  isValidSlug, normalizePagePath, offerStatus, payloadToScriptJson, publicPayload, storeName
} from '../../shared/offer-contract.js';

/** Request header the link function sets when it fetches the page itself. */
export const INNER_HEADER = 'x-yavd-offer-inner';
/** Response header naming what the edge function decided (diagnostics only, no data). */
export const STATE_HEADER = 'x-yavd-offer';
/** Test-only request header: pretend storage failed. Ignored on production. */
export const FORCE_FAIL_HEADER = 'x-yavd-test-store-fail';
export const NOINDEX = 'noindex, nofollow';
export const READ_TIMEOUT_MS = 1500;

/* ---------- requests ---------- */

/** "/offer/Group-2026/" -> "group-2026"; anything else (deeper paths, bad shape) -> null */
export function parseSlug(pathname) {
  let p = String(pathname || '');
  if (!p.toLowerCase().startsWith(OFFER_LINK_PREFIX)) return null;
  p = p.slice(OFFER_LINK_PREFIX.length);
  if (p.endsWith('/')) p = p.slice(0, -1);
  try { p = decodeURIComponent(p); } catch { return null; }
  p = p.toLowerCase();
  return isValidSlug(p) ? p : null;
}

/** Only real site pages: no extension, or .html. Assets, APIs and module paths never. */
const SKIP_PREFIXES = ['/api/', '/offer/', '/offer-admin', '/offers-form', '/.netlify/', '/assets/', '/shared/', '/ai/', '/netlify/'];
export function looksLikePage(pathname) {
  const p = String(pathname || '/').toLowerCase();
  if (SKIP_PREFIXES.some((s) => p.startsWith(s))) return false;
  const last = p.split('/').pop();
  return !last.includes('.') || last.endsWith('.html');
}

/** Same-site path only ("/x.html"). Never "//host", a backslash or a full URL. */
export function safePagePath(page) {
  const p = String(page || '');
  if (!p.startsWith('/') || p.startsWith('//') || p.includes('\\') || /[\s<>"']/.test(p)) return null;
  return p;
}

/** Deploy contexts where test-only switches are honoured. Never production. */
const TEST_CONTEXTS = new Set(['branch-deploy', 'deploy-preview', 'dev']);
export function isTestContext(deployContext) { return TEST_CONTEXTS.has(deployContext); }

export function wantsForcedFailure(req, deployContext) {
  return isTestContext(deployContext) && req.headers.get(FORCE_FAIL_HEADER) === '1';
}

export function offersStoreNameFor(deployContext) { return storeName(STORES.offers, deployContext); }

/* ---------- decisions ---------- */

function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== PREVIEW_KEY_LENGTH || b.length !== PREVIEW_KEY_LENGTH) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The query string to carry onto a redirect: everything except the preview key. */
export function carriedQuery(searchParams) {
  const q = new URLSearchParams(searchParams);
  q.delete(PREVIEW_PARAM);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/**
 * What /offer/<slug> should do.
 * Returns { action: 'serve', offer, isTest, state }
 *      or { action: 'redirect', to, state }
 * Preview links: an offer with its own slug needs that slug in the address;
 * an Everyone offer (no slug) previews at any /offer/<word>?preview=<key>.
 */
export function decideLink(offers, { slug, previewKey, now = new Date() }) {
  const list = Array.isArray(offers) ? offers : [];
  if (previewKey) {
    const hit = list.find((o) => o && keyMatches(o.previewKey, previewKey));
    if (hit && (!hit.slug || hit.slug === slug)) {
      const page = safePagePath(hit.page);
      if (page) return { action: 'serve', offer: hit, page, isTest: true, state: 'preview' };
    }
    // A wrong key is treated as an ordinary visit: it reveals nothing.
  }
  if (!slug) return { action: 'redirect', to: UNKNOWN_SLUG_TARGET, state: 'unknown-slug' };

  const mine = list.filter((o) => o && o.audience === 'link' && o.slug === slug);
  if (!mine.length) return { action: 'redirect', to: UNKNOWN_SLUG_TARGET, state: 'unknown-slug' };

  const running = mine.find((o) => offerStatus(o, now) === 'running');
  if (running) {
    const page = safePagePath(running.page);
    if (page) return { action: 'serve', offer: running, page, isTest: false, state: 'link-running' };
  }
  // Out of dates (or only drafts): forward to the page of the most recently
  // edited offer on this slug. Status is worked out, so the reason is logged.
  const latest = [...mine].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  const status = offerStatus(latest, now);
  return {
    action: 'redirect',
    to: safePagePath(latest.page) || UNKNOWN_SLUG_TARGET,
    state: `link-${status}`
  };
}

/** The running Everyone offer for this page, or null. */
export function decidePage(offers, pathname, now = new Date()) {
  const list = Array.isArray(offers) ? offers : [];
  const page = normalizePagePath(pathname);
  const hits = list.filter((o) => o && o.audience === 'everyone'
    && typeof o.page === 'string' && normalizePagePath(o.page) === page
    && offerStatus(o, now) === 'running');
  if (!hits.length) return null;
  // The save rules allow only one; if storage ever holds two, the newest start wins.
  return hits.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
}

/* ---------- the page ---------- */

/** The block added before </body>. Offer text only ever travels as escaped JSON. */
export function offerSnippet(offer, isTest) {
  const json = payloadToScriptJson(publicPayload(offer, isTest));
  return `<link rel="stylesheet" href="${INJECT.css}">`
    + `<script type="application/json" id="${INJECT.dataElementId}">${json}</script>`
    + `<script src="${INJECT.js}" defer></script>`;
}

/** Adds the offer to a page. Never twice. No </body>: added at the end. */
export function injectOffer(html, offer, isTest) {
  const text = String(html);
  if (text.includes(`id="${INJECT.dataElementId}"`)) return text;
  const snippet = offerSnippet(offer, isTest);
  const at = text.toLowerCase().lastIndexOf('</body>');
  return at === -1 ? text + snippet : text.slice(0, at) + snippet + text.slice(at);
}

/** Headers for a page we changed: no stale length or validators, never cached as shared. */
export function pageHeaders(upstream, { state, noindex, noStore }) {
  const h = new Headers();
  h.set('content-type', upstream.get('content-type') || 'text/html; charset=UTF-8');
  h.set('cache-control', noStore ? 'private, no-store' : 'private, max-age=0, must-revalidate');
  h.set(STATE_HEADER, state);
  if (noindex) h.set('x-robots-tag', NOINDEX);
  for (const k of ['content-security-policy', 'x-frame-options', 'strict-transport-security', 'referrer-policy', 'permissions-policy']) {
    const v = upstream.get(k);
    if (v) h.set(k, v);
  }
  return h;
}

export function redirectResponse(to, state) {
  return new Response(null, {
    status: OUT_OF_DATES_STATUS,
    headers: { location: to, 'cache-control': 'no-store', 'x-robots-tag': NOINDEX, [STATE_HEADER]: state }
  });
}

/* ---------- storage, cached ---------- */

/**
 * Reads the offer list through `open(storeName)` (a Netlify Blobs store),
 * cached in this edge instance for CACHE_SECONDS. A failed or slow read
 * falls back to the last good copy; with none, { ok: false }.
 * Returns { ok, offers, from: 'cache' | 'store' | 'stale' | 'failed' }.
 */
export function createOfferSource({ open, ttlMs = CACHE_SECONDS * 1000, timeoutMs = READ_TIMEOUT_MS, clock = () => Date.now() }) {
  const cache = new Map();     // name -> { offers, at }
  const inflight = new Map();  // name -> Promise

  async function read(name) {
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('read timed out')), timeoutMs); });
    try {
      const store = open(name);
      // Strong read: at most one per edge instance per minute (the cache), so
      // a save is never hidden behind an older copy held at the edge.
      const data = await Promise.race([store.get(KEYS.all, { type: 'json', consistency: 'strong' }), timeout]);
      if (data === null || data === undefined) return [];
      if (!Array.isArray(data)) throw new Error('stored offers are not a list');
      return data;
    } finally { clearTimeout(timer); }
  }

  return {
    async get(name, { forceFail = false } = {}) {
      if (forceFail) return { ok: false, offers: [], from: 'failed' };
      const hit = cache.get(name);
      if (hit && clock() - hit.at < ttlMs) return { ok: true, offers: hit.offers, from: 'cache' };
      let p = inflight.get(name);
      if (!p) {
        p = read(name).finally(() => inflight.delete(name));
        inflight.set(name, p);
      }
      try {
        const offers = await p;
        cache.set(name, { offers, at: clock() });
        return { ok: true, offers, from: 'store' };
      } catch (err) {
        console.error('offer-edge: offer read failed', err?.message);
        if (hit) return { ok: true, offers: hit.offers, from: 'stale' };
        return { ok: false, offers: [], from: 'failed' };
      }
    },
    _clear() { cache.clear(); }
  };
}
