// YAVD Offers Module: landing page validation and rules (Session 4.2, contract 1.4.0)
//
// Pure functions, no storage, no network. Everything a landing save must pass
// lives here so it can be tested on its own (netlify/tests/landings-rules.test.mjs).
// Same shape and behaviour as prepareOffer() in offers-rules.mjs, which this
// file reuses (plainText, cleanButtonUrl, MARKUP_FACTOR, ids) but never edits.
//
// What it does
// - prepareLanding(): takes what the editor sent, keeps only LANDING_KEYS,
//   turns every text field into plain text (eyebrow, headline and body keep
//   the offer formatting tags), checks every field, enforces the status
//   transitions and the slug rules (unique, locked once the page has been
//   Live), and fills the server-owned fields (id, previewKey, createdAt,
//   updatedAt, archivedAt). Returns field-level messages Michael can act on.
//
// Not a function itself: netlify/functions/lib/ holds no lib.mjs or index.mjs.

import {
  IMAGE, IMAGE_KEYS, LANDING, LANDING_KEYS, LANDING_MESSAGES, SLUG_MAX, SLUG_MIN, isValidSlug
} from '../../../shared/offer-contract.js';
import { normalizeMarkup, plainFromMarkup } from '../../../shared/offer-format.js';
import { IMAGE_MESSAGES } from './offer-image.mjs';
import {
  LIMITS as OFFER_LIMITS, MARKUP_FACTOR, cleanButtonUrl, formatEastern, newId, newPreviewKey, plainText
} from './offers-rules.mjs';

/* ---------- limits (the offer popup's text limits, plus the call to action) ---------- */

export const LANDING_LIMITS = Object.freeze({
  name: OFFER_LIMITS.name,
  eyebrow: OFFER_LIMITS.eyebrow,
  headline: OFFER_LIMITS.headline,
  body: OFFER_LIMITS.body,
  ctaLabel: LANDING.ctaLabelMax,
  ctaUrl: LANDING.ctaUrlMax
});

/** Allowed status changes on a save. Staying in the same status is always allowed. */
export const STATUS_MOVES = Object.freeze({
  draft: Object.freeze(['live']),
  live: Object.freeze(['archived']),
  archived: Object.freeze(['live'])
});

export const LANDING_RULE_MESSAGES = Object.freeze({
  notObject: 'Send the landing page as a JSON object.',
  name: 'Give the landing page a name.',
  slug: `Address name: ${SLUG_MIN} to ${SLUG_MAX} lowercase letters, numbers and single hyphens, e.g. group-2026.`,
  slugLocked: 'The address is locked because this page has been Live. Changing it would break links.',
  status: 'Choose Draft, Live or Archived.',
  newArchived: 'A new landing page starts as Draft or Live.',
  headline: 'Write a headline.',
  body: 'Write the page copy.',
  ctaLabel: 'Write the button label.',
  ctaUrlMissing: 'Add the button link.'
});

/* ---------- call to action link ---------- */

/**
 * https:// address or a same-site path ("/page"), nothing else. Uses the
 * offer button rules (cleanButtonUrl) and then also refuses http://, because
 * a landing call to action allows https only.
 */
export function cleanCtaUrl(input) {
  if (input === null || input === undefined || (typeof input === 'string' && !input.trim())) return { value: null };
  if (typeof input !== 'string' || input.length > LANDING.ctaUrlMax) return { value: null, error: LANDING_MESSAGES.ctaUrl };
  const r = cleanButtonUrl(input);
  if (r.error || r.value === null) return { value: null, error: LANDING_MESSAGES.ctaUrl };
  if (!r.value.startsWith('/') && !r.value.startsWith('https://')) return { value: null, error: LANDING_MESSAGES.ctaUrl };
  return { value: r.value };
}

/* ---------- the save check ---------- */

/**
 * Builds the landing record to store from what the editor sent.
 *
 * @param {object} input         request body (the landing as the editor has it)
 * @param {object} ctx
 * @param {object[]} ctx.landings  every stored landing
 * @param {Date}   [ctx.now]
 * @param {Map<string,object>|object} [ctx.images]  picture id -> stored metadata
 *        ({ type, bytes, width, height }) for the picture this save asks for,
 *        looked up by the route. Not needed when the picture is unchanged.
 * @returns {{ok:true, landing:object, created:boolean, notes:string[]}
 *          | {ok:false, status:number, error:string, fields?:object}}
 */
