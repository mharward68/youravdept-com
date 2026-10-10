// YAVD Offers Module: views and leads counts (Session 1.9)
//
// Layout from shared/offer-contract.js (frozen, unchanged):
//   store "offer-stats" ("offer-stats-test" on every non-production deploy)
//     key "<offer id>"  ->  { views, leads }
//
// Why this is safe without a counter service
// Netlify advises against read-add-write counters in Blobs because two writes
// at the same moment can lose one. Every bump here is a conditional write:
// read the record with its ETag, add one, write only if the ETag still
// matches (onlyIfMatch, or onlyIfNew for the first count). If another bump
// landed in between, read again and retry, up to MAX_TRIES with a short random
// pause. A count is only ever lost if MAX_TRIES writes in a row collide, which
// at this site's traffic means "practically never"; it is never double counted.
//
// What gets counted (the public POST)
//   - only offers that exist and are running right now (offerStatus)
//   - never a draft, upcoming or expired offer, so a draft preview never counts
//   - the popup itself skips previews of running offers (payload.isTest)
// Counts are a guide for Michael, not billing data: anyone can send a POST
// that looks like a browser. The checks below make that a deliberate act,
// not an accident (same site only, JSON only, tiny body, real running id).

import { getStore } from '@netlify/blobs';
import { CACHE_SECONDS, KEYS, STORES, offerStatus, storeName } from '../../../shared/offer-contract.js';
import { loadOffers, offersStore } from './offers-store.mjs';

export const STAT_EVENTS = Object.freeze({ view: 'views', lead: 'leads' });
export const MAX_TRIES = 5;
export const MAX_COUNT_BODY = 512;
/** Offer ids are crypto.randomUUID() (lib/offers-rules.mjs newId). */
export const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- stores ---------- */

let statsFactory = (deployContext) =>
  getStore({ name: storeName(STORES.stats, deployContext), consistency: 'strong' });

/** Tests only: swap the Blobs store for an in-memory one. */
export function _setStatsStoreFactoryForTests(fn) { statsFactory = fn; }

export function statsStore(deployContext) { return statsFactory(deployContext); }
export function statsStoreName(deployContext) { return storeName(STORES.stats, deployContext); }

/* ---------- the record ---------- */

function count(n) { return Number.isSafeInteger(n) && n > 0 ? n : 0; }

/** Any stored value -> { views, leads } with whole, non-negative numbers. */
export function normalizeStats(v) {
  return { views: count(v?.views), leads: count(v?.leads) };
}

/**
 * Adds one to views or leads for this offer. Returns the new record.
 * Throws Error('busy') after MAX_TRIES collisions.
 */
export async function bumpStat(store, id, event, { pause = () => sleep(10 + Math.floor(Math.random() * 40)) } = {}) {
  const field = STAT_EVENTS[event];
  if (!field) throw new Error(`unknown event ${event}`);
  const key = KEYS.stats(id);
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const res = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    const next = normalizeStats(res?.data);
    next[field] += 1;
    const w = await store.setJSON(key, next, res ? { onlyIfMatch: res.etag } : { onlyIfNew: true });
    if (w?.modified) return next;
    if (attempt < MAX_TRIES) await pause();
  }
  throw new Error('busy');
}

/** Every offer's counts: { "<id>": { views, leads } }. Unreadable entries are skipped. */
export async function readAllStats(store) {
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).filter((k) => ID_SHAPE.test(k));
  const out = {};
  await Promise.all(keys.map(async (k) => {
    try { out[k] = normalizeStats(await store.get(k, { type: 'json', consistency: 'strong' })); }
    catch (err) { console.error('offers-stats: unreadable entry', k, err?.message); }
  }));
  return out;
}

/* ---------- which offers may be counted ---------- */

// The offer list is read at most once a minute per function instance, the
// same window the edge functions use, so a busy page does not mean one offer
// read per view. An offer that just started may take up to a minute to count;
// the edge needs the same minute before it shows the popup at all.
const offerCache = new Map();   // deployContext -> { offers, at }
export function _clearOfferCacheForTests() { offerCache.clear(); }

export async function runningOffer(deployContext, id, now = new Date()) {
  const k = String(deployContext);
  let hit = offerCache.get(k);
  if (!hit || Date.now() - hit.at >= CACHE_SECONDS * 1000) {
    const { offers } = await loadOffers(offersStore(deployContext));
    hit = { offers, at: Date.now() };
    offerCache.set(k, hit);
  }
  const offer = hit.offers.find((o) => o && o.id === id);
  if (!offer) return { ok: false, reason: 'unknown' };
  if (offerStatus(offer, now) !== 'running') return { ok: false, reason: 'not-running' };
  return { ok: true, offer };
}

/* ---------- request checks for the public POST ---------- */

/**
 * The count request must come from a page on this site: Origin present and
 * equal to this site, JSON (a browser must ask permission first from any other
 * site, and this route never grants it), and a tiny body.
 * Returns { id, event } or { status, error }.
 */
export async function readCountRequest(req) {
  const origin = req.headers.get('origin');
  let self = '';
  try { self = new URL(req.url).origin; } catch { /* below */ }
  if (!origin || origin !== self) return { status: 403, error: 'Cross-site request refused' };
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, error: 'Send JSON' };
  }
  const raw = await req.text();
  if (raw.length > MAX_COUNT_BODY) return { status: 413, error: 'Request too large' };
  let body;
  try { body = JSON.parse(raw); } catch { return { status: 400, error: 'Not valid JSON' }; }
  const id = body?.id;
  const event = body?.event;
  if (typeof id !== 'string' || !ID_SHAPE.test(id)) return { status: 400, error: 'Unknown offer' };
  if (typeof event !== 'string' || !Object.hasOwn(STAT_EVENTS, event)) return { status: 400, error: 'Unknown event' };
  return { id, event };
}
