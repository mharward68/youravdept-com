# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 12:33 ET, Session 3.4 (Upload and view routes), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.4 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1). Not touched in 3.4.

## Session 3.4: what was done
- New netlify/functions/offer-image-upload.mjs, POST /api/offers/image (config path = ROUTES.apiImage, method POST):
  - Order: requireAdmin (405 / 403 cross-site / 401) -> content-type must be image/jpeg|png|webp, case and parameters ignored (415 wrongType) -> declared content-length over IMAGE.maxBytes is 413 before reading -> body read with a running cap, stops at the cap (413 tooLarge) -> checkImage (415 / 413 / 422 with its message) -> putImage -> 201 { id, width, height, type, bytes }, JSON, no-store, noindex.
  - Storage trouble: 503 JSON with the store module's message (never the underlying error).
- New netlify/functions/offer-image.mjs, GET/HEAD /api/offers/image/:id (config path = ROUTES.image), public:
  - id from context.params.id, or from the path if the platform gives none; must pass isImageId, else 404 with no store call.
  - 200 with the STORED type, content-length, nosniff, X-Robots-Tag noindex, Cache-Control public max-age=31536000 immutable, Content-Disposition inline, plus Content-Security-Policy "default-src 'none'; sandbox" (added: nothing can ever run from the address). HEAD: headers only.
  - Unknown id, unusable record, storage failure or store that cannot open: 404 text/plain, no-store, never 500. Other methods 405.
- Both honour x-yavd-test-store-fail: 1 on branch-deploy / deploy-preview / dev only, via wantsForcedFailure imported from netlify/edge-lib/offer-edge.js (same header name and same context list as the edge, by construction). Production ignores it (tested).
- New netlify/tests/offer-image-routes.test.mjs (27 tests). Mutation check: with `if (refused) return refused;` removed from the upload, 4 tests fail (401, forged cookie, cross-site, method); restored, 27 pass.

## Corrections to the documents (code wins)
- None. The plan's route and header list matched; the CSP header is an addition, not a change.

## Assumptions (reversible)
- Config `method` filters are set on both functions, so on Netlify a GET to /api/offers/image or a POST to /api/offers/image/<id> matches no function and gets the site 404. The handlers still answer 405 if called with another method.
- First function to import from netlify/edge-lib/. The bundler follows relative imports (shared/ already works this way); confirmed on the TEST deploy in 3.11 together with the `:id` route.
- Body read failure answers 400 with the upload-failed text.

## Open items
1. Still to prove on TEST (3.11): `:id` path params accepted in a function config (fallback already built: the id is read from the path), and the edge-lib import bundles.
2. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offer-image-routes 27, offer-image 34, offer-images-store 11, offers-auth 13, offers-rules 22, site-admin 12.
3. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual S to M (about 20 min build); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
No new store. The routes write to Blobs "offer-images" (and "-test") from 3.3. Nothing is deployed, so nothing is in it. Backup of current offers' pictures comes from Export (Session 3.7); until then not covered.

## Next step
Session 3.5 (The image on an offer, LOGIC, M), tag session-3.5. Before it: `git tag pre-images-record` (record shape changes; backup point). Tag after 3.4: CLEAR. Run by hand: new conversation.