export function prepareLanding(input, { landings = [], now = new Date(), images = new Map() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, status: 400, error: LANDING_RULE_MESSAGES.notObject };
  }
  const all = Array.isArray(landings) ? landings : [];
  const fields = {};
  const notes = [];
  const fail = (k, msg) => { if (!fields[k]) fields[k] = msg; };
  const nowIso = now.toISOString();

  // Existing landing or a new one
  const hasId = typeof input.id === 'string' && input.id !== '';
  const stored = hasId ? all.find((l) => l && l.id === input.id) : null;
  if (hasId && !stored) {
    return { ok: false, status: 404, error: LANDING_MESSAGES.gone };
  }
  if (stored && input.updatedAt !== stored.updatedAt) {
    return { ok: false, status: 409,
      error: `This landing page was saved somewhere else at ${formatEastern(stored.updatedAt)}. Reload it before saving, so nothing is lost.` };
  }

  const base = stored ? structuredClone(stored) : {};
  const pick = (key) => (input[key] === undefined ? base[key] : input[key]);
  const out = {};

  // Plain-text fields
  const text = (key, max) => {
    const raw = pick(key);
    if (raw !== undefined && raw !== null && typeof raw !== 'string') { fail(key, 'Must be text.'); return ''; }
    const { value, stripped } = plainText(raw ?? '', { multiline: false });
    if (stripped) notes.push(`HTML was removed from ${key}. Landing pages are plain text.`);
    if (value.length > max) fail(key, `Keep it to ${max} characters (now ${value.length}).`);
    return value;
  };

  // Formatted fields: plain text plus the offer formatting tags (shared/offer-format.js).
  const formatted = (key, max, { multiline = false } = {}) => {
    const raw = pick(key) ?? '';
    if (typeof raw !== 'string') { fail(key, 'Must be text.'); return ''; }
    const { value, stripped } = plainText(raw, { multiline });
    if (stripped) notes.push(`HTML was removed from ${key}. Use the formatting buttons instead.`);
    const markup = normalizeMarkup(value);
    const words = plainFromMarkup(markup);
    if (!words.trim()) return '';
    if (words.length > max) fail(key, `Keep it to ${max} characters (now ${words.length}).`);
    else if (markup.length > max * MARKUP_FACTOR) fail(key, 'Too much formatting in this field. Clear some of it and try again.');
    return markup;
  };

  out.name = text('name', LANDING_LIMITS.name);
  if (!out.name) fail('name', LANDING_RULE_MESSAGES.name);
  out.eyebrow = formatted('eyebrow', LANDING_LIMITS.eyebrow);
  out.headline = formatted('headline', LANDING_LIMITS.headline);
  out.body = formatted('body', LANDING_LIMITS.body, { multiline: true });

  // Status and its transitions
  const fromStatus = stored ? stored.status : null;
  let status = pick('status');
  if (status === undefined || status === null || status === '') status = stored ? stored.status : 'draft';
  if (!LANDING.statuses.includes(status)) {
    fail('status', LANDING_RULE_MESSAGES.status);
    status = LANDING.statuses.includes(fromStatus) ? fromStatus : 'draft';
  } else if (!stored && status === 'archived') {
    fail('status', LANDING_RULE_MESSAGES.newArchived);
  } else if (stored && status !== fromStatus && !(STATUS_MOVES[fromStatus] || []).includes(status)) {
    fail('status', moveMessage(fromStatus, status));
  }
  out.status = status;

  // Slug: required always, unique (checked below), locked once the page has been Live
  const slugRaw = pick('slug');
  const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : '';
  const locked = !!stored && stored.status !== 'draft';
  if (locked && slug !== stored.slug) {
    fail('slug', LANDING_RULE_MESSAGES.slugLocked);
    out.slug = stored.slug;
  } else if (!isValidSlug(slug)) {
    fail('slug', LANDING_RULE_MESSAGES.slug);
    out.slug = '';
  } else {
    out.slug = slug;
  }

  // Picture (1.3.0 OfferImage shape, placement always 'top'). Absent keeps the stored one, null removes it.
  out.image = prepareImage(input.image === undefined ? (base.image ?? null) : input.image,
    stored?.image ?? null, images, fail, notes);

  // Call to action
  out.ctaLabel = text('ctaLabel', LANDING_LIMITS.ctaLabel);
  const cta = cleanCtaUrl(pick('ctaUrl'));
  if (cta.error) fail('ctaUrl', cta.error);
  out.ctaUrl = cta.value;

  // Required to be Live (a draft may be incomplete except name and slug)
  if (out.status === 'live') {
    if (!out.headline) fail('headline', LANDING_RULE_MESSAGES.headline);
    if (!out.body) fail('body', LANDING_RULE_MESSAGES.body);
    if (!out.ctaLabel) fail('ctaLabel', LANDING_RULE_MESSAGES.ctaLabel);
    if (!out.ctaUrl && !fields.ctaUrl) fail('ctaUrl', LANDING_RULE_MESSAGES.ctaUrlMissing);
  }

  // Server-owned fields
  if (stored) {
    out.id = stored.id;
    out.previewKey = stored.previewKey;
    out.createdAt = stored.createdAt;
  } else {
    let id;
    do { id = newId(); } while (all.some((l) => l && l.id === id));
    out.id = id;
    out.previewKey = newPreviewKey();
    out.createdAt = nowIso;
  }
  if (out.status === 'archived') out.archivedAt = fromStatus === 'archived' ? (stored.archivedAt ?? nowIso) : nowIso;
  else out.archivedAt = null;
  out.updatedAt = nowIso;
  if (stored && out.updatedAt === stored.updatedAt) {
    out.updatedAt = new Date(now.getTime() + 1).toISOString(); // always moves forward
  }

  if (Object.keys(fields).length) {
    return { ok: false, status: 400, error: 'Some fields need attention.', fields };
  }

  // Slug unique among all landings, archived ones included (case-insensitive)
  const clash = all.find((l) => l && l.id !== out.id && typeof l.slug === 'string' && l.slug.toLowerCase() === out.slug);
  if (clash) {
    return { ok: false, status: 409, error: LANDING_MESSAGES.slugTaken, fields: { slug: LANDING_MESSAGES.slugTaken } };
  }

  // Contract key order, nothing extra
  const landing = {};
  for (const k of LANDING_KEYS) landing[k] = out[k];
  return { ok: true, landing, created: !stored, notes: [...new Set(notes)] };
}

