# CONTEXT: YAVD Offers Module

Updated: 2026-10-10 11:40 ET, Session 1.8 (Offer editor, rerun and preview). BUILT and verified locally. Draft check and Michael's own run waiting on session-1.8-verify.ps1.

## Where things stand
- /offer-admin now creates, edits, schedules, takes down, deletes (drafts only) and reruns offers, with a live preview and the saved-versions list. Same three files as 1.7: offer-admin.html, assets/offer-admin.css, assets/offer-admin.js.
- Editor: page dropdown (from /api/offers/pages), name, Everyone or Link only, link name (tidied to lowercase-hyphens on leaving the field), headline, copy, form on/off, Show and Required ticks for all 16 fields, labels for the three spare fields, choices for "Choose one", button label, thank-you, button destination when the form is off, start and stop date and time in Eastern with the saved time in plain words underneath.
- Buttons: Save as draft / Save and schedule; on a running or upcoming offer they read "Take down (save as draft)" / "Save changes". Server messages appear next to their field plus a summary at the top with links to each field.
- Run again (expired cards): a filled-in copy, same link, dates cleared (times of day kept), rerunOf set. The original stays in Expired.
- Live preview: sandboxed iframe, same markup and CSS as the real popup, Desktop and Phone sizes, updates as you type. Preview link (Open and Copy) appears after the first save.
- Unsaved changes: Back, Sign out and closing the tab all ask first (inline bar; only tab-close uses the browser's own warning). Expired sign-in during a save keeps the edits and brings them back after signing in. A save made elsewhere is refused (409) with "Load the saved version".
- Saved versions: top-bar button lists the last 20 with what changed; "Put this back" asks first; the restore itself is kept, so it can be undone.
- Local checks (real functions, in-memory Blobs, Playwright): 27/27 main run (recorded) + 10/10 edge cases. No script errors.
- Live site unchanged. Contract unchanged (1.1.0).

## What this session did
- Modified: offer-admin.html, assets/offer-admin.css, assets/offer-admin.js.
- Created: Claude outputs/session-1.8-verify.ps1, session-1.8-recorded-run.webm, session-1.8-*.png (8 screenshots).
- No server code, contract, netlify.toml or existing page touched.

## Assumptions made (logged in DECISIONS)
- Stop time saves as hh:mm:59 so "11:59 PM" includes that minute. Rerun clears dates, keeps times. Delete draft button in the editor. Preview is a non-interactive mock in an iframe; the real popup is the preview link.

## Open items
1. Michael runs session-1.8-verify.ps1, then creates one offer himself start to finish (Needs my eyes).
2. Backlog (1.6 file, not this compartment): at phone width the "Preview: submissions are marked as tests" badge on the real popup runs under the close button. One CSS line in offer-panel.css (margin-right on .yavd-op-test). Contingency session or 1.10.
3. 1.2b (alert email through Resend) still needs Michael's OK.
4. Test store tidy: leftover TEST offers from 1.4 to 1.7. Drafts can now be deleted from the editor; scheduled ones can be taken down to draft first. Only in offers-test.
5. .netlify/functions/manifest.json tracked by git (backlog, from 1.2).
6. Michael's 1.7 layout look: no notes recorded yet.

## Estimate vs actual
Session 1.8: estimated L (about 20 min of Michael's time). Actual: L build (about 45 min). Michael's time so far: about 1 min; the verify run and his own offer add about 15.

## Next step
Run the verify block, create one offer on the draft address, commit and push. Then Session 1.9 (Views and leads counts, optional) or straight to 1.10, in a new conversation.
