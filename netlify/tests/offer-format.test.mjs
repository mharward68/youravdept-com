// Contract 1.2.0: eyebrow and formatting (2026-10-12).
// Run: node --test netlify/tests/offer-format.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const F = await import('../../shared/offer-format.js');
const C = await import('../../shared/offer-contract.js');
const rules = await import('../functions/lib/offers-rules.mjs');

const PRICE = '[s]$11,250[/s], [b][color=teal]$5,625[/color][/b], plus fixed travel';

test('parse and write back: canonical, round trip stable', () => {
  const runs = F.parseMarkup(PRICE);
  assert.deepEqual(runs.map((r) => r.text), ['$11,250', ', ', '$5,625', ', plus fixed travel']);
  assert.deepEqual(runs[0].st, { s: true });
  assert.deepEqual(runs[2].st, { b: true, color: 'teal' });
  const canon = F.normalizeMarkup(PRICE);
  assert.equal(canon, PRICE);
  assert.equal(F.normalizeMarkup(canon), canon);
  // tag order and nesting are normalised
  assert.equal(F.normalizeMarkup('[color=teal][b]x[/b][/color]'), '[b][color=teal]x[/color][/b]');
});

test('unknown tags, bad values and stray closers stay as text', () => {
  for (const s of ['[insert name]', '[color=red]x[/color]', '[size=99]y', 'a [/b] b', '[script]', '[b=1]z']) {
    assert.equal(F.plainFromMarkup(s), F.plainFromMarkup(F.normalizeMarkup(s)), s);
  }
  assert.equal(F.plainFromMarkup('[color=red]x[/color]'), '[color=red]x[/color]');
  assert.equal(F.plainFromMarkup('a [/b] b'), 'a [/b] b');
  assert.equal(F.plainFromMarkup('[insert name]'), '[insert name]');
});

test('an unclosed tag runs to the end; line breaks reopen tags per line', () => {
  assert.equal(F.normalizeMarkup('[b]open'), '[b]open[/b]');
  assert.equal(F.normalizeMarkup('[b]one\ntwo[/b]'), '[b]one[/b]\n[b]two[/b]');
});

test('blocks: paragraphs, bullets with any marker, formatting kept inside bullets', () => {
  const body = '[b][size=xl]50% off[/size][/b]\n\nWhat you get:\n* Up to 30 videos\n- Raw footage\n• [b]Emails[/b], written for you\n\nLast line';
  const b = F.toBlocks(body);
  assert.deepEqual(b.map((x) => x.type), ['p', 'p', 'ul', 'p']);
  assert.equal(b[2].items.length, 3);
  assert.equal(b[2].items[0].map((r) => r.text).join(''), 'Up to 30 videos');
  assert.deepEqual(b[2].items[2][0], { text: 'Emails', st: { b: true } });
});

test('classes are fixed names only', () => {
  assert.deepEqual(F.classesFor({ b: true, s: true, color: 'teal', hl: 'navy', size: 'xl', font: 'heading' }),
    ['yf-b', 'yf-s', 'yf-font-heading', 'yf-size-xl', 'yf-color-teal', 'yf-hl-navy']);
  assert.deepEqual(F.classesFor({ color: '"><img src=x>', b: 'yes' }), []);
});

test('brand palette only', () => {
  assert.deepEqual(Object.values(F.COLORS).map((c) => c.hex), ['#152B4A', '#2AA4A2', '#1F7F7D', '#4A5B73', '#FFFFFF']);
  assert.ok(!Object.values(F.COLORS).some((c) => c.hex === '#2A344A'), 'retired navy');
});

test('contract 1.2.0: eyebrow is an offer key and a public key', () => {
  assert.ok(['1.2.0', '1.3.0'].includes(C.CONTRACT_VERSION), 'eyebrow arrived in 1.2.0; the exact version is checked in offer-contract-images.test.mjs');
  assert.ok(C.OFFER_KEYS.includes('eyebrow'));
  assert.ok(C.PUBLIC_OFFER_KEYS.includes('eyebrow'));
  assert.equal(C.emptyOffer().eyebrow, '');
  const old = { id: 'a', name: 'n', slug: '', headline: 'h', body: 'b', form: {}, buttonUrl: null };
  assert.equal(C.publicPayload(old, false).offer.eyebrow, '', 'offers saved before 1.2.0');
});

function input(over = {}) {
  return { ...C.emptyOffer(), id: undefined, name: 'Booth Proof: 2027 shows', page: '/booth-proof', audience: 'everyone',
    eyebrow: '2027 FOUNDING RATE', headline: "Your exhibitors, on camera, selling next year's floor.",
    body: `[b]What you get:[/b]\n* Up to 30 finished videos\n\n${PRICE}`, draft: true, ...over };
}

test('save: eyebrow and formatting stored in canonical form', () => {
  const r = rules.prepareOffer(input({ headline: '[color=teal][b]Big[/b][/color] news' }), { offers: [] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.offer.eyebrow, '2027 FOUNDING RATE');
  assert.equal(r.offer.headline, '[b][color=teal]Big[/color][/b] news');
  assert.ok(r.offer.body.includes('[s]$11,250[/s]'));
  assert.deepEqual(Object.keys(r.offer), [...C.OFFER_KEYS]);
});

test('save: HTML still removed; limits count the words, not the tags', () => {
  const html = rules.prepareOffer(input({ eyebrow: '<b>Hi</b> <script>x</script>there' }), { offers: [] });
  assert.equal(html.offer.eyebrow, 'Hi xthere');
  assert.ok(html.notes.some((n) => n.includes('eyebrow')));
  const wordsOk = rules.prepareOffer(input({ eyebrow: `[b][color=teal][size=xl]${'A'.repeat(60)}[/size][/color][/b]` }), { offers: [] });
  assert.equal(wordsOk.ok, true);
  const tooLong = rules.prepareOffer(input({ eyebrow: 'A'.repeat(61) }), { offers: [] });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.fields.eyebrow, /60 characters \(now 61\)/);
  const onlyTags = rules.prepareOffer(input({ eyebrow: '[b][/b]' }), { offers: [] });
  assert.equal(onlyTags.offer.eyebrow, '');
});

test('save: an offer from before 1.2.0 (no eyebrow) saves with an empty eyebrow', () => {
  const old = input();
  delete old.eyebrow;
  const r = rules.prepareOffer(old, { offers: [] });
  assert.equal(r.ok, true);
  assert.equal(r.offer.eyebrow, '');
});
