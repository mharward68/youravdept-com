# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:36 ET (PC clock), Session 4.4 (Landing admin routes; API), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tag pre-landings-20261123. Sessions done: 4.1 (contract), 4.2 (rules), 4.3 (store), 4.4 (routes).

## Session 4.4: what was done (API)
- New netlify/functions/landings.mjs, path /api/offers/landings:
  - GET: { landings: [record + state + linkedOffers [{ id, name, slug, draft }]], store, deployContext, now, contract, notes }, oldest first. Offers store unreadable: still 200, linkedOffers empty, notes holds OFFERS_UNREADABLE.
  - POST (body = landing or { landing }): picture looked up first (same as offers.mjs), then prepareLanding inside changeLandings. 201 / 200 { ok, created, landing, previewPath, notes }; previewPath = /offers/landing-<slug>.html?preview=<key>. 400 fields, 404 gone, 409 stale or slug clash, 413 (page wording), 415, 503 storage or pictures.
  - Exports decorate(landing, offers, now) and readOffersSafely(ctx, notes) (used by the archive route), previewPath, IMAGE_UNAVAILABLE, OFFERS_UNREADABLE, TOO_LARGE.
- New netlify/functions/landings-archive.mjs, path /api/offers/landings/archive, POST { id, archived }: Live to Archived (archivedAt = updatedAt = now), Archived to Live (archivedAt null). Already in that state: 200 changed:false, nothing written. Goes through changeLandings, so history is kept (action "archive" / "restore"). Writes the record directly, not through prepareLanding.
- New netlify/tests/landings-routes.test.mjs (17 tests), including a proof that the 401 comes from requireAdmin (the source is loaded with the check removed and lets a signed-out caller in).

## Decisions and assumptions (reversible, logged)
- Draft to Archived: REFUSED by the archive route too (409 DRAFT_ARCHIVE). A draft is not public, so nothing needs taking down, and a restore can then never turn an unfinished draft Live without the Live checks. archived:false on a Draft is a no-op. The UI (4.11+) should hide Archive on drafts. Open item 1 from 4.2 is closed.
- linkedOffers gives { id, name, slug, draft } instead of bare slugs (the plan said slugs): an offer can have no slug, and the list needs names.
- Route paths are literal strings in config (Netlify reads config statically); a test checks they equal ROUTES.
- No picture cleanup after a landing save yet: Session 4.5 adds it.

## Verified (real output, 2026-11-23)
- landings-routes 17/17, three runs in a row. landings-store 16/16, landings-rules 28/28, offer-contract-landings 15/15, offers-rules 22/22, offers-image-save 15/15, offers-auth 13/13.

## Estimate vs actual (4.4)
Estimated M, ~5 min of Michael's time. Actual M (about 20 min build); Michael 0 min.

## Backup coverage
No stored data created or changed (in-memory stores only). Code only; backed up by git (tag session-4.4).

## Open items (backlog, none block)
1. Not yet proved on a real deploy: the two new routes register on Netlify, and landings-archive.mjs importing ./landings.mjs bundles cleanly. Check on TEST in 4.15.
2. offers-stats "twenty parallel views" fails on this PC (14 of 20). Unrelated to landings.
3. No CI in this repo: verified by local test runs only.
4. Until 4.6: saved offers carry no landing key; offers-rules.test.mjs filters it (remove in 4.6).
5. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.5 (Cleanup protects landing pictures; DATA), tag session-4.5. After 4.4: CLEAR, so a fresh helper runs it. 4.5 must also pass the landings store into cleanupImages from landings.mjs (plan says landings.mjs passes it "now").
