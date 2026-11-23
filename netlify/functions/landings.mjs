// YAVD Offers Module: /api/offers/landings   GET list all, POST create or update one
// Session 4.4 (contract 1.4.0). Signed-in only. Rules: lib/landings-rules.mjs.
// Storage and history: lib/landings-store.mjs.
//
// GET  -> 200 { landings: [...each landing plus state and linkedOffers], store,
//               deployContext, now, contract, notes }
//      state is landingState() (worked out, never stored). linkedOffers lists
//      the offers whose "landing" is this page's slug: { id, name, slug, draft }.
//      An unreadable offers store still lists the landings (linkedOffers empty,
//      a note says why); only an unreadable landings store fails (503).
// POST body = the landing as the editor has it (JSON), or { landing }.
//      new (no id)               -> 201 { ok, created: true,  landing, previewPath, notes }
//      existing (id + updatedAt) -> 200 { ok, created: false, landing, previewPath, notes }
//      problems -> 400 field messages | 404 gone | 409 stale or slug clash | 503 storage
//      body.image = null removes the picture, absent keeps it, or
//      { id, alt }: the picture's facts come from the picture store.
// After a successful save, unused pictures past the grace period are removed
// (lib/offer-images-cleanup.mjs, Session 4.5), checking offers AND landings.
// Best effort: never fails a save.
import {
  CONTRACT_VERSION, PREVIEW_PARAM, landingPath, landingState
} from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { readJson } from './lib/offers-rules.mjs';
import { prepareLanding } from './lib/landings-rules.mjs';
import {
  LandingStoreError, changeLandings, landingsStore, landingsStoreName, loadLandings
} from './lib/landings-store.mjs';
import { loadOffers, offersStore } from './lib/offers-store.mjs';
import { ImageStoreError, headImage, imagesStore, isImageId } from './lib/offer-images-store.mjs';
import { cleanupImages } from './lib/offer-images-cleanup.mjs';

export const IMAGE_UNAVAILABLE = 'Picture storage is unavailable right now, so nothing was saved. Try again in a minute.';
export const OFFERS_UNREADABLE = 'The offers could not be read, so linked offers are not shown and states ignore offer dates. Reload in a minute.';
export const TOO_LARGE = 'That is too large to save. Shorten the page copy.';

export const previewPath = (l) => `${landingPath(l.slug)}?${PREVIEW_PARAM}=${encodeURIComponent(l.previewKey)}`;

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET', 'POST'] });
  if (refused) return refused;
  const deployContext = context?.deploy?.context ?? null;

  try {
    const store = landingsStore(deployContext);

    if (req.method === 'GET') {
      const { landings } = await loadLandings(store);
      const notes = [];
      const offers = await readOffersSafely(deployContext, notes);
      const now = new Date();
      const list = landings
        .filter((l) => l && typeof l === 'object')
        .map((l) => decorate(l, offers, now))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return json({ landings: list, store: landingsStoreName(deployContext), deployContext,
        now: now.toISOString(), contract: CONTRACT_VERSION, notes });
    }

    const read = await readJson(req);
    if (read.error) return json({ error: read.status === 413 ? TOO_LARGE : read.error }, read.status);
    const input = read.body?.landing && typeof read.body.landing === 'object' ? read.body.landing : read.body;

    const images = await lookUpWantedImage(store, input, deployContext);

    const outcome = await changeLandings(store, (landings) => {
      const p = prepareLanding(input, { landings, now: new Date(), images });
      if (!p.ok) return { stop: p };
      const i = landings.findIndex((l) => l && l.id === p.landing.id);
      if (i >= 0) landings[i] = p.landing; else landings.push(p.landing);
      return { landings, result: p };
    }, { action: 'save', landingId: typeof input?.id === 'string' && input.id ? input.id : null });

    if (!outcome.saved) {
      const p = outcome.stop;
      return json({ error: p.error, ...(p.fields ? { fields: p.fields } : {}) }, p.status);
    }
    const p = outcome.result;
    await cleanUpAfterSave(store, deployContext);
    return json({ ok: true, created: p.created, landing: p.landing, previewPath: previewPath(p.landing), notes: p.notes },
      p.created ? 201 : 200);
  } catch (err) {
    if (err instanceof LandingStoreError) return json({ error: err.message }, err.status);
    if (err instanceof ImageStoreError) return json({ error: IMAGE_UNAVAILABLE }, 503);
    console.error('landings: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was saved.' }, 500);
  }
};

/**
 * Session 4.5: removes unused pictures past the grace period, counting every
 * offer, every landing and the last 20 saved versions of each as "used".
 * Same wrapper as offers.mjs: any failure is logged and ignored, the save has
 * already happened, and cleanup itself deletes nothing on any doubt.
 */
export async function cleanUpAfterSave(store, deployContext) {
  try {
    const r = await cleanupImages(imagesStore(deployContext), offersStore(deployContext), new Date(), store);
    if (r.errors.length) console.error('landings: picture cleanup skipped or partial (harmless, retried on next save)', r.errors.join('; '));
  } catch (err) {
    console.error('landings: picture cleanup failed (harmless, retried on next save)', err?.message);
  }
}

/** A landing as the admin list shows it: the record plus its worked-out state and linked offers. */
export function decorate(landing, offers, now = new Date()) {
  const linked = offers.filter((o) => o && typeof o.landing === 'string' && o.landing === landing.slug);
  return {
    ...landing,
    state: landingState(landing, linked, now),
    linkedOffers: linked.map((o) => ({ id: o.id, name: o.name, slug: o.slug ?? null, draft: !!o.draft }))
  };
}

/** Every offer, or [] plus a note when the offers store cannot be read. Never throws. */
export async function readOffersSafely(deployContext, notes) {
  try {
    const { offers } = await loadOffers(offersStore(deployContext));
    return Array.isArray(offers) ? offers : [];
  } catch (err) {
    console.error('landings: offers store unreadable, listing landings without offers', err?.message);
    notes.push(OFFERS_UNREADABLE);
    return [];
  }
}

/**
 * The stored facts (type, bytes, width, height) of the one picture this save
 * asks for, as a Map for prepareLanding (same pattern as offers.mjs). Nothing
 * is looked up when the save carries no picture, or the picture the landing
 * already has. A picture storage does not have is absent: prepareLanding
 * answers "gone". Storage trouble throws ImageStoreError: 503, nothing written.
 */
async function lookUpWantedImage(store, input, deployContext) {
  const images = new Map();
  const id = input && typeof input.image === 'object' && input.image !== null ? input.image.id : undefined;
  if (!isImageId(id)) return images;
  if (typeof input.id === 'string' && input.id) {
    const { landings } = await loadLandings(store);
    if (landings.find((l) => l && l.id === input.id)?.image?.id === id) return images;
  }
  const meta = await headImage(imagesStore(deployContext), id);
  if (meta) images.set(id, meta);
  return images;
}

export const config = { path: '/api/offers/landings' };   // literal: Netlify reads config statically (= ROUTES.apiLandings, tested)
