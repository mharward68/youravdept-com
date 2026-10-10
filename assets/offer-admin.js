// YAVD Offers Module: admin dashboard (Session 1.7) and offer editor,
// rerun, live preview and saved versions (Session 1.8), views and leads
// counts on each card (Session 1.9)
//
// Sign-in state: the cookie is HttpOnly and scoped to /api/offers, so this
// page cannot see it. It asks GET /api/offers: 200 = signed in, 401 = show
// the sign-in form. The page itself never holds offer data until then, and
// sign-out empties every container.
//
// All offer text goes into the page with textContent only. No alert(),
// confirm() or prompt() anywhere. Keep this file ASCII (use \u escapes).
//
// The server is the judge of every rule. The editor sends the offer record
// as the contract defines it and shows the server's field messages next to
// the field they concern.

import {
  ROUTES, TIME_ZONE, OFFER_LINK_PREFIX, PREVIEW_PARAM, offerStatus, emptyOffer,
  FIELD_NAMES, FIELD_LABELS, SLUG_MIN, SLUG_MAX, isValidSlug,
  DEFAULT_START_TIME, DEFAULT_END_TIME, INJECT, normalizePagePath
} from '/shared/offer-contract.js';

const $ = (id) => document.getElementById(id);
const el = {
  loading: $('oa-loading'), signin: $('oa-signin'), form: $('oa-signin-form'),
  password: $('oa-password'), signinMsg: $('oa-signin-msg'), signinBtn: $('oa-signin-btn'),
  signinNote: $('oa-signin-note'), error: $('oa-error'), errorText: $('oa-error-text'),
  retry: $('oa-retry'), dash: $('oa-dash'), groups: $('oa-groups'), summary: $('oa-summary'),
  actions: $('oa-actions'), store: $('oa-store'), refresh: $('oa-refresh'),
  exportBtn: $('oa-export'), signout: $('oa-signout'), toast: $('oa-toast'),
  newBtn: $('oa-new'), versionsBtn: $('oa-versions-btn'),
  editor: $('oa-editor'), versions: $('oa-versions')
};

const GROUPS = [
  { status: 'running',  title: 'Running',  empty: 'Nothing is running right now.' },
  { status: 'upcoming', title: 'Upcoming', empty: 'Nothing is scheduled to start.' },
  { status: 'draft',    title: 'Draft',    empty: 'No drafts.' },
  { status: 'expired',  title: 'Expired',  empty: 'No expired offers yet.' }
];
const TICK_MS = 30 * 1000;

let offers = [];
let clockSkew = 0;      // server time minus browser time, ms
let storeName = '';
let tickTimer = null;
let lastStatuses = '';
// Session 1.9: { "<id>": { views, leads } } from GET /api/offers/stats.
// null = not loaded yet; statsFailed = the last read failed.
const STATS_PATH = '/api/offers/stats';   // route set in netlify/functions/offers-stats.mjs
let stats = null;
let statsFailed = false;

/* ---------- small helpers ---------- */

let view = 'loading';
function show(which) {
  view = which;
  for (const k of ['loading', 'signin', 'error', 'dash', 'editor', 'versions']) el[k].hidden = k !== which;
  const signedIn = ['dash', 'editor', 'versions'].includes(which);
  el.actions.hidden = !signedIn;
  // In the editor and the versions list only Sign out stays in the top bar.
  for (const b of [el.newBtn, el.refresh, el.versionsBtn, el.exportBtn]) b.hidden = which !== 'dash';
  el.store.hidden = !signedIn || !storeName;
}

function now() { return new Date(Date.now() + clockSkew); }

function make(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

let toastTimer = null;
function toast(text, bad = false) {
  el.toast.textContent = text;
  el.toast.classList.toggle('is-bad', bad);
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin', cache: 'no-store', ...opts,
    headers: { accept: 'application/json', ...(opts.headers || {}) }
  });
  let body = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json') && !(res.headers.get('content-disposition') || '').includes('attachment')) {
    try { body = await res.json(); } catch { body = null; }
  }
  return { res, body };
}

/* ---------- time wording (Eastern) ---------- */

const FMT_DAY = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const FMT_TIME = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });

