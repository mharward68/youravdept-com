# PHASE 4 RUN SHEET
Offer Landing Pages. youravdept.com Offers Module: a branded landing page per offer at /offers/landing-name.html, found, edited and archived in the admin, with a standard expiration popup.

## Source of truth
The authoritative copy is ai/phases/phase-4-RUNSHEET.md in the website folder. Any Google Doc or Word copy is generated from it; if they disagree, the repo file wins and the copy is regenerated, not edited. Delete both at phase close.

## Read this first
- Scope approved 2026-11-23 (ai/spec/landing-pages-scope.md). Plan written: ai/phases/phase-4-landing-pages.md. Next is Session 4.1.
- This phase is independent of Phase 2 (Key Actions Dashboard, planned, not started). Do not deploy both at once.
- ai/CONTEXT.md still describes the Phase 3 close. Session 4.1 archives it and writes the new one.
- The offer contract is frozen at 1.3.0 until Session 4.1 bumps it to 1.4.0 (approved by the scope).
- Nothing reaches the live site until Session 4.16, and only after you say go. All testing is on https://offers--your-av-dept.netlify.app.
- Two sessions stop for you: after 4.10 (your look at the review page) and after 4.15 (TEST deploy, verify, look, go).
- Decision to check before 4.1: an offer with a landing page has its form turned off, and the popup button opens the page (plan Decision 1). Say so before 4.1 if you want the form kept.

## Steps
| Step | What | Output |
|---|---|---|
| 0 | Intake | Not needed: the scope was written from the code |
| 1 | Plan | Done: ai/phases/phase-4-landing-pages.md and this sheet |
| 2 | Build, one session per conversation | Landing pages, list, window, expiry, offer link |
| 3 | Close | Live feature, backup, handoff (inside Session 4.16) |

Each step is a new conversation. Connect C:\01_AppDevelopment\Your-AV-Dept_Website first. Attach nothing: every prompt reads the repo itself.

## Step 2: Run the sessions
1. Start a new conversation.
2. Connect the website folder.
3. Paste the block below with the session number on line 1.
4. At the end it tells you the next number and its tag. Only line 1 ever changes.

```
Mark, run Session 4.1 from ai/phases/phase-4-landing-pages.md.

BOOT: report in 5 lines or fewer:
1. The plan's Parameters and Hard limits: what constrains this session,
   and which Hard limits it's likely to touch
2. ai/CONTEXT.md: where the last session ended, open items
3. ai/BUILD_NOTES.md: the map, plus anything relevant here
4. This session and the frozen contract (shared/offer-contract.js 1.4.0
   once 4.1 has run)
5. Confirm compartment, goal, done-when, and inputs needed from me

Treat the documents as evidence, not scripture. If one contradicts the
code, the CODE WINS: say so and correct the document.

Ask only what blocks you, all at once, before starting. Anything
reversible: pick the simplest option, log it, keep moving.

EXECUTE
- Stay in this session's compartment. Other work goes to the backlog.
- Do not change a frozen contract. If it must change, STOP and tell me.
- Hard limits are absolute. Do not publish to the live site before 4.16.
- No new dependencies. No em dashes in anything written for me.
- Hold security, stability, efficiency, user experience and scalability.
- THREE STRIKES: three failed tries at the same error, stop and report.

VERIFY: run the session's "Done when" checks and paste the REAL OUTPUT.
Run test files by path (node --test netlify/tests/<file>.test.mjs).
If you did not run it, say so.

END OF SESSION, every step, in order:
1. Move ai/CONTEXT.md to ai/archive/YYYY-MM-DD_HHMM_CONTEXT.md
2. Write a fresh one-page ai/CONTEXT.md
3. One line: estimated size against actual, and how much of my time it took
4. Add to ai/BUILD_NOTES.md only what a future session would waste time rediscovering
5. Say whether this session created or changed any stored data, and whether it is backed up
6. Short summary in chat, with anything from "Needs my eyes"
7. Give me the PowerShell block to commit and tag (starts with cd, tag session-4.N)
8. Tell me the next session number and its tag. Do not run it in this conversation.
```

If you run a foreman that starts a helper per session: first start Claude Code in the website folder, then paste the foreman prompt once it is open.

```
cd C:\01_AppDevelopment\Your-AV-Dept_Website
claude
```

The foreman runs each session on a fresh helper unless the one just finished is tagged CONTINUE (then it sends the next session to the same helper). After each session it reads that session's tag in the list below. CLEAR: fresh helper, no stop. APPROVE: stop, say exactly what to look at or do, wait for "go", next session on a fresh helper. A Hard Limit, three failed tries, or a step that needs you overrides any tag. At an APPROVE stop you may type /clear in the foreman chat before saying "go": it reads the next step from ai/CONTEXT.md, not from its own memory.

Needs Michael:
- After 4.10: look at the review page (6 screens, Back and Next). Ask Andy to brand-check the first sample page.
- After 4.15: deploy to TEST, run the verify script, look on a phone and a computer, paste the verdict, say go.
- During 4.16: your go to publish, and the content of your first real landing page.

## The sessions
Tags: CONTINUE (green) next session extends what this one just wrote, same helper. CLEAR (red) different area or heavy output, fresh helper, no stop. APPROVE (blue) the run stops for you.

