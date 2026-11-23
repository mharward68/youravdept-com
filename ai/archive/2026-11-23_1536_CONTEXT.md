# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:32 ET (PC clock), Session 4.3 (The landing store; DATA), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tag pre-landings-20261123. Sessions done: 4.1 (contract), 4.2 (rules), 4.3 (store).

## Session 4.3: what was done (DATA)
- New netlify/functions/lib/landings-store.mjs, steps copied from offers-store.mjs (which was not edited). Exports:
  - LandingStoreError (status 503 default; 500 unreadable data or a change that returns no array; 409 lost the race 3 times; 404 bad history key)
  - _setLandingsStoreFactoryForTests(fn), landingsStore(deployContext), landingsStoreName(ctx) ("offer-landings", "-test" off production)
  - loadLandings(store) gives { landings, etag, exists, seq }
  - changeLandings(store, change, { action, landingId, now }): change(copy) returns { landings, result } or { stop }; result { saved:true, result } or { saved:false, stop }
  - listLandingHistory (newest first by change number), trimLandingHistory (keeps 20), landingHistorySummary, restoreLandingHistory(store, key, { now }), isLandingHistoryKey, landingHistorySeq
- History record: { replacedAt, action, landingId, landings }. Keys history/<ISO>-<9-digit seq> only (no old 6-hex keys, unlike offers).
- New netlify/tests/landings-store.test.mjs (16 tests). Parallel tests use a read barrier, so the race is forced every run, and one test strips onlyIfMatch to show a save is lost without it.

## Assumptions (reversible, logged)
- No routes or restore endpoint for landing history this session (plan: library only). 4.4 or later decides whether the admin exposes restore.

## Verified (real output, 2026-11-23)
- landings-store 16/16, three runs in a row. landings-rules 28/28, offer-contract-landings 15/15, offers-rules 22/22 still pass.

## Estimate vs actual (4.3)
Estimated M, ~5 min of Michael's time. Actual S to M (about 15 min build); Michael 0 min.

## Backup coverage
Defines a new store ("offer-landings"), but nothing has written to it: no real data exists yet. Code only; backed up by git (tag session-4.3). Export coverage of landings is Session 4.7.

## Open items (backlog, none block)
1. For 4.4: archiving a Draft from the list. prepareLanding refuses Draft to Archived today; decide in 4.4.
2. offers-stats "twenty parallel views" fails on this PC (14 of 20). The landing store parallel test did NOT hit it (ETag store, not a counter).
3. No CI in this repo: verified by local test runs only.
4. Until 4.6: saved offers carry no landing key; offers-rules.test.mjs filters it (remove in 4.6).
5. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.4 (Landing admin routes; API), tag session-4.4. After 4.3: CONTINUE, same helper.
