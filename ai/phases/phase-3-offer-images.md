# Phase 3: Offer Images (one image per offer: upload, popup display, cleanup)
Status: IN PROGRESS. Sessions 3.1 to 3.10 done 2026-11-11 (contract 1.3.0 frozen; picture checker; store; routes; image on an offer; cleanup; export; popup picture, approved by Michael; editor image block; saving the picture). Next: 3.11.

## What shapes this plan
- Read: the scope, ai/CONTEXT.md, ai/BUILD_NOTES.md, ai/DECISIONS.md, the Phase 2 plan and run sheet (format and numbering), and the code this phase touches: shared/offer-contract.js (1.2.0), lib/offers-rules.mjs, lib/offers-store.mjs, lib/offers-auth.mjs, offers.mjs, offers-export.mjs, netlify/edge-lib/offer-edge.js, assets/offer-panel.js and .css, assets/offer-admin.js (drawPreview, save), netlify.toml, _headers.
- Found 1: prepareOffer() is pure and synchronous, and the image's width, height, type and size must come from the stored bytes, never from the browser. So offers.mjs looks the picture up first and hands the result to prepareOffer. The browser's numbers are ignored.
- Found 2: publicPayload() fills a missing key with an empty string. For `image` that would hand every old offer `""` instead of `null`, so the contract helper needs a special case, and offer-edge tests that count payload keys will change.
- Found 2b (Session 3.1, from the code): prepareOffer copies every OFFER_KEYS entry, so until 3.5 a saved offer has image undefined (dropped by JSON). offers-rules.test.mjs excludes image from its key list until 3.5, which must remove that exclusion.
- Found 3: the image route must live under /api/. offer-page.js runs on every path that looks like a page, and a path like /offer-image/abc would cost a storage read per image. Under /api/ it is skipped (SKIP_PREFIXES). Upload and view both sit at /api/offers/image, which the sign-in cookie (Path=/api/offers) already covers.
- Found 4: the popup (offer-panel.js) and the editor preview (drawPreview in offer-admin.js) build the same markup in two places. The preview is a sandboxed iframe with no scripts, so the unsaved picture must reach it as a blob: or data: address. Session 3.9 proves that first.
- Found 5: no page has a Content-Security-Policy except /just-the-audio/app/*, so images will load wherever an offer can sit.
- Found 6: the scope's phase number clashes with nothing, but Phase 2 (Key Actions Dashboard) is planned and not started. This phase is independent of it. It is numbered 3 and can run before or after Phase 2. Phase 2 says offer-contract.js is frozen "throughout": the 1.3.0 bump here is a separate, approved revision (scope section 9), so there is no conflict. If both phases run, tag and deploy them one at a time.
- This repo has no DIRECTIVES.md or DECLARATIONS.md. The Parameters and Hard limits below stand in for them, as in Phases 1 and 2. ai/CONTEXT.md still describes the Phase 1 close; Session 3.1 archives it and writes a new one.
- Autopilot is not used: the sessions have no shell on Michael's PC, the repo has no CI, and deploys are Michael's PowerShell. Same manual loop as Phases 1 and 2: one session, one conversation. Session tags are for a foreman if you use one.

## Parameters
- Scale horizon: about 50 offers a year, one picture each, about 300 KB, about 15 MB a year. One admin. No cap in the design.
- Data sensitivity: marketing pictures Michael chooses. Treated as public once an offer shows them. Camera location data is removed on upload (the browser re-encodes the picture). Nothing about visitors is added.
- UX tier: popup Polished (brand navy and teal); editor Functional.
- Accessibility: alt text required (125 characters), image never behind text, popup keyboard and Escape behaviour unchanged, readable contrast.
- Platforms: desktop and phone web.
- Telemetry: none new. Existing view and lead counts are unchanged.
- Recovery: Export embeds the pictures of the current offers; saved versions keep the picture references; cleanup never removes a picture a saved version still uses.
- Compliance: none. The right to use a picture is Michael's call.

## Hard limits: stop and ask
- Any change to shared/offer-contract.js after Session 3.1 (it is frozen at 1.3.0).
- Editing any file not listed in a session's "Files". The existing files this phase may change, and where: shared/offer-contract.js (3.1 only), lib/offers-rules.mjs and offers.mjs (3.5, 3.6), offers-export.mjs (3.7), assets/offer-panel.js and .css (3.8), offer-admin.html, assets/offer-admin.js and .css (3.9, 3.10). No page is edited. submission-created.mjs and the lead form are never touched.
- Any new dependency (no image library on the server or in the repo; the browser shrinks with its own canvas, the server reads headers by hand).
- Accepting any file type other than JPG, PNG and WebP (SVG and GIF are refused on the server).
- Any secret in the repo, a log or a page.
- Any step that deletes or rewrites stored data on the LIVE store, run by a session or a script. Cleanup deletes only through the app's own save, and is tested on in-memory stores and the TEST store.
- Any publish to the live site before Session 3.12, and then only after Michael says go.
- Cache-busting: assets/offer-panel.js, offer-panel.css and offer-admin.js are cached by browsers. After any deploy, check in a NEW private window (Session 3.11 and 3.12 say so).

## Frozen contract (written and frozen in Session 3.1 as shared/offer-contract.js 1.3.0, additive only)

```js
export const CONTRACT_VERSION = '1.3.0';

// ROUTES gains two entries (existing entries unchanged):
//   apiImage: '/api/offers/image'       POST raw image bytes, signed in -> 201 { id, width, height, type, bytes }
//   image:    '/api/offers/image/:id'   GET, public, the picture itself
// STORES gains: images: 'offer-images'   ('-test' on every non-production deploy, storeName rule)

export const IMAGE = Object.freeze({
  mimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  placements: Object.freeze(['top', 'left', 'right']),
  defaultPlacement: 'top',
  idPattern: /^[0-9a-f]{32}$/,        // random, never reused
  altMax: 125,                        // alt text is required whenever an image is attached
  maxBytes: 600 * 1024,               // hard cap, enforced by the server
  targetBytes: 400 * 1024,            // the browser aims for this
  maxSideBrowser: 1600,               // browser shrinks the longest side to this
  maxSideServer: 4096,                // server sanity limit
  minSideServer: 16,
  graceHours: 24,                     // a picture younger than this is never cleaned up
  keepVersions: HISTORY_KEEP          // saved versions whose pictures are kept (20)
});
export const IMAGE_KEYS = Object.freeze(['id', 'alt', 'placement', 'width', 'height', 'type', 'bytes']);
export const PUBLIC_IMAGE_KEYS = Object.freeze(['id', 'alt', 'placement', 'width', 'height']);
export const imageUrl = (id) => `/api/offers/image/${id}`;

// OFFER_KEYS: 'image' added right after 'body'.   PUBLIC_OFFER_KEYS: 'image' added.
// Offer typedef gains:  @property {null|{id,alt,placement,width,height,type,bytes}} image   (1.3.0)
// emptyOffer(): image: null.
// publicPayload(): image is null when the offer has none (old offers have no key), otherwise
//   an object with PUBLIC_IMAGE_KEYS only. Never type, bytes, previewKey or history.

// Blob record, store "offer-images", key = image id:
//   bytes = the file; metadata = { type, bytes, width, height, uploadedAt (ISO) }
```

Server messages the editor will show (set here so 3.5, 3.9 and 3.10 agree):
- wrong type: "Use a JPG, PNG or WebP picture."
- too large: "That picture is still over 600 KB after shrinking. Try a smaller or simpler one."
- no alt: "Describe the picture in a few words (up to 125 characters)."
- gone: "That picture is no longer available. Add it again."
- upload failed: "The picture did not upload. Your offer text was saved without a new picture."

## Sessions

### Session 3.1: Freeze the contract
- Compartment: API · Depends on: nothing · Goal: shared/offer-contract.js bumped to 1.3.0 exactly as above, with its helpers and tests, and the existing suite still green.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability and scalability (one agreed shape before any code); security (the allow-list of types and the public key list are defined before any endpoint exists).
- Files modified: shared/offer-contract.js (this session only). Created: netlify/tests/offer-contract-images.test.mjs; new ai/CONTEXT.md (old one archived).
- Tasks:
  - [ ] Verify the Phase 3 "Found" items against the code (publicPayload empty-string fill, SKIP_PREFIXES, route paths free) and list any correction.
  - [ ] Apply the contract above. Keep the 1.2.0 header comments and add a 1.3.0 line.
  - [ ] Special-case image in publicPayload(): null when absent, PUBLIC_IMAGE_KEYS only when present.
  - [ ] Fix any existing test that counts payload or offer keys (offer-edge.test.mjs, offers-rules.test.mjs, offer-format.test.mjs), and say which.
  - [ ] Tests: old offer gives image null; present image gives only the five public keys; imageUrl; idPattern accepts 32 hex and refuses 31, 33, uppercase, path tricks; constants as written.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-contract-images.test.mjs` passes (output pasted), and each existing test file passes by path: offer-edge, offer-format, offers-auth, offers-rules, offers-stats, site-admin.
- Result 2026-11-11: DONE. All pass except offers-stats "twenty parallel views", which fails identically on the 1.2.0 contract (pre-existing, backlog in CONTEXT).
- Needs my eyes: the corrections list, if any.
- Risk and fallback: a hidden consumer of OFFER_KEYS order. Fallback: the failing test names it; fix the test, never the contract.
- Backup point: yes, before this session: `git tag pre-images-20261111`.
- After this session: CLEAR. The next session is pure byte-reading code, a different area.

### Session 3.2: Read and check an image
- Compartment: LOGIC · Depends on: 3.1 · Goal: a pure library that decides, from a file's own bytes, whether it is an acceptable picture, and how big it is.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (type from bytes, SVG and GIF refused, caps enforced, dimension sanity); stability (truncated or hostile files give a refusal, never a crash).
- Files created: netlify/functions/lib/offer-image.mjs, netlify/tests/offer-image.test.mjs, netlify/tests/fixtures/ (small generated pictures).
- Tasks:
  - [ ] sniffImage(bytes): JPEG (scan to the first SOF marker), PNG (IHDR), WebP (VP8, VP8L, VP8X). Returns { type, width, height } or null. Reads headers only, bounds-checked.
  - [ ] checkImage(bytes): applies IMAGE limits (maxBytes, side limits) and returns { ok, info } or { ok: false, status, error } with the messages above.
  - [ ] newImageId(): 32 hex from crypto, matches IMAGE.idPattern.
  - [ ] Make fixtures with Pillow here (JPEG, PNG, WebP lossy and lossless, a 5000 px one, a 10 px one, a 700 KB one). Fixtures are small and committed; Pillow is a one-time tool in the sandbox, not a repo dependency.
  - [ ] Tests: each good type; SVG text; GIF; a renamed .exe/PDF; HTML with a JPEG name; truncated JPEG, PNG and WebP; zero-length; over cap; too big and too small in pixels; a JPEG with a comment segment before the SOF; type claimed by name or header is ignored.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-image.test.mjs` passes (output pasted), run three times in a row; every refusal case shows its message.
- Result 2026-11-11: DONE. 34 of 34, three runs in a row. Fixtures made with headless Edge (no Pillow on this PC). Two pixel-limit messages added (DECISIONS).
- Needs my eyes: nothing.
- Risk and fallback: WebP VP8X edge cases. If a valid file is refused, the fixture that failed goes into the test and the parser is fixed; if still stuck after three tries, stop (three strikes).
- Backup point: no.
- After this session: CLEAR. Next is the storage layer, unrelated to byte parsing.

### Session 3.3: The image store
- Compartment: DATA · Depends on: 3.1, 3.2 · Goal: save, read, describe, list and delete pictures in the "offer-images" Blobs store, with a test store for non-production deploys.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability (test deploys never touch live pictures; a failed storage call is a clean error); scalability (one blob per picture, key = id, no index to outgrow).
- Files created: netlify/functions/lib/offer-images-store.mjs, netlify/tests/offer-images-store.test.mjs.
- Tasks:
  - [x] imagesStore(deployContext) using storeName(STORES.images, ctx), strong consistency, with a test factory like the offers store has (_setImagesStoreFactoryForTests).
  - [x] putImage(store, bytes, info, now): new id, bytes plus metadata { type, bytes, width, height, uploadedAt }, onlyIfNew.
  - [x] getImage(store, id) returns { bytes, meta } or null; headImage(store, id) returns meta or null (metadata only); listImages(store) returns ids; deleteImage(store, id).
  - [x] ImageStoreError with a status, like StoreError.
  - [x] Tests with an in-memory store: round trip, unknown id is null, bad id shape refused before any storage call, base name on production and "-test" otherwise, storage throwing becomes ImageStoreError.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-images-store.test.mjs` passes (output pasted).
- Needs my eyes: nothing.
- Risk and fallback: Blobs binary read type. The test store mirrors the real API calls used (set, get with type arrayBuffer, getMetadata, list, delete); if the real API differs on the TEST deploy, 3.11 finds it.
- Backup point: no.
- After this session: CONTINUE. 3.4 imports exactly what this one wrote.

### Session 3.4: Upload and view routes
- Compartment: API · Depends on: 3.3 · Goal: POST /api/offers/image (signed in) stores a checked picture; GET /api/offers/image/:id (public) serves it safely.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (signed in on every upload call; same-origin check; file type only from bytes; nosniff, noindex, no scripts can ever run from it); stability (a storage failure on view is a quiet 404 so the popup collapses; upload failure is a clean JSON error); efficiency (immutable one-year caching, one request per popup view).
- Files created: netlify/functions/offer-image-upload.mjs, netlify/functions/offer-image.mjs, netlify/tests/offer-image-routes.test.mjs. Routes are set inline in each function's config; netlify.toml is not edited.
- Tasks:
  - [ ] Upload: requireAdmin(POST); content-type must be image/jpeg, image/png or image/webp (also forces a browser preflight); refuse a declared length over the cap before reading, and the real length after; checkImage on the bytes; putImage; answer 201 { id, width, height, type, bytes } with no-store.
  - [ ] View: id must match IMAGE.idPattern, else 404; read; answer the stored type with `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex`, `Cache-Control: public, max-age=31536000, immutable`, `Content-Disposition: inline`. Unknown id or storage failure: 404 with no-store, never 500.
  - [ ] Test-only switch on non-production deploys: request header `x-yavd-test-store-fail: 1` forces the storage failure (same name as the edge switch), so 3.11 can prove the popup survives.
  - [ ] Tests: signed out gets 401 on upload; cross-site refused; wrong content-type 415; SVG with an image/png header refused; oversize 413; good JPEG, PNG, WebP stored and served back byte-identical; view works with no cookie; bad id shape 404; forced storage failure is 404 on view and a JSON error on upload; response headers as listed.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-image-routes.test.mjs` passes (output pasted); a test with the sign-in check removed fails (proves the 401 test is real).
- Needs my eyes: nothing.
- Risk and fallback: Netlify path params (`:id`) in a function config. If rejected on TEST, use a wildcard path and read the id from the URL; the contract names the route either way.
- Backup point: no.
- After this session: CLEAR. Next is the offer record rules, a different area, and this session leaves a long test output.

### Session 3.5: The image on an offer
- Compartment: LOGIC · Depends on: 3.1, 3.3 · Goal: saving an offer can carry, change or clear an image, and the server decides every fact about it.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (the browser's width, height, type and size are ignored; alt text is plain text; a picture must exist in the store); stability (an offer saved before 1.3.0 behaves exactly as before; rerun keeps the picture; storage trouble stops the save with nothing written).
- Files modified: netlify/functions/lib/offers-rules.mjs, netlify/functions/offers.mjs, netlify/tests/offers-rules.test.mjs. Created: netlify/tests/offers-image-save.test.mjs.
- Tasks:
  - [ ] prepareOffer reads input.image: absent keeps the stored value (null for old offers); null removes it (corrected in 3.5: the original text said "null or absent keeps", which contradicted the remove task); an object is checked: placement in IMAGE.placements (default top), alt through plainText, required, up to 125; id matches the pattern.
  - [ ] Facts come from ctx.images (a map id to stored metadata, supplied by offers.mjs). The same id as the stored image reuses the stored facts. An id that is not in the map fails with the "gone" message. Output object has IMAGE_KEYS in order.
  - [ ] offers.mjs: before changeOffers, look up the one wanted id with headImage (skipped when it equals the stored offer's image). A storage error answers 503 "nothing was saved".
  - [ ] Sending `image: null` removes the picture from the offer (the picture itself is left for cleanup).
  - [ ] Rerun: a new offer whose input carries an existing image id is accepted and points at the same id.
  - [ ] Field keys: image.alt, image.placement, image.id.
  - [ ] Tests: add, replace (new id), remove, change only alt, change only placement, forged width and type ignored, missing alt refused (draft too), 126-character alt refused, HTML in alt stripped, unknown id refused, old offers with no image field save unchanged, rerun, storage error 503, history and restore carry the image object.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offers-image-save.test.mjs` and `node --test netlify/tests/offers-rules.test.mjs` pass (output pasted), plus every other existing test file by path.
- Needs my eyes: nothing.
- Risk and fallback: a rules test that assumes an exact offer key list. Fix the test, never the contract.
- Backup point: yes, before this session: `git tag pre-images-record` (record shape changes).
- After this session: CONTINUE. 3.6 reads the image references this session defines.

### Session 3.6: Automatic cleanup
- Compartment: LOGIC · Depends on: 3.3, 3.5 · Goal: after a save, pictures that nothing uses are removed, never a used or recent one.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: stability (a referenced or recent picture is never deleted; cleanup failure never fails a save; Delete draft then Restore still comes back whole); efficiency (reads at most 20 saved versions and one list); scalability (no ceiling, one list call).
- Files created: netlify/functions/lib/offer-images-cleanup.mjs, netlify/tests/offer-images-cleanup.test.mjs. Modified: netlify/functions/offers.mjs (one best-effort call after a successful save).
- Tasks:
  - [x] usedImageIds(offersStore): ids in the current offers plus ids in the newest 20 saved versions (listHistory, same order rule as trimHistory).
  - [x] cleanupImages(imagesStore, offersStore, now): lists pictures, for each unused one reads its uploadedAt metadata, deletes only if older than 24 hours. Returns { kept, deleted, errors }.
  - [x] Hook: after a successful save in offers.mjs, `await cleanupImages(...)` inside try/catch; a failure is logged with console.error and ignored (the trimHistory pattern). Restore and delete do not trigger it.
  - [x] If the images list or any read fails, delete nothing.
  - [x] Tests: used by a current offer is kept; used only by a saved version is kept; unused and older than 24 hours is deleted; unused but 23 hours old is kept; replace an image: the old one is kept while a saved version refers to it and goes once that version is the 21st (corrected in 3.6: the scope keeps a picture while any of the newest 20 versions refers to it, so grace alone never frees it); delete a draft with an image, restore it, picture still there; cleanup throwing does not fail the save; unreadable history means nothing is deleted; the 21st version drops out and its picture becomes deletable.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-images-cleanup.test.mjs` passes (output pasted); a test with the grace check removed fails (proves it is real); all other test files still pass.
- Needs my eyes: nothing.
- Risk and fallback: a cleanup bug is the one way this phase can lose data, so the default on any doubt is delete nothing. Fallback if the hook cannot be made safe: ship without the hook and leave pictures in place (storage cost is small); stop and tell Michael.
- Backup point: no (test stores only).
- After this session: CLEAR. Heavy test output, and the next session is the export.

### Session 3.7: Export with pictures
- Compartment: API · Depends on: 3.3, 3.5 · Goal: Export holds everything: offers plus the pictures of the current offers, inside the response size limit.
- Size: M · My time: ~5 min · Confidence: Medium (the size limit is confirmed on the TEST deploy in 3.11)
- Objectives: stability (a full backup in one file; never a failed export because of size); security (signed in only, as today; the file still holds preview keys, so keep it private); efficiency (only current offers' pictures, no duplicates).
- Files modified: netlify/functions/offers-export.mjs. Created: netlify/tests/offers-export.test.mjs.
- Tasks:
  - [x] File gains `images: [{ id, type, bytes, width, height, dataBase64 }]` for every picture referenced by a current offer (deduplicated), and `imagesOmitted: [ids]` (empty when all fit).
  - [x] Size guard: stop adding pictures when the finished JSON would pass 4.5 MB (the platform limit for one function response is about 6 MB; the margin covers base64 growth and headers). Pictures that did not fit are listed in `imagesOmitted`, and `GET /api/offers/export?images=rest` returns a second file with just those pictures (extended in 3.7: if part 2 is also full it names part 3, `?images=rest&part=3`, and so on; each file says `parts` and `next`). The page text says so plainly (3.10 shows the message).
  - [x] A picture that cannot be read is listed in `imagesMissing` and the export still succeeds.
  - [x] File name for the second part: yavd-offers-<live|test>-images-<stamp>.json.
  - [x] Tests: no images, one image (round trip: decoded bytes equal the stored bytes), a duplicate reference, eight 590 KB pictures spill to part 2, missing picture reported, signed out 401, old offers unchanged.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offers-export.test.mjs` passes (output pasted), including the spill case.
- Needs my eyes: nothing.
- Risk and fallback: if the TEST deploy shows the real limit is lower than 6 MB, lower the 4.5 MB constant in one place; the design does not change.
- Backup point: no.
- After this session: CLEAR. Next is the popup, a different area.

### Session 3.8: The popup shows the image
- Compartment: UI · Depends on: 3.1 · Goal: the real popup shows the image in all three placements, on desktop and phone, with no layout jump and a safe fallback.
- Size: M · My time: ~10 min (includes your look) · Confidence: High (the Playwright harness from 1.6 exists)
- Objectives: user experience (no jump, stacks on phone, popup still works if the picture fails); accessibility (alt text, image never behind text, keyboard and Escape unchanged, focus order unchanged); efficiency (explicit width and height, one request, browser-cached); security (the address is built from the contract's imageUrl and a pattern-checked id, set with setAttribute, no innerHTML).
- Files modified: assets/offer-panel.js, assets/offer-panel.css (including the carried Phase 1 item: the phone-width preview badge under the close button, one CSS line). Created: netlify/tests/offer-panel-image.test.mjs (Playwright), a review page of screenshots.
- Tasks:
  - [x] Markup: `div.yavd-op-media > img.yavd-op-img` placed per offer.image.placement. Dialog gets `is-img-top`, `is-img-left` or `is-img-right`. Side placements: dialog widens to 720 px above 560 px wide and puts the picture in a column of about 38 percent; at 560 px and below everything stacks with the picture on top. Top banner is full width, height set by width and height attributes (aspect-ratio in CSS), image fits (cover is never used so nothing is cut).
  - [x] On the img `error` event: remove the media block and the placement class, so the popup is the normal text popup.
  - [x] No image (`null`) renders exactly as today (compare the DOM to the 1.2.0 output).
  - [x] Write the final markup and class names into BUILD_NOTES so 3.9 can match them in the editor preview.
  - [x] Carried item: the preview badge on phone width, one CSS line.
  - [x] Playwright tests on a copy of booth-proof.html built with injectOffer(): 3 placements x desktop (1280) and phone (390); no layout shift (the dialog height before and after the image loads is the same within 1 px); broken image address collapses cleanly; Escape and Tab order unchanged; no console errors.
  - [x] Build the review page: one self-contained HTML page that steps through the six screenshots with Back and Next, arrow keys and dots, and publish it as an artifact.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-panel-image.test.mjs` passes (output pasted); the existing offer-edge tests pass; six screenshots exist and the review page is published.
- Needs my eyes: step through the review page: do the three placements look right, is a 720 px side layout acceptable, does the phone stack read well.
- Risk and fallback: side-by-side in the old 520 px dialog would be cramped, so the widening is part of the plan. If you dislike it, fallback is 520 px with a narrower picture column; that is a CSS change only.
- Backup point: no.
- After this session: APPROVE. Stop for your look at the review page; answers can change the layout CSS, which the editor preview reuses. The next session starts on a fresh helper.

### Session 3.9: Editor image block
- Compartment: UI · Depends on: 3.1, 3.4, 3.8 · Goal: in the editor, you can pick, shrink, describe, place, replace and remove a picture, and see it in the live preview. The picture is held in the browser until 3.10 wires saving.
- Size: L · My time: ~5 min · Confidence: Medium (the sandboxed preview takes a blob address; proved first)
- Objectives: user experience (plain buttons, file name, size and thumbnail, clear error text); security (type checked by the file's own signature before decoding, SVG refused, alt text set with textContent); efficiency (shrink to 1600 px, aim under 400 KB, cap 600 KB); privacy (re-encoding removes camera location).
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css. Created: netlify/tests/offer-admin-image.test.mjs (Playwright).
- Tasks:
  - [x] FIRST: a tiny spike. Show a blob: address in the sandboxed preview iframe (allow-same-origin, no scripts). If it does not render, use a data: address and note it in BUILD_NOTES.
  - [x] New "Image" block under Popup copy: Add image, then file name, size, thumbnail, Replace, Remove, alt text field with a 125 counter, placement choice (Top banner default, Left of text, Right of text).
  - [x] Shrink in the browser: decode with createImageBitmap, longest side 1600, re-encode as WebP (JPEG if WebP is unsupported), lower quality step by step until under 400 KB, refuse if still over 600 KB. Wrong type (including SVG and GIF, checked from the first bytes) refused with the message above. A phone HEIC picture gets "Use a JPG, PNG or WebP picture."
  - [x] Extend the sandbox preview (drawPreview) to draw the same markup as the real popup (from 3.8's BUILD_NOTES entry), reading the picture from the unsaved state.
  - [x] Dashboard card: small thumbnail from /api/offers/image/<id> when an offer has a picture (should-have in the scope).
  - [x] Field slots for image.alt, image.placement, image.id in offer-admin.html and an entry in inputFor() (BUILD_NOTES 1.8).
  - [x] Tests (Playwright, local harness with the real handlers and in-memory stores): picking a JPEG, PNG and WebP; a 4000 px photo ends at 1600 px and under 600 KB; SVG, GIF and a renamed text file refused; alt counter; placement changes the preview in both Desktop and Phone modes; Remove clears; no console errors other than expected 4xx.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-image.test.mjs` passes (output pasted); a screenshot of the editor with a picture attached and one of the preview in each placement are saved.
- Needs my eyes: nothing yet (you review the editor on TEST in 3.11).
- Risk and fallback: the largest session, flagged. If it runs past 45 minutes, stop at the end of the shrink and block, commit, and move the dashboard thumbnail and preview polish to a 3.9b session from the contingency budget.
- Backup point: no.
- After this session: CONTINUE. 3.10 extends the editor state this session just wrote.

### Session 3.10: Save, replace, remove, rerun
- Compartment: STATE · Depends on: 3.5, 3.9 · Goal: the picture goes up when you save, the offer saves with its reference, and every editor path keeps the picture straight.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: stability (an upload failure never loses the offer text; a 401 mid-save keeps the picture in memory; Leave-with-unsaved-changes counts the picture); user experience (clear messages, no double upload); security (nothing is sent until you save).
- Files modified: assets/offer-admin.js (collect, fill, snapshot, isDirty, save, resumeStash, rerun, openEditor, export button message). Tests extend netlify/tests/offer-admin-image.test.mjs.
- Tasks:
  - [x] save(): if a new picture is pending, upload it first, then POST the offer with `image: { id, alt, placement }`; if the upload fails, save the offer text with its previous picture and show "The picture did not upload. Your offer text was saved without a new picture."
  - [x] collect(), fill(), snapshot() and isDirty() include the picture, alt and placement. Changing only the alt or placement does not upload anything.
  - [x] Remove sends `image: null`. Replace uploads the new picture and gets a new id.
  - [x] Sign-in expiry: the stash keeps the pending picture in memory (not localStorage) and resumeStash restores it.
  - [x] Rerun copies the image object to the new offer (same id).
  - [x] Export: if the response says images were omitted, show the plain sentence and a second button for the images file.
  - [x] Server field errors for image.alt, image.placement, image.id show in their slots.
  - [x] Tests (Playwright harness): add and save; replace; remove; alt-only change makes no upload request; upload failure still saves the text; 401 during save then sign in again keeps the picture; Delete draft with a picture then Restore from Saved versions; rerun; Leave-guard fires for an unsaved picture.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-image.test.mjs` passes (output pasted), including the network-request counts; all other test files still pass.
- Needs my eyes: nothing.
- Risk and fallback: the load() call must stay at the very end of offer-admin.js (BUILD_NOTES 1.8). If state handling gets tangled, keep the pending picture in one object and snapshot from it.
- Backup point: no.
- After this session: CLEAR. Next is deploy tooling and verification, a different area.

### Session 3.11: Test deploy and verification script
- Compartment: QA · Depends on: 3.1 to 3.10 · Goal: everything proven on the TEST address (https://offers--your-av-dept.netlify.app) with real Blobs and the real Netlify, before anything is live.
- Size: M · My time: ~25 min (deploy, one verify run, a look on desktop and phone) · Confidence: Medium (first contact with real Blobs, as in 1.2)
- Objectives: security (every admin image route 401 signed out; SVG refused on the real server); stability (storage-off test: pages and popup load without the picture; existing offers unchanged); efficiency (image headers and caching); user experience (you see it on a real phone).
- Files created: session-3.11-verify.ps1 (reads the password once from the clipboard and clears it, as in 1.4; own variable name for every result; `--test-reporter=tap` for node), a short TEST checklist in ai/phases/phase-3-RUNSHEET.md.
- Tasks:
  - [ ] Verify script on TEST: signed out, upload and remove routes return 401; sign in; upload a JPEG, PNG and WebP; SVG, GIF and an oversize file refused; the picture loads with no cookie; headers: content-type, nosniff, noindex, immutable cache; a wrong id is 404.
  - [ ] Make a TEST offer with a picture through the API, poll the edge for the expected state (60 s cache, BUILD_NOTES 1.5), fetch the page, confirm the injected data holds the image object with five keys and no previewKey.
  - [ ] Forced storage failure (`x-yavd-test-store-fail: 1`): the picture request is 404, the page still loads, and the popup data is intact.
  - [ ] Export on TEST with eight 590 KB pictures: the first file stays under the limit, `imagesOmitted` lists the rest, and the second download returns them. This is the real size-limit test.
  - [ ] Cleanup on TEST: replace a picture, confirm the old one is still there within 24 hours (grace), and that the test list matches expectations.
  - [ ] Existing offers on TEST still list and save unchanged.
  - [ ] Print one verdict block: every check PASS or FAIL.
- Inputs needed from Michael: after the session, you run deploy-preview.ps1 and the verify script, then open the three TEST previews on your phone and desktop (in a NEW private window).
- DONE WHEN: the verdict block shows every check PASS and the phone/desktop look is done.
- Needs my eyes: the editor and all three placements on the real TEST address, on a phone and a computer.
- Risk and fallback: Netlify CLI problems (BUILD_NOTES 1.2), plus a Netlify 5xx that never reached the function (retry). Plan one extra verify run for this session.
- Backup point: no.
- After this session: APPROVE. You deploy to TEST, run the script, look, paste the verdict, and say go. The next session starts on a fresh helper. Optional: /clear the foreman chat before saying go; the next step is read from ai/CONTEXT.md.

### Session 3.11b: Editor Cancel button (added 2026-11-12 from Michael's TEST review)
- Compartment: UI · Depends on: 3.11 · Goal: an obvious way to leave the editor without saving.
- Size: S · My time: ~2 min (checked on TEST at the start of 3.12) · Confidence: High
- Objectives: user experience (clear exit); stability (no unsaved change lost: the existing guard asks first).
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css (only if spacing needs it), netlify/tests/offer-admin-image.test.mjs.
- Tasks:
  - [ ] A Cancel button (id oa-cancel, plain oa-btn, never primary) beside Save as draft and Save and schedule. It calls leaveEditor(): clean form goes straight to the dashboard; unsaved changes show the existing guard.
  - [ ] Escape in the editor does the same (not while the guard or the delete dialog is open, not while typing in a field that uses Escape).
  - [ ] Keep the top Back to offers button. Disable Cancel while a save is running, like the save buttons.
  - [ ] Playwright: clean editor Cancel returns to the dashboard with no API call; dirty editor Cancel shows the guard, Stay keeps the edits, Leave discards; a new picture held in memory is released on Leave.
- Inputs needed from Michael: None (label Cancel, decided 2026-11-12).
- DONE WHEN: node --test netlify/tests/offer-admin-image.test.mjs all pass (paste the summary); screenshot ai/review/3.11b/cancel.png; restore the 3.8/3.9 screenshots before committing.
- Needs my eyes: Michael clicks Cancel on TEST at the start of 3.12.
- Risk and fallback: none beyond the guard; if Escape clashes with a field, drop Escape and log it.
- Backup point: no.
- After this session: CONTINUE. 3.12 starts by deploying to TEST, where Michael clicks Cancel once before go-live.

### Session 3.12: Go live and close the phase
- Compartment: INFRA · Depends on: 3.11 · Goal: the feature is live, nothing existing changed, Michael has used it once, and the phase is closed.
- Size: M · My time: ~25 min · Confidence: High
- Objectives: stability (backup before and after; existing offers and pages unchanged); security (live admin image routes 401 signed out); all five reviewed at close.
- Files: ai/CONTEXT.md, BUILD_NOTES.md, DECISIONS.md, session-3.12-golive.ps1. No app code.
- Tasks:
  - [ ] Backup first: Export the live offers (/offer-admin), then `git tag pre-images-live-<time>`.
  - [ ] Deploy with deploy.ps1 after your go.
  - [ ] Live check, read-only: contract 1.3.0 in GET /api/offers; live offers list identical to the pre-deploy export; image upload and remove routes 401 signed out; an unknown image id is 404 with the right headers; the popup page for an existing running offer is unchanged; storage-off switch ignored on live.
  - [ ] You add your first real picture to a draft in /offer-admin (new private window), preview it on desktop and phone, then Export once more.
  - [ ] Close: verify every scope success criterion (section 12) with pasted output; compare plan and actual from ai/archive; trim BUILD_NOTES and refresh its map; check DECLARATION-level claims against code; add the DECISIONS entries; one line each for security, stability, efficiency, user experience and scalability; write CONTEXT as a handoff.
- Inputs needed from Michael: your go to publish; one real picture; the README question (below).
- DONE WHEN: the live verdict block shows PASS on every line; the closing Export file exists; scope criteria 1 to 9 each have output pasted.
- Needs my eyes: your first real picture on live, on a phone.
- Risk and fallback: a problem on live is an offer set to draft or a redeploy of the pre-images-live tag (Netlify > Deploys > previous production deploy > Publish deploy). Pictures already uploaded stay in their store and are harmless.
- Backup point: yes (live export and tag, before; export again after).
- After this session: phase done. Stop and notify. Say what is actually next.

## Summary
- Sessions: 12 (S x2, M x9, L x1). Michael's attention: about 105 min as estimated; at the 1.3x calibration from Phase 1, plan about 137 min. About 55 percent of that is 3.11 and 3.12.
- Most likely to overrun: 3.9 (the only L), 3.11 (first contact with real Blobs and the CLI; Phase 1's 1.2 ran 70 min against 15).
- Low-confidence L: none. 3.9 is Medium confidence and its first task is a spike on the one real unknown (blob address in the sandboxed preview). 3.9 has a stop rule at 45 minutes that moves the polish to a 3.9b.
- Contingency: +35 percent on sessions because this phase ships new UI (3.8, 3.9, 3.10): budget 4 extra sessions (about 16 total), named 3.8b, 3.9b, 3.10b and 3.11b as needed. The first human review of new UI is at the 3.8 stop and the 3.11 stop; follow-ups from those reviews are what the contingency is for. No cache-version bumps are needed (no service worker on these pages); the cache issue is browser caching of /assets, handled by the new-private-window rule.
- Calibration used: Phase 1 planned 10 sessions and ran 10; Michael's time ran 60 percent over (15 percent excluding 1.2). Sizes held or came in one step smaller. So session count is stable, time is multiplied by 1.3, and the one CLI-driven verify session (3.11) gets an extra verify run.
- Carried items: the phone-width preview badge (Phase 1 backlog 3) has a home in 3.8. These Phase 1 items stay in the backlog and are not part of this phase: 1.2b lead alert email, README update, untracking .netlify/, test store tidy, access codes and the later list.
- Five objectives:
  - Security: signed-in upload, type read from bytes, SVG and GIF refused, size and dimension caps, random ids, nosniff and noindex on served pictures, location data stripped, alt text as plain text, no new dependency.
  - Stability: no offer text lost on an upload failure, popup collapses cleanly if a picture fails, storage trouble serves the normal page, cleanup deletes nothing on any doubt, Export is a full backup, old offers unchanged.
  - Efficiency: shrink before upload, one immutable-cached request per popup view, cleanup reads at most 21 small items.
  - User experience: live preview shows the picture as saved, three placements, phone stacking, no layout jump, plain error messages.
  - Scalability: one blob per picture, no cap in the design, sized for about 50 offers a year.
- Backup points: before 3.1 (`pre-images-20261111`), before 3.5 (`pre-images-record`), before 3.12 (live export plus `pre-images-live-<time>`), after the first real picture (Export).
- Stops and clears: APPROVE after 3.8 (your look at the placements), APPROVE after 3.11 (TEST deploy, verify, phone look, then go). CONTINUE after 3.3 and 3.5 and 3.9. CLEAR after 3.1, 3.2, 3.4, 3.6, 3.7 and 3.10.

## Decisions and assumptions made in this plan (reversible; say so if you object)
1. Placement default is Top banner (scope). Side placements widen the dialog to 720 px on screens wider than 560 px and stack on top below that.
2. Alt text is required on every save, drafts included (scope: required whenever an image is attached).
3. The public popup data carries id, alt, placement, width and height. Type and size stay private.
4. Export size handling (the scope's SHOULD RESOLVE): current offers' pictures are embedded up to 4.5 MB of JSON; the rest come in a second download, named plainly. The real limit is proved on TEST in 3.11. Web search confirmed the commonly documented limit for a Netlify function response is about 6 MB.
5. The image route sits at /api/offers/image/:id (public GET) so the page edge function never runs for it.
6. Cleanup runs on save only (not on delete or restore).
7. The live check in 3.12 is read-only. No session creates or deletes data on the live store; you add the first real picture yourself.
8. Pillow makes the small test pictures in the sandbox only. It is not a repo dependency.
