// YAVD site admin: server side (2026-10-12)
//
// Used by the /api/offers/site/* routes. Not a function itself (see the note
// at the top of offers-auth.mjs about netlify/functions/lib/).
//
// What lives here
//   - listSitePages(): every deployed page, read from the .html files that
//     netlify.toml bundles into the functions (included_files). The site map
//     is built from this, so a new page shows up without anyone editing a list.
//   - linkReport(): before a takedown, everything on the site that points at
//     the page: links in other pages, mentions in page code, _redirects rules,
//     and offers attached to it.
//   - Takedown storage: Netlify Blobs store "site-takedowns" ("-test" off
//     production), key "all", one JSON array of { page, title, at }.
//     Writes use onlyIfMatch on the ETag, like offers-store.mjs, so two saves
//     at once cannot overwrite each other.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from '@netlify/blobs';
import { normalizePagePath, offerStatus } from '../../../shared/offer-contract.js';
import {
  NOT_IN_SITE_MAP, PAGE_FOLDERS, TAKEDOWN_KEY, pageGroup, pageLabel, prettyAddress, takedownStoreName
} from '../../../shared/site-admin.js';

/* ---------- where the deployed files are ---------- */

export function siteRoot() {
  const candidates = [
    fileURLToPath(new URL('../../../', import.meta.url)),   // local: the website folder
    fileURLToPath(new URL('../../', import.meta.url)),
    process.env.LAMBDA_TASK_ROOT,
    process.cwd()
  ].filter(Boolean);
  return candidates.find((c) => existsSync(join(c, 'index.html'))) ?? null;
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1] : '';
}

/** Every .html file in PAGE_FOLDERS: [{ page, file, html }]. Folder names are the page path. */
export async function readSiteFiles(root) {
  const out = [];
  for (const folder of PAGE_FOLDERS) {
    let names;
    try { names = await readdir(join(root, folder)); } catch { continue; }
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.html')).sort()) {
      const page = normalizePagePath(folder ? `/${folder}/${name}` : `/${name}`);
      let html = '';
      try { html = await readFile(join(root, folder, name), 'utf8'); } catch { /* unreadable: blank */ }
      out.push({ page, html });
    }
  }
  return out;
}

