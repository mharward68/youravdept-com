// YAVD Offers Module: /api/offers/restore   (contract 1.1.0, added after Session 1.4)
// Signed-in only.
//   GET           -> 200 { versions: [{ key, replacedAt, action, offerId, readable, count,
//                                       offers: [{ id, name, updatedAt, draft }] }], keep: 20 }
//                    newest first. Each version is the full offer list as it was just
//                    before that change.
//   POST {key}    -> 200 { ok, restored: key, count }
//                    Puts that version back. The list being replaced is saved to history
//                    first, so a restore can itself be undone.
//                    404 unknown version | 503 storage
import { HISTORY_KEEP } from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { readJson } from './lib/offers-rules.mjs';
import { StoreError, historySummary, isHistoryKey, offersStore, restoreHistory } from './lib/offers-store.mjs';

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET', 'POST'] });
  if (refused) return refused;

  try {
    const store = offersStore(context?.deploy?.context);

    if (req.method === 'GET') {
      const versions = await historySummary(store);
      return json({ versions, keep: HISTORY_KEEP });
    }

    const read = await readJson(req);
    if (read.error) return json({ error: read.error }, read.status);
    const key = read.body?.key;
    if (!isHistoryKey(key)) return json({ error: 'Pick a saved version from the list.' }, 400);

    const outcome = await restoreHistory(store, key);
    return json({ ok: true, restored: key, count: outcome.result.count });
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error('offers-restore: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong. Nothing was restored.' }, 500);
  }
};

export const config = { path: '/api/offers/restore' };
