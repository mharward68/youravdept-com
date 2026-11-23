// YAVD Offers Module: landing page renderer tests (Session 4.8, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landing-render.test.mjs
// Pure: no storage, no network, no browser. The look is judged by eye at 4.10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const T = await import('../../shared/landing-template.js');
const C = await import('../../shared/offer-contract.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMG_ID = 'ab'.repeat(16);

function landing(over = {}) {
  return {
    id: 'l1', name: 'Booth Proof 2026', slug: 'booth-proof-2026',
    eyebrow: 'Limited offer',
    headline: 'Your booth, proven before the show',
    body: 'We test every cable.\n\n- Audio\n- Video',
    image: { id: IMG_ID, alt: 'A booth on a show floor', placement: 'top', width: 1600, height: 900, type: 'image/webp', bytes: 1234 },
    ctaLabel: 'Book a call',
    ctaUrl: 'https://calendar.app.google/Do7aNUGLhraagUKV6',
    status: 'live', previewKey: 'k'.repeat(32),
    createdAt: '2026-11-23T15:00:00.000Z', updatedAt: '2026-11-23T15:00:00.000Z', archivedAt: null,
    ...over
  };
}

const render = (over, opts = { state: 'running' }) => T.renderLanding(landing(over), opts);
const count = (s, re) => (s.match(re) || []).length;
const sha = (s) => 'sha256-' + crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const hasCta = (html) => html.includes('class="yl-btn"');
/** Real tags only: every < from the record is escaped, so these are the template's own. */
/** Quoted values are emptied (a " inside one is always escaped), so only attribute names remain. */
const tags = (html) => (html.match(/<[a-z][^>]*>/gi) || []).map((t) => t.replace(/"[^"]*"/g, '""'));

const EVIL = `<script>alert(1)</script>"'&<img src=x onerror=alert(2)>`;

test('every field is escaped: typed HTML renders as text, never as markup', () => {
  const { html } = render({
    name: EVIL, eyebrow: EVIL, headline: EVIL, body: `${EVIL}\n\n- ${EVIL}`, ctaLabel: EVIL,
    image: { id: IMG_ID, alt: EVIL, placement: 'top', width: 10, height: 10 }
  });
  assert.equal(html.includes('<script>alert'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(tags(html).some((t) => /\son[a-z]+=/i.test(t)), false, 'no event handler attribute on any tag');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;&lt;img src=x onerror=alert(2)&gt;'));
  // Only the template's own script tags: the analytics pair on a running page.
  assert.equal(count(html, /<script\b/g), 2);
  // Only the template's own img tags: the emblem and the picture.
  assert.equal(count(html, /<img\b/g), 2);
});

test('no inline style attributes (the CSP would block them) and no stored HTML passes through', () => {
  for (const state of ['running', 'expired', 'archived', 'draft']) {
    const { html } = render({ body: '<b style="color:red">x</b>' }, { state, isPreview: state === 'draft' });
    assert.equal(tags(html).some((t) => /\sstyle=/i.test(t)), false, state);
    assert.equal(html.includes('<b style'), false, state);
  }
});

test('formatting tags become fixed class names; unknown tags stay text', () => {
  const { html } = render({ headline: '[b][color=teal]Half price[/color][/b] [color=red]x[/color]', body: '[s]$11,250[/s] [hl=teal]$5,625[/hl]' });
  assert.ok(html.includes('<h1><span class="yf-b yf-color-teal">Half price</span> [color=red]x[/color]</h1>'));
  assert.ok(html.includes('<span class="yf-s">$11,250</span> <span class="yf-hl-teal">$5,625</span>'));
});

test('body: blank lines make paragraphs, bullets make a list, single breaks stay', () => {
  const { html } = render({ body: 'Line one\nline two\n\n- Audio\n- Video\n\nLast' });
  assert.ok(html.includes('<p>Line one<br>line two</p>'));
  assert.ok(html.includes('<ul>\n<li>Audio</li>\n<li>Video</li>\n</ul>'));
  assert.ok(html.includes('<p>Last</p>'));
});

test('a long headline and body are kept whole and set to wrap', () => {
  const word = 'Supercalifragilistic'.repeat(10);
  const headline = `${word} and a very long headline that keeps going `.repeat(2).trim();
  const body = Array.from({ length: 40 }, (_, i) => `Sentence ${i} with ${word}.`).join(' ');
  const { html } = render({ headline, body });
  assert.ok(html.includes(`<h1>${headline}</h1>`));
  assert.ok(html.includes(body));
  assert.match(T.STYLE, /\.yl-hero h1\{[^}]*overflow-wrap:anywhere/);
  assert.match(T.STYLE, /\.yl-copy\{[^}]*overflow-wrap:anywhere/);
  assert.match(T.STYLE, /\.yl-btn\{[^}]*overflow-wrap:anywhere/);
});

test('no picture: the page still renders, with no picture tag and no share image', () => {
  for (const image of [null, undefined, {}, { id: 'not-an-id', alt: 'x' }]) {
    const { html } = render({ image });
    assert.equal(html.includes('/api/offers/image/'), false);
    assert.equal(html.includes('class="yl-pic"'), false);
    assert.equal(count(html, /<h1\b/g), 1);
    assert.ok(html.trimEnd().endsWith('</html>'));
    assert.ok(hasCta(html));
  }
});

test('picture: the stored id, its alt text and its size', () => {
  const { html } = render();
  assert.ok(html.includes(`<img src="${C.imageUrl(IMG_ID)}" alt="A booth on a show floor" width="1600" height="900">`));
  assert.ok(html.includes(`<meta property="og:image" content="https://youravdept.com${C.imageUrl(IMG_ID)}">`));
});

test('admin preview picture: blob: and data:image allowed, anything else falls back to the stored id', () => {
  const blob = 'blob:https://youravdept.com/1234-abcd';
  assert.ok(render({}, { state: 'draft', isPreview: true, imageSrc: blob }).html.includes(`<img src="${blob}"`));
  const data = 'data:image/webp;base64,UklGRg==';
  assert.ok(render({}, { state: 'draft', isPreview: true, imageSrc: data }).html.includes(`<img src="${data}"`));
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHA+', 'https://evil.example/x.png', '//evil.example/x', '/x" onerror="y']) {
    const { html } = render({}, { state: 'draft', isPreview: true, imageSrc: bad });
    assert.ok(html.includes(`<img src="${C.imageUrl(IMG_ID)}"`), bad);
  }
});

test('call to action: shown while running, hidden when expired or archived', () => {
  const run = render().html;
  assert.ok(run.includes('<a class="yl-btn" href="https://calendar.app.google/Do7aNUGLhraagUKV6">Book a call</a>'));
  for (const state of ['expired', 'archived']) {
    const { html } = render({}, { state });
    assert.equal(hasCta(html), false, state);
  }
  for (const state of ['before', 'draft']) assert.ok(hasCta(render({}, { state }).html), state);
});

test('expired and archived pages carry the expiration data and the 4.10 asset tags; others do not', () => {
  for (const state of ['expired', 'archived']) {
    const { html } = render({}, { state });
    const m = html.match(new RegExp(`<script type="application/json" id="${T.EXPIRED_DATA_ID}">(.*?)</script>`));
    assert.ok(m, state);
    const data = JSON.parse(m[1]);
    assert.equal(data.text, C.LANDING_EXPIRED.text);
    assert.equal(data.buttonLabel, C.LANDING_EXPIRED.buttonLabel);
    assert.equal(data.buttonUrl, C.LANDING_EXPIRED.buttonUrl);
    assert.equal(data.email, C.LANDING_EXPIRED.email);
    assert.equal(data.state, state);
    assert.ok(html.includes(`<link rel="stylesheet" href="${T.EXPIRED_ASSETS.css}">`));
    assert.ok(html.includes(`<script src="${T.EXPIRED_ASSETS.js}" defer></script>`));
    assert.equal(count(html, /<script\b/g), 4, 'analytics pair, data block, popup script');
  }
  for (const state of ['running', 'before', 'draft']) {
    const { html } = render({}, { state });
    assert.equal(html.includes(T.EXPIRED_DATA_ID), false, state);
    assert.equal(html.includes('landing-expired'), false, state);
  }
});

test('exactly one H1 in every state', () => {
  for (const state of ['running', 'expired', 'archived', 'before', 'draft']) {
    for (const over of [{}, { headline: '' }, { eyebrow: '' }, { image: null }]) {
      const { html } = render(over, { state });
      assert.equal(count(html, /<h1\b/g), 1, `${state} ${JSON.stringify(over)}`);
    }
  }
});

test('noindex as a header and as a meta tag; nosniff; CSP', () => {
  const { html, headers } = render();
  assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(headers['Content-Security-Policy'], T.CSP);
});

test('CSP: only self scripts, the analytics host and the font hosts; inline code by hash only', () => {
  const csp = T.CSP;
  assert.equal(csp.includes('unsafe-inline'), false);
  assert.equal(csp.includes('unsafe-eval'), false);
  const dir = Object.fromEntries(csp.split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));
  assert.deepEqual(dir['default-src'], ["'none'"]);
  assert.deepEqual(dir['script-src'], ["'self'", `'${T.GA_HASH}'`, 'https://*.googletagmanager.com']);
  assert.deepEqual(dir['style-src'], ["'self'", `'${T.STYLE_HASH}'`, 'https://fonts.googleapis.com']);
  assert.deepEqual(dir['font-src'], ['https://fonts.gstatic.com']);
  assert.deepEqual(dir['frame-ancestors'], ["'self'"]);
  assert.deepEqual(dir['base-uri'], ["'none'"]);
});

test('the two CSP hashes match the inline style and analytics script exactly', () => {
  assert.equal(T.STYLE_HASH, sha(T.STYLE), `STYLE changed: set STYLE_HASH to '${sha(T.STYLE)}'`);
  assert.equal(T.GA_HASH, sha(T.GA_INLINE), `GA_INLINE changed: set GA_HASH to '${sha(T.GA_INLINE)}'`);
  const { html } = render();
  assert.ok(html.includes(`<style>${T.STYLE}</style>`));
  assert.ok(html.includes(`<script>${T.GA_INLINE}</script>`));
  assert.equal(count(html, /<style\b/g), 1);
});

test('analytics tag as on the live site; fonts as on booth-proof.html', () => {
  const { html } = render();
  assert.ok(html.includes(`<script async src="https://www.googletagmanager.com/gtag/js?id=${T.GA_ID}"></script>`));
  assert.ok(T.GA_INLINE.includes(`gtag('config', '${T.GA_ID}');`));
  const bp = fs.readFileSync(path.join(ROOT, 'booth-proof.html'), 'utf8');
  const fontLink = bp.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)" rel="stylesheet">/)[1];
  assert.ok(html.includes(`<link href="${fontLink.replace(/&/g, '&amp;')}" rel="stylesheet">`));
  const root = bp.match(/:root\{[^}]+\}/)[0];
  assert.ok(T.STYLE.includes(root), 'brand tokens copied exactly');
});

