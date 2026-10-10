// YAVD Offers Module: offer validation and rules (Session 1.4)
//
// Pure functions, no storage, no network. Everything a save must pass lives
// here so it can be tested on its own (netlify/tests/offers-rules.test.mjs).
//
// What it does
// - prepareOffer(): takes what the editor sent, keeps only contract keys,
//   turns every text field into plain text, checks every field against
//   shared/offer-contract.js, and fills the server-owned fields (id,
//   previewKey, createdAt, updatedAt). Returns field-level messages Michael
//   can act on.
// - checkRules(): the two scheduling rules (one Everyone offer per page at a
//   time; a link name used by one offer at a time). Only scheduled offers
//   (draft: false) take part: drafts never show to visitors.
//
// Not a function itself: netlify/functions/lib/ holds no lib.mjs or index.mjs.

import { randomBytes, randomUUID } from 'node:crypto';
import {
  AUDIENCES, FIELD_NAMES, FORM_KEYS, OFFER_KEYS, PREVIEW_KEY_LENGTH,
  RESERVED_FIELD_NAMES, TIME_ZONE, emptyOffer, isValidSlug, normalizePagePath,
  offerStatus, rangesOverlap, SLUG_MIN, SLUG_MAX
} from '../../../shared/offer-contract.js';

/* ---------- limits (server-side; the editor shows the same ones) ---------- */

export const LIMITS = Object.freeze({
  name: 120,
  headline: 150,
  body: 3000,
  buttonLabel: 40,
  thanks: 300,
  optionChoice: 80,
  optionChoices: 20,
  extraLabel: 80,
  buttonUrl: 500,
  page: 200
});

/** Pages an offer may never sit on. */
export const BLOCKED_PAGES = Object.freeze(['/offer-admin.html', '/offers-form.html']);

const EXTRA_FIELDS = ['extra_1', 'extra_2', 'extra_3'];
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const PAGE_SHAPE = /^\/(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9._-]*\.html$/;

/* ---------- plain text ---------- */

// Control characters and invisible direction marks (can disguise text).
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const TAG = /<\/?[a-z!?][^<>]*>/gi;

/**
 * Turns any input into plain text. HTML tags are removed (repeatedly, so
 * nested tricks do not survive), invisible characters dropped, line endings
 * made \n. Single-line fields have all whitespace collapsed to one space.
 * Returns { value, stripped } where stripped is true if tags were removed.
 */
export function plainText(input, { multiline = false } = {}) {
  let s = typeof input === 'string' ? input : '';
  s = s.normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE, '');
  let stripped = false;
  for (let i = 0; i < 5; i++) {
    const next = s.replace(TAG, '');
    if (next === s) break;
    stripped = true;
    s = next;
  }
  if (multiline) {
    s = s.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  return { value: s.trim(), stripped };
}

/* ---------- time ---------- */

export function isIsoWithOffset(v) {
  return typeof v === 'string' && ISO_WITH_OFFSET.test(v) && !Number.isNaN(Date.parse(v));
}

const EASTERN = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit'
});
/** "Oct 12, 2026, 12:00 AM ET" for messages. */
export function formatEastern(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? String(iso) : `${EASTERN.format(new Date(t))} ET`;
}

/* ---------- ids and keys ---------- */

export function newId() { return randomUUID(); }

export function newPreviewKey() {
  // base64url has 64 symbols, so 24 random bytes give 32 characters exactly.
  return randomBytes(24).toString('base64url').slice(0, PREVIEW_KEY_LENGTH);
}

/* ---------- page path ---------- */

export function cleanPage(input) {
  if (typeof input !== 'string' || !input.trim()) return { value: '' };
  if (input.length > LIMITS.page || input.includes('..') || input.includes('\\') || /^[a-z]+:/i.test(input.trim()) || input.trim().startsWith('//')) {
    return { value: '', error: 'Pick a page from the list.' };
  }
  const p = normalizePagePath(input.trim());
  if (!PAGE_SHAPE.test(p) || p.includes('//')) return { value: '', error: 'Pick a page from the list.' };
  if (BLOCKED_PAGES.includes(p)) return { value: '', error: 'Offers cannot go on that page.' };
  return { value: p };
}

