# Phase 2: Key Actions Dashboard (youravdept.com/activity)
Status: PLANNED 2026-10-13 from the approved scope ai/spec/key-actions-scope.md. Not started.

## What shapes this plan
- Read: the scope, ai/CONTEXT.md and ai/DECISIONS.md (Offers Module, Phase 1 closed and live), the code in netlify/functions (offers-stats.mjs, submission-created.mjs, just-the-audio-count.mjs and -stats.mjs, site-admin.mjs), admin.html and the pages to be counted.
- Found: offer counts already use conditional writes, one record per offer (offer-stats), and Just the Audio already counts itself, so neither gets new counting. Every page to count is self-contained in this folder; none is generated elsewhere. Google Analytics is not installed (Bob's track, not this phase).
- This repo has no DIRECTIVES.md or DECLARATIONS.md; the Parameters and Hard limits below stand in for them, as in Phase 1.

## Parameters
- Scale horizon: up to a few thousand counted actions a day; years of history; one viewer.
- Data sensitivity: daily counts only. No IP, cookie, name or email is stored by this phase.
- UX tier: Functional (matches /admin and /site-map), brand navy and teal on the numbers.
- Accessibility: readable contrast, keyboard usable, every number also given as text.
- Platforms: desktop and phone web.
- Telemetry: this phase is the telemetry. GA4 deferred to Bob.
- Recovery: Export button (JSON of every day record) plus Netlify Blobs durability. Losing it loses history, never leads.
- Compliance: none. No cookies, no personal data, so no consent banner.

## Hard limits: stop and ask
- Editing any existing page beyond adding the one script tag (and data attributes on the buttons being counted) listed in Session 2.4.
- Any change to submission-created.mjs beyond the single wrapped counting call in Session 2.3 (approved 2026-10-13).
- Any change to a frozen contract (shared/activity-contract.js after 2.1, shared/offer-contract.js at any time).
- Any new dependency.
- Any secret in the repo, a log or a page.
- Deleting or rewriting stored data (offers, offer-stats, just-the-audio-usage, site-activity on the live store).
- Any publish to the live site before Session 2.8, and then only after Michael says go.

## Frozen contracts (written and frozen in Session 2.1 as shared/activity-contract.js)

```js
export const ACTIVITY_CONTRACT_VERSION = '1.0.0';

export const ROUTES = Object.freeze({
  count:   '/api/activity/count',   // public POST {e, p?, s?}  -> 204
  report:  '/api/activity',         // GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (signed in)
  export:  '/api/activity/export',  // GET all day records as one JSON file (signed in)
  page:    '/activity'              // static page, no data without sign-in
});

export const STORE = 'site-activity';            // '-test' on every non-production deploy (storeName rule)
export const dayKey = (day) => `day/${day}`;     // day = YYYY-MM-DD, Eastern
// value: { "<event>": count, ... }  whole numbers only

// Counted pages (canonical paths, normalizePagePath form)
export const PAGES = Object.freeze([
  '/index.html', '/booth-proof.html', '/booth-proof-dates.html', '/booth-proof-apply.html',
  '/library/index.html', '/library/the-levers-of-labor.html', '/library/av365.html',
  '/library/12-av-concessions.html', '/michaelh.html', '/trishah.html',
  '/how-we-get-paid.html', '/fix-my-av-budget.html', '/show-info.html'
]);

// Event names. Anything else is refused.
//   visit:<page>                 a counted page was viewed
//   src:<page>:<bucket>          where that visit came from
//   card:<who>:scan|vcf|call|email    who = michaelh | trishah
//   click:dates-cta              "Check my show dates" on /booth-proof
//   form:<form-name>             a Netlify form submission (server side only)
export const SOURCES = Object.freeze(['linkedin', 'search', 'email', 'site', 'direct']);
export const CARD_WHO = Object.freeze(['michaelh', 'trishah']);
export const CARD_ACTIONS = Object.freeze(['scan', 'vcf', 'call', 'email']);
export const CLICKS = Object.freeze(['dates-cta']);
export const FORM_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;   // max 60 chars

export const GUIDE_FORMS = Object.freeze({        // form name -> guide shown on the dashboard
  'levers-of-labor': 'The Levers of Labor',
  'av365': 'AV365',
  'av-concessions': '12 AV Concessions'
});
export const BRAND_OF_FORM = Object.freeze({ 'onyva-conference-pilot': 'onyva' });   // shown apart from YAVD numbers

export const CARD_SCAN_PARAM = 'src';  export const CARD_SCAN_VALUE = 'card';   // /michaelh?src=card
export const MAX_COUNT_BODY = 256;
export const PERIODS = Object.freeze(['today', '7d', '30d', 'ytd']);   // each compared with the previous period of equal length
export const TIME_ZONE = 'America/New_York';

/** Public helpers (pure): isValidEvent(e), sourceBucket(referrer, utmSource, ownHost),
 *  periodRange(period, now) -> {from, to, prevFrom, prevTo}, easternDay(date). */
```

Report shape (GET /api/activity):
```js
{ v, from, to, prevFrom, prevTo, generatedAt,
  days: [{ day, events: { "<event>": n } }],          // selected range, newest first
  totals: { "<event>": n }, prevTotals: { "<event>": n },
  offers: [{ id, name, status, views, leads }],       // read from offer-stats + offers (unchanged)
  justTheAudio: { visit, install, convert, prev: {...} } | null,
  unavailable: [] }                                    // names of any source that could not be read
```

## Sessions

### Session 2.1: Freeze the contract
- Compartment: API · Depends on: nothing · Goal: shared/activity-contract.js written exactly as above, with its pure helpers and their tests.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability and scalability (one agreed shape); security (allow-list defined before any endpoint exists).
- Files created: shared/activity-contract.js, netlify/tests/activity-contract.test.mjs, ai/archive of CONTEXT, new ai/CONTEXT.md.
- Tasks:
  - [ ] Confirm PAGES against the real files and the forms list against the real form names; list any correction.
  - [ ] Write the contract and the helpers isValidEvent, sourceBucket, periodRange, easternDay.
  - [ ] Tests: allow-list accepts and refuses, source buckets (linkedin.com, lnkd.in, google, bing, duckduckgo, mail clients and utm_source=email, own host, empty), period ranges across a month and year boundary and a daylight-saving change.
- Inputs needed from Michael: None.
- DONE WHEN: `node --test netlify/tests/activity-contract.test.mjs` passes (output pasted) and the full suite still passes.
- Needs my eyes: the corrections list, if any.
- Risk and fallback: none of note.
- Backup point: yes, before this session: `git tag pre-activity-20261013` on the repo as it stands.

### Session 2.2: Counting endpoint and day store
- Compartment: API · Depends on: 2.1 · Goal: POST /api/activity/count adds one to today's record, safely, for allow-listed events only.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (allow-list, same-site Origin, JSON only, size cap, Netlify rate limit), stability (conditional writes, never double counts), efficiency (one read and one write per event).
- Files created: netlify/functions/lib/activity-store.mjs (bumpDay with onlyIfMatch/onlyIfNew and up to 5 retries, the offers-stats pattern), netlify/functions/activity-count.mjs, netlify/tests/activity-store.test.mjs.
- Tasks:
  - [ ] bumpDay(store, day, events[]) adds one to each event in a single conditional write (a visit and its source go together).
  - [ ] Count route: refuses other origins (403), non-JSON (415), oversized (413), unknown events (400). Answers 204 with no body. Storage failure: 503, logged, nothing shown to the visitor.
  - [ ] Test store on every non-production deploy.
- Inputs needed from Michael: None.
- DONE WHEN: tests pasted showing: allowed event counted; unknown event refused; cross-site refused; 20 parallel bumps of one event store exactly 20; with the condition removed the same test loses counts (proves the test works).
- Needs my eyes: nothing.
- Risk and fallback: Netlify config rateLimit is already used by just-the-audio-count; if it behaves differently on a draft deploy, note it in BUILD_NOTES and rely on the size and origin checks.
- Backup point: no (test store only).

### Session 2.3: Count every form submission
- Compartment: API · Depends on: 2.2 · Goal: every Netlify form submission adds form:<name> to today, without ever affecting the guide emails.
- Size: S · My time: ~5 min · Confidence: High
- Objectives: stability (counting failure cannot stop, delay or duplicate a guide email), security (form name checked against the pattern).
- Files modified: netlify/functions/submission-created.mjs (one call, approved 2026-10-13). Files created: netlify/tests/submission-count.test.mjs.
- Tasks:
  - [ ] Add one call at the top of the handler: count form:<name> with a 1.5 second time limit, inside try/catch, result ignored. Nothing else in the file changes.
  - [ ] Test with the mail sender stubbed: a guide form still sends exactly one email when counting throws, hangs, or succeeds; a non-guide form still sends none.
- Inputs needed from Michael: None.
- DONE WHEN: tests pasted; `git diff netlify/functions/submission-created.mjs` pasted showing only the added lines.
- Needs my eyes: the diff.
- Risk and fallback: Netlify passes the form name in the event payload (payload.form_name). If the field differs, read it from the payload in the test deploy log and correct the code, not the contract.
- Backup point: no.

### Session 2.4: Page counts, sources and card taps
- Compartment: STATE · Depends on: 2.2 · Goal: the 13 counted pages send a visit, its source, card actions and the dates button click.
- Size: L · My time: ~10 min · Confidence: High
- Objectives: efficiency (one deferred script under 2 KB, only on counted pages), UX (never visible, never blocks), security (sends only event names, no referrer text leaves the browser).
- Files created: assets/activity.js. Files modified (one script tag each, plus data-activity attributes on counted buttons): the 13 pages in PAGES.
- Tasks:
  - [ ] activity.js: after load, works out the page, the source bucket (from document.referrer host and utm_source, mapped in the browser), and src=card; sends one POST with keepalive. Skips if the page is opened inside the offer preview (isTest) or by a known bot user agent.
  - [ ] Clicks on elements with data-activity="card:michaelh:vcf" (and call, email) and "click:dates-cta" send that event.
  - [ ] Add the tag and attributes to the 13 pages; list every edit.
  - [ ] Browser check on a local copy: each page sends exactly one visit; taps send their events; nothing in the console.
- Inputs needed from Michael: None.
- DONE WHEN: a pasted log from the local check lists each page and the events it sent; `git diff --stat` shows only the expected files.
- Needs my eyes: one look at /michaelh and /booth-proof on his phone after the test deploy (nothing should look different).
- Risk and fallback: the "Save contact" button may be a plain link to the .vcf; a link opening the file can cancel the send, so the send uses keepalive. If a tap still drops, count on pointerdown instead.
- Backup point: yes, before this session (it edits 13 live pages).

### Session 2.5: Report and export
- Compartment: API · Depends on: 2.2 · Goal: signed-in GET /api/activity and /api/activity/export return the frozen report shape.
- Size: M · My time: ~5 min · Confidence: High
- Objectives: security (same admin session check as offers, 401 signed out), stability (any one source unreadable is listed in unavailable, the rest still returns), efficiency (reads at most 2 x 366 day records; offer lookup reuses the 60 s cache).
- Files created: netlify/functions/activity-report.mjs, netlify/functions/activity-export.mjs, netlify/tests/activity-report.test.mjs.
- Tasks:
  - [ ] Read day records for the range and the previous range; total them.
  - [ ] Add offers (names and status from the offers store, counts from offer-stats) and Just the Audio totals for the same ranges (from its day-named keys).
  - [ ] Export: every day record as one JSON file, named site-activity-<date>.json.
- Inputs needed from Michael: None.
- DONE WHEN: tests pasted: signed out 401; a seeded week returns the right totals and previous totals; offer and Just the Audio numbers match their own stores; one source switched off shows in unavailable with the rest intact.
- Needs my eyes: nothing.
- Risk and fallback: listing Just the Audio's per-event records for a year view may be slow as it grows. If a year read takes over 2 seconds, show Just the Audio for 30 days only and log it.
- Backup point: no.

### Session 2.6: The Activity page
- Compartment: UI · Depends on: 2.5 · Goal: /activity shows the key numbers, sections and day table, behind sign-in, with an Activity button on the admin panel.
- Size: L · My time: ~20 min · Confidence: High
- Objectives: UX (biggest numbers first, plain words, works on a phone), security (no numbers without the session; sign-in box when expired), accessibility.
- Files created: activity.html, assets/activity-page.css, assets/activity-page.js. Files modified: admin.html (one button), netlify.toml (no-store and noindex for /activity, short address).
- Tasks:
  - [ ] Top row: Guide requests, Booth Proof date checks, Offer leads, Card visits, each with "up 3 from last week" style comparison.
  - [ ] Sections: Guides (per guide), Booth Proof (visits, dates button, dates form, conversion line), Offers (per offer), Cards (per person: visits, scans, saves, calls, emails), Forms (every form; Onyva shown apart), Just the Audio (with a link to its own page), Sources (five buckets for the selected period).
  - [ ] Period switch: Today, 7 days, 30 days, Year. Day table for the period. Export button. Empty, loading, signed-out and "unavailable" states.
  - [ ] Screenshots at desktop and 390 px.
- Inputs needed from Michael: None.
- DONE WHEN: screenshots pasted for desktop and phone with seeded test data; signed-out screenshot shows no numbers; no console errors.
- Needs my eyes: the layout, on his phone and desktop.
- Risk and fallback: first review of new UI usually brings changes; one follow-up session is in the contingency.
- Backup point: no.

### Session 2.7: Tagged QR codes for the cards
- Compartment: UI · Depends on: 2.1 · Goal: new QR images for youravdept.com/michaelh?src=card and /trishah?src=card in the standard Your AV Department QR style.
- Size: S · My time: ~5 min · Confidence: Low (matching the round standard style exactly)
- Objectives: UX and brand (Andy's QR rules), stability (the old QR keeps working).
- Files created: michaelh-qr-card.png, trishah-qr-card.png (existing michaelh-qr.png and trishah-qr.png untouched).
- Tasks:
  - [ ] Build each code to match YAD-QR-standard.png: round, navy ring, rounded navy modules and corners, logo mark in the centre, high error correction.
  - [ ] Decode each image and confirm the address.
  - [ ] Andy brand check.
- Inputs needed from Michael: the YAD-QR-standard.png file (or its folder) so the style can be matched.
- DONE WHEN: decode output pasted for both images showing the tagged addresses; Andy's verdict pasted.
- Needs my eyes: the two images, and a scan with his phone.
- Risk and fallback: if the round style can't be matched closely, deliver a square code in brand colours and say so; the standard-style version can be made in his design tool from the same address.
- Backup point: no.

### Session 2.8: Go live and close the phase
- Compartment: QA · Depends on: all · Goal: the dashboard is live and every success criterion is checked with real output.
- Size: M · My time: ~25 min · Confidence: High
- Objectives: all five, checked against scope section 12.
- Tasks:
  - [ ] Run the seven success criteria on the test deploy; paste results (including a real guide request with the guide email received).
  - [ ] Michael says go; he runs deploy.ps1. Live check: one visit, one card tap, one test form; numbers appear within a minute.
  - [ ] Export once; update CONTEXT, BUILD_NOTES, DECISIONS; estimates vs actuals.
- Inputs needed from Michael: his OK to publish; a minute to send one test guide request to himself.
- DONE WHEN: seven criteria with real output; the live dashboard shows the live test events.
- Needs my eyes: the live dashboard.
- Risk and fallback: if counting misbehaves live, remove the script tag from pages by redeploying the pre-2.4 tag (git tag pre-activity-pages); forms and pages are unaffected either way.
- Backup point: yes, before the live publish and an Export after.

## Phase summary
- Sessions: 8 (3 S, 3 M, 2 L). With the 35 percent allowance for review of new screens: 10 to 11. This is more than the 5 to 7 I estimated before planning: the report and the page are split so each stays under 60 minutes, and the QR codes are their own session.
- Michael's attention: about 80 min planned; Phase 1's calibration (1.3x) puts it nearer 105 min.
- Most likely to overrun: 2.6 (new UI, first review). Only Low-confidence item: 2.7, which is small and has a fallback, so no spike.
- Can be cut without affecting the rest: 2.7 (QR codes), and the Sources section of 2.6.
- Carried items from Phase 1: none required. Offers backlog 1.2b (lead alert email) stays separate.
- Calibration from Phase 1: sessions landed at planned size or smaller; Michael's time ran about 1.3x, mostly from CLI trouble. Add one extra verify run to any session that drives the Netlify CLI (2.8).

## The five objectives in this phase
- Security: allow-listed events only, same-site posts, no personal data stored, report and export behind the existing admin session (tested signed out in 2.5 and 2.8).
- Stability: counting can never block a page, a form or a guide email (proven in 2.3 and 2.8); any data source failing is shown as unavailable, not as zero.
- Efficiency: one small deferred script on 13 pages, nothing elsewhere; day records keep a year view to 366 reads.
- User experience: one page, biggest numbers first, plain comparison words, phone-friendly, reviewed by Michael in 2.6.
- Scalability: day records with conditional writes hold to thousands of events a day; no caps in the shape.

## Backup points
- Before 2.1: `git tag pre-activity-20261013`.
- Before 2.4: `git tag pre-activity-pages` (13 pages edited).
- 2.8: before the live publish, and an Export after.
