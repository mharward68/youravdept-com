# CONTEXT: YAVD Offers Module

Updated: 2026-10-10 10:30 ET, Session 1.5 (Offer links, dates and forwarding). VERIFIED on the draft address: 15 of 15 checks pass (second run, 10:26).

## Where things stand
- Both edge functions are real now. offer-link (/offer/*): running link serves the offer's page with the offer block; out of dates or draft 302 to the page (query kept, preview key dropped); unknown slug 302 to /; ?preview=<key> serves any status marked isTest. offer-page (every page except module, API and asset paths): attaches the running Everyone offer, matched through normalizePagePath(); otherwise the page passes through untouched.
- Local tests: 21 new edge tests pass (node --test netlify/tests/offer-edge.test.mjs). Auth and rules tests unchanged.
- Draft check: Claude outputs\session-1.5-verify.ps1. Run 1 (10:22): 14/15, F failed (Everyone offer not attached). Cause: offer-page's one-minute edge cache held a list read before the test offers were saved, and the checks ran inside that minute. Fix: strong reads at the edge, test-only diagnostics header x-yavd-offer-src, script waits for both offers. Run 2 (10:26): the page showed page-none from the cache for about 60 s, then page-everyone from the store; all 15 PASS. Results: running link 200 with its offer once (beats the Everyone offer on the same page), expired 302 to /booth-proof.html (utm kept), unknown 302 to /, draft no key 302, draft preview 200 isTest=True, wrong key 302, Everyone offer on /show-info and /show-info.html, page with no offer byte-identical to the untouched copy, forced storage failure 200 untouched (page) and 302 to / (link), images skipped. Edge context: branch-deploy.
- Spike proven: an edge function fetches a static page through a _redirects pretty URL and adds the block. No fallback needed; no existing page touched.
- Left in the test store: link offers TEST 1.5 RUN/OLD 1594 and 4022 (RUN ones expire on their own an hour after creation). Harmless; delete in 1.7 once the dashboard exists, or leave.
- Draft address: https://offers--your-av-dept.netlify.app. Live site unchanged.
- The page block points at /assets/offer-panel.css and .js, which arrive in 1.6. Until then those two requests 404 on pages with an offer (draft only).

## What this session did
- Created: netlify/edge-lib/offer-edge.js (decisions, injection, cached offer source), netlify/tests/offer-edge.test.mjs, Claude outputs/session-1.5-verify.ps1.
- Replaced placeholders: netlify/edge-functions/offer-link.js, offer-page.js (inline config: routes, onError bypass). No netlify.toml change. No contract change. No site page touched.

## Assumptions made (logged in DECISIONS)
- Link offer beats Everyone offer via a request header (x-yavd-offer-inner) on the link function's own page fetch.
- Storage failure on a link with nothing cached: 302 to /. A stale copy is used if this edge instance has one (dates still checked).
- Edge reads use strong consistency (at most one read per edge instance per minute).
- Everyone offer preview link: /offer/preview?preview=<key> (any word works; key decides).
- Draft-only slug without key: 302 to the draft's page.
- Test-only failure switch: request header x-yavd-test-store-fail: 1, honoured only on branch-deploy, deploy-preview, dev.

## Open items
1. Michael's two clicks (running link opens Show Info, expired link lands on Booth Proof with no flash): not yet confirmed.
2. Done: edge functions report branch-deploy, so the draft reads offers-test.
3. 1.2b (alert email through Resend) still undecided.
4. .netlify/functions/manifest.json tracked by git (backlog, from 1.2).

## Estimate vs actual
Session 1.5: estimated L (about 10 min of Michael's time), Low confidence. Actual: L (about 35 min build, about 10 min for the cache fix); two verify runs, Michael's time about 10 min. Overran only by one verify run.

## Next step
Commit and push, then Session 1.6 (The popup) in a new conversation. 1.6 builds /assets/offer-panel.css and .js, read from the #yavd-offer-data block (shape: publicPayload in shared/offer-contract.js). The popup must use the block's isTest to set is_test on the form.