function eastern(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${FMT_DAY.format(d)}, ${FMT_TIME.format(d)}`;
}

function dateRange(o) {
  if (!o.startsAt && !o.endsAt) return 'No dates set';
  const a = o.startsAt ? eastern(o.startsAt) : 'no start';
  const b = o.endsAt ? eastern(o.endsAt) : 'no stop';
  return `${a} to ${b} ET`;
}

/** "3 days", "5 h 12 min", "8 min", "less than a minute" */
function span(ms) {
  const m = Math.floor(Math.abs(ms) / 60000);
  if (m < 1) return 'less than a minute';
  const d = Math.floor(m / 1440);
  if (d >= 2) return `${d} days`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h >= 1) return `${h} h ${mm} min`;
  return `${mm} min`;
}

function whenLine(o, status, t) {
  const start = Date.parse(o.startsAt);
  const end = Date.parse(o.endsAt);
  if (status === 'running') return Number.isNaN(end) ? 'Running' : `Ends in ${span(end - t)}`;
  if (status === 'upcoming') return `Starts in ${span(start - t)}`;
  if (status === 'expired') return `Ended ${span(t - end)} ago`;
  return o.updatedAt ? `Last edited ${eastern(o.updatedAt)} ET` : 'Draft';
}

/* ---------- links ---------- */

function linkPath(o) {
  if (o.audience === 'link' && o.slug) return OFFER_LINK_PREFIX + o.slug;
  return o.page ? o.page.replace(/\/index\.html$/, '/') : '';
}

function previewPath(o) {
  // Everyone offers preview at /offer/preview?preview=<key> (Session 1.5 decision).
  const slug = o.audience === 'link' && o.slug ? o.slug : 'preview';
  return `${OFFER_LINK_PREFIX}${encodeURIComponent(slug)}?${PREVIEW_PARAM}=${encodeURIComponent(o.previewKey || '')}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = make('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

/* ---------- rendering ---------- */

function sortFor(status) {
  const t = (iso) => Date.parse(iso) || 0;
  if (status === 'running') return (a, b) => t(a.endsAt) - t(b.endsAt);     // ending soonest first
  if (status === 'upcoming') return (a, b) => t(a.startsAt) - t(b.startsAt); // starting soonest first
  if (status === 'expired') return (a, b) => t(b.endsAt) - t(a.endsAt);     // most recently ended first
  return (a, b) => t(b.updatedAt) - t(a.updatedAt);                          // drafts: last edited first
}

function metaRow(dl, label, valueNode) {
  dl.append(make('dt', null, label));
  const dd = make('dd');
  if (typeof valueNode === 'string') dd.textContent = valueNode; else dd.append(valueNode);
  dl.append(dd);
}

/* Session 1.9: "12 views \u00b7 3 leads (25% of views)". Drafts that never ran show nothing. */
function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }
function countsLine(o, status) {
  const s = stats && stats[o.id];
  if (status === 'draft' && !(s && (s.views || s.leads))) return '';
  if (stats === null) return statsFailed ? 'Counts unavailable right now' : 'Counting\u2026';
  if (status === 'upcoming' && !(s && (s.views || s.leads))) return 'Counts start when it runs';
  const v = s ? s.views : 0;
  const l = s ? s.leads : 0;
  const rate = v > 0 ? ` (${Math.round((l / v) * 100)}% of views)` : '';
  return `${plural(v, 'view')} \u00b7 ${plural(l, 'lead')}${rate}`;
}

async function loadStats() {
  let out = null;
  try { out = await api(STATS_PATH); } catch { out = null; }
  if (out && out.res.status === 401) return;          // the next load() shows sign-in
  if (out && out.res.ok && out.body && out.body.stats && typeof out.body.stats === 'object') {
    stats = out.body.stats;
    statsFailed = false;
  } else {
    stats = null;
    statsFailed = true;
  }
  if (view === 'dash') render();
}

function card(o, status, t) {
  const c = make('article', `oa-card is-${status}`);
  c.dataset.id = o.id;
  c.dataset.status = status;

  const top = make('div', 'oa-card-top');
  top.append(make('h3', null, o.name || '(no name)'), make('span', 'oa-pill', status));
  c.append(top);
  c.append(make('div', 'oa-when', whenLine(o, status, t)));

  const dl = make('dl', 'oa-meta');
  metaRow(dl, 'Page', make('code', null, o.page || '(not set)'));
  metaRow(dl, 'Audience', o.audience === 'link' ? 'Private link only' : 'Everyone on the page');
  const lp = linkPath(o);
  metaRow(dl, 'Link', lp ? make('code', null, lp) : 'Not set yet');
  metaRow(dl, 'Dates', dateRange(o));
  const counts = countsLine(o, status);
  if (counts) metaRow(dl, 'Results', counts);
  if (o.rerunOf) {
    const src = offers.find((x) => x.id === o.rerunOf);
    metaRow(dl, 'Rerun of', src ? src.name : 'an earlier offer');
  }
  c.append(dl);

  const tools = make('div', 'oa-tools');
  const copy = make('button', 'oa-btn oa-btn-sm', 'Copy link');
  copy.type = 'button';
  copy.dataset.act = 'copy';
  copy.disabled = !lp;
  copy.setAttribute('aria-label', `Copy link for ${o.name}`);

  const prev = make('a', 'oa-btn oa-btn-sm', 'Preview');
  prev.href = previewPath(o);
  prev.target = '_blank';
  prev.rel = 'noopener noreferrer';
  prev.setAttribute('aria-label', `Preview ${o.name} (opens a new tab)`);
  if (!o.page || !o.previewKey) { prev.removeAttribute('href'); prev.setAttribute('aria-disabled', 'true'); }

  const edit = make('button', 'oa-btn oa-btn-sm', 'Edit');
  edit.type = 'button';
  edit.dataset.act = 'edit';
  edit.setAttribute('aria-label', `Edit ${o.name}`);

  tools.append(copy, prev, edit);
  if (status === 'expired') {
    const again = make('button', 'oa-btn oa-btn-sm', 'Run again');
    again.type = 'button';
    again.dataset.act = 'rerun';
    again.setAttribute('aria-label', `Run ${o.name} again`);
    tools.append(again);
  }
  c.append(tools);
  return c;
}

function render() {
  const t = now().getTime();
  const at = new Date(t);
  const buckets = Object.fromEntries(GROUPS.map((g) => [g.status, []]));
  for (const o of offers) (buckets[offerStatus(o, at)] || buckets.draft).push(o);
  lastStatuses = offers.map((o) => o.id + ':' + offerStatus(o, at)).join(',');

  const frag = document.createDocumentFragment();
  for (const g of GROUPS) {
    const list = buckets[g.status].sort(sortFor(g.status));
    const sec = make('section', `oa-group is-${g.status}`);
    sec.dataset.group = g.status;
    const hid = `oa-g-${g.status}`;
    sec.setAttribute('aria-labelledby', hid);
    const h = make('h2', 'oa-group-h');
    h.id = hid;
    h.append(make('span', 'oa-dot'), document.createTextNode(g.title + ' '), make('span', 'oa-count', list.length));
    sec.append(h);
    if (!list.length) {
      sec.append(make('p', 'oa-empty', g.empty));
    } else {
      const grid = make('div', 'oa-cards');
      for (const o of list) grid.append(card(o, g.status, t));
      sec.append(grid);
    }
    frag.append(sec);
  }
  el.groups.replaceChildren(frag);

  const n = offers.length;
  el.summary.textContent = n
    ? `${n} offer${n === 1 ? '' : 's'}. ${buckets.running.length} running. Times are Eastern. Updated ${FMT_TIME.format(at)}.`
    : 'No offers yet. Choose New offer to create one.';
}

/** Re-render on a timer so countdowns move and offers change group on time. */
function startTicking() {
  stopTicking();
  tickTimer = setInterval(() => {
    if (document.hidden || el.dash.hidden) return;
    // Keep keyboard focus if a card's button had it.
    const active = document.activeElement;
    const keep = active && active.closest && active.closest('.oa-card')
      ? { id: active.closest('.oa-card').dataset.id, act: active.textContent } : null;
    render();
    if (keep) {
      const target = [...el.groups.querySelectorAll('.oa-card')].find((c) => c.dataset.id === keep.id);
      const btn = target && [...target.querySelectorAll('.oa-btn')].find((b) => b.textContent === keep.act);
      if (btn) btn.focus();
    }
  }, TICK_MS);
}
function stopTicking() { if (tickTimer) clearInterval(tickTimer); tickTimer = null; }

function clearData() {
  stopTicking();
  if (!stash) wipeEditor();
  el.versions.querySelector('#oa-v-list').replaceChildren();
  offers = [];
  stats = null;
  statsFailed = false;
  storeName = '';
  el.groups.replaceChildren();
  el.summary.textContent = '';
  el.store.textContent = '';
}

/* ---------- flows ---------- */

function showSignIn(note) {
  clearData();
  el.signinNote.textContent = note || 'Enter the admin password.';
  el.signinMsg.textContent = '';
  el.signinMsg.classList.remove('is-ok');
  el.password.value = '';
  el.signinBtn.disabled = false;
  show('signin');
  el.password.focus();
}

function showError(text) {
  clearData();
  el.errorText.textContent = text;
  show('error');
  el.retry.focus();
}

async function load({ quiet = false, signedOutNote } = {}) {
  if (!quiet) show('loading');
  let out;
  try {
    out = await api(ROUTES.apiOffers);
  } catch {
    return quiet ? toast('Could not reach the server. Check your connection.', true)
      : showError('Could not reach the server. Check your connection and try again.');
  }
  const { res, body } = out;
  if (res.status === 401) return showSignIn(signedOutNote);
  if (!res.ok || !body || !Array.isArray(body.offers)) {
    const msg = (body && body.error) || `The server answered ${res.status}.`;
    return quiet ? toast(msg, true) : showError(msg);
  }
  offers = body.offers;
  const serverNow = Date.parse(body.now);
  clockSkew = Number.isNaN(serverNow) ? 0 : serverNow - Date.now();
  storeName = body.store || '';
  el.store.textContent = storeName === 'offers' ? 'Live store' : 'Test store';
  el.store.title = `Offer storage: ${storeName}`;
  el.store.classList.toggle('is-live', storeName === 'offers');
  render();
  startTicking();
  loadStats();   // Session 1.9: counts fill in when they arrive; never blocks the dashboard
  if (stash) return resumeStash();
  if (view === 'editor' || view === 'versions') { if (quiet) toast('Up to date.'); return; }
  show('dash');
  if (quiet) toast('Up to date.');
}

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = el.password.value;
  el.signinMsg.classList.remove('is-ok');
  if (!password) { el.signinMsg.textContent = 'Enter the password.'; el.password.focus(); return; }
  el.signinBtn.disabled = true;
  el.signinMsg.textContent = 'Checking\u2026';
  el.signinMsg.classList.add('is-ok');
  let out;
  try {
    out = await api(ROUTES.apiLogin, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    });
  } catch {
    out = null;
  }
  el.password.value = '';
  el.signinBtn.disabled = false;
  el.signinMsg.classList.remove('is-ok');
  if (!out) { el.signinMsg.textContent = 'Could not reach the server. Try again.'; el.password.focus(); return; }
  const { res, body } = out;
  if (res.ok) { el.signinMsg.textContent = ''; return load(); }
  el.signinMsg.textContent = (body && body.error) || `Sign-in failed (${res.status}).`;
  el.password.focus();
});

