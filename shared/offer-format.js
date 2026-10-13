/**
 * YAVD Offers Module: text formatting for offer copy (added 2026-10-12,
 * contract 1.2.0, Michael's request: eyebrow plus font, color, size, bold,
 * italic, underline, strikethrough and highlight).
 *
 * Offer text stays plain text. Formatting travels as a small set of square
 * bracket tags inside that text, for example:
 *     [s]$11,250[/s] [b][color=teal]$5,625[/color][/b]
 *
 * Only the tags and values listed below are formatting. Anything else in
 * square brackets is ordinary text and shows exactly as typed. Nothing here
 * ever becomes HTML: the popup and the admin build every piece with
 * createElement and textContent, and each style is a fixed class name from
 * the lists below (CSS in /assets/offer-panel.css).
 *
 * Bullets: a line that starts with "- ", "* " or the bullet character
 * becomes a bulleted list item in the popup.
 *
 * Pure ES module, no imports. Loaded by Netlify Functions (Node), the
 * popup and the admin (browser).
 */

export const FORMAT_VERSION = '1.0.0';

/** Font choices. Keys are what is stored; labels are what the admin shows. */
export const FONTS = Object.freeze({
  heading: 'Montserrat (headings)',
  body: 'Inter (body)'
});

/** Brand palette only (Your AV Department style guide). */
export const COLORS = Object.freeze({
  navy: { label: 'AV Navy', hex: '#152B4A' },
  teal: { label: 'Signal Teal', hex: '#2AA4A2' },
  tealdark: { label: 'Dark Teal (easier to read small)', hex: '#1F7F7D' },
  gray: { label: 'Slate Gray', hex: '#4A5B73' },
  white: { label: 'White (use on a Navy highlight)', hex: '#FFFFFF' }
});

export const HIGHLIGHTS = Object.freeze({
  teal: { label: 'Teal tint', hex: '#D4EFEE' },
  navytint: { label: 'Navy tint', hex: '#E3E8EF' },
  navy: { label: 'AV Navy (pair with White text)', hex: '#152B4A' },
  teal2: { label: 'Signal Teal (pair with Navy text)', hex: '#2AA4A2' }
});

/** Sizes are relative to the field's normal size, so they work in every field. */
export const SIZES = Object.freeze({
  xs: { label: 'Extra small', em: 0.75 },
  s: { label: 'Small', em: 0.875 },
  l: { label: 'Large', em: 1.25 },
  xl: { label: 'Extra large', em: 1.6 },
  xxl: { label: 'Huge', em: 2 }
});

/** On or off styles, in the fixed order tags are written. */
export const TOGGLES = Object.freeze(['b', 'i', 'u', 's']);
/** Styles with a value, in the fixed order tags are written. */
export const VALUED = Object.freeze({ font: FONTS, size: SIZES, color: COLORS, hl: HIGHLIGHTS });
export const STYLE_KEYS = Object.freeze([...TOGGLES, ...Object.keys(VALUED)]);

const TAG_RE = /\[(\/?)(b|i|u|s|font|size|color|hl)(?:=([a-z0-9]+))?\]/g;
const BULLET_RE = /^(?:[-*]|•)\s+/;

function validOpen(name, value) {
  if (TOGGLES.includes(name)) return value === undefined;
  const list = VALUED[name];
  return !!list && typeof value === 'string' && Object.prototype.hasOwnProperty.call(list, value);
}

/** A style object with only real keys and values. {} = normal text. */
export function cleanStyle(st) {
  const out = {};
  if (!st || typeof st !== 'object') return out;
  for (const k of TOGGLES) if (st[k] === true) out[k] = true;
  for (const k of Object.keys(VALUED)) if (validOpen(k, st[k])) out[k] = st[k];
  return out;
}

export function sameStyle(a, b) {
  for (const k of STYLE_KEYS) if ((a[k] || null) !== (b[k] || null)) return false;
  return true;
}

/**
 * Markup to runs: [{ text, st }]. Lenient: a closing tag with no matching
 * opening tag, or an unknown tag or value, is kept as text. A tag left open
 * runs to the end of the text.
 */
export function parseMarkup(input) {
  const s = typeof input === 'string' ? input : '';
  const runs = [];
  const stack = [];   // [{ name, value }]
  let last = 0;
  const styleNow = () => {
    const st = {};
    for (const t of stack) st[t.name] = t.value === undefined ? true : t.value;
    return st;
  };
  const push = (text) => {
    if (!text) return;
    const st = styleNow();
    const prev = runs[runs.length - 1];
    if (prev && sameStyle(prev.st, st)) prev.text += text;
    else runs.push({ text, st });
  };
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(s))) {
    const [whole, slash, name, value] = m;
    let closeAt = -1;
    if (slash) {
      if (value === undefined) {
        for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === name) { closeAt = i; break; }
      }
      if (closeAt < 0) continue;            // stray closer: ordinary text
    } else if (!validOpen(name, value)) {
      continue;                             // unknown value: ordinary text
    }
    push(s.slice(last, m.index));           // text before the tag, in the style before it
    last = m.index + whole.length;
    if (slash) stack.splice(closeAt, 1);
    else stack.push({ name, value });       // a second tag of a kind wins until it closes
  }
  push(s.slice(last));
  return runs;
}

