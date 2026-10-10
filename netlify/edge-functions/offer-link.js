// YAVD Offers Module edge function: /offer/<slug>: serves the page with that offer, or 302 outside its dates.
// Session 1.2 placeholder. It has NO route on purpose, so Netlify deploys it
// but never runs it. Session 1.5 adds the route and the real logic.
import { CONTRACT_VERSION } from '../../shared/offer-contract.js';

export default async () => {
  void CONTRACT_VERSION;
  return; // pass through: the normal page is served untouched
};
