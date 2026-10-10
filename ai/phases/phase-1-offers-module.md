# YAVD Offers Module: Phase 1 Build Plan

Status: READY 2026-10-09. Contracts FROZEN 2026-10-10 in Session 1.1 against the real repo. Built on ai/spec/offers-scope.md.

## Session 1.1 corrections (the repo against the plan)

The repo matched the plan's main assumption: static HTML, no build step, no framework. These are the places it did not, and what changed.

| # | The plan assumed | The repo shows | Change |
|---|---|---|---|
| C1 | netlify.toml exists to modify | No netlify.toml in the repo. Config lives in `_redirects` and `_headers`. (`.netlify/netlify.toml` is the CLI's generated copy, not a source file.) | 1.2 creates `netlify.toml` (allowed by the hard limits). Edge functions and API routes declare their paths in their own files (`export const config`), so the toml only carries the no-index headers. |
| C2 | Sessions test on a "preview deploy" | Deploys run from Michael's PC: `deploy.ps1` stages the folder and runs `netlify deploy --prod`. Not git-triggered. | 1.2 adds a new `deploy-preview.ps1`: same staging, no `--prod`, prints the draft URL. `deploy.ps1` is used only in 1.10. |
| C3 | Only intended files go live | `deploy.ps1` publishes everything not on its exclude list. `ai/`, `package.json` and function sources would become public files. | NEEDS MICHAEL: approve adding `'ai'` to `$ExcludeDirs` in `deploy.ps1` (edit to an existing file). Fallback with no edit: a 404 rule for `/ai/*` in `netlify.toml`. `shared/offer-contract.js` going public is intended (no secrets). |
| C4 | No new dependency | Netlify Blobs is read and written through Netlify's `@netlify/blobs` package. The repo has no `package.json`. | NEEDS MICHAEL: approve one pinned dependency, `@netlify/blobs`, plus a minimal `package.json`. It is Netlify's own package for the storage the scope already chose, not a framework. `node_modules/` is already in `.gitignore` and in `deploy.ps1`'s exclude list. |
| C5 | The "offers" form is the only thing reacting to submissions | `netlify/functions/submission-created.mjs` runs on every form on the site and emails a guide PDF via Resend when a form has a `guide` field. | Safe: the offers form has no `guide` field. The contract reserves `guide` (`RESERVED_FIELD_NAMES`). Note for 1.2: Resend is already set up, so if Netlify's notification email cannot take a custom subject, the fallback is a short addition to this function (an existing-file edit, so it comes back to Michael). |
| C6 | One address per page | `_redirects` serves `/booth-proof` and `/booth-proof.html` (and others) as the same page; `/` and `/library/` are index pages. | Contract adds `normalizePagePath()`. Offers store the `.html` form; the edge function compares through it, so both addresses get the popup. |
| C7 | Body font Open Sans | Every page uses Montserrat 700/800 and Inter (README, booth-proof.html). | Popup uses Montserrat + Inter, already loaded by every page. Scope section 7 corrected. |
| C8 | One "offers" store | Netlify Blobs site-wide stores are shared by every deploy, previews included. | Contract adds `storeName()`: production uses `offers` / `offer-stats`; every other deploy uses `offers-test` / `offer-stats-test`. 1.2 confirms the context string Netlify reports for a CLI draft deploy. |
| C9 | Contract as description | Written as code. | Additive helpers frozen with it: `isValidSlug`, `rangesOverlap`, `offerStatus`, `alertSubject`, `publicPayload` (the injected JSON never carries `previewKey`), `payloadToScriptJson` (escapes `<`), `ALL_FORM_FIELDS` (26 names). |
| C10 | The page dropdown source is open | No build step and no sitemap.xml. | Recommended for 1.2: the pages function bundles the site's `.html` files through `[functions] included_files` in `netlify.toml` and lists them at runtime. Always current, no extra step, no edit to existing files. |
| C11 | Admin page is a normal page | README says every page belongs in the site map, which lives in 18 page files. | `offer-admin.html` is exempt: adding it means editing every page, and it is an admin screen. |
| C12 | Repo committed before 1.1 | Backup commit exists: "Offers module: <what changed>" (2026-10-10 7:16 AM, placeholder message). Several files show later modification times (7:32 AM). Not verified: this session had no shell on Michael's PC. | Michael runs `git status` (block in CONTEXT.md) before 1.2. |

Risk check from the plan ("the site may have a build step or framework"): it does not. The plan stands.

## What shapes this plan
- Netlify project "your-av-dept" serves youravdept.com, Forms enabled, deployed from Michael's PC by the Netlify CLI.
- Static HTML, no build step, no package.json before this phase.
- This is a module added to a working site, so it is one phase. Existing pages are not edited.

## Parameters
- Scale horizon: about 50 offers a year across up to 20 pages, one admin.
- Data sensitivity: lead contact details (name, email, phone, company). Held in Netlify Forms, not in offer storage.
- UX tier: Polished for the popup, Functional for the admin screens.
- Accessibility: keyboard use, Escape to close, focus kept inside the popup, readable contrast.
- Platforms: desktop and mobile web.
- Telemetry: views and leads counts inside the module. Google Analytics events are deferred.
- Recovery: last 20 saved versions kept automatically, plus an export button.
- Compliance: none beyond a plain privacy line under the form. No payment data.

## Hard limits: stop and ask
- Any edit to an existing page or existing site file other than netlify.toml (this includes `deploy.ps1`, `_redirects`, `_headers`, `submission-created.mjs`, `.gitignore`, `README.md`).
- Any change to a frozen contract in `shared/offer-contract.js`.
- Any new dependency or framework.
- Any secret that would land in the repo, a log or a page.
- Any change or deletion of saved offers or leads.
- Any publish to the live site (`deploy.ps1`, or `netlify deploy --prod`). Sessions work on a draft deploy. The live publish happens once, in Session 1.10, after Michael says go.

## Frozen contracts

The authority is `shared/offer-contract.js` (CONTRACT_VERSION 1.0.0). This summary is for reading; if it and the file disagree, the file wins.

```
ADDRESSES
/offer/<slug>                  private offer link (edge function: offer-link)
/offer/<slug>?preview=<key>    preview link, works in any status
/<any page>                    normal page; Everyone offer added if running (edge function: offer-page)
/offer-admin                   admin screen (static page, no data without sign-in)
/api/offers/login    POST {password}     sets cookie
/api/offers/logout   POST
/api/offers          GET list all        POST create or update one
/api/offers/delete   POST {id}           drafts only
/api/offers/export   GET all offers as one JSON file
/api/offers/pages    GET list of site pages for the dropdown

OFFER RECORD  (OFFER_KEYS, FORM_KEYS, emptyOffer())
id, name, slug, page (canonical .html path), audience "link"|"everyone",
headline, body (plain text), form {enabled, fields, required, buttonLabel,
optionChoices, extraLabels {extra_1..3}, thanks}, buttonUrl|null,
startsAt, endsAt (ISO with offset, entered Eastern), draft, previewKey (32),
rerunOf|null, createdAt, updatedAt

STATUS  offerStatus(): draft | upcoming | running | expired  (never stored)

RULES
- One Everyone offer per page at any moment. Save refused on overlap.
- Link offers may overlap anything.
- A slug may be reused only by an offer whose dates do not overlap another offer on that slug.
- A link offer beats an Everyone offer. One popup per page view.
- Out of dates: 302 to the offer page. Unknown slug: 302 to /.
- Storage unreadable: serve the normal page. Never an error.
- Drafts never show to visitors; only a valid preview key shows a draft.
- Page matching goes through normalizePagePath().

NETLIFY FORM name="offers"
Hidden: form-name, subject, offer_name, offer_slug, offer_id, is_test, bot-field
Fields: name, title, email, phone, company, org_type, show_name, show_dates,
        show_city, exhibitor_count, option_choice, heard_from, message,
        extra_1, extra_2, extra_3, extra_1_label, extra_2_label, extra_3_label
Reserved, never used: guide
Subject: "New offer lead: <name>"  test: "TEST offer lead: <name>"

STORAGE (Netlify Blobs) via storeName(base, deployContext)
store "offers"        key "all"             every offer, one JSON array
                      key "history/<time>"  previous versions, newest 20 kept
store "offer-stats"   key "<id>"            { views, leads }
non-production deploys use "offers-test" and "offer-stats-test"

SIGN-IN
Env: OFFER_ADMIN_PASSWORD (12+ chars), OFFER_SESSION_SECRET
Cookie: yavd_offer_admin, signed, HttpOnly, Secure, SameSite=Strict, 12 hours
Lockout: 5 wrong tries, 15 minutes

PAGE INJECTION
Before </body>: <script type="application/json" id="yavd-offer-data"> with
{ v, isTest, offer: id,name,slug,headline,body,form,buttonUrl } ("<" escaped),
plus /assets/offer-panel.css and /assets/offer-panel.js

VISITOR BROWSER
localStorage "yavd_offer_closed_<id>" = time closed; stays shut 7 days
Popup opens 1.5 seconds after load
```

## File layout (confirmed against the repo)
```
shared/offer-contract.js                 contract (1.1)
netlify.toml                             new (1.2): no-index headers, included_files
deploy-preview.ps1                       new (1.2): draft deploy
package.json                             new (1.2, if C4 approved)
offers-form.html                         new (1.2): hidden blueprint form, noindex
netlify/functions/offers-login.mjs       1.3
netlify/functions/offers-logout.mjs      1.3
netlify/functions/lib/offers-auth.mjs    1.3 shared check
netlify/functions/offers.mjs             1.4
netlify/functions/offers-delete.mjs      1.4
netlify/functions/offers-export.mjs      1.4
netlify/functions/offers-pages.mjs       1.4
netlify/functions/lib/offers-rules.mjs   1.4 (+ tests)
netlify/edge-functions/offer-link.js     1.5
netlify/edge-functions/offer-page.js     1.5
assets/offer-panel.css, .js              1.6
offer-admin.html, assets/offer-admin.*   1.7, 1.8
netlify/functions/offers-stats.mjs       1.9
```
Function files use `.mjs`, matching the existing `submission-created.mjs`. Anything under `netlify/functions/lib/` must not be picked up as its own function: 1.3 confirms how the CLI treats that folder and moves it if needed.

## Sessions

### Session 1.1: Read the repo and freeze the contracts  [DONE 2026-10-10]
- Compartment: API. Depends on: nothing. Goal: confirm the contracts against the real repo and write them into it.
- Size: S. My time: about 5 min. Confidence: High.
- Files created: ai/spec/offers-scope.md, ai/phases/phase-1-offers-module.md, ai/phases/phase-1-RUNSHEET.md, ai/CONTEXT.md, ai/BUILD_NOTES.md, ai/DECISIONS.md, shared/offer-contract.js.
- Done when: the contract file loads with no errors, and the list of corrections is shown.

### Session 1.2: Netlify setup
- Compartment: INFRA. Depends on: 1.1. Goal: everything the host needs is in place on a draft deploy.
- Size: M. My time: about 15 min. Confidence: High.
- Objectives: security (secrets in protected settings), stability (draft deploy, not live).
- Files created: netlify.toml, deploy-preview.ps1, package.json (if C4 approved), offers-form.html (hidden blueprint form), empty function and edge function files.
- Add the blueprint form so Netlify registers "offers" with every name in ALL_FORM_FIELDS.
- Set OFFER_ADMIN_PASSWORD and OFFER_SESSION_SECRET as protected settings.
- netlify.toml: no-index header for /offer/*, /offer-admin and /offers-form.html; included_files for the pages list (C10); the /ai/* 404 rule if C3 is not approved.
- Confirm the deploy context string on a CLI draft deploy (C8).
- Confirm the plan's monthly form allowance and whether the hidden "subject" field sets the alert subject.
- Set the alert email on the "offers" form.
- Inputs needed from Michael before the session: the first admin password (12+ characters); answers on C3 and C4; `git status` output (C12).
- Done when: the draft deploy shows the "offers" form in Netlify with all fields; a hand-posted test submission arrives as an alert with the right subject.
- Needs my eyes: the test alert in his inbox.
- Risk and fallback: if the subject field does not control the subject on this plan, either put the offer name first in the body, or (with approval) send the alert through Resend from submission-created.mjs.
- Backup point: no.

### Session 1.3: Sign-in
- Compartment: AUTH. Depends on: 1.2. Goal: only the password holder can reach offer data.
- Size: M. My time: about 5 min. Confidence: High.
- Objectives: security.
- Files created: offers-login.mjs, offers-logout.mjs, lib/offers-auth.mjs.
- Password check in constant time, signed 12 hour cookie, lockout after 5 wrong tries.
- Every /api/offers route except login refuses requests without a valid cookie.
- Inputs needed from Michael: none.
- Done when: pasted output shows a wrong password refused, the sixth try locked out, a signed-out call to /api/offers refused, and a signed-in call accepted.
- Needs my eyes: nothing.
- Risk and fallback: lockout needs a small counter in storage. If unreliable, fall back to a fixed delay on every wrong try.
- Backup point: no.

### Session 1.4: Saving and listing offers
- Compartment: API. Depends on: 1.3. Goal: offers can be created, changed, listed, exported and reverted, with the rules enforced.
- Size: L. My time: about 5 min. Confidence: High.
- Objectives: stability (history on every save), security (input checked on the server).
- Files created: offers.mjs, offers-delete.mjs, offers-export.mjs, offers-pages.mjs, lib/offers-rules.mjs with tests.
- Validate every field against the contract; strip anything that is not plain text.
- Enforce the overlap and slug rules; return a plain message Michael can act on.
- Write the previous version to history on every save and keep the newest 20.
- Export all offers as one file.
- Inputs needed from Michael: none.
- Done when: the rules tests pass with output pasted, including two Everyone offers on one page refused, and an export file opens with the test offers in it.
- Needs my eyes: nothing.
- Risk and fallback: two saves at the same moment could overwrite each other. The save checks updatedAt and refuses a stale write.
- Backup point: yes, first store of offer data (test store).

### Session 1.5: Offer links, dates and forwarding
- Compartment: LOGIC. Depends on: 1.4. Goal: the right visitor gets the right offer, or the normal page.
- Size: L. My time: about 10 min. Confidence: Low.
- Objectives: stability (fail to the normal page), efficiency (lookups cached up to a minute), UX (no flash of the offer).
- Files created: netlify/edge-functions/offer-link.js, offer-page.js.
- First 15 minutes are a spike: prove an edge function can fetch a static page (including a `_redirects` pretty URL like /booth-proof) and add a small block to it on the draft deploy.
- /offer/<slug> inside dates serves the page with that offer attached; outside dates sends a 302.
- Normal pages get the running Everyone offer attached, if any, matched through normalizePagePath().
- Preview key shows any offer in any status and marks it as a test.
- Storage failure serves the untouched page.
- Inputs needed from Michael: none.
- Done when: pasted responses show a running link (200 with the offer attached), an expired link (302 to the page), an unknown slug (302 to /), a preview of a draft (200), and a forced storage failure (200, untouched page).
- Needs my eyes: one click on a running link and one on an expired link.
- Risk and fallback: most likely to overrun. If the spike fails, the fallback is a one-line script tag added to pages, which touches existing pages and stops for Michael's approval.
- Backup point: no.

### Session 1.6: The popup
- Compartment: UI. Depends on: 1.5. Goal: the popup visitors see, in Your AV Department branding, with a working form.
- Size: L. My time: about 20 min. Confidence: High.
- Objectives: UX, security (offer copy shown as plain text only).
- Files created: assets/offer-panel.css, assets/offer-panel.js.
- Build the popup from the injected JSON: headline, copy, chosen fields, button label, privacy line. Montserrat headings, Inter body.
- Submit to the "offers" form without leaving the page; thank-you message; clear message on failure.
- 1.5 second delay, close button, Escape, click outside, 7 day memory, reopen tab.
- Keyboard focus stays inside the popup; works at phone width.
- Inputs needed from Michael: none.
- Done when: screenshots at desktop and phone width; a submission from the draft deploy arrives as an alert naming the offer; a closed popup stays closed on reload.
- Needs my eyes: the popup on his own phone and desktop.
- Risk and fallback: one follow-up session budgeted in the contingency.
- Backup point: no.

### Session 1.7: Admin dashboard
- Compartment: UI. Depends on: 1.4. Goal: the first screen after sign-in shows what is running, upcoming, in draft and expired.
- Size: L. My time: about 15 min. Confidence: High.
- Files created: offer-admin.html, assets/offer-admin.css, assets/offer-admin.js.
- Sign-in screen and sign-out. Four groups of cards with page, link, audience, dates, days left or countdown. Copy link, Preview and Export work; Edit and Run again wired in 1.8. Empty, loading and error states.
- Inputs needed from Michael: none.
- Done when: a screenshot shows test offers sorted into the four groups correctly, and the signed-out page shows no offer data.
- Needs my eyes: the dashboard layout.
- Backup point: no.

### Session 1.8: Offer editor, rerun and preview
- Compartment: UI. Depends on: 1.7. Goal: Michael can create, edit and rerun an offer without help.
- Size: L. My time: about 20 min. Confidence: High.
- Files modified: offer-admin.html, assets/offer-admin.js, assets/offer-admin.css.
- Editor form (page dropdown, name, audience, link name, headline, copy, form on/off, field ticks, required ticks, option choices, spare labels, button label, dates and times). Save draft, Save and schedule, field-level server messages. Run again. Live preview and preview link. Unsaved-changes warning.
- Inputs needed from Michael: none.
- Done when: a recorded run shows an offer created, previewed, edited, expired by date, and rerun, with no console errors.
- Needs my eyes: Michael creates one offer himself start to finish.
- Risk and fallback: date entry; the form shows the Eastern time it will save in plain words.
- Backup point: no.

### Session 1.9: Views and leads counts
- Compartment: LOGIC. Depends on: 1.6 and 1.7. Goal: each card shows views and submissions.
- Size: M. My time: about 5 min. Confidence: High. Can be cut.
- Files: offers-stats.mjs; popup script; dashboard.
- Count a view when the popup opens and a lead when the form succeeds. Preview visits not counted.
- Done when: pasted output shows counts rising by one for a view and a lead, and not for a preview.
- Backup point: no.

### Session 1.10: Go live and close the phase
- Compartment: QA. Depends on: all. Goal: the module is live with Michael's three Booth Proof offers, and the phase is closed.
- Size: M. My time: about 25 min. Confidence: High.
- Run every success criterion on the draft deploy and paste the results. Publish with deploy.ps1 after Michael says go. Enter the three Booth Proof offers as drafts (production store starts empty, C8); he previews and schedules them. Test submission from each preview link. Export a backup; update CONTEXT, BUILD_NOTES, DECISIONS; compare estimates with actuals. Propose the README update (existing file, needs approval): the module, and that offers no longer get their own pages.
- Inputs needed from Michael before the session: final popup copy, dates and link names for the three offers.
- Done when: all six success criteria show real output, and three test alerts name the three offers.
- Needs my eyes: the three previews, desktop and phone.
- Risk and fallback: if a live page misbehaves, set the offers to draft, which removes every popup within a minute.
- Backup point: yes, before the live publish and after the offers are entered.

## Phase summary
- Sessions: 10 (1 small, 4 medium, 5 large). With 35 percent for review of new screens: 13 to 14.
- Michael's attention: about 2 hours, most in 1.6, 1.8 and 1.10.
- Most likely to overrun: 1.5 (large, low confidence), opens with a 15 minute spike and has a named fallback.
- 1.9 can be dropped (9 sessions).
- Carried items: C3, C4, C12 to Session 1.2's inputs.

## The five objectives in this phase
- Security: sign-in built and tested in 1.3 before any offer data exists. Offer copy plain text from entry (1.4) to display (1.6); injected JSON escapes "<" and never carries the preview key.
- Stability: history from the first save in 1.4. Failing to the normal page tested in 1.5 and 1.10. Test data kept out of the live store (C8).
- Efficiency: one small, Netlify-owned dependency (if approved). Lookups cached up to a minute.
- User experience: popup and both admin screens each get their own session and Michael's review. Both page addresses get the popup (C6).
- Scalability: one record per offer with an id that never changes.

## Backup points
- Before Session 1.1: done (commit 2026-10-10 7:16 AM).
- Session 1.4: first offer data (test store). Export once it works.
- Session 1.10: before the live publish, and an export after the three offers are entered.
