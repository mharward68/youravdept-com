// YAVD Offers Module: /api/offers/export   GET all offers as one JSON file
// Session 1.4. Signed-in only. A full backup, preview keys included, so keep
// the file private. Downloads as yavd-offers-<live|test>-YYYY-MM-DD-HHMM.json
import { CONTRACT_VERSION, TIME_ZONE } from '../../shared/offer-contract.js';
import { requireAdmin, json, NO_STORE } from './lib/offers-auth.mjs';
import { StoreError, loadOffers, offersStore, offersStoreName } from './lib/offers-store.mjs';

function stamp(now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`;
}

export default async (req, context) => {
  const refused = requireAdmin(req, { methods: ['GET'] });
  if (refused) return refused;
  const deployContext = context?.deploy?.context ?? null;
  try {
    const { offers } = await loadOffers(offersStore(deployContext));
    const now = new Date();
    const file = {
      kind: 'yavd-offers-export',
      contract: CONTRACT_VERSION,
      exportedAt: now.toISOString(),
      deployContext,
      store: offersStoreName(deployContext),
      count: offers.length,
      offers
    };
    const name = `yavd-offers-${deployContext === 'production' ? 'live' : 'test'}-${stamp(now)}.json`;
    return new Response(JSON.stringify(file, null, 2) + '\n', {
      status: 200,
      headers: { ...NO_STORE, 'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${name}"` }
    });
  } catch (err) {
    if (err instanceof StoreError) return json({ error: err.message }, err.status);
    console.error('offers-export: unexpected error', err?.stack || err);
    return json({ error: 'Something went wrong with the export.' }, 500);
  }
};

export const config = { path: '/api/offers/export' };
