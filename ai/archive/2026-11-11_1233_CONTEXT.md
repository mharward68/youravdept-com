# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 12:13 ET, Session 3.3 (The image store), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.3 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1).

## Session 3.3: what was done
- New netlify/functions/lib/offer-images-store.mjs (storage only, no checking of the picture itself):
  - imagesStore(deployContext): Blobs store "offer-images" on production, "offer-images-test" everywhere else, strong consistency. imagesStoreName(ctx). Test hook _setImagesStoreFactoryForTests(fn).
  - putImage(store, bytes, info, now): info is checkImage(bytes).info. New id (newImageId), store.set with metadata { type, bytes, width, height, uploadedAt } and onlyIfNew; one retry with a new id on a clash, never overwrites. Returns { id, type, bytes, width, height, uploadedAt }. Details that do not match the file: 400 before any storage call.
  - getImage(store, id) -> { bytes: Uint8Array, meta } or null. headImage(store, id) -> meta or null (no bytes read). listImages(store) -> sorted ids (non-id keys ignored). deleteImage(store, id) (quiet if already gone).
  - isImageId(id). Every bad id shape is refused before any storage call (null for get/head, 400 for delete).
  - ImageStoreError(message, status), 503 for every storage failure, never leaking the underlying message.
  - A record with unusable metadata (type not JPG/PNG/WebP, bad sizes, bad date) or a byte count that does not match reads as missing, so the view route can never serve bytes under a type it cannot vouch for.
- New netlify/tests/offer-images-store.test.mjs (11 tests). Mutation check: with the id check removed, 2 tests fail; restored, 11 pass.

## Corrections to the documents (code wins)
- Plan said getImage uses get(type arrayBuffer) plus getMetadata. It uses getWithMetadata(type arrayBuffer): one request, and bytes and details always come from the same version. headImage still uses getMetadata. The test store mirrors exactly these calls.

## Assumptions (reversible)
- Store errors: 400 for bad input, 503 for storage trouble. 3.4 maps a view-side error or null to 404, as planned.

## Open items
1. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offer-image 34, offer-images-store 11, offers-auth 13, offers-rules 22, site-admin 12.
2. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated S, ~5 min of Michael's time. Actual S (about 15 min build); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
New store of user data: Blobs "offer-images" (and "-test"). Nothing writes to it yet (routes come in 3.4). Backup of current offers' pictures comes from Export (Session 3.7); until then it is not covered, and it holds nothing.

## Next step
Session 3.4 (Upload and view routes, API, M), tag session-3.4. Tag after 3.3: CONTINUE (3.4 imports exactly this module). Run by hand: new conversation.
