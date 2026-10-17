# PHASE 2 RUN SHEET
Key Actions Dashboard. youravdept.com: one private page showing the actions on the site that turn into business.

## Source of truth
The authoritative copy is ai/phases/phase-2-RUNSHEET.md in the website folder. The Google Doc "YAVD Key Actions Dashboard: Scope, Build Plan and Runsheet" is generated from it; if they disagree, the repo file wins and the doc is regenerated, not edited. Delete both at phase close.

## Read this first
- Scope approved 2026-10-13. Plan written. Next is Session 2.1.
- Google Analytics is not on the site. That is Bob's track and is not part of this phase.
- Nothing reaches the live site until Session 2.8, and only after you say go.

## Steps
| Step | What | Output |
|---|---|---|
| 0 | Intake | Not needed: the scope was written from the code |
| 1 | Plan | Done: ai/phases/phase-2-activity.md |
| 2 | Build, one session per conversation | The dashboard |
| 3 | Close | Live dashboard, backup, handoff (inside Session 2.8) |

Each step is a new conversation. Connect C:\01_AppDevelopment\12.Your-AV-Dept_Website first. Attach nothing: every prompt reads the repo itself.

## Step 2: Run the sessions
1. Start a new conversation.
2. Connect the website folder.
3. Paste the block below with the session number on line 1.
4. At the end it tells you the next number. Only line 1 ever changes.

```
Mark, run Session 2.1 from ai/phases/phase-2-activity.md.

BOOT: report in 5 lines or fewer:
1. The plan's Parameters and Hard limits: what constrains this session,
   and which Hard limits it's likely to touch
2. ai/CONTEXT.md: where the last session ended, open items
3. ai/BUILD_NOTES.md: the map, plus anything relevant here
4. This session and the frozen contracts (shared/activity-contract.js
   once 2.1 has run; shared/offer-contract.js is frozen throughout)
5. Confirm compartment, goal, done-when, and inputs needed from me

Treat the documents as evidence, not scripture. If one contradicts the
code, the CODE WINS: say so and correct the document.

Ask only what blocks you, all at once, before starting. Anything
reversible: pick the simplest option, log it, keep moving.

EXECUTE
- Stay in this session's compartment. Other work goes to the backlog.
- Do not change a frozen contract. If it must change, STOP and tell me.
- Hard limits are absolute. Do not publish to the live site.
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
- [ ] 2.1 Freeze the contract · S · ~5 min
- [ ] 2.2 Counting endpoint and day store · M · ~5 min
- [ ] 2.3 Count every form submission · S · ~5 min
- [ ] 2.4 Page counts, sources and card taps · L · ~10 min
- [ ] 2.5 Report and export · M · ~5 min
- [ ] 2.6 The Activity page · L · ~20 min
- [ ] 2.7 Tagged QR codes for the cards · S · ~5 min (can be cut)
- [ ] 2.8 Go live and close the phase · M · ~25 min

## What to have ready
- Before 2.1: the backup tag (below).
- Before 2.4: the second backup tag.
- Before 2.7: the YAD-QR-standard.png file, or the folder it lives in.
- Before 2.8: a minute to request one guide yourself, and your go to publish.

## Step 3: Close the phase
Session 2.8 does the close. If it runs out of time, start a new conversation and paste:

```
Mark, close Phase 2 (Key Actions Dashboard) of youravdept.com.

1. Verify every success criterion in ai/spec/key-actions-scope.md. Paste real output.
2. Compare the plan's estimates with the actuals in ai/archive.
3. Trim ai/BUILD_NOTES.md and refresh its map against the real files.
4. Check the frozen contracts against the code and list any drift.
5. One line each on security, stability, efficiency, user experience, scalability.
6. Write ai/CONTEXT.md as a handoff: what exists, what is deferred.
7. Tell me exactly what to back up and the file name to use.
8. Say what is actually next.
```

## Standing reminders
**Before each session**
- Connect the website folder before pasting.
- Test on https://offers--your-av-dept.netlify.app (the test deploy), never youravdept.com.
- Use a private browser window when checking counts, so an earlier visit or a closed offer popup does not get in the way.

**Backup points, don't skip these**
```powershell
cd C:\01_AppDevelopment\12.Your-AV-Dept_Website
git tag pre-activity-20261013
```
```powershell
cd C:\01_AppDevelopment\12.Your-AV-Dept_Website
git tag pre-activity-pages
```
- 2.8: before the live publish, and Export on /activity after.

**If something goes wrong**
- A session stops for a frozen contract: that is correct. Decide, amend the plan, rerun.
- Three strikes on one error: let it stop and read what it thinks is wrong.
- Work outside the compartment: let it go to the backlog.
- Counting misbehaves on the live site: redeploy from the pre-activity-pages tag. Pages and forms work either way.
