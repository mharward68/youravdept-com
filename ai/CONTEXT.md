# CONTEXT: YAVD Offers Module

Updated: 2026-10-10, Session 1.1 (Read the repo and freeze the contracts)

## Where things stand
- Nothing of the module is built or deployed. The live site is unchanged.
- Contracts frozen: shared/offer-contract.js, CONTRACT_VERSION 1.0.0. Loads in Node 22 with 30 of 30 checks passing.
- Scope, plan and run sheet now live in ai/ and are the source of truth.

## What this session did
- Read the repo: pages, _redirects, _headers, deploy.ps1, .gitignore, README.md, submission-created.mjs, git log, Netlify CLI state.
- Found 12 corrections (table at the top of ai/phases/phase-1-offers-module.md). No build step or framework: the plan stands.
- Files created: shared/offer-contract.js, ai/spec/offers-scope.md, ai/phases/phase-1-offers-module.md, ai/phases/phase-1-RUNSHEET.md, ai/CONTEXT.md, ai/BUILD_NOTES.md, ai/DECISIONS.md. No existing file edited.

## Assumptions made (logged in DECISIONS)
- Test data goes to "-test" stores on every non-production deploy.
- Popup body font Inter. offer-admin.html stays out of the site map.

## Needed from Michael before 1.2
1. Deploy exclusion: OK to add 'ai' to $ExcludeDirs in deploy.ps1? (Otherwise 1.2 adds a 404 rule for /ai/*.)
2. Dependency: OK to add @netlify/blobs (Netlify's own package, pinned) and a minimal package.json?
3. Git: run the block below and paste the output into the 1.2 conversation.
4. The first admin password, 12+ characters (you type it into Netlify yourself in 1.2; never paste it into chat).

```
cd C:\01_AppDevelopment\12.Your-AV-Dept_Website
git status --short
git log --oneline -3
```

## Open items
- C12: files modified after the 7:16 AM backup commit; not verified.
- Deploy context string for a CLI draft deploy (1.2).
- Whether the hidden "subject" field sets Netlify's alert subject (1.2).

## Estimate vs actual
Session 1.1: estimated S, actual S (about 20 minutes build). Michael's time: about 5 minutes (reading the corrections and answering the four items above).

## Next step
Session 1.2: Netlify setup. New conversation, paste the run sheet block with "1.2" on line 1.
