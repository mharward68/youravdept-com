// YAVD Offers Module: offer storage (Session 1.4)
//
// Netlify Blobs, layout from shared/offer-contract.js:
//   store "offers" ("offers-test" on every non-production deploy)
//     key "all"             every offer, one JSON array
//     key "history/<time>"  the array as it was before each change, newest 20 kept
//
// Every change follows the same steps, so nothing is ever lost:
//   1. read "all" with its ETag (strong consistency)
//   2. work out the new array (the caller's change function)
//   3. write the OLD array to history/<time>   (if this fails, stop: no save)
//   4. write the new array, only if "all" still has the ETag from step 1
//      (Blobs onlyIfMatch). If someone else saved in between, start again
//      from step 1, up to 3 times. This is real concurrency control, unlike
//      a counter, so two saves at the same moment cannot overwrite each other.
//   5. trim history to the newest 20 (best effort)
//
// If "all" holds something that is not an array, every write is refused:
// the module never overwrites data it cannot read.

import { randomBytes } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { HISTORY_KEEP, KEYS, STORES, storeName } from '../../../shared/offer-contract.js';

const MAX_TRIES = 3;

export class StoreError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

let storeFactory = (deployContext) =>
  getStore({ name: storeName(STORES.offers, deployContext), consistency: 'strong' });

/** Tests only: swap the Blobs store for an in-memory one. */
export function _setOffersStoreFactoryForTests(fn) { storeFactory = fn; }

export function offersStore(deployContext) {
  try { return storeFactory(deployContext); } catch (err) {
    console.error('offers-store: cannot open store', err?.message);
    throw new StoreError('Offer storage is unavailable right now. Nothing was changed. Try again in a minute.');
  }
}

export function offersStoreName(deployContext) {
  return storeName(STORES.offers, deployContext);
}

/** Reads every offer. Returns { offers, etag } (etag undefined when empty). */
export async function loadOffers(store) {
  let res;
  try {
    res = await store.getWithMetadata(KEYS.all, { type: 'json', consistency: 'strong' });
  } catch (err) {
    console.error('offers-store: read failed', err?.message);
    throw new StoreError('Could not read the offers right now. Try again in a minute.');
  }
  if (!res) return { offers: [], etag: undefined, exists: false };
  if (!Array.isArray(res.data)) {
    throw new StoreError('The stored offers are not in the expected format, so nothing was changed. Use an export or a saved version to restore them.', 500);
  }
  return { offers: res.data, etag: res.etag, exists: true };
}

function historyKey(now) {
  return KEYS.history(`${now.toISOString()}-${randomBytes(3).toString('hex')}`);
}

/**
 * Applies one change safely. `change(offers)` returns
 *   { offers: newArray, result }            to save, or
 *   { stop: anything }                      to save nothing and return it.
 * Returns { saved: true, result } or { saved: false, stop }.
 */
export async function changeOffers(store, change, { action, offerId, now = () => new Date() } = {}) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const current = await loadOffers(store);
    const next = change(structuredClone(current.offers));
    if (!next || 'stop' in next) return { saved: false, stop: next?.stop };

    const at = now();
    if (current.exists) {
      try {
        const h = await store.setJSON(historyKey(at),
          { replacedAt: at.toISOString(), action, offerId: offerId ?? null, offers: current.offers },
          { onlyIfNew: true });
        if (!h?.modified) throw new Error('history key already existed');
      } catch (err) {
        console.error('offers-store: history write failed', err?.message);
        throw new StoreError('Could not keep a copy of the previous version, so nothing was saved. Try again in a minute.');
      }
    }

    let w;
    try {
      w = await store.setJSON(KEYS.all, next.offers,
        current.exists ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    } catch (err) {
      console.error('offers-store: write failed', err?.message);
      throw new StoreError('Offer storage is unavailable right now. Nothing was saved. Try again in a minute.');
    }
    if (w?.modified) {
      await trimHistory(store);
      return { saved: true, result: next.result };
    }
    // Someone else saved between our read and write: read again and retry.
  }
  throw new StoreError('Another save happened at the same moment. Nothing was saved. Try again.', 409);
}

/** Newest first. */
export async function listHistory(store) {
  const { blobs } = await store.list({ prefix: KEYS.historyPrefix });
  return blobs.map((b) => b.key).sort().reverse();
}

export async function trimHistory(store) {
  try {
    const keys = await listHistory(store);
    await Promise.all(keys.slice(HISTORY_KEEP).map((k) => store.delete(k).catch(() => {})));
  } catch (err) {
    console.error('offers-store: history trim failed (harmless, retried on next save)', err?.message);
  }
}

const HISTORY_KEY_SHAPE = /^history\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{6}$/;
export function isHistoryKey(key) {
  return typeof key === 'string' && HISTORY_KEY_SHAPE.test(key);
}

/**
 * The saved versions, newest first, each described in a line the admin page
 * can show: when it was replaced, by what action, and which offers it held.
 */
export async function historySummary(store) {
  let keys;
  try { keys = await listHistory(store); } catch (err) {
    console.error('offers-store: history list failed', err?.message);
    throw new StoreError('Could not read the saved versions right now. Try again in a minute.');
  }
  const out = [];
  for (const key of keys) {
    let h = null;
    try { h = await store.get(key, { type: 'json', consistency: 'strong' }); } catch { /* listed below as unreadable */ }
    const offers = Array.isArray(h?.offers) ? h.offers : null;
    out.push({
      key,
      replacedAt: h?.replacedAt ?? null,
      action: h?.action ?? null,
      offerId: h?.offerId ?? null,
      readable: !!offers,
      count: offers ? offers.length : 0,
      offers: offers ? offers.map((o) => ({ id: o.id, name: o.name, updatedAt: o.updatedAt, draft: o.draft })) : []
    });
  }
  return out;
}

/**
 * Puts a saved version back. The version being replaced goes to history
 * first, so a restore can itself be undone. Route: /api/offers/restore
 * (offers-restore.mjs, contract 1.1.0).
 */
export async function restoreHistory(store, key, { now } = {}) {
  if (!isHistoryKey(key)) {
    throw new StoreError('That saved version does not exist.', 404);
  }
  const old = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!old || !Array.isArray(old.offers)) throw new StoreError('That saved version does not exist.', 404);
  return changeOffers(store, () => ({ offers: old.offers, result: { restored: key, count: old.offers.length } }),
    { action: 'restore', offerId: null, now });
}
