// Session 4.1: contract 1.4.0 (offer landing pages). Run: node --test netlify/tests/offer-contract-landings.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../shared/offer-contract.js';

const OLD = { id: 'a', name: 'n', slug: '', eyebrow: '', headline: 'h', body: 'b', image: null, form: {}, buttonUrl: null };
const LIVE = { id: 'l1', slug: 'booth-proof-2027', status: 'live' };
const NOW = new Date('2027-03-15T12:00:00-04:00');
const offer = (over = {}) => ({ landing: 'booth-proof-2027', draft: false,
  startsAt: '2027-03-01T00:00:00-05:00', endsAt: '2027-03-31T23:59:00-04:00', ...over });

test('version is 1.4.0', () => {
  assert.equal(C.CONTRACT_VERSION, '1.4.0');
});

test('landing sits right after buttonUrl in OFFER_KEYS and is last in PUBLIC_OFFER_KEYS', () => {
  assert.deepEqual([...C.OFFER_KEYS], [
    'id', 'name', 'slug', 'page', 'audience', 'eyebrow', 'headline', 'body', 'image', 'form',
    'buttonUrl', 'landing', 'startsAt', 'endsAt', 'draft', 'previewKey', 'rerunOf', 'createdAt', 'updatedAt'
  ]);
  assert.deepEqual([...C.PUBLIC_OFFER_KEYS],
    ['id', 'name', 'slug', 'eyebrow', 'headline', 'body', 'image', 'form', 'buttonUrl', 'landing']);
});

test('emptyOffer has landing null and every offer key', () => {
  const e = C.emptyOffer();
  assert.strictEqual(e.landing, null);
  assert.deepEqual(Object.keys(e).sort(), [...C.OFFER_KEYS].sort());
});

test('publicPayload: an offer saved before 1.4.0 gets landing null, never ""', () => {
  const p = C.publicPayload(OLD, false);
  assert.equal(p.v, '1.4.0');
  assert.strictEqual(p.offer.landing, null);
  assert.deepEqual(Object.keys(p.offer), [...C.PUBLIC_OFFER_KEYS]);
  assert.strictEqual(C.publicPayload({ ...OLD, landing: '' }, false).offer.landing, null);
  assert.strictEqual(C.publicPayload({ ...OLD, landing: null }, false).offer.landing, null);
  assert.strictEqual(C.publicPayload({ ...OLD, landing: 42 }, false).offer.landing, null);
  assert.equal(C.publicPayload({ ...OLD, landing: 'booth-proof-2027' }, true).offer.landing, 'booth-proof-2027');
  assert.ok(!C.payloadToScriptJson(C.publicPayload(OLD, false)).includes('previewKey'));
});

test('routes and store added; existing entries unchanged', () => {
  assert.equal(C.ROUTES.apiLandings, '/api/offers/landings');
  assert.equal(C.ROUTES.apiLandingArchive, '/api/offers/landings/archive');
  assert.equal(C.ROUTES.landingPage, '/offers/landing-:slug.html');
  assert.equal(C.ROUTES.apiOffers, '/api/offers');
  assert.equal(C.ROUTES.image, '/api/offers/image/:id');
  assert.deepEqual({ ...C.STORES }, { offers: 'offers', stats: 'offer-stats', images: 'offer-images', landings: 'offer-landings' });
  assert.equal(C.storeName(C.STORES.landings, 'production'), 'offer-landings');
  assert.equal(C.storeName(C.STORES.landings, 'deploy-preview'), 'offer-landings-test');
  assert.equal(C.storeName(C.STORES.landings, undefined), 'offer-landings-test');
});