/** Runs to markup, canonical: tags in a fixed order, adjacent equal runs merged. */
export function serializeRuns(runs) {
  const merged = [];
  for (const r of runs || []) {
    if (!r || typeof r.text !== 'string' || !r.text) continue;
    const st = cleanStyle(r.st);
    const prev = merged[merged.length - 1];
    if (prev && sameStyle(prev.st, st)) prev.text += r.text;
    else merged.push({ text: r.text, st });
  }
  let out = '';
  for (const r of merged) {
    const open = [];
    const close = [];
    for (const k of TOGGLES) if (r.st[k]) { open.push(`[${k}]`); close.unshift(`[/${k}]`); }
    for (const k of Object.keys(VALUED)) if (r.st[k]) { open.push(`[${k}=${r.st[k]}]`); close.unshift(`[/${k}]`); }
    if (!open.length) { out += r.text; continue; }
    // Line breaks close and reopen the tags, so every line stands on its own.
    out += r.text.split('\n').map((part) => (part ? open.join('') + part + close.join('') : '')).join('\n');
  }
  return out;
}

/** Same meaning, canonical spelling. What the server stores. */
export function normalizeMarkup(s) { return serializeRuns(parseMarkup(s)); }

/** The words a visitor reads, with every formatting tag removed. */
export function plainFromMarkup(s) { return parseMarkup(s).map((r) => r.text).join(''); }

export function hasFormatting(s) { return parseMarkup(s).some((r) => Object.keys(r.st).length > 0); }

/** Class names for one run. Fixed names only. */
export function classesFor(st) {
  const c = [];
  const s = cleanStyle(st);
  for (const k of TOGGLES) if (s[k]) c.push(`yf-${k}`);
  for (const k of Object.keys(VALUED)) if (s[k]) c.push(`yf-${k}-${s[k]}`);
  return c;
}

/** Splits runs at line breaks: [[run, run], [run], ...] one entry per line. */
export function runsToLines(runs) {
  const lines = [[]];
  for (const r of runs) {
    r.text.split('\n').forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, st: r.st });
    });
  }
  return lines;
}

function lineText(line) { return line.map((r) => r.text).join(''); }

/** Removes the bullet marker from the start of a line of runs. */
function stripBullet(line) {
  const m = BULLET_RE.exec(lineText(line));
  if (!m) return line;
  let cut = m[0].length;
  const out = [];
  for (const r of line) {
    if (cut >= r.text.length) { cut -= r.text.length; continue; }
    out.push({ text: r.text.slice(cut), st: r.st });
    cut = 0;
  }
  return out;
}

/**
 * Layout for the popup. A blank line starts a new paragraph. Lines starting
 * with a bullet marker become list items. Returns
 *   [{ type: 'p', lines: [[run...], ...] } | { type: 'ul', items: [[run...], ...] }]
 */
export function toBlocks(markup) {
  const lines = runsToLines(parseMarkup(markup));
  const blocks = [];
  let cur = null;
  for (const line of lines) {
    const text = lineText(line);
    if (!text.trim()) { cur = null; continue; }
    if (BULLET_RE.test(text)) {
      if (!cur || cur.type !== 'ul') { cur = { type: 'ul', items: [] }; blocks.push(cur); }
      cur.items.push(stripBullet(line));
    } else {
      if (!cur || cur.type !== 'p') { cur = { type: 'p', lines: [] }; blocks.push(cur); }
      cur.lines.push(line);
    }
  }
  return blocks;
}

/**
 * Builds DOM for formatted text. doc = the document to build in (the admin
 * preview builds inside an iframe). Only createElement, textContent and
 * fixed class names.
 */
export function appendRuns(doc, parent, runs) {
  for (const r of runs) {
    const parts = r.text.split('\n');
    const cls = classesFor(r.st);
    parts.forEach((part, i) => {
      if (i) parent.appendChild(doc.createElement('br'));
      if (!part) return;
      if (!cls.length) { parent.appendChild(doc.createTextNode(part)); return; }
      const span = doc.createElement('span');
      span.className = cls.join(' ');
      span.textContent = part;
      parent.appendChild(span);
    });
  }
}

/** Fills parent with paragraphs and lists for body copy. */
export function renderBlocks(doc, parent, markup) {
  for (const b of toBlocks(markup)) {
    if (b.type === 'p') {
      const p = doc.createElement('p');
      b.lines.forEach((line, i) => {
        if (i) p.appendChild(doc.createElement('br'));
        appendRuns(doc, p, line);
      });
      parent.appendChild(p);
    } else {
      const ul = doc.createElement('ul');
      for (const item of b.items) {
        const li = doc.createElement('li');
        appendRuns(doc, li, item);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
    }
  }
}

/** Fills parent with one line of formatted text (eyebrow, headline). */
export function renderInline(doc, parent, markup) {
  appendRuns(doc, parent, parseMarkup(String(markup || '').replace(/\n+/g, ' ')));
}
