# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 16:24 ET (PC clock), Session 4.9 (Serve the pages and keep popups off them; API), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tags pre-landings-20261123 and pre-landings-record. Sessions done: 4.1 to 4.9.
- Renderer (4.8): shared/landing-template.js, renderLanding(landing, { state, isPreview, imageSrc, origin }) -> { html, headers }. Samples in ai/review/4.8/.

## Session 4.9: what was done (API)
- New netlify/functions/offer-landing.mjs, `config = { path: '/offers/*', method: ['GET', 'HEAD'] }`. Slug from the raw pathname (landingSlugFromPath); anything else under /offers/ is 404 (no-store, noindex) with no storage read.
- Two cached readers (createOfferSource from offer-edge.js, 60 s, strong reads), keyed by deploy context, opening landingsStore(ctx) and offersStore(ctx), so tests use the existing store factories.
- States: running gives the page; expired and archived give the page with the expiration data; before and draft give 302 to "/" (no-store) unless `?preview=<key>` matches (constant-time), then the page with isPreview (no-store, no analytics; a "before" page previews with its button). Unknown slug 302 "/". Landing store failed with nothing cached: 302 "/" (store-failed). Offers store failed: page from the landing alone (live reads as running). Unexpected error: 302 "/" (error).
- Headers: the template's headers plus `x-yavd-landing` (running, expired, archived, before, draft, preview, unknown, store-failed, error); on test deploys also `x-yavd-landing-src: <landings from>/<offers from>; ctx=<context>`, and the share tags use the request origin.
- `/offers/` added to SKIP_PREFIXES in netlify/edge-lib/offer-edge.js and `/offers/*` to excludedPath in offer-page.js and page-takedown.js (one line each). netlify.toml: X-Robots-Tag rule for /offers/* (static second lock). No forced rewrite yet (only if 4.15 shows the function does not win the route).
- Tests: netlify/tests/landing-serve.test.mjs (27), including old vs new skip list on every existing page address, URLPattern checks that both edge functions still run on every existing page, and a git diff check that each edge function changed only its excludedPath line.

## Decisions and assumptions (logged, reversible)
- A valid preview key also shows a live page that is still "before" its offer (the plan named draft only). It lets Michael check a page ahead of its offer. Running, expired and archived ignore the key.
- 404s and unknown slugs both report x-yavd-landing: unknown (the status code tells them apart).

## Verified (real output, 2026-11-23)
`node --test netlify/tests/landing-serve.test.mjs`: 27/27, exit 0. `node --test netlify/tests/offer-edge.test.mjs`: 21/21. Full suite by file: all pass (popup Playwright offer-panel-image 14/14, offers-landing-link 13/13, site-admin 12/12) except offers-stats "twenty parallel views" (pre-existing, 9/10).

## Estimate vs actual (4.9)
Estimated M, ~5 min of Michael's time. Actual M (about 25 min build); Michael 0 min.

## Backup coverage
No stored data created or changed (in-memory stores only; the function only reads). Code backed up by git (tag session-4.9).

## Open items (backlog, none block)
1. Prove on TEST in 4.15: /offers/* reaches the function (fallback: forced rewrite in netlify.toml, plan 4.9 Risk); landing routes and export bundle; GA4 counts a function-served page; popup and takedown stay off /offers/.
2. landing-serve.test.mjs reads git tag session-4.8 (diff checks). A clone without tags fails those two tests; fetch tags first.
3. offers-stats "twenty parallel views" fails on this PC. Unrelated.
4. No CI in this repo: verified by local test runs only.
5. Editor (4.11 to 4.14): clear buttonUrl when a landing link is removed; show fields.landing messages; optionally show landingsNote on its own. 4.13 preview: renderLanding with `{ state, isPreview: false, imageSrc }` in a no-scripts sandbox iframe.
6. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.10 (The expiration popup and the review page; UI, M), tag session-4.10. After 4.9: CLEAR, so a fresh helper runs it. 4.10 ends with APPROVE (Michael reviews 6 screens).
