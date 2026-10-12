// YAVD site admin: /api/offers/session   GET -> 200 { ok } signed in | 401
// Lets /admin and /site-map ask "am I signed in?" without loading any data.
// Same sign-in as the Offers Module (lib/offers-auth.mjs).
import { requireAdmin, json } from './lib/offers-auth.mjs';

export default (req) => requireAdmin(req, { methods: ['GET'] }) ?? json({ ok: true });

export const config = { path: '/api/offers/session' };
