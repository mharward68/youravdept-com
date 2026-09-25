# youravdept.com

Static marketing site for Your AV Department. No build step: every page is a
self-contained HTML file with its CSS, JS, and images inlined.

## Pages

| File | Purpose | Indexed |
|---|---|---|
| `index.html` | Home | yes |
| `why-is-av-so-expensive.html` | Long-form article | yes |
| `our-story.html` | The Old Commoditized Way vs. Your AV Department | yes |
| `library/index.html` | The Library | yes |
| `library/the-levers-of-labor.html` | The Levers of Labor, free guide | yes |
| `library/av365.html` | AV365, free guide (form `av365`, guide `AV365`) | yes |
| `field-notes/index.html` | Field Notes, ungated tips listing with tag filter (`?tag=travel`) | yes |
| `field-notes/road-warrior-sanity-kit.html` | Field Note: The Road Warrior's Sanity Kit | yes |
| `field-notes/you-can-make-an-app-for-that.html` | Field Note: You Can Make an App for That | yes |
| `library/pdf/the-levers-of-labor.pdf` | The Levers of Labor PDF (download button and welcome email link here) | no (see `_headers`) |
| `library/pdf/av365.pdf` | AV365 PDF (download button and welcome email link here) | no (see `_headers`) |
| `event-playlists.html` | Event playlists | yes |
| `meeting-planner-wellness-playlists.html` | Wellness playlists | yes |
| `onyva-welcome.html` | Onyva download landing page for frequent travelers | yes |
| `onyva-landing.html` | Redirect stub to `onyva-welcome.html` (301 in `_redirects`) | no |
| `onyva-conference-pilot.html` | Onyva Conference Pilot Program | yes |
| `onyva.html` | Onyva Quick Start Guide, travelers | noindex |
| `onyva-download.html` | Onyva as a digital gift | noindex |
| `michaelh.html` + `michaelh.vcf` | Michael Harward digital card | noindex |
| `trishah.html` + `trishah.vcf` | Trisha Harward digital card | noindex |

The `.vcf` files must deploy alongside the HTML or the "Save to Contacts"
buttons will 404.

## Hidden pages

The noindex pages carry no nav or footer links. They are reached by the site
map easter egg: click the footer copyright line 5 times within 2 seconds.
All thirteen pages that carry the site map modal list the same 17 entries, in
alphabetical order (punctuation ignored). Every page on the site belongs in it. The pages
under `library/` and `field-notes/` use `../` prefixes for the root-level links.

## Conventions

- Brand tokens live in each page's `:root` block and are identical across pages.
  Navy `#152B4A`, teal `#2AA4A2`, headings Montserrat 800, body Inter.
- Every AV call to action links to `https://calendar.app.google/Do7aNUGLhraagUKV6`.
  Page JS intercepts any `a.btn[href*="calendar.app.google"]` click and opens the
  Strategic Review modal; the href is the no-JS fallback.
- Onyva calls to action on `onyva-welcome.html` link to `https://your-av-dept.onyva.life`.
- Editing one page's `:root` or site map means editing all of them. There is no
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
that has a header (not the footer), and from the site map. The header switches
to the menu button below 1200px wide so the six nav links never wrap. Each note has exactly one CTA, a navy block
reading "If you ___, why don't you book a call and see if we can ___ your AV
process. It's free...the call and the services!" with a "How is it free?" link to
`index.html#why-free`. Tags live on each listing card (`data-tags`, slugged) and
the filter chips are generated from them, so a new tag needs no JS change. To add
a note, copy `road-warrior-sanity-kit.html`, add its card to `field-notes/index.html`,
and add it to every site map.

## Deploying

Run `.\deploy.ps1` from this folder instead of `netlify deploy` directly. The
Netlify CLI ignores `.gitignore` and uploads everything in the folder, so the
script copies the site to a temp folder without `Claude outputs`, `claude`,
`docs`, and working files (`.docx`, `.patch`, `.gs`, this README), then deploys
that copy. The same folders are listed in `.gitignore` so they never reach GitHub.
Keep private files (business plans, drafts) outside this folder entirely.
