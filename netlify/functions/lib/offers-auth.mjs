// YAVD Offers Module: shared sign-in check (Session 1.3)
//
// Used by every /api/offers route. Not a function itself: Netlify only treats
// netlify/functions/lib/ as a function if it holds lib.mjs or index.mjs.
//
// How sign-in works
// - One admin password, read from the protected Netlify setting
//   OFFER_ADMIN_PASSWORD. Compared in constant time (both sides hashed first).
// - On success the server sets the cookie yavd_offer_admin: HttpOnly, Secure,
//   SameSite=Strict, Path=/api/offers, 12 hours. Its value is
//     v1.<expires ms>.<random nonce>.<HMAC-SHA256 signature>
//   signed with a key derived from OFFER_SESSION_SECRET AND the password, so
//   changing either setting (and redeploying) signs everyone out.
// - Lockout: 5 wrong tries in 15 minutes locks sign-in for everyone until the
//   oldest of those tries is 15 minutes old. While locked, even the right
//   password is refused. A successful sign-in clears the count.
//
// Why the lockout uses one Blobs key per attempt instead of a counter
// Netlify Blobs has no concurrency control, so a read-add-write counter can
// lose updates. Each attempt instead writes its own new key (onlyIfNew), then
// counts the keys in the window with strong consistency. A burst of parallel
// guesses therefore sees itself and is cut off at the limit. A locked request
// removes its own key, so hammering a locked door does not extend the lock.
//
// Failure behaviour: if the attempt store cannot be read or written, sign-in
// is refused (fail closed). Checking an existing cookie never touches storage,
// so signed-in work keeps going even if Blobs is briefly unavailable.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import { AUTH, storeName } from '../../../shared/offer-contract.js';

/* ---------- settings ---------- */

const TOKEN_VERSION = 'v1';
const COOKIE_PATH = '/api/offers';
const MIN_SECRET_LENGTH = 16;
const ATTEMPT_PREFIX = 'attempt/';
const WRONG_PASSWORD_DELAY_MS = 400;     // small extra cost per wrong guess
/** Store holding sign-in attempts. Not in the frozen contract: an addition
 *  that changes no existing shape. "-test" on every non-production deploy. */
export const AUTH_STORE_BASE = 'offer-auth';

const WINDOW_MS = AUTH.lockoutMinutes * 60 * 1000;
const MAX_AGE_MS = AUTH.maxAgeSeconds * 1000;

/* ---------- small helpers ---------- */