- [ ] 4.1  Freeze the contract (1.4.0) · S · ~5 min · **CLEAR** (next is pure validation code)
- [ ] 4.2  Landing rules (pure) · M · ~5 min · **CLEAR** (next is storage, unrelated)
- [ ] 4.3  The landing store · M · ~5 min · **CONTINUE** (4.4 imports exactly 4.2 and 4.3)
- [ ] 4.4  Landing admin routes · M · ~5 min · **CLEAR** (heavy test output; next is the cleanup risk)
- [ ] 4.5  Cleanup protects landing pictures · M · ~5 min · **CLEAR** (next is the offer rules)
- [ ] 4.6  Offers link to a landing page · M · ~5 min · **CLEAR** (next is the export)
- [ ] 4.7  Export includes landing pages · S · ~5 min · **CLEAR** (next is the page itself)
- [ ] 4.8  The landing page renderer · L · ~5 min · **CONTINUE** (4.9 serves exactly what this renders)
- [ ] 4.9  Serve the pages and keep popups off them · M · ~5 min · **CLEAR** (next is browser-side popup code)
- [ ] 4.10 The expiration popup and the review page · M · ~10 min · **APPROVE** (your look at 6 screens)
- [ ] 4.11 The Landing Pages list in the admin · M · ~5 min · **CONTINUE** (4.12 builds the window it opens)
- [ ] 4.12 The New and Edit window · L · ~5 min · **CONTINUE** (4.13 extends this window state)
- [ ] 4.13 Image drop and live preview · M · ~5 min · **CLEAR** (heavy Playwright output; next is the offer editor)
- [ ] 4.14 The offer editor: find or create the landing page · M · ~5 min · **CLEAR** (next is deploy tooling)
- [ ] 4.15 TEST deploy and verification · L · ~25 min · **APPROVE** (you deploy to TEST, run the script, look, say go)
- [ ] 4.16 Go live and close the phase · L · ~25 min · phase done, stop and notify

Reserve (only if a review creates follow-up work): 4.8b, 4.10b, 4.13b, 4.15b.

## TEST checklist (after 4.15)
One command deploys to TEST and runs every check (the session writes it; about 6 minutes):

    cd C:\01_AppDevelopment\Your-AV-Dept_Website
    & ".\Claude outputs\session-4.15-verify.ps1"

- When it says so, copy your admin password (it clears the clipboard first and never prints it).
- Already deployed this build and only want the checks again: add `-SkipDeploy`.
- It stops before deploying if GitHub has commits this folder lacks.
- The verdict block at the end must read every line PASS. A FAIL: paste everything to Mark.
- Then the look, each in a NEW private window, on your computer AND your phone (links printed at the end):
  - [ ] A running landing page: logo, headline, picture, copy, button, footer; nothing cut off.
  - [ ] An expired page: same page, the expiration popup opens, no page button, Escape and the close button work.
  - [ ] The Landing pages list in /offer-admin: search, filter, archive and restore.
  - [ ] The New Landing Page window: image drop, live preview, phone toggle.
  - [ ] An offer linked to a landing page: the popup button opens the page.
- Paste the verdict and say go (or say what looked wrong: that becomes 4.15b).

## What to have ready
- Before 4.1: the backup tag (below).
- Before 4.5: the second backup tag.
- Before 4.10: nothing. You will be asked to step through a review page after it.
- Before 4.15: a phone and a computer, a few pictures of your own (one big photo, one PNG), and a new private browser window.
- Before 4.16: your go to publish, and the content of your first real landing page (picture, headline, copy, button label and link).
- Question to answer before 4.1: keep Decision 1 (offer with a landing page has its form off)? Default: keep.

## Step 3: Close the phase
Session 4.16 does the close. If it runs out of time, start a new conversation and paste:

```
Mark, close Phase 4 (Offer Landing Pages) of youravdept.com.

1. Verify every success criterion in ai/spec/landing-pages-scope.md section 12. Paste real output.
2. Compare the plan's estimates with the actuals in ai/archive.
3. Trim ai/BUILD_NOTES.md and refresh its map against the real files.
4. Check the frozen contract (shared/offer-contract.js 1.4.0) against the code and list any drift.
5. One line each on security, stability, efficiency, user experience, scalability.
6. Write ai/CONTEXT.md as a handoff: what exists, what is deferred.
7. Tell me exactly what to back up and the file name to use.
8. Say what is actually next, and ask whether to make the Build Document for the next phase.
```

What the next phase needs: Phase 2 (Key Actions Dashboard) is already planned and approved but is two months old by then. Start with a short re-plan check: confirm its "Found" items against the code (offer-admin, the offers functions and the contract have changed in Phases 3 and 4), resolve open item 1, and recount sessions with the calibration from Phases 3 and 4. Re-read its Hard limit that offer-contract.js stays frozen: it will be at 1.4.0.

## Standing reminders
**Before each session**
- Connect the website folder before pasting.
- Test on https://offers--your-av-dept.netlify.app (the TEST address), never youravdept.com.
- Use a NEW private browser window when you look at a popup, a landing page or the editor. The browser keeps old copies of the scripts and a closed popup is remembered for 7 days.
- The checks run test files by path. Passing the whole folder fails on Node 22.

**Backup points, don't skip these**
```powershell
cd C:\01_AppDevelopment\Your-AV-Dept_Website
git tag pre-landings-20261123
```
```powershell
cd C:\01_AppDevelopment\Your-AV-Dept_Website
git tag pre-landings-record
```
- 4.15 and 4.16: the session gives you the tag and Export steps. Export on /offer-admin before the live publish, and Export again after your first real landing page. Keep the export files private (they hold preview keys and pictures).

**If something goes wrong**
- A session stops for the frozen contract: that is correct. Decide, amend the plan, rerun.
- Three strikes on one error: let it stop and read what it thinks is wrong.
- Work outside the compartment: let it go to the backlog.
- A 5xx whose page says "Error - Request ID": Netlify's own error, the request never reached the app. Send it again.
- A landing page will not save: the message says why. Nothing is half saved.
- Problem on the live site after 4.16: archive the page (it then shows the expiration popup) or set the offer to draft, or redeploy the previous production deploy in Netlify. Stored landing pages and pictures are harmless.
