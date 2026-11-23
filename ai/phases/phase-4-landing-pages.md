# Phase 4: Offer Landing Pages (a branded page per offer, found, edited and archived in the admin)
Status: PLANNED 2026-11-23 from the approved scope ai/spec/landing-pages-scope.md. Not started.

## What shapes this plan
- Read: the scope, ai/CONTEXT.md (Phase 3 close), ai/BUILD_NOTES.md, the Phase 3 plan and run sheet (format, numbering, calibration), and the code this phase touches: shared/offer-contract.js (1.3.0), lib/offers-rules.mjs, lib/offers-store.mjs, lib/offer-images-store.mjs, lib/offer-images-cleanup.mjs, offers.mjs, offers-export.mjs, offers-pages.mjs, netlify/edge-functions/offer-page.js, offer-link.js, page-takedown.js, netlify/edge-lib/offer-edge.js, assets/offer-panel.js, assets/offer-admin.js (function list), offer-admin.html (Where and who), netlify.toml, _redirects, deploy.ps1.
- Found 1: the site is static and published from this PC, so a running site cannot write `/offers/landing-x.html`. Each landing page is a record in a new Blobs store and one function serves it from one template. The same address results.
- Found 2: `offer-page.js` (popups) and `page-takedown.js` both run on `/*`; `looksLikePage()` in offer-edge.js treats any `.html` or extensionless path as a page. `/offers/` is not in `SKIP_PREFIXES` or either function's `excludedPath`, so a landing page would get a popup and a storage read. Session 4.9 adds `/offers/` to the skip list and both `excludedPath` lists.
- Found 3 (highest risk): `usedImageIds()` in offer-images-cleanup.mjs counts only offers and their last 20 saved versions. A hero picture used only by a landing page is unused, so the next offer save deletes it 24 hours after upload. Session 4.5 does this first, before anything stores a landing picture.
- Found 4: `prepareOffer()` is pure and synchronous; offers.mjs looks up the one wanted picture before `changeOffers()`. Landing saves copy this pattern exactly. The picture's facts come from the stored bytes, never from the browser.
- Found 5: `offers-pages.mjs` lists deployed `.html` files, so landing pages never appear in the "Page the offer sits on" dropdown. Intended: a popup cannot sit on a landing page. No change.
- Found 6: Export (offers-export.mjs) packs offers plus current pictures into parts under 4.5 MB. Landings and their pictures must join the same packing, or a restore after a disaster loses every landing page.
- Found 7: the offer popup's button comes from `buttonUrl` and `form.buttonLabel` (offer-panel.js around line 200), and a form-on popup has a submit button, not a link. A linked landing page therefore needs a rule for the form (see Decision 1).
- Found 8: the admin script is one large module (offer-admin.js, about 73 KB). The landing list and window are added as separate blocks with their own markers, and the final `load()` call stays at the very end (BUILD_NOTES, Session 1.8).
- Found 9: nothing in the repo or the live site writes a file at runtime, and the live deploy is `deploy.ps1` from this PC. No deploy script changes. `netlify.toml` already holds the header rules; Session 4.9 adds one for `/offers/*`.
- This repo has no DIRECTIVES.md or DECLARATIONS.md. The Parameters and Hard limits below stand in for them, as in Phases 1 to 3.
- Run by a foreman (Michael's choice, 2026-11-23): one helper per session, one session per conversation, chained by the tags. Phase 3 showed helpers run git, tests and the deploy scripts in the website folder themselves. There is still no CI in the repo and no scheduled task, so Michael stays in the loop at the two APPROVE stops (4.10, 4.15) and for the live go (4.16).

## Parameters
- Scale horizon: about 50 landing pages a year, one picture each (about 300 KB). One admin. No cap in the design.
- Data sensitivity: public marketing content Michael writes. No visitor data is stored. Preview keys are private.
- UX tier: landing page Polished (brand navy and teal); admin window and list Functional.
- Accessibility: alt text required (125 characters), one H1, readable contrast, keyboard focus on the button, expiration popup keyboard and Escape behaviour, no text over the picture.
- Platforms: desktop and phone web.
- Telemetry: none new. Views and clicks per landing page are cut from this phase (Decision 5).
- Recovery: Export includes landing records and their pictures; every landing save keeps the previous version (last 20); archive is reversible; cleanup never removes a picture any landing or saved landing version uses.
- Compliance: none.

## Hard limits: stop and ask
- Any change to shared/offer-contract.js after Session 4.1 (it is frozen at 1.4.0).
- Editing any file not listed in a session's "Files". Existing files this phase may change, and where: shared/offer-contract.js (4.1 only), shared/landing-template.js (created 4.8, edited only by 4.13 to fix a preview difference), lib/offer-images-cleanup.mjs (4.5), lib/offers-rules.mjs and offers.mjs (4.6), offers-export.mjs (4.7), netlify/edge-lib/offer-edge.js, edge-functions/offer-page.js and page-takedown.js, netlify.toml (4.9 only), assets/offer-panel.js and offer-panel.css (4.6 only, button and link), offer-admin.html, assets/offer-admin.js and offer-admin.css (4.11 to 4.14). No existing page is edited. submission-created.mjs and the lead form are never touched.
- Any new dependency (none are needed: the page is built from a template string, the browser shrinks pictures with its own canvas).
- Storing or serving HTML a visitor or admin typed. Landing HTML is built only from escaped fields and the fixed template.
- Any link scheme other than https:// or a same-site path in a call to action.
- Any secret in the repo, a log or a page.
- Any step that deletes or rewrites stored data on the LIVE store, run by a session or a script. Cleanup deletes only through the app's own save and is tested on in-memory stores and the TEST store.
- Any publish to the live site before Session 4.16, and then only after Michael says go.
- Any change to the exact expiration popup wording without Michael's word (it lives in the contract).
- Cache-busting: assets/*.js and *.css are cached by browsers. After any deploy, check in a NEW private window (4.15 and 4.16 say so).

## Frozen contract (written and frozen in Session 4.1 as shared/offer-contract.js 1.4.0, additive only)

```js
export const CONTRACT_VERSION = '1.4.0';

// ROUTES gains (existing entries unchanged):
//   apiLandings:       '/api/offers/landings'          GET list (signed in), POST create or update one
//   apiLandingArchive: '/api/offers/landings/archive'  POST { id, archived: boolean }
//   landingPage:       '/offers/landing-:slug.html'    GET, public (also served without ".html")
// STORES gains: landings: 'offer-landings'   ('-test' on every non-production deploy, storeName rule)
// Offer typedef gains: @property {string|null} landing   slug of its landing page (1.4.0); absent on older offers, read as null
// OFFER_KEYS: 'landing' added right after 'buttonUrl'.  PUBLIC_OFFER_KEYS: 'landing' added.
// emptyOffer(): landing: null.   publicPayload(): landing is null when absent, never "".

export const LANDING = Object.freeze({
  statuses: Object.freeze(['draft', 'live', 'archived']),
  pathPrefix: '/offers/',
  filePrefix: 'landing-',
  fileSuffix: '.html',
  // slug rules are the offer link rules: SLUG_PATTERN, SLUG_MIN (3), SLUG_MAX (60)
  // text limits equal the offer popup limits in lib/offers-rules.mjs (name, eyebrow,
  // headline, body); ctaLabel 40; ctaUrl 500. 4.1 copies the real numbers in.
  ctaLabelMax: 40,
  ctaUrlMax: 500,
  historyKeep: HISTORY_KEEP
});
export const LANDING_KEYS = Object.freeze([
  'id', 'name', 'slug', 'eyebrow', 'headline', 'body', 'image', 'ctaLabel', 'ctaUrl',
  'status', 'previewKey', 'createdAt', 'updatedAt', 'archivedAt'
]);
// image has the 1.3.0 OfferImage shape (id, alt, placement, width, height, type, bytes);
// landing pages use placement 'top' only.

export const LANDING_EXPIRED = Object.freeze({
  text: 'This offer is no longer available. However you can contact Your AV Department to find out what current offers are available.',
  buttonLabel: 'Contact Your AV Department',
  buttonUrl: 'https://calendar.app.google/Do7aNUGLhraagUKV6',
  email: 'michaelh@youravdept.com'
});

export const landingPath = (slug) => `/offers/landing-${slug}.html`;
/** the slug in "/offers/landing-<slug>.html" or "/offers/landing-<slug>", else null (case-insensitive, trailing slash ok) */
export function landingSlugFromPath(path) {}

/**
 * Worked out, never stored. Offers are the landing's linked offers (offer.landing === slug).
 *   archived                       -> 'archived'
 *   status draft                   -> 'draft'
 *   live, no linked non-draft offer -> 'running'
 *   live, linked non-draft offers  -> now < earliest startsAt  -> 'before'
 *                                     now > latest endsAt      -> 'expired'
 *                                     otherwise                -> 'running'   (a gap between two offers stays public)
 */
export function landingState(landing, offers, now = new Date()) {}

export const LANDING_MESSAGES = Object.freeze({
  slugTaken: 'That address is already used by another landing page.',
  gone: 'That landing page no longer exists.',
  formOn: 'Turn the form off to link a landing page, or remove the landing page from this offer.',
  archivedLink: 'That landing page is archived. Restore it or pick another.',
  ctaUrl: 'Use a web address (https://...) or a page on this site (/page).',
  alt: 'Describe the picture in a few words (up to 125 characters).'
});

// Blob record, store "offer-landings": key "all" = JSON array of landing records (LANDING_KEYS);
// key "history/<time>-<9-digit change number>" = the array as it was before each change (newest 20 kept),
// the same layout and safe-write steps as the offers store.
```

Rules written once here so sessions agree:
- A saved offer with `landing` set must have `form.enabled === false`; its popup button is the landing link (`landingPath(slug)`), and `buttonUrl` is ignored for it (Decision 1).
- An offer cannot link to a missing or archived landing page. Archiving a page linked to a running or upcoming offer is allowed: the page expires at once (scope), and the popup keeps pointing at it.
- The expiration popup applies in states `expired` and `archived` only. In `before` the visitor is sent to `/` with a 302. In `draft` the page shows only with a valid preview key.
- A landing slug is locked once the page has been Live (status ever not draft). Changing it later would break links.

## Sessions

### Session 4.1: Freeze the contract
- Compartment: API · Depends on: nothing · Goal: shared/offer-contract.js bumped to 1.4.0 exactly as above, with its helpers and tests, and the existing suite still green.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability and scalability (one agreed shape before any code); security (link-scheme and key lists defined before any endpoint exists).
- Files modified: shared/offer-contract.js (this session only). Created: netlify/tests/offer-contract-landings.test.mjs; new ai/CONTEXT.md (old one archived).
- Tasks:
  - [ ] Verify the "Found" items against the code (SKIP_PREFIXES, publicPayload, usedImageIds, route paths free) and list any correction.
  - [ ] Apply the contract above; copy the real offer text limits from lib/offers-rules.mjs into the notes. Keep the earlier header comments and add a 1.4.0 line.
  - [ ] Special-case `landing` in publicPayload(): null when absent.
  - [ ] Fix any existing test that counts payload or offer keys (offer-edge, offers-rules, offer-format, offer-contract-images), and say which.
  - [ ] Tests: old offer gives landing null; landingPath and landingSlugFromPath round trip and refuse path tricks ("..", "//", encoded slashes, uppercase is folded); landingState for every row in the table (including a gap between two offers, draft offers ignored, no linked offers, archived beats everything); constants as written.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-contract-landings.test.mjs` passes (output pasted), and each existing test file passes by path: offer-edge, offer-format, offer-contract-images, offers-auth, offers-rules, site-admin (offers-stats "twenty parallel views" may still fail, pre-existing).
- Needs my eyes: the corrections list, if any.
- Risk and fallback: a hidden consumer of OFFER_KEYS order. The failing test names it; fix the test, never the contract.
- Backup point: yes, before this session: `git tag pre-landings-20261123`.
- After this session: CLEAR. The next session is a different area (pure validation code).

### Session 4.2: Landing rules (pure)
- Compartment: LOGIC · Depends on: 4.1 · Goal: a pure library that checks and cleans one landing record and says what is wrong, in plain words.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (text is plain, no stored HTML, call to action scheme checked, slug pattern); stability (every refusal is a field message, never a crash).
- Files created: netlify/functions/lib/landings-rules.mjs, netlify/tests/landings-rules.test.mjs.
- Tasks:
  - [ ] prepareLanding(input, { landings, now, images }): same shape as prepareOffer. Cleans name, eyebrow, headline, body (reuse plainText and the offer-format tags), slug, ctaLabel, ctaUrl (https:// or same-site path; reuse cleanButtonUrl's rules), image (alt required, placement forced to 'top', facts from `images` map only), status transitions (draft to live, live to archived, archived to live).
  - [ ] Required to go Live: name, slug, headline, body, ctaLabel, ctaUrl. A draft may be incomplete except name and slug.
  - [ ] Slug unique among landings (case-insensitive); locked once the page has been Live.
  - [ ] Stale edit refused (id plus the updatedAt it was loaded with), as offers do.
  - [ ] Tests: each field's limit and refusal, `javascript:` and `//host` and `data:` links refused, a tag in the headline is stripped, slug clash, slug lock, missing image gives "gone", alt required with a picture, status transitions, stale edit.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landings-rules.test.mjs` passes (output pasted), run three times in a row.
- Needs my eyes: nothing.
- Risk and fallback: drift from offers-rules behaviour. Each case copies the matching offers-rules test; a mismatch is fixed in the new file, never in offers-rules.
- Backup point: no.
- After this session: CLEAR. Next is storage, unrelated.

### Session 4.3: The landing store
- Compartment: DATA · Depends on: 4.1 · Goal: read and change landing records in the "offer-landings" Blobs store with the same safe-write steps as offers.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: stability (no lost update, a copy of the previous version before every change, test deploys never touch live data); scalability (one array, key "all", sized for about 50 a year).
- Files created: netlify/functions/lib/landings-store.mjs, netlify/tests/landings-store.test.mjs. offers-store.mjs is not edited (its steps are copied, not shared).
- Tasks:
  - [ ] landingsStore(deployContext) with a test factory (_setLandingsStoreFactoryForTests), strong consistency, name via storeName(STORES.landings, ctx).
  - [ ] loadLandings(store), changeLandings(store, change, { action, landingId }) with ETag, history write first, `onlyIfMatch`, 3 tries, trim to 20, change number in metadata.
  - [ ] listLandingHistory, restoreLandingHistory (so a bad edit can be undone later).
  - [ ] LandingStoreError with a status.
  - [ ] Tests with an in-memory store: round trip, history written before the new array, two parallel saves cannot overwrite each other (prove it is real by removing the condition and watching it fail), non-array stored value refuses every write, storage throwing becomes the error.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landings-store.test.mjs` passes (output pasted), run three times in a row.
- Needs my eyes: nothing.
- Risk and fallback: the "twenty parallel views" failure on this PC (open item 1) is the same pattern. If the parallel test fails here the same way, stop (three strikes) and report: it means the in-memory store, not the code, needs the fix, and Phase 2 needs it too.
- Backup point: no.
- After this session: CONTINUE. 4.4 imports exactly what 4.2 and 4.3 wrote.

### Session 4.4: Landing admin routes
- Compartment: API · Depends on: 4.2, 4.3 · Goal: signed-in routes to list, create, update, archive and restore landing pages.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (requireAdmin on every route, body size cap, same-origin, picture facts from the store); stability (clean JSON errors, nothing half saved).
- Files created: netlify/functions/landings.mjs (GET list, POST save), netlify/functions/landings-archive.mjs, netlify/tests/landings-routes.test.mjs. Routes set inline in each function's config.
- Tasks:
  - [ ] GET returns each landing plus its worked-out state and the slugs of the offers that link to it (read from the offers store; unreadable offers store gives an empty list and a note, never a failure).
  - [ ] POST: look up the one wanted picture before changeLandings (same as offers.mjs lookUpWantedImage), then prepareLanding; 201 on create with the preview path, 200 on update; 400 field messages, 404 gone, 409 stale or clash, 503 storage.
  - [ ] Archive route: sets archived or restores to live, writes history.
  - [ ] Responses go through json() (no-store, noindex).
  - [ ] Tests: signed out 401 on every route (remove the check and watch the test fail), create, update, stale 409, slug clash 409, archive and restore, picture missing gives the gone message, storage failure 503, offers store unreadable still lists.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landings-routes.test.mjs` passes (output pasted).
- Needs my eyes: nothing.
- Risk and fallback: none beyond 4.3. Test every route with an in-memory store only.
- Backup point: no.
- After this session: CLEAR. Heavy test output; next is the cleanup risk.

### Session 4.5: Cleanup protects landing pictures
- Compartment: DATA · Depends on: 4.3 · Goal: picture cleanup never deletes a picture that a landing page or one of its last 20 saved versions uses.
- Size: M · My time: ~5 min · Confidence: High (the pattern exists; the danger is real, so every doubt means delete nothing)
- Objectives: stability (the one place in this phase that can lose data); security (no new deletion path).
- Files modified: netlify/functions/lib/offer-images-cleanup.mjs. Created: netlify/tests/landings-cleanup.test.mjs. Existing offer-images-cleanup.test.mjs must still pass untouched.
- Tasks:
  - [ ] usedImageIds(offersStore, landingsStore): add every landing's picture and the newest 20 landing versions' pictures. A landing store that cannot be read, or a version in an odd shape, throws, so nothing is deleted.
  - [ ] cleanupImages gets the landings store as a new argument; every caller passes it (offers.mjs passes it in 4.6; landings.mjs passes it now). A caller that omits it deletes NOTHING and logs why (fail safe).
  - [ ] Run cleanup after a successful landing save too (best effort, same wrapper).
  - [ ] Tests: a picture used only by a landing page past 24 hours survives an offer save; used only by a landing version survives; used by nothing is removed after 24 hours; landing store unreadable deletes nothing; omitted landings store deletes nothing; existing offer cleanup cases unchanged.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landings-cleanup.test.mjs` and `netlify/tests/offer-images-cleanup.test.mjs` both pass (output pasted); a test with the landing check removed fails.
- Needs my eyes: nothing.
- Risk and fallback: a caller that forgets the new argument. The fail-safe default above makes that harmless; the test proves it.
- Backup point: yes: `git tag pre-landings-record` before this session (it edits the one file that deletes data).
- After this session: CLEAR. Next is the offer rules, a different area.

### Session 4.6: Offers link to a landing page
- Compartment: LOGIC · Depends on: 4.1, 4.3, 4.5 · Goal: an offer can carry a landing page; the popup button goes to it; the rules in the contract hold.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: stability (old offers unchanged); user experience (the popup button just works); security (the link is built from a checked slug, never typed text).
- Files modified: netlify/functions/lib/offers-rules.mjs, netlify/functions/offers.mjs, assets/offer-panel.js (button destination only), netlify/tests as needed. Created: netlify/tests/offers-landing-link.test.mjs.
- Tasks:
  - [x] prepareOffer: `landing` accepted (null or an existing, non-archived slug); form must be off when set (LANDING_MESSAGES.formOn); `buttonUrl` is set from landingPath(slug) when linked. offers.mjs looks the landing up before changeOffers (same pattern as pictures) and passes it in ctx.
  - [x] The popup button goes to landingPath(offer.landing) when present; no landing means today's behaviour exactly.
  - [x] cleanupImages call in offers.mjs passes the landings store (4.5).
  - [x] Signature (code wins, set in 4.5): `cleanupImages(imagesStore, offersStore, now, landingsStore)`, so offers.mjs calls `cleanupImages(imagesStore(deployContext), store, new Date(), landingsStore(deployContext))`. Then remove the `todo` option from the two Session 4.6 tests at the end of netlify/tests/landings-cleanup.test.mjs; both must pass. Until then an offer save still deletes a landing-only picture over 24 hours old (proved by the first of those two tests).
  - [x] Tests: old offers come back as stored (landing null); link to missing, archived, or with form on is refused with the exact messages; popup markup for a linked offer shows the link; popup markup for an unlinked offer is byte-identical to before.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offers-landing-link.test.mjs` passes, plus offers-rules, offers-image-save, offer-panel-image and offer-edge test files by path (output pasted).
- Needs my eyes: nothing.
- Risk and fallback: editing offer-panel.js, which every popup uses. The unlinked-popup byte-identical test is the guard; if it fails, revert the panel change and put the link in buttonUrl only (the server already sets it).
- Backup point: no.
- After this session: CLEAR. Next is the export, a different file.

### Session 4.7: Export includes landing pages
- Compartment: API · Depends on: 4.3, 4.6 · Goal: Export holds the landing records and their pictures in the same size-limited parts.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability (a disaster restore keeps landing pages); efficiency (pictures counted once, parts stay under 4.5 MB).
- Files modified: netlify/functions/offers-export.mjs; existing offers-export test updated for the new key. Created: netlify/tests/landings-export.test.mjs.
- Tasks:
  - [x] Add `landings: [...]` to part 1 (records, preview keys included, same privacy note). Pictures used by landings join the same ordered, packed list (offers first, then landings), each picture once.
  - [x] An unreadable landing store never fails the export: the file says `landingsMissing: true` and carries a plain note.
  - [x] Tests: export holds both kinds, a shared picture appears once, parts still split correctly when landing pictures push past the limit, unreadable landing store still exports the offers.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landings-export.test.mjs netlify/tests/offers-export.test.mjs` passes (run each by path; output pasted).
- Needs my eyes: nothing.
- Risk and fallback: part-splitting maths. The existing "eight 590 KB pictures" test is extended, not replaced.
- Backup point: no.
- After this session: CLEAR. Next is the page itself.

### Session 4.8: The landing page renderer
- Compartment: UI · Depends on: 4.1 · Goal: a pure function that turns one landing record and its state into the complete page HTML, in the brand template, safe by construction.
- Size: L · My time: ~5 min · Confidence: Low (this is the visual design; the structure is easy, the look is judged by eye at 4.10)
- Objectives: security (every value escaped, CSP, nosniff, noindex, no stored HTML); user experience (Polished, phone first); accessibility (one H1, alt text, contrast, focus); efficiency (one small file, fonts as on the other pages).
- Files created: shared/landing-template.js (pure, no Node-only code, no secrets: the function, the Node tests and the admin preview all import it; shared/ is published on purpose, like offer-contract.js), netlify/tests/landing-render.test.mjs.
- Tasks:
  - [ ] Read booth-proof.html (standalone page: no header or footer, Montserrat 700/800 and Inter) and copy its `:root` brand tokens, font loading and analytics tag exactly. State in the session summary which tag was found.
  - [ ] renderLanding(landing, { state, isPreview }) returns { html, headers } (the function applies the headers; the browser preview uses only html). Layout top to bottom: logo with URL, eyebrow, H1 headline, hero picture (full width, alt), copy (offer-format tags only), the call to action button (teal, navy text, hidden in states expired and archived), footer (business name, michaelh@youravdept.com, youravdept.com).
  - [ ] Headers: `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, a Content-Security-Policy that allows only self scripts, the analytics tag host and the font hosts, `Cache-Control` short (60 s) for live, `no-store` for preview.
  - [ ] For states expired and archived the HTML carries the expiration data block (LANDING_EXPIRED) and the two asset tags added in 4.10; before 4.10 the tags point at files that 4.10 creates.
  - [ ] Tests: every field escaped (a headline of `<script>` renders as text), a long headline and body wrap, no picture still renders, CTA hidden when expired, exactly one H1, alt present, noindex both as header and meta, CTA scheme re-checked at render (defence in depth), output identical on two runs.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landing-render.test.mjs` passes (output pasted); one rendered sample page is saved in ai/review/4.8/ for 4.10.
- Needs my eyes: nothing yet (you look at the real thing in the 4.10 review).
- Risk and fallback: the look misses. A Low-confidence L, so the first rendered sample is shown at 4.10 and any follow-up becomes 4.8b from the reserve.
- Backup point: no.
- After this session: CONTINUE. 4.9 serves exactly what this renders.

### Session 4.9: Serve the pages and keep popups off them
- Compartment: API · Depends on: 4.3, 4.8 · Goal: GET /offers/landing-<slug>.html serves the right page, redirect or popup for each state, and nothing else on the site changes.
- Size: M · My time: ~5 min · Confidence: High on code, Low on one platform fact (below)
- Objectives: stability (storage trouble sends visitors to the normal site, never an error page); security (preview key compared safely, drafts invisible); efficiency (one cached read per store, 60 s, like the edge functions).
- Files created: netlify/functions/offer-landing.mjs, netlify/tests/landing-serve.test.mjs. Modified: netlify/edge-lib/offer-edge.js (`/offers/` into SKIP_PREFIXES), netlify/edge-functions/offer-page.js and page-takedown.js (`/offers/*` into excludedPath), netlify.toml (header rule for `/offers/*`: X-Robots-Tag noindex; and, if 4.9 shows it is needed, the forced rewrite named under Fallback).
- Tasks:
  - [ ] Route: `config.path` for `/offers/*`, GET and HEAD only. Path through landingSlugFromPath; anything else under /offers/ is a 404 (no-store, noindex).
  - [ ] Read landings and offers (cached 60 s per instance, strong reads, the offer-edge createOfferSource pattern); decide with landingState: running gives the page; expired and archived give the page with the expiration data; before gives 302 to `/` with no-store; draft gives the page only with a valid `?preview=<key>`, otherwise 302 to `/`; unknown slug gives 302 to `/`.
  - [ ] Landing store unreadable and nothing cached: 302 to `/` (quiet). Offers store unreadable: show the page as running without the expiration popup.
  - [ ] Test switch: `x-yavd-test-store-fail: 1` on non-production deploys forces the storage failure (same helper as the edge).
  - [ ] Diagnostic header `x-yavd-landing`: running, expired, archived, before, draft, preview, unknown, store-failed (same idea as x-yavd-offer).
  - [ ] Tests: each state, with and without the `.html`, uppercase and trailing slash, preview key right and wrong, store failure, the popup edge function and takedown function skip /offers/ paths (test the skip list directly), HEAD works.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landing-serve.test.mjs` passes (output pasted), plus offer-edge.test.mjs by path.
- Needs my eyes: nothing.
- Risk and fallback: Netlify must route `/offers/*` to the function (custom `config.path`, as every other route here does) and no static file sits at that path (none does). If TEST (Session 4.15) shows the function does not win, the fallback is a forced rewrite in netlify.toml (`/offers/*` to the function, status 200, `force = true`), the same way `/ai/*` is already locked. Both are small and listed here so 4.15 never has to stop for a decision.
- Backup point: no.
- After this session: CLEAR. Next is browser-side popup code, a different area.

### Session 4.10: The expiration popup and the review page
- Compartment: UI · Depends on: 4.8, 4.9 · Goal: the site standard expiration popup opens over an expired or archived landing page, and a one-screen-at-a-time review page lets Michael judge the look.
- Size: M · My time: ~10 min (the review) · Confidence: High
- Objectives: accessibility (focus trapped while open, Escape and close button, announced by screen readers, returns focus on close); user experience (readable on a phone, never covers the page for good); security (text from the contract constant, set with textContent).
- Files created: assets/landing-expired.js and assets/landing-expired.css (separate from the offer popup, no shared code), netlify/tests/landing-expired.test.mjs (Playwright), ai/review/4.10/ (screenshots and the review page).
- Tasks:
  - [ ] The script reads the expiration data block, builds the dialog (the exact LANDING_EXPIRED.text, the Contact button to buttonUrl, the email beneath), opens on load after about 600 ms, closes on button, Escape and backdrop, returns focus.
  - [ ] No popup on running, before or draft pages; no offer popup on any landing page.
  - [ ] Playwright (served as in Sessions 1.6 and 3.8): running page, expired page, archived page, phone and computer widths, long headline, no picture, keyboard only, reduced motion.
  - [ ] Build the review page as one self-contained HTML page: one screen at a time, Back and Next buttons, arrow keys, a row of dots, scaled to the window (running desktop, running phone, expired desktop, expired phone, no-picture, long-headline). Publish it as an artifact and also keep ai/review/4.10/index.html.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/landing-expired.test.mjs` passes (output pasted); the review page exists and opens.
- Needs my eyes: the review page, 6 screens. Look at the headline size, the picture crop, the button, the popup wording. Ask Andy to brand-check the first sample page too (colors, fonts, logo, contact details).
- Risk and fallback: the look needs changes. That becomes 4.8b or 4.10b from the reserve.
- Backup point: no.
- After this session: APPROVE. Michael reviews the screens and says go or says what to change.

### Session 4.11: The Landing Pages list in the admin
- Compartment: UI · Depends on: 4.4, 4.10 · Goal: a Landing Pages screen in /offer-admin where Michael finds, opens, archives and restores pages.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: user experience (find a page in seconds, status and linked offers visible); stability (list failure shows a plain message and the offers dashboard still works).
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css (a "Landing pages" block with its own markers; final load() call stays last). Created: netlify/tests/offer-admin-landings-list.test.mjs (Playwright with real handlers and in-memory Blobs, as 3.9 did).
- Tasks:
  - [ ] A "Landing pages" button in the admin top area opens the list view (`show('landings')`). Rows: name, full address (`/offers/landing-x.html`), status (Draft, Live, Expired, Archived, worked out with landingState and the server clock), the linked offers' names, last edited.
  - [ ] Search by name or address; filter by status; Copy link, Preview (draft and live), Edit, Archive, Restore on each row. Archive asks first, naming the linked offers that will lose their page.
  - [ ] **+ New Landing Page** button here too (opens the window built in 4.12).
  - [ ] Tests: list renders, search and filter, archive and restore round trip, archive confirmation names linked offers, list failure message, dashboard still loads.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-landings-list.test.mjs` passes (output pasted); screenshots in ai/review/4.11/.
- Needs my eyes: nothing yet (you see it with the window at 4.15).
- Risk and fallback: offer-admin.js size. Keep the block self-contained; if a conflict with the editor state appears, stop and log.
- Backup point: no.
- After this session: CONTINUE. 4.12 builds the window the New and Edit buttons open.

### Session 4.12: The New and Edit window (fields and save)
- Compartment: UI · Depends on: 4.4, 4.11 · Goal: **+ New Landing Page** opens a window where Michael types the page name, address, headline, eyebrow, copy, button label and button link, saves a draft, publishes it, and edits it later.
- Size: L · My time: ~5 min · Confidence: High
- Objectives: user experience (plain messages, counters, nothing lost on a failed save, address suggested from the name); stability (unsaved-change guard like the offer editor); security (all checks repeat on the server).
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css. Created: netlify/tests/offer-admin-landings-window.test.mjs (Playwright).
- Tasks:
  - [ ] A modal dialog (not a browser tab): focus trapped, Escape and Cancel with the unsaved-change prompt, works on a phone.
  - [ ] Fields as in the contract; slug suggested from the name, editable until the page has been Live, then read-only with a short reason.
  - [ ] Save draft, Publish (Live), and Save changes; server field messages shown next to each field (showErrors pattern); a stale edit shows the same "reload" banner the offer editor uses.
  - [ ] Pre-publish check before Publish: required fields filled, call to action link well formed (client check; the server repeats it); a plain checklist of what is missing.
  - [ ] Preview link shown after the first save (`/offers/landing-x.html?preview=<key>`) with Copy.
  - [ ] Tests: create, edit, slug lock, field errors, cancel with and without changes, stale edit, phone width.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-landings-window.test.mjs` passes (output pasted).
- Needs my eyes: nothing yet.
- Risk and fallback: none beyond 4.11.
- Backup point: no.
- After this session: CONTINUE. 4.13 adds the picture and the live preview to this same window state.

### Session 4.13: Image drop and live preview
- Compartment: UI · Depends on: 4.12 · Goal: drop a picture into the window, see it shrunk and stored, and watch a live preview of the page as it will look.
- Size: M · My time: ~5 min · Confidence: High (the shrink and upload code exists from Phase 3)
- Objectives: user experience (drag and drop and a choose-file button, plain errors); security (the browser shrink is a convenience, the server decides everything); efficiency (the picture is shrunk before upload).
- Files modified: assets/offer-admin.js, assets/offer-admin.css, offer-admin.html. Created: netlify/tests/offer-admin-landings-image.test.mjs.
- Tasks:
  - [ ] Reuse pickPicture, shrinkPicture and uploadPicture from Phase 3 (do not copy them; call them). Picture block in the window: drop area, thumbnail, alt text (required, 125), Replace and Remove.
  - [ ] Live preview: an iframe, sandbox with no scripts, `srcdoc` built from renderLanding (imported from /shared/landing-template.js, published). Desktop and Phone width toggle. The unsaved picture reaches the preview as a blob: or data: address (Session 3.9 proved this works).
  - [ ] Tests: add, replace, remove, alt required, wrong type refused with the Phase 3 message, preview matches the saved page for the same record (compare the render output), phone toggle.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-landings-image.test.mjs` passes (output pasted); screenshots in ai/review/4.13/.
- Needs my eyes: nothing yet.
- Risk and fallback: the iframe preview differs from the served page. The test compares the preview HTML with the server render for the same record; a difference is a bug in the shared template, fixed there.
- Backup point: no.
- After this session: CLEAR. Heavy Playwright output; next is the offer editor.

### Session 4.14: The offer editor: find or create the landing page
- Compartment: UI · Depends on: 4.6, 4.11, 4.12 · Goal: under Where and who, the offer editor gets step 1 (find or create the landing page) and the popup connects to it.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: user experience (the three-step order Michael asked for); stability (an offer with no landing page works exactly as before; nothing lost on a failed save).
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css. Created: netlify/tests/offer-admin-landings-offer.test.mjs.
- Tasks:
  - [ ] Where and who gets "Landing page": a list of non-archived landing pages (name and address), a "None" choice, and **+ New Landing Page** (opens the 4.12 window; on save the new page is selected). Default for a new offer: prompts to choose or create one; saving without one is still allowed (scope: no landing page works as today).
  - [ ] Choosing a landing page turns the form off, hides the form fields with a one-line reason and the link-button label, and shows the address the popup will open. Removing the landing page restores the form controls.
  - [ ] The live preview shows the popup's button as a link when a landing page is chosen.
  - [ ] Server messages from 4.6 shown at the right field.
  - [ ] Rerun copies the landing link.
  - [ ] Tests: step 1 order, create from inside the editor, choose, remove, form toggling, archived page not offered, rerun keeps the link, offers with no landing page behave as before.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/offer-admin-landings-offer.test.mjs` passes, plus offer-admin-image.test.mjs by path (output pasted).
- Needs my eyes: nothing yet.
- Risk and fallback: the existing editor state. offer-admin-image.test.mjs must still pass untouched.
- Backup point: no.
- After this session: CLEAR. Next is deploy tooling.

### Session 4.15: TEST deploy and verification
- Compartment: INFRA · Depends on: 4.1 to 4.14 · Goal: the whole feature runs on the TEST address and a script proves it.
- Size: L · My time: ~25 min · Confidence: High (rehearsed locally first)
- Objectives: stability (live data never touched; storage failure paths proven); security (signed-out refusals, drafts hidden, headers); efficiency (one command).
- Files created in Claude outputs/ (git-ignored): session-4.15-verify.ps1 and a helper, modelled on session-3.11-verify.ps1. No app code.
- Tasks:
  - [ ] Script: guard (clean tree, nothing behind GitHub), deploy-preview.ps1, sign-in from the clipboard (cleared first, never printed), create TEST landings through the admin routes (one running, one expired through a linked past offer, one archived, one draft), then check: running page 200 with CTA; expired and archived 200 with the popup data and no CTA; before 302 to `/`; draft 302 without key and 200 with it; unknown slug 302; headers (noindex, nosniff, CSP); picture loads signed out; no offer popup on a landing page; `/offers/landing-x` without `.html`; storage-off switch gives the quiet redirect; other site pages byte-identical; contract 1.4.0; signed-out refusals on every new route; Export holds landings and pictures; cleanup does not remove a landing picture after a forced old upload time.
  - [ ] `-Rehearse http://localhost:<port>` runs the whole script against a local stand-in first, inside this session.
  - [ ] Print the TEST links for the look.
- Inputs needed from Michael: TEST deploy and the script run (copy your admin password when it says so).
- DONE WHEN: the rehearsal verdict reads every line PASS (output pasted); then on TEST the real verdict reads every line PASS.
- Needs my eyes: the look, each in a NEW private window, on your computer AND your phone: a running page, an expired page with its popup, the admin list, the New window with the image drop, an offer linked to a landing page and its popup button.
- Risk and fallback: the platform route question (Session 4.9 Risk). The script's first check proves it before anything else; a failure there applies the forced rewrite and redeploys (no stop).
- Backup point: yes: `git tag pre-landings-test-<time>`.
- After this session: APPROVE. You deploy to TEST, run the script, look, paste the verdict and say go.

### Session 4.16: Go live and close the phase
- Compartment: INFRA · Depends on: 4.15 · Goal: landing pages are live on youravdept.com, nothing else changed, and the phase is closed.
- Size: L · My time: ~25 min · Confidence: High
- Objectives: stability (backups before and after; existing offers and pages untouched); security (signed-out refusals checked live).
- Files created in Claude outputs/: session-4.16-golive.ps1 and a helper (modelled on session-3.12-golive.ps1). No app code.
- Tasks:
  - [ ] Script: guard, sign-in from the clipboard, BEFORE snapshot and Export backup, tag, deploy.ps1, read-only live checks (contract 1.4.0, `/offers/landing-x.html` for an unknown slug redirects to `/`, signed-out refusals, existing pages byte-identical, existing offers identical before and after, store "offer-landings" reachable), verdict. `-Rehearse` first.
  - [ ] You create your first real landing page and link a draft offer to it (the script writes nothing on live).
  - [ ] Close: verify every criterion in the scope's section 12 with real output; compare estimates with actuals in ai/archive; curate BUILD_NOTES and refresh the MAP; check the frozen contract for drift; one line on each of the five objectives; write CONTEXT.md as a handoff; say exactly what to back up and the file name; say what is next and ask whether to make the Build Document for the next phase.
- Inputs needed from Michael: your go, and the content of your first real landing page (picture, headline, copy, button).
- DONE WHEN: live verdict every line PASS; scope criteria all PASS with output pasted.
- Needs my eyes: your first real page on the live site, computer and phone.
- Risk and fallback: a problem on the live site. Archive the page (it then shows the expiration popup) or set the offer to draft, or redeploy the previous production deploy in Netlify. Stored landing records and pictures are harmless.
- Backup point: yes: live export plus `git tag pre-landings-live-<time>`, and your own Export after the first real page.
- After this session: phase done, stop and notify.

## Phase summary
- Sessions: 16 planned (S 2, M 10, L 4; the two L deploy sessions are deliberate, per the Phase 3 calibration). Reserve: 4.8b, 4.10b, 4.13b, 4.15b (4 slots = +25%, between the +20% calibration and the +35% rule; four are held because the look at 4.10 is the one judgment call).
- My attention: about 65 minutes: the 4.10 review about 10, 4.15 about 25, 4.16 about 25, three backup tags about 2 each. No stop is longer than 25 minutes.
- Most likely to overrun: 4.8 (Low-confidence L, the page look) and 4.15 (first touch of TEST).
- The only Low-confidence L is 4.8. Its first rendered sample reaches you at 4.10, before any admin work is built on it, so a miss costs 4.8b and nothing downstream.
- Calibration used: Phase 3 ran 13 sessions against 12 planned, about 6.3 hours of build, and about 65 minutes of your time against 105 planned. Sizes held except the two live-contact sessions (M planned, L actual); here both are planned as L. Your time is estimated at x1.0.
- Carried items: Phase 3 open item 1 ("twenty parallel views" test) is met by 4.3 (same pattern); if it fails there, the stop is the fix and Phase 2 benefits. Items 2 to 5 stay in the backlog, none block.
- Five objectives:
  - Security: server-checked admin routes, no stored HTML, link-scheme allow list, preview keys private, CSP and nosniff on pages, no new dependency.
  - Stability: cleanup fail-safe (4.5), history on every save, Export holds landings, storage trouble sends visitors to the normal site, archive reversible.
  - Efficiency: one cached read per store per page view, one small page, pictures shrunk before upload.
  - User experience: three-step order, plain messages, live preview, phone first, Polished page.
  - Scalability: one array and one blob per picture, no cap, sized for about 50 pages a year.
- Backup points: before 4.1 (`pre-landings-20261123`), before 4.5 (`pre-landings-record`), before 4.15 (`pre-landings-test-<time>`), before 4.16 (live export plus tag), after your first real page (Export).
- Stops and clears: APPROVE after 4.10 (your look) and after 4.15 (TEST, verify, look, go). CONTINUE after 4.3, 4.8, 4.11 and 4.12. CLEAR after 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.9, 4.13 and 4.14. 4.16 ends the phase.

## Decisions and assumptions made in this plan (reversible; say so if you object)
1. A landing page link and a form cannot share one popup. An offer with a landing page has its form turned off, and the popup button opens the page. The landing page's own call to action is a link, so a lead form would live behind that link (for example your existing form pages). This keeps the popup simple and matches your process. If you want popups that keep their form and add a "See the full offer" link, say so now: it changes 4.6 and 4.14 only.
2. Landing pages are public from the earliest start to the latest end of their non-draft linked offers; a gap between two offers stays public. A page linked only to draft offers, or to none, is public while Live.
3. A page starts as a draft. Publishing is its own button; the offer's schedule then decides when it is public.
4. The slug is locked once a page has been Live.
5. Views and clicks per landing page are cut from this phase (scope "should have, can be cut"). They would reuse the same save pattern as the offers stats that currently fail one test; Phase 2 (Key Actions Dashboard) counts views already. Logged as backlog with Phase 2 as its home.
6. Duplicate-a-page is cut for the same reason (nice to have). Rerun on an offer keeps its landing link.
7. The page template lives in shared/landing-template.js from the start so the admin preview and the server use the same code. It is public and holds nothing private.
8. Landing pages use one picture, placement top, 1600 px longest side after the browser shrink (the Phase 3 limits).
9. No existing page, popup look or the offers form is changed except the popup's button destination (4.6).
