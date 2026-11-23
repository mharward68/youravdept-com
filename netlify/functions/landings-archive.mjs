// YAVD Offers Module: /api/offers/landings/archive   POST { id, archived: boolean }
// Session 4.4 (contract 1.4.0). Signed-in only.
//
//   archived: true   Live -> Archived (archivedAt and updatedAt set now). The
//                    page expires at once; linked offers keep pointing at it.
//   archived: false  Archived -> Live (archivedAt cleared). The slug was kept
//                    unique while archived, so a restore never clashes.
//   Already in the asked-for state -> 200 { changed: false }, nothing written.
//   A Draft cannot be archived (409, DRAFT_ARCHIVE): it is not public, so there
//   is nothing to take down, and refusing it means a restore can never turn an
//   unfinished draft Live without the Live checks in prepareLanding. Same rule
//   as prepareLanding (Session 4.2). Decided in Session 4.4; reversible.
//   archived: false on a Draft is a no-op (changed: false): restore only
//   applies to archived pages.
//
// Every change goes through changeLandings (history first, ETag guard), so
// an archive or restore is itself kept in history and can be undone.
// -> 200 { ok, changed, landing (plus state and linkedOffers) }
//    400 bad body | 404 gone | 409 draft | 503 storage
import { LANDING_MESSAGES } from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { readJson } from './lib/offers-rules.mjs';
import { LandingStoreError, changeLandings, landingsStore } from './lib/landings-store.mjs';
import { decorate, readOffersSafely } from './landings.mjs';

export const DRAFT_ARCHIVE = 'A draft cannot be archived. It is not public, so it can stay a draft. Make it Live first if it needs archiving.';
export const BAD_BODY = 'Send { id, archived: true or false }.';

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['POST'] });
  if (refused) return refused;
  const deployContext = context?.deploy?.context ?? null;

  try {
    const read = await readJson(req);
    if (read.error) return json({ error: read.error }, read.status);
    const id = read.body?.id;
    const archived = read.body?.archived;
    if (typeof id !== 'string' || !id || typeof archived !== 'boolean') return json({ error: BAD_BODY }, 400);

    const store = landingsStore(deployContext);
    const outcome = await changeLandings(store, (landings) => {
      const i = landings.findIndex((l) => l && l.id === id);
      if (i < 0) return { stop: { status: 404, error: LANDING_MESSAGES.gone } };
      const l = landings[i];
      const want = archived ? 'archived' : 'live';
      if (l.status === want) return { stop: { status: 200, unchanged: l } };
      if (archived && l.status !== 'live') return { stop: { status: 409, error: DRAFT_ARCHIVE } };
      if (!archived && l.status !== 'archived') return { stop: { status: 200, unchanged: l } };

      const now = Date.now();
      const prev = Date.parse(l.updatedAt);
      const updatedAt = new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString(); // always moves forward
      const next = { ...l, status: want, archivedAt: archived ? updatedAt : null, updatedAt };
      landings[i] = next;
      return { landings, result: next };
    }, { action: archived ? 'archive' : 'restore', landingId: id });

    let landing;
    if (outcome.saved) landing = outcome.result;
    else if (outcome.stop?.unchanged) landing = outcome.stop.unchanged;
    else return json({ error: outcome.stop.error }, outcome.stop.status);

    const offers = await readOffersSafely(deployContext, []);
    return json({ ok: true, changed: outcome.saved, landing: decorate(landing, offers) });
  } catch (err) {
    if (err instanceof LandingStoreError) return json({ error: err.message }, err.status);
    console.error('landings-archive: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was changed.' }, 500);
  }
};

export const config = { path: '/api/offers/landings/archive' };   // literal: Netlify reads config statically (= ROUTES.apiLandingArchive, tested)
