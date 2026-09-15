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
| `library/pdf/the-levers-of-labor.pdf` | Guide PDF | no (see `_headers`) |
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
All ten pages that carry the site map modal list the same 13 entries, in
alphabetical order (punctuation ignored). Every page on the site belongs in it. The two
pages under `library/` use `../` prefixes for the root-level links.

## Conventions

- Brand tokens live in each page's `:root` block and are identical across pages.
  Navy `#152B4A`, teal `#2AA4A2`, headings Montserrat 800, body Inter.
- Every AV call to action links to `https://calendar.app.google/Do7aNUGLhraagUKV6`.
  Page JS intercepts any `a.btn[href*="calendar.app.google"]` click and opens the
  Strategic Review modal; the href is the no-JS fallback.
- Onyva calls to action on `onyva-welcome.html` link to `https://your-av-dept.onyva.life`.
- Editing one page's `:root` or site map means editing all of them. There is no
  shared stylesheet.

## Netlify config

- `_headers` keeps `library/pdf/*` out of search indexes and sets a 1 day cache.
- `_redirects` preserves the old `onyva-swag` URL and adds extensionless paths.
