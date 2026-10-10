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
// Order of saved versions: every write of "all" carries a change number in
// its metadata (seq). The history key ends in that number, zero-padded, and
// versions are sorted by it, never by time alone: two saves in the same
// millisecond, or on two servers with slightly different clocks, still sort
// in the order they really happened. Keys written before this (6 hex
// characters at the end, test store only) sort as oldest.
//
// If "all" holds something that is not an array, every write is refused:
// the module never overwrites data it cannot read.

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
  if (!res) return { offers: [], etag: undefined, exists: false, seq: 0 };
  if (!Array.isArray(res.data)) {
    throw new StoreError('The stored offers are not in the expected format, so nothing was changed. Use an export or a saved version to restore them.', 500);
  }
  const seq = Number(res.metadata?.seq);
  return { offers: res.data, etag: res.etag, exists: true, seq: Number.isSafeInteger(seq) && seq > 0 ? seq : 0 };
}

const SEQ_DIGITS = 9;
function historyKey(now, seq) {
  return KEYS.history(`${now.toISOString()}-${String(seq).padStart(SEQ_DIGITS, '0')}`);
}
/** The change number at the end of a history key (0 for older keys). */
export function historySeq(key) {
  const m = /-(\d{9})$/.exec(key);
  return m ? Number(m[1]) : 0;
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
    const seq = current.seq + 1;
    if (current.exists) {
      try {
        const h = await store.setJSON(historyKey(at, seq),
          { replacedAt: at.toISOString(), action, offerId: offerId ?? null, offers: current.offers },
          { onlyIfNew: true });
        // modified:false means another save that read this same version (same
        // change number) already kept it: the copy is identical, so carry on.
        // Only one of those saves can win the write to "all" below.
        if (!h || typeof h.modified !== 'boolean') throw new Error('history write gave no result');
      } catch (err) {
        console.error('offers-store: history write failed', err?.message);
        throw new StoreError('Could not keep a copy of the previous version, so nothing was saved. Try again in a minute.');
      }
    }

    let w;
    try {
      w = await store.setJSON(KEYS.all, next.offers, current.exists
        ? { onlyIfMatch: current.etag, metadata: { seq } }
        : { onlyIfNew: true, metadata: { seq } });
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
  return blobs.map((b) => b.key)
    .sort((a, b) => historySeq(b) - historySeq(a) || (a < b ? 1 : a > b ? -1 : 0));
}

export async function trimHistory(store) {
  try {
    const keys = await listHistory(store);
    await Promise.all(keys.slice(HISTORY_KEEP).map((k) => store.delete(k).catch(() => {})));
  } catch (err) {
    console.error('offers-store: history trim failed (harmless, retried on next save)', err?.message);
  }
}

const HISTORY_KEY_SHAPE = /^history\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-(?:\d{9}|[0-9a-f]{6})$/;
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
