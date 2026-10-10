// YAVD Offers Module: sign-in tests (Session 1.3)
// Run from the website folder:  node --test netlify/tests/offers-auth.test.mjs
// Uses an in-memory stand-in for Netlify Blobs; never touches real storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
process.env.OFFER_SESSION_SECRET = 'test-secret-0123456789abcdef';

const auth = await import('../functions/lib/offers-auth.mjs');
const login = (await import('../functions/offers-login.mjs')).default;
const logout = (await import('../functions/offers-logout.mjs')).default;
const offers = (await import('../functions/offers.mjs')).default;
const pages = (await import('../functions/offers-pages.mjs')).default;
const exportFn = (await import('../functions/offers-export.mjs')).default;
const del = (await import('../functions/offers-delete.mjs')).default;
const offersStore = await import('../functions/lib/offers-store.mjs');

function memoryStore() {
  const m = new Map();
  return {
    m,
    async set(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, v); return { modified: true }; },
    async list({ prefix = '' } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
    async delete(k) { m.delete(k); }
  };
}
let store;
beforeEach(() => {
  store = memoryStore();
  auth._setStoreFactoryForTests(() => store);
  // Since 1.4 /api/offers reads offer storage: an empty in-memory stand-in.
  offersStore._setOffersStoreFactoryForTests(() => ({ getWithMetadata: async () => null }));
});

const BASE = 'https://offers--your-av-dept.netlify.app';
const ctx = { deploy: { context: 'branch-deploy' } };
const loginReq = (password, headers = {}) => new Request(`${BASE}/api/offers/login`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ password }) });
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

test('wrong password is refused with 401 and no cookie', async () => {
  const res = await login(loginReq('nope-nope-nope'), ctx);
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  console.log('  wrong password ->', res.status, JSON.stringify(await res.json()));
});

test('right password sets a 12-hour HttpOnly Secure SameSite=Strict cookie', async () => {
  const res = await login(loginReq('correct-horse-battery-1'), ctx);
  assert.equal(res.status, 200);
  const sc = res.headers.get('set-cookie');
  for (const part of ['yavd_offer_admin=v1.', 'Path=/api/offers', 'Max-Age=43200', 'HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(sc.includes(part), part);
  console.log('  right password ->', res.status, sc.replace(/=v1\.[^;]+/, '=v1.<token>'));
});

test('five wrong tries, then the sixth is locked out (429), even with the right password', async () => {
  for (let i = 1; i <= 5; i++) {
    const r = await login(loginReq('wrong-' + i), ctx);
    console.log(`  try ${i} (wrong) ->`, r.status);
    assert.equal(r.status, 401);
  }
  const sixth = await login(loginReq('wrong-6'), ctx);
  const body = await sixth.json();
  console.log('  try 6 (wrong) ->', sixth.status, JSON.stringify(body));
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.headers.get('retry-after')) > 800);
  const right = await login(loginReq('correct-horse-battery-1'), ctx);
  console.log('  try 7 (RIGHT password while locked) ->', right.status);
  assert.equal(right.status, 429);
  assert.equal(right.headers.get('set-cookie'), null);
  assert.equal([...store.m.keys()].length, 5, 'locked tries do not extend the lock');
});

test('lock lifts 15 minutes after the oldest of the five wrong tries', async () => {
  const t0 = Date.now() - 15 * 60 * 1000 - 1000;
  for (let i = 0; i < 5; i++) await store.set(`attempt/${t0 + i}-x${i}`, '1');
  const r = await login(loginReq('correct-horse-battery-1'), ctx);
  console.log('  after 15 min, right password ->', r.status);
  assert.equal(r.status, 200);
  assert.equal(store.m.size, 0, 'success clears attempts');
});

test('a parallel burst of 20 wrong guesses cannot get past the limit', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => login(loginReq('burst-' + i), ctx)));
  const counts = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log('  burst statuses ->', JSON.stringify(counts));
  assert.ok((counts[401] || 0) <= 5);
});

