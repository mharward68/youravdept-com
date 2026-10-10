/**
 * YAVD Offers Module: frozen contract
 * Frozen in Session 1.1 on 2026-10-10. Changing anything in this file is a
 * plan revision that goes back to Michael first. Adding a helper that does
 * not change an existing shape is not.
 * 1.1.0 (2026-10-10, approved by Michael after Session 1.4): added
 * ROUTES.apiRestore. Additive; no existing shape changed.
 *
 * Pure ES module, no imports, no secrets. It is loaded by:
 *   - Netlify Functions   (netlify/functions/*.mjs, Node)
 *   - Netlify Edge Functions (netlify/edge-functions/*.js, Deno)
 *   - the browser          (popup and admin scripts)
 * deploy.ps1 publishes this file as a static asset, which is intended:
 * nothing in it is private.
 */

export const CONTRACT_VERSION = '1.1.0';

/* ---------- ADDRESSES ---------- */

export const ROUTES = Object.freeze({
  offerLink:   '/offer/:slug',            // edge function offer-link
  preview:     '/offer/:slug?preview=:key',
  admin:       '/offer-admin',            // static page, no data without sign-in
  apiLogin:    '/api/offers/login',       // POST {password}  -> sets cookie
  apiLogout:   '/api/offers/logout',      // POST
  apiOffers:   '/api/offers',             // GET list all, POST create or update one
  apiDelete:   '/api/offers/delete',      // POST {id}  drafts only
  apiExport:   '/api/offers/export',      // GET all offers as one JSON file
  apiPages:    '/api/offers/pages',       // GET list of site pages for the dropdown
  apiRestore:  '/api/offers/restore'      // GET saved versions, newest first; POST {key} puts one back
});

export const OFFER_LINK_PREFIX = '/offer/';
export const PREVIEW_PARAM = 'preview';

/* ---------- OFFER RECORD ---------- */

export const AUDIENCES = Object.freeze(['link', 'everyone']);
export const STATUSES  = Object.freeze(['draft', 'upcoming', 'running', 'expired']);

/** a-z 0-9 hyphen, 3 to 60 chars, no leading, trailing or double hyphen */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
export const PREVIEW_KEY_LENGTH = 32;
export const TIME_ZONE = 'America/New_York';
export const DEFAULT_START_TIME = '00:00';   // 12:00 AM Eastern
export const DEFAULT_END_TIME   = '23:59';   // 11:59 PM Eastern

/**
 * @typedef {Object} OfferForm
 * @property {boolean}  enabled
 * @property {string[]} fields         from FIELD_NAMES
 * @property {string[]} required       subset of fields
 * @property {string}   buttonLabel
 * @property {string[]} optionChoices  choices for option_choice
 * @property {{extra_1?:string, extra_2?:string, extra_3?:string}} extraLabels
 * @property {string}   thanks
 *
 * @typedef {Object} Offer
 * @property {string}  id          random, never changes, never reused
 * @property {string}  name        shown on dashboard and in alerts
 * @property {string}  slug        required when audience is "link"; "" otherwise
 * @property {string}  page        canonical page path, e.g. "/booth-proof.html"
 * @property {'link'|'everyone'} audience
 * @property {string}  headline    plain text
 * @property {string}  body        plain text, line breaks kept
 * @property {OfferForm} form
 * @property {string|null} buttonUrl  used only when form.enabled is false
 * @property {string}  startsAt    ISO time with offset, entered as Eastern
 * @property {string}  endsAt      ISO time with offset, entered as Eastern
 * @property {boolean} draft
 * @property {string}  previewKey  random, PREVIEW_KEY_LENGTH chars
 * @property {string|null} rerunOf
 * @property {string}  createdAt   ISO
 * @property {string}  updatedAt   ISO
 */

