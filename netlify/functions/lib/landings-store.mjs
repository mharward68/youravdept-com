// YAVD Offers Module: landing page storage (Session 4.3, contract 1.4.0)
//
// Netlify Blobs, layout from shared/offer-contract.js:
//   store "offer-landings" ("offer-landings-test" on every non-production deploy)
//     key "all"             every landing record (LANDING_KEYS), one JSON array
//     key "history/<time>-<9-digit change number>"
//                           the array as it was before each change, newest 20 kept
//
// The steps are copied from lib/offers-store.mjs (not shared, so the offers
// store never changes because of landing pages). Every change:
//   1. read "all" with its ETag (strong consistency)
//   2. work out the new array (the caller's change function)
//   3. write the OLD array to history/<time>-<seq>  (if this fails, stop: no save)
//   4. write the new array, only if "all" still has the ETag from step 1
//      (onlyIfMatch; onlyIfNew when nothing is stored yet). If another save
//      landed in between, start again from step 1, up to 3 times.
//   5. trim history to the newest 20 (best effort)
//
// Saved versions sort by the change number (metadata seq on "all", the end
// of each history key), never by time alone.
//
// If "all" holds something that is not an array, every write is refused:
// the module never overwrites data it cannot read.

import { getStore } from '@netlify/blobs';
import { HISTORY_KEEP, KEYS, STORES, storeName } from '../../../shared/offer-contract.js';

const MAX_TRIES = 3;
const SEQ_DIGITS = 9;

export class LandingStoreError extends Error {
  constructor(message, status = 503) { super(message); this.name = 'LandingStoreError'; this.status = status; }
}

let storeFactory = (deployContext) =>
  getStore({ name: storeName(STORES.landings, deployContext), consistency: 'strong' });

/** Tests only: swap the Blobs store for an in-memory one. */
export function _setLandingsStoreFactoryForTests(fn) { storeFactory = fn; }

export function landingsStoreName(deployContext) {
  return storeName(STORES.landings, deployContext);
}

export function landingsStore(deployContext) {
  try { return storeFactory(deployContext); } catch (err) {
    console.error('landings-store: cannot open store', err?.message);
    throw new LandingStoreError('Landing page storage is unavailable right now. Nothing was changed. Try again in a minute.');
  }
}

/** Reads every landing. Returns { landings, etag, exists, seq } (etag undefined when empty). */
export async function loadLandings(store) {
  let res;
  try {
    res = await store.getWithMetadata(KEYS.all, { type: 'json', consistency: 'strong' });
  } catch (err) {
    console.error('landings-store: read failed', err?.message);
    throw new LandingStoreError('Could not read the landing pages right now. Try again in a minute.');
  }
  if (!res) return { landings: [], etag: undefined, exists: false, seq: 0 };
  if (!Array.isArray(res.data)) {
    throw new LandingStoreError('The stored landing pages are not in the expected format, so nothing was changed. Use an export or a saved version to restore them.', 500);
  }
  const seq = Number(res.metadata?.seq);
  return { landings: res.data, etag: res.etag, exists: true, seq: Number.isSafeInteger(seq) && seq > 0 ? seq : 0 };
}

function historyKey(at, seq) {
  return KEYS.history(`${at.toISOString()}-${String(seq).padStart(SEQ_DIGITS, '0')}`);
}

/** The change number at the end of a history key (0 when it has none). */
export function landingHistorySeq(key) {
  const m = /-(\d{9})$/.exec(key);
  return m ? Number(m[1]) : 0;
}

const HISTORY_KEY_SHAPE = /^history\/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-\d{9}$/;
export function isLandingHistoryKey(key) {
  return typeof key === 'string' && HISTORY_KEY_SHAPE.test(key);
}

/**
 * Applies one change safely. `change(landings)` gets a private copy and returns
 *   { landings: newArray, result }   to save, or
 *   { stop: anything }               to save nothing and return it.
 * Returns { saved: true, result } or { saved: false, stop }.
 * Throws LandingStoreError (503 storage, 500 unreadable data, 409 lost race 3 times).
 */
