# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:56 ET (PC clock), Session 4.6 (Offers link to a landing page; LOGIC), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tags pre-landings-20261123 and pre-landings-record. Sessions done: 4.1 (contract), 4.2 (rules), 4.3 (store), 4.4 (routes), 4.5 (cleanup), 4.6 (offer link).

## Session 4.6: what was done (LOGIC)
- lib/offers-rules.mjs: prepareOffer takes ctx.landings (Map slug -> landing record). `landing` absent keeps the stored link, null or "" removes it. A new link must exist and not be archived (LANDING_MESSAGES.gone / archivedLink); form on with a link is refused (formOn). All on fields.landing. Linked: buttonUrl is set to landingPath(slug), a typed buttonUrl is ignored. Every save now writes `landing` (null when not linked).
- offers.mjs: lookUpWantedLanding (only when the link changes; unchanged link saves even if the page was archived since or landing storage is down). Landing storage trouble on a new link: 503, nothing saved. Cleanup now `cleanupImages(imagesStore(deployContext), store, new Date(), landingsStore(deployContext))` (carried item 1 closed).
- assets/offer-panel.js: button goes to C.landingPath(offer.landing) when the slug is valid and the form is off; otherwise buttonUrl exactly as before. Unlinked popup proved byte-identical to commit 56f1372.
- Tests: new offers-landing-link.test.mjs (13). landings-cleanup: `todo` removed from both 4.6 tests, now 14/14; the 4.5 regex `[^)]*` could never match the planned call, replaced by a literal check. offers-rules: `landing` filter removed (carried item 5 closed). offers-image-save: old-offer test now expects landing null. offer-images-cleanup: given an empty landings store (without it, cleanup fails safe and deletes nothing).

## Decisions and assumptions (logged)
- Unlinking leaves the stored buttonUrl (the landing path) as is unless the editor sends a new one. The editor (4.11 to 4.14) should clear or replace it when the link is removed. Reversible.
- A draft landing page may be linked (plan: "null or an existing, non-archived slug").
- Popup with a landing value but form on (cannot be saved) keeps the form.

## Verified (real output, 2026-11-23, exit codes 0)
offers-landing-link 13/13, offers-rules 22/22, offers-image-save 15/15, offer-panel-image 14/14, offer-edge 21/21, landings-cleanup 14/14 (0 todo), offer-images-cleanup 15/15. Full suite: all files pass except offers-stats "twenty parallel views" (pre-existing). Both 4.6 cleanup tests proved failing against the 4.5 offers.mjs.

## Estimate vs actual (4.6)
Estimated M, ~5 min of Michael's time. Actual M (about 30 min build); Michael 0 min.

## Backup coverage
No stored data created or changed (in-memory stores only). New offer saves will carry a `landing` key once deployed; it is in the offer record, so Export and offer history already cover it. Code backed up by git (tag session-4.6).

## Open items (backlog, none block)
1. Not yet proved on a real deploy: the landing routes register and bundle cleanly. Check on TEST in 4.15.
2. offers-stats "twenty parallel views" fails on this PC (14 of 20). Unrelated.
3. No CI in this repo: verified by local test runs only.
4. Editor (4.11 to 4.14): clear buttonUrl when a landing link is removed; show fields.landing messages.
5. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.7 (Export includes landing pages; API), tag session-4.7. After 4.6: CLEAR, so a fresh helper runs it.
