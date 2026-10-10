// YAVD Offers Module edge function: /offer/<slug> (Session 1.5)
// Inside its dates: the offer's page with that offer attached.
// Outside its dates: 302 to the page, before anything loads (no flash).
// Unknown slug: 302 to /. ?preview=<key>: any status, marked as a test.
// Storage unreadable and nothing cached: 302 to /. Never an error page.
import { getStore } from '@netlify/blobs';
import { PREVIEW_PARAM, UNKNOWN_SLUG_TARGET } from '../../shared/offer-contract.js';
import {
  INNER_HEADER, carriedQuery, createOfferSource, decideLink, injectOffer,
  offersStoreNameFor, pageHeaders, parseSlug, redirectResponse, wantsForcedFailure
} from '../edge-lib/offer-edge.js';

const source = createOfferSource({ open: (name) => getStore({ name, consistency: 'strong' }) });

export default async (req, context) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  const deployContext = context?.deploy?.context ?? null;
  const query = carriedQuery(url.searchParams);
  try {
    const slug = parseSlug(url.pathname);
    const previewKey = url.searchParams.get(PREVIEW_PARAM) || '';
    const src = await source.get(offersStoreNameFor(deployContext), { forceFail: wantsForcedFailure(req, deployContext) });
    if (!src.ok) return redirectResponse(UNKNOWN_SLUG_TARGET + query, 'store-failed');

    const d = decideLink(src.offers, { slug, previewKey });
    if (d.action === 'redirect') return redirectResponse(d.to + query, d.state);

    // Fetch the page as a normal visitor would (pretty URLs and headers
    // included). INNER_HEADER tells offer-page not to add an Everyone offer.
    const res = await fetch(new URL(d.page, url.origin), {
      headers: { [INNER_HEADER]: '1', accept: 'text/html' }, redirect: 'follow'
    });
    const type = res.headers.get('content-type') || '';
    if (res.status !== 200 || !type.includes('text/html')) {
      console.error('offer-link: page fetch gave', res.status, type, d.page);
      return redirectResponse(d.page + query, 'page-unavailable');
    }
    const html = injectOffer(await res.text(), d.offer, d.isTest);
    const headers = pageHeaders(res.headers, { state: d.state, noindex: true, noStore: true });
    if (deployContext !== 'production') headers.set('x-yavd-offer-ctx', String(deployContext));
    return new Response(req.method === 'HEAD' ? null : html, { status: 200, headers });
  } catch (err) {
    console.error('offer-link: failed', err?.message);
    return redirectResponse(UNKNOWN_SLUG_TARGET + query, 'error');
  }
};

export const config = {
  path: '/offer/*',
  onError: 'bypass'
};