/** The site map list (no takedown state). */
export function pagesFrom(files) {
  return files
    .filter((f) => !NOT_IN_SITE_MAP.includes(f.page))
    .map((f) => ({
      page: f.page,
      address: prettyAddress(f.page),
      title: pageLabel(f.page, titleOf(f.html.slice(0, 20000))),
      group: pageGroup(f.page)
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
}

/* ---------- what points at a page ---------- */

const ORIGIN = 'https://site.invalid';

/** The page an href lands on, or null when it leaves the site or is not a page. */
export function hrefTarget(href, fromPage) {
  const h = String(href || '').trim();
  if (!h || h.startsWith('#') || /^(mailto|tel|sms|javascript|data):/i.test(h)) return null;
  let u;
  try { u = new URL(h, ORIGIN + fromPage); } catch { return null; }
  if (u.origin !== ORIGIN && !/^(www\.)?youravdept\.com$/i.test(u.hostname)) return null;
  const last = u.pathname.split('/').pop();
  if (last.includes('.') && !last.toLowerCase().endsWith('.html')) return null;   // pdf, png, vcf...
  return normalizePagePath(u.pathname);
}

/** Quoted strings in a page that look like a path to the target but are not hrefs (JS, data attributes). */
function codeMentions(html, target) {
  const base = prettyAddress(target).replace(/^\/+|\/+$/g, '');
  if (!base) return 0;
  const esc = base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(`(?<!href\\s*=\\s*)["'\`](?:https?://(?:www\\.)?youravdept\\.com)?(?:\\.\\./|/)?${esc}(?:\\.html)?/?(?:[?#][^"'\`]*)?["'\`]`, 'gi');
  return (html.match(re) || []).length;
}

/**
 * Everything on the site that points at `target`.
 * Returns { page, linkedFrom: [{ page, address, title, count }], mentionedIn: [...same],
 *           redirects: [{ line, from, to }], offers: [{ id, name, status }] }
 */
export function linkReport(files, target, { redirectsText = '', offers = [], now = new Date() } = {}) {
  const t = normalizePagePath(target);
  const linkedFrom = [];
  const mentionedIn = [];
  for (const f of files) {
    if (f.page === t) continue;                          // its own links vanish with it
    let count = 0;
    for (const m of f.html.matchAll(/\bhref\s*=\s*(["'])(.*?)\1/gis)) {
      if (hrefTarget(m[2], f.page) === t) count++;
    }
    const entry = { page: f.page, address: prettyAddress(f.page), title: pageLabel(f.page, titleOf(f.html.slice(0, 20000))) };
    if (count) linkedFrom.push({ ...entry, count });
    const code = codeMentions(f.html, t);
    if (code) mentionedIn.push({ ...entry, count: code });
  }

  const redirects = [];
  for (const raw of String(redirectsText).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to] = line.split(/\s+/);
    if (!from || !to || !to.startsWith('/')) continue;
    if (normalizePagePath(to) !== t) continue;
    if (normalizePagePath(from) === t) continue;          // the page's own short address
    redirects.push({ line, from, to });
  }

  const attached = (Array.isArray(offers) ? offers : [])
    .filter((o) => o && typeof o.page === 'string' && normalizePagePath(o.page) === t)
    .map((o) => ({ id: o.id, name: o.name, status: safeStatus(o, now), slug: o.slug || '' }));

  return { page: t, address: prettyAddress(t), linkedFrom, mentionedIn, redirects, offers: attached };
}

function safeStatus(o, now) { try { return offerStatus(o, now); } catch { return 'draft'; } }

/** Offers that block a takedown: anything a visitor could see now or later. */
export function blockingOffers(report) {
  return report.offers.filter((o) => o.status === 'running' || o.status === 'upcoming');
}

/* ---------- takedown storage ---------- */

export class TakedownError extends Error {
  constructor(message, status = 503) { super(message); this.status = status; }
}

let storeFactory = (deployContext) =>
  getStore({ name: takedownStoreName(deployContext), consistency: 'strong' });

/** Tests only. */
export function _setTakedownStoreFactoryForTests(fn) { storeFactory = fn; }

export function takedownStore(deployContext) {
  try { return storeFactory(deployContext); } catch (err) {
    console.error('site-admin: cannot open takedown store', err?.message);
    throw new TakedownError('Takedown storage is unavailable right now. Nothing was changed. Try again in a minute.');
  }
}

export async function loadTakedowns(store) {
  let res;
  try {
    res = await store.getWithMetadata(TAKEDOWN_KEY, { type: 'json', consistency: 'strong' });
  } catch (err) {
    console.error('site-admin: takedown read failed', err?.message);
    throw new TakedownError('Could not read the taken-down pages right now. Try again in a minute.');
  }
  if (!res) return { list: [], etag: undefined, exists: false };
  if (!Array.isArray(res.data)) {
    throw new TakedownError('The stored takedown list is not in the expected format, so nothing was changed.', 500);
  }
  return { list: res.data, etag: res.etag, exists: true };
}

/** change(list) -> { list, result } to save, or { stop } to save nothing. Retries on a clash. */
export async function changeTakedowns(store, change) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cur = await loadTakedowns(store);
    const next = change(structuredClone(cur.list));
    if (!next || 'stop' in next) return { saved: false, stop: next?.stop };
    let w;
    try {
      w = await store.setJSON(TAKEDOWN_KEY, next.list, cur.exists ? { onlyIfMatch: cur.etag } : { onlyIfNew: true });
    } catch (err) {
      console.error('site-admin: takedown write failed', err?.message);
      throw new TakedownError('Takedown storage is unavailable right now. Nothing was saved. Try again in a minute.');
    }
    if (w?.modified) return { saved: true, result: next.result };
  }
  throw new TakedownError('Another change happened at the same moment. Nothing was saved. Try again.', 409);
}
