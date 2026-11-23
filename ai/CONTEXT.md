# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 16:06 ET (PC clock), Session 4.7 (Export includes landing pages; API), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tags pre-landings-20261123 and pre-landings-record. Sessions done: 4.1 (contract), 4.2 (rules), 4.3 (store), 4.4 (routes), 4.5 (cleanup), 4.6 (offer link), 4.7 (export).

## Session 4.7: what was done (API)
- netlify/functions/offers-export.mjs: part 1 now carries `landingsStore`, `landingsCount`, `landings` (records exactly as stored, preview keys and archived pages included), `landingsMissing`, `landingsNote`, placed between `offers` and `images`. Pictures used by landing pages join the same packed list after the offers' pictures, each once. The landing records count towards part 1's size (the "worst case" shell is measured with them in it).
- Unreadable landing store (cannot open, read fails, or "all" is not a list): export still 200 with offers and their pictures, `landingsMissing: true`, `landingsNote` = LANDINGS_MISSING_NOTE (exported). The same sentence is appended to `imagesNote`, because that is the field the admin page already shows. Picture files (part 2 on) carry `landingsMissing` too.
- Tests: new netlify/tests/landings-export.test.mjs (10). offers-export.test.mjs: empty in-memory landings store in beforeEach, checks for the new keys (12/12). offer-admin-image.test.mjs: given an empty in-memory landings store (without one, its 3.10 export-note test failed because the note correctly gained the landings sentence).

## Decisions and assumptions (logged)
- The landings-missing sentence is put in both landingsNote and imagesNote so the admin shows it today without touching offer-admin.js (UI, 4.11 to 4.14). The editor sessions may show landingsNote separately and drop the duplication. Reversible.
- Landing history (saved versions) is not exported, matching offers (Export never held offer history either).

## Verified (real output, 2026-11-23)
`node --test netlify/tests/landings-export.test.mjs netlify/tests/offers-export.test.mjs`: 22/22, exit 0. Full suite by file: all pass except offers-stats "twenty parallel views" (pre-existing) and one run of offer-admin-image 3.11b (Cancel and Escape, browser timing; passed 4 of 5 runs, does not touch the export).

## Estimate vs actual (4.7)
Estimated S, ~5 min of Michael's time. Actual S to M (about 25 min build, one extra test file needed a landings store); Michael 0 min.

## Backup coverage
No stored data created or changed (in-memory stores only). The export is the backup: from this session it holds the landing records and their pictures, so a restore after a disaster keeps landing pages (once deployed). Code backed up by git (tag session-4.7).

## Open items (backlog, none block)
1. Not yet proved on a real deploy: landing routes register and bundle cleanly; export with landings on TEST. Check on TEST in 4.15.
2. offers-stats "twenty parallel views" fails on this PC (14 of 20). Unrelated.
3. offer-admin-image 3.11b failed once in five runs (browser timing). Watch it; harden if it repeats.
4. No CI in this repo: verified by local test runs only.
5. Editor (4.11 to 4.14): clear buttonUrl when a landing link is removed; show fields.landing messages; optionally show landingsNote on its own.
6. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.8 (The landing page renderer; UI, L, Low confidence), tag session-4.8. After 4.7: CLEAR, so a fresh helper runs it.
