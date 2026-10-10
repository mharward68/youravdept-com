# Build notes: YAVD Offers Module

Only what a future session would waste time rediscovering.

## MAP
- Site: static HTML at the repo root, plus library/ and field-notes/. No build step. Every page inlines its own CSS and JS (no shared stylesheet). Brand tokens repeat in each page's :root.
- Netlify config: _redirects (pretty URLs as 200 rewrites, a few 301s), _headers (library PDFs). No root netlify.toml before 1.2. .netlify/netlify.toml is the CLI's generated copy: never edit it.
- Functions: netlify/functions/submission-created.mjs (existing, Resend guide mailer, runs on every form).
- Offers module: shared/offer-contract.js (frozen contract). Popup: assets/offer-panel.css and assets/offer-panel.js (public, published by both deploy scripts). Sign-in: netlify/functions/lib/offers-auth.mjs (requireAdmin, handleLogin). Field checks and rules: lib/offers-rules.mjs. Storage, history, restore: lib/offers-store.mjs. Counts: netlify/functions/offers-stats.mjs + lib/offers-stats.mjs. Edge: netlify/edge-functions/offer-link.js and offer-page.js (thin), logic in netlify/edge-lib/offer-edge.js. Tests: netlify/tests/*.test.mjs (run each file by path). ai/ holds the scope, plan, run sheet and these notes.
- Deploy: deploy.ps1 copies the folder to %TEMP%\youravdept-deploy minus its exclude list, then runs netlify deploy --prod --dir <staging> --functions netlify\functions. Production only.
- Repo: github.com/mharward68/youravdept-com, branch main. Netlify site id 7b58fbd4-394f-4091-bc6d-29b4e3b6ff79.

## Deploying
- deploy.ps1 is production. Never run it before Session 1.10. Draft deploys need deploy-preview.ps1 (created in 1.2).
- Anything in the folder that is not excluded becomes a public file. Excluded today: Claude outputs, claude, docs, .git, .netlify, node_modules, deploy.ps1, README.md, .gitignore, *.docx, *.patch, *.gs. Not excluded: ai/, shared/, netlify/ sources, package.json.

## Forms
- submission-created.mjs runs on every Netlify form submission. It skips forms with no "guide" field. Never add a "guide" field to the offers form.
- RESEND_API_KEY is already set on the site and Resend sends from michaelh@youravdept.com.
- Existing forms each have their own page and name (venue-docs-free-offer, booth-proof-dates, booth-proof-pilot, av365, av-concessions).

## Pages
- Pages are reachable at two addresses (/booth-proof and /booth-proof.html). Always compare through normalizePagePath().
- booth-proof.html: noindex, standalone (no header, footer or site map), no form; loads Montserrat 700/800 and Inter from Google Fonts.

## Environment for Claude sessions
- Session 1.1 had file list, stage and commit access to Michael's PC but no shell there: git and the Netlify CLI had to be run by Michael from PowerShell blocks. Check the tool list at boot.

## Session 1.2 findings
- Test address: `.\deploy-preview.ps1` deploys to https://offers--your-av-dept.netlify.app. Functions there see deploy context "branch-deploy".
- Production deploy: `.\deploy.ps1` (only in 1.10). Both scripts exclude ai, netlify, netlify.toml, package*.json. The CLI reads netlify.toml and netlify/edge-functions from the site folder, not the staged copy.
- Env vars: set them in the Netlify screen. `netlify env:set` (CLI 27.4.2) printed nothing and saved nothing on Michael's PC. Netlify values are frozen per deploy: redeploy after changing one.
- Never use Read-Host prompts in scripts that also ask Michael to act in a browser: he typed a secret into the prompt. Keep secrets in the Netlify screen only.
- In Windows PowerShell 5.1, `2>&1` on the netlify CLI with $ErrorActionPreference = 'Stop' kills the script on normal progress output.
- The container cannot reach *.netlify.app or youravdept.com with curl. Verify through the Netlify connector (forms, submissions, env vars) or ask Michael for a curl.exe line.
- Netlify notification emails for "offers" did not arrive. Netlify form notifications are configured only in the UI; the connector cannot read them.
- Netlify advises against counters in Blobs (no concurrency control): relevant to the 1.3 lockout and 1.9 counts.
- Response headers in netlify.toml do not apply to function or edge responses; set X-Robots-Tag in code.
- The WebFetch tool returns cached copies of youravdept.com pages (even with a query string) after a deploy. Trust Michael's curl.exe output or the Netlify connector for post-deploy checks.

## Session 1.3 findings
- Every admin route starts with `const refused = requireAdmin(req, { methods: [...] }); if (refused) return refused;` from lib/offers-auth.mjs. Use json() from the same file so responses carry no-store and noindex.
- Run tests with a file path: `node --test netlify/tests/offers-auth.test.mjs`. Passing the folder fails on Node 22 (treated as a file).
- Tests swap Blobs for an in-memory store via _setStoreFactoryForTests(); no @netlify/blobs network calls in tests.
- Lockout lives in Blobs store "offer-auth" / "offer-auth-test", keys attempt/<ms>-<rand>. To unlock by hand: delete the attempt/ keys in that store (Netlify screen: Data & Storage > Blobs), or wait 15 minutes.
- Running the verify script leaves the TEST sign-in locked for 15 minutes (its last check). Wait before signing in on the draft address again.
- The cookie only goes to /api/offers paths (Path=/api/offers). The admin page (1.7) cannot read it (HttpOnly): it learns sign-in state from a 401 on its first API call.
- Never pass a password to PowerShell as a typed value. The verify script reads it once from the clipboard and clears it.

## Session 1.4 findings
- Offer writes go only through changeOffers() in lib/offers-store.mjs: read "all" with ETag, write old array to history/<iso>-<9-digit change number> (onlyIfNew; an existing key means another save already kept the identical copy), write new array with onlyIfMatch (onlyIfNew when empty), retry 3 times, trim history to 20. Never call setJSON('all') directly.
- @netlify/blobs 11.1.1 has real conditional writes: getWithMetadata(key, {type:'json'}) returns { data, etag }; setJSON(key, v, { onlyIfMatch | onlyIfNew }) returns { modified }. A failed condition returns modified:false, it does not throw.
- Tests stub offer storage with _setOffersStoreFactoryForTests(); any test that calls /api/offers must set it, or it tries real Blobs and gets 503.
- POST /api/offers body is the offer itself (or { offer }). Existing offers need id + the updatedAt they were loaded with. Responses carry `status` (worked out, never stored); sending it back is harmless because unknown keys are dropped.
- offers-pages reads .html files from two folders above the function file (bundle root on Netlify, the website folder locally). Folder list in the function must match included_files in netlify.toml.
- Offer text: plainText() strips tags in up to 5 passes and drops invisible/direction characters. Display code (1.6) must still use textContent.
- Restore: /api/offers/restore (offers-restore.mjs). historySummary() reads each history blob (20 max) to describe it; restoreHistory() goes through changeOffers(), so it gets the ETag guard and its own history entry. Contract is 1.1.0.
- Verify scripts that read the password from the clipboard must clear it first and wait for a fresh copy. Michael copies the run command to paste it, which overwrites a password copied earlier (the cause of the first 1.4 run's 401 "Wrong password"). session-1.4-verify.ps1 does this; session-1.3-verify.ps1 does not.
- PowerShell: in @('label', $a -eq 'x') the comma binds before -eq, so the check silently becomes a filter. Always wrap: @('label', ($a -eq 'x')).
- The 1.3 draft check never ran, so the first real sign-in was in 1.4: the 09:29 OFFER_ADMIN_PASSWORD did not match Michael's copy. If sign-in says "Wrong password" with the right clipboard (check length and last 4 only), re-save the value in the Netlify screen by pasting, confirm updated_at through the connector, redeploy.
- Saved versions sort by the change number (metadata seq on "all", ends each history key), never by time: Michael's PC ran two saves in the same millisecond and a time sort put them in random order. Old test-store keys ending in 6 hex characters sort as oldest. Run new tests several times in a loop before calling them clean.

## Session 1.5 findings
- Edge logic lives in netlify/edge-lib/offer-edge.js (outside edge-functions/ so Netlify does not treat it as a function; outside shared/ so it is never published). Both edge functions are thin wrappers; test the logic with node, not Deno.
- Edge routes are inline (`export const config`), not in netlify.toml. offer-page runs on /* minus module, API and asset paths, and returns early for anything that is not .html or extensionless, before any storage read.
- Diagnostics: every edge decision sets response header x-yavd-offer (link-running, link-expired, link-upcoming, link-draft, unknown-slug, preview, page-everyone, store-failed, page-unavailable, error). Off the live site, offer-link also sets x-yavd-offer-ctx (the edge deploy context). Read them with curl.exe -D.
- Test switch: request header `x-yavd-test-store-fail: 1` forces a storage failure on non-production deploys only.
- Edits reach visitors in up to about a minute: each edge instance caches the offer list for 60 s (reads themselves are strong). Seen live: a page kept serving a 60 s old list right after new offers were saved. Any test that saves offers and then checks pages must poll for the expected x-yavd-offer state, never check straight away.
- Off the live site, offer-page also answers pages with no offer (x-yavd-offer: page-none) and adds x-yavd-offer-src: <cache|store|stale>; offers=<n>; ctx=<context>. The body is never changed by this. On production a page with no offer is a pure pass-through.

## Session 1.6 findings
- The popup imports /shared/offer-contract.js at runtime. Never add shared/ to a deploy exclude list, or every popup silently stops showing.
- Popup tests run here, not on Michael's PC: serve the website folder with python -m http.server, build test pages with injectOffer() from netlify/edge-lib/offer-edge.js on a copy of booth-proof.html, and drive them with Playwright (/opt/npm-tools/node_modules/playwright). Intercept POST /offers-form.html with page.route. Block fonts.googleapis/gstatic (no network here; screenshots use fallback fonts).
- Browsers cache /assets/*: after a draft deploy, check the served file (curl.exe ... | -match '<new text>') and use a NEW private window. Michael's first look at the collapsed tab showed the old CSS.
- :focus-visible is not a safe trigger for anything that changes layout: a programmatic focus() after a mouse close inherits focus-visible from the dialog. Use an explicit class set on Tab-key focus.
- The Netlify connector shows a form's submission_count and last_submission_at, not submission contents. 'offers' count: 2 after 1.2, 4 after 1.6.
- No em dashes or other non-ASCII in the public JS: use \u escapes.

## Session 1.7 findings
- Admin screen: offer-admin.html + assets/offer-admin.css + assets/offer-admin.js (ES module, imports /shared/offer-contract.js). 1.8 adds the editor to these same three files.
- Sign-in state comes only from the first GET /api/offers (200 dashboard, 401 sign-in). Any later 401 (Refresh, Export) drops back to sign-in with a note.
- Status is worked out in the browser with offerStatus() against the server clock (clockSkew from the "now" field of GET /api/offers), so groups match the server even on a PC with a wrong clock.
- Card buttons are found by data-act on a delegated click handler on #oa-groups; cards carry data-id and data-status. Re-render replaces the whole #oa-groups, so keep any per-card state in the offers array, not the DOM.
- Local dashboard test harness (no network to Netlify from the container): a small Node server that wraps the real netlify/functions handlers, with in-memory Blobs set through _setOffersStoreFactoryForTests and _setStoreFactoryForTests, and serves the site folder; Playwright on http://localhost (Chromium accepts the Secure cookie on localhost). Run `npm install` in the copied folder first for @netlify/blobs. Do not pkill by a pattern that matches your own shell command.
- /offer-admin works through a netlify.toml rewrite; _redirects stays untouched.

## Session 1.8 findings
- Editor code sits in assets/offer-admin.js after the dashboard code, in the "Session 1.8" block. Views: show('loading'|'signin'|'error'|'dash'|'editor'|'versions'); only Sign out shows in the top bar outside the dashboard.
- The final load() call must stay at the very end of offer-admin.js: load() reads `stash`, which is declared in the editor block (let, temporal dead zone).
- Live preview: iframe sandbox="allow-same-origin" (no scripts) with a srcdoc that links /assets/offer-panel.css; the admin script builds its DOM with textContent. If offer-panel.js markup or class names change, update drawPreview() to match.
- Eastern time: easternIso() turns a wall-clock date and time into ISO with the right -04:00/-05:00 by asking Intl for the offset (twice, for clock-change days) and refuses times that do not exist when clocks go forward. Never build offsets by hand.
- Server field keys can carry an index (form.optionChoices[2]); showErrors() strips it to find the [data-err] slot. New server field keys need a slot in offer-admin.html and an entry in inputFor().
- Local harness for admin tests lives outside the repo (Claude sandbox): Node server wrapping the real handlers with in-memory Blobs, /offer/* answered with decideLink + injectOffer. Fonts: fulfil fonts.googleapis/gstatic with empty CSS instead of blocking them, or the console fills with load errors.
- Chromium logs every 4xx fetch as a console "Failed to load resource" line. Expected ones here: 401 on first load (signed out), 400 and 409 from rule refusals. Count script errors separately.
- Playwright: when a banner may already be visible, wait for the element that only the new state shows (the error summary), not the banner.

## Session 1.9 findings
- Counts: POST /api/offers/stats {id, event:"view"|"lead"} from the popup, GET (signed in) for the dashboard. The route is in the function's config, not in the contract's ROUTES. Response header x-yavd-stat: counted | unknown | not-running | busy | store-failed; read it with curl.exe -D.
- A curl count needs -H "origin: <site>" and content-type application/json, or it is refused (403/415). A well-formed id that is not an offer answers 204 unknown: a safe smoke test that counts nothing.
- The stats function caches the offer list 60 s per instance: an offer saved a moment ago answers "unknown" or "not-running" for up to a minute. Poll, as with the edge.
- Stats tests: netlify/tests/offers-stats.test.mjs has its own memoryBlobs copy. Never import another *.test.mjs file for a helper: node --test runs that file's tests too.
- To prove a concurrency test is real, remove the onlyIfMatch condition and watch it fail (20 parallel views stored 1). The in-memory setJSON awaits setImmediate so parallel requests interleave.

## Session 1.10 findings
- A 5xx whose body is "Error - Request ID: ..." (not our JSON) is Netlify's own error page: the request never reached the function. Proof: the function log (Netlify > Functions > offers > Last hour) has no line for it. Nothing was saved; send it again. Our own failures always answer JSON {"error": ...}. Seen once in 1.10 (third of four quick creates).
- On Node 24, `node --test` piped to PowerShell prints the spec reporter ("i pass 10"), not "# pass 10". Scripts that parse the summary must pass --test-reporter=tap.
- git status always shows .netlify/ changes after a deploy (CLI-generated files tracked by mistake, backlog). Clean-tree checks must ignore " .netlify/".
