# YAVD Offers Module: Scope

Status: APPROVED 2026-10-09, ready for phase planning. Copied into the repo in Session 1.1 (2026-10-10) from the "YAVD Offers Module" Google Doc. From now on this file is the source of truth; the Google Doc is the one to correct.
Session 1.1 corrections applied: body font (section 7), page addresses (section 5), deploy and dependency notes (sections 6 and 9). Each is logged in ai/DECISIONS.md.

## 1. Summary

A password-protected module on youravdept.com that lets Michael run several offers at once, on any page of the site, without copying pages or redeploying. Each offer is a popup shown on an existing page. Michael writes the copy, picks the form fields, sets a start and stop, and chooses whether the offer is for everyone or only for people who arrive through a private link. Offers start and stop on their own. Outside its dates, a private offer link forwards to the normal page.
The first use is Booth Proof, with three offers running together. The module must work for any future product page with no further build work.

## 2. Users and roles

- Admin (Michael): signs in with one password. Creates, edits, schedules, previews, reruns and exports offers.
- Visitor: sees the page and, if an offer applies, one popup. Can close it, reopen it, and submit the form.

One shared admin password, no separate user accounts. [CONFIRMED]

## 3. Core workflows

### Create an offer
1. Sign in at /offer-admin. The dashboard opens.
2. Choose New offer.
3. Pick the page from a dropdown of every page on the site.
4. Name the offer. The name appears on the dashboard and in the alert email.
5. Choose the audience: Link only or Everyone. For Link only, set the link name, for example /offer/group-2026.
6. Write the popup headline and offer copy.
7. Turn the form on or off. If on, tick the fields to show, mark the required ones, and write the submit button label. If off, optionally give the button a label and a destination.
8. Set the start and stop date and time (Eastern).
9. Save as a draft, or save and schedule.
10. Open the preview link to see it exactly as the audience will.

### Visitor on a private link
1. Visitor opens /offer/group-2026.
2. Inside the dates: the Booth Proof page loads with that offer's popup.
3. Outside the dates: the visitor is forwarded to /booth-proof.html before anything loads.

### Visitor on the normal page
1. Visitor opens /booth-proof.html (or /booth-proof, which this site also serves).
2. If an Everyone offer is running on that page, its popup appears. Otherwise the page is unchanged.

### Lead comes in
1. Visitor submits the popup form and sees a thank-you message in the popup.
2. The submission lands in the single Netlify form named "offers".
3. Michael gets one alert email. The subject line names the offer. The body lists the offer name, link name, and every field filled in.

### Rerun an offer
1. On an expired offer, choose Run again.
2. A copy opens with everything filled in. Change the dates and any copy. Save.
3. The original stays in history. The copy keeps the same link unless Michael changes it.

## 4. Features

### Must have
- Password-protected admin screen, password checked on the server.
- Any number of offers across any number of pages.
- No duplicate pages. The popup is added to the live page as it is served.
- Audience switch per offer: Link only or Everyone.
- Automatic start and stop at the entered date and time, Eastern.
- Silent forwarding of a private link to the normal page outside its dates, using a temporary redirect.
- One popup per visitor. A private link offer always beats an Everyone offer.
- Only one Everyone offer on a page at a time. Private link offers may overlap freely.
- Optional form with a per-offer choice of fields and a custom submit label.
- One Netlify form and one alert for all offers, with the offer named in the subject and body.
- Dashboard grouped by Running, Upcoming, Draft and Expired, with Edit, Preview, Copy link and Run again on each card.
- Preview link per offer that works in any status, shows the popup every time, and marks submissions as tests.
- Rerun from an expired offer.
- Export of all offers to one file, plus automatic saved history of the last 20 versions.
- Offer links hidden from search engines.

### Should have
- Views and leads count on each dashboard card. [CONFIRMED IN; its own session, can be cut]
- A small tab that stays on the page after the popup is closed, so the visitor can reopen the offer.

### Later
- Access code on a private offer.
- Google Analytics events for popup views and submissions.
- A different popup design per offer.
- Separate sign-ins for more than one admin.
- (Removed: offers on the Onyva site.)

## 5. Data

### Offer record
| Field | What it holds |
|---|---|
| Name | Michael's name for the offer. Shown on the dashboard and in alerts. |
| Link name | The part after /offer/. Lowercase letters, numbers and hyphens. |
| Page | The existing page the offer sits on, stored in its .html form (for example /booth-proof.html). The page also matches its short address (/booth-proof). |
| Audience | Link only or Everyone. |
| Headline and offer copy | Plain text with line breaks. No HTML is accepted. |
| Form settings | On or off, fields shown, fields required, button label, option choices, labels for the spare fields, thank-you message. |
| Button destination | Used only when the form is off. |
| Start and stop | Date and time, Eastern. |
| Draft flag | A draft never shows to visitors. |
| Preview key | A random code that makes the preview link private. Never sent to visitors' browsers. |
| Rerun of | The offer this one was copied from, if any. |