/* ---------- button link ---------- */

export function cleanButtonUrl(input) {
  if (input === null || input === undefined || (typeof input === 'string' && !input.trim())) return { value: null };
  if (typeof input !== 'string' || input.length > LIMITS.buttonUrl) return { value: null, error: 'Use a web address (https://...) or a page on this site (/page).' };
  const s = input.trim();
  if (s.startsWith('/') && !s.startsWith('//') && !/[\s<>"'\\]/.test(s)) return { value: s };
  try {
    const u = new URL(s);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && !/[\s<>"'\\]/.test(s)) return { value: u.href };
  } catch { /* fall through */ }
  return { value: null, error: 'Use a web address (https://...) or a page on this site (/page).' };
}

/* ---------- the save check ---------- */

/**
 * Builds the offer to store from what the editor sent.
 *
 * @param {object} input       request body (the offer as the editor has it)
 * @param {object} ctx
 * @param {object[]} ctx.offers  every stored offer
 * @param {Date}   [ctx.now]
 * @returns {{ok:true, offer:object, created:boolean, notes:string[]}
 *          | {ok:false, status:number, error:string, fields?:object}}
 */
export function prepareOffer(input, { offers, now = new Date() }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, status: 400, error: 'Send the offer as a JSON object.' };
  }
  const fields = {};
  const notes = [];
  const fail = (k, msg) => { if (!fields[k]) fields[k] = msg; };
  const nowIso = now.toISOString();

  // Existing offer or a new one
  const hasId = typeof input.id === 'string' && input.id !== '';
  const stored = hasId ? offers.find((o) => o.id === input.id) : null;
  if (hasId && !stored) {
    return { ok: false, status: 404, error: 'This offer no longer exists. Reload the dashboard.' };
  }
  if (stored && input.updatedAt !== stored.updatedAt) {
    return { ok: false, status: 409,
      error: `This offer was saved somewhere else at ${formatEastern(stored.updatedAt)}. Reload it before saving, so nothing is lost.` };
  }

  const base = stored ? structuredClone(stored) : emptyOffer();
  const out = {};

  // Plain-text fields
  const text = (key, max, { multiline = false } = {}) => {
    const raw = input[key] === undefined ? base[key] : input[key];
    if (raw !== undefined && raw !== null && typeof raw !== 'string') { fail(key, 'Must be text.'); return ''; }
    const { value, stripped } = plainText(raw ?? '', { multiline });
    if (stripped) notes.push(`HTML was removed from ${key}. Offers are plain text.`);
    if (value.length > max) fail(key, `Keep it to ${max} characters (now ${value.length}).`);
    return value;
  };

  out.name = text('name', LIMITS.name);
  if (!out.name) fail('name', 'Give the offer a name.');
  out.headline = text('headline', LIMITS.headline);
  out.body = text('body', LIMITS.body, { multiline: true });

  // Draft flag
  const draftRaw = input.draft === undefined ? base.draft : input.draft;
  if (typeof draftRaw !== 'boolean') fail('draft', 'Must be true or false.');
  out.draft = draftRaw !== false;
  const scheduling = !out.draft;

  // Audience and slug
  const audience = input.audience === undefined ? base.audience : input.audience;
  if (!AUDIENCES.includes(audience)) fail('audience', 'Choose Link only or Everyone.');
  out.audience = AUDIENCES.includes(audience) ? audience : 'everyone';
  if (out.audience === 'link') {
    const slugRaw = input.slug === undefined ? base.slug : input.slug;
    const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : '';
    if (slug && !isValidSlug(slug)) {
      fail('slug', `Link name: ${SLUG_MIN} to ${SLUG_MAX} lowercase letters, numbers and single hyphens, e.g. group-2026.`);
    } else if (!slug && scheduling) {
      fail('slug', 'A Link only offer needs a link name.');
    }
    out.slug = isValidSlug(slug) ? slug : '';
  } else {
    out.slug = '';
  }

  // Page
  const page = cleanPage(input.page === undefined ? base.page : input.page);
  if (page.error) fail('page', page.error);
  out.page = page.value;

  // Dates
  for (const key of ['startsAt', 'endsAt']) {
    const raw = input[key] === undefined ? base[key] : input[key];
    if (raw === '' || raw === null || raw === undefined) { out[key] = ''; continue; }
    if (!isIsoWithOffset(raw)) { fail(key, 'Use a date and time with its time zone, e.g. 2026-11-30T23:59:00-05:00.'); out[key] = ''; continue; }
    out[key] = raw;
  }
  if (out.startsAt && out.endsAt && Date.parse(out.endsAt) <= Date.parse(out.startsAt)) {
    fail('endsAt', 'The stop time must be after the start time.');
  }

  // Form
  out.form = prepareForm(input.form === undefined ? base.form : input.form, fail, notes);

  // Button link (used when the form is off)
  const btn = cleanButtonUrl(input.buttonUrl === undefined ? base.buttonUrl : input.buttonUrl);
  if (btn.error) fail('buttonUrl', btn.error);
  out.buttonUrl = btn.value;

  // Required before scheduling
  if (scheduling) {
    if (!out.page) fail('page', 'Pick the page this offer sits on.');
    if (!out.headline) fail('headline', 'Write a headline.');
    if (!out.startsAt) fail('startsAt', 'Set a start date.');
    if (!out.endsAt) fail('endsAt', 'Set a stop date.');
    if (out.form.enabled && out.form.fields.length === 0) fail('form.fields', 'Tick at least one field, or turn the form off.');
  }

  // Server-owned fields
  if (stored) {
    out.id = stored.id;
    out.previewKey = stored.previewKey;
    out.rerunOf = stored.rerunOf;
    out.createdAt = stored.createdAt;
  } else {
    let id;
    do { id = newId(); } while (offers.some((o) => o.id === id));
    out.id = id;
    out.previewKey = newPreviewKey();
    out.createdAt = nowIso;
    const rerunOf = input.rerunOf ?? null;
    if (rerunOf !== null && !offers.some((o) => o.id === rerunOf)) fail('rerunOf', 'The offer this reruns no longer exists.');
    out.rerunOf = rerunOf;
  }
  out.updatedAt = nowIso;
  if (stored && out.updatedAt === stored.updatedAt) {
    out.updatedAt = new Date(now.getTime() + 1).toISOString(); // always moves forward
  }

  if (Object.keys(fields).length) {
    return { ok: false, status: 400, error: 'Some fields need attention.', fields };
  }

  const rule = checkRules(out, offers);
  if (rule) return { ok: false, status: 409, error: rule.error, fields: { [rule.field]: rule.error } };

  // Contract key order, nothing extra
  const offer = {};
  for (const k of OFFER_KEYS) offer[k] = out[k];
  return { ok: true, offer, created: !stored, notes: [...new Set(notes)] };
}

function prepareForm(raw, fail, notes) {
  const def = emptyOffer().form;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('form', 'Form settings are missing.');
    return def;
  }
  const f = {};
  f.enabled = raw.enabled === undefined ? def.enabled : raw.enabled;
  if (typeof f.enabled !== 'boolean') { fail('form.enabled', 'Must be true or false.'); f.enabled = true; }

  const list = (v, key) => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) { fail(key, 'Must be a list of field names.'); return []; }
    return [...new Set(v)];
  };
  const fields = list(raw.fields, 'form.fields');
  const badField = fields.find((x) => !FIELD_NAMES.includes(x) || RESERVED_FIELD_NAMES.includes(x));
  if (badField) fail('form.fields', `"${badField}" is not one of the form's fields.`);
  f.fields = FIELD_NAMES.filter((x) => fields.includes(x)); // contract order
  const required = list(raw.required, 'form.required');
  const notShown = required.find((x) => !f.fields.includes(x));
  if (notShown) fail('form.required', `"${notShown}" is marked required but is not shown.`);
  f.required = f.fields.filter((x) => required.includes(x));

  const txt = (v, max, key) => {
    if (v !== undefined && v !== null && typeof v !== 'string') { fail(key, 'Must be text.'); return ''; }
    const { value, stripped } = plainText(v ?? '', { multiline: false });
    if (stripped) notes.push(`HTML was removed from ${key}. Offers are plain text.`);
    if (value.length > max) fail(key, `Keep it to ${max} characters (now ${value.length}).`);
    return value;
  };
  f.buttonLabel = txt(raw.buttonLabel === undefined ? def.buttonLabel : raw.buttonLabel, LIMITS.buttonLabel, 'form.buttonLabel') || def.buttonLabel;

  const choicesRaw = raw.optionChoices === undefined ? [] : raw.optionChoices;
  if (!Array.isArray(choicesRaw)) { fail('form.optionChoices', 'Must be a list.'); f.optionChoices = []; }
  else {
    f.optionChoices = [...new Set(choicesRaw.map((c, i) => txt(c, LIMITS.optionChoice, `form.optionChoices[${i}]`)).filter(Boolean))];
    if (f.optionChoices.length > LIMITS.optionChoices) fail('form.optionChoices', `Up to ${LIMITS.optionChoices} choices.`);
  }
  if (f.enabled && f.fields.includes('option_choice') && f.optionChoices.length === 0) {
    fail('form.optionChoices', 'The "Choose one" field needs at least one choice.');
  }

  const labelsRaw = raw.extraLabels === undefined ? {} : raw.extraLabels;
  f.extraLabels = {};
  if (labelsRaw === null || typeof labelsRaw !== 'object' || Array.isArray(labelsRaw)) fail('form.extraLabels', 'Labels are missing.');
  else {
    for (const k of EXTRA_FIELDS) {
      const v = txt(labelsRaw[k], LIMITS.extraLabel, `form.extraLabels.${k}`);
      if (v) f.extraLabels[k] = v;
    }
  }
  for (const k of EXTRA_FIELDS) {
    if (f.enabled && f.fields.includes(k) && !f.extraLabels[k]) fail(`form.extraLabels.${k}`, `Give the spare field ${k.slice(-1)} a label.`);
  }

  f.thanks = txt(raw.thanks === undefined ? def.thanks : raw.thanks, LIMITS.thanks, 'form.thanks') || def.thanks;

  const out = {};
  for (const k of FORM_KEYS) out[k] = f[k];
  return out;
}

