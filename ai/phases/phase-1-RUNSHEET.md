# PHASE 1 RUN SHEET

YAVD Offers Module. Your AV Department: run several dated offers on any page of youravdept.com from one password-protected screen.

## Source of truth
The authoritative copy is `ai/phases/phase-1-RUNSHEET.md` in the repo (copied in Session 1.1 on 2026-10-10). The Google Doc "YAVD Offers Module" and the Claude Project copy are now secondary: if they disagree with the repo, the repo wins and the copy is the one to correct. Delete this run sheet when the phase closes.

## Read this first
- Test address for every session: https://offers--your-av-dept.netlify.app (run .\deploy-preview.ps1 to update it).
- Secrets go into the Netlify screen only. Never into PowerShell prompts or chat.
- Nothing reaches the live site until Session 1.10.

## Steps
| Step | What | Output |
|---|---|---|
| 0 | Approve the scope | Done 2026-10-09 |
| 1 | Plan | Done. ai/phases/phase-1-offers-module.md |
| 2 | Build, one session per conversation | The module |
| 3 | Close: verify, calibrate, curate, hand off | Live module and a backup |

Each step is a new conversation. Connect C:\01_AppDevelopment\12.Your-AV-Dept_Website first. Attach nothing: every prompt reads the repo itself.

## Step 2: Run the sessions
1. Start a new conversation.
2. Connect the repo folder.
3. Paste the block below with the session number on line 1.
4. At the end it tells you the next number. Only line 1 ever changes.

```
Mark, run Session 1.2 from ai/phases/phase-1-offers-module.md.

BOOT: report in 5 lines or fewer:
1. The plan's Parameters and Hard limits: what constrains this session
2. ai/CONTEXT.md: where the last session ended, open items
3. ai/BUILD_NOTES.md: the map, plus anything relevant here
4. This session and the frozen contracts in shared/offer-contract.js
5. Confirm compartment, goal, done-when, and inputs needed from me

Treat the documents as evidence, not scripture. If one contradicts the
code, the CODE WINS: say so and correct the document.

Ask only what blocks you, all at once, before starting. Anything
reversible: pick the simplest option, log it, keep moving.

EXECUTE
- Stay in this session's compartment. Other work goes to the backlog.
- Do not change a frozen contract. If it must change, STOP and tell me.
- Do not edit an existing page. Do not publish to the live site.
- Hold security, stability, efficiency, user experience and scalability.
- THREE STRIKES: three failed tries at the same error, stop and report.

VERIFY: run the session's "Done when" checks and paste the REAL OUTPUT.
If you did not run it, say so.

END OF SESSION, every step, in order:
1. Move ai/CONTEXT.md to ai/archive/YYYY-MM-DD_HHMM_CONTEXT.md
2. Write a fresh one-page ai/CONTEXT.md
3. One line: estimated size against actual, and how much of my time it took
4. Add to ai/BUILD_NOTES.md only what a future session would waste time rediscovering
5. Say whether this session created or changed any stored data, and whether it is backed up
6. Short summary in chat, with anything from "Needs my eyes"
7. Tell me the next session number. Do not run it in this conversation.
```

## The sessions
- [x] 1.1  Read the repo and freeze the contracts. Small, about 5 min of your time
- [x] 1.2  Netlify setup. Medium, about 15 min (took about 70 min of your time)
- [ ] 1.2b Lead alert through Resend. Small, about 5 min (needs your OK: edits submission-created.mjs)
- [x] 1.3  Sign-in. Medium, about 5 min (built 2026-10-10; draft check: run Claude outputs\session-1.3-verify.ps1)
- [x] 1.4  Saving and listing offers. Large, about 5 min (done 2026-10-10, verified; took about 15 min of your time; added the restore address, contract 1.1.0)
- [x] 1.5  Offer links, dates and forwarding. Large, about 10 min (done 2026-10-10, verified 15/15 on the second run; took about 10 min of your time)
- [x] 1.6  The popup. Large, about 20 min (done 2026-10-10; took about 30 min of your time, including the collapsed reopen tab you asked for)
- [x] 1.7  Admin dashboard. Large, about 15 min
- [x] 1.8  Offer editor, rerun and preview. Large, about 20 min (built 2026-10-10; your own run-through still to do)
- [ ] 1.9  Views and leads counts. Medium, about 5 min (optional)
- [ ] 1.10 Go live and close the phase. Medium, about 25 min

## What to have ready
- Before 1.3: OFFER_ADMIN_PASSWORD added in Netlify (Project configuration > Environment variables; secret; Functions; Production, Deploy Previews, Branch deploys). Type it only into Netlify.
- Before 1.10: final popup copy, dates and link names for the three Booth Proof offers.

## Step 3: Close the phase
Session 1.10 does the close. If it runs out of time, start a new conversation and paste this.
```
Mark, close Phase 1 of the YAVD Offers Module.

1. Verify every success criterion in ai/spec/offers-scope.md. Paste real output.
2. Compare the plan's estimates with the actuals in ai/archive.
3. Trim ai/BUILD_NOTES.md and refresh its map against the real files.
4. Check the frozen contracts against the code and list any drift.
5. One line each on security, stability, efficiency, user experience, scalability.
6. Write ai/CONTEXT.md as a handoff: what exists, what is deferred.
7. Tell me exactly what to back up and the file name to use.
8. Say what is actually next.
```

## Standing reminders

### Before each session
- Connect the repo folder before pasting.
- Test on the draft deploy address the session gives you (from deploy-preview.ps1), not on youravdept.com. Never run deploy.ps1 before 1.10: it publishes to production.
- Use a private browser window when checking a popup, so a popup you closed earlier does not stay hidden.

### Backup points
- Before 1.1: done (commit 2026-10-10 7:16 AM).
- After 1.4: export the offers once saving works.
- 1.10: before the live publish, and an export after the three offers are entered.

### If something goes wrong
- A session stops for a frozen contract: that is correct. Decide, amend the plan, then rerun.
- Three strikes on one error: let it stop and read what it thinks is wrong.
- Session 1.5's spike fails: the fallback touches existing pages, so it waits for your approval.
- A popup misbehaves on the live site: set the offer to draft in the admin screen. That removes it within a minute.
