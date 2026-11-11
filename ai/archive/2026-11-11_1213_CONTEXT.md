# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 11:35 ET, Session 3.2 (Read and check an image), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 and 3.2 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1).

## Session 3.2: what was done
- New netlify/functions/lib/offer-image.mjs (pure, no storage):
  - sniffImage(bytes): complete JPEG (scans to the first SOF, skips comments, reads progressive), PNG (IHDR), WebP (VP8, VP8L, VP8X with a chunk walk). Returns { type, width, height } or null. Bounds-checked; refuses cut-off files (format ending checked), SVG, GIF, animated WebP, height-0 JPEG.
  - checkImage(bytes): byte cap first (413), then type (415), then pixel limits (422). Returns { ok: true, info: { type, width, height, bytes } } or { ok: false, status, error }.
  - newImageId(): 32 hex from crypto.
  - IMAGE_MESSAGES: the plan's five messages plus tooSmall and tooManyPixels (DECISIONS 2026-11-11).
- New netlify/tests/offer-image.test.mjs (34 tests), including every-length truncation of each good file and 3000 seeded random corruptions (never throws).
- New netlify/tests/fixtures/: 10 small pictures (about 8 KB total) encoded by headless Edge, all decoded back in Edge at the expected sizes.

## Corrections to the documents (code wins)
- Plan said "make fixtures with Pillow here". This PC has no Python or Pillow; headless Edge's canvas encoder was used instead (BUILD_NOTES Session 3.2). No repo dependency either way.
- Plan named seven fixtures including a 700 KB one. The 700 KB case is built in the test by padding a real JPEG, so no large file is committed.

## Assumptions (reversible)
- Status codes 413 / 415 / 422 for too large / wrong type / pixel limits. 3.4 uses them as the upload response codes.
- Only zero padding is allowed after a JPEG end marker. Fine while the browser re-encodes every upload (3.9).

## Open items
1. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offers-auth 13, offers-rules 22, site-admin 12, offer-image 34.
2. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual M (about 30 min build, most of it making real WebP fixtures without Pillow); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
No stored data created or changed. Code and test files only; backed up by the git commit and tag session-3.2.

## Next step
Session 3.3 (The image store, DATA, S), tag session-3.3, in a NEW conversation. Tag after 3.2: CLEAR. 3.3 is tagged CONTINUE into 3.4.