/* ---------- scheduling rules ---------- */

/**
 * Returns null when the offer may be saved, or { field, error } naming the
 * offer it clashes with. Drafts never clash.
 */
export function checkRules(offer, offers) {
  if (offer.draft) return null;
  const others = offers.filter((o) => o.id !== offer.id && !o.draft);
  const overlapping = (o) => rangesOverlap(offer.startsAt, offer.endsAt, o.startsAt, o.endsAt);
  const when = (o) => `from ${formatEastern(o.startsAt)} to ${formatEastern(o.endsAt)}`;

  if (offer.audience === 'everyone') {
    const clash = others.find((o) => o.audience === 'everyone' && o.page === offer.page && overlapping(o));
    if (clash) {
      return { field: 'startsAt', error:
        `${offer.page} already has an Everyone offer, "${clash.name}", ${when(clash)}. `
        + 'Only one Everyone offer can run on a page at a time. Change the dates, or make one of them Link only.' };
    }
  }
  if (offer.audience === 'link' && offer.slug) {
    const clash = others.find((o) => o.slug === offer.slug && overlapping(o));
    if (clash) {
      return { field: 'slug', error:
        `The link /offer/${offer.slug} is already used by "${clash.name}" ${when(clash)}. `
        + 'Pick another link name, or change the dates so they do not overlap.' };
    }
  }
  return null;
}

/** The list the dashboard reads: each stored offer plus its worked-out status. */
export function withStatus(offers, now = new Date()) {
  return offers.map((o) => ({ ...o, status: offerStatus(o, now) }));
}

/* ---------- request body ---------- */

export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Reads a JSON request body. JSON only (a browser must preflight it from any
 * other site), size-capped. Returns { body } or { error, status }.
 */
export async function readJson(req) {
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, error: 'Send JSON (content-type: application/json).' };
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return { status: 413, error: 'That is too large to save. Shorten the offer copy.' };
  try { return { body: JSON.parse(raw) }; } catch { return { status: 400, error: 'That was not valid JSON.' }; }
}