function moveMessage(from, to) {
  if (to === 'draft') return 'A page that has been Live cannot go back to Draft. Archive it instead.';
  if (from === 'draft' && to === 'archived') return 'A draft cannot be archived. Make it Live first, or leave it as a draft.';
  return LANDING_RULE_MESSAGES.status;
}

/**
 * The hero picture. Every fact about the file comes from storage, never from
 * the browser: the stored landing's own picture when the id is unchanged,
 * otherwise `images` (looked up by the route). Unknown id is "gone".
 * Placement is always 'top' on a landing page, whatever was sent.
 */
function prepareImage(raw, storedImage, images, fail, notes) {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) { fail('image.id', IMAGE_MESSAGES.gone); return null; }

  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!IMAGE.idPattern.test(id)) { fail('image.id', IMAGE_MESSAGES.gone); return null; }

  let alt = '';
  if (raw.alt !== undefined && raw.alt !== null && typeof raw.alt !== 'string') fail('image.alt', 'Must be text.');
  else {
    const t = plainText(raw.alt ?? '', { multiline: false });
    if (t.stripped) notes.push('HTML was removed from image.alt. Picture descriptions are plain text.');
    alt = t.value;
    if (!alt) fail('image.alt', LANDING_MESSAGES.alt);
    else if (alt.length > IMAGE.altMax) fail('image.alt', `Keep it to ${IMAGE.altMax} characters (now ${alt.length}).`);
  }

  const facts = storedImage && storedImage.id === id
    ? storedImage
    : (images instanceof Map ? images.get(id) : images?.[id]);
  if (!facts) { fail('image.id', IMAGE_MESSAGES.gone); return null; }

  const all = { id, alt, placement: 'top', width: facts.width, height: facts.height, type: facts.type, bytes: facts.bytes };
  const out = {};
  for (const k of IMAGE_KEYS) out[k] = all[k];
  return out;
}
