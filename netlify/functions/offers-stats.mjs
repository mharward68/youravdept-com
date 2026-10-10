// YAVD Offers Module: /api/offers/stats   (Session 1.9)
//
// GET   signed-in only -> 200 { stats: { "<id>": { views, leads } }, store }
// POST  public, from the popup: {"id": "<offer id>", "event": "view"|"lead"}
//       -> 204, with header x-yavd-stat naming what happened:
//          counted | unknown | not-running | busy | store-failed
//       Refusals (wrong site, not JSON, bad id or event) -> 4xx JSON.
//       The response never carries counts or offer data.
//
// The route lives here, in the function's own config, like every other
// /api/offers route. It is not in shared/offer-contract.js ROUTES (frozen);
// see DECISIONS 2026-10-10 Session 1.9. The sign-in cookie (Path=/api/offers)
// reaches this path, so GET uses the same requireAdmin check as the rest.
import { requireAdmin, json, NO_STORE } from './lib/offers-auth.mjs';
import {
  bumpStat, readAllStats, readCountRequest, runningOffer, statsStore, statsStoreName
} from './lib/offers-stats.mjs';

function done(state, status = 204) {
  return new Response(null, { status, headers: { ...NO_STORE, 'x-yavd-stat': state } });
}

export default async (req, context) => {
  const deployContext = context?.deploy?.context ?? null;

  if (req.method === 'GET' || req.method === 'HEAD') {
    const refused = requireAdmin(req, { methods: ['GET', 'HEAD'] });
    if (refused) return refused;
    try {
      const stats = await readAllStats(statsStore(deployContext));
      return json({ stats, store: statsStoreName(deployContext) });
    } catch (err) {
      console.error('offers-stats: read failed', err?.message);
      return json({ error: 'Counts are unavailable right now. Try Refresh in a minute.' }, 503);
    }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });

  const ask = await readCountRequest(req);
  if (ask.error) return json({ error: ask.error }, ask.status);

  let check;
  try {
    check = await runningOffer(deployContext, ask.id);
  } catch (err) {
    console.error('offers-stats: offer read failed', err?.message);
    return done('store-failed', 503);
  }
  if (!check.ok) return done(check.reason);

  try {
    await bumpStat(statsStore(deployContext), ask.id, ask.event);
    return done('counted');
  } catch (err) {
    if (err?.message === 'busy') return done('busy', 503);
    console.error('offers-stats: count failed', err?.message);
    return done('store-failed', 503);
  }
};

export const config = { path: '/api/offers/stats' };