el.signout.addEventListener('click', async () => {
  if (view === 'editor' && isDirty()) return askGuard('signout');
  await signOut();
});
async function signOut() {
  el.signout.disabled = true;
  try { await api(ROUTES.apiLogout, { method: 'POST' }); } catch { /* the cookie expires on its own */ }
  el.signout.disabled = false;
  stash = null;
  showSignIn('You are signed out.');
}

el.refresh.addEventListener('click', () => load({ quiet: true, signedOutNote: 'Your sign-in has expired. Sign in again.' }));
el.retry.addEventListener('click', () => load());

el.exportBtn.addEventListener('click', async () => {
  el.exportBtn.disabled = true;
  try {
    const res = await fetch(ROUTES.apiExport, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) return showSignIn('Your sign-in has expired. Sign in again to export.');
    if (!res.ok) {
      let msg = `Export failed (${res.status}).`;
      try { msg = (await res.json()).error || msg; } catch { /* keep */ }
      return toast(msg, true);
    }
    const name = ((res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/) || [])[1]
      || 'yavd-offers-export.json';
    const url = URL.createObjectURL(await res.blob());
    const a = make('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(`Downloaded ${name}. It holds preview keys, so keep it private.`);
  } catch {
    toast('Export failed. Check your connection.', true);
  } finally {
    el.exportBtn.disabled = false;
  }
});

el.groups.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const o = offers.find((x) => x.id === btn.closest('.oa-card').dataset.id);
  if (!o) return;
  if (btn.dataset.act === 'edit') return openEditor({ offer: o });
  if (btn.dataset.act === 'rerun') return openEditor({ rerunFrom: o });
  if (btn.dataset.act !== 'copy') return;
  const full = location.origin + linkPath(o);
  toast(await copyText(full) ? `Copied ${full}` : 'Could not copy. Select the link on the card instead.', false);
});

// Back on this tab after a while: recount the groups so nothing shows in the
// wrong one. (An expired sign-in shows up on the next Refresh or Export.)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !el.dash.hidden) {
    const before = lastStatuses;
    render();
    if (before !== lastStatuses) toast('Offers moved group while you were away.');
  }
});

/* =====================================================================
   Session 1.8: offer editor, rerun, live preview, saved versions
   ===================================================================== */

// Same limits as LIMITS in netlify/functions/lib/offers-rules.mjs (the
// server enforces them; the editor only shows them).
const MAX_CHOICES = 20;
const EXTRA = ['extra_1', 'extra_2', 'extra_3'];
const WIDE = { message: 1, heard_from: 1, option_choice: 1 };   // as in offer-panel.js
const PRIVACY = 'We use your details only to follow up on this offer. We never sell or share them.';

const ed = {
  h: $('oa-ed-h'), status: $('oa-ed-status'), back: $('oa-ed-back'),
  guard: $('oa-ed-guard'), guardText: $('oa-ed-guard-text'), keep: $('oa-ed-keep'), discard: $('oa-ed-discard'),
  banner: $('oa-ed-banner'), summary: $('oa-ed-summary'), form: $('oa-ed-form'),
  page: $('f-page'), pageRetry: $('f-page-retry'), name: $('f-name'), slugWrap: $('f-slug-wrap'), slug: $('f-slug'),
  headline: $('f-headline'), body: $('f-body'), formOn: $('f-form-on'), formYes: $('f-form-yes'), formNo: $('f-form-no'),
  fields: $('f-fields'), choicesWrap: $('f-choices-wrap'), choices: $('f-choices'), btn: $('f-btn'), thanks: $('f-thanks'),
  btn2: $('f-btn2'), url: $('f-url'),
  startD: $('f-start-d'), startT: $('f-start-t'), endD: $('f-end-d'), endT: $('f-end-t'),
  startW: $('f-start-w'), endW: $('f-end-w'),
  saveDraft: $('oa-save-draft'), saveSched: $('oa-save-sched'), saving: $('oa-saving'),
  del: $('oa-del'), delGuard: $('oa-del-guard'), delNo: $('oa-del-no'), delYes: $('oa-del-yes'),
  pvFrame: $('oa-pv-frame'), pv: $('oa-pv'), pvNone: $('oa-pv-link-none'), pvYes: $('oa-pv-link-yes'),
  pvUrl: $('oa-pv-url'), pvOpen: $('oa-pv-open'), pvCopy: $('oa-pv-copy'),
  vBack: $('oa-v-back'), vH: $('oa-v-h'), vList: $('oa-v-list')
};

/** What the editor is working on.
 *  record:  the saved offer as the server last returned it (null = not saved yet)
 *  rerunOf: id of the expired offer being rerun (new offers only)
 *  clean:   the form's values when last loaded or saved, to spot unsaved changes */
let cur = { record: null, rerunOf: null, clean: '' };
let pages = null;          // [{ path, title }] from /api/offers/pages, loaded once
let pvMode = 'desktop';
let pendingGuard = null;   // what to do if Michael discards changes
let stash = null;          // editor state kept across an expired sign-in
let saving = false;

/* ---------- Eastern time <-> ISO with offset ---------- */

const FMT_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit'
});
const FMT_WORDS = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
});
const pad = (n) => String(n).padStart(2, '0');

function partsAt(ms) {
  const p = {};
  for (const x of FMT_PARTS.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}
/** Minutes Eastern is ahead of UTC at this instant (-240 in summer, -300 in winter). */
function offsetAt(ms) {
  const p = partsAt(ms);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms) / 60000);
}

/**
 * A date ("2026-11-30") and time ("23:59") on an Eastern wall clock, to
 * "2026-11-30T23:59:59-05:00". Returns { iso } or { error }.
 */
