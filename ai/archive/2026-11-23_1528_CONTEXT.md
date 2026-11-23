# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:30 ET, Session 4.1 (Freeze the contract), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js is now 1.4.0 and FROZEN for the rest of the phase. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archived context 2026-11-23_1523_CONTEXT.md has the close report and calibration).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md (first committed this session). Backup tag pre-landings-20261123 (= a8e0262) pushed.

## Session 4.1: what was done (API)
- shared/offer-contract.js 1.4.0, exactly the plan's contract: ROUTES apiLandings, apiLandingArchive, landingPage; STORES.landings 'offer-landings'; Offer typedef and OFFER_KEYS gain 'landing' after 'buttonUrl'; PUBLIC_OFFER_KEYS gains 'landing' (last); emptyOffer() landing null; publicPayload() landing null unless a non-empty string; LANDING, LANDING_KEYS, LANDING_EXPIRED, LANDING_MESSAGES, landingPath, landingSlugFromPath, landingState; 1.4.0 header line; text limits copied into a comment (name 120, eyebrow 60, headline 150, body 3000).
- New netlify/tests/offer-contract-landings.test.mjs (15 tests), including a check that the copied limits still equal offers-rules LIMITS.
- Existing tests fixed (key lists and version pins only): offer-edge, offer-format, offer-contract-images, offers-rules, offers-export, offers-image-save.

## Found items checked against the code
- Confirmed: SKIP_PREFIXES (offer-edge.js line 47) and both excludedPath lists lack /offers/ (4.9 adds it); publicPayload special-cases only image before this session; usedImageIds(offersStore) counts offers only (4.5); /api/offers/landings and /offers/* are free (no function, redirect or netlify.toml rule).
- Correction: the plan named four tests to fix; two more pinned the old shape (offers-export contract string, offers-image-save old-offer fixture). Fixed.

## Assumptions (reversible, logged)
- PUBLIC_OFFER_KEYS: 'landing' placed last (plan gave no position).
- landingState: missing landing = 'archived', unknown status = 'draft' (never public); unparseable offer dates do not set the window. landingSlugFromPath ignores ?query and #hash and never decodes.

## Verified (real output, 2026-11-23)
- offer-contract-landings 15/15, offer-edge 21/21, offer-format 10/10, offer-contract-images 12/12, offers-auth 13/13, offers-rules 22/22, site-admin 12/12.
- Full suite: tests 268, pass 267, fail 1 (offers-stats "twenty parallel views", pre-existing, open item 1).

## Estimate vs actual (4.1)
Estimated S, ~5 min of Michael's time. Actual S, about 20 min build; Michael 0 min.

## Backup coverage
No stored data created or changed. Code only; backed up by git (tag session-4.1, pushed).

## Open items (backlog, none block)
1. offers-stats "twenty parallel views" fails on this PC (14 of 20). Session 4.3's parallel test may hit the same pattern (plan says stop and report if so).
2. No CI in this repo: verified by local test runs only.
3. Until 4.6: saved offers carry no landing key; offers-rules.test.mjs filters it (remove in 4.6). The admin's new-offer blank now sends landing: null, which prepareOffer ignores until 4.6.
4. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.2 (Landing rules, pure; LOGIC), tag session-4.2. After 4.1: CLEAR, so a fresh helper runs it.
