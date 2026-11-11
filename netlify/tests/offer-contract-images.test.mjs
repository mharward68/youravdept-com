// Session 3.1: contract 1.3.0 (offer images). Run: node --test netlify/tests/offer-contract-images.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../shared/offer-contract.js';

const OLD = { id: 'a', name: 'n', slug: '', eyebrow: '', headline: 'h', body: 'b', form: {}, buttonUrl: null };
const PIC = {
  id: '0123456789abcdef0123456789abcdef', alt: 'Booth camera crew at work', placement: 'left',
  width: 1600, height: 900, type: 'image/webp', bytes: 312000
};

test('version is 1.3.0', () => {
  assert.equal(C.CONTRACT_VERSION, '1.3.0');
});

test('image sits right after body in OFFER_KEYS and PUBLIC_OFFER_KEYS', () => {
  assert.deepEqual([...C.OFFER_KEYS], [
    'id', 'name', 'slug', 'page', 'audience', 'eyebrow', 'headline', 'body', 'image', 'form',
    'buttonUrl', 'startsAt', 'endsAt', 'draft', 'previewKey', 'rerunOf', 'createdAt', 'updatedAt'
  ]);
  assert.deepEqual([...C.PUBLIC_OFFER_KEYS], ['id', 'name', 'slug', 'eyebrow', 'headline', 'body', 'image', 'form', 'buttonUrl']);
  assert.ok(!C.PUBLIC_OFFER_KEYS.includes('previewKey'));
});

test('emptyOffer has image null and every offer key', () => {
  const e = C.emptyOffer();
  assert.equal(e.image, null);
  assert.deepEqual(Object.keys(e).sort(), [...C.OFFER_KEYS].sort());
});

test('routes and store: additive, existing entries unchanged', () => {
  assert.equal(C.ROUTES.apiImage, '/api/offers/image');
  assert.equal(C.ROUTES.image, '/api/offers/image/:id');
  assert.equal(C.ROUTES.apiRestore, '/api/offers/restore');
  assert.equal(C.ROUTES.apiOffers, '/api/offers');
  assert.equal(C.STORES.images, 'offer-images');
  assert.equal(C.STORES.offers, 'offers');
  assert.equal(C.STORES.stats, 'offer-stats');
  assert.equal(C.storeName(C.STORES.images, 'production'), 'offer-images');
  assert.equal(C.storeName(C.STORES.images, 'branch-deploy'), 'offer-images-test');
  assert.ok(C.ROUTES.image.startsWith('/api/'), 'under /api/ so the page edge function skips it');
});

test('IMAGE constants as written', () => {
  assert.deepEqual([...C.IMAGE.mimeTypes], ['image/jpeg', 'image/png', 'image/webp']);
  assert.ok(!C.IMAGE.mimeTypes.includes('image/svg+xml'));
  assert.ok(!C.IMAGE.mimeTypes.includes('image/gif'));
  assert.deepEqual([...C.IMAGE.placements], ['top', 'left', 'right']);
  assert.equal(C.IMAGE.defaultPlacement, 'top');
  assert.equal(C.IMAGE.altMax, 125);
  assert.equal(C.IMAGE.maxBytes, 614400);
  assert.equal(C.IMAGE.targetBytes, 409600);
  assert.equal(C.IMAGE.maxSideBrowser, 1600);
  assert.equal(C.IMAGE.maxSideServer, 4096);
  assert.equal(C.IMAGE.minSideServer, 16);
  assert.equal(C.IMAGE.graceHours, 24);
  assert.equal(C.IMAGE.keepVersions, 20);
  assert.equal(C.IMAGE.keepVersions, C.HISTORY_KEEP);
  assert.deepEqual([...C.IMAGE_KEYS], ['id', 'alt', 'placement', 'width', 'height', 'type', 'bytes']);
  assert.deepEqual([...C.PUBLIC_IMAGE_KEYS], ['id', 'alt', 'placement', 'width', 'height']);
});

test('contract objects are frozen', () => {
  for (const o of [C.IMAGE, C.IMAGE.mimeTypes, C.IMAGE.placements, C.IMAGE_KEYS, C.PUBLIC_IMAGE_KEYS, C.ROUTES, C.STORES, C.OFFER_KEYS, C.PUBLIC_OFFER_KEYS]) {
    assert.ok(Object.isFrozen(o));
  }
});

test('imageUrl builds the public address', () => {
  assert.equal(C.imageUrl(PIC.id), '/api/offers/image/0123456789abcdef0123456789abcdef');
  assert.equal(C.imageUrl(PIC.id), C.ROUTES.image.replace(':id', PIC.id));
});

test('idPattern: 32 lowercase hex only', () => {
  const p = C.IMAGE.idPattern;
  assert.ok(p.test('0123456789abcdef0123456789abcdef'));
  assert.ok(p.test('f'.repeat(32)));
  for (const bad of [
    'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32), '0123456789ABCDEF0123456789abcdef',
    'g'.repeat(32), '', '../' + 'a'.repeat(29), 'a'.repeat(31) + '/', 'a'.repeat(16) + '%2e%2e' + 'a'.repeat(10),
    'a'.repeat(32) + '\n', '\n' + 'a'.repeat(32), 'a'.repeat(32) + '?x=1', ' ' + 'a'.repeat(31), 'a'.repeat(32) + '.png'
  ]) {
    assert.equal(p.test(bad), false, JSON.stringify(bad));
  }
});

test('publicPayload: an offer saved before 1.3.0 gets image null, never ""', () => {
  const p = C.publicPayload(OLD, false);
  assert.equal(p.v, '1.3.0');
  assert.strictEqual(p.offer.image, null);
  assert.deepEqual(Object.keys(p.offer), [...C.PUBLIC_OFFER_KEYS]);
  assert.strictEqual(C.publicPayload({ ...OLD, image: null }, true).offer.image, null);
  assert.strictEqual(C.publicPayload({ ...OLD, image: '' }, true).offer.image, null);
});

test('publicPayload: a present image carries the five public keys only', () => {
  const p = C.publicPayload({ ...OLD, image: { ...PIC, previewKey: 'x', extra: 1 }, previewKey: 'secret' }, false);
  assert.deepEqual(p.offer.image, { id: PIC.id, alt: PIC.alt, placement: 'left', width: 1600, height: 900 });
  assert.deepEqual(Object.keys(p.offer.image), [...C.PUBLIC_IMAGE_KEYS]);
  assert.ok(!('type' in p.offer.image) && !('bytes' in p.offer.image));
  assert.ok(!('previewKey' in p.offer));
  const json = C.payloadToScriptJson(p);
  assert.ok(!json.includes('secret') && !json.includes('312000') && !json.includes('image/webp'));
});

test('publicPayload does not change the stored offer', () => {
  const offer = { ...OLD, image: { ...PIC } };
  C.publicPayload(offer, false);
  assert.deepEqual(offer.image, PIC);
});

test('alt text cannot close the script tag', () => {
  const p = C.publicPayload({ ...OLD, image: { ...PIC, alt: '</script><script>alert(1)</script>' } }, false);
  assert.ok(!C.payloadToScriptJson(p).includes('<'));
});