function easternIso(date, time, seconds) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const tm = /^(\d{2}):(\d{2})/.exec(time || '');
  if (!dm || !tm) return { error: 'Enter a date and a time.' };
  const [y, mo, d, h, mi] = [+dm[1], +dm[2], +dm[3], +tm[1], +tm[2]];
  const wall = Date.UTC(y, mo - 1, d, h, mi, seconds);
  let off = offsetAt(wall - offsetAt(wall) * 60000);
  const utc = wall - off * 60000;
  const back = partsAt(utc);
  if (back.h !== h || back.mi !== mi || back.d !== d) {
    return { error: 'That time does not exist on the night the clocks go forward. Pick another time.' };
  }
  off = offsetAt(utc);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return { iso: `${dm[1]}-${dm[2]}-${dm[3]}T${pad(h)}:${pad(mi)}:${pad(seconds)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}` };
}

/** ISO time to the Eastern date and time the inputs show. */
function isoToInputs(iso) {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return { date: '', time: '' };
  const p = partsAt(t);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}

/** "Sat, Oct 31, 2026, 11:59 PM EDT" */
function words(iso) { return FMT_WORDS.format(new Date(Date.parse(iso))); }

/** Start and stop from the inputs. A blank time takes the contract default. */
function readDates() {
  const out = { startsAt: '', endsAt: '', startErr: '', endErr: '' };
  if (ed.startD.value) {
    const r = easternIso(ed.startD.value, ed.startT.value || DEFAULT_START_TIME, 0);
    if (r.error) out.startErr = r.error; else out.startsAt = r.iso;
  }
  if (ed.endD.value) {
    // The stop minute counts in full: 11:59 PM runs to 11:59:59 PM.
    const r = easternIso(ed.endD.value, ed.endT.value || DEFAULT_END_TIME, 59);
    if (r.error) out.endErr = r.error; else out.endsAt = r.iso;
  }
  return out;
}

function showDateWords() {
  const d = readDates();
  const line = (node, iso, err, verb, blank) => {
    node.classList.toggle('is-bad', !!err);
    node.textContent = err || (iso ? `${verb} ${words(iso)}` : blank);
  };
  line(ed.startW, d.startsAt, d.startErr, 'Starts', 'No start date yet. Times are Eastern.');
  line(ed.endW, d.endsAt, d.endErr, 'Stops at the end of', 'No stop date yet.');
  if (!d.endErr && d.startsAt && d.endsAt && Date.parse(d.endsAt) <= Date.parse(d.startsAt)) {
    ed.endW.classList.add('is-bad');
    ed.endW.textContent = 'The stop is before the start.';
  }
}

/* ---------- the form fields table ---------- */

function buildFieldRows() {
  const frag = document.createDocumentFragment();
  for (const name of FIELD_NAMES) {
    const tr = make('tr');
    tr.dataset.field = name;
    const td = make('td');
    td.append(make('span', 'oa-fname', name === 'option_choice' ? 'Choose one (a dropdown)' : FIELD_LABELS[name]));
    if (EXTRA.includes(name)) {
      td.className = 'oa-extra';
      td.firstChild.textContent = `Spare field ${name.slice(-1)}`;
      const lab = make('input');
      lab.type = 'text';
      lab.maxLength = 80;
      lab.placeholder = 'Label visitors will see';
      lab.dataset.extra = name;
      lab.setAttribute('aria-label', `Label for spare field ${name.slice(-1)}`);
      const err = make('p', 'oa-ferr');
      err.dataset.err = `form.extraLabels.${name}`;
      td.append(lab, err);
    }
    const show = make('input');
    show.type = 'checkbox';
    show.dataset.show = name;
    show.setAttribute('aria-label', `Show ${FIELD_LABELS[name]}`);
    const req = make('input');
    req.type = 'checkbox';
    req.dataset.req = name;
    req.setAttribute('aria-label', `${FIELD_LABELS[name]} is required`);
    const c1 = make('td'); c1.append(show);
    const c2 = make('td'); c2.append(req);
    tr.append(td, c1, c2);
    frag.append(tr);
  }
  ed.fields.replaceChildren(frag);
}

function syncFieldRows() {
  for (const tr of ed.fields.children) {
    const on = tr.querySelector('[data-show]').checked;
    const req = tr.querySelector('[data-req]');
    req.disabled = !on;
    if (!on) req.checked = false;
    tr.classList.toggle('is-on', on);
    const lab = tr.querySelector('[data-extra]');
    if (lab) lab.hidden = !on;
  }
  ed.choicesWrap.hidden = !ed.fields.querySelector('[data-show="option_choice"]').checked;
}

/* ---------- read and fill the form ---------- */

function choiceList() {
  return ed.choices.value.split('\n').map((x) => x.trim()).filter(Boolean);
}

/** The editor's values as an offer record (what POST /api/offers receives). */
function collect() {
  const enabled = ed.formOn.checked;
  const fields = [];
  const required = [];
  const extraLabels = {};
  for (const tr of ed.fields.children) {
    const n = tr.dataset.field;
    if (tr.querySelector('[data-show]').checked) fields.push(n);
    if (tr.querySelector('[data-req]').checked) required.push(n);
    const lab = tr.querySelector('[data-extra]');
    if (lab && lab.value.trim()) extraLabels[n] = lab.value.trim();
  }
  const d = readDates();
  const audience = (ed.form.querySelector('input[name="audience"]:checked') || {}).value || 'everyone';
  const rec = {
    name: ed.name.value, page: ed.page.value, audience,
    slug: audience === 'link' ? ed.slug.value.trim() : '',
    headline: ed.headline.value, body: ed.body.value,
    form: {
      enabled, fields, required,
      buttonLabel: enabled ? ed.btn.value.trim() : ed.btn2.value.trim(),
      optionChoices: choiceList(), extraLabels, thanks: ed.thanks.value.trim()
    },
    buttonUrl: enabled ? (cur.record ? cur.record.buttonUrl : null) : (ed.url.value.trim() || null),
    startsAt: d.startsAt, endsAt: d.endsAt
  };
  return rec;
}

function snapshot() {
  // Raw inputs too, so a half-typed date still counts as a change.
  return JSON.stringify([collect(), ed.startD.value, ed.startT.value, ed.endD.value, ed.endT.value]);
}
function isDirty() { return view === 'editor' && snapshot() !== cur.clean; }

