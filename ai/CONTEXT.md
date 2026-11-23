# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 15:28 ET (PC clock), Session 4.2 (Landing rules, pure; LOGIC), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched this session. Nothing deployed; live and TEST still run 1.3.0.

## What exists now
- Offers Module live since 2026-10-10, pictures since 2026-11-12 (1.3.0). Phase 3 closed (archive 2026-11-23_1523_CONTEXT.md has the close report).
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md, scope ai/spec/landing-pages-scope.md. Backup tag pre-landings-20261123. Sessions done: 4.1 (contract), 4.2 (rules).

## Session 4.2: what was done (LOGIC)
- New netlify/functions/lib/landings-rules.mjs: prepareLanding(input, { landings, now, images }) with the same return shape as prepareOffer ({ ok, landing, created, notes } or { ok:false, status, error, fields }). Also exports cleanCtaUrl, LANDING_LIMITS, STATUS_MOVES, LANDING_RULE_MESSAGES.
- Reuses from offers-rules.mjs (not edited): plainText, cleanButtonUrl, MARKUP_FACTOR, LIMITS, formatEastern, newId, newPreviewKey. Eyebrow, headline, body keep the offer formatting tags; name and ctaLabel are plain text.
- ctaUrl: cleanButtonUrl's rules, then http:// also refused (Hard limit: https:// or same-site path only). Message is LANDING_MESSAGES.ctaUrl.
- Picture: facts from the images map or the stored picture with the same id only; placement forced to 'top'; alt required (LANDING_MESSAGES.alt); unknown id gives IMAGE_MESSAGES.gone.
- Status: same status always allowed; draft to live, live to archived, archived to live. New records start draft (default) or live. archivedAt set on entering archived, kept while archived, null otherwise.
- Slug: required always, offer link rules, folded to lowercase; unique among ALL landings including archived (case-insensitive), clash is 409 with fields.slug; locked once stored status is not draft.
- Stale edit 409 (id plus updatedAt), unknown id 404 with LANDING_MESSAGES.gone, updatedAt always moves forward. Output in LANDING_KEYS order, nothing extra.
- New netlify/tests/landings-rules.test.mjs (28 tests).

## Assumptions (reversible, logged)
- Draft to archived is refused on save ("A draft cannot be archived. Make it Live first, or leave it as a draft."), because the plan lists only three moves. Session 4.4's archive route must not call prepareLanding to archive a draft, or must decide this differently (see open item 1).
- Slug clash is checked only after every field check passes (as offers checkRules does), so a request with field errors and a clash shows the field errors first.
- A missing ctaUrl on a Live page says "Add the button link." (rule message); a bad one says the contract ctaUrl message.

## Verified (real output, 2026-11-23)
- landings-rules 28/28, three runs in a row. offers-rules 22/22 and offer-contract-landings 15/15 still pass.

## Estimate vs actual (4.2)
Estimated M, ~5 min of Michael's time. Actual M (about 25 min build); Michael 0 min.

## Backup coverage
No stored data created or changed. Code only; backed up by git (tag session-4.2, pushed).

## Open items (backlog, none block)
1. For 4.4: archiving a Draft from the list. Either refuse it in the UI, or have the archive route allow it. Decide in 4.4; prepareLanding refuses it today.
2. offers-stats "twenty parallel views" fails on this PC (14 of 20). Session 4.3's parallel test may hit the same pattern (plan says stop and report if so).
3. No CI in this repo: verified by local test runs only.
4. Until 4.6: saved offers carry no landing key; offers-rules.test.mjs filters it (remove in 4.6).
5. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
Session 4.3 (The landing store; DATA), tag session-4.3. After 4.2: CLEAR, so a fresh helper runs it.
