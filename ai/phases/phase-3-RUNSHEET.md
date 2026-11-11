# PHASE 3 RUN SHEET
Offer Images. youravdept.com Offers Module: add one picture to an offer, show it in the popup, clean it up automatically.

## Source of truth
The authoritative copy is ai/phases/phase-3-RUNSHEET.md in the website folder. Any Google Doc or Word copy is generated from it; if they disagree, the repo file wins and the copy is regenerated, not edited. Delete both at phase close.

## Read this first
- Scope approved 2026-11-10 (ai/spec/offer-images-scope.md). Plan written: ai/phases/phase-3-offer-images.md. Next is Session 3.1.
- This phase is independent of Phase 2 (Key Actions Dashboard, planned, not started). Either can go first. Do not deploy both at once.
- ai/CONTEXT.md still describes the Phase 1 close. Session 3.1 archives it and writes the new one.
- Nothing reaches the live site until Session 3.12, and only after you say go. All testing is on https://offers--your-av-dept.netlify.app.
- Each session ends with its next number and its tag. Two sessions stop for you: after 3.8 and after 3.11.

## Steps
| Step | What | Output |
|---|---|---|
| 0 | Intake | Not needed: the scope was written from the code |
| 1 | Plan | Done: ai/phases/phase-3-offer-images.md and this sheet |
| 2 | Build, one session per conversation | Image upload, popup display and cleanup |
| 3 | Close | Live feature, backup, handoff (inside Session 3.12) |

Each step is a new conversation. Connect C:\01_AppDevelopment\12.Your-AV-Dept_Website first. Attach nothing: every prompt reads the repo itself.

## Step 2: Run the sessions
1. Start a new conversation.
2. Connect the website folder.
3. Paste the block below with the session number on line 1.
4. At the end it tells you the next number and its tag. Only line 1 ever changes.

```
Mark, run Session 3.1 from ai/phases/phase-3-offer-images.md.

BOOT: report in 5 lines or fewer:
1. The plan's Parameters and Hard limits: what constrains this session,
   and which Hard limits it's likely to touch
2. ai/CONTEXT.md: where the last session ended, open items
3. ai/BUILD_NOTES.md: the map, plus anything relevant here
4. This session and the frozen contract (shared/offer-contract.js 1.3.0
   once 3.1 has run)
5. Confirm compartment, goal, done-when, and inputs needed from me

Treat the documents as evidence, not scripture. If one contradicts the
code, the CODE WINS: say so and correct the document.

Ask only what blocks you, all at once, before starting. Anything
reversible: pick the simplest option, log it, keep moving.

EXECUTE
- Stay in this session's compartment. Other work goes to the backlog.
- Do not change a frozen contract. If it must change, STOP and tell me.
- Hard limits are absolute. Do not publish to the live site before 3.12.
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
7. Give me the PowerShell block to commit and tag (starts with cd, tag session-3.N)
8. Tell me the next session number and its tag. Do not run it in this conversation.
```

If you run a foreman that starts a helper per session: run each session on a fresh helper unless the one just finished is tagged CONTINUE (then send the next session to the same helper). After each session read its tag in the list below. CLEAR: fresh helper, no stop. APPROVE: stop, say exactly what to look at or do, wait for "go", next session on a fresh helper. A Hard Limit, three failed tries, or a step that needs you overrides any tag.

Needs Michael:
- After 3.8: look at the placement review page (6 screens, Back and Next).
- After 3.11: deploy to TEST, run the verify script, look on a phone and a computer, paste the verdict, say go.
- During 3.12: your go to publish, and your first real picture.

## The sessions
Tags: CONTINUE (green) next session extends what this one just wrote, same helper. CLEAR (red) different area or heavy output, fresh helper, no stop. APPROVE (blue) the run stops for you.

