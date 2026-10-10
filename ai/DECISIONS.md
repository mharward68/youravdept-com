# Decisions: YAVD Offers Module

Dated, append-only. What was chosen, why, and what was rejected.

## 2026-10-09: Scope approved
- Address pattern /offer/<slug> (singular). Links go into emails and posts, so this is the one painful-to-change decision. Confirmed by Michael.
- One shared admin password, no accounts. Alert to michaelh@youravdept.com. Views and leads counts in. No access code on the industry group offer. Times Eastern; start 12:00 AM, stop 11:59 PM; rerun keeps the link; one popup design. All confirmed.
- Offers in Netlify Blobs, leads in one Netlify form "offers". Rejected: a page copy per offer (the current booth-proof-pilot pattern), because it needs a deploy per offer and duplicates pages.

## 2026-10-10: Session 1.1, contracts frozen (CONTRACT_VERSION 1.0.0)
- Contract lives in shared/offer-contract.js as a pure ES module with no imports, so Node functions, Deno edge functions and the browser load the same file. It is published as a static file by deploy.ps1; accepted, nothing in it is private.
- Page matching: offers store the .html path; normalizePagePath() maps /booth-proof, /booth-proof.html, /, /library/ etc. to one form. Why: _redirects serves short addresses as 200 rewrites, and a visitor on /booth-proof must still get the popup.
- Test stores: non-production deploys use "offers-test" and "offer-stats-test" (storeName()). Why: Netlify Blobs site-wide stores are shared by every deploy, so draft-deploy testing would otherwise leave test offers in the live store. Rejected: deploy-scoped stores, because production would then lose its offers on every redeploy.
- Injected payload carries only PUBLIC_OFFER_KEYS and escapes "<". Why: the preview key must never reach a visitor's browser, and offer copy must not be able to close the script tag.
- "guide" reserved as a field name. Why: submission-created.mjs emails a guide PDF to any form submission with a guide field.
- Popup body font is Inter, not Open Sans. Why: Inter is the body font on every page of the site; the popup should match the page it sits on.
- Function files use .mjs, matching submission-created.mjs. Routes are declared in each function's own config, so netlify.toml stays small.
- offer-admin.html is left out of the site map easter egg. Why: the map lives in 18 page files (editing them is a hard limit) and it is an admin screen.
- Recommended for 1.2 (not yet decided): page list from the site's .html files bundled into the pages function via included_files. Rejected: a hand-kept list (goes stale) and a deploy-time generator (needs an edit to deploy.ps1).

