// YAVD Offers Module: /api/offers/logout   POST -> clears the cookie
// Session 1.3. Signed-in only, like every admin route except login. Every
// response, refusals included, clears the cookie so a stale one never lingers.
import { requireAdmin, json, clearedCookie } from './lib/offers-auth.mjs';

export default async (req) => {
  const clear = { 'set-cookie': clearedCookie() };
  const refused = requireAdmin(req, { methods: ['POST'] });
  if (refused) {
    const headers = new Headers(refused.headers);
    headers.append('set-cookie', clearedCookie());
    return new Response(refused.body, { status: refused.status, headers });
  }
  return json({ ok: true, signedOut: true }, 200, clear);
};

export const config = { path: '/api/offers/logout' };