test('LANDING, LANDING_KEYS, LANDING_EXPIRED, LANDING_MESSAGES as written, and frozen', () => {
  assert.deepEqual([...C.LANDING.statuses], ['draft', 'live', 'archived']);
  assert.equal(C.LANDING.pathPrefix, '/offers/');
  assert.equal(C.LANDING.filePrefix, 'landing-');
  assert.equal(C.LANDING.fileSuffix, '.html');
  assert.equal(C.LANDING.ctaLabelMax, 40);
  assert.equal(C.LANDING.ctaUrlMax, 500);
  assert.equal(C.LANDING.historyKeep, 20);
  assert.equal(C.LANDING.historyKeep, C.HISTORY_KEEP);
  assert.deepEqual([...C.LANDING_KEYS], [
    'id', 'name', 'slug', 'eyebrow', 'headline', 'body', 'image', 'ctaLabel', 'ctaUrl',
    'status', 'previewKey', 'createdAt', 'updatedAt', 'archivedAt'
  ]);
  assert.equal(C.LANDING_EXPIRED.text,
    'This offer is no longer available. However you can contact Your AV Department to find out what current offers are available.');
  assert.equal(C.LANDING_EXPIRED.buttonLabel, 'Contact Your AV Department');
  assert.equal(C.LANDING_EXPIRED.buttonUrl, 'https://calendar.app.google/Do7aNUGLhraagUKV6');
  assert.equal(C.LANDING_EXPIRED.email, 'michaelh@youravdept.com');
  assert.deepEqual(Object.keys(C.LANDING_MESSAGES), ['slugTaken', 'gone', 'formOn', 'archivedLink', 'ctaUrl', 'alt']);
  assert.equal(C.LANDING_MESSAGES.slugTaken, 'That address is already used by another landing page.');
  assert.equal(C.LANDING_MESSAGES.gone, 'That landing page no longer exists.');
  assert.equal(C.LANDING_MESSAGES.formOn, 'Turn the form off to link a landing page, or remove the landing page from this offer.');
  assert.equal(C.LANDING_MESSAGES.archivedLink, 'That landing page is archived. Restore it or pick another.');
  assert.equal(C.LANDING_MESSAGES.ctaUrl, 'Use a web address (https://...) or a page on this site (/page).');
  assert.equal(C.LANDING_MESSAGES.alt, 'Describe the picture in a few words (up to 125 characters).');
  for (const o of [C.LANDING, C.LANDING.statuses, C.LANDING_KEYS, C.LANDING_EXPIRED, C.LANDING_MESSAGES, C.ROUTES, C.STORES, C.OFFER_KEYS, C.PUBLIC_OFFER_KEYS]) {
    assert.ok(Object.isFrozen(o));
  }
});

test('the copied text limits match offers-rules LIMITS', async () => {
  const { LIMITS } = await import('../functions/lib/offers-rules.mjs');
  assert.deepEqual({ name: LIMITS.name, eyebrow: LIMITS.eyebrow, headline: LIMITS.headline, body: LIMITS.body },
    { name: 120, eyebrow: 60, headline: 150, body: 3000 });
  assert.equal(C.LANDING.ctaUrlMax, LIMITS.buttonUrl);
  assert.equal(C.LANDING.ctaLabelMax, LIMITS.buttonLabel);
});

test('landingPath and landingSlugFromPath round trip', () => {
  for (const slug of ['abc', 'booth-proof-2027', 'a1-b2-c3', 'x'.repeat(60)]) {
    const p = C.landingPath(slug);
    assert.equal(p, `/offers/landing-${slug}.html`);
    assert.equal(C.landingSlugFromPath(p), slug, p);
  }
});

test('landingSlugFromPath: accepted forms (no .html, trailing slash, uppercase folded, query and hash ignored)', () => {
  const ok = [
    '/offers/landing-booth-proof.html', '/offers/landing-booth-proof', '/offers/landing-booth-proof/',
    '/offers/landing-booth-proof.html/', '/Offers/Landing-Booth-Proof.HTML', '/OFFERS/LANDING-BOOTH-PROOF',
    '/offers/landing-booth-proof.html?utm_source=x', '/offers/landing-booth-proof#top'
  ];
  for (const p of ok) assert.equal(C.landingSlugFromPath(p), 'booth-proof', p);
});

test('landingSlugFromPath refuses path tricks and non-landing paths', () => {
  const bad = [
    '/offers/landing-../index.html', '/offers/landing-..', '/offers/../offers/landing-booth-proof.html',
    '//offers/landing-booth-proof.html', '/offers//landing-booth-proof.html', '/offers/landing-booth//proof.html',
    '/offers/landing-booth%2fproof.html', '/offers/landing-booth%2Fproof.html', '/offers/landing-%2e%2e.html',
    '/offers/landing-booth%5cproof.html', '/offers/landing-booth\\proof.html', '/offers/landing-booth proof.html',
    '/offers/landing-.html', '/offers/landing-ab.html', `/offers/landing-${'x'.repeat(61)}.html`,
    '/offers/landing--booth.html', '/offers/landing-booth-.html', '/offers/landing-booth--proof.html',
    '/offers/landing-booth-proof.htm', '/offers/landing-booth-proof.html.html', '/offers/landing-booth-proof.php',
    '/offers/booth-proof.html', '/offers/', '/offers/landing-', '/offer/booth-proof', '/landing-booth-proof.html',
    '/x/offers/landing-booth-proof.html', 'offers/landing-booth-proof.html', 'https://evil.example/offers/landing-booth-proof.html',
    '/offers/landing-booth-proof/extra', '', null, undefined, 42, {}
  ];
  for (const p of bad) assert.equal(C.landingSlugFromPath(p), null, JSON.stringify(p));
});

