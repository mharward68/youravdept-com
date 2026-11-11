# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 15:40 ET, Session 3.6 (Automatic cleanup), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.6 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1). Not touched in 3.6 (uses IMAGE.graceHours 24 and IMAGE.keepVersions 20).

## Session 3.6: what was done
- New netlify/functions/lib/offer-images-cleanup.mjs:
  - usedImageIds(offersStore): ids in the current offers plus the newest 20 saved versions (listHistory order, same as trimHistory). Throws if any of them cannot be read or is not in the expected shape.
  - cleanupImages(imagesStore, offersStore, now): lists pictures, reads details only for unused ones, deletes those older than 24 hours. Returns { kept, deleted, errors }. Any list or read failure: nothing deleted. Missing, unusable or future uploadedAt: kept. A failed delete is reported and kept.
- offers.mjs: cleanUpAfterSave() after a successful save, inside try/catch, logged with console.error and ignored (the trimHistory pattern). Delete, restore and upload do not run it.
- New netlify/tests/offer-images-cleanup.test.mjs (15 tests): used by current offer kept; used only by a saved version kept; unused 25 h deleted; unused 23 h kept; exact 24 h boundary; bad or future upload time kept; replace then 20 more saves (old goes exactly when its version is the 21st); only 20 versions read; delete draft, save, restore: picture still there; delete and restore do not clean; picture list down and store cannot open: save still 201; delete failure: save still 201; unreadable or misshapen history: nothing deleted; one unreadable detail stops every delete; offers saved before 1.3.0 are fine.
- Mutation check: grace check replaced with `return true`: 3 tests fail; restored: 15 pass, 5 runs in a row.

## Corrections to the documents
- Plan 3.6 test "replace, wait past grace, save: old one goes" contradicts the scope (a picture stays while any of the newest 20 versions refers to it). Built and tested to the scope; plan text corrected.

## Assumptions (reversible)
- A picture uploaded but not saved onto an offer for more than 24 hours is removed by the next save of any offer. The editor then shows "That picture is no longer available. Add it again." on save. Logged in BUILD_NOTES for 3.9/3.10.
- Cleanup costs each save: one picture list, one offers read, one history list, up to 20 history reads, one details read per unused picture.

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config (fallback built), and the edge-lib import bundles.
2. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offer-image-routes 27, offer-image 34, offer-images-cleanup 15, offer-images-store 11, offers-auth 13, offers-image-save 15, offers-rules 22, site-admin 12.
3. No CI exists in this repo (.github/workflows absent): sessions are verified by the local test run only.
4. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual M (about 25 min build, one test-setup fix); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
No new store. Cleanup only removes pictures that no current offer and none of the 20 saved versions refers to, so every picture Restore could need is kept. Picture files are not in Export until 3.7.

## Next step
Session 3.7 (Export with pictures, API, M), tag session-3.7. Tag after 3.6: CLEAR (fresh conversation or fresh helper, no stop).
