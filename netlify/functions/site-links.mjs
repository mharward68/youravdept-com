// YAVD site admin: /api/offers/site/links?page=/x.html   GET, signed in only
// What would break if a page came down: links from other pages, mentions in
// page code, _redirects rules pointing at it, and offers attached to it.
//   200 { page, address, linkedFrom, mentionedIn, redirects, offers, blocked, protected }
//   400 unknown page
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizePagePath } from '../../shared/offer-contract.js';
import { isProtected } from '../../shared/site-admin.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { loadOffers, offersStore } from './lib/offers-store.mjs';
import { blockingOffers, linkReport, readSiteFiles, siteRoot } from './lib/site-admin.mjs';

let cachedFiles = null;
let cachedRedirects = '';

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET'] });
  if (refused) return refused;
  try {
    const root = siteRoot();
    if (!root) return json({ error: 'The page list is not available on this deploy.' }, 503);
    if (!cachedFiles) {
      cachedFiles = await readSiteFiles(root);
      try { cachedRedirects = await readFile(join(root, '_redirects'), 'utf8'); } catch { cachedRedirects = ''; }
    }
    const asked = new URL(req.url).searchParams.get('page') || '';
    const page = normalizePagePath(asked);
    if (!asked || !cachedFiles.some((f) => f.page === page)) return json({ error: 'That page is not on this deploy.' }, 400);

    let offers = [];
    let offersReadable = true;
    try { offers = (await loadOffers(offersStore(context?.deploy?.context))).offers; } catch (err) {
      console.error('site-links: offers unreadable', err?.message);
      offersReadable = false;
    }
    const report = linkReport(cachedFiles, page, { redirectsText: cachedRedirects, offers });
    return json({ ...report, offersReadable, protected: isProtected(page), blocked: blockingOffers(report).length > 0 });
  } catch (err) {
    console.error('site-links: unexpected error', err?.stack || err);
    return json({ error: 'Could not check the links.' }, 500);
  }
};

export const config = { path: '/api/offers/site/links' };