- [x] 3.1  Freeze the contract (1.3.0) · S · ~5 min · **CLEAR** (next is pure byte-reading code)
- [x] 3.2  Read and check an image · M · ~5 min · **CLEAR** (next is storage, unrelated)
- [x] 3.3  The image store · S · ~5 min · **CONTINUE** (3.4 imports exactly this)
- [x] 3.4  Upload and view routes · M · ~5 min · **CLEAR** (next is offer rules; long test output)
- [ ] 3.5  The image on an offer · M · ~5 min · **CONTINUE** (3.6 reads the references this defines)
- [ ] 3.6  Automatic cleanup · M · ~5 min · **CLEAR** (heavy output; next is the export)
- [ ] 3.7  Export with pictures · M · ~5 min · **CLEAR** (next is the popup)
- [ ] 3.8  The popup shows the image · M · ~10 min · **APPROVE** (your look at three placements on desktop and phone)
- [ ] 3.9  Editor image block · L · ~5 min · **CONTINUE** (3.10 extends this editor state)
- [ ] 3.10 Save, replace, remove, rerun · M · ~5 min · **CLEAR** (next is deploy tooling)
- [ ] 3.11 Test deploy and verification · M · ~25 min · **APPROVE** (you deploy to TEST, run the script, look, say go)
- [ ] 3.12 Go live and close the phase · M · ~25 min · phase done, stop and notify

Reserve (only if a review creates follow-up work): 3.8b, 3.9b, 3.10b, 3.11b.

## What to have ready
- Before 3.1: the backup tag (below).
- Before 3.5: the second backup tag.
- Before 3.8: nothing. You will be asked to step through a review page after it.
- Before 3.11: a phone and a computer, a few pictures of your own (one big photo, one PNG, one WebP if you have it), and a new private browser window.
- Before 3.12: your go to publish, and the picture you want on your first real offer.
- Question to answer before 3.12: should the README get a short Offers Module and images paragraph? (It is an existing file, so I only touch it with your OK. Default: leave it.)

## Step 3: Close the phase
Session 3.12 does the close. If it runs out of time, start a new conversation and paste:

```
Mark, close Phase 3 (Offer Images) of youravdept.com.

1. Verify every success criterion in ai/spec/offer-images-scope.md section 12. Paste real output.
2. Compare the plan's estimates with the actuals in ai/archive.
3. Trim ai/BUILD_NOTES.md and refresh its map against the real files.
4. Check the frozen contract (shared/offer-contract.js 1.3.0) against the code and list any drift.
5. One line each on security, stability, efficiency, user experience, scalability.
6. Write ai/CONTEXT.md as a handoff: what exists, what is deferred.
7. Tell me exactly what to back up and the file name to use.
8. Say what is actually next, and ask whether to make the Build Document for the next phase.
```

What the next phase needs: Phase 2 (Key Actions Dashboard) is already planned and approved, so it can start at Session 2.1 with no intake. Re-read its Hard limit that offer-contract.js stays frozen: it is now at 1.3.0.

## Standing reminders
**Before each session**
- Connect the website folder before pasting.
- Test on https://offers--your-av-dept.netlify.app (the TEST address), never youravdept.com.
- Use a NEW private browser window when you look at the popup or the editor. The browser keeps old copies of the popup and editor scripts and a closed popup is remembered for 7 days.
- The checks run test files by path. Passing the whole folder fails on Node 22.

**Backup points, don't skip these**
```powershell
cd C:\01_AppDevelopment\12.Your-AV-Dept_Website
git tag pre-images-20261111
```
```powershell
cd C:\01_AppDevelopment\12.Your-AV-Dept_Website
git tag pre-images-record
```
- 3.12: Export on /offer-admin and the tag before the live publish, and Export again after your first real picture. Keep the export files private (they hold preview keys and now the pictures).

**If something goes wrong**
- A session stops for the frozen contract: that is correct. Decide, amend the plan, rerun.
- Three strikes on one error: let it stop and read what it thinks is wrong.
- Work outside the compartment: let it go to the backlog.
- A 5xx whose page says "Error - Request ID": Netlify's own error, the request never reached the app. Send it again.
- A picture will not upload: the message says why (type, size, or storage). The offer text is saved either way.
- Problem on the live site after 3.12: set the offer to draft, or redeploy the previous production deploy in Netlify. Pictures already stored are harmless.
