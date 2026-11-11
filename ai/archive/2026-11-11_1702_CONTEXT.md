# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 15:44 ET, Session 3.7 (Export with pictures), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.7 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN (Session 3.1). Not touched in 3.7.

## Session 3.7: what was done
- netlify/functions/offers-export.mjs: the export file now also has `images` [{ id, type, bytes, width, height, dataBase64 }] for every picture a current offer refers to (each once, first use first), `imagesOmitted`, `imagesMissing` and `imagesNote` (a plain sentence for 3.10 to show, "" when nothing to say). The existing fields are unchanged.
- Size guard: EXPORT_MAX_BYTES = 4.5 MB (one constant, exported). Parts are planned from stored sizes (headImage) with 400 bytes of room per entry. Pictures that do not fit go in `GET /api/offers/export?images=rest` (kind "yavd-offers-export-images", file yavd-offers-<live|test>-images-<stamp>.json).
- Extension past the plan (reversible, no contract change): if part 2 is also full, it names part 3 (`?images=rest&part=3`, file ...-images-part3-...), and so on, up to part 50. Each part file has `part`, `parts`, `next`. A part past the end answers 200 with "Nothing more to download". Bad query values: 400.
- A picture that cannot be read (gone, unusable details, store down or cannot open) goes in `imagesMissing`; the export still answers 200 with every offer. The picture store is never opened when no offer has a picture.
- New netlify/tests/offers-export.test.mjs (12 tests): no pictures; pre-1.3.0 offers byte-identical; one-picture round trip (decoded bytes equal stored); duplicate reference read once; unreferenced picture left out; eight 590 KB spill 5 + 3, each under the limit; twenty 590 KB make four parts chained by `next`; missing and unusable pictures; store down or cannot open; live naming; signed out 401; bad queries 400.
- Mutation check: size guard disabled: the 2 spill tests fail; restored: 12 pass, 5 runs in a row.

## Assumptions (reversible)
- Parts are worked out again on each request, so part 2 matches part 1 only if no offer was saved between the two downloads. 3.10's message should say to download both together.
- A picture that does not fit is never split: a part always takes at least one picture.

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config (fallback built), the edge-lib import bundles, and that a ~4.5 MB export response really downloads (lower EXPORT_MAX_BYTES if not).
2. offers-stats.test.mjs "twenty parallel views all land" still fails on this PC (pre-existing, unchanged, backlog). Every other suite passes: contract-images 12, offer-edge 21, offer-format 10, offer-image-routes 27, offer-image 34, offer-images-cleanup 15, offer-images-store 11, offers-auth 13, offers-export 12, offers-image-save 15, offers-rules 22, site-admin 12.
3. No CI exists in this repo (.github/workflows absent): sessions are verified by the local test run only.
4. No DIRECTIVES.md or DECLARATIONS.md exist in ai/ (the run prompt names them). Constraints live in BUILD_NOTES, the plan and the scope.
5. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.

## Estimate vs actual
Estimated M, ~5 min of Michael's time. Actual M (about 20 min build, tests green first run); Michael's time about 1 min (Claude ran the commit and push).

## Backup coverage
No new store. Export now holds the current offers' pictures, so the export is a full backup of offers plus the pictures they show. Pictures that only saved versions refer to are not exported (by design: Restore uses the stored copies, which cleanup keeps).

## Next step
Session 3.8 (The popup shows the image, UI, M), tag session-3.8. Tag after 3.7: CLEAR (fresh conversation or fresh helper, no stop). 3.8 ends with APPROVE: Michael steps through the review page.