function fill(o) {
  ensurePageOption(o.page);
  ed.page.value = o.page || '';
  ed.name.value = o.name || '';
  for (const r of ed.form.querySelectorAll('input[name="audience"]')) r.checked = r.value === (o.audience || 'everyone');
  ed.slug.value = o.slug || '';
  ed.headline.value = o.headline || '';
  ed.body.value = o.body || '';
  const f = o.form || emptyOffer().form;
  ed.formOn.checked = f.enabled !== false;
  for (const tr of ed.fields.children) {
    const n = tr.dataset.field;
    tr.querySelector('[data-show]').checked = (f.fields || []).includes(n);
    tr.querySelector('[data-req]').checked = (f.required || []).includes(n);
    const lab = tr.querySelector('[data-extra]');
    if (lab) lab.value = (f.extraLabels || {})[n] || '';
  }
  ed.choices.value = (f.optionChoices || []).join('\n');
  ed.btn.value = f.enabled !== false ? (f.buttonLabel || '') : '';
  ed.btn2.value = f.enabled === false ? (f.buttonLabel || '') : '';
  ed.thanks.value = f.thanks || '';
  ed.url.value = o.buttonUrl || '';
  const s = isoToInputs(o.startsAt);
  const e = isoToInputs(o.endsAt);
  ed.startD.value = s.date; ed.startT.value = s.time || DEFAULT_START_TIME;
  ed.endD.value = e.date; ed.endT.value = e.time || DEFAULT_END_TIME;
  syncAll();
}

function syncAll() {
  const link = (ed.form.querySelector('input[name="audience"]:checked') || {}).value === 'link';
  ed.slugWrap.hidden = !link;
  ed.formYes.hidden = !ed.formOn.checked;
  ed.formNo.hidden = ed.formOn.checked;
  syncFieldRows();
  slugHint();
  counters();
  showDateWords();
  renderPreview();
}

function slugHint() {
  const v = ed.slug.value.trim();
  const err = ed.form.querySelector('[data-err="slug"]');
  if (err.dataset.server) return;
  const bad = v && !isValidSlug(v);
  err.textContent = bad ? `Use ${SLUG_MIN} to ${SLUG_MAX} lowercase letters, numbers and single hyphens (no spaces).` : '';
  ed.slug.toggleAttribute('aria-invalid', !!bad);
}

/** Lowercase, spaces to hyphens, drop anything else, when leaving the field. */
function tidySlug() {
  ed.slug.value = ed.slug.value.toLowerCase().trim().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
}

function counters() {
  for (const n of ed.form.querySelectorAll('[data-count]')) {
    let note = n.nextElementSibling;
    if (!note || !note.classList.contains('oa-count-note')) {
      note = make('span', 'oa-count-note');
      note.setAttribute('aria-hidden', 'true');
      n.after(note);
    }
    const max = +n.dataset.count;
    const len = n.value.length;
    note.textContent = len > max * 0.8 ? `${len} / ${max}` : '';
    note.classList.toggle('is-over', len > max);
  }
}

/* ---------- pages dropdown ---------- */

async function loadPages() {
  if (pages) return true;
  ed.page.replaceChildren(new Option('Loading pages\u2026', ''));
  ed.pageRetry.hidden = true;
  let out;
  try { out = await api(ROUTES.apiPages); } catch { out = null; }
  if (out && out.res.status === 401) { kickToSignIn(); return false; }
  if (!out || !out.res.ok || !out.body || !Array.isArray(out.body.pages)) {
    ed.page.replaceChildren(new Option('Could not load the page list', ''));
    ed.pageRetry.hidden = false;
    return false;
  }
  pages = out.body.pages;
  fillPageOptions();
  return true;
}

function fillPageOptions() {
  const keep = ed.page.value;
  const opts = [new Option('Choose a page\u2026', '')];
  for (const p of pages || []) {
    const short = p.path.replace(/\/index\.html$/, '/');
    opts.push(new Option(p.title ? `${short}  (${p.title})` : short, p.path));
  }
  ed.page.replaceChildren(...opts);
  ensurePageOption(keep);
  ed.page.value = keep;
}

/** A saved page that is no longer on the site still shows, marked. */
function ensurePageOption(path) {
  if (!path) return;
  if ([...ed.page.options].some((o) => o.value === path)) return;
  ed.page.append(new Option(pages ? `${path}  (not found on this deploy)` : path, path));
}

ed.pageRetry.addEventListener('click', async () => {
  if (await loadPages()) { ensurePageOption(cur.record?.page); renderPreview(); }
});

/* ---------- live preview (same markup and CSS as the real popup) ---------- */

// Desktop is 720 wide: above the popup's 560 px phone breakpoint, small enough to read when scaled.
const PV_SIZES = { desktop: { w: 720, h: 640 }, phone: { w: 390, h: 760 } };
let pvReady = false;

function setupPreview() {
  // Sandboxed with no scripts: nothing in the preview can run or submit.
  // This page builds the preview's DOM itself, with textContent only.
  ed.pv.srcdoc = '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&family=Inter:wght@400;600;700&display=swap">'
    + `<link rel="stylesheet" href="${INJECT.css}">`
    + '<style>html,body{margin:0;height:100%;font-family:Inter,Arial,sans-serif;background:#fff}'
    + '.pv-page{padding:22px 26px;color:#9AA6B6}.pv-url{font:600 12px/1.4 ui-monospace,Consolas,monospace;'
    + 'background:#EEF1F5;border-radius:6px;padding:6px 10px;display:inline-block;margin-bottom:22px;color:#5A6B82}'
    + '.pv-bar{height:14px;background:#E3E8EF;border-radius:4px;margin:0 0 12px}.pv-hero{height:120px;background:#152B4A;'
    + 'opacity:.18;border-radius:8px;margin:0 0 20px}.yavd-op-backdrop{transition:none!important}'
    + '.yavd-op-dialog{transition:none!important}</style></head><body></body></html>';
  ed.pv.addEventListener('load', () => { pvReady = true; renderPreview(); });
  sizePreview();
  if ('ResizeObserver' in window) new ResizeObserver(sizePreview).observe(ed.pvFrame.parentElement);
}

function sizePreview() {
  const box = ed.pvFrame.parentElement;
  const avail = Math.max(200, box.clientWidth - 30);
  const { w, h } = PV_SIZES[pvMode];
  const scale = Math.min(1, avail / w);
  ed.pv.style.width = `${w}px`;
  ed.pv.style.height = `${h}px`;
  ed.pv.style.transform = `scale(${scale})`;
  ed.pvFrame.style.width = `${Math.round(w * scale)}px`;
  ed.pvFrame.style.height = `${Math.round(h * scale)}px`;
}

for (const b of document.querySelectorAll('[data-pv]')) {
  b.addEventListener('click', () => {
    pvMode = b.dataset.pv;
    for (const x of document.querySelectorAll('[data-pv]')) {
      const on = x === b;
      x.classList.toggle('is-on', on);
      x.setAttribute('aria-pressed', String(on));
    }
    sizePreview();
  });
}

let pvTimer = null;
function renderPreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(drawPreview, 120);
}

