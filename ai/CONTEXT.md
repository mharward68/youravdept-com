# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 17:05 ET, Session 3.8 (The popup shows the image), Phase 3 Offer Images. Nothing deployed.

## STOP: waiting for Michael (APPROVE after 3.8)
Step through the review page https://claude.ai/artifact/Y7vsmTC5zDe3EMwG4rLgQF (7 screens) and answer: do the three placements look right, is the 720 px side layout acceptable, does the phone stack read well. A layout change is CSS only (assets/offer-panel.css "picture" block) and 3.9's editor preview reuses it, so settle it before 3.9.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 planned, not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.8 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN. Not touched in 3.8.

## Session 3.8: what was done
- assets/offer-panel.js: readImage() checks offer.image (id pattern, integer width and height, placement with top as fallback) and builds div.yavd-op-media > img.yavd-op-img as the first child of the scroll area; dialog gets is-img-top/left/right. Image error or the thank-you screen removes the block and class. Picture is fetched during the 1.5 s open delay, or only on reopen for a visitor who closed recently.
- assets/offer-panel.css: picture block (top edge to edge, max 320 px; left/right widen to 720 px with a 38 percent column; phone stacks, max 34vh; contain, never cover). Carried Phase 1 item done: phone preview badge clears the close button (one line).
- New netlify/tests/offer-panel-image.test.mjs (14 Playwright tests): 3 placements x desktop and phone with no layout jump (height held before the picture loads, same after within 1 px); broken address falls back; bad details never make a request; unknown placement; no-picture markup byte-identical to the 1.2.0 popup; Tab order and Escape unchanged; recently-closed deferral; thank-you drops the picture; badge clear of close button.
- Mutation checks: width/height attributes removed: the 3 desktop no-jump tests fail (space held 0). Badge line removed: badge test fails. Both restored, all 14 pass.
- Screenshots: ai/review/3.8/ (6 placements plus the badge). Review page published (link above).

## Assumptions (reversible)
- Playwright lives outside the repo (%LOCALAPPDATA%\yavd-test-tools, playwright-core 1.49.1) and drives the installed Edge: a test tool, not a site dependency. The test skips with a reason where it is missing.
- Portrait pictures on a phone keep their shape with light grey side bars (contain), capped at 34vh.
- Right placement puts the picture 30 px lower to clear the close button.

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config, edge-lib import bundles, ~4.5 MB export download.
2. offers-stats "twenty parallel views" still fails on this PC (pre-existing, backlog). Every other suite passes, including offer-panel-image 14.
3. No CI in this repo (.github/workflows absent): verified by the local test run only.
4. No DIRECTIVES.md or DECLARATIONS.md in ai/. Constraints live in BUILD_NOTES, the plan and the scope.
5. Phase 1 backlog: 1.2b alert email, README, untrack .netlify/, test store tidy, later list. (Phone preview badge now done.)
6. Screenshots use fallback fonts (Google Fonts answered empty in tests for stable results); the live popup uses Montserrat and Inter.

## Estimate vs actual
Estimated M, ~10 min of Michael's time. Actual M (about 35 min build, including installing Playwright on this PC); Michael's time so far 0, plus the review.

## Backup coverage
No new or changed store of user data. Popup display only.

## Next step
After Michael's answers: if he asks for layout changes, Session 3.8b (CSS only, from the reserve). Otherwise Session 3.9 (Editor image block, UI, L) on a fresh helper, tag session-3.9.
