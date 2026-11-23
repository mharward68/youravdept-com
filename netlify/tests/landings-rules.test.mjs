// YAVD Offers Module: landing page rules tests (Session 4.2, contract 1.4.0)
// Run from the website folder:  node --test netlify/tests/landings-rules.test.mjs
// Pure: no storage, no network. Cases mirror offers-rules.test.mjs where the
// behaviour is shared (limits, HTML stripped, stale edit, picture facts).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../shared/offer-contract.js');
const R = await import('../functions/lib/landings-rules.mjs');
const OR = await import('../functions/lib/offers-rules.mjs');
const { IMAGE_MESSAGES } = await import('../functions/lib/offer-image.mjs');

const NOW = new Date('2026-11-23T15:00:00.000Z');
const IMG_ID = 'a'.repeat(32);
const IMG_FACTS = { type: 'image/webp', bytes: 123456, width: 1600, height: 900 };

/** A complete Live-ready input. */
function full(over = {}) {
  return {
    name: 'Booth Proof 2026',
    slug: 'booth-proof-2026',
    eyebrow: 'Limited offer',
    headline: 'Your booth, proven before the show',
    body: 'We test every cable.\n\n- Audio\n- Video',
    image: null,
    ctaLabel: 'Book a call',
    ctaUrl: 'https://calendar.app.google/Do7aNUGLhraagUKV6',
    status: 'live',
    ...over
  };
}

function create(input, ctx = {}) {
  return R.prepareLanding(input, { landings: [], now: NOW, ...ctx });
}

/** Saves once and returns the stored landing (for update tests). */
function stored(over = {}) {
  const r = create(full(over));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.landing;
}

/* ---------- shape ---------- */

test('a complete landing is created in LANDING_KEYS order with server fields filled', () => {
  const r = create(full({ extra: 'dropped', previewKey: 'mine', createdAt: '2000-01-01T00:00:00Z' }));
  assert.equal(r.ok, true);
  assert.equal(r.created, true);
  assert.deepEqual(Object.keys(r.landing), [...C.LANDING_KEYS]);
  assert.equal(r.landing.status, 'live');
  assert.match(r.landing.id, /^[0-9a-f-]{36}$/);
  assert.equal(r.landing.previewKey.length, C.PREVIEW_KEY_LENGTH);
  assert.notEqual(r.landing.previewKey, 'mine');
  assert.equal(r.landing.createdAt, NOW.toISOString());
  assert.equal(r.landing.updatedAt, NOW.toISOString());
  assert.equal(r.landing.archivedAt, null);
  assert.equal(r.landing.image, null);
  assert.equal('extra' in r.landing, false);
});

test('limits equal the offer popup limits and the contract call to action limits', () => {
  assert.equal(R.LANDING_LIMITS.name, OR.LIMITS.name);
  assert.equal(R.LANDING_LIMITS.eyebrow, OR.LIMITS.eyebrow);
  assert.equal(R.LANDING_LIMITS.headline, OR.LIMITS.headline);
  assert.equal(R.LANDING_LIMITS.body, OR.LIMITS.body);
  assert.equal(R.LANDING_LIMITS.ctaLabel, 40);
  assert.equal(R.LANDING_LIMITS.ctaUrl, 500);
});

test('a body that is not an object is refused, never a crash', () => {
  for (const bad of [null, undefined, 'x', 3, []]) {
    const r = R.prepareLanding(bad, { landings: [], now: NOW });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  }
  // odd ctx is survivable too
  assert.equal(R.prepareLanding(full(), { landings: 'nope', now: NOW }).ok, true);
});

/* ---------- each field's limit and refusal ---------- */

test('each text field refuses one character over its limit and accepts the limit', () => {
  const cases = [['name', 120], ['eyebrow', 60], ['headline', 150], ['body', 3000], ['ctaLabel', 40]];
  for (const [key, max] of cases) {
    const ok = create(full({ [key]: 'x'.repeat(max) }));
    assert.equal(ok.ok, true, `${key} at ${max}`);
    const r = create(full({ [key]: 'x'.repeat(max + 1) }));
    assert.equal(r.ok, false, `${key} over`);
    assert.equal(r.status, 400);
    assert.equal(r.fields[key], `Keep it to ${max} characters (now ${max + 1}).`);
  }
});