function drawPreview() {
  if (!pvReady || view !== 'editor') return;
  const doc = ed.pv.contentDocument;
  if (!doc || !doc.body) return;
  const o = collect();
  const m = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };

  const page = m('div', 'pv-page');
  page.append(m('div', 'pv-url', `youravdept.com${o.audience === 'link' && o.slug ? OFFER_LINK_PREFIX + o.slug : (o.page || '/')}`),
    m('div', 'pv-hero'), m('div', 'pv-bar'), m('div', 'pv-bar'), m('div', 'pv-bar'));

  const root = m('div', 'yavd-op');
  const backdrop = m('div', 'yavd-op-backdrop is-open');
  const dialog = m('div', 'yavd-op-dialog');
  const close = m('div', 'yavd-op-close', '\u00d7');
  const scroll = m('div', 'yavd-op-scroll');
  const content = m('div');
  content.append(m('span', 'yavd-op-test', 'Preview: submissions are marked as tests'));
  content.append(m('h2', 'yavd-op-headline', o.headline.trim() || o.name.trim() || 'Your headline'));
  const body = m('div', 'yavd-op-body');
  o.body.replace(/\r\n?/g, '\n').split(/\n{2,}/).forEach((para) => {
    if (!para.trim()) return;
    const p = m('p');
    para.split('\n').forEach((line, i) => { if (i) p.append(doc.createElement('br')); p.append(doc.createTextNode(line)); });
    body.append(p);
  });
  content.append(body);

  if (o.form.enabled) {
    const grid = m('div', 'yavd-op-grid');
    for (const n of o.form.fields) {
      const isExtra = EXTRA.includes(n);
      const wrap = m('div', `yavd-op-field${WIDE[n] ? ' is-wide' : ''}`);
      const lab = m('span', 'yavd-op-label', isExtra ? (o.form.extraLabels[n] || FIELD_LABELS[n]) : FIELD_LABELS[n]);
      if (o.form.required.includes(n)) lab.append(m('span', 'yavd-op-req', ' *'));
      let input;
      if (n === 'message') input = m('div', 'yavd-op-input', '');
      else if (n === 'option_choice') input = m('div', 'yavd-op-input', o.form.optionChoices.length ? 'Select one' : 'Select one (no choices yet)');
      else input = m('div', 'yavd-op-input', '');
      if (n === 'message') input.style.minHeight = '92px';
      if (n === 'option_choice') input.style.color = '#4A5B73';
      wrap.append(lab, input);
      grid.append(wrap);
    }
    content.append(grid);
    content.append(m('div', 'yavd-op-btn', o.form.buttonLabel || 'Send'));
    content.append(m('p', 'yavd-op-privacy', PRIVACY));
  } else if (o.form.buttonLabel && o.buttonUrl) {
    content.append(m('div', 'yavd-op-btn', o.form.buttonLabel));
  }

  scroll.append(content);
  dialog.append(close, scroll);
  backdrop.append(dialog);
  root.append(backdrop);
  doc.body.replaceChildren(page, root);
}

/* ---------- field messages ---------- */

function clearErrors() {
  for (const n of ed.form.querySelectorAll('.oa-ferr')) { n.textContent = ''; delete n.dataset.server; }
  for (const n of ed.form.querySelectorAll('[aria-invalid]')) n.removeAttribute('aria-invalid');
  ed.summary.hidden = true;
  ed.summary.replaceChildren();
}

/** Server keys to the input that should be marked and focused. */
function inputFor(key) {
  const map = {
    name: ed.name, page: ed.page, slug: ed.slug, headline: ed.headline, body: ed.body,
    startsAt: ed.startD, endsAt: ed.endD, buttonUrl: ed.url, 'form.buttonLabel': ed.formOn.checked ? ed.btn : ed.btn2,
    'form.thanks': ed.thanks, 'form.optionChoices': ed.choices, 'form.fields': ed.fields.querySelector('[data-show]'),
    'form.required': ed.fields.querySelector('[data-req]'), audience: ed.form.querySelector('input[name="audience"]'),
    'form.enabled': ed.formOn, form: ed.formOn
  };
  const m = /^form\.extraLabels\.(extra_[123])$/.exec(key);
  if (m) return ed.fields.querySelector(`[data-extra="${m[1]}"]`);
  return map[key] || null;
}

function showErrors(message, fields) {
  clearErrors();
  const list = make('ul');
  let first = null;
  for (const [rawKey, msg] of Object.entries(fields || {})) {
    const key = rawKey.replace(/\[\d+\]$/, '');
    const slot = ed.form.querySelector(`[data-err="${CSS.escape(key)}"]`);
    if (slot) { slot.textContent = msg; slot.dataset.server = '1'; }
    const input = inputFor(key);
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      if (!first) first = input;
    }
    const li = make('li');
    if (input && input.id) {
      const a = make('a', null, msg);
      a.href = `#${input.id}`;
      a.addEventListener('click', (e) => { e.preventDefault(); input.focus(); });
      li.append(a);
    } else {
      li.textContent = msg;
    }
    list.append(li);
  }
  ed.summary.append(make('p', null, message || 'Not saved.'));
  if (list.children.length) ed.summary.append(list);
  ed.summary.hidden = false;
  ed.summary.focus();
  return first;
}

/* ---------- open, save, leave ---------- */

function resetEditor() {
  cur = { record: null, rerunOf: null, clean: '' };
  pendingGuard = null;
  ed.guard.hidden = true;
  ed.delGuard.hidden = true;
}

/** Sign-out: nothing from any offer stays in the page. */
function wipeEditor() {
  resetEditor();
  ed.form.reset();
  for (const n of ed.fields.querySelectorAll('[data-extra]')) n.value = '';
  ed.h.textContent = 'New offer';
  ed.status.hidden = true;
  ed.pvUrl.textContent = '';
  ed.pvOpen.removeAttribute('href');
  ed.pvYes.hidden = true;
  ed.pvNone.hidden = false;
  setBanner('');
  clearErrors();
  ed.saving.textContent = '';
  const doc = ed.pv.contentDocument;
  if (doc && doc.body) doc.body.replaceChildren();
}

function setBanner(text, warn = false, action = null) {
  ed.banner.replaceChildren();
  if (!text) { ed.banner.hidden = true; return; }
  ed.banner.append(document.createTextNode(text));
  if (action) {
    const b = make('button', 'oa-btn oa-btn-sm', action.label);
    b.type = 'button';
    b.addEventListener('click', action.run);
    ed.banner.append(b);
  }
  ed.banner.classList.toggle('is-warn', warn);
  ed.banner.hidden = false;
}

function headerFor() {
  const r = cur.record;
  if (!r) {
    ed.h.textContent = cur.rerunOf ? 'Run again' : 'New offer';
    ed.status.hidden = true;
  } else {
    ed.h.textContent = `Edit: ${r.name}`;
    const st = offerStatus(r, now());
    ed.status.textContent = st;
    ed.status.className = `oa-pill is-${st}`;
    ed.status.hidden = false;
  }
  const st = r ? offerStatus(r, now()) : 'new';
  ed.saveDraft.textContent = st === 'running' || st === 'upcoming' ? 'Take down (save as draft)' : 'Save as draft';
  ed.saveSched.textContent = st === 'running' || st === 'upcoming' ? 'Save changes' : 'Save and schedule';
  ed.del.hidden = !(r && st === 'draft');
  ed.delGuard.hidden = true;

  if (r) {
    const url = location.origin + previewPath(r);
    ed.pvUrl.textContent = url;
    ed.pvOpen.href = url;
    ed.pvNone.hidden = true;
    ed.pvYes.hidden = false;
  } else {
    ed.pvNone.hidden = false;
    ed.pvYes.hidden = true;
    ed.pvOpen.removeAttribute('href');
  }

  if (r && st === 'running') {
    setBanner('This offer is running now. Saved changes reach visitors within about a minute. "Take down" removes the popup.', true);
  } else if (!r && cur.rerunOf) {
    const src = offers.find((x) => x.id === cur.rerunOf);
    setBanner(`A copy of "${src ? src.name : 'an expired offer'}". Set new dates, change any copy, and save. The original stays in the Expired list.`);
  } else {
    setBanner('');
  }
}