test('cache: 60 seconds for public pages, no-store for previews; previews carry no analytics', () => {
  assert.equal(render().headers['Cache-Control'], 'public, max-age=60');
  assert.equal(render({}, { state: 'expired' }).headers['Cache-Control'], 'public, max-age=60');
  const p = render({ status: 'draft' }, { state: 'draft', isPreview: true });
  assert.equal(p.headers['Cache-Control'], 'private, no-store');
  assert.equal(p.html.includes('googletagmanager'), false);
  assert.equal(count(p.html, /<script\b/g), 0);
  assert.ok(p.html.includes('Draft preview: visitors cannot see this page until it is Live.'));
  assert.equal(render().html.includes('Draft preview'), false);
});

test('call to action scheme re-checked at render (defence in depth)', () => {
  const ok = ['https://calendar.app.google/x', '/contact', '/booth-proof?x=1&y=2', 'https://youravdept.com/a#b'];
  for (const url of ok) assert.ok(hasCta(render({ ctaUrl: url }).html), url);
  assert.ok(render({ ctaUrl: '/booth-proof?x=1&y=2' }).html.includes('href="/booth-proof?x=1&amp;y=2"'));
  const bad = [
    'javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,hi', 'vbscript:x',
    'http://youravdept.com/', '//evil.example/', '/\\evil.example', 'https://x.example/"onmouseover="a',
    "https://x.example/'a", 'https://x.example/ a', 'https://', 'mailto:michaelh@youravdept.com',
    'ftp://x.example/', 'contact', '', null, undefined, 42, { href: 'https://x' }, `https://x.example/${'a'.repeat(500)}`
  ];
  for (const url of bad) assert.equal(hasCta(render({ ctaUrl: url }).html), false, String(url));
  assert.equal(hasCta(render({ ctaLabel: '' }).html), false, 'no label, no button');
});