export async function changeLandings(store, change, { action, landingId, now = () => new Date() } = {}) {
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const current = await loadLandings(store);
    const next = change(structuredClone(current.landings));
    if (!next || 'stop' in next) return { saved: false, stop: next?.stop };
    if (!Array.isArray(next.landings)) {
      throw new LandingStoreError('The change did not produce a list of landing pages, so nothing was saved.', 500);
    }

    const at = now();
    const seq = current.seq + 1;
    if (current.exists) {
      try {
        const h = await store.setJSON(historyKey(at, seq),
          { replacedAt: at.toISOString(), action: action ?? null, landingId: landingId ?? null, landings: current.landings },
          { onlyIfNew: true });
        // modified:false: another save that read this same version (same change
        // number) already kept the identical copy. Only one of them can win the
        // write to "all" below.
        if (!h || typeof h.modified !== 'boolean') throw new Error('history write gave no result');
      } catch (err) {
        console.error('landings-store: history write failed', err?.message);
        throw new LandingStoreError('Could not keep a copy of the previous version, so nothing was saved. Try again in a minute.');
      }
    }

    let w;
    try {
      w = await store.setJSON(KEYS.all, next.landings, current.exists
        ? { onlyIfMatch: current.etag, metadata: { seq } }
        : { onlyIfNew: true, metadata: { seq } });
    } catch (err) {
      console.error('landings-store: write failed', err?.message);
      throw new LandingStoreError('Landing page storage is unavailable right now. Nothing was saved. Try again in a minute.');
    }
    if (w?.modified) {
      await trimLandingHistory(store);
      return { saved: true, result: next.result };
    }
    // Another save landed between our read and write: read again and retry.
  }
  throw new LandingStoreError('Another save happened at the same moment. Nothing was saved. Try again.', 409);
}

/** History keys, newest first. */
export async function listLandingHistory(store) {
  let blobs;
  try {
    ({ blobs } = await store.list({ prefix: KEYS.historyPrefix }));
  } catch (err) {
    console.error('landings-store: history list failed', err?.message);
    throw new LandingStoreError('Could not read the saved versions right now. Try again in a minute.');
  }
  return blobs.map((b) => b.key)
    .sort((a, b) => landingHistorySeq(b) - landingHistorySeq(a) || (a < b ? 1 : a > b ? -1 : 0));
}

export async function trimLandingHistory(store) {
  try {
    const keys = await listLandingHistory(store);
    await Promise.all(keys.slice(HISTORY_KEEP).map((k) => store.delete(k).catch(() => {})));
  } catch (err) {
    console.error('landings-store: history trim failed (harmless, retried on next save)', err?.message);
  }
}

/**
 * The saved versions, newest first, each described in a line an admin page
 * can show: when it was replaced, by what action, and which landings it held.
 */
export async function landingHistorySummary(store) {
  const keys = await listLandingHistory(store);
  const out = [];
  for (const key of keys) {
    let h = null;
    try { h = await store.get(key, { type: 'json', consistency: 'strong' }); } catch { /* listed as unreadable */ }
    const landings = Array.isArray(h?.landings) ? h.landings : null;
    out.push({
      key,
      replacedAt: h?.replacedAt ?? null,
      action: h?.action ?? null,
      landingId: h?.landingId ?? null,
      readable: !!landings,
      count: landings ? landings.length : 0,
      landings: landings ? landings.map((l) => ({ id: l.id, name: l.name, slug: l.slug, status: l.status, updatedAt: l.updatedAt })) : []
    });
  }
  return out;
}

/**
 * Puts a saved version back. The version being replaced goes to history
 * first (through changeLandings), so a restore can itself be undone.
 */
export async function restoreLandingHistory(store, key, { now } = {}) {
  if (!isLandingHistoryKey(key)) throw new LandingStoreError('That saved version does not exist.', 404);
  let old;
  try {
    old = await store.get(key, { type: 'json', consistency: 'strong' });
  } catch (err) {
    console.error('landings-store: history read failed', err?.message);
    throw new LandingStoreError('Could not read that saved version right now. Try again in a minute.');
  }
  if (!old || !Array.isArray(old.landings)) throw new LandingStoreError('That saved version does not exist.', 404);
  return changeLandings(store, () => ({ landings: old.landings, result: { restored: key, count: old.landings.length } }),
    { action: 'restore', landingId: null, now });
}