test('landingState: archived beats everything, draft next', () => {
  assert.equal(C.landingState({ ...LIVE, status: 'archived' }, [offer()], NOW), 'archived');
  assert.equal(C.landingState({ ...LIVE, status: 'archived' }, [], NOW), 'archived');
  assert.equal(C.landingState({ ...LIVE, status: 'draft' }, [offer()], NOW), 'draft');
  assert.equal(C.landingState({ ...LIVE, status: 'draft' }, [], NOW), 'draft');
  assert.equal(C.landingState(null, [offer()], NOW), 'archived');
  assert.equal(C.landingState({ ...LIVE, status: 'bogus' }, [offer()], NOW), 'draft');
});

test('landingState: live with no linked non-draft offer is running', () => {
  assert.equal(C.landingState(LIVE, [], NOW), 'running');
  assert.equal(C.landingState(LIVE, undefined, NOW), 'running');
  assert.equal(C.landingState(LIVE, [offer({ landing: 'other-page' }), offer({ landing: null }), {}], NOW), 'running');
  // draft offers are ignored, even one whose dates are long gone
  assert.equal(C.landingState(LIVE, [offer({ draft: true, endsAt: '2020-01-01T00:00:00Z' })], NOW), 'running');
});

test('landingState: before, running, expired with one linked offer', () => {
  const o = offer();
  assert.equal(C.landingState(LIVE, [o], new Date('2027-02-28T12:00:00-05:00')), 'before');
  assert.equal(C.landingState(LIVE, [o], NOW), 'running');
  assert.equal(C.landingState(LIVE, [o], new Date(o.startsAt)), 'running', 'start moment is running');
  assert.equal(C.landingState(LIVE, [o], new Date(o.endsAt)), 'running', 'end moment is running');
  assert.equal(C.landingState(LIVE, [o], new Date(Date.parse(o.endsAt) + 1)), 'expired');
  assert.equal(C.landingState(LIVE, [o], new Date(Date.parse(o.startsAt) - 1)), 'before');
});

test('landingState: a gap between two offers stays running; earliest start and latest end decide', () => {
  const a = offer({ startsAt: '2027-01-01T00:00:00-05:00', endsAt: '2027-01-31T23:59:00-05:00' });
  const b = offer({ startsAt: '2027-04-01T00:00:00-04:00', endsAt: '2027-04-30T23:59:00-04:00' });
  assert.equal(C.landingState(LIVE, [b, a], NOW), 'running', 'gap in March');
  assert.equal(C.landingState(LIVE, [b, a], new Date('2026-12-31T12:00:00-05:00')), 'before');
  assert.equal(C.landingState(LIVE, [b, a], new Date('2027-05-01T12:00:00-04:00')), 'expired');
  // a draft offer does not stretch the window
  const late = offer({ draft: true, endsAt: '2028-01-01T00:00:00Z' });
  assert.equal(C.landingState(LIVE, [a, b, late], new Date('2027-05-01T12:00:00-04:00')), 'expired');
  // an offer on another page does not count
  const other = offer({ landing: 'other-page', endsAt: '2028-01-01T00:00:00Z' });
  assert.equal(C.landingState(LIVE, [a, b, other], new Date('2027-05-01T12:00:00-04:00')), 'expired');
});

test('landingState defaults now to the current time and never throws on odd offers', () => {
  assert.equal(C.landingState(LIVE, [offer({ startsAt: '2000-01-01T00:00:00Z', endsAt: '2000-01-02T00:00:00Z' })]), 'expired');
  assert.equal(C.landingState(LIVE, [offer({ startsAt: 'nonsense', endsAt: 'nonsense' })], NOW), 'running');
  assert.equal(C.landingState(LIVE, [null, 5, 'x'], NOW), 'running');
});
