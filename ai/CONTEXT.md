# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:50 ET (PC clock), Session 4.5 (Cleanup protects landing pictures; DATA), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tags pre-landings-20261123 and pre-landings-record (before this session). Sessions done: 4.1 (contract), 4.2 (rules), 4.3 (store), 4.4 (routes), 4.5 (cleanup).

## Session 4.5: what was done (DATA)
- netlify/functions/lib/offer-images-cleanup.mjs: `cleanupImages(imagesStore, offersStore, now, landingsStore)` and `usedImageIds(offersStore, landingsStore)`. With a landings store, every current landing picture and every picture in the newest 20 saved landing versions counts as used. Unreadable landings, history list, a version, an odd version shape, "all" not a list, a null or non-store landings argument, or an unusable "now": nothing deleted, reason in errors.
- netlify/functions/landings.mjs: after each successful save runs `cleanUpAfterSave` (exported), passing pictures, offers and landings stores. Best effort: logs, never fails a save.
- New netlify/tests/landings-cleanup.test.mjs: 12 pass, 2 todo (the 4.6 checks), including the proof that removing the landing check loses the landing picture.

## Decisions and assumptions (logged)
- PLAN CONTRADICTION, resolved reversibly: the plan says "a caller that omits the landings store deletes NOTHING", but also that offer-images-cleanup.test.mjs must pass untouched and offers.mjs is not edited until 4.6. That test calls cleanupImages with three arguments and expects deletions, so "omitted means delete nothing" would break it permanently. Chosen: omitted (undefined) keeps the 3.6 offers-only behaviour; null or a non-store deletes nothing. The gap: until 4.6, an offer save through offers.mjs still deletes a landing-only picture over 24 hours old. Harmless now (nothing deployed, no landing pictures stored anywhere); 4.6 closes it and the plan's 4.6 task list now says exactly how.
- The landing argument is 4th (after now) so every existing 3-argument call stays valid.

## Verified (real output, 2026-11-23, exit codes 0)
- landings-cleanup 12 pass / 2 todo, offer-images-cleanup 15/15 (untouched), landings-routes 17/17, landings-store 16/16, landings-rules 28/28, offer-contract-landings 15/15, offers-image-save 15/15, offers-rules 22/22, offers-auth 13/13.

## Estimate vs actual (4.5)
Estimated M, ~5 min of Michael's time. Actual M (about 25 min build); Michael 0 min.

## Backup coverage
No stored data created or changed (in-memory stores only; no TEST or live store touched). Code only; backed up by git (tag session-4.5, plus pre-landings-record before it).

## Open items (backlog, none block)
1. Session 4.6 MUST pass landingsStore(deployContext) to cleanupImages in offers.mjs and remove `todo` from the last two tests in landings-cleanup.test.mjs (written into the plan's 4.6 tasks). Must happen before any deploy (4.15).
2. Not yet proved on a real deploy: the landing routes register and bundle cleanly. Check on TEST in 4.15.
3. offers-stats "twenty parallel views" fails on this PC (14 of 20). Unrelated.
4. No CI in this repo: verified by local test runs only.
5. Until 4.6: saved offers carry no landing key; offers-rules.test.mjs filters it (remove in 4.6).
6. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.6 (Offers link to a landing page; LOGIC), tag session-4.6. After 4.5: CLEAR, so a fresh helper runs it.
