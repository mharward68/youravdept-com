# CONTEXT: YAVD Offers Module

Updated: 2026-11-12 09:15 ET, Session 3.12 (Go live and close the phase). PHASE 3 OFFER IMAGES CLOSED. Offer pictures are live on youravdept.com (contract 1.3.0) since 2026-11-12 09:00 ET. Michael added his first real picture to a draft, previewed it on computer and phone, and exported: "Looks great."

## What exists now
- Offers Module live since 2026-10-10, eyebrow and formatting since 2026-10-12 (1.2.0), pictures since 2026-11-12 (1.3.0): one picture per offer, top/left/right placement, required alt text, shrunk in the browser, type checked from the bytes on the server, cleanup after saves, Export with pictures in parts, editor Cancel button and Escape.
- Contract shared/offer-contract.js 1.3.0, FROZEN. Any change is a new scope.
- Live offers: 2, both placeholder Booth Proof drafts (one now with Michael's picture). No running offer on live.
- TEST https://offers--your-av-dept.netlify.app runs the same build. Three look offers (test-311-*) end about 2026-11-14 05:06 ET.

## Session 3.12: what was done (INFRA, no app code)
- TEST deploy of the 3.11b build; Michael's Cancel check passed.
- Claude outputs/session-3.12-golive.ps1 + session-3.12-helper.mjs (git-ignored): guard, sign-in from clipboard, BEFORE snapshot and export backup, tag, deploy.ps1, read-only live checks, verdict. -Rehearse http://localhost:<port> runs it against a stand-in.
- Two runs stopped BEFORE publishing (my bugs, see BUILD_NOTES "Verify and go-live scripts"): a Tee wrapper killed the Netlify CLI; `$listB` overwrote `$ListB` (case-insensitive names). Fixed, rehearsed 10/10 locally, then the live run passed first time.
- Phase close: scope criteria verified, BUILD_NOTES curated, DECISIONS entries added, MAP refreshed.

## Verified (real output, 2026-11-12)
- Live verdict: 10 of 10 PASS (backup export written; live offers identical 2 before, 2 after; /, /how-we-get-paid, /our-story byte-identical; contract 1.3.0 in file and GET /api/offers; store "offers"; signed-out upload, save, export 401; unknown and malformed picture ids 404 with no-store, nosniff, noindex; storage-off switch ignored; sign-out works).
- By hand: /offer/industry-group 302 link-draft with and without x-yavd-test-store-fail (switch ignored on live); /offer-admin serves oa-cancel.
- Full suite: `node --test netlify/tests/*.test.mjs` tests 253, pass 252, fail 1 (offers-stats "twenty parallel views", 14 !== 20, pre-existing, open item 1).

## Scope success criteria (ai/spec/offer-images-scope.md section 12)
1. Add in admin, no deploy, see in preview: Michael did it on live today; tests "3.10 add and save", "placement changes the preview in Desktop and Phone modes". PASS
2. Popup on desktop and phone, three placements, no jump: tests "top/left/right on desktop/phone: placed, no jump" (6); TEST look 3.11; Michael's live preview today. PASS
3. Wrong type, SVG, over the cap refused on server and browser: "upload: an SVG (or GIF, or HTML) sent as image/png is refused 415", "real length over the cap is 413", browser "SVG, GIF, HEIC ... refused before decoding"; TEST E1-E5. PASS
4. Upload and remove 401 signed out, picture public: live A3-A5 401; TEST F1 picture loads with no cookie. PASS
5. Replace and Remove; cleanup only when unused, never within 24 h: "3.10 replace ... remove sends null", "grace boundary 24 h kept, 24 h + 1 ms deleted", "replace: the old picture stays while a saved version refers to it"; TEST I1-I5. PASS
6. Delete a draft with a picture, restore it: "delete a draft with a picture, save something else, restore it: the picture is still there". PASS
7. Export holds the pictures, matching: "eight 590 KB pictures ... together they hold all eight once"; TEST K: all 8 byte-exact. PASS
8. Storage off, popup and pages still load: "broken picture address: popup falls back", "storage down: view is a quiet 404"; TEST H4 and F6. PASS
9. Existing offers unchanged: "no picture: popup markup is exactly the 1.2.0 popup", "old offers ... come back exactly as stored"; live: offers identical, pages byte-identical. PASS

## Calibration (plan vs actual, from ai/archive)
- Sessions: planned 12 (+35% allowed, about 16). Actual 13 (3.11b from Michael's TEST review). 1 of 4 contingency sessions used (+8%).
- Sizes: held on 3.1, 3.2, 3.3, 3.6, 3.7, 3.8, 3.10; smaller on 3.4, 3.5 (S to M) and 3.9 (L planned, about 15 min); larger on both live-contact sessions, 3.11 (M to L, 60 min) and 3.12 (M to L, about 75 min including two stopped runs and the rehearsal). Build time about 6.3 hours over 13 sessions.
- Michael's time: planned about 105 min (137 at the Phase 1 x1.3). Actual about 65 min (estimated: 3.1 to 3.7 about 11, 3.8 review about 10, 3.11 deploy, verify and look about 25, 3.12 Cancel check, three password copies, first picture and Export about 20).
- Implication for later phases: drop the x1.3 on Michael's time now that sessions run git, deploys and tests themselves (use x1.0). Keep session count +20% (not +35%) for UI phases with an early review stop. Size any session that first touches TEST or live as L, and rehearse its script locally inside the session.

## Five objectives at the close
- Security: signed-in upload (401/403 proven live), type from bytes, SVG/GIF/animated refused, caps, random ids, nosniff/noindex/sandbox CSP on pictures, alt as plain text, no new dependency. Nothing open.
- Stability: backups before and after go-live, live data unchanged, storage failures collapse quietly, cleanup deletes nothing on doubt. Open: the stats parallel-count test failure (item 1) before Phase 2 builds on that pattern.
- Efficiency: shrink before upload, one immutable-cached request per popup view, export parts under 4.5 MB. Nothing open.
- User experience: live preview as saved, three placements, phone stacking, plain messages, Cancel and Escape. Michael: "Looks great." Nothing open.
- Scalability: one blob per picture, no cap in the data model, sized for about 50 offers a year. Nothing open.

## Backup
- Before: Claude outputs/yavd-offers-LIVE-export-20261112-0859-pre-images.json and tag pre-images-live-20261112-0859 (pushed). After: Michael's own Export from /offer-admin (keep private: preview keys and the picture). Copy both export files to your Drive backup folder. Store coverage: offer-images is covered by Export (current pictures); older pictures kept for restore are not exported (accepted in the scope).

## Open items (backlog, none block)
1. offers-stats "twenty parallel views" fails on this PC (14 of 20). Phase 2 reuses this conditional-write pattern: understand it first (Session 2.1 or a spike).
2. No CI in this repo: verified by local test runs only.
3. Phase 1 backlog: 1.2b alert email, README (Michael did not ask for the Offers paragraph), untrack .netlify/ (shows modified after every deploy), test store tidy, later list.
4. Screenshots use fallback fonts in tests.
5. Delete the phase 3 run sheet copies (Google Doc or Word) if any were made; the repo file stays as the record.

## Estimate vs actual (3.12)
Estimated M, ~25 min of Michael's time. Actual L, about 75 min build; Michael about 20 min (Cancel check, three password copies, first picture, Export).

## Next step, honestly
Phase 2 (Key Actions Dashboard, ai/phases/phase-2-activity.md) is planned from code (2026-10-13) and its scope is approved; it does not need intake. It is a month old, so start with a short re-plan check: confirm its "Found" items against today's code (offer-admin, site-admin and offers functions changed in Phase 3), resolve open item 1 (the parallel-count failure, since 2.x copies that pattern), and recount sessions with the calibration above. Then run its sessions. Ask Michael whether to make the Phase 2 Build Document first.
