// YAVD Offers Module: picture storage (Session 3.3, contract 1.3.0)
//
// Netlify Blobs, layout from shared/offer-contract.js:
//   store "offer-images" ("offer-images-test" on every non-production deploy)
//     key = image id (IMAGE.idPattern, 32 hex, random, never reused)
//     bytes = the file; metadata = { type, bytes, width, height, uploadedAt }
//
// One blob per picture and no index, so there is nothing to outgrow or to
// get out of step. The caller checks the bytes first (checkImage in
// offer-image.mjs); this module only stores and reads them.
//
// Every id is checked against IMAGE.idPattern before any storage call, so a
// path like "../offers/all" can never reach the store. A stored record whose
// metadata is not usable (unknown type, missing size) reads as missing: the
// view route must never serve bytes under a type it cannot vouch for.

import { getStore } from '@netlify/blobs';
import { IMAGE, STORES, storeName } from '../../../shared/offer-contract.js';
import { newImageId } from './offer-image.mjs';

export class ImageStoreError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

const UNAVAILABLE = 'Picture storage is unavailable right now. Try again in a minute.';

let storeFactory = (deployContext) =>
  getStore({ name: storeName(STORES.images, deployContext), consistency: 'strong' });

/** Tests only: swap the Blobs store for an in-memory one. */
export function _setImagesStoreFactoryForTests(fn) { storeFactory = fn; }

export function imagesStore(deployContext) {
  try { return storeFactory(deployContext); } catch (err) {
    console.error('offer-images-store: cannot open store', err?.message);
    throw new ImageStoreError(UNAVAILABLE);
  }
}

export function imagesStoreName(deployContext) {
  return storeName(STORES.images, deployContext);
}

export function isImageId(id) {
  return typeof id === 'string' && IMAGE.idPattern.test(id);
}

const posInt = (n) => Number.isSafeInteger(n) && n > 0;

/** The stored metadata in contract shape, or null when it is not usable. */
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const meta = {
    type: m.type,
    bytes: Number(m.bytes),
    width: Number(m.width),
    height: Number(m.height),
    uploadedAt: m.uploadedAt
  };
  if (!IMAGE.mimeTypes.includes(meta.type)) return null;
  if (!posInt(meta.bytes) || !posInt(meta.width) || !posInt(meta.height)) return null;
  if (typeof meta.uploadedAt !== 'string' || Number.isNaN(Date.parse(meta.uploadedAt))) return null;
  return meta;
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/**
 * Stores one checked picture under a new id.
 * `info` is checkImage(bytes).info: { type, width, height, bytes }.
 * Returns { id, type, bytes, width, height, uploadedAt }.
 */
export async function putImage(store, bytes, info, now = new Date()) {
  const b = toBytes(bytes);
  if (!b || b.length === 0) throw new ImageStoreError('There is no picture to store.', 400);
  const meta = cleanMeta({ ...info, bytes: b.length, uploadedAt: now.toISOString() });
  if (!meta || info?.bytes !== b.length) {
    throw new ImageStoreError('The picture details do not match the file, so it was not stored.', 400);
  }
  // A clash of two random 128-bit ids will not happen, but onlyIfNew makes
  // sure that even then nothing is overwritten: try once more with a new id.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const id = newImageId();
    let w;
    try {
      w = await store.set(id, b, { metadata: meta, onlyIfNew: true });
    } catch (err) {
      console.error('offer-images-store: write failed', err?.message);
      throw new ImageStoreError('The picture did not upload. Try again in a minute.');
    }
    if (w?.modified) return { id, ...meta };
  }
  throw new ImageStoreError('The picture did not upload. Try again.');
}

/** The picture and its details, or null when there is none (or the id is not a picture id). */
export async function getImage(store, id) {
  if (!isImageId(id)) return null;
  let res;
  try {
    res = await store.getWithMetadata(id, { type: 'arrayBuffer', consistency: 'strong' });
  } catch (err) {
    console.error('offer-images-store: read failed', err?.message);
    throw new ImageStoreError(UNAVAILABLE);
  }
  if (!res) return null;
  const bytes = toBytes(res.data);
  const meta = cleanMeta(res.metadata);
  if (!bytes || !meta || bytes.length !== meta.bytes) {
    console.error('offer-images-store: unusable record', id);
    return null;
  }
  return { bytes, meta };
}

/** The picture's details only (no bytes), or null. */
export async function headImage(store, id) {
  if (!isImageId(id)) return null;
  let res;
  try {
    res = await store.getMetadata(id, { consistency: 'strong' });
  } catch (err) {
    console.error('offer-images-store: metadata read failed', err?.message);
    throw new ImageStoreError(UNAVAILABLE);
  }
  if (!res) return null;
  const meta = cleanMeta(res.metadata);
  if (!meta) console.error('offer-images-store: unusable metadata', id);
  return meta;
}

/** Every stored picture id. Keys that are not picture ids are ignored. */
export async function listImages(store) {
  let res;
  try {
    res = await store.list();
  } catch (err) {
    console.error('offer-images-store: list failed', err?.message);
    throw new ImageStoreError(UNAVAILABLE);
  }
  return (res?.blobs ?? []).map((b) => b.key).filter(isImageId).sort();
}

/** Removes one picture. Removing one that is already gone is not an error. */
export async function deleteImage(store, id) {
  if (!isImageId(id)) throw new ImageStoreError('That is not a picture id.', 400);
  try {
    await store.delete(id);
  } catch (err) {
    console.error('offer-images-store: delete failed', err?.message);
    throw new ImageStoreError(UNAVAILABLE);
  }
}
