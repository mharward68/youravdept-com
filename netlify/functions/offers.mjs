// YAVD Offers Module: /api/offers   GET list all, POST create or update one
// Session 1.4. Signed-in only. Rules: lib/offers-rules.mjs. Storage and
// history: lib/offers-store.mjs.
//
// GET  -> 200 { offers: [...each offer plus its status], store, deployContext, now }
// POST body = the offer as the editor has it (JSON).
//      new offer (no id)        -> 201 { ok, created: true,  offer, notes }
//      existing (id + updatedAt) -> 200 { ok, created: false, offer, notes }
//      problems -> 400 field messages | 404 gone | 409 clash or stale | 503 storage
import { CONTRACT_VERSION } from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { prepareOffer, readJson, withStatus } from './lib/offers-rules.mjs';
import { StoreError, changeOffers, loadOffers, offersStore, offersStoreName } from './lib/offers-store.mjs';

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET', 'POST'] });
  if (refused) return refused;
  const deployContext = context?.deploy?.context ?? null;

  try {
    const store = offersStore(deployContext);

    if (req.method === 'GET') {
      const { offers } = await loadOffers(store);
      const now = new Date();
      const list = withStatus(offers, now).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
      return json({ offers: list, store: offersStoreName(deployContext), deployContext,
        now: now.toISOString(), contract: CONTRACT_VERSION });
    }

    const read = await readJson(req);
    if (read.error) return json({ error: read.error }, read.status);
    const input = read.body?.offer && typeof read.body.offer === 'object' ? read.body.offer : read.body;

    const outcome = await changeOffers(store, (offers) => {
      const p = prepareOffer(input, { offers, now: new Date() });
      if (!p.ok) return { stop: p };
      const i = offers.findIndex((o) => o.id === p.offer.id);
      if (i >= 0) offers[i] = p.offer; else offers.push(p.offer);
      return { offers, result: p };
    }, { action: 'save', offerId: typeof input?.id === 'string' && input.id ? input.id : null });

    if (!outcome.saved) {
      const p = outcome.stop;
      return json({ error: p.error, ...(p.fields ? { fields: p.fields } : {}) }, p.status);
    }
    const p = outcome.result;
    const [offer] = withStatus([p.offer]);
    return json({ ok: true, created: p.created, offer, notes: p.notes }, p.created ? 201 : 200);
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error('offers: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was saved.' }, 500);
  }
};

export const config = { path: '/api/offers' };
