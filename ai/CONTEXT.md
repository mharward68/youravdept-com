# CONTEXT: YAVD Offers Module

Updated: 2026-11-12 05:15 ET, Session 3.11 (Test deploy and verification script), Phase 3 Offer Images. STOPPED FOR MICHAEL (APPROVE): deployed to TEST, verify run 28 of 29 (the 1 FAIL was the check, fixed); his look on computer and phone still owed.

## TEST run 2026-11-12 05:07 ET (Michael, -SkipDeploy after a deploy the same night)
- 28 of 29 PASS on https://offers--your-av-dept.netlify.app. Proven on the real Netlify: `:id` path params, edge-lib imports bundle in functions, uploads, every refusal, picture headers, storage-off, cleanup grace, export part 1 4,227,882 bytes (1.3 s) + part 2 2,417,449 bytes (1.0 s), all 8 big pictures byte-exact.
- The FAIL, J (existing offer saves unchanged): "TEST 1.6 PREVIEW 6027" predates contract 1.2.0 and had no eyebrow key; the save wrote eyebrow "" (the only diff). Not a regression: readers treat missing and "" the same. The helper's compare now treats a missing eyebrow as "" (and a missing image as null); proven on that exact case, and a real change is still caught. No rerun needed for it.
- Picture responses on Netlify carry no content-length header (the len= column was empty); not checked, no effect.
- 10 offers on TEST before the run, 13 after (the three look offers, test-311-<top|left|right>-1944, end about 2026-11-14 05:06 ET).

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 planned, not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.10 ticked; 3.11 built, waiting for Michael's TEST run). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN. Not touched in 3.11.

## Waiting on Michael (the 3.11 stop)
1. DONE 2026-11-12 05:07: verify run on TEST (28 of 29; the FAIL was the compare, fixed).
2. Look at the three printed /offer/test-311-<top|left|right>-<tag> links and the editor, in a NEW private window, on computer and phone (checklist: run sheet, "TEST checklist (after 3.11)").
3. Say go (or what looked wrong: that becomes 3.11b). Then 3.12.

## Session 3.11: what was done (QA, no app code changed)
- Claude outputs/session-3.11-verify.ps1 (not in git, like every earlier verify script): signed-out 401s (upload, save, export); JPEG/WebP/PNG uploads with type from the bytes; SVG (also disguised as PNG), GIF 415, 700 KB 413, 10x10 422; storage-off upload 503; picture GET with no cookie (exact bytes, type, nosniff, noindex, immutable, sandbox CSP), HEAD, unknown and malformed ids 404 no-store, storage-off 404; three running link offers (top, left, right) polled until link-running, page data has exactly the 5 public image keys, saved placements, no preview key; storage-off page never errors; replace (old picture still served within the grace), remove (listed with no picture); one existing TEST offer saved unchanged and compared key by key; eight ~590 KB pictures on draft offers, export part 1 under 4.5 MB with imagesOmitted, part 2 is exactly what part 1 left out, every big picture byte-exact; nine drafts deleted, every earlier offer still listed; sign-out.
- netlify/tests/session-3.11-helper.mjs (new, from an earlier interrupted attempt, finished here): makes the test pictures (checked with the server's checkImage), reads page data, summarises export files, writes full save bodies (body now sends the whole offer minus status, because only `image` may be absent from a save), compares before/after.
- Run sheet: TEST checklist added.

## Verified here
- Full local rehearsal: the verify script run end to end with -Target http://localhost:8931 against a scratchpad server wrapping the real handlers (in-memory Blobs, branch-deploy, edge link logic). Second run: 29 of 29 PASS (export part 1 4,398,276 bytes with 3 pictures left for part 2; part 2 2,417,449 bytes, exactly those 3; every big picture byte-exact). The first run caught one script bug (part 1 has no "next" key; part 2 is always ?images=rest), fixed.
- Unit tests through the script: 11 files, 192 pass, 0 fail.
- NOT run: anything against the TEST address (needs Michael's password and his deploy). That is the stop.
- A leftover helper agent from an earlier 3.11 attempt was found writing in parallel and stopped. Its root-level script was moved out of the repo (to the Claude scratchpad), its deploy-script edits reverted. Its test runs rewrote 3 screenshots in ai/review/3.9/ (pixel noise, left unstaged: restore with git checkout -- ai/review/3.9/).

## Files changed
netlify/tests/session-3.11-helper.mjs (new), ai/phases/phase-3-RUNSHEET.md, ai docs. Claude outputs/session-3.11-verify.ps1 (new, untracked by design).

## Assumptions (reversible)
- The storage-off check on the page accepts 200 or 302: with the header the edge cannot read offers, so a link answers 302 to / (1.5 behaviour). "Popup data intact" is proven by the normal page fetch while the picture route alone fails.
- The three look offers stay running for 48 hours on TEST (link offers, they clash with nothing). 3.12 or a later save can tidy them.
- The verify script refuses any target except the TEST address or http://localhost:<port>. It deploys itself (like 1.4) instead of Michael running deploy-preview.ps1 separately; -SkipDeploy reruns checks only.

## Open items
1. offers-stats "twenty parallel views" still fails on this PC (pre-existing, backlog). Not in the script's unit list.
2. No CI in this repo: verified by the local test run only.
3. Phase 1 backlog: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.
4. Screenshots use fallback fonts (fonts answered empty in tests).

## Estimate vs actual
Estimated M, ~25 min of Michael's time (deploy, verify, look). Build actual L, about 60 min (an earlier attempt had left the helper half-done and a duplicate helper agent had to be stopped; the local rehearsal added ~15 min). Michael's time: still to come.

## Backup coverage
No stored data created or changed by this session. The script writes only to the TEST stores (offers-test, offer-images-test), which are test data and not under backup.

## Next step
Michael runs the 3.11 TEST checklist and pastes the verdict. All PASS and the look is fine: Session 3.12 (Go live and close the phase), on a fresh helper. A FAIL: 3.11b.