function env(name) {
  const v = globalThis.Netlify?.env?.get?.(name) ?? process.env[name];
  return typeof v === 'string' ? v : '';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sha256(s) {
  return createHash('sha256').update(String(s), 'utf8').digest();
}

/** Constant-time string compare: hashes first so lengths never leak. */
export function safeEqual(a, b) {
  return timingSafeEqual(sha256(a), sha256(b));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shared response headers for every admin API response. */
export const NO_STORE = Object.freeze({
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow'
});

export function json(body, status = 200, extraHeaders = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/* ---------- configuration check ---------- */

/** Returns the settings, or null when sign-in is not safely configured. */
export function authConfig() {
  const password = env(AUTH.passwordEnv);
  const secret = env(AUTH.secretEnv);
  if (password.length < AUTH.minPasswordLength) return null;
  if (secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

/* ---------- signed cookie ---------- */

function signingKey(cfg) {
  return createHmac('sha256', cfg.secret).update('yavd-offer-admin|' + cfg.password, 'utf8').digest();
}

function sign(cfg, payload) {
  return b64url(createHmac('sha256', signingKey(cfg)).update(payload, 'utf8').digest());
}

export function makeToken(cfg, now = Date.now()) {
  const payload = `${TOKEN_VERSION}.${now + MAX_AGE_MS}.${b64url(randomBytes(16))}`;
  return `${payload}.${sign(cfg, payload)}`;
}

/** true only for an unexpired token signed with the current settings. */
export function verifyToken(cfg, token, now = Date.now()) {
  if (!cfg || typeof token !== 'string' || token.length > 200) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return false;
  const exp = Number(parts[1]);
  if (!Number.isSafeInteger(exp) || exp <= now || exp > now + MAX_AGE_MS + 60_000) return false;
  const payload = parts.slice(0, 3).join('.');
  return safeEqual(sign(cfg, payload), parts[3]);
}

export function readCookie(req, name = AUTH.cookie) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export function sessionCookie(token) {
  return `${AUTH.cookie}=${token}; Path=${COOKIE_PATH}; Max-Age=${AUTH.maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearedCookie() {
  return `${AUTH.cookie}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

/* ---------- request checks ---------- */

/** Cross-site guard for state-changing requests: a browser always sends
 *  Origin on a POST; if it is present it must be this site. */
export function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return origin === new URL(req.url).origin; } catch { return false; }
}

/**
 * The one check every admin route runs first.
 * Returns null when the caller is signed in, otherwise the refusal Response.
 *   const refused = requireAdmin(req); if (refused) return refused;
 */
export function requireAdmin(req, { methods } = {}) {
  if (methods && !methods.includes(req.method)) {
    return json({ error: 'Method not allowed' }, 405, { allow: methods.join(', ') });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
    return json({ error: 'Cross-site request refused' }, 403);
  }
  const cfg = authConfig();
  if (!cfg) return json({ error: 'Sign-in is not configured on this deploy' }, 503);
  if (!verifyToken(cfg, readCookie(req))) {
    return json({ error: 'Sign in required' }, 401);
  }
  return null;
}

/* ---------- lockout ---------- */

let storeFactory = (deployContext) =>
  getStore({ name: storeName(AUTH_STORE_BASE, deployContext), consistency: 'strong' });

/** Tests only: swap the Blobs store for an in-memory one. */
export function _setStoreFactoryForTests(fn) { storeFactory = fn; }

function attemptTime(key) {
  return Number(key.slice(ATTEMPT_PREFIX.length).split('-')[0]);
}

/**
 * Records this attempt and decides whether it may be checked.
 * Returns { locked:false, key } or { locked:true, retryAfterSeconds }.
 * Throws if storage fails (caller refuses sign-in).
 */
export async function beginAttempt(store, now = Date.now()) {
  const key = `${ATTEMPT_PREFIX}${now}-${b64url(randomBytes(6))}`;
  await store.set(key, '1', { onlyIfNew: true });
  const { blobs } = await store.list({ prefix: ATTEMPT_PREFIX });
  const live = [];
  const stale = [];
  for (const b of blobs) (now - attemptTime(b.key) < WINDOW_MS ? live : stale).push(b.key);
  // Tidy anything older than the window. Best effort.
  await Promise.all(stale.map((k) => store.delete(k).catch(() => {})));

  // Earlier attempts in the window (not counting this one). Sorted so the
  // count is the same for every request in a burst regardless of list order.
  const earlier = live.filter((k) => k !== key && attemptTime(k) <= now).sort();
  if (earlier.length >= AUTH.lockoutTries) {
    await store.delete(key).catch(() => {});
    const unlockAt = attemptTime(earlier[earlier.length - AUTH.lockoutTries]) + WINDOW_MS;
    return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((unlockAt - now) / 1000)) };
  }
  return { locked: false, key };
}

/** Successful sign-in: clear every recorded attempt. */
export async function clearAttempts(store) {
  const { blobs } = await store.list({ prefix: ATTEMPT_PREFIX });
  await Promise.all(blobs.map((b) => store.delete(b.key).catch(() => {})));
}

/* ---------- the login handler body ---------- */

export async function handleLogin(req, context) {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
  if (!sameOrigin(req)) return json({ error: 'Cross-site request refused' }, 403);
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return json({ error: 'Send JSON: {"password": "..."}' }, 415);
  }
  const cfg = authConfig();
  if (!cfg) return json({ error: 'Sign-in is not configured on this deploy' }, 503);

  let password = '';
  try {
    const raw = await req.text();
    if (raw.length > 2000) return json({ error: 'Request too large' }, 413);
    const body = JSON.parse(raw);
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    return json({ error: 'Send JSON: {"password": "..."}' }, 400);
  }

  let store, attempt;
  try {
    store = storeFactory(context?.deploy?.context);
    attempt = await beginAttempt(store);
  } catch (err) {
    console.error('offers-login: attempt store unavailable', err?.message);
    return json({ error: 'Sign-in is unavailable right now. Try again in a minute.' }, 503);
  }

  if (attempt.locked) {
    const mins = Math.ceil(attempt.retryAfterSeconds / 60);
    return json(
      { error: `Too many wrong passwords. Sign-in is locked for about ${mins} minute${mins === 1 ? '' : 's'}.`,
        locked: true, retryAfterSeconds: attempt.retryAfterSeconds },
      429, { 'retry-after': String(attempt.retryAfterSeconds) }
    );
  }

  if (!password || !safeEqual(password, cfg.password)) {
    await sleep(WRONG_PASSWORD_DELAY_MS);
    return json({ error: 'Wrong password' }, 401);
  }

  try { await clearAttempts(store); } catch (err) {
    console.error('offers-login: could not clear attempts', err?.message);
  }
  return json({ ok: true, expiresInSeconds: AUTH.maxAgeSeconds }, 200,
    { 'set-cookie': sessionCookie(makeToken(cfg)) });
}