export const OFFER_KEYS = Object.freeze([
  'id', 'name', 'slug', 'page', 'audience', 'headline', 'body', 'form',
  'buttonUrl', 'startsAt', 'endsAt', 'draft', 'previewKey', 'rerunOf',
  'createdAt', 'updatedAt'
]);
export const FORM_KEYS = Object.freeze([
  'enabled', 'fields', 'required', 'buttonLabel', 'optionChoices',
  'extraLabels', 'thanks'
]);

/** A blank offer with every key present. Ids and keys are filled by the server. */
export function emptyOffer() {
  return {
    id: '', name: '', slug: '', page: '', audience: 'everyone',
    headline: '', body: '',
    form: {
      enabled: true, fields: ['name', 'email'], required: ['name', 'email'],
      buttonLabel: 'Send', optionChoices: [], extraLabels: {},
      thanks: 'Thank you. Michael will be in touch shortly.'
    },
    buttonUrl: null, startsAt: '', endsAt: '', draft: true,
    previewKey: '', rerunOf: null, createdAt: '', updatedAt: ''
  };
}

/* ---------- STATUS (worked out, never stored) ---------- */

/**
 * @param {Offer} offer
 * @param {Date}  [now]
 * @returns {'draft'|'upcoming'|'running'|'expired'}
 */
export function offerStatus(offer, now = new Date()) {
  if (offer.draft) return 'draft';
  const t = now.getTime();
  if (t < Date.parse(offer.startsAt)) return 'upcoming';
  if (t > Date.parse(offer.endsAt))   return 'expired';
  return 'running';
}

/* ---------- RULES ---------- */

export const RULES = Object.freeze([
  'One Everyone offer per page at any moment. Save is refused on overlap.',
  'Link offers may overlap anything.',
  'A slug may be reused only by an offer whose dates do not overlap another offer on that slug.',
  'A link offer beats an Everyone offer. One popup per page view.',
  'Out of dates, or unknown slug: 302 to the offer page, or to / if the slug is unknown.',
  'Storage unreadable: serve the normal page. Never an error.',
  'Drafts never show to visitors; only a valid preview key shows a draft.'
]);
export const OUT_OF_DATES_STATUS = 302;
export const UNKNOWN_SLUG_TARGET = '/';

/** true when two [start, end] ISO ranges share any moment */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return Date.parse(aStart) <= Date.parse(bEnd) && Date.parse(bStart) <= Date.parse(aEnd);
}

export function isValidSlug(slug) {
  return typeof slug === 'string'
    && slug.length >= SLUG_MIN && slug.length <= SLUG_MAX
    && SLUG_PATTERN.test(slug);
}

/**
 * Pages are reachable at more than one address on this site
 * (/booth-proof and /booth-proof.html via _redirects; / and /index.html;
 * /library/ and /library/index.html). Offers store the canonical form,
 * and the edge function compares requests through this function.
 *   "/"                   -> "/index.html"
 *   "/booth-proof"        -> "/booth-proof.html"
 *   "/library/"           -> "/library/index.html"
 *   "/Booth-Proof.html/"  -> "/booth-proof.html"
 */
export function normalizePagePath(path) {
  let p = String(path || '/').split('?')[0].split('#')[0].toLowerCase();
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/')) {
    p = p.length > 1 && p.slice(0, -1).endsWith('.html') ? p.slice(0, -1) : p + 'index.html';
  }
  if (!p.endsWith('.html')) p += '.html';
  return p;
}

/* ---------- NETLIFY FORM ---------- */

export const FORM_NAME = 'offers';

export const HIDDEN_FIELDS = Object.freeze([
  'form-name', 'subject', 'offer_name', 'offer_slug', 'offer_id', 'is_test', 'bot-field'
]);

export const FIELD_NAMES = Object.freeze([
  'name', 'title', 'email', 'phone', 'company', 'org_type',
  'show_name', 'show_dates', 'show_city', 'exhibitor_count',
  'option_choice', 'heard_from', 'message',
  'extra_1', 'extra_2', 'extra_3'
]);

export const EXTRA_LABEL_FIELDS = Object.freeze(['extra_1_label', 'extra_2_label', 'extra_3_label']);

