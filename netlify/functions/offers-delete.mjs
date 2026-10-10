// YAVD Offers Module: /api/offers/delete   POST {id}, drafts only
// Session 1.4. Signed-in only. The list as it was before the delete goes to
// history first (lib/offers-store.mjs), so a deleted draft can be recovered.
//   200 { ok, deleted: id } | 404 not found | 409 not a draft | 503 storage
import { offerStatus } from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { readJson } from './lib/offers-rules.mjs';
import { StoreError, changeOffers, offersStore } from './lib/offers-store.mjs';

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['POST'] });
  if (refused) return refused;

  const read = await readJson(req);
  if (read.error) return json({ error: read.error }, read.status);
  const id = read.body?.id;
  if (typeof id !== 'string' || !id) return json({ error: 'Say which offer to delete: {"id": "..."}' }, 400);

  try {
    const store = offersStore(context?.deploy?.context);
    const outcome = await changeOffers(store, (offers) => {
      const offer = offers.find((o) => o.id === id);
      if (!offer) return { stop: { status: 404, error: 'This offer no longer exists. Reload the dashboard.' } };
      if (offerStatus(offer) !== 'draft') {
        return { stop: { status: 409, error: `"${offer.name}" is scheduled, so it cannot be deleted. Save it as a draft first, then delete it.` } };
      }
      return { offers: offers.filter((o) => o.id !== id), result: { name: offer.name } };
    }, { action: 'delete', offerId: id });

    if (!outcome.saved) return json({ error: outcome.stop.error }, outcome.stop.status);
    return json({ ok: true, deleted: id, name: outcome.result.name });
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error('offers-delete: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was deleted.' }, 500);
  }
};

export const config = { path: '/api/offers/delete' };
