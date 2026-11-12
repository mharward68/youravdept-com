# CONTEXT: YAVD Offers Module

Updated: 2026-11-11 18:50 ET, Session 3.9 (Editor image block), Phase 3 Offer Images. Nothing deployed.

## Stops
The 3.8 stop ("waiting for Michael") is CLEARED: Michael approved the 3.8 review page as is (three placements, the 720 px side layout and the phone stack). No 3.8b.

## Where things stand
- Phase 1 closed and live since 2026-10-10. Contract 1.2.0 shipped 2026-10-12. Phase 2 planned, not started; Phase 3 is independent of it.
- Phase 3 plan: ai/phases/phase-3-offer-images.md. Run sheet: ai/phases/phase-3-RUNSHEET.md (3.1 to 3.9 ticked). Scope: ai/spec/offer-images-scope.md.
- Contract shared/offer-contract.js is 1.3.0 and FROZEN. Not touched in 3.9.

## Session 3.9: what was done
- Spike first: a blob: address renders in the sandboxed preview iframe (allow-same-origin, no scripts). No data: fallback needed.
- offer-admin.html: new "Image (optional)" fieldset under Popup copy: Add image, file name, size, thumbnail, Replace, Remove, description with an always-on n / 125 counter, placement radios (Top banner default, Left, Right). Error slots image.alt, image.placement, image.id.
- assets/offer-admin.js ("Session 3.9" block before field messages): type checked from the first bytes (JPEG, PNG, WebP only; SVG, GIF, HEIC, renamed files refused), files over 40 MB not decoded, createImageBitmap, longest side 1600, WebP (JPEG if WebP cannot be written), quality steps down to under 400 KB, refused over 600 KB, too-small refused. Picture held in `pic` (blob: address, revoked on replace/remove). drawPreview draws the 3.8 popup markup. fill() and wipeEditor() load/clear the picture; inputFor() knows the image keys; grabInputs/putInputs skip the file input. Dashboard cards show a small thumbnail.
- assets/offer-admin.css: image block and card thumbnail styles.
- New netlify/tests/offer-admin-image.test.mjs (11 Playwright tests, real handlers, in-memory Blobs). Screenshots ai/review/3.9/ (editor with picture, preview top/left/right on desktop, phone stack, dashboard card).

## Files changed
offer-admin.html, assets/offer-admin.js, assets/offer-admin.css, netlify/tests/offer-admin-image.test.mjs (new), ai/review/3.9/*.png (new), ai docs.

## Assumptions (reversible)
- Saving does not send the picture yet (3.10). collect(), snapshot() and isDirty() ignore it, so a save in 3.9 keeps the stored picture and an unsaved new one is dropped on save. Nothing is deployed before 3.10.
- Card thumbnail is decorative (alt ""), lazy, removed if it fails to load.
- Files over 40 MB are refused without decoding (new editor message, not a server message).
- Remove also clears the description and resets placement to Top.

## Open items
1. Still to prove on TEST (3.11): `:id` path params in a function config, edge-lib import bundles, ~4.5 MB export download.
2. offers-stats "twenty parallel views" still fails on this PC (pre-existing, backlog). Every other suite passes.
3. No CI in this repo: verified by the local test run only.
4. Phase 1 backlog: 1.2b alert email, README, untrack .netlify/, test store tidy, later list.
5. Screenshots use fallback fonts (fonts answered empty in tests).

## Estimate vs actual
Estimated L, ~5 min of Michael's time. Actual about 15 min build (well inside the 45-minute stop rule, no 3.9b needed); Michael's time 0.

## Backup coverage
No stored data created or changed (in-memory test stores only). Nothing to back up.

## Next step
Session 3.10 (Save, replace, remove, rerun; STATE, M). Tag after 3.9: CONTINUE (3.10 extends the `pic` state this session wrote).
