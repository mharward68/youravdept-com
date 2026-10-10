// YAVD Offers Module: /api/offers/login   POST {password} -> sets cookie
// Session 1.3. All logic lives in lib/offers-auth.mjs.
import { handleLogin } from './lib/offers-auth.mjs';

export default (req, context) => handleLogin(req, context);

export const config = { path: '/api/offers/login' };
