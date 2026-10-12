// YAVD site admin: /api/offers/site/pages   GET, signed in only
// Every deployed page for the site map, plus the pages taken down.
//   200 { pages: [{ page, address, title, group, takenDown, takenDownAt }], takedowns: [...] }
// The page list comes from the .html files bundled by netlify.toml
// (included_files), so it always matches what is deployed.
// If takedown storage cannot be read the pages still list, flagged.
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { loadTakedowns, pagesFrom, readSiteFiles, siteRoot, takedownStore } from './lib/site-admin.mjs';
import { normalizePagePath } from '../../shared/offer-contract.js';

let cachedPages = null;

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET'] });
  if (refused) return refused;
  try {
    if (!cachedPages) {
      const root = siteRoot();
      if (!root) return json({ error: 'The page list is not available on this deploy.' }, 503);
      cachedPages = pagesFrom(await readSiteFiles(root));
    }
    let takedowns = [];
    let takedownsReadable = true;
    try {
      takedowns = (await loadTakedowns(takedownStore(context?.deploy?.context))).list;
    } catch (err) {
      console.error('site-pages: takedowns unreadable', err?.message);
      takedownsReadable = false;
    }
    const byPage = new Map(takedowns.map((t) => [normalizePagePath(t.page), t]));
    const pages = cachedPages.map((p) => ({ ...p, takenDown: byPage.has(p.page), takenDownAt: byPage.get(p.page)?.at ?? null }));
    return json({ pages, count: pages.length, takedowns, takedownsReadable });
  } catch (err) {
    console.error('site-pages: unexpected error', err?.stack || err);
    return json({ error: 'Could not list the pages.' }, 500);
  }
};

export const config = { path: '/api/offers/site/pages' };