test('signed-out calls to every admin route are refused with 401', async () => {
  for (const [name, fn, method, path] of [
    ['offers GET', offers, 'GET', '/api/offers'], ['offers POST', offers, 'POST', '/api/offers'],
    ['pages', pages, 'GET', '/api/offers/pages'], ['export', exportFn, 'GET', '/api/offers/export'],
    ['delete', del, 'POST', '/api/offers/delete'], ['logout', logout, 'POST', '/api/offers/logout']]) {
    const r = await fn(new Request(BASE + path, { method }), ctx);
    console.log(`  signed out ${name} ->`, r.status);
    assert.equal(r.status, 401);
  }
});

test('forged, tampered and expired cookies are refused', async () => {
  const cfg = auth.authConfig();
  const good = auth.makeToken(cfg);
  const tampered = good.replace(/^v1\.(\d+)/, (_, n) => 'v1.' + (Number(n) + 1000));
  const expired = auth.makeToken(cfg, Date.now() - 13 * 3600 * 1000);
  const otherSecret = auth.makeToken({ ...cfg, secret: 'some-other-secret-xxxxxxxx' });
  for (const [label, tok] of [['tampered', tampered], ['expired', expired], ['wrong secret', otherSecret], ['junk', 'abc']]) {
    const r = await offers(new Request(BASE + '/api/offers', { headers: { cookie: `yavd_offer_admin=${tok}` } }), ctx);
    console.log(`  ${label} cookie ->`, r.status);
    assert.equal(r.status, 401);
  }
});

test('signed-in call is accepted (since 1.4: 200 with the offer list)', async () => {
  const res = await login(loginReq('correct-horse-battery-1'), ctx);
  const cookie = cookieOf(res);
  const r = await offers(new Request(BASE + '/api/offers', { headers: { cookie } }), ctx);
  const body = await r.json();
  console.log('  signed in GET /api/offers ->', r.status, JSON.stringify(body));
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(body.offers));
});

test('changing the password signs everyone out', async () => {
  const cookie = cookieOf(await login(loginReq('correct-horse-battery-1'), ctx));
  process.env.OFFER_ADMIN_PASSWORD = 'a-brand-new-password-2';
  const r = await offers(new Request(BASE + '/api/offers', { headers: { cookie } }), ctx);
  process.env.OFFER_ADMIN_PASSWORD = 'correct-horse-battery-1';
  console.log('  old cookie after password change ->', r.status);
  assert.equal(r.status, 401);
});

test('cross-site POST and non-JSON login are refused', async () => {
  const x = await login(loginReq('correct-horse-battery-1', { origin: 'https://evil.example' }), ctx);
  const t = await login(new Request(BASE + '/api/offers/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' }), ctx);
  const g = await login(new Request(BASE + '/api/offers/login'), ctx);
  console.log('  cross-site login ->', x.status, '| text/plain login ->', t.status, '| GET login ->', g.status);
  assert.deepEqual([x.status, t.status, g.status], [403, 415, 405]);
});

test('missing or short settings: sign-in refuses (503), never opens', async () => {
  const saved = process.env.OFFER_ADMIN_PASSWORD;
  delete process.env.OFFER_ADMIN_PASSWORD;
  const a = await login(loginReq(''), ctx);
  process.env.OFFER_ADMIN_PASSWORD = 'short';
  const b = await login(loginReq('short'), ctx);
  process.env.OFFER_ADMIN_PASSWORD = saved;
  console.log('  no password set ->', a.status, '| 5-char password set ->', b.status);
  assert.deepEqual([a.status, b.status], [503, 503]);
});

test('attempt storage down: sign-in fails closed (503)', async () => {
  auth._setStoreFactoryForTests(() => ({ set: async () => { throw new Error('blobs down'); } }));
  const r = await login(loginReq('correct-horse-battery-1'), ctx);
  console.log('  storage down ->', r.status);
  assert.equal(r.status, 503);
});

test('logout clears the cookie', async () => {
  const cookie = cookieOf(await login(loginReq('correct-horse-battery-1'), ctx));
  const r = await logout(new Request(BASE + '/api/offers/logout', { method: 'POST', headers: { cookie } }), ctx);
  console.log('  logout ->', r.status, r.headers.get('set-cookie'));
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
});
