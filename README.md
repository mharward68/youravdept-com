# youravdept.com

Static marketing site for Your AV Department. No build step: every page is a
self-contained HTML file with its CSS, JS, and images inlined.

## Pages

| File | Purpose | Indexed |
|---|---|---|
| `index.html` | Home | yes |
| `why-is-av-so-expensive.html` | Long-form article | yes |
| `our-story.html` | The Old Commoditized Way vs. Your AV Department | yes |
| `how-we-get-paid.html` | How Your AV Department Gets Paid. No nav link; reached by "Read more..." in The Model section on Home | yes |
| `venue-docs-offer.html` | Copy of `how-we-get-paid.html` whose buttons read "Get My RFP Documents, Free" and go to `show-info.html`. No nav link. Keep its copy in step with `how-we-get-paid.html` | noindex |
| `show-info.html` | Show details form for the free venue documents offer (Netlify form `venue-docs-free-offer`, no `guide` field so no auto email) | noindex |
| `fix-my-av-budget.html` | Help! Fix My AV Budget landing page. In the header nav and mobile menu on every page. Buttons open a booking modal for `https://calendar.app.google/nyswcGtXNqdS149r8` (its own booking page, not the Strategic Review one) | yes |
| `just-the-audio/index.html` | Just the Audio landing page: a free tool that turns MP4, MOV and M4A recordings into MP3. Built from `library/av365.html` by `tools/build-landing.py` in the `19_mp4-mp3_converter` project; edit it there, not here | yes |
| `just-the-audio/app/` | Just the Audio itself (installable, works offline). Multi-file on purpose: it runs under a strict content security policy set in `netlify.toml`, so nothing can be inlined | noindex |
| `zipdrop-app/index.html` | ZipDrop by Your AV Department: free zip tool (drop files or folders, get a `DATE-TIME-NAME.zip`, always a normal download). Installable app (PWA, works offline) with `zipdrop-app/manifest.webmanifest`, `zipdrop-app/sw.js` and `zipdrop-app/icons/`. All work is done in the visitor's browser, nothing is uploaded. Linked in the menu under Free extras. `/zipdrop`, `/zipdrop/` and `zipdrop.html` redirect here (the app is NOT at `/zipdrop/` because a folder and a page with the same name make Netlify loop). After changing `index.html`, bump `VERSION` in `sw.js` so installed copies update. `zipdrop.html` and `zipdrop/index.html` are only redirect stubs | yes |
| `just-the-audio-activity.html` | Private Just the Audio activity page for Michael: live visits, installs and files converted. Asks once per browser for the key in JUST_THE_AUDIO_STATS_KEY. Source in the `19_mp4-mp3_converter` project, `mp3-mp4_app/site-pages/` | noindex |
| `library/index.html` | The Library | yes |
| `library/the-levers-of-labor.html` | The Levers of Labor, free guide | yes |
| `library/av365.html` | AV365, free guide (form `av365`, guide `AV365`) | yes |
| `library/12-av-concessions.html` | 12 AV Concessions to Ask Before You Sign, free guide (form `av-concessions`, guide `12 AV Concessions`) | yes |
| `field-notes/index.html` | Field Notes, ungated tips listing with tag filter (`?tag=travel`) | yes |
| `field-notes/road-warrior-sanity-kit.html` | Field Note: The Road Warrior's Sanity Kit | yes |
| `field-notes/you-can-make-an-app-for-that.html` | Field Note: You Can Make an App for That | yes |
| `library/pdf/the-levers-of-labor.pdf` | The Levers of Labor PDF (download button and welcome email link here) | no (see `_headers`) |
| `library/pdf/av365.pdf` | AV365 PDF (download button and welcome email link here) | no (see `_headers`) |
| `library/pdf/12-av-concessions.pdf` | 12 AV Concessions PDF (download button and welcome email link here) | no (see `_headers`) |
| `playlists-events.html` | Event playlists | yes |
| `playlists-meeting-planner-wellness.html` | Wellness playlists | yes |
| `onyva-welcome.html` | Onyva download landing page for frequent travelers | yes |
| `onyva-landing.html` | Redirect stub to `onyva-welcome.html` (301 in `_redirects`) | no |
| `onyva-conference-pilot.html` | Onyva Conference Pilot Program | yes |
| `onyva.html` | Onyva Quick Start Guide, travelers | noindex |
| `onyva-download.html` | Onyva as a digital gift | noindex |
| `michaelh.html` + `michaelh.vcf` | Michael Harward digital card | noindex |
| `trishah.html` + `trishah.vcf` | Trisha Harward digital card | noindex |
| `booth-proof.html` | Booth Proof product page: $11,250 flat plus travel, 10 videos a day guaranteed. Permanent and orphaned; offers get their own pages and link back here. Standalone page: no header or footer. Buttons go to `booth-proof-dates.html` | noindex |
| `booth-proof-dates.html` | Booth Proof show dates form for the product page (Netlify form `booth-proof-dates`, no `guide` field so no auto email). Standalone page | noindex |
| `booth-proof-pilot.html` | Booth Proof Q4 2026 pilot offer (fee waived, travel only, apply by October 16). Was `booth-proof.html` until 2026-10-09. Standalone page. Buttons go to `booth-proof-apply.html` | noindex |
| `booth-proof-apply.html` | Booth Proof pilot application: short summary plus the intake form (Netlify form `booth-proof-pilot`, no `guide` field so no auto email). Standalone page | noindex |
| `admin.html` | Admin panel: sign-in, then Offers portal and Site map buttons. Opened by 5 clicks on the footer copyright line | noindex |
| `site-map.html` | Signed-in site map with Copy link and Take down. Built from the deployed pages | noindex |
| `utm-builder.html` | UTM link builder for Michael: pick a page, source, medium and campaign, get a tagged link to copy (history kept in the browser only). Standalone page, no GA tag so his own use is not counted. Served at `/utm-builder` (rule in `_redirects`, noindex and no-store headers in `netlify.toml`) | noindex |