test('non-text values are refused with a field message', () => {
  for (const key of ['name', 'eyebrow', 'headline', 'body', 'ctaLabel']) {
    const r = create(full({ [key]: 42 }));
    assert.equal(r.ok, false, key);
    assert.equal(r.fields[key], 'Must be text.');
  }
});

test('formatting tags are kept and do not count toward the limit; too much formatting is refused', () => {
  const r = create(full({ headline: '[b][color=teal]$5,625[/color][/b] off' }));
  assert.equal(r.ok, true);
  assert.equal(r.landing.headline, '[b][color=teal]$5,625[/color][/b] off');
  const words = 'x'.repeat(150);
  assert.equal(create(full({ headline: `[b]${words}[/b]` })).ok, true);
  const heavy = Array.from({ length: 60 }, (_, i) => (i % 2 ? '[b][i][u][s][color=teal][hl=navy]x[/hl][/color][/s][/u][/i][/b]' : 'y')).join('');   // 60 characters read, far over 6x in tags
  const h = create(full({ eyebrow: heavy }));
  assert.equal(h.ok, false);
  assert.match(h.fields.eyebrow, /Too much formatting/);
});

test('a tag in the headline is stripped, with a note', () => {
  const r = create(full({ headline: 'Hello <script>alert(1)</script><b>world</b>' }));
  assert.equal(r.ok, true);
  assert.equal(r.landing.headline, 'Hello alert(1)world');
  assert.ok(r.notes.some((n) => n.includes('HTML was removed from headline')));
  const n = create(full({ name: '<img src=x onerror=alert(1)>Name' }));
  assert.equal(n.landing.name, 'Name');
  const b = create(full({ ctaLabel: '<i>Go</i>' }));
  assert.equal(b.landing.ctaLabel, 'Go');
});

test('body keeps line breaks; single-line fields collapse whitespace', () => {
  const r = create(full({ body: 'One\r\n\r\n\r\n\r\nTwo  three', name: '  A \n  B  ' }));
  assert.equal(r.landing.body, 'One\n\nTwo three');
  assert.equal(r.landing.name, 'A B');
});

/* ---------- call to action link ---------- */

test('javascript:, data:, //host, http:// and other schemes are refused with the contract message', () => {
  const bad = [
    'javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>x</script>',
    '//evil.example', '//evil.example/path', 'http://example.com', 'ftp://example.com', 'mailto:a@b.c',
    'vbscript:x', 'example.com', '/page with space', '/a"b', '/a\\b', 'https://exa mple.com', 'x'.repeat(501)
  ];
  for (const u of bad) {
    const r = create(full({ ctaUrl: u }));
    assert.equal(r.ok, false, u);
    assert.equal(r.fields.ctaUrl, C.LANDING_MESSAGES.ctaUrl, u);
  }
  assert.equal(R.cleanCtaUrl(5).error, C.LANDING_MESSAGES.ctaUrl);
});

test('https:// addresses and same-site paths are accepted', () => {
  assert.equal(create(full({ ctaUrl: 'https://youravdept.com/booth-proof' })).landing.ctaUrl, 'https://youravdept.com/booth-proof');
  assert.equal(create(full({ ctaUrl: '/booth-proof.html' })).landing.ctaUrl, '/booth-proof.html');
  assert.equal(create(full({ ctaUrl: '  /av365  ' })).landing.ctaUrl, '/av365');
  assert.equal(create(full({ ctaUrl: 'HTTPS://Example.com' })).landing.ctaUrl, 'https://example.com/');
});

/* ---------- required fields ---------- */

test('going Live needs name, slug, headline, body, ctaLabel and ctaUrl', () => {
  const r = create({ name: 'Only a name', slug: 'only-a-name', status: 'live' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.fields).sort(), ['body', 'ctaLabel', 'ctaUrl', 'headline']);
  assert.equal(r.fields.headline, R.LANDING_RULE_MESSAGES.headline);
  assert.equal(r.fields.ctaUrl, R.LANDING_RULE_MESSAGES.ctaUrlMissing);
});