/**
 * Opens the editor.
 *   {}                 new offer
 *   { offer }          edit a saved offer
 *   { rerunFrom }      a filled-in copy of an expired offer
 */
async function openEditor({ offer = null, rerunFrom = null } = {}) {
  resetEditor();
  clearErrors();
  if (offer) {
    cur.record = offer;
  } else if (rerunFrom) {
    cur.rerunOf = rerunFrom.id;
  }
  show('editor');
  headerFor();
  const loaded = loadPages();
  if (offer) {
    fill(offer);
  } else if (rerunFrom) {
    const copy = structuredClone(rerunFrom);
    // Same copy and same link; new dates. Times of day are kept.
    const s = isoToInputs(copy.startsAt);
    const e = isoToInputs(copy.endsAt);
    copy.startsAt = '';
    copy.endsAt = '';
    fill(copy);
    ed.startT.value = s.time || DEFAULT_START_TIME;
    ed.endT.value = e.time || DEFAULT_END_TIME;
    showDateWords();
  } else {
    const blank = emptyOffer();
    fill(blank);
  }
  window.scrollTo(0, 0);
  ed.h.focus();
  await loaded;
  if (view !== 'editor') return;
  ensurePageOption(ed.page.value);
  cur.clean = snapshot();
  renderPreview();
}

async function save(asDraft) {
  if (saving) return;
  clearErrors();
  tidySlug();
  const d = readDates();
  const local = {};
  if (d.startErr) local.startsAt = d.startErr;
  if (d.endErr) local.endsAt = d.endErr;
  if (Object.keys(local).length) { showErrors('Check the dates.', local)?.focus(); return; }

  const payload = { ...collect(), draft: asDraft };
  if (cur.record) {
    payload.id = cur.record.id;
    payload.updatedAt = cur.record.updatedAt;
  } else if (cur.rerunOf) {
    payload.rerunOf = cur.rerunOf;
  }

  saving = true;
  ed.saveDraft.disabled = ed.saveSched.disabled = true;
  ed.saving.textContent = 'Saving\u2026';
  let out;
  try {
    out = await api(ROUTES.apiOffers, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch { out = null; }
  saving = false;
  ed.saveDraft.disabled = ed.saveSched.disabled = false;
  ed.saving.textContent = '';

  if (!out) { showErrors('Could not reach the server. Nothing was saved; your changes are still here. Try again.'); return; }
  const { res, body } = out;
  if (res.status === 401) {
    stash = { record: cur.record, rerunOf: cur.rerunOf, values: grabInputs(), clean: cur.clean };
    showSignIn('Your sign-in expired. Sign in again: your changes are kept and nothing was saved yet.');
    return;
  }
  if (res.ok && body && body.offer) {
    const saved = body.offer;
    const i = offers.findIndex((x) => x.id === saved.id);
    if (i >= 0) offers[i] = saved; else offers.push(saved);
    cur.record = saved;
    cur.rerunOf = null;
    fill(saved);
    cur.clean = snapshot();
    headerFor();
    render();
    const st = offerStatus(saved, now());
    const what = { draft: 'Saved as a draft. Visitors do not see it.', upcoming: `Scheduled. It starts ${words(saved.startsAt)}.`,
      running: 'Saved. It is running now; visitors see it within about a minute.', expired: 'Saved. Its stop date has passed, so it is in Expired.' }[st];
    toast(what);
    if (Array.isArray(body.notes) && body.notes.length) setBanner(body.notes.join(' '), true);
    ed.saving.textContent = body.created ? 'Created.' : 'Saved.';
    return;
  }
  if (res.status === 409 && !(body && body.fields)) {
    // Saved elsewhere since this was opened: never write over it.
    setBanner((body && body.error) || 'This offer changed since you opened it.', true,
      { label: 'Load the saved version', run: reloadCurrent });
    showErrors('Not saved, so nothing was overwritten. Your changes are still on screen: copy anything you need, then load the saved version.');
    return;
  }
  if (res.status === 404) {
    showErrors((body && body.error) || 'This offer no longer exists.');
    return;
  }
  const first = showErrors((body && body.error) || `Not saved (the server answered ${res.status}).`, body && body.fields);
  if (first) first.scrollIntoView({ block: 'center' });
}

async function reloadCurrent() {
  if (!cur.record) return;
  const id = cur.record.id;
  let out;
  try { out = await api(ROUTES.apiOffers); } catch { out = null; }
  if (!out || !out.res.ok || !out.body) return toast('Could not reload. Try again.', true);
  offers = out.body.offers;
  const fresh = offers.find((x) => x.id === id);
  if (!fresh) { cur.clean = snapshot(); return leaveEditor(true, 'That offer no longer exists.'); }
  cur.record = fresh;
  clearErrors();
  fill(fresh);
  cur.clean = snapshot();
  headerFor();
  toast('Loaded the saved version.');
}

/* inputs kept across an expired sign-in */
function grabInputs() {
  const v = {};
  for (const n of ed.form.querySelectorAll('input, textarea, select')) {
    const k = n.id || `${n.name}:${n.value}:${n.dataset.show || n.dataset.req || n.dataset.extra || ''}`;
    if (n.type === 'checkbox' || n.type === 'radio') v[k] = n.checked; else v[k] = n.value;
  }
  return v;
}
function putInputs(v) {
  for (const n of ed.form.querySelectorAll('input, textarea, select')) {
    const k = n.id || `${n.name}:${n.value}:${n.dataset.show || n.dataset.req || n.dataset.extra || ''}`;
    if (!(k in v)) continue;
    if (n.type === 'checkbox' || n.type === 'radio') n.checked = v[k]; else n.value = v[k];
  }
}
async function resumeStash() {
  const s = stash;
  stash = null;
  const fresh = s.record ? offers.find((x) => x.id === s.record.id) : null;
  await openEditor(fresh ? { offer: fresh } : s.rerunOf ? { rerunFrom: offers.find((x) => x.id === s.rerunOf) || { id: s.rerunOf } } : {});
  putInputs(s.values);
  ensurePageOption(s.values['f-page']);
  ed.page.value = s.values['f-page'] || '';
  syncAll();
  if (s.record && fresh && fresh.updatedAt !== s.record.updatedAt) {
    cur.record = s.record;   // keep the old stamp so the server refuses an overwrite
    setBanner('This offer was saved somewhere else while you were signed out. Your changes are on screen; saving will be refused so nothing is overwritten.', true,
      { label: 'Load the saved version', run: reloadCurrent });
  }
  toast('Signed in again. Your changes are back. Save when ready.');
}

function kickToSignIn() {
  stash = view === 'editor' ? { record: cur.record, rerunOf: cur.rerunOf, values: grabInputs(), clean: cur.clean } : null;
  showSignIn('Your sign-in expired. Sign in again.');
}

/* ---------- leaving with unsaved changes ---------- */

function askGuard(next) {
  pendingGuard = next;
  ed.guardText.textContent = next === 'signout'
    ? 'You have changes that are not saved. Sign out anyway?'
    : 'You have changes that are not saved. Leave without saving?';
  ed.discard.textContent = next === 'signout' ? 'Discard and sign out' : 'Discard changes';
  ed.guard.hidden = false;
  window.scrollTo(0, 0);
  ed.keep.focus();
}

function leaveEditor(force = false, note = '') {
  if (!force && isDirty()) return askGuard('back');
  resetEditor();
  show('dash');
  render();
  if (note) toast(note);
  el.newBtn.focus();
}

ed.keep.addEventListener('click', () => { ed.guard.hidden = true; pendingGuard = null; ed.h.focus(); });
ed.discard.addEventListener('click', () => {
  const next = pendingGuard;
  ed.guard.hidden = true;
  pendingGuard = null;
  if (next === 'signout') { resetEditor(); signOut(); } else leaveEditor(true);
});
ed.back.addEventListener('click', () => leaveEditor());

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- delete a draft ---------- */

ed.del.addEventListener('click', () => { ed.delGuard.hidden = false; ed.delNo.focus(); });
ed.delNo.addEventListener('click', () => { ed.delGuard.hidden = true; ed.del.focus(); });
ed.delYes.addEventListener('click', async () => {
  if (!cur.record) return;
  ed.delYes.disabled = true;
  let out;
  try {
    out = await api(ROUTES.apiDelete, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cur.record.id })
    });
  } catch { out = null; }
  ed.delYes.disabled = false;
  if (!out) return toast('Could not reach the server. Nothing was deleted.', true);
  if (out.res.status === 401) return kickToSignIn();
  if (!out.res.ok) { ed.delGuard.hidden = true; return showErrors((out.body && out.body.error) || `Not deleted (${out.res.status}).`); }
  const name = cur.record.name;
  offers = offers.filter((x) => x.id !== cur.record.id);
  leaveEditor(true, `Deleted the draft "${name}".`);
});

