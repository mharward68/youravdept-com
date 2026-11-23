// YAVD Offers Module: automatic picture cleanup (Session 3.6, contract 1.3.0;
// landing pages added in Session 4.5, contract 1.4.0)
//
// After a successful offer or landing save, pictures that nothing uses are
// removed. "Used" means the picture id appears in a current offer, a current
// landing page, or any of the newest IMAGE.keepVersions (20) saved versions
// of either, so Restore always brings a picture back with its offer or
// landing (including Delete draft, then Restore).
// A picture younger than IMAGE.graceHours (24) is never removed, whatever
// refers to it: an upload that is still waiting for its first save is safe.
//
// The landings store (4th argument of cleanupImages, 2nd of usedImageIds):
//   - a store: its landings and their newest 20 saved versions count as used
//   - left off (undefined): the 3.6 offers-only check, unchanged. Kept ONLY so
//     offers.mjs and the 3.6 tests run as they are until Session 4.6 passes
//     the landings store from offers.mjs. Nothing is deployed between 4.5 and
//     4.6. Every new caller must pass the store.
//   - anything else (null, something that is not a store): nothing deleted,
//     the reason goes in errors.
//
// This is the one place that can lose data, so every doubt means
// DELETE NOTHING:
//   - the picture list, the offers, the landings or any of their 20 saved
//     versions cannot be read (or a saved version is not in the expected
//     shape): nothing deleted
//   - any unused picture's details cannot be read: nothing deleted
//   - a picture whose upload time is missing, unusable or in the future: kept
//   - no usable "now": nothing deleted
//
// Cost per save: one picture list, one offers read, one history list, up to
// 20 history reads, the same again for landings, one details read per unused
// picture. No index to outgrow.
// The callers (offers.mjs, landings.mjs) wrap this in try/catch: cleanup
// never fails a save.

import { IMAGE } from '../../../shared/offer-contract.js';
import { listHistory, loadOffers } from './offers-store.mjs';
import { listLandingHistory, loadLandings } from './landings-store.mjs';
import { deleteImage, headImage, isImageId, listImages } from './offer-images-store.mjs';

const HOUR_MS = 60 * 60 * 1000;

function addIds(set, records) {
  for (const o of records) {
    const id = o?.image?.id;
    if (isImageId(id)) set.add(id);
  }
}

/** True for something that can be read like a Blobs store. */
function isStore(s) {
  return !!s && typeof s === 'object' && typeof s.get === 'function'
    && typeof s.getWithMetadata === 'function' && typeof s.list === 'function';
}

/**
 * Every picture id in the current offers plus the newest IMAGE.keepVersions
 * saved versions (same newest-first order as trimHistory), and the same for
 * landing pages when a landings store is given. Throws when any of them
 * cannot be read, so a caller never decides with half the picture.
 */
export async function usedImageIds(offersStore, landingsStore) {
  const used = new Set();
  const { offers } = await loadOffers(offersStore);
  addIds(used, offers);
  const keys = (await listHistory(offersStore)).slice(0, IMAGE.keepVersions);
  for (const key of keys) {
    const h = await offersStore.get(key, { type: 'json', consistency: 'strong' });
    if (!h || !Array.isArray(h.offers)) throw new Error(`saved version unreadable: ${key}`);
    addIds(used, h.offers);
  }
  if (landingsStore !== undefined) await addLandingIds(used, landingsStore);
  return used;
}

/** Adds every picture id in the current landings and their newest 20 saved versions. Throws on any doubt. */
async function addLandingIds(used, landingsStore) {
  if (!isStore(landingsStore)) throw new Error('landings store missing or not a store');
  const { landings } = await loadLandings(landingsStore);
  addIds(used, landings);
  const keys = (await listLandingHistory(landingsStore)).slice(0, IMAGE.keepVersions);
  for (const key of keys) {
    const h = await landingsStore.get(key, { type: 'json', consistency: 'strong' });
    if (!h || !Array.isArray(h.landings)) throw new Error(`saved landing version unreadable: ${key}`);
    addIds(used, h.landings);
  }
}

/** True only when the upload time is readable and older than the grace period. */
function pastGrace(meta, now) {
  const at = Date.parse(meta?.uploadedAt);
  if (Number.isNaN(at)) return false;
  return now.getTime() - at > IMAGE.graceHours * HOUR_MS;
}

/**
 * Removes pictures that are unused and older than the grace period.
 * Returns { kept: [ids], deleted: [ids], errors: [messages] }. Never throws
 * for storage trouble: it reports it in errors and deletes nothing.
 */
export async function cleanupImages(imagesStore, offersStore, now = new Date(), landingsStore = undefined) {
  const out = { kept: [], deleted: [], errors: [] };
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    out.errors.push('nothing deleted: no usable time given');
    return out;
  }

  let ids, used;
  try {
    ids = await listImages(imagesStore);
    used = await usedImageIds(offersStore, landingsStore);
  } catch (err) {
    out.errors.push(`nothing deleted: ${err?.message ?? err}`);
    return out;
  }

  // Read every candidate's details first; a single failed read stops all deletes.
  const doomed = [];
  for (const id of ids) {
    if (used.has(id)) { out.kept.push(id); continue; }
    let meta;
    try {
      meta = await headImage(imagesStore, id);
    } catch (err) {
      out.errors.push(`nothing deleted: details unreadable for ${id}: ${err?.message ?? err}`);
      return { kept: ids, deleted: [], errors: out.errors };
    }
    if (meta && pastGrace(meta, now)) doomed.push(id); else out.kept.push(id);
  }

  for (const id of doomed) {
    try {
      await deleteImage(imagesStore, id);
      out.deleted.push(id);
    } catch (err) {
      out.kept.push(id);
      out.errors.push(`delete failed for ${id}: ${err?.message ?? err}`);
    }
  }
  return out;
}
