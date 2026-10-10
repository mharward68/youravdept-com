// YAVD Offers Module: /api/offers/pages   GET list of site pages for the dropdown
// Session 1.4. Signed-in only. netlify.toml bundles the site's .html files into
// this function (included_files), so the list is always the deployed pages.
// In the bundle they sit at the bundle root, two folders above this file;
// locally they sit two folders above it too (the website folder).
//   200 { pages: [{ path: "/booth-proof.html", title: "..." }, ...] }
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePagePath } from '../../shared/offer-contract.js';
import { requireAdmin, json } from './lib/offers-auth.mjs';
import { BLOCKED_PAGES } from './lib/offers-rules.mjs';

const FOLDERS = ['', 'library', 'field-notes'];   // keep in step with included_files
let cached = null;

export function siteRoot() {
  const candidates = [
    fileURLToPath(new URL('../../', import.meta.url)),
    process.env.LAMBDA_TASK_ROOT,
    process.cwd()
  ].filter(Boolean);
  return candidates.find((c) => existsSync(join(c, 'index.html'))) ?? null;
}

function titleOf(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

export async function listPages(root) {
  const pages = [];
  for (const folder of FOLDERS) {
    let names;
    try { names = await readdir(join(root, folder)); } catch { continue; }
    for (const name of names.filter((n) => n.toLowerCase().endsWith('.html'))) {
      const path = normalizePagePath(folder ? `/${folder}/${name}` : `/${name}`);
      if (BLOCKED_PAGES.includes(path)) continue;
      let title = '';
      try { title = titleOf((await readFile(join(root, folder, name), 'utf8')).slice(0, 20000)); } catch { /* keep blank */ }
      pages.push({ path, title });
    }
  }
  return pages.sort((a, b) => (a.path === '/index.html' ? -1 : b.path === '/index.html' ? 1 : a.path.localeCompare(b.path)));
}

export default async (req) => {
  const refused = requireAdmin(req, { methods: ['GET'] });
  if (refused) return refused;
  try {
    if (!cached) {
      const root = siteRoot();
      if (!root) return json({ error: 'The page list is not available on this deploy.' }, 503);
      cached = await listPages(root);
    }
    return json({ pages: cached, count: cached.length });
  } catch (err) {
    console.error('offers-pages: unexpected error', err?.stack || err);
    return json({ error: 'Could not list the pages.' }, 500);
  }
};

export const config = { path: '/api/offers/pages' };
