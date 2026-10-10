# Build notes: YAVD Offers Module

Only what a future session would waste time rediscovering.

## MAP
- Site: static HTML at the repo root, plus library/ and field-notes/. No build step. Every page inlines its own CSS and JS (no shared stylesheet). Brand tokens repeat in each page's :root.
- Netlify config: _redirects (pretty URLs as 200 rewrites, a few 301s), _headers (library PDFs). No root netlify.toml before 1.2. .netlify/netlify.toml is the CLI's generated copy: never edit it.
- Functions: netlify/functions/submission-created.mjs (existing, Resend guide mailer, runs on every form).
- Offers module: shared/offer-contract.js (frozen contract). Sign-in: netlify/functions/lib/offers-auth.mjs (requireAdmin, handleLogin). Field checks and rules: lib/offers-rules.mjs. Storage, history, restore: lib/offers-store.mjs. Edge: netlify/edge-functions/offer-link.js and offer-page.js (thin), logic in netlify/edge-lib/offer-edge.js. Tests: netlify/tests/*.test.mjs (run each file by path). ai/ holds the scope, plan, run sheet and these notes.
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
