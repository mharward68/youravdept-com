# CONTEXT: YAVD Offers Module

Updated: 2026-10-10 12:30 ET, Session 1.10 (Go live and close the phase). PHASE 1 CLOSED. The module is live on youravdept.com.

## What exists now
- Live since 2026-10-10 12:23 ET (deploy.ps1 run by Michael after "go"). Backup tag before publish: pre-offers-live-20261010-1223 (pushed to GitHub).
- Admin at youravdept.com/offer-admin. Popup on any page via the edge; private links at /offer/<slug>; previews; counts; saved versions; export.
- Live store holds three Booth Proof offers, all DRAFTS with Mark's placeholder copy: "Booth Proof: Industry group" (/offer/industry-group, Oct 13 to Dec 31), "Booth Proof: 2027 shows" (Everyone on /booth-proof.html, Oct 13 to Dec 31), "Booth Proof: AV companies" (/offer/av-partners, Oct 13 to Nov 30). Michael replaces the copy and schedules them.
- First live export: Claude outputs\yavd-offers-LIVE-export-2026-10-10-<time>.json (gitignored, on Michael's PC only).
- Contract unchanged: 1.1.0. Stats route stays declared in its function (decided in 1.9; no drift).

## Success criteria (scope section 12)
Note: Mark saw the output of preflight run 1 (two stand-ins plus a Netlify 5xx) and of the live check, not of preflight run 2. Criteria 1 and 2 on TEST rest on run 1 plus run 2 being re-run before go-live; paste run 2's verdict into this file if it is wanted on record.
1. Three offers set up at once: run 1 proved two (group link, everyone) side by side; the third failed on a Netlify 5xx before reaching the function. Live: all three entered as drafts; running together once Michael schedules them.
2. Made in the admin API, no file copied, no deploy: live drafts were made through the API (3 created, PASS in the go-live verdict).
3. Test submission from each preview names the offer and is marked test: run 1 previews showed isTest=True; live: 3 TEST leads accepted by the "offers" form (PASS). No alert email: go-live without alerts was Michael's choice (DECISIONS 1.10).
4. Private link outside dates lands on /booth-proof.html, no offer: PASS (TEST). Live: a draft link without key 302s to /booth-proof.html, link-draft.
5. Admin refuses anyone not signed in: PASS on TEST (7 routes 401) and live (list, export 401).
6. Storage off, pages still load: PASS on TEST (byte-identical page). On live the test switch is ignored (PASS).

## Five objectives at the phase boundary
- Security: password checked on the server, lockout, signed cookie; all admin routes 401 signed out on live; build docs and sources 404. Fine.
- Stability: history of 20 versions plus export; storage failure serves the normal page. One Netlify platform 5xx seen (request never reached the function): retry and it works.
- Efficiency: no new framework; one Netlify-owned dependency; lookups cached 60 s.
- User experience: popup, admin and editor reviewed through 1.6 to 1.8. Phone-width preview badge item still open.
- Scalability: one record per offer, ids never reused, no page or offer cap.

## Deferred / backlog (in order)
1. 1.2b: lead alert email through Resend (edits submission-created.mjs, needs Michael's OK). Until then, check Netlify > Forms > "offers" by hand.
2. README update (existing file, needs approval): describe the module and that offers no longer get their own pages.
3. Phone-width preview badge under the close button (one CSS line in offer-panel.css).
4. .netlify/ files tracked by git: untrack them (git rm --cached) and add .netlify/ to .gitignore.
5. Test store tidy: leftover TEST offers from 1.4 to 1.9 (offers-test only). Deleted drafts' counts in offer-stats. Both are data deletes: need Michael.
6. Later list from the scope: access codes, GA4 events, per-offer designs, more admins.

## Estimate vs actual (phase)
- Sessions: planned 10 (+35% contingency allowed: 13 to 14). Actual: 10, no contingency session used; 1.2b split out and still open.
- Michael's time: planned about 125 min, actual about 200 min (about 60% over). Almost all of the overrun was 1.2 (70 min vs 15: CLI and prompt problems) and 1.6 (30 vs 20: the tab change he asked for). Excluding 1.2, the phase ran about 15% over.
- Build sizes: every session landed at its planned size or one step smaller. 1.5 (the Low-confidence L) overran by one verify run only.
- Session 1.10: estimated M (about 25 min of Michael's time). Actual M; about 25 min of his time (two preflight runs, go-live, live check) plus the previews and scheduling still to do.
- Calibration for the next phase on this stack: plan Michael's time at 1.3x the estimate, and add one extra verify run to any session whose script drives the Netlify CLI.

## Backup coverage
This session created live data: the three draft offers (live store "offers") and six TEST leads (Netlify form "offers"). Covered: history keeps the previous 20 versions automatically, and the live export file was saved after the drafts were entered. Back up again (Export in /offer-admin) after Michael schedules the real copy.

## Next step
Michael: open the three preview links on desktop and phone, replace the placeholder copy in /offer-admin, Save and schedule. Then Export once. Next build work: Session 1.2b (alert email) in a new conversation, after his OK.
