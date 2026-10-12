// YAVD site admin edge function: taken-down pages (2026-10-12)
// A page taken down in /site-map is not deleted. Its visitors are sent to the
// home page (302, never cached) until it is restored. Everything else passes
// through untouched.
// Cost per page view: one cached lookup (refreshed at most once a minute per
// edge instance, the same reader the offer edge functions use). Storage
// unreadable and nothing cached: the page is served as normal.
import { getStore } from '@netlify/blobs';
import { createOfferSource, looksLikePage, NOINDEX } from '../edge-lib/offer-edge.js';
import { TAKEDOWN_STATUS, TAKEDOWN_TARGET, findTakedown, takedownStoreName } from '../../shared/site-admin.js';

// The offer reader reads key "all" as one JSON array, which is exactly the
// takedown store's layout, so it is reused rather than copied.
const source = createOfferSource({ open: (name) => getStore({ name, consistency: 'strong' }) });

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (!looksLikePage(url.pathname)) return;
  try {
    const src = await source.get(takedownStoreName(context?.deploy?.context ?? null));
    if (!src.ok || !findTakedown(src.offers, url.pathname)) return;
    return new Response(null, {
      status: TAKEDOWN_STATUS,
      headers: { location: TAKEDOWN_TARGET, 'cache-control': 'no-store', 'x-robots-tag': NOINDEX, 'x-yavd-takedown': '1' }
    });
  } catch (err) {
    console.error('page-takedown: failed', err?.message);
    return;                                             // pass through
  }
};

export const config = {
  path: '/*',
  excludedPath: ['/api/*', '/assets/*', '/shared/*', '/.netlify/*', '/library/pdf/*', '/offer/*',
                 '/offer-admin*', '/offers-form*', '/admin*', '/site-map*'],
  onError: 'bypass'
};
