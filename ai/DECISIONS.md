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

## 2026-10-10: Session 1.6, the popup
- The popup script is a classic deferred script that loads the frozen contract with import('/shared/offer-contract.js'). Why: field names, labels, subject line, 7-day memory and 1.5 s delay come from one source; nothing duplicated. If the import fails, no popup and the page is untouched.
- Submissions POST (url-encoded, fetch) to /offers-form.html. Why: Netlify Forms accepts the post at the blueprint page, and both edge functions skip /offers-form*. Rejected: posting to "/" (runs through offer-page).
- is_test is sent as "yes" or "no".
- Offer text only ever goes in with textContent; blank lines make paragraphs, single line breaks make <br>. The button link (form off) is limited to http(s) or a same-site path; anything else shows no button.
- Submit button: navy text on teal (4.8:1). Rejected: white on teal (2.9:1, fails readable contrast). Overrulable by Michael.
- Privacy line: "We use your details only to follow up on this offer. We never sell or share them." Overrulable.
- Phone width (560 px and under): bottom sheet; inputs 16 px so iPhones do not zoom. Only the inside scrolls, so the close button never moves.
- Preview (isTest): badge "Preview: submissions are marked as tests", ignores and never writes the 7-day memory.
- After a successful submit, closing does not leave the reopen tab for this page view (later visits within 7 days still show it; the stored value stays "time closed", per contract).
- Reopen tab (Michael's request, 10:49): tucked against the right edge, only the teal edge and dot show; hover slides the label out; click opens. Expands on keyboard focus only when reached with the Tab key (class is-peek), never because the popup closed and handed focus back (bug found 10:55: click-outside and Escape left it expanded). Thin light rim so it shows on navy sections. Touch screens: a tap opens directly.
- Events for 1.9: document "yavd-offer:view" on open and "yavd-offer:lead" on a successful submit, detail { id, isTest }.

## 2026-10-10: Session 1.7, admin dashboard
- The page learns sign-in from GET /api/offers (401 or 200), never from the cookie (HttpOnly, Path=/api/offers). The static page holds no offer data; sign-out empties every container.
- Group order Running, Upcoming, Draft, Expired. Sort: running by stop time (soonest first), upcoming by start time (soonest first), drafts by last edit (newest first), expired by stop time (newest first). Why: the top of each group is the one that needs attention next.
- Countdown wording: whole days from 2 days out, hours and minutes inside 48 hours. Re-rendered every 30 s against the server clock. Rejected: a per-second ticker (noise, no value at this scale).
- Copy link copies location.origin + path, so on the draft address it copies the draft link and on the live site the youravdept.com link. For an Everyone offer the "link" is the page address.
- Edit, Run again and New offer are shown disabled with a "Session 1.8" tooltip instead of hidden. Why: the layout Michael reviews now is the layout he gets.
- Export is fetched and saved as a file (not a plain link), so an expired sign-in shows the sign-in box instead of a raw JSON error.
- Store badge: "Test store" or "Live store" in the top bar (store name on hover). Why: Michael must never mistake the draft address for live.
- /offer-admin served by a non-forced 200 rewrite in netlify.toml (the allowed file). Rejected: editing _redirects (hard limit).
- Admin page uses the Polished tokens at Functional effort: navy top bar, teal accents, Montserrat headings, Inter body, navy text on teal buttons (contrast, as in 1.6).

## 2026-10-10: Session 1.8, offer editor, rerun and preview
- Editor is a view inside /offer-admin (same three files), not a second page. Why: one sign-in check, one script, the plan's file list. Rejected: offer-editor.html (another page to keep in step).
- The server stays the judge: the editor sends the contract record and shows the server's field messages. Client side only tidies the link name, counts characters, and checks the date inputs. Why: one set of rules (offers-rules.mjs), no drift.
- Dates entered as Eastern date + time inputs, converted with Intl to ISO with the correct offset for that day; the saved time is shown in plain words ("Stops at the end of Sat, Oct 31, 2026, 11:59 PM EDT"). Blank time = contract defaults. A stop time saves with :59 seconds, so the named minute counts in full. Overrulable.
- Run again clears both dates and keeps the times of day, same link, rerunOf set. Why: the old dates are always wrong for a rerun, and a blank date cannot be scheduled by mistake (server requires dates to schedule).
- On running or upcoming offers the draft button reads "Take down (save as draft)". Why: it is the scope's way to remove a popup; the label says what it does.
- Delete draft added to the editor (asks first). Why: the delete route exists and nothing else exposes it; it also lets Michael clear test drafts. Scheduled offers cannot be deleted (server rule).
- Live preview is a non-interactive mock: sandboxed iframe (no scripts) using the real popup CSS, Desktop (720 px) and Phone (390 px). Rejected: running offer-panel.js in the frame (focus stealing, 1.5 s delay on every keystroke, a real form that could post a lead). The preview link shows the real popup.
- Unsaved changes: inline "Keep editing / Discard" bar for Back and Sign out; the browser's own leave-page warning for closing the tab. No alert/confirm/prompt.
- Expired sign-in during a save: the edits are kept in memory and put back after signing in. If the offer changed meanwhile, the old updatedAt is kept so the server refuses an overwrite.
- Saved versions screen uses the 1.1.0 restore route; each restore asks first and is itself undoable.
- Sign-out wipes the editor (inputs, title, preview frame, preview link), not only the dashboard.

## 2026-10-10: Session 1.9, views and leads counts
- Route /api/offers/stats is declared in netlify/functions/offers-stats.mjs (export const config), not added to ROUTES in shared/offer-contract.js. Why: the contract is frozen and the storage shape it already defines (offer-stats / <id> / { views, leads }) is used exactly. Rejected: contract 1.2.0 for one address (a plan revision for no behaviour gain). Proposed for the 1.10 drift audit: add ROUTES.apiStats as an additive line if Michael wants every address in one place.
- Counts use conditional writes (read with ETag, write onlyIfMatch / onlyIfNew, retry up to 5 times with a 10 to 50 ms random pause). Why: keeps the contract's one-record-per-offer shape and cannot double count; Netlify's warning is about blind read-add-write. Rejected: one key per event (the 1.3 lockout pattern), because it changes the contract's stored shape and makes the dashboard read hundreds of keys. Proven: with the condition removed, 20 parallel views stored 1.
- Only running offers count; the function checks the offer list (cached 60 s per instance, as at the edge). Drafts, upcoming, expired and unknown ids answer 204 with x-yavd-stat naming why, and count nothing. The popup also skips previews (isTest), so a preview of a running offer never counts.
- A view = the first time the popup opens on a page view (an auto open, or a click on the reopen tab after a reload). Reopening on the same page view does not count again. A lead = a successful form post. Why: matches the plan wording without letting one visitor inflate views by toggling the popup.
- The public POST requires Origin equal to the site, JSON (cross-site browsers must preflight, which is never granted), a body under 512 bytes, a UUID-shaped id and event view|lead. The response carries no counts. Counts are a guide, not billing data: a script can still fake a browser. Accepted at this scale.
- Popup sends counts with fetch keepalive, credentials omitted, errors ignored. Rejected: navigator.sendBeacon (cannot send JSON without a preflight in some browsers, and gives no status).
- Dashboard reads counts after the offer list, without blocking it. A card shows "N views · N leads (N% of views)"; upcoming shows "Counts start when it runs"; a draft that never ran shows nothing; a failed read shows "Counts unavailable right now". Counts refresh with Refresh, not on the 30 s tick.
- Counts belong to the offer id: a rerun starts at zero and the original keeps its numbers. A deleted draft's counts stay in the store (harmless, never shown). Clearing them would be a delete of stored data: backlog, needs Michael.

## 2026-10-10: Session 1.10, go live
- Go live without lead alert emails (Michael's choice, option B). Netlify's own form notification never arrived in 1.2, and the Resend alert (1.2b) is not built. Until 1.2b ships, Michael checks Netlify > Forms > "offers" by hand for new leads. Success criterion 3 ("a test submission arrives as an alert") is checked as: the preview shows the offer marked as a test, and the "offers" form accepts a lead whose subject names the offer, confirmed by the form's submission count. Rejected for now: building 1.2b before go-live (about one session). 1.2b stays the first backlog item after Phase 1.
- Pre-live checks run on the TEST address with four stand-in offers (named TEST 1.10) on /booth-proof.html, created through the admin API and deleted afterwards, so the six criteria are proven before the live store holds anything. The real Booth Proof offers are entered only on the live site, as drafts, after the publish.
- Backup before the live publish is a git tag (pre-offers-live-<date-time>) pushed to GitHub, taken by the go-live script only when the tree is clean. Rollback for the site is Netlify's "Publish deploy" on the previous production deploy; rollback for any offer is setting it to draft.