test('a draft may be incomplete except name and slug', () => {
  const d = create({ name: 'Draft page', slug: 'draft-page' });
  assert.equal(d.ok, true);
  assert.equal(d.landing.status, 'draft');
  assert.equal(d.landing.headline, '');
  assert.equal(d.landing.ctaUrl, null);
  const noName = create({ slug: 'draft-page' });
  assert.equal(noName.fields.name, R.LANDING_RULE_MESSAGES.name);
  const noSlug = create({ name: 'Draft page' });
  assert.equal(noSlug.fields.slug, R.LANDING_RULE_MESSAGES.slug);
  const tagsOnly = create({ name: '<b></b>', slug: 'x-y-z' });
  assert.equal(tagsOnly.fields.name, R.LANDING_RULE_MESSAGES.name);
});

/* ---------- slug ---------- */

test('slug follows the offer link rules and is folded to lowercase', () => {
  assert.equal(create(full({ slug: '  Booth-Proof  ' })).landing.slug, 'booth-proof');
  for (const bad of ['ab', 'a'.repeat(61), 'two--hyphens', '-lead', 'trail-', 'has space', 'dot.dot', '../etc', 'a/b', 'a%2Fb', 5]) {
    const r = create(full({ slug: bad }));
    assert.equal(r.ok, false, String(bad));
    assert.equal(r.fields.slug, R.LANDING_RULE_MESSAGES.slug, String(bad));
  }
  assert.equal(create(full({ slug: 'a'.repeat(60) })).ok, true);
});

test('slug clash with another landing (any status, any case) is refused with 409', () => {
  const other = stored({ slug: 'taken-name' });
  for (const s of ['taken-name', 'TAKEN-NAME']) {
    const r = create(full({ slug: s }), { landings: [other] });
    assert.equal(r.ok, false);
    assert.equal(r.status, 409);
    assert.equal(r.error, C.LANDING_MESSAGES.slugTaken);
    assert.equal(r.fields.slug, C.LANDING_MESSAGES.slugTaken);
  }
  const archived = { ...other, status: 'archived', archivedAt: NOW.toISOString() };
  assert.equal(create(full({ slug: 'taken-name' }), { landings: [archived] }).status, 409);
  const odd = { ...other, slug: 'Taken-Name' };   // a stored slug in odd case still clashes
  assert.equal(create(full({ slug: 'taken-name' }), { landings: [odd] }).status, 409);
});