### Form fields available to every offer
- Name, title, email, phone
- Company or organization, organization type
- Show name, show dates, show city, expected exhibitor count
- Option choice (a dropdown whose choices Michael writes per offer)
- How did you hear about this
- Message
- Three spare fields, each with a label Michael writes per offer

### Where it is stored
- Offers: Netlify Blobs (storage built into the host). Not in the repo. Preview deploys use separate "-test" stores so testing never touches live offers.
- Leads: Netlify Forms, under the form named "offers". Exportable as a spreadsheet from Netlify.
- Most sensitive data held: a lead's name, email, phone and company.
- Retention: offers are kept until Michael deletes them. Leads follow Netlify's form retention.

## 6. Identity, auth and integrations
- Sign-in: one password, stored as a protected Netlify setting. Never in the code or the repo. To change it or recover from a forgotten one: set a new password in the Netlify setting and republish. There is no change-password screen.
- Sessions: a signed, secure cookie that expires after 12 hours. Five wrong passwords locks sign-in for 15 minutes. [CONFIRMED]
- Every admin action is checked on the server. The admin page alone grants nothing.
- Netlify Edge Functions: date check, forwarding, popup injection.
- Netlify Functions: sign-in and saving offers.
- Netlify Forms: submissions, spam filtering and the alert email.
- The existing netlify/functions/submission-created.mjs runs on every form submission. It ignores the offers form because the offers form never has a "guide" field.
- Alert email goes to michaelh@youravdept.com. [CONFIRMED]
- No new paid services and no new frameworks. Reading and writing Netlify Blobs needs Netlify's own small package, @netlify/blobs (pending Michael's approval, see DECISIONS).

## 7. Platforms and UX
- Desktop and mobile web.
- Popup: Polished tier, in Your AV Department branding (AV Navy #152B4A, Signal Teal #2AA4A2, Montserrat headings, Inter body; Inter is the body font on every page of this site, so the popup matches the page it sits on).
- Popup opens about 1.5 seconds after the page loads. [CONFIRMED]
- Once closed, it stays closed for that visitor for 7 days, with a small tab left on the page to reopen it. [CONFIRMED]
- Accessible: works by keyboard, closes on Escape, readable contrast, announced properly to screen readers.
- Admin screens: Functional tier, usable on a phone but designed for desktop.

## 8. The five objectives
- Security: server-checked password, sign-in lockout, no secrets in the repo, offer copy treated as plain text so it cannot inject code into the site, spam trap on the form, preview links protected by a random key.
- Stability: if offer storage cannot be read, visitors get the normal page. Every save keeps the previous version. Export gives Michael a backup he controls.
- Efficiency: a new offer takes about two minutes with no deploy. The check added to each page view is small and cached for up to a minute.
- User experience: one popup at most, easy to close, never reappears uninvited for a week, works on phones.
- Scalability: sized for about 50 offers a year across up to 20 pages. Nothing in the design caps the number of pages or offers.

## 9. Constraints
- Host: Netlify, project "your-av-dept" (site id 7b58fbd4-394f-4091-bc6d-29b4e3b6ff79), primary address youravdept.com. Forms are already enabled on the project.
- The site is static HTML with no build step. It is published from Michael's computer by deploy.ps1 (Netlify CLI, production). Preview deploys need their own script.
- Existing pages are not edited by this build. The module only adds files.
- Edits to an offer reach visitors within about a minute.
- New form field names need a deploy. The three spare fields are there to avoid that.
- Michael's time is the scarcest resource: target about two hours across the whole build.

## 10. Out of scope
- Changes to the wording or design of booth-proof.html or any other page.
- Payments, checkout or contract signing.
- Sending leads into Vantage or any CRM.
- Email sequences triggered by a submission.
- Writing the offers themselves.

## 11. Open questions
All resolved before Session 1.1:
- Address pattern: /offer/ plus the link name. [CONFIRMED]
- Repo folder: C:\01_AppDevelopment\12.Your-AV-Dept_Website. [CONFIRMED]
- Views and leads counts: in. [CONFIRMED]
- Alert address: michaelh@youravdept.com. [CONFIRMED]
- Access code on the industry group offer: no. [CONFIRMED]
- Times are Eastern; start defaults to 12:00 AM, stop to 11:59 PM; a rerun keeps the same link; one popup design. [CONFIRMED]
- Netlify's monthly form submission allowance is enough: to be confirmed in Session 1.2.

## 12. Success criteria
- Michael's three Booth Proof offers are set up and running at once: the industry group offer on a private link, the 2027 offer for everyone through December 31, and the AV company offer on a private link through November 30.
- Each offer was created in the admin screen with no file copied and no deploy.
- A test submission from each preview link arrives as an alert that names the right offer and is marked as a test.
- A private link opened outside its dates lands on /booth-proof.html with no flash of the offer.
- The admin screen and its actions refuse anyone who is not signed in.
- With offer storage switched off in a test, the site's pages still load normally.
