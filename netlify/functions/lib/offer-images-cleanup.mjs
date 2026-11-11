// YAVD Offers Module: automatic picture cleanup (Session 3.6, contract 1.3.0)
//
// After a successful offer save, pictures that nothing uses are removed.
// "Used" means the picture id appears in a current offer OR in any of the
// newest IMAGE.keepVersions (20) saved versions, so Restore always brings a
// picture back with its offer (including Delete draft, then Restore).
// A picture younger than IMAGE.graceHours (24) is never removed, whatever
// refers to it: an upload that is still waiting for its first save is safe.
//
// This is the one place in Phase 3 that can lose data, so every doubt means
// DELETE NOTHING:
//   - the picture list, the offers or any of the 20 saved versions cannot be
//     read (or a saved version is not in the expected shape): nothing deleted
//   - any unused picture's details cannot be read: nothing deleted
//   - a picture whose upload time is missing, unusable or in the future: kept
//
// Cost per save: one picture list, one offers read, one history list, up to
// 20 history reads, one details read per unused picture. No index to outgrow.
// The caller (offers.mjs) wraps this in try/catch: cleanup never fails a save.

import { IMAGE } from '../../../shared/offer-contract.js';
import { listHistory, loadOffers } from './offers-store.mjs';
import { deleteImage, headImage, isImageId, listImages } from './offer-images-store.mjs';

const HOUR_MS = 60 * 60 * 1000;

function addIds(set, offers) {
  for (const o of offers) {
    const id = o?.image?.id;
    if (isImageId(id)) set.add(id);
  }
}

/**
 * Every picture id in the current offers plus the newest IMAGE.keepVersions
 * saved versions (same newest-first order as trimHistory). Throws when any of
 * them cannot be read, so a caller never decides with half the picture.
 */
export async function usedImageIds(offersStore) {
  const used = new Set();
  const { offers } = await loadOffers(offersStore);
  addIds(used, offers);
  const keys = (await listHistory(offersStore)).slice(0, IMAGE.keepVersions);
  for (const key of keys) {
    const h = await offersStore.get(key, { type: 'json', consistency: 'strong' });
    if (!h || !Array.isArray(h.offers)) throw new Error(`saved version unreadable: ${key}`);
    addIds(used, h.offers);
  }
  return used;
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
export async function cleanupImages(imagesStore, offersStore, now = new Date()) {
  const out = { kept: [], deleted: [], errors: [] };

  let ids, used;
  try {
    ids = await listImages(imagesStore);
    used = await usedImageIds(offersStore);
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