test('a landing does not clash with itself on update', () => {
  const a = stored({ slug: 'own-name', status: 'draft' });
  const r = R.prepareLanding({ ...a, name: 'Renamed' }, { landings: [a], now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.landing.slug, 'own-name');
});

test('slug can change while Draft, and is locked once the page has been Live', () => {
  const d = stored({ slug: 'first-name', status: 'draft' });
  const changed = R.prepareLanding({ ...d, slug: 'second-name' }, { landings: [d], now: NOW });
  assert.equal(changed.ok, true);
  assert.equal(changed.landing.slug, 'second-name');

  const live = stored({ slug: 'live-name' });
  const r = R.prepareLanding({ ...live, slug: 'new-name' }, { landings: [live], now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.fields.slug, R.LANDING_RULE_MESSAGES.slugLocked);

  const arch = { ...live, status: 'archived', archivedAt: NOW.toISOString() };
  const ra = R.prepareLanding({ ...arch, slug: 'new-name' }, { landings: [arch], now: NOW });
  assert.equal(ra.fields.slug, R.LANDING_RULE_MESSAGES.slugLocked);

  // same slug in another case is not a change
  const same = R.prepareLanding({ ...live, slug: 'LIVE-NAME' }, { landings: [live], now: NOW });
  assert.equal(same.ok, true);
  // slug left out keeps the stored one
  const { slug, ...noSlug } = live;
  assert.equal(R.prepareLanding(noSlug, { landings: [live], now: NOW }).landing.slug, 'live-name');
});

/* ---------- picture ---------- */

test('a picture takes its facts from the images map only, placement forced to top', () => {
  const r = create(full({ image: { id: IMG_ID, alt: 'A stage', placement: 'left', width: 1, height: 1, type: 'text/html', bytes: 1, extra: 'x' } }),
    { images: new Map([[IMG_ID, IMG_FACTS]]) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.landing.image, { id: IMG_ID, alt: 'A stage', placement: 'top', ...IMG_FACTS });
  assert.deepEqual(Object.keys(r.landing.image), [...C.IMAGE_KEYS]);
  // a plain object map works too
  assert.equal(create(full({ image: { id: IMG_ID, alt: 'A stage' } }), { images: { [IMG_ID]: IMG_FACTS } }).ok, true);
});

test('a missing picture gives the gone message', () => {
  const r = create(full({ image: { id: IMG_ID, alt: 'A stage' } }));
  assert.equal(r.ok, false);
  assert.equal(r.fields['image.id'], IMAGE_MESSAGES.gone);
  for (const bad of ['nope', { id: 'not-an-id', alt: 'x' }, { alt: 'x' }, []]) {
    assert.equal(create(full({ image: bad })).fields['image.id'], IMAGE_MESSAGES.gone);
  }
});

test('alt text is required with a picture and capped at 125', () => {
  const images = new Map([[IMG_ID, IMG_FACTS]]);
  for (const alt of [undefined, '', '   ', '<b></b>']) {
    const r = create(full({ image: { id: IMG_ID, alt } }), { images });
    assert.equal(r.ok, false, String(alt));
    assert.equal(r.fields['image.alt'], C.LANDING_MESSAGES.alt);
  }
  assert.equal(create(full({ image: { id: IMG_ID, alt: 'x'.repeat(125) } }), { images }).ok, true);
  assert.equal(create(full({ image: { id: IMG_ID, alt: 'x'.repeat(126) } }), { images }).fields['image.alt'],
    'Keep it to 125 characters (now 126).');
  assert.equal(create(full({ image: { id: IMG_ID, alt: 7 } }), { images }).fields['image.alt'], 'Must be text.');
});

test('the stored picture is kept when unchanged, removed with null, and its facts never come from the browser', () => {
  const withPic = create(full({ image: { id: IMG_ID, alt: 'A stage' } }), { images: new Map([[IMG_ID, IMG_FACTS]]) }).landing;
  const keep = R.prepareLanding({ id: withPic.id, updatedAt: withPic.updatedAt, name: 'New name' }, { landings: [withPic], now: NOW });
  assert.equal(keep.ok, true);
  assert.deepEqual(keep.landing.image, withPic.image);
  const fake = R.prepareLanding({ ...withPic, image: { ...withPic.image, alt: 'Changed', bytes: 1, width: 2 } }, { landings: [withPic], now: NOW });
  assert.equal(fake.landing.image.bytes, IMG_FACTS.bytes);
  assert.equal(fake.landing.image.width, IMG_FACTS.width);
  assert.equal(fake.landing.image.alt, 'Changed');
  const removed = R.prepareLanding({ ...withPic, image: null }, { landings: [withPic], now: NOW });
  assert.equal(removed.landing.image, null);
});

/* ---------- status transitions ---------- */

test('allowed status moves: draft to live, live to archived, archived to live, and staying put', () => {
  const d = stored({ status: 'draft' });
  const live = R.prepareLanding({ ...d, status: 'live' }, { landings: [d], now: NOW });
  assert.equal(live.ok, true);
  assert.equal(live.landing.status, 'live');
  assert.equal(live.landing.archivedAt, null);

  const L = live.landing;
  const later = new Date(NOW.getTime() + 60_000);
  const arch = R.prepareLanding({ ...L, status: 'archived' }, { landings: [L], now: later });
  assert.equal(arch.ok, true);
  assert.equal(arch.landing.archivedAt, later.toISOString());

  const A = arch.landing;
  const edit = R.prepareLanding({ ...A, name: 'Edited while archived' }, { landings: [A], now: new Date(later.getTime() + 60_000) });
  assert.equal(edit.ok, true);
  assert.equal(edit.landing.status, 'archived');
  assert.equal(edit.landing.archivedAt, A.archivedAt, 'archivedAt kept while it stays archived');

  const back = R.prepareLanding({ ...A, status: 'live' }, { landings: [A], now: new Date(later.getTime() + 120_000) });
  assert.equal(back.ok, true);
  assert.equal(back.landing.status, 'live');
  assert.equal(back.landing.archivedAt, null);
  assert.equal(back.landing.previewKey, d.previewKey, 'preview key never changes');
  assert.equal(back.landing.createdAt, d.createdAt);
  assert.equal(back.landing.id, d.id);
});

test('refused status moves and unknown statuses', () => {
  const live = stored();
  const toDraft = R.prepareLanding({ ...live, status: 'draft' }, { landings: [live], now: NOW });
  assert.equal(toDraft.ok, false);
  assert.match(toDraft.fields.status, /cannot go back to Draft/);

  const d = stored({ status: 'draft' });
  const dArch = R.prepareLanding({ ...d, status: 'archived' }, { landings: [d], now: NOW });
  assert.equal(dArch.ok, false);
  assert.match(dArch.fields.status, /draft cannot be archived/);

  const A = { ...live, status: 'archived', archivedAt: NOW.toISOString() };
  assert.equal(R.prepareLanding({ ...A, status: 'draft' }, { landings: [A], now: NOW }).ok, false);

  assert.equal(create(full({ status: 'archived' })).fields.status, R.LANDING_RULE_MESSAGES.newArchived);
  for (const s of ['published', 'LIVE', 1, true]) {
    assert.equal(create(full({ status: s })).fields.status, R.LANDING_RULE_MESSAGES.status, String(s));
  }
  // status left out: new is draft, stored keeps its own
  const { status, ...noStatus } = full();
  assert.equal(create(noStatus).landing.status, 'draft');
  const { status: s2, ...liveNoStatus } = live;
  assert.equal(R.prepareLanding(liveNoStatus, { landings: [live], now: NOW }).landing.status, 'live');
});

test('a Live page edited to lose its headline is refused', () => {
  const live = stored();
  const r = R.prepareLanding({ ...live, headline: '' }, { landings: [live], now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.fields.headline, R.LANDING_RULE_MESSAGES.headline);
});

/* ---------- stale edit and missing record ---------- */

test('stale edit is refused with 409 (id plus the updatedAt it was loaded with)', () => {
  const a = stored();
  const r = R.prepareLanding({ ...a, updatedAt: '2026-01-01T00:00:00.000Z', name: 'Late' }, { landings: [a], now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /saved somewhere else at .* ET\. Reload it before saving/);
  const noStamp = R.prepareLanding({ id: a.id, name: 'Late' }, { landings: [a], now: NOW });
  assert.equal(noStamp.status, 409);
});

test('an id that is not stored gives the contract gone message with 404', () => {
  const r = R.prepareLanding(full({ id: 'not-there', updatedAt: NOW.toISOString() }), { landings: [], now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(r.error, C.LANDING_MESSAGES.gone);
});

test('updatedAt always moves forward on an update in the same millisecond', () => {
  const a = stored();
  const r = R.prepareLanding({ ...a, name: 'Again' }, { landings: [a], now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.created, false);
  assert.ok(Date.parse(r.landing.updatedAt) > Date.parse(a.updatedAt));
});

test('server-owned fields cannot be set by the editor on update', () => {
  const a = stored();
  const r = R.prepareLanding({ ...a, previewKey: 'x'.repeat(32), createdAt: '2000-01-01T00:00:00.000Z', archivedAt: '2000-01-01T00:00:00.000Z' },
    { landings: [a], now: NOW });
  assert.equal(r.landing.previewKey, a.previewKey);
  assert.equal(r.landing.createdAt, a.createdAt);
  assert.equal(r.landing.archivedAt, null);
});

test('the input and the stored list are never changed', () => {
  const a = stored();
  const list = [a];
  const before = JSON.stringify(list);
  const input = { ...a, name: '<b>x</b>Changed' };
  const inputBefore = JSON.stringify(input);
  R.prepareLanding(input, { landings: list, now: NOW });
  assert.equal(JSON.stringify(list), before);
  assert.equal(JSON.stringify(input), inputBefore);
});