test('safeCtaUrl directly', () => {
  assert.equal(T.safeCtaUrl('https://a.example/x'), 'https://a.example/x');
  assert.equal(T.safeCtaUrl('/x'), '/x');
  assert.equal(T.safeCtaUrl('http://a.example/'), null);
  assert.equal(T.safeCtaUrl('java\tscript:alert(1)'), null);
});

test('output is identical on two runs (no clock, no randomness)', () => {
  for (const state of ['running', 'expired', 'archived', 'draft']) {
    const a = render({}, { state, isPreview: state === 'draft' });
    const b = render({}, { state, isPreview: state === 'draft' });
    assert.equal(a.html, b.html, state);
    assert.deepEqual(a.headers, b.headers, state);
  }
});

test('title, description and share tags are plain text from the record', () => {
  const { html } = render({ headline: '[b]Half[/b] price', body: '[i]Fast[/i] setup. '.repeat(30) });
  assert.ok(html.includes('<title>Half price | Your AV Department</title>'));
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.ok(desc.length <= 155 && desc.startsWith('Fast setup.') && desc.endsWith('...'), desc);
  assert.ok(html.includes('<meta property="og:url" content="https://youravdept.com/offers/landing-booth-proof-2026.html">'));
  assert.ok(render({}, { state: 'running', origin: 'https://offers--your-av-dept.netlify.app' }).html
    .includes('content="https://offers--your-av-dept.netlify.app/offers/landing-booth-proof-2026.html"'));
  assert.ok(render({}, { state: 'running', origin: 'javascript:x' }).html.includes('content="https://youravdept.com/offers/'));
});

test('header logo links home; footer has the business name, email and site', () => {
  const { html } = render();
  assert.match(html, /<a class="yl-brand" href="https:\/\/youravdept\.com\/"><img src="data:image\/webp;base64,[A-Za-z0-9+/=]+" alt="" width="40" height="40">Your AV Department<\/a>/);
  assert.ok(html.includes('<a href="mailto:michaelh@youravdept.com">michaelh@youravdept.com</a>'));
  assert.ok(html.includes('<a href="https://youravdept.com/">youravdept.com</a>'));
});

test('a missing or odd record still gives a complete page', () => {
  for (const l of [null, undefined, {}, 'x', []]) {
    const { html, headers } = T.renderLanding(l, { state: 'running' });
    assert.equal(count(html, /<h1\b/g), 1);
    assert.equal(headers['X-Robots-Tag'], 'noindex, nofollow');
  }
});

test('the template module is browser-safe: imports only the shared contract and format files', () => {
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'landing-template.js'), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['./offer-contract.js', './offer-format.js']);
  assert.equal(/\b(process|require|Buffer|node:)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), false);
  assert.ok(Buffer.byteLength(src) < 60 * 1024, 'one small file');
});
