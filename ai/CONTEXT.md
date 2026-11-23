# CONTEXT: YAVD Offers Module

Updated: 2026-11-23 16:34 ET (PC clock), Session 4.10 (The expiration popup and the review page; UI), Phase 4 Offer Landing Pages. Contract shared/offer-contract.js stays 1.4.0, FROZEN, untouched. shared/landing-template.js untouched. Nothing deployed; live and TEST still run 1.3.0.

## STOP: APPROVE after 4.10
APPROVE stop after 4.10: Michael reviews the 6 screens and asks Andy to brand-check the first sample page; on his go, run Session 4.11 on a fresh helper.
- Review page (one self-contained file, screenshots embedded): ai/review/4.10/index.html. Rebuild with `node ai/review/4.10/build-review.mjs` after the screenshots change.
- Look notes carried from 4.8, shown on the review page: small emblem logo instead of the Booth Proof logo; white page with a navy band behind the button.
- If he asks for changes: page look is 4.8b from the reserve (shared/landing-template.js; any STYLE edit needs the new STYLE_HASH), popup look is 4.10b from the reserve (assets/landing-expired.css or .js). Popup wording lives in the contract: Hard limit, his word only.

## What exists now
- Phase 4 plan: ai/phases/phase-4-landing-pages.md, run sheet ai/phases/phase-4-RUNSHEET.md (4.1 to 4.10 now ticked there too), scope ai/spec/landing-pages-scope.md. Sessions done: 4.1 to 4.10.
- Renderer (4.8) shared/landing-template.js; serving function (4.9) netlify/functions/offer-landing.mjs at /offers/*.

## Session 4.10: what was done (UI)
- New assets/landing-expired.js (classic script, no imports, no shared code with the offer popup). Reads the JSON block #yavd-landing-expired the template writes on expired and archived pages; refuses any other state or broken JSON (no popup). Builds a role=dialog aria-modal dialog labelled by the contract text: text, Contact button (only if buttonUrl is https://), email as mailto link (only if it looks like an email), close button (aria-label Close). All text set with textContent. Opens 600 ms after load; closes on close button, Escape, backdrop click; Tab and Shift+Tab cycle inside; focus pulled back if it leaves; the page behind gets inert plus aria-hidden and a scroll lock while open; on close focus returns to what had it, else to the page h1 (given tabindex -1).
- New assets/landing-expired.css: everything scoped to .yle-*; brand navy and teal, Montserrat text, teal button with navy text like the page button; phone: full-width button; prefers-reduced-motion: no fade or slide.
- New netlify/tests/landing-expired.test.mjs (13 tests, Playwright with Edge): a Node server wraps the real offer-landing handler with in-memory stores, so pages carry the real CSP header (a CSP violation shows as a console error and fails the test; proven by adding a style attribute on purpose, then reverted). Analytics requests answered empty. Writes the six screenshots to ai/review/4.10/.
- New ai/review/4.10/: six PNGs, build-review.mjs, index.html (about 1 MB, no external files; checked in Edge at 1366 and 390 px: 6 screens, 6 dots, Back, Next, arrow keys, image fits the window, no errors).

## Decisions and assumptions (logged, reversible)
- The dialog has no title line: the contract gives only the text, button label, URL and email, and adding words would change the popup wording (Hard limit). It is labelled by the contract text.
- The popup opens on every visit (no "closed recently" memory like the offer popup): an expired page has nothing else to offer, and no storage is used.
- Sample content on the review screens is test content written for the review (exhibitor video), not a real offer; the picture is drawn by the test.

## Verified (real output, 2026-11-23)
`node --test netlify/tests/landing-expired.test.mjs`: 13/13, exit 0. landing-render 23/23, landing-serve 27/27, offer-contract-landings 15/15.

## Estimate vs actual (4.10)
Estimated M, ~10 min of Michael's time (the review). Actual M (about 30 min build); Michael 0 min so far, the review is his ~10 min.

## Backup coverage
No stored data created or changed (in-memory stores only). Code backed up by git (tag session-4.10).

## Open items (backlog, none block)
1. Prove on TEST in 4.15: /offers/* reaches the function; the popup files are published (deploy.ps1 copies assets/ whole) and load under the live CSP; GA4 counts a function-served page; popup and takedown stay off /offers/.
2. landing-serve.test.mjs reads git tag session-4.8. Fetch tags first in a fresh clone.
3. Re-running landing-expired.test.mjs rewrites the 4.10 screenshots (pixel noise); check them out again if nothing changed, or rebuild index.html if they did.
4. offers-stats "twenty parallel views" fails on this PC. Unrelated. No CI in this repo.
5. Editor (4.11 to 4.14): clear buttonUrl when a landing link is removed; show fields.landing messages; 4.13 preview: renderLanding with `{ state, isPreview: false, imageSrc }` in a no-scripts sandbox iframe (the expiration popup will not run there, by design).
6. Phase 1 backlog: 1.2b alert email, untrack .netlify/, test store tidy. Phase 2 (Key Actions Dashboard) still planned, not run.

## Next step
APPROVE stop after 4.10: Michael reviews the 6 screens and asks Andy to brand-check the first sample page; on his go, run Session 4.11 on a fresh helper. Session 4.11 (The Landing Pages list in the admin; UI, M), tag session-4.11.
