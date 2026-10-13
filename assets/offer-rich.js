// YAVD Offers Module: formatted text fields for the offer editor
// (added 2026-10-12, contract 1.2.0). Used for the eyebrow, headline and
// offer copy in /offer-admin.
//
// What Michael sees: a small toolbar (font, size, color, highlight, bold,
// italic, underline, strikethrough, bullets, clear) above a box that shows
// the formatting as he types. Select words and use the toolbar to format
// them; with nothing selected the toolbar formats the whole field.
//
// How it works: the field's real value is a list of characters, each with
// its style. The box on screen is redrawn from that list with createElement
// and fixed class names only, so nothing typed or pasted is ever treated as
// HTML. Paste is plain text. The value handed to the server is the
// bracket-tag text defined in /shared/offer-format.js.
//
// Keep this file ASCII (use \u escapes).

import {
  FONTS, SIZES, COLORS, HIGHLIGHTS, TOGGLES, VALUED,
  parseMarkup, serializeRuns, cleanStyle, sameStyle, classesFor
} from '/shared/offer-format.js';

const BULLET = '• ';
const BULLET_RE = /^(?:[-*]|•)\s+/;
const UNDO_KEEP = 100;

/** Class names back to a style (also works on spans the browser copied). */
function styleFromClasses(node) {
  const st = {};
  if (!node.classList) return st;
  for (const c of node.classList) {
    const m = /^yf-([a-z]+)(?:-([a-z0-9]+))?$/.exec(c);
    if (!m) continue;
    if (m[2] === undefined && TOGGLES.includes(m[1])) st[m[1]] = true;
    else if (m[2] !== undefined && VALUED[m[1]] && Object.prototype.hasOwnProperty.call(VALUED[m[1]], m[2])) st[m[1]] = m[2];
  }
  return st;
}

