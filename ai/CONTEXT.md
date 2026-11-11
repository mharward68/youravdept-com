# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 15:04 ET, Session 3.5 (The image on an offer), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.5 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1). Not touched in 3.5.
- Backup point taken before this session: git tag `pre-images-record` (local; pushed with this session's tags).

## Session 3.5: what was done
- lib/offers-rules.mjs: prepareOffer(input, { offers, now, images }) now builds `image`:
  - input.image absent: keep the stored picture (null for offers saved before 1.3.0). `null`: remove it (the picture file stays for cleanup in 3.6). Object: checked.
  - Checks: id must match IMAGE.idPattern; placement in IMAGE.placements, default top, else "Choose Top, Left or Right."; alt through plainText (tags and invisible characters removed, note added), required on drafts too (IMAGE_MESSAGES.noAlt), up to 125 ("Keep it to 125 characters (now N).").
  - Facts (width, height, type, bytes) never from the browser: same id as the stored offer's picture reuses the stored facts; otherwise from ctx.images (Map or object, id to metadata). Not there, or a bad id or non-object value: IMAGE_MESSAGES.gone on field image.id. Output keys in IMAGE_KEYS order.
  - Field keys: image.id, image.alt, image.placement.
- offers.mjs: lookUpWantedImage() before changeOffers. No picture, or the same id the stored offer already has: no picture-store call (so a text-only edit saves even while picture storage is down; costs one extra loadOffers read on edits that carry a picture). Otherwise headImage on the one id. ImageStoreError (read failure or store cannot open): 503 "Picture storage is unavailable right now, so nothing was saved. Try again in a minute." Nothing written.
- offers-rules.test.mjs: the 3.1 exclusion of `image` from the key list removed; asserts image is null on a picture-less save.
- New netlify/tests/offers-image-save.test.mjs (15 tests): add, default and bad placement, replace, remove, alt only, placement only (no picture-store calls), save without image key keeps it, missing alt (draft and scheduled), 125/126 alt, HTML in alt, unknown id, bad id shapes (no store call), storage down 503 plus text-only edit still saves, old offer unchanged with image null, rerun shares the id, history and restore carry the image.
- Mutation check: server made to trust the browser's width/height/type/bytes: 2 tests fail; restored: 15 pass.

## Corrections to the documents (code wins)
- Plan 3.5 task 1 said "null or absent keeps the stored value"; task 4 said "image: null removes". Built as: absent keeps, null removes (the only reading where both work). Plan text corrected.

## Assumptions (reversible)
- A badly shaped id or a non-object image value gets the "gone" message (the editor never sends one; a forged request gets a plain refusal).
- Old offers gain `image: null` on their next save. Visitors see no difference (publicPayload already gives null).

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config (fallback built), and the edge-lib import bundles.
2. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offer-image-routes 27, offer-image 34, offer-images-store 11, offers-auth 13, offers-image-save 15, offers-rules 22, site-admin 12.
3. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual S to M (about 20 min build, all tests passed on the first run); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
No new store. The offer record now holds an `image` object; it lives in the existing "offers" store and its saved versions, so it is covered by history, restore and Export (Export carries the record; the picture bytes join Export in 3.7). Picture files themselves: not covered until 3.7.

## Next step
Session 3.6 (Automatic cleanup, LOGIC, M), tag session-3.6. Tag after 3.5: CONTINUE (3.6 reads the image references defined here). Run by hand: new conversation is fine; a warm helper is optional.