## Pending Michael (asked 2026-10-10, needed before 1.2)
- Add 'ai' to $ExcludeDirs in deploy.ps1 so the build docs do not go live. Fallback: 404 rule for /ai/* in netlify.toml.
- Approve @netlify/blobs as the module's one dependency (pinned), with a minimal package.json.

## 2026-10-10: Session 1.2, Netlify setup
- deploy.ps1 edit approved by Michael: exclude ai/ from deploys. Also excluded netlify/, netlify.toml, package*.json and deploy-preview.ps1 for the same reason (build files are not site content). netlify.toml adds 404 rules for /ai/* and /netlify/* as a second lock.
- @netlify/blobs approved, pinned at 11.1.1 (11.1.4 was two days old). package.json "type": "module" so shared/offer-contract.js loads as ESM without warnings.
- Draft deploys use a fixed alias "offers" (stable test address). Context reported: "branch-deploy". storeName() unchanged: anything not "production" uses -test stores.
- Page dropdown source: included_files on the offers-pages function. Rejected: hand list, deploy-time generator.
- OFFER_ADMIN_PASSWORD first value exposed in chat; deleted from Netlify by Mark after two edits in the Netlify screen did not save. New value to be added in the Netlify screen before 1.3.
- Netlify notification email not received after two verified submissions. Proposed: alert through Resend from submission-created.mjs (Session 1.2b), pending Michael's OK.
- 2026-10-10 09:22: live site republished without ai/ and netlify/ sources, from the current folder minus every module file (approved one-off production deploy; not the module go-live).

## 2026-10-10: Session 1.3, sign-in
- Lockout without a counter: every attempt writes its own Blobs key (onlyIfNew), then counts keys from the last 15 minutes with strong consistency. Why: Netlify Blobs has no concurrency control, so a read-add-write counter can lose updates and let a parallel burst through. Rejected: a counter with onlyIfMatch retries (Netlify advises against it), and the plan's fallback of a fixed delay only (it slows guessing but never stops it). A 400 ms delay on each wrong password is kept as well.
- Lockout is site-wide, not per address. Why: one admin; per-address limits are bypassed by changing address. Cost: someone could keep Michael locked out by guessing. Mitigation: a locked try deletes its own key, so the lock ends 15 minutes after the fifth wrong try; manual unlock is deleting the keys in the Netlify screen.
- New store "offer-auth" (and "-test"), defined in lib/offers-auth.mjs, not in the frozen contract. An addition, no existing shape changed.
- Cookie value v1.<expiry>.<nonce>.<HMAC-SHA256>, key derived from OFFER_SESSION_SECRET plus the password. Why: changing the password signs everyone out without a session store. Rejected: storing sessions in Blobs (more writes, no benefit at one admin).
- Cookie Path=/api/offers, not "/". Why: only the API needs it, so it is never sent with ordinary page views.
- Sign-in fails closed: missing or short settings (password under 12, secret under 16) or unreadable attempt storage refuse sign-in (503). Checking an existing cookie never touches storage.
- Logout follows the plan (signed-in only) but every logout response, refusals included, clears the cookie.
- Cross-site POSTs refused by Origin check, on top of SameSite=Strict. Login accepts JSON only, which forces a browser preflight from any other site.
- Tests live in netlify/tests/ so the deploy scripts' existing netlify/ exclusion keeps them off the site (no deploy script edit needed).

## 2026-10-10: Session 1.4, saving and listing
- Concurrency: Blobs conditional writes (onlyIfMatch on the "all" ETag, retried 3 times) plus the planned updatedAt check. Why: two saves at once can neither overwrite each other nor save over a newer edit. Rejected: updatedAt alone (two different offers saved together would still lose one, because all offers share one key).
- History is written before every change and the save stops if it fails. Each entry: { replacedAt, action, offerId, offers }. First save writes none (nothing before it). Newest 20 kept.
- Rules apply to scheduled offers only. Drafts never clash and may be incomplete (name required). Why: drafts never show to visitors; Michael should be able to park an idea. Scheduling a draft runs every check.
- HTML in offer text is stripped and reported in `notes`, not refused. Why: pasted copy often carries formatting; refusing would block a save for no safety gain. Display stays textContent (1.6).
- Unknown keys are dropped; server-owned fields (id, previewKey, createdAt, rerunOf on edits) are never taken from the request.
- Page checked for shape (canonical .html path, no "..", not offer-admin or offers-form), not against the page list. Why: the list is bundled into another function; bundling ~5 MB of pages twice is waste. The editor dropdown only offers real pages. Revisit if a typed page ever slips in.
- Restore: built and tested in lib/offers-store.mjs, not exposed. Why: ROUTES in the frozen contract has no restore route. Adding one is a contract change: back to Michael.
- Delete: drafts only, 409 otherwise; the list before the delete goes to history.
- Export includes preview keys (it is a full backup). File name yavd-offers-<live|test>-YYYY-MM-DD-HHMM.json, Eastern time.
- Stored data that is not an array blocks every write (500). Why: never overwrite what cannot be read.

## 2026-10-10: Contract 1.1.0, restore route (approved by Michael after Session 1.4)
- Added ROUTES.apiRestore = /api/offers/restore. GET lists the saved versions newest first (when, action, which offers by name; never preview keys). POST {key} puts one back; the list it replaces goes to history first, so a restore can be undone. Additive: no existing shape changed, CONTRACT_VERSION 1.0.0 -> 1.1.0.
- One address for both list and restore. Rejected: a separate history route (two new addresses for one job).
- Keys accepted only in the exact history/<ISO time>-<6 hex> shape; anything else is 400, an unknown version 404.
- 10:15 fix: saved versions are ordered by a change number kept in the metadata of "all" and written at the end of each history key (history/<ISO time>-<9 digits>), not by time. Why: the restore test failed on Michael's PC because two saves landed in the same millisecond and sorted at random; the same fault would have shown the wrong "newest" version and could trim the wrong one. Rejected: a random suffix (ties still random) and time-only keys.

## 2026-10-10: Session 1.5, offer links and page offers
- The link function fetches the page over HTTP with header x-yavd-offer-inner: 1, and offer-page skips such requests. Why: it keeps the "link beats Everyone, one popup" rule without a second lookup, and the fetch goes through _redirects so pretty URLs work. Rejected: context.rewrite (unclear whether other edge functions run on the new path). Cost: a visitor who sends that header sees no Everyone popup, which is harmless.
- Offer text reaches the page only as the contract's escaped JSON block (publicPayload: no preview key). Injected before the last </body>, never twice.
- Offer list cached per edge instance for CACHE_SECONDS; a failed or slow read (1.5 s) uses the last good copy if there is one, with dates still checked against the current time. Why: stability without showing anything a fresh read would not. With no copy: the page untouched, or for a link a 302 to /.
- Out-of-dates and draft-only slugs: 302 to the page of the most recently edited offer on that slug, query string kept except the preview key. Why: links in posts often carry utm tags.
- Preview: matched by the 32-character key in constant time. An offer with its own slug needs that slug in the address; an Everyone offer previews at /offer/<any word>?preview=<key> (the editor will use /offer/preview). A wrong key is treated as no key.
- Pages we change get Cache-Control private (no-store on /offer/*) and lose content-length and ETag. Redirects are no-store and noindex.
- onError: bypass on both functions, so a crash serves the site as if the module did not exist.
- Rejected: HTMLRewriter (a new dependency) for a single insert before </body>.
- 10:26 fix after the first draft run: edge reads use strong consistency. Why: the first run showed a page serving an offer list older than the latest save; strong reads cost one slower read per edge instance per minute at most. Diagnostics (page-none, x-yavd-offer-src) are added on test deploys only, so the live site keeps zero work on pages without an offer.
