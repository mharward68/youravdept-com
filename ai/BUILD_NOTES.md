# Build notes: YAVD Offers Module

Only what a future session would waste time rediscovering.

## MAP
- Site: static HTML at the repo root, plus library/ and field-notes/. No build step. Every page inlines its own CSS and JS (no shared stylesheet). Brand tokens repeat in each page's :root.
- Netlify config: _redirects (pretty URLs as 200 rewrites, a few 301s), _headers (library PDFs). No root netlify.toml before 1.2. .netlify/netlify.toml is the CLI's generated copy: never edit it.
- Functions: netlify/functions/submission-created.mjs (existing, Resend guide mailer, runs on every form).
- Offers module: shared/offer-contract.js (frozen contract). Popup: assets/offer-panel.css and assets/offer-panel.js (public, published by both deploy scripts). Sign-in: netlify/functions/lib/offers-auth.mjs (requireAdmin, handleLogin). Field checks and rules: lib/offers-rules.mjs. Storage, history, restore: lib/offers-store.mjs. Counts: netlify/functions/offers-stats.mjs + lib/offers-stats.mjs. Pictures: lib/offer-image.mjs (sniffImage, checkImage, newImageId, IMAGE_MESSAGES; Phase 3), test pictures in netlify/tests/fixtures/. Picture storage: lib/offer-images-store.mjs (putImage, getImage, headImage, listImages, deleteImage; store "offer-images"). Picture cleanup: lib/offer-images-cleanup.mjs (usedImageIds, cleanupImages; run best effort after each save in offers.mjs). Export (offers plus current pictures, parts): netlify/functions/offers-export.mjs (EXPORT_MAX_BYTES). Picture routes: offer-image-upload.mjs (POST /api/offers/image) and offer-image.mjs (GET /api/offers/image/:id). Edge: netlify/edge-functions/offer-link.js and offer-page.js (thin), logic in netlify/edge-lib/offer-edge.js. Popup picture test (Playwright): netlify/tests/offer-panel-image.test.mjs, screenshots in ai/review/3.8/. Tests: netlify/tests/*.test.mjs (run each file by path). ai/ holds the scope, plan, run sheet and these notes.
- Deploy: deploy.ps1 (production) and deploy-preview.ps1 (TEST address https://offers--your-av-dept.netlify.app) both copy the folder to %TEMP% minus one shared exclude list, then run netlify deploy with --functions netlify\functions. Live since 2026-10-10 12:23 ET.
- Repo: github.com/mharward68/youravdept-com, branch main. Netlify site id 7b58fbd4-394f-4091-bc6d-29b4e3b6ff79.

## Deploying
- Test on deploy-preview.ps1 first; deploy.ps1 publishes youravdept.com. Rollback: Netlify > Deploys > previous production deploy > Publish deploy. Offer rollback: set it to draft.
- Anything in the folder that is not excluded becomes a public file. Excluded: Claude outputs, claude, docs, .git, .netlify, node_modules, ai, netlify, deploy*.ps1, README.md, .gitignore, netlify.toml, package*.json, *.docx, *.patch, *.gs. netlify.toml also 404s /ai/* and /netlify/* as a second lock. shared/ must stay published (the popup imports it).

## Forms
- submission-created.mjs runs on every Netlify form submission. It skips forms with no "guide" field. Never add a "guide" field to the offers form.
- RESEND_API_KEY is already set on the site and Resend sends from michaelh@youravdept.com.
- Existing forms each have their own page and name (venue-docs-free-offer, booth-proof-dates, booth-proof-pilot, av365, av-concessions).

## Pages
- Pages are reachable at two addresses (/booth-proof and /booth-proof.html). Always compare through normalizePagePath().
- booth-proof.html: noindex, standalone (no header, footer or site map), no form; loads Montserrat 700/800 and Inter from Google Fonts.

## Environment for Claude sessions
- Sessions 1.1 to 1.10 had file list, stage and commit access to Michael's PC but no shell there: git and the Netlify CLI run from PowerShell scripts Michael pastes. Check the tool list at boot. Claude in Chrome (his Chrome, signed in to Netlify) can read function logs when a request fails.

## Session 1.2 findings
- Functions on the TEST address see deploy context "branch-deploy" and use the "-test" stores. The CLI reads netlify.toml and netlify/edge-functions from the site folder, not the staged copy.
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
- session-1.3-verify.ps1 leaves the TEST sign-in locked for 15 minutes (its last check).
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
- PowerShell scripts run at script scope: a helper loop that reuses a result variable ($r) silently overwrites earlier results. Give every result set its own name (1.10 go-live verdict read 8 false FAILs this way).
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
- The Netlify connector shows a form's submission_count and last_submission_at, not submission contents. 'offers' count: 7 after the 1.10 TEST-address run, then 3 more TEST leads from the live go-live.
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

## Session 3.1 findings (offer images, contract 1.3.0)
- The Claude sessions now have a shell on Michael's PC (Git Bash and PowerShell), but no Python: use node or the Edit tool for scripted edits.
- prepareOffer builds the saved offer with `for (const k of OFFER_KEYS) offer[k] = out[k]`, so any new OFFER_KEYS entry appears as undefined (dropped by JSON) until the rules set it. Key-list tests on objects (offer-format) still pass; key-list tests on JSON responses (offers-rules) do not.
- In shared/offer-contract.js, IMAGE must stay below HISTORY_KEEP: it reads it at module load (const, temporal dead zone).
- The live site is deployed from this PC's folder, so this folder is the truth, and GitHub main can fall behind or fork (other machines and cloud sessions push there too). Before any deploy, `git fetch` and check `git rev-list --count HEAD..origin/main` is 0. If they fork, compare each page with the live site (curl https://youravdept.com/<page>, NOT www, which 301s) before choosing a side. Live pages differ from the files only by the injected GA4 tag and Netlify's tidied links.
- offers-stats "twenty parallel views" fails on this PC before and after 3.1 (13 of 20 counted). Do not chase it inside Phase 3; it is in the CONTEXT backlog.

## Session 3.2 findings (reading pictures)
- No Python or Pillow on this PC. Test pictures are made with headless Edge: a local HTML page draws on a canvas, writes canvas.toDataURL(type, quality) into a <pre>, and `msedge.exe --headless=new --disable-gpu --virtual-time-budget=5000 --dump-dom file:///...` prints it (Edge: C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe). Add --allow-file-access-from-files to load local images back and check they decode.
- Edge (Chromium) always writes WebP in the extended form (VP8X + ICCP + VP8 or VP8L), even opaque. Quality 1.0 gives lossless (VP8L). Simple VP8 and VP8L files were made by rewrapping the inner chunk in a new RIFF header. Canvas JPEG is baseline (SOF0); the progressive test patches C0 to C2.
- checkImage refuses cut-off files by checking each format's ending (JPEG FF D9, PNG IEND, WebP RIFF length). Only zero padding is allowed after a JPEG end marker. Fine while the browser re-encodes every picture (3.9); a raw camera file with trailing data would be refused.

## Session 3.3 findings (picture store)
- @netlify/blobs 11.1.1: the TypeScript overload for get/getWithMetadata with type arrayBuffer omits `| null`, but a missing key still returns null. Always null-check.
- Blobs metadata comes back as JSON, so store numbers as numbers and still coerce with Number() on read (lib/offer-images-store.mjs cleanMeta).

## Session 3.4 findings (picture routes)
- Upload is offer-image-upload.mjs (POST /api/offers/image), view is offer-image.mjs (GET/HEAD /api/offers/image/:id). Both configs set `method`, so a wrong method never reaches them on Netlify.
- Functions may import the test switch from netlify/edge-lib/offer-edge.js (wantsForcedFailure): one header name and one list of test contexts for edge and functions. Do not copy the list.
- Testing "body not read": a ReadableStream pulls once as soon as it is built. Pass { highWaterMark: 0 } as the second argument or the test sees a read that the handler never made.
- Node's Request accepts a content-length header in tests, so the declared-size refusal can be tested without sending the bytes.

## Session 3.5 findings (image on an offer)
- prepareOffer stays pure and synchronous: offers.mjs looks up the one wanted picture (headImage) BEFORE changeOffers and passes ctx.images. Do not move the lookup inside the changeOffers callback (it is sync and may retry).
- `image` absent keeps the stored picture; `image: null` removes it. The editor (3.9, 3.10) must send null to remove, and may send the whole stored image object back unchanged (facts are ignored, the same id costs no lookup).
- No Python on this PC (the `python` command is the Store stub). Use node or the edit tools for scripted edits.

## Session 3.6 findings (picture cleanup)
- Cleanup runs only after a successful POST /api/offers save (not delete, restore or upload). A picture is used if any current offer or any of the newest 20 saved versions refers to it; an unused one goes once it is over 24 hours old. Any read failure, or a saved version not in the expected shape, means nothing is deleted; problems only reach console.error ("picture cleanup skipped or partial").
- Tests that upload a picture with an old uploadedAt must add it AFTER any earlier save in the test, or that save cleans it up as unused (cost a debugging round in 3.6).
- An upload that sits unsaved for more than 24 hours is removed by the next save of any offer. The editor (3.9, 3.10) should upload close to saving; a "gone" message on save means add the picture again.

## Session 3.7 findings (export with pictures)
- Export plans its parts from headImage sizes (base64 = 4*ceil(n/3), plus 400 bytes per entry), then reads only the part asked for. Part 1 = /api/offers/export (offers + first pictures); part N = ?images=rest (N=2) or ?images=rest&part=N. Parts are recomputed per request: a save between downloads can shift them.
- To lower the size limit after the TEST check, change EXPORT_MAX_BYTES in offers-export.mjs only; the tests read it from the module.
- The 590 KB spill tests use fake bytes: the picture store does not check content, so no real images are needed for size tests.

## Session 3.8 findings (popup picture; 3.9 matches this markup)
- Markup: `.yavd-op-dialog.is-img-<top|left|right>` > `.yavd-op-scroll` > `div.yavd-op-media > img.yavd-op-img` (first child), then the usual text `div`. img has alt, width, height (from the offer) and decoding="async"; src = imageUrl(id), set with setAttribute only. No class and no media block when image is null or fails checks (id against IMAGE.idPattern, width and height positive integers; unknown placement becomes top).
- CSS (assets/offer-panel.css, "picture" block): top = edge to edge (negative margins equal to the scroll padding), max-height min(320px, 38vh), 520 px dialog. left/right above 560 px: dialog 720 px, scroll becomes a grid 38% / 1fr (right: 1fr / 38%, media order 2, margin-top 30px to clear the close button), picture radius 8px. At 560 px and below every placement stacks edge to edge, max-height 34vh. object-fit contain everywhere (letterbox colour #F3F5F8), never cover. drawPreview in 3.9 can reuse these classes as they are.
- img error removes the media block and the class (back to the 520 px text popup). The thank-you screen also drops the picture. A visitor who closed the offer in the last 7 days does not download the picture until they reopen.
- Playwright on this PC: playwright-core 1.49.1 in %LOCALAPPDATA%yavd-test-tools (outside the repo, not a site dependency), driving the installed Edge. offer-panel-image.test.mjs finds it there (or $YAVD_PLAYWRIGHT) and skips with a reason if absent. The test has its own Node static server (no Python here) and answers /api/offers/stats with 204, or the console check fails. Screenshots land in ai/review/3.8/.
- The 1.2.0-identical check compares against `git show 54ec5de:assets/offer-panel.js`; if that file changes again, keep the ref pointing at 1.2.0 or retire the test deliberately.

## Just the Audio (added 2026-10-11)
- A free tool that turns MP4, MOV and M4A recordings into MP3 in the visitor's own browser. Called "MP4 to MP3 Converter" during the build; the project folder and repo keep that name.
- Lives in just-the-audio/ (landing page index.html, manifest, sw.js, icons) and just-the-audio/app/ (the tool). Source of truth is the separate project C:\01_AppDevelopment\19_mp4-mp3_converter (repo mharward68/mp4-mp3_converter): change it there, run its tests, then copy its mp3-mp4_app\public folder over just-the-audio here. Its ai/ folder has the full notes.
- The landing page is generated from library/av365.html by that project's tools/build-landing.py. After changing the header, footer, :root or site map on the library pages, re-run it.
- netlify.toml sets a strict content security policy on /just-the-audio/app/* only. Never widen it to /just-the-audio/* or site-wide: every other page relies on inline CSS and JS.
- Functions: netlify/functions/just-the-audio-count.mjs (POST /api/just-the-audio/count) and just-the-audio-stats.mjs (GET /api/just-the-audio/stats?key=). Stores: just-the-audio-usage (live) and just-the-audio-usage-test. Env var JUST_THE_AUDIO_STATS_KEY.
- Releasing a change: bump VERSION in just-the-audio/sw.js or installed copies keep the old files.
- offer-page.js still runs on /just-the-audio/* (pass-through unless an Everyone offer targets that page). An offer injected into /just-the-audio/app/ would be blocked by the content security policy, so do not target it.
