// YAVD site admin: /api/offers/site/takedown   POST, signed in only
//   {page, action:"down", confirm}  take a page down. confirm must equal the
//                                   page's address without slashes (e.g. "booth-proof").
//   {page, action:"restore"}        put it back.
// A taken-down page is not deleted: the page-takedown edge function sends its
// visitors to the home page (302) until it is restored. Changes reach every
// edge server within about a minute (the edge caches the list 60 seconds).
//   200 { ok, page, action } | 400 bad request | 404 not on this deploy
//   409 protected page, scheduled offer on it, or already in that state | 503 storage
import { normalizePagePath } from '../../shared/offer-contract.js';
import { confirmWord, isProtected, prettyAddress } from '../../shared/site-admin.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { readJson } from './lib/offers-rules.mjs';
import { loadOffers, offersStore } from './lib/offers-store.mjs';
import {
  TakedownError, blockingOffers, changeTakedowns, linkReport, pagesFrom, readSiteFiles, siteRoot, takedownStore
} from './lib/site-admin.mjs';

let cachedFiles = null;

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['POST'] });
  if (refused) return refused;

  const read = await readJson(req);
  if (read.error) return json({ error: read.error }, read.status);
  const { page: asked, action, confirm } = read.body || {};
  if (typeof asked !== 'string' || !asked) return json({ error: 'Say which page: {"page": "/x.html"}' }, 400);
  if (action !== 'down' && action !== 'restore') return json({ error: 'action must be "down" or "restore".' }, 400);
  const page = normalizePagePath(asked);

  try {
    if (action === 'down') {
      if (isProtected(page)) return json({ error: 'This page cannot be taken down.' }, 409);
      if (confirm !== confirmWord(page)) return json({ error: `Type ${confirmWord(page)} to confirm.` }, 400);
      if (!cachedFiles) {
        const root = siteRoot();
        if (!root) return json({ error: 'The page list is not available on this deploy.' }, 503);
        cachedFiles = await readSiteFiles(root);
      }
      const known = pagesFrom(cachedFiles).find((p) => p.page === page);
      if (!known) return json({ error: 'That page is not on this deploy.' }, 404);

      // Never strand a scheduled offer on a page that is gone. Fail closed.
      let offers;
      try { offers = (await loadOffers(offersStore(context?.deploy?.context))).offers; } catch {
        return json({ error: 'Could not check the offers on this page, so nothing was changed. Try again in a minute.' }, 503);
      }
      const blocking = blockingOffers(linkReport([], page, { offers }));
      if (blocking.length) {
        const names = blocking.map((o) => `"${o.name}"`).join(', ');
        return json({ error: `${names} ${blocking.length === 1 ? 'is' : 'are'} scheduled on this page. Save ${blocking.length === 1 ? 'it' : 'them'} as a draft in Offers first.` }, 409);
      }

      const outcome = await changeTakedowns(takedownStore(context?.deploy?.context), (list) => {
        if (list.some((t) => normalizePagePath(t.page) === page)) return { stop: { status: 409, error: 'That page is already taken down.' } };
        list.push({ page, address: prettyAddress(page), title: known.title, at: new Date().toISOString() });
        return { list, result: true };
      });
      if (!outcome.saved) return json({ error: outcome.stop.error }, outcome.stop.status);
      return json({ ok: true, page, action });
    }

    const outcome = await changeTakedowns(takedownStore(context?.deploy?.context), (list) => {
      const next = list.filter((t) => normalizePagePath(t.page) !== page);
      if (next.length === list.length) return { stop: { status: 409, error: 'That page is not taken down.' } };
      return { list: next, result: true };
    });
    if (!outcome.saved) return json({ error: outcome.stop.error }, outcome.stop.status);
    return json({ ok: true, page, action });
  } catch (err) {
    if (err instanceof TakedownError) return json({ error: err.message }, err.status);
    console.error('site-takedown: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was changed.' }, 500);
  }
};

export const config = { path: '/api/offers/site/takedown' };
