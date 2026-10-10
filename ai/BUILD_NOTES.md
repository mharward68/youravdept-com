# Build notes: YAVD Offers Module

Only what a future session would waste time rediscovering.

## MAP
- Site: static HTML at the repo root, plus library/ and field-notes/. No build step. Every page inlines its own CSS and JS (no shared stylesheet). Brand tokens repeat in each page's :root.
- Netlify config: _redirects (pretty URLs as 200 rewrites, a few 301s), _headers (library PDFs). No root netlify.toml before 1.2. .netlify/netlify.toml is the CLI's generated copy: never edit it.
- Functions: netlify/functions/submission-created.mjs (existing, Resend guide mailer, runs on every form).
- Offers module: shared/offer-contract.js (frozen contract). ai/ holds the scope, plan, run sheet and these notes.
- Deploy: deploy.ps1 copies the folder to %TEMP%\youravdept-deploy minus its exclude list, then runs netlify deploy --prod --dir <staging> --functions netlify\functions. Production only.
- Repo: github.com/mharward68/youravdept-com, branch main. Netlify site id 7b58fbd4-394f-4091-bc6d-29b4e3b6ff79.

## Deploying
- deploy.ps1 is production. Never run it before Session 1.10. Draft deploys need deploy-preview.ps1 (created in 1.2).
- Anything in the folder that is not excluded becomes a public file. Excluded today: Claude outputs, claude, docs, .git, .netlify, node_modules, deploy.ps1, README.md, .gitignore, *.docx, *.patch, *.gs. Not excluded: ai/, shared/, netlify/ sources, package.json.

## Forms
- submission-created.mjs runs on every Netlify form submission. It skips forms with no "guide" field. Never add a "guide" field to the offers form.
- RESEND_API_KEY is already set on the site and Resend sends from michaelh@youravdept.com.
- Existing forms each have their own page and name (venue-docs-free-offer, booth-proof-dates, booth-proof-pilot, av365, av-concessions).

## Pages
- Pages are reachable at two addresses (/booth-proof and /booth-proof.html). Always compare through normalizePagePath().
- booth-proof.html: noindex, standalone (no header, footer or site map), no form; loads Montserrat 700/800 and Inter from Google Fonts.

## Environment for Claude sessions
- Session 1.1 had file list, stage and commit access to Michael's PC but no shell there: git and the Netlify CLI had to be run by Michael from PowerShell blocks. Check the tool list at boot.
