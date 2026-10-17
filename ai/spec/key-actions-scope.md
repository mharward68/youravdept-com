# Key Actions Dashboard Scope
Status: APPROVED 2026-10-13 (Michael asked for the build plan), ready for phase planning. (written from the code in C:\01_AppDevelopment\12.Your-AV-Dept_Website)

## 1. Summary
A private page at youravdept.com/activity, one click from the admin panel, that shows Michael the handful of things on the site that turn into business: guide requests, Booth Proof interest, offer popup views and leads, /michaelh and /trishah card visits, form submissions and Just the Audio use. It answers "is anything working this week?" in under ten seconds, with today, 7 days, 30 days and year views and a comparison to the period before. It is deliberately not a Google Analytics replacement: it counts a short list of actions exactly, and leaves "where did everyone come from" to GA or a similar tool.

## 2. Users and roles
- Michael: the only viewer. Signs in with the existing admin password (same session as /admin, /offer-admin and /site-map).
- Anyone else who knows the password (Trisha, if she is given it) sees the same page. There are no other roles.
- Visitors to the site are counted, never identified. Nothing about a visitor is stored except the action, the day and, for page visits, a coarse source (see 5).

## 3. Core workflows
1. Michael opens /admin, signs in, clicks **Activity**.
2. The page loads with the last 7 days selected. Top row: the key numbers (guide requests, Booth Proof date checks, offer leads, card visits), each with the change from the previous 7 days.
3. He switches to Today, 30 days or Year. Every number and comparison updates.
4. Below the top row: one section per area (Guides, Booth Proof, Offers, Cards, Forms, Just the Audio), each with its numbers and, where it makes sense, a simple conversion line ("38 visits to the dates page, 4 sent the form: 11%").
5. A day-by-day table at the bottom for the selected period.
6. Signed out or expired: the page shows the sign-in box, never numbers.

## 4. Features
**Must have**
- Page visits, counted on these pages only: home, /booth-proof, /booth-proof-dates, /booth-proof-apply, /library and each guide page, /michaelh, /trishah, /how-we-get-paid, /fix-my-av-budget, /show-info.
- Every Netlify form submission, counted by form name, automatically (a new form shows up without code changes). Today that is: levers-of-labor, av-concessions, av365, booth-proof-dates, booth-proof-pilot, venue-docs-free-offer, onyva-conference-pilot, offers.
- Guide requests broken out by guide (from the forms above).
- Card actions on /michaelh and /trishah: page visits, card QR scans (visits tagged src=card), "Save contact" (vCard) taps, call taps, email taps.
- New tagged QR images for /michaelh and /trishah, in the standard YAVD QR style.
- "Check my show dates" button clicks on /booth-proof.
- Offer popup views and leads per offer, read from the existing offer-stats store (no new counting).
- Just the Audio visits, installs and conversions, read from its existing store (no new counting).
- Periods: Today, 7 days, 30 days, Year to date, each compared with the previous period of the same length. Days are Eastern time.
- Activity button on the admin panel.
**Should have**
- Source of each counted page visit in five buckets: LinkedIn, Google or other search, Email, Other site, Direct or unknown. From the referrer and utm_source only; nothing else about the visitor.
- Export the selected period as CSV.
**Later (deferred)**
- Alerts ("a guide was requested") by email: belongs with the lead alert work (Offers backlog 1.2b).
- Per-campaign reporting by utm_campaign.
- Folding the Just the Audio activity page into this one.

## 5. Data
- New store "site-activity" ("site-activity-test" on every non-production deploy, same rule as storeName() in shared/offer-contract.js).
- One record per Eastern day, key "day/YYYY-MM-DD", value: `{ "<event>": count, ... }` where an event is a fixed name such as `visit:/booth-proof`, `form:levers-of-labor`, `click:dates-cta`, `card:michaelh:vcf`, `src:/booth-proof:linkedin`.
- Writes are conditional (read with ETag, write only if unchanged, retry up to 5 times), the pattern already proven in netlify/functions/lib/offers-stats.mjs. Why not one record per event like Just the Audio: the dashboard would have to list every record ever written to show a year, which gets slower every month. Day records keep a year view at 366 reads at most.
- Events are a fixed allow-list in a frozen contract file; anything else is refused. Unknown form names are stored as `form:<name>` only if the name matches the site's form-name pattern.
- Most sensitive thing held: daily counts. No IP addresses, no cookies, no names, no emails. Form contents stay in Netlify Forms as today.
- Retention: kept indefinitely (a year is about 366 small records).
- Backup: covered by the existing Export pattern (a JSON download of all day records from the dashboard) plus Netlify Blobs durability. Losing it loses history, never leads.