/* ---------- wiring ---------- */

ed.form.addEventListener('input', (e) => {
  const t = e.target;
  if (t.closest('[data-err]') === null) {
    const slot = t.closest('.oa-f, td')?.querySelector('.oa-ferr');
    if (slot && slot.dataset.server) { slot.textContent = ''; delete slot.dataset.server; t.removeAttribute('aria-invalid'); }
  }
  if (t === ed.slug) slugHint();
  if ([ed.startD, ed.startT, ed.endD, ed.endT].includes(t)) showDateWords();
  counters();
  renderPreview();
});
ed.form.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'audience' || t === ed.formOn || t.dataset.show !== undefined) syncAll();
  else renderPreview();
});
ed.slug.addEventListener('blur', () => { tidySlug(); slugHint(); renderPreview(); });
ed.form.addEventListener('submit', (e) => e.preventDefault());
ed.saveDraft.addEventListener('click', () => save(true));
ed.saveSched.addEventListener('click', () => save(false));
ed.pvCopy.addEventListener('click', async () => {
  toast(await copyText(ed.pvUrl.textContent) ? 'Copied the preview link. Keep it private.' : 'Could not copy. Select the link instead.');
});

/* ---------- saved versions ---------- */

const ACTION_WORDS = { save: 'a save', delete: 'a delete', restore: 'a restore' };

async function openVersions() {
  show('versions');
  ed.vH.focus();
  ed.vList.replaceChildren(make('p', 'oa-muted', 'Loading saved versions\u2026'));
  let out;
  try { out = await api(ROUTES.apiRestore); } catch { out = null; }
  if (out && out.res.status === 401) return showSignIn('Your sign-in has expired. Sign in again.');
  if (!out || !out.res.ok || !out.body || !Array.isArray(out.body.versions)) {
    const p = make('p', 'oa-summary-err', (out && out.body && out.body.error) || 'Could not load the saved versions.');
    const again = make('button', 'oa-btn oa-btn-sm', 'Try again');
    again.type = 'button';
    again.addEventListener('click', openVersions);
    return ed.vList.replaceChildren(p, again);
  }
  const vs = out.body.versions;
  if (!vs.length) return ed.vList.replaceChildren(make('p', 'oa-empty', 'No saved versions yet. One is kept every time an offer is saved.'));
  ed.vList.replaceChildren(...vs.map(versionRow));
}

function versionRow(v) {
  const row = make('div', 'oa-v');
  const main = make('div', 'oa-v-main');
  const when = v.replacedAt ? `${eastern(v.replacedAt)} ET` : 'Unknown time';
  main.append(make('div', 'oa-v-when', when));
  const about = offers.find((x) => x.id === v.offerId) || v.offers.find((x) => x.id === v.offerId);
  const cause = `Kept before ${ACTION_WORDS[v.action] || 'a change'}${about ? ` of "${about.name}"` : ''}.`;
  const held = v.readable
    ? ` Holds ${v.count} offer${v.count === 1 ? '' : 's'}${v.count ? ': ' + v.offers.map((x) => x.name + (x.draft ? ' (draft)' : '')).join(', ') : ''}.`
    : ' This version could not be read.';
  main.append(make('div', 'oa-v-what', cause + held));
  row.append(main);
  if (!v.readable) return row;
  const btn = make('button', 'oa-btn oa-btn-sm', 'Put this back');
  btn.type = 'button';
  const guard = make('div', 'oa-guard');
  guard.hidden = true;
  guard.setAttribute('role', 'alert');
  guard.append(make('p', null, `Replace every offer with this version from ${when}? Running offers change within about a minute. The current list is kept first, so this can be undone.`));
  const gb = make('div', 'oa-guard-btns');
  const no = make('button', 'oa-btn oa-btn-sm', 'Cancel');
  const yes = make('button', 'oa-btn oa-btn-sm oa-btn-danger', 'Put it back');
  no.type = yes.type = 'button';
  gb.append(no, yes);
  guard.append(gb);
  btn.addEventListener('click', () => { guard.hidden = false; no.focus(); });
  no.addEventListener('click', () => { guard.hidden = true; btn.focus(); });
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    let out;
    try {
      out = await api(ROUTES.apiRestore, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: v.key })
      });
    } catch { out = null; }
    yes.disabled = false;
    if (!out) return toast('Could not reach the server. Nothing changed.', true);
    if (out.res.status === 401) return showSignIn('Your sign-in has expired. Sign in again.');
    if (!out.res.ok) return toast((out.body && out.body.error) || `Not restored (${out.res.status}).`, true);
    toast(`Put back the version from ${when}.`);
    await load({ quiet: true });
    show('dash');
    render();
  });
  row.append(btn, guard);
  return row;
}
ed.vBack.addEventListener('click', () => { show('dash'); render(); el.versionsBtn.focus(); });

buildFieldRows();
setupPreview();

el.newBtn.addEventListener('click', () => openEditor({}));
el.versionsBtn.addEventListener('click', () => openVersions());

load();
