// YAVD Offers Module edge function: normal pages (Session 1.5)
// Adds the running Everyone offer for this page, if there is one.
// No offer, or storage unreadable: the page passes through untouched.
// Cost when there is no offer: one cached lookup (refreshed at most once a
// minute per edge instance), and the page is never read or rewritten.
import { getStore } from '@netlify/blobs';
import {
  INNER_HEADER, STATE_HEADER, createOfferSource, decidePage, injectOffer, isTestContext,
  looksLikePage, offersStoreNameFor, pageHeaders, wantsForcedFailure
} from '../edge-lib/offer-edge.js';

const source = createOfferSource({ open: (name) => getStore({ name, consistency: 'strong' }) });

export default async (req, context) => {
  if (req.method !== 'GET') return;
  if (req.headers.get(INNER_HEADER)) return;          // offer-link is fetching: a link offer wins
  const url = new URL(req.url);
  if (!looksLikePage(url.pathname)) return;
  const deployContext = context?.deploy?.context ?? null;
  try {
    const src = await source.get(offersStoreNameFor(deployContext), { forceFail: wantsForcedFailure(req, deployContext) });
    if (!src.ok) {
      // Untouched body; only a diagnostic header is added.
      const res = await context.next();
      const out = new Response(res.body, res);
      out.headers.set(STATE_HEADER, 'store-failed');
      return out;
    }
    const offer = decidePage(src.offers, url.pathname);
    if (!offer) {
      if (!isTestContext(deployContext)) return;        // live: the normal page, untouched
      // Test deploys only: same body, plus what the edge saw (no offer data).
      const res = await context.next();
      const out = new Response(res.body, res);
      out.headers.set(STATE_HEADER, 'page-none');
      out.headers.set('x-yavd-offer-src', `${src.from}; offers=${src.offers.length}; ctx=${deployContext}`);
      return out;
    }

    const res = await context.next();
    const type = res.headers.get('content-type') || '';
    if (res.status !== 200 || !type.includes('text/html')) return res;
    const html = injectOffer(await res.text(), offer, false);
    const headers = pageHeaders(res.headers, { state: 'page-everyone', noindex: false, noStore: false });
    if (isTestContext(deployContext)) headers.set('x-yavd-offer-src', `${src.from}; offers=${src.offers.length}; ctx=${deployContext}`);
    return new Response(html, { status: 200, headers });
  } catch (err) {
    console.error('offer-page: failed', err?.message);
    return;                                             // pass through
  }
};

export const config = {
  path: '/*',
  excludedPath: ['/offer/*', '/api/*', '/assets/*', '/.netlify/*', '/library/pdf/*', '/offer-admin*', '/offers-form*'],
  onError: 'bypass'
};