function make(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export class RichField {
  /**
   * @param {object} o
   * @param {string} o.id          id for the editable box (labels point at it)
   * @param {string} o.label       field name for the toolbar's accessible name
   * @param {string} o.kind        'eyebrow' | 'headline' | 'body' (look of the box)
   * @param {boolean} o.multiline
   * @param {number} o.max         characters a visitor reads (counter only; the server enforces)
   * @param {string} [o.placeholder]
   * @param {boolean} [o.bullets]  show the bullet button
   */
  constructor(o) {
    this.o = o;
    this.chars = [];          // [{ c, st }]
    this.sel = null;          // { start, end } while this field owns the selection
    this.composing = false;
    this.undo = [];
    this.redo = [];
    this.lastSaved = '';

    this.wrap = make('div', 'oa-rich-wrap');
    this.bar = make('div', 'oa-rtb');
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', `Formatting for ${o.label}`);
    this.el = make('div', 'oa-rich');
    this.el.id = o.id;
    this.el.contentEditable = 'true';
    this.el.setAttribute('role', 'textbox');
    this.el.setAttribute('aria-multiline', String(!!o.multiline));
    this.el.setAttribute('spellcheck', 'true');
    this.el.dataset.kind = o.kind;
    if (o.placeholder) this.el.dataset.placeholder = o.placeholder;
    this.count = make('span', 'oa-count-note');
    this.count.setAttribute('aria-hidden', 'true');
    this.buildBar();
    this.wrap.append(this.bar, this.el, this.count);
    this.wire();
  }

  /* ---------- value ---------- */

  get value() { return serializeRuns(this.runs()); }
  set value(markup) {
    this.chars = [];
    for (const r of parseMarkup(markup || '')) {
      const st = cleanStyle(r.st);
      for (const c of r.text) this.chars.push({ c, st });
    }
    if (!this.o.multiline) this.chars = this.chars.filter((x) => x.c !== '\n');
    this.undo = [];
    this.redo = [];
    this.lastSaved = this.value;
    this.sel = null;
    this.render();
    this.updateBar();
  }
  get text() { return this.chars.map((x) => x.c).join(''); }
  focus() { this.el.focus(); }

  runs() {
    const out = [];
    for (const ch of this.chars) {
      const prev = out[out.length - 1];
      if (prev && sameStyle(prev.st, ch.st)) prev.text += ch.c;
      else out.push({ text: ch.c, st: ch.st });
    }
    return out;
  }

  /* ---------- toolbar ---------- */

  buildBar() {
    const sel = (key, first, list, title) => {
      const s = make('select', 'oa-rtb-sel');
      s.dataset.key = key;
      s.title = title;
      s.setAttribute('aria-label', `${title} (${this.o.label})`);
      s.append(new Option(first, ''));
      for (const [k, v] of Object.entries(list)) s.append(new Option(typeof v === 'string' ? v : v.label, k));
      s.addEventListener('change', () => { this.apply(key, s.value); });
      return s;
    };
    const btn = (key, text, title, cls = '') => {
      const b = make('button', `oa-rtb-btn ${cls}`.trim(), text);
      b.type = 'button';
      b.dataset.key = key;
      b.title = title;
      b.setAttribute('aria-label', `${title} (${this.o.label})`);
      if (TOGGLES.includes(key)) b.setAttribute('aria-pressed', 'false');
      // keep the selection in the text box
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => this.apply(key));
      return b;
    };
    this.ctl = {
      font: sel('font', 'Font', FONTS, 'Font'),
      size: sel('size', 'Size', SIZES, 'Size'),
      color: sel('color', 'Color', COLORS, 'Text color'),
      hl: sel('hl', 'Highlight', HIGHLIGHTS, 'Highlight'),
      b: btn('b', 'B', 'Bold', 'is-b'),
      i: btn('i', 'I', 'Italic', 'is-i'),
      u: btn('u', 'U', 'Underline', 'is-u'),
      s: btn('s', 'S', 'Strikethrough', 'is-s')
    };
    const sep = () => make('span', 'oa-rtb-sep');
    this.bar.append(this.ctl.font, this.ctl.size, this.ctl.color, this.ctl.hl, sep(),
      this.ctl.b, this.ctl.i, this.ctl.u, this.ctl.s);
    if (this.o.bullets) { this.bar.append(sep()); this.bar.append(btn('bullet', '• List', 'Bulleted list (selected lines)')); }
    this.bar.append(sep(), btn('clear', 'Clear', 'Clear formatting'));
  }

  /** The range the toolbar works on: the selection, or the whole field. */
  target() {
    const r = this.sel;
    if (r && r.end > r.start) return { start: r.start, end: r.end, whole: false };
    return { start: 0, end: this.chars.length, whole: true };
  }

  apply(key, value) {
    const t = this.target();
    const slice = this.chars.slice(t.start, t.end);
    this.remember();
    if (key === 'bullet') {
      this.toggleBullets(t);
    } else if (key === 'clear') {
      for (const ch of slice) ch.st = {};
    } else if (TOGGLES.includes(key)) {
      const all = slice.length > 0 && slice.every((ch) => ch.st[key]);
      for (const ch of slice) ch.st = cleanStyle({ ...ch.st, [key]: !all });
    } else {
      for (const ch of slice) {
        const st = { ...ch.st };
        if (value) st[key] = value; else delete st[key];
        ch.st = cleanStyle(st);
      }
    }
    const after = key === 'bullet' && !t.whole && this.sel ? this.sel : (t.whole ? null : { start: t.start, end: t.end });
    this.changed(after, true);
  }

  toggleBullets(t) {
    // starts of the non-empty lines the range touches
    const text = this.text;
    let first = t.start;
    while (first > 0 && text[first - 1] !== '\n') first--;
    let last = t.end;
    if (last > t.start && text[last - 1] === '\n') last--;
    const starts = [];
    for (let i = first; i <= last && i <= text.length; i++) {
      if ((i === first || text[i - 1] === '\n') && i < text.length && text[i] !== '\n') starts.push(i);
    }
    if (!starts.length) return;
    const lineAt = (i) => text.slice(i, (text.indexOf('\n', i) + 1 || text.length + 1) - 1);
    const allOn = starts.every((i) => BULLET_RE.test(lineAt(i)));
    let shift = 0;
    for (const i0 of starts) {
      const i = i0 + shift;
      const line = lineAt(i0);
      if (allOn) {
        const m = BULLET_RE.exec(line);
        this.chars.splice(i, m[0].length);
        shift -= m[0].length;
      } else if (!BULLET_RE.test(line)) {
        const st = this.chars[i] ? this.chars[i].st : {};
        this.chars.splice(i, 0, ...[...BULLET].map((c) => ({ c, st })));
        shift += BULLET.length;
      }
    }
    if (this.sel) this.sel = { start: t.start, end: Math.max(t.start, t.end + shift) };
  }

  /** State of the toolbar for the current selection (or the whole field). */
  updateBar() {
    const t = this.target();
    let slice = this.chars.slice(t.start, t.end).filter((ch) => ch.c !== '\n');
    for (const k of TOGGLES) {
      const on = slice.length > 0 && slice.every((ch) => ch.st[k]);
      this.ctl[k].setAttribute('aria-pressed', String(on));
      this.ctl[k].classList.toggle('is-on', on);
    }
    for (const k of Object.keys(VALUED)) {
      const first = slice.length ? (slice[0].st[k] || '') : '';
      const same = slice.every((ch) => (ch.st[k] || '') === first);
      this.ctl[k].value = same ? first : '';
    }
    this.bar.classList.toggle('is-whole', t.whole);
    this.bar.dataset.scope = t.whole ? 'whole field' : 'selected text';
  }

  /* ---------- drawing the box ---------- */

  render() {
    const frag = document.createDocumentFragment();
    for (const r of this.runs()) {
      const cls = classesFor(r.st);
      r.text.split('\n').forEach((part, i) => {
        if (i) frag.append(document.createElement('br'));
        if (!part) return;
        if (!cls.length) { frag.append(document.createTextNode(part)); return; }
        const s = document.createElement('span');
        s.className = cls.join(' ');
        s.textContent = part;
        frag.append(s);
      });
    }
    // A last empty line needs a spare <br> to show.
    if (this.chars.length && this.chars[this.chars.length - 1].c === '\n') {
      const f = document.createElement('br');
      f.dataset.filler = '1';
      frag.append(f);
    }
    this.el.replaceChildren(frag);
    this.el.classList.toggle('is-empty', this.chars.length === 0);
    const len = this.text.length;
    const max = this.o.max;
    this.count.textContent = len > max * 0.8 ? `${len} / ${max}` : '';
    this.count.classList.toggle('is-over', len > max);
  }

  /** Reads what the browser put in the box back into the character list. */
  readDom() {
    const out = [];
    const walk = (node, st) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          for (const c of n.data.replace(/\r\n?/g, '\n').replace(/ /g, ' ')) out.push({ c, st });
        } else if (n.nodeName === 'BR') {
          if (!n.dataset.filler) out.push({ c: '\n', st: {} });
        } else if (n.nodeType === 1) {
          const block = n.nodeName === 'DIV' || n.nodeName === 'P';
          if (block && out.length && out[out.length - 1].c !== '\n') out.push({ c: '\n', st: {} });
          walk(n, cleanStyle({ ...st, ...styleFromClasses(n) }));
        }
      }
    };
    walk(this.el, {});
    let chars = out;
    if (!this.o.multiline) chars = chars.map((x) => (x.c === '\n' ? { c: ' ', st: x.st } : x));
    return chars;
  }

  /* ---------- selection as character positions ---------- */

  offsetOf(container, offset) {
    if (!this.el.contains(container)) return null;
    let pos = 0;
    let found = null;
    const walk = (node) => {
      if (node === container && node.nodeType === 3) { found = pos + offset; return true; }
      const kids = node.childNodes;
      for (let i = 0; i < kids.length; i++) {
        if (node === container && i === offset) { found = pos; return true; }
        const n = kids[i];
        if (n.nodeType === 3) {
          if (n === container) { found = pos + offset; return true; }
          pos += n.data.length;
        } else if (n.nodeName === 'BR') {
          if (!n.dataset.filler) pos += 1;
        } else if (walk(n)) return true;
      }
      if (node === container) { found = pos; return true; }
      return false;
    };
    walk(this.el);
    return found;   // not clamped: during typing the box is ahead of the character list
  }

  readSel() {
    const s = window.getSelection();
    if (!s || !s.rangeCount) return null;
    const r = s.getRangeAt(0);
    const a = this.offsetOf(r.startContainer, r.startOffset);
    const b = this.offsetOf(r.endContainer, r.endOffset);
    if (a === null || b === null) return null;
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  pointAt(pos) {
    let rem = pos;
    let res = null;
    const walk = (node) => {
      const kids = node.childNodes;
      for (let i = 0; i < kids.length; i++) {
        const n = kids[i];
        if (n.nodeType === 3) {
          if (rem <= n.data.length) { res = [n, rem]; return true; }
          rem -= n.data.length;
        } else if (n.nodeName === 'BR') {
          if (n.dataset.filler) { res = [node, i]; return true; }
          if (rem === 0) { res = [node, i]; return true; }
          rem -= 1;
        } else if (walk(n)) return true;
      }
      return false;
    };
    walk(this.el);
    return res || [this.el, this.el.childNodes.length];
  }

  setSel(r) {
    if (!r) return;
    const s = window.getSelection();
    if (!s) return;
    const range = document.createRange();
    const [an, ao] = this.pointAt(r.start);
    const [bn, bo] = this.pointAt(r.end);
    try {
      range.setStart(an, ao);
      range.setEnd(bn, bo);
      s.removeAllRanges();
      s.addRange(range);
    } catch { /* box redrawn under us; leave the caret where it is */ }
  }

  /* ---------- edits ---------- */

  remember() {
    const v = this.value;
    if (this.undo.length && this.undo[this.undo.length - 1].v === v) return;
    this.undo.push({ v, sel: this.sel });
    if (this.undo.length > UNDO_KEEP) this.undo.shift();
    this.redo = [];
  }

  restoreFrom(from, to) {
    const step = from.pop();
    if (!step) return;
    to.push({ v: this.value, sel: this.readSel() });
    const keepUndo = this.undo;
    const keepRedo = this.redo;
    this.value = step.v;
    this.undo = keepUndo;
    this.redo = keepRedo;
    this.el.focus();
    if (step.sel) { this.setSel(step.sel); this.sel = step.sel; }
    this.updateBar();
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Replace [start, end) with text, styled like the character before it. */
  insert(text, r) {
    if (!this.o.multiline) text = text.replace(/\s*\n\s*/g, ' ');
    const st = r.start > 0 && this.chars[r.start - 1].c !== '\n' ? this.chars[r.start - 1].st : (this.chars[r.end] && this.chars[r.end].c !== '\n' ? this.chars[r.end].st : {});
    this.remember();
    this.chars.splice(r.start, r.end - r.start, ...[...text].map((c) => ({ c, st })));
    const at = r.start + [...text].length;
    this.changed({ start: at, end: at }, true);
  }

  /** After any change: redraw, put the selection back, tell the form. */
  changed(sel, focus) {
    this.render();
    if (focus) this.el.focus();
    if (sel) { this.setSel(sel); this.sel = sel; } else if (focus) { this.sel = null; }
    this.updateBar();
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  wire() {
    const el = this.el;
    el.addEventListener('beforeinput', (e) => {
      const t = e.inputType;
      const r = this.readSel() || { start: this.chars.length, end: this.chars.length };
      if (t === 'insertParagraph' || t === 'insertLineBreak') {
        e.preventDefault();
        if (this.o.multiline) this.insert('\n', r);
      } else if (t === 'insertFromPaste' || t === 'insertFromDrop' || t === 'insertReplacementText') {
        e.preventDefault();
        const dt = e.dataTransfer;
        const text = (dt && dt.getData('text/plain')) || e.data || '';
        if (text) this.insert(text.replace(/\r\n?/g, '\n').replace(/\t/g, ' '), r);
      } else if (t === 'formatBold' || t === 'formatItalic' || t === 'formatUnderline' || t === 'formatStrikeThrough') {
        e.preventDefault();
        if (r.end > r.start) { this.sel = r; this.apply({ formatBold: 'b', formatItalic: 'i', formatUnderline: 'u', formatStrikeThrough: 's' }[t]); }
      } else if (t === 'historyUndo') {
        e.preventDefault(); this.restoreFrom(this.undo, this.redo);
      } else if (t === 'historyRedo') {
        e.preventDefault(); this.restoreFrom(this.redo, this.undo);
      } else if (t.startsWith('format')) {
        e.preventDefault();
      } else if (!this.composing) {
        this.remember();
      }
    });
    // paste fallback for browsers without beforeinput paste data
    el.addEventListener('paste', (e) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      const r = this.readSel() || { start: this.chars.length, end: this.chars.length };
      if (text) this.insert(text.replace(/\r\n?/g, '\n').replace(/\t/g, ' '), r);
    });
    el.addEventListener('drop', (e) => { e.preventDefault(); });
    el.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.restoreFrom(this.undo, this.redo); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.restoreFrom(this.redo, this.undo); }
      else if (k === 'b' || k === 'i' || k === 'u') {
        e.preventDefault();
        const r = this.readSel();
        if (r && r.end > r.start) { this.sel = r; this.apply(k); }
      }
    });
    el.addEventListener('compositionstart', () => { this.composing = true; this.remember(); });
    el.addEventListener('compositionend', () => { this.composing = false; this.sync(); });
    el.addEventListener('input', (e) => {
      if (!e.isTrusted) return;   // our own change events
      if (!this.composing) this.sync();
    });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement !== el) return;
      const r = this.readSel();
      if (r) { this.sel = r; this.updateBar(); }
    });
    // Leaving the field for anything but its own toolbar ends the selection.
    this.wrap.addEventListener('focusout', (e) => {
      if (e.relatedTarget && this.wrap.contains(e.relatedTarget)) return;
      setTimeout(() => {
        if (this.wrap.contains(document.activeElement)) return;
        this.sel = null;
        this.updateBar();
      }, 0);
    });
  }

  /** Typing and deleting: read the box, redraw it cleanly, keep the caret. */
  sync() {
    const r = this.readSel();
    this.chars = this.readDom();
    this.render();
    if (r && document.activeElement === this.el) { this.setSel(r); this.sel = r; }
    this.updateBar();
  }
}