## 6. Identity, auth and integrations
- Sign-in: the existing admin session (offers-auth.mjs, signed HttpOnly cookie, lockout). No new password.
- Counting endpoint: public POST /api/activity/count, same protections as the offer counts (same-site Origin only, JSON only, tiny body, allow-listed events, Netlify rate limit).
- Form counts: added to netlify/functions/submission-created.mjs, which Netlify already runs on every form submission. One line, wrapped so a counting failure can never stop a guide email. Editing this file needs Michael's OK (it mails the guides).
- Dashboard data: GET /api/activity (signed in only), which also reads offer-stats and just-the-audio-usage.
- No paid services, no new dependencies (uses @netlify/blobs, already installed).

## 7. Platforms and UX
- Web, works at phone width (he will check it on his phone).
- UX tier: Functional, matching /admin and /site-map (plain, fast, readable), with brand navy and teal on the numbers.
- Accessibility: readable contrast, keyboard usable, numbers also given as text (no chart-only information).
- No offline need.

## 8. The five objectives
- Security: dashboard and data routes require the admin session; counting route accepts only allow-listed events from the site itself; no personal data stored. Threat that matters: someone inflating counts. Accepted at this scale (counts are a guide, not billing), as with offer counts.
- Stability: counting is fire-and-forget; a failed count never shows the visitor anything and never blocks a form or a guide email. Storage unreadable: dashboard says "unavailable", site unaffected.
- Efficiency: one tiny script (under 2 KB) on the counted pages only, sent after the page loads; zero work on other pages. Dashboard reads at most 366 day records.
- User experience: one screen, biggest numbers first, plain words, the period comparison spelled out ("up 3 from last week").
- Scalability: horizon is up to a few thousand counted actions a day, years of history. Day records and conditional writes hold well past that. No caps in the data shape.

## 9. Constraints
- Static site on Netlify, published with deploy.ps1 from this folder; Netlify Functions and Blobs; no framework.
- Every counted page is a self-contained HTML file in this folder (README: no build step). The only page generated elsewhere, the Just the Audio landing page, is not touched: Just the Audio already counts itself.
- Bot traffic: page visits are counted by a script, so most bots (which do not run scripts) are not counted. Some will be. Numbers are a guide.

## 10. Out of scope
- Replacing Google Analytics, visitor paths, devices, locations, time on page.
- Tracking individual people or anything that needs a cookie banner.
- Counting pages not listed in 4.
- Changing any form, page copy or offer.

## 11. Open questions
**RESOLVED 2026-10-13 (Michael)**
- Q1 QR scans: future QR codes point to youravdept.com/michaelh?src=card (and /trishah?src=card), which lands on the same page. Visits with src=card are counted as card scans. Cards already printed keep working and count as ordinary visits. New QR images are made in this phase; reprinting is Michael's call.
- Q2 submission-created.mjs: approved. One counting call, wrapped so a failure can never stop or delay a guide email.
- Q3 Google Analytics: Bob handles it separately. Not part of this build.
**ASSUMED**
- A1 Page lives at /activity, not on the admin home itself. Reversible.
- A2 Onyva conference pilot form is counted under "Other forms", labelled Onyva, kept apart from the YAVD numbers. Reversible.
- A3 Source buckets (LinkedIn, Search, Email, Other site, Direct) are included as a should-have. Reversible.
- A4 The Just the Audio activity page stays as it is; this page shows its three numbers and links to it.
- A5 Days are Eastern time, matching the offers module and Just the Audio.

## 12. Success criteria
1. A guide request on the test deploy shows on the dashboard within a minute, under the right guide, and the guide email still arrives.
2. A visit to /booth-proof-dates and a form submission there show as a visit and a submission, with the conversion line.
3. Offer views and leads on the dashboard match the offer cards in /offer-admin.
4. Just the Audio numbers match its activity page.
5. Signed out: /activity and /api/activity show no numbers (401 on the API).
6. Counting storage switched off on the test deploy: every page and form still works, and the dashboard says counts are unavailable.
7. Today / 7 days / 30 days / Year switch correctly, with the previous-period comparison, on desktop and phone.
