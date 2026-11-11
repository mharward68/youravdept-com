# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 08:40 ET, Session 3.1 (Freeze the contract), Phase 3 Offer Images. Nothing deployed.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 (eyebrow and formatting) shipped 2026-10-12. Site admin panel, Just the Audio and homepage work shipped since. Phase 2 (Key Actions Dashboard) is planned and not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md. Scope: ai/spec/offer-images-scope.md.

## Session 3.1: what was done
- Backup tag before the session: pre-images-20261111 (local; pushed with the commit block).
- shared/offer-contract.js is now 1.3.0 and FROZEN: image field after body in OFFER_KEYS and PUBLIC_OFFER_KEYS; emptyOffer image null; ROUTES.apiImage and ROUTES.image; STORES.images; IMAGE, IMAGE_KEYS, PUBLIC_IMAGE_KEYS, imageUrl(). publicPayload gives image null when absent and only the five public keys when present. IMAGE sits after HISTORY_KEEP (it reads it at load).
- New test: netlify/tests/offer-contract-images.test.mjs (12 tests).
- Existing tests adjusted (tests only, no app code): offer-edge (payload key list gains image, and image is null), offer-format (version check accepts 1.3.0), offers-rules (saved-offer key list excludes image until 3.5).

## Corrections to the documents (code wins)
- Plan "Found 2" is right, and there is a second effect: prepareOffer copies every OFFER_KEYS entry, so until 3.5 a saved offer carries image: undefined, which JSON drops. Old and new offers therefore save with no image key and read as null. Harmless; 3.5 sets it properly and removes the exclusion in offers-rules.test.mjs.
- The archived CONTEXT said contract 1.1.0; the code was 1.2.0 (DECISIONS 2026-10-12). Now 1.3.0.
- Plan DONE WHEN lists offers-stats as passing. It does not, before or after this session (see open items).

## Open items
1. offers-stats.test.mjs "twenty parallel views all land" fails on Michael's PC (Node 24.19.0): 13 of 20 counted, the rest answered busy. It fails identically with the 1.2.0 contract, so it predates Phase 3. No lost counts (stored equals counted); the retry limit gives up under 20-way contention. Backlog: decide whether to raise the retry count or loosen the test. Not Phase 3 work.
2. Phase 1 backlog unchanged: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.
3. RESOLVED 2026-11-11 after 3.1: GitHub main had 12 commits this PC lacked (Production Partners, header menu, first ZipDrop) and this PC had uncommitted live site work. Every page was compared with youravdept.com: live matched this PC. Committed the live work (b3b3a6b), merged GitHub keeping this PC's files (0fdafe4, tree unchanged), carried GitHub's README header and menu notes over (3590497). Backup tag before: pre-site-merge-20261111. Only .netlify/ remains uncommitted (backlog).

## Estimate vs actual
Estimated S, ~5 min of Michael's time. Actual S (about 15 min build); Michael's time about 5 min (paste the commit block).

## Backup coverage
No stored data created or changed. Code only; backed up by the git commit and tag session-3.1.

## Next step
Session 3.2 (Read and check an image, LOGIC, M), tag session-3.2, in a NEW conversation. Tag after 3.1: CLEAR.
