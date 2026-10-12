/**
 * YAVD site admin: shared rules (2026-10-12)
 *
 * The admin panel (/admin), the site map (/site-map) and page takedowns.
 * Pure ES module, no secrets. Loaded by Netlify Functions (Node), the
 * page-takedown edge function (Deno) and the browser. deploy.ps1 publishes
 * it as a static asset, which is intended: nothing in it is private.
 *
 * Sign-in is the Offers Module's: same password, same cookie. The cookie is
 * scoped to /api/offers, so every site admin route lives under
 * /api/offers/site/ to receive it.
 */
import { normalizePagePath, storeName } from './offer-contract.js';

export const SITE_ROUTES = Object.freeze({
  panel:    '/admin',                         // static page: sign-in, then the two buttons
  siteMap:  '/site-map',                      // static page: no page data without sign-in
  session:  '/api/offers/session',            // GET  200 signed in | 401
  pages:    '/api/offers/site/pages',         // GET  every page, with takedown state
  links:    '/api/offers/site/links',         // GET  ?page=/x.html  what points at a page
  takedown: '/api/offers/site/takedown'       // POST {page, action:'down'|'restore', confirm}
});

/** Blobs store holding taken-down pages: key "all", one JSON array. */
export const TAKEDOWN_STORE = 'site-takedowns';
export const TAKEDOWN_KEY = 'all';
export function takedownStoreName(deployContext) { return storeName(TAKEDOWN_STORE, deployContext); }

/** Where a visitor to a taken-down page is sent. */
export const TAKEDOWN_TARGET = '/';
export const TAKEDOWN_STATUS = 302;

/** Pages that can never be taken down (the site, or the way back in, would break). */
export const PROTECTED_PAGES = Object.freeze([
  '/index.html', '/admin.html', '/site-map.html', '/offer-admin.html', '/offers-form.html'
]);

/** Files that are not pages a person would visit, so the site map leaves them out. */
export const NOT_IN_SITE_MAP = Object.freeze([
  '/admin.html', '/site-map.html', '/offer-admin.html', '/offers-form.html',
  '/onyva-landing.html'   // redirect stub, 301 to /onyva-welcome in _redirects
]);

/** Folders scanned for pages. Keep in step with included_files in netlify.toml. */
export const PAGE_FOLDERS = Object.freeze(['', 'library', 'field-notes', 'just-the-audio']);

export function isProtected(page) { return PROTECTED_PAGES.includes(normalizePagePath(page)); }

/** "/booth-proof.html" -> "/booth-proof"; "/library/index.html" -> "/library/" */
export function prettyAddress(page) {
  const p = normalizePagePath(page);
  if (p === '/index.html') return '/';
  if (p.endsWith('/index.html')) return p.slice(0, -'index.html'.length);
  return p.slice(0, -'.html'.length);
}

/** The text a person types to confirm a takedown: the address without slashes. */
export function confirmWord(page) {
  const a = prettyAddress(page).replace(/^\/+|\/+$/g, '');
  return a || 'home';
}

const LABELS = Object.freeze({
  '/index.html': 'Home',
  '/our-story.html': 'Our Story',
  '/venue-docs-offer.html': 'Venue Docs Offer',
  '/onyva-welcome.html': 'Onyva: For Travelers',
  '/onyva-download.html': 'Onyva: A Digital Gift'
});

function decode(s) {
  return String(s)
    .replace(/&mdash;|&#8212;|—/g, ':').replace(/&ndash;|&#8211;|–/g, '-')
    .replace(/&amp;/g, '&').replace(/&#39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+:/g, ':').replace(/\s+/g, ' ').trim();
}

/** A short, readable name for a page from its <title>. */
export function pageLabel(page, rawTitle) {
  const p = normalizePagePath(page);
  if (LABELS[p]) return LABELS[p];
  const first = decode(rawTitle || '').split(' | ')[0].trim();
  if (first && first !== 'Your AV Department') return first;
  return prettyAddress(p);
}

/** Which section of the site map a page sits in. */
export function pageGroup(page) {
  const p = normalizePagePath(page);
  if (p.startsWith('/booth-proof')) return 'Booth Proof';
  if (p.startsWith('/library/') || p.startsWith('/field-notes/')) return 'Library and Field Notes';
  if (p.startsWith('/just-the-audio') || p.startsWith('/playlists-')) return 'Tools and Playlists';
  if (p === '/michaelh.html' || p === '/trishah.html') return 'Digital Cards';
  if (p.startsWith('/onyva')) return 'Onyva';
  return 'Main pages';
}
export const GROUP_ORDER = Object.freeze([
  'Main pages', 'Booth Proof', 'Library and Field Notes', 'Tools and Playlists', 'Digital Cards', 'Onyva'
]);

/** The takedown record for this request path, or null. Protected pages never match. */
export function findTakedown(list, pathname) {
  if (!Array.isArray(list) || !list.length) return null;
  // "/booth-proof/" can serve /booth-proof.html too, so both readings are checked.
  const raw = String(pathname || '/').split('?')[0].split('#')[0];
  const candidates = new Set([normalizePagePath(raw)]);
  if (raw.length > 1 && raw.endsWith('/')) candidates.add(normalizePagePath(raw.replace(/\/+$/, '')));
  for (const p of candidates) {
    if (PROTECTED_PAGES.includes(p)) return null;
    const hit = list.find((t) => t && typeof t.page === 'string' && normalizePagePath(t.page) === p);
    if (hit) return hit;
  }
  return null;
}