/** Every name the blueprint form must register with Netlify. */
export const ALL_FORM_FIELDS = Object.freeze([...HIDDEN_FIELDS, ...FIELD_NAMES, ...EXTRA_LABEL_FIELDS]);

/**
 * Never use these as field names on the offers form. netlify/functions/
 * submission-created.mjs runs on EVERY form submission and emails a guide PDF
 * when it sees a "guide" field.
 */
export const RESERVED_FIELD_NAMES = Object.freeze(['guide']);

export const FIELD_LABELS = Object.freeze({
  name: 'Name', title: 'Title', email: 'Email', phone: 'Phone',
  company: 'Company or organization', org_type: 'Organization type',
  show_name: 'Show name', show_dates: 'Show dates', show_city: 'Show city',
  exhibitor_count: 'Expected exhibitor count', option_choice: 'Choose one',
  heard_from: 'How did you hear about this?', message: 'Message',
  extra_1: 'Extra 1', extra_2: 'Extra 2', extra_3: 'Extra 3'
});

export function alertSubject(offerName, isTest) {
  return `${isTest ? 'TEST' : 'New'} offer lead: ${offerName}`;
}

/* ---------- STORAGE (Netlify Blobs) ---------- */

export const STORES = Object.freeze({ offers: 'offers', stats: 'offer-stats' });
export const KEYS = Object.freeze({
  all: 'all',                                  // every offer, one JSON array
  history: (isoTime) => `history/${isoTime}`,  // previous versions
  historyPrefix: 'history/',
  stats: (id) => id                            // { views, leads }
});
export const HISTORY_KEEP = 20;
export const CACHE_SECONDS = 60;               // edge lookups cached up to a minute

/**
 * Site-wide Blobs stores are shared by every deploy, including preview
 * deploys. Production reads the base name; every other deploy context gets a
 * "-test" store so preview testing never leaves data in the live store.
 * The exact context string Netlify reports for a CLI draft deploy is
 * confirmed in Session 1.2.
 */
export function storeName(base, deployContext) {
  return deployContext === 'production' ? base : `${base}-test`;
}

/** @typedef {{views:number, leads:number}} OfferStats */

/* ---------- SIGN-IN ---------- */

export const AUTH = Object.freeze({
  passwordEnv: 'OFFER_ADMIN_PASSWORD',
  secretEnv: 'OFFER_SESSION_SECRET',
  cookie: 'yavd_offer_admin',          // signed, HttpOnly, Secure, SameSite=Strict
  maxAgeSeconds: 12 * 60 * 60,
  lockoutTries: 5,
  lockoutMinutes: 15,
  minPasswordLength: 12
});

/* ---------- VISITOR BROWSER ---------- */

export const VISITOR = Object.freeze({
  closedKeyPrefix: 'yavd_offer_closed_',   // + offer id, value = time closed
  closedDays: 7,
  openDelayMs: 1500
});

/* ---------- PAGE INJECTION ---------- */

/**
 * The edge function adds one JSON block and two asset tags before </body>.
 * The JSON holds only what the popup needs; never previewKey or history.
 */
export const INJECT = Object.freeze({
  dataElementId: 'yavd-offer-data',        // <script type="application/json" id=...>
  css: '/assets/offer-panel.css',
  js: '/assets/offer-panel.js'
});
export const PUBLIC_OFFER_KEYS = Object.freeze([
  'id', 'name', 'slug', 'headline', 'body', 'form', 'buttonUrl'
]);

/**
 * Shape of the injected JSON block:
 *   { v: CONTRACT_VERSION, isTest: boolean, offer: <PUBLIC_OFFER_KEYS only> }
 * Written with every "<" escaped as < so offer text cannot close the tag.
 */
export function publicPayload(offer, isTest) {
  const pub = {};
  for (const k of PUBLIC_OFFER_KEYS) pub[k] = offer[k];
  return { v: CONTRACT_VERSION, isTest: !!isTest, offer: pub };
}
export function payloadToScriptJson(payload) {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
