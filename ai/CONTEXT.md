# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 16:17 ET (PC clock), Session 4.8 (The landing page renderer; UI), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tags pre-landings-20261123 and pre-landings-record. Sessions done: 4.1 to 4.8.

## Session 4.8: what was done (UI)
- New shared/landing-template.js (about 36 KB, pure, browser-safe, published with shared/): `renderLanding(landing, { state, isPreview, imageSrc, origin })` returns `{ html, headers }`. Also exports esc, safeCtaUrl, STYLE, GA_INLINE, GA_ID, STYLE_HASH, GA_HASH, CSP, EXPIRED_STATES, EXPIRED_DATA_ID ('yavd-landing-expired'), EXPIRED_ASSETS (/assets/landing-expired.css and .js), SITE, TEMPLATE_VERSION.
- Layout: white header with the site emblem (the 15 KB WebP brand-mark from the site header) and "Your AV Department", linked to https://youravdept.com/; eyebrow (dark teal); one H1 (navy); picture full width (imageUrl(id), width and height from the record); copy (offer formatting tags as fixed yf- classes); navy call to action band with a teal button and navy text (left out when expired or archived, or when the link fails the https or same-site check); footer with name, michaelh@youravdept.com, youravdept.com.
- Headers: Content-Type html utf-8, Cache-Control `public, max-age=60` (preview: `private, no-store`), X-Robots-Tag `noindex, nofollow`, nosniff, Referrer-Policy, a CSP with default-src 'none'; the inline style and the analytics inline script are allowed by sha256 hash only (no unsafe-inline). Proved in real Edge: no CSP errors, style applied, GA ran, the expired script ran.
- Expired and archived: JSON block `<script type="application/json" id="yavd-landing-expired">` holding LANDING_EXPIRED plus `state`, then `<link>` and `<script defer>` for the two files 4.10 creates.
- Analytics: booth-proof.html has NO analytics tag in the file; Netlify snippet injection adds GA4 G-R6463ELTHL to static pages only. Function responses get no injection, so the template writes the same snippet itself (read from the live /booth-proof). Previews carry no analytics.
- Tests: netlify/tests/landing-render.test.mjs (23). Sample pages and screenshots: ai/review/4.8/ (sample-running.html, sample-expired.html, running-desktop.png, running-phone.png). The samples use a drawn stand-in picture as a data: address.

## Decisions and assumptions (logged, reversible)
- Logo: the site header emblem plus the business name, not booth-proof's 115 KB white-on-navy logo (it needs a navy background and would triple the file). Andy checks it at 4.10.
- White page, navy call to action band: the offer formatting colors were designed for white (navy text would vanish on a navy hero).
- `imageSrc` and `origin` options added for 4.13 (unsaved picture in the admin preview) and 4.9 (share tags on TEST). Both are validated; bad values are ignored.
- Draft preview shows a yellow "Draft preview" note at the top (isPreview and state draft only).

## Verified (real output, 2026-11-23)
`node --test netlify/tests/landing-render.test.mjs`: 23/23, exit 0. Full suite by file: all pass except offers-stats "twenty parallel views" (pre-existing, 9/10).

## Estimate vs actual (4.8)
Estimated L, ~5 min of Michael's time. Actual M to L (about 40 min build); Michael 0 min.

## Backup coverage
No stored data created or changed. Code backed up by git (tag session-4.8).

## Open items (backlog, none block)
1. Not yet proved on a real deploy: landing routes register and bundle cleanly; export with landings on TEST; GA4 counts views from a function-served page. Check on TEST in 4.15.
2. offers-stats "twenty parallel views" fails on this PC. Unrelated.
3. offer-admin-image 3.11b failed once in five runs in 4.7 (browser timing). Passed this run.
4. No CI in this repo: verified by local test runs only.
5. Editor (4.11 to 4.14): clear buttonUrl when a landing link is removed; show fields.landing messages; optionally show landingsNote on its own. 4.13 preview: call renderLanding with `{ state, isPreview: false, imageSrc }` for a true look, in a no-scripts sandbox iframe.
6. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.9 (Serve the pages and keep popups off them; API, M), tag session-4.9. After 4.8: CONTINUE, same helper.
