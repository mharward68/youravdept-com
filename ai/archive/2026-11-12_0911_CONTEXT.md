# CONTEXT: YAVD Offers Module

Updated: 2026-11-12 05:35 ET, Session 3.11b (Editor Cancel button), Phase 3 Offer Images. DONE: Cancel button and Escape in the editor, 25 of 25 editor tests pass (twice). Not deployed yet: 3.12 deploys it to TEST first.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 planned, not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.11b ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN. Not touched in 3.11b.
- TEST (https://offers--your-av-dept.netlify.app) still runs the 3.11 build, without Cancel. Three look offers (test-311-<top|left|right>-1944) end about 2026-11-14 05:06 ET.

## Session 3.11b: what was done (UI)
- offer-admin.html: Cancel button (id oa-cancel, plain oa-btn) after Save and schedule, in the sticky action bar. Back to offers kept at the top.
- assets/offer-admin.js:
  - Cancel calls leaveEditor(): clean form goes straight to the dashboard with no request; unsaved changes show the existing guard (Keep editing / Discard changes).
  - Escape does the same, except while a save runs, while the unsaved guard or the delete dialog is open, during IME typing, or when something else already handled the key. Nothing in the editor used Escape before (checked offer-rich.js).
  - Cancel is disabled with the save buttons while a save runs.
  - leaveEditor() now releases a new picture held only in the page (blob: address revoked, pending shrink made stale). Before, it stayed in memory until the next offer was opened. Affects Back, Cancel, Escape, Discard, delete and the "no longer exists" path alike.
- netlify/tests/offer-admin-image.test.mjs: 4 new Playwright tests (clean Cancel and Escape, no API call; dirty Cancel guard, Stay keeps edits, Escape ignored over the guard, Leave discards and saves nothing; picture kept on Stay and released on Leave; Cancel disabled and Escape ignored during a slow save, Escape ignored over the delete dialog). Screenshot ai/review/3.11b/cancel.png.

## Verified here
- `node --test netlify/tests/offer-admin-image.test.mjs`: tests 25, pass 25, fail 0 (three clean runs; the last after the final change, which only moved the screenshot).
- The release check was proven: with the release line removed, "released on Leave" fails ("the blob: address is released"); restored, it passes.
- The 3.9 screenshots the run rewrites were restored with git checkout before committing.
- NOT run: TEST or live. 3.12 deploys.

## Files changed
offer-admin.html, assets/offer-admin.js, netlify/tests/offer-admin-image.test.mjs, ai/review/3.11b/cancel.png (new), ai/phases/phase-3-offer-images.md and phase-3-RUNSHEET.md (ticked), ai docs.

## Assumptions (reversible)
- Cancel sits after Save and schedule (last in the row), plain style. assets/offer-admin.css not changed: spacing was already right (screenshot).
- Escape over the open guard does nothing (it does not mean Keep editing), as the plan said.

## Open items
1. offers-stats "twenty parallel views" still fails on this PC (pre-existing, backlog).
2. No CI in this repo: verified by the local test run only, so no green check to confirm.
3. Phase 1 backlog: 1.2b alert email, README, untrack .netlify/ (it shows as modified again in git status), test store tidy, later list.
4. Screenshots use fallback fonts (fonts answered empty in tests).

## Estimate vs actual
Estimated S, ~2 min of Michael's time (his Cancel click is at the start of 3.12). Actual S, about 25 min build; Michael's time: none in this session.

## Backup coverage
No store of user data created or changed. The release change only frees browser memory.

## Next step
Session 3.12 (Go live and close the phase, INFRA, M). Tagged CONTINUE from 3.11b. It starts with a TEST deploy (deploy-preview.ps1) where Michael opens /offer-admin in a NEW private window and clicks Cancel once (clean, then with a change), then the backup, live deploy and phase close.
