# Decisions: YAVD Offers Module

Dated, append-only. What was chosen, why, and what was rejected.

## 2026-10-09: Scope approved
- Address pattern /offer/<slug> (singular). Links go into emails and posts, so this is the one painful-to-change decision. Confirmed by Michael.
- One shared admin password, no accounts. Alert to michaelh@youravdept.com. Views and leads counts in. No access code on the industry group offer. Times Eastern; start 12:00 AM, stop 11:59 PM; rerun keeps the link; one popup design. All confirmed.
- Offers in Netlify Blobs, leads in one Netlify form "offers". Rejected: a page copy per offer (the current booth-proof-pilot pattern), because it needs a deploy per offer and duplicates pages.

## 2026-10-10: Session 1.1, contracts frozen (CONTRACT_VERSION 1.0.0)
- Contract lives in shared/offer-contract.js as a pure ES module with no imports, so Node functions, Deno edge functions and the browser load the same file. It is published as a static file by deploy.ps1; accepted, nothing in it is private.
- Page matching: offers store the .html path; normalizePagePath() maps /booth-proof, /booth-proof.html, /, /library/ etc. to one form. Why: _redirects serves short addresses as 200 rewrites, and a visitor on /booth-proof must still get the popup.
- Test stores: non-production deploys use "offers-test" and "offer-stats-test" (storeName()). Why: Netlify Blobs site-wide stores are shared by every deploy, so draft-deploy testing would otherwise leave test offers in the live store. Rejected: deploy-scoped stores, because production would then lose its offers on every redeploy.
- Injected payload carries only PUBLIC_OFFER_KEYS and escapes "<". Why: the preview key must never reach a visitor's browser, and offer copy must not be able to close the script tag.
- "guide" reserved as a field name. Why: submission-created.mjs emails a guide PDF to any form submission with a guide field.
- Popup body font is Inter, not Open Sans. Why: Inter is the body font on every page of the site; the popup should match the page it sits on.
- Function files use .mjs, matching submission-created.mjs. Routes are declared in each function's own config, so netlify.toml stays small.
- offer-admin.html is left out of the site map easter egg. Why: the map lives in 18 page files (editing them is a hard limit) and it is an admin screen.
- Recommended for 1.2 (not yet decided): page list from the site's .html files bundled into the pages function via included_files. Rejected: a hand-kept list (goes stale) and a deploy-time generator (needs an edit to deploy.ps1).

## Pending Michael (asked 2026-10-10, needed before 1.2)
- Add 'ai' to $ExcludeDirs in deploy.ps1 so the build docs do not go live. Fallback: 404 rule for /ai/* in netlify.toml.
- Approve @netlify/blobs as the module's one dependency (pinned), with a minimal package.json.