The `.vcf` files must deploy alongside the HTML or the "Save to Contacts"
buttons will 404.

## Hidden pages and the admin panel

The noindex pages carry no nav or footer links. Click the footer copyright
line 5 times within 2 seconds on any page with a footer to open `/admin`.

- `admin.html` (`/admin`): sign in with the Offers admin password (same
  password and cookie as `/offer-admin`), then two buttons: Offers portal and
  Site map. Plain grey, no branding, noindex, no-store.
- `site-map.html` (`/site-map`): signed-in only. The page list comes from
  `/api/offers/site/pages`, which reads the deployed `.html` files, so a new
  page shows up on its own after a deploy. Nothing to edit when pages change.
  Each row has Copy link and Take down.
- Take down: first runs a link check (`/api/offers/site/links`): other pages
  linking to it, mentions in page code, `_redirects` rules, and offers on the
  page. Then you type the page's address to confirm. The file is NOT deleted:
  the `page-takedown` edge function sends its visitors to the home page (302)
  until Undo. Changes reach every edge server within about a minute. Pages that
  can never come down: home, `/admin`, `/site-map`, `/offer-admin`. A page
  with a scheduled (running or upcoming) offer cannot come down until that
  offer is saved as a draft.
- To delete a page for good: take it down, fix the links the check listed,
  delete the file, deploy, then Undo the takedown (the address now 404s or
  redirects as `_redirects` says).
- Storage: Netlify Blobs store `site-takedowns` (`site-takedowns-test` on draft
  deploys), key `all`. Shared rules: `shared/site-admin.js`. Server code:
  `netlify/functions/lib/site-admin.mjs` and the `site-*` and
  `offers-session` functions. Tests: `node --test netlify/tests/site-admin.test.mjs`.

The site map pop-up that used to be copied into twenty pages was removed on
2026-10-12.

## Conventions

- Brand tokens live in each page's `:root` block and are identical across pages.
  Navy `#152B4A`, teal `#2AA4A2`, headings Montserrat 800, body Inter.
- Every AV call to action links to `https://calendar.app.google/Do7aNUGLhraagUKV6`.
  Page JS intercepts any `a.btn[href*="calendar.app.google"]` click and opens the
  Strategic Review modal; the href is the no-JS fallback.
- Onyva calls to action on `onyva-welcome.html` link to `https://your-av-dept.onyva.life`.
- Editing one page's `:root` means editing all of them. There is no
  shared stylesheet.

## Hero chrome logo and flare lights (reversible)

The homepage hero logo is an inline SVG. The emblem has a chrome finish (mirror-style
horizon band, beveled edge highlights, a glint that sweeps across every 7
seconds); the wordmark and URL stay flat. Two flare lights that ride one lap of the emblem's ribbons,
through the play frame, half a lap apart. Logo colors never change. It is SVG
animation plus a tiny script that pauses it when the hero is off screen. All of
it sits in `index.html` between `YAVD-LOGO-LIGHTS:START` and
`YAVD-LOGO-LIGHTS:END` markers (one block each in the CSS, the hero HTML, and
before `</body>`). Visitors with reduced motion see the chrome logo without the
lights or glint.

Michael may want to reverse this. To remove it, either `git revert` the commit
"Hero chrome logo and flare lights", or delete the three marked blocks and
restore the hero line noted in the HTML START comment:
`<img class="hero-logo reveal is-visible" src=... alt="Your AV Department logo">`.

## Updating a guide

The guide PDFs are hosted on this site, not Google Drive. To publish a new
version, replace the file in `library/pdf/` under the same name, commit, and
deploy. The download buttons and the welcome emails pick it up automatically.

## Netlify config

- `_headers` keeps `library/pdf/*` out of search indexes and sets a 1 day cache.
- `_redirects` preserves the old `onyva-swag` URL and adds extensionless paths.

## Field Notes

Ungated, branded tips. Linked from the header nav and mobile menu on every page
that has a header (not the footer). The site map lists notes automatically. The header switches
to the menu button below 1300px wide so the seven nav links never wrap ("Help! Fix My AV Budget." sits after Who We Help and goes to `fix-my-av-budget.html`). Each note has exactly one CTA, a navy block
reading "If you ___, why don't you book a call and see if we can ___ your AV
process. It's free...the call and the services!" with a "How is it free?" link to
`index.html#why-free`. Tags live on each listing card (`data-tags`, slugged) and
the filter chips are generated from them, so a new tag needs no JS change. To add
a note, copy `road-warrior-sanity-kit.html` and add its card to `field-notes/index.html`.
The site map picks it up on the next deploy.

## Deploying

Run `.\deploy.ps1` from this folder instead of `netlify deploy` directly. The
Netlify CLI ignores `.gitignore` and uploads everything in the folder, so the
script copies the site to a temp folder without `Claude outputs`, `claude`,
`docs`, and working files (`.docx`, `.patch`, `.gs`, this README), then deploys
that copy. The same folders are listed in `.gitignore` so they never reach GitHub.
Keep private files (business plans, drafts) outside this folder entirely.
