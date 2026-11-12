# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 19:05 ET, Session 3.10 (Save, replace, remove, rerun), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 planned, not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.10 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN. Not touched in 3.10.
- The editor's picture work is complete: 3.11 is the first TEST deploy of all of Phase 3 (and Michael's stop).

## Session 3.10: what was done (assets/offer-admin.js only, plus tests)
- collect() sends `image: { id, alt, placement }` or null (Remove). snapshot() also holds the picture's address, so a new, replaced or removed picture, an alt or a placement change all count for the Leave guard.
- save(): a description is required before anything is sent. A new picture uploads first (POST /api/offers/image, once: its id is kept on the picture, so a refused save does not upload again), then the offer is saved. Upload failure: the text saves with the old picture (image left out), banner and toast say "The picture did not upload. Your offer text was saved without a new picture.", and the picture stays on screen, unsaved, to try again.
- Sign-in expiry (on the upload or the save): the stash keeps the picture in memory (never browser storage), detached so the reset does not release it; resumeStash puts it back. Sign-out releases it.
- Rerun keeps the same picture id (the copy carries the image). Alt-only or placement-only changes upload nothing.
- Export: when the file says pictures did not fit, the dashboard shows the server's sentence and a "Download the pictures file" button (part 2, then part N from `next`). Missing pictures show the sentence only.
- Server field errors for image.alt, image.placement and image.id land in their slots (3.9 wiring, now tested).
- Tests: netlify/tests/offer-admin-image.test.mjs grows from 11 to 21 (10 new 3.10 tests with request counts). New screenshot ai/review/3.9/7-export-note.png.

## Files changed
assets/offer-admin.js, netlify/tests/offer-admin-image.test.mjs, ai/review/3.9/7-export-note.png (new), ai docs.

## Assumptions (reversible)
- After an upload failure the offer is saved with its previous picture (left out of the request, so the server keeps it), as the plan says, and the new picture stays on screen as an unsaved change.
- A refused save after a good upload keeps the uploaded id; if it sits unsaved for over 24 hours, a later save says "no longer available" (3.6 cleanup) and the picture must be added again.
- The pictures-file toast does not mention preview keys (that file holds none).

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config, edge-lib import bundles, ~4.5 MB export download, a real upload through Netlify.
2. offers-stats "twenty parallel views" still fails on this PC (pre-existing, backlog). Every other suite passes.
3. No CI in this repo: verified by the local test run only.
4. Phase 1 backlog: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.
5. Screenshots use fallback fonts (fonts answered empty in tests).

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual M, about 25 min build (one test-harness snag: Playwright downloads left a rejection on close, fixed on the third try by recording downloads in the page); Michael's time 0.

## Backup coverage
No stored data created or changed (in-memory test stores only). Nothing to back up.

## Next step
Session 3.11 (Test deploy and verification script; Michael deploys to TEST, runs the script, looks, says go). Tag after 3.10: CLEAR (next is deploy tooling, a different area).
