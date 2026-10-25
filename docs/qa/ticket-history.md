# QA: Ticket History (docs/specs/ticket-history.md)

Date: 2026-10-24
Tester: QA agent (independent re-run; developer's report not relied on)
Scope: the 28 acceptance criteria, the owner's specific checks, regressions, repo hygiene. No application code was modified.

## Verdict

**GO.** All 28 acceptance criteria pass. AC 25 deviates from its literal wording (Save closes the dialog), but it is met in substance; see "Notes for the owner". No blocking defects were found.

## Test runs

| # | Command / check | Where | Result |
|---|---|---|---|
| 1 | `npm test` (exit code captured) | `/Users/robertmichaels/Documents/code/projectmanagement` | exit 0; tests 126, pass 126, fail 0, cancelled 0, skipped 0, todo 0 |
| 2 | `npm test` again, after all live runs | same | exit 0; 126 / 126 (confirms the suite is stable) |
| 3 | Clean install: tracked + untracked-not-ignored files copied to scratch (no `node_modules`), `npm ci` then `npm test` | `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/clean` | `npm ci` exit 0 (npm 11 warns that `better-sqlite3` install scripts are not approved; pre-existing dependency setup, not this feature); `npm test` exit 0; 126 / 126 |
| 4 | Live API script, 34 checks against a scratch server on port 3055 with DB_PATH on a copy of the owner's DB | `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/live-api.js` | 34 PASS, 0 FAIL |
| 5 | Headless Chrome 155 driven over DevTools (scratch profile), against the same scratch server | `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-drive.js`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-drive2.js` | 44 PASS + 9 PASS, 0 FAIL, 0 page or console errors |
| 6 | Migration on a copy of `data/app.db` | `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/migrate-check.js` | see "Migration" below |
| 7 | Hygiene: `git check-ignore` on the 10 new files; `git status` | repo | no new file is ignored |

Node: v26.7.0 (package.json requires >=20). Scratch folder: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad`.

Owner data and ports: `data/app.db` was never opened by QA. The only operations on it were a SHA-1 hash, `stat`, and `cp` to scratch. Its SHA-1 was `9894f2167ba62e84f4437efdbf3e9acc42d3b5cb` before and after the whole run, and its mtime stayed at 20:41:10. Ports 3000 (PID 61520) and 3001 (PID 81945) were not touched. QA's own server (PID 90208, port 3055) and Chrome (PID 91133, port 9333) were stopped by PID; both ports are now closed.

## Migration (scratch copy of the owner's DB)

- BEFORE: 5 tables, no history tables. Counts: issues 5, comments 1, users 4, projects 2. Integrity ok.
- AFTER first open: 7 tables; `issue_history_events` and `issue_history_changes` present; the three history indexes present. Events 0, changes 0 (no backfill, Decision 13). Counts unchanged. Integrity ok.
- AFTER reopen (second open): identical to the first. Idempotent.
- Browser and API check: an existing item's History shows "No history recorded yet." and the API returns `events: []`.

## Per-AC results

Method key: **Live** = scratch server API call; **UI** = headless Chrome run; **Test** = `npm test` test by name; **Src** = source test or grep.

### Recording (server)

| AC | Result | How verified |
|---|---|---|
| 1 | PASS | Live: create gives one `created` event, actor Alex Morgan, `changes: []`. UI: "created this work item". Test: "creating a work item writes one created event"; "a failing created event rolls back the create". Code: `createIssue` records inside its `db.transaction`. |
| 2 | PASS | Live: one PATCH changing Type, Priority and Assignee gives one event with three changes. Four invalid PATCHes (400) leave the count unchanged and the title unchanged. Test: "a failing write leaves the item unchanged and writes no event" (recorder forced to throw inside the transaction: 500, title and priority unchanged, no event). |
| 3 | PASS | Live: full-resend PATCH with identical values, empty `{}`, and same title: count 2 to 2. Test: "a PATCH that changes nothing writes no event". |
| 4 | PASS | Live: rank-only PATCH writes nothing; a Status move records Status and Resolution with no rank. UI: drop at the end of To Do (rank only) leaves the count at 2 to 2. Test: "rank is never recorded". |
| 5 | PASS | Live: `Assignee: null -> Blake Chen [ids null->2]`; `Epic: PMPO-8 QA epic E -> null [ids 9->null]`; cleared values stored as `null`, not "None"; Status, Priority, Type and Resolution as plain names. |
| 6 | PASS | Live: Description change has `kind: long`, old and new `null`. Title change stores both old and new text. |
| 7 | PASS | Live: To Do to Done gives one event with Status and Resolution `null -> Fixed`. Resolution-only Fixed to "Won't Do" gives one line. Done to In Progress gives Status and Resolution "Won't Do" to null in one event. UI: drag to Done shows both lines under one actor and time. |
| 8 | PASS (note) | UI: "Group by priority" drag records one Priority change (Medium to High). Status plus lane in one save is one PATCH and so one event (Live, multi-field). Assignee and epic lane drags were not run in the UI; the same fields are covered by Live PATCH. |
| 9 | PASS | Live: deleting an epic gives the child an Epic change (`PMPO-8 QA epic E -> null`, ids 9 to null) attributed to Alex. Epic type changed to Task: child gets Epic change, epic gets Type change `Epic -> Task`. |
| 10 | PASS | Live: DELETE gives 204, then history gives 404. DB check on the scratch copy: 0 events and 0 changes for the deleted ids, 0 orphan change rows, 0 events whose issue is gone. UI: Delete from the dialog removes the card. Test: "deleting a work item deletes its history". |
| 11 | PASS | Live: on an archived project, PATCH, POST and DELETE each give 409 and no event; history is still 200 with 2 events. Test: "blocked writes on an archived project write nothing". |
| 12 | PASS (note) | Live: body `actor_id`, `actor_name` and `user_id` ignored; actor is the session user (Alex). UI: signed in as Blake, the edit shows "Blake Chen". Unknown fallback: Test only ("with no signed-in user the actor is Unknown"). Not reachable live, because `requireUser` runs before every route. |
| 13 | PASS | Live: PATCH, PUT, DELETE and POST on `/api/issues/:id/history`, and PATCH and DELETE on `/history/:eventId`, all return 404. Test: "history cannot be edited or deleted through the API". Src: the history route defines only `GET`. |
| 14 | PASS | Live: comment create, edit and delete leave the count unchanged. UI: posting a message leaves the count unchanged. Test: "comments write no history". |

### Reading (API)

| AC | Result | How verified |
|---|---|---|
| 15 | PASS | Live: response is `{ events, has_more }`; event keys `id, kind, actor_id, actor_name, created_at, changes`; change keys `field, kind, label, new, new_id, old, old_id`; newest first; ids 999999, `abc`, 0 and -1 give 404 "Work item not found."; archived project history gives 200. |
| 16 | PASS | Live: default 50 with `has_more` true; `limit=30` gives 30; `limit=500` gives all 120 (no 400); `limit=100000` on 206 events gives 200 with `has_more` true. `limit=0`, `-1`, `abc`, `1.5`, empty and duplicated gave 400; `before=abc` and `before=0` gave 400. 120 events paged 50, 50, 20 with `has_more` false at the end, 120 unique ids. |
| 17 | PASS | Live: `field=status` returns only status-change events, each with one change, and no `created`. `field=bogus`, `created` and `rank` give 400 with `Unknown field: <key>`. |
| 18 | PASS | Live: `/api/history-fields` returns `type, title, description, status, priority, assignee, epic, resolution` with `key, label, kind`; no `rank`. |

### UI

| AC | Result | How verified |
|---|---|---|
| 19 | PASS | UI: Discussion and History tabs sit after Description (screenshot `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-history-open.png`). Discussion is selected on open; History is selected without a reload; Tab key reaches History; Enter activates it; on reopen after History was used, Discussion is selected again. |
| 20 | PASS | UI: "Loading..." shown while a delayed request is in flight, then the list. Injected 500 shows "Could not load history: boom" with a Retry button; Retry loads the list and hides the error. Item with no events shows "No history recorded yet.". |
| 21 | PASS | UI: lines read "created this work item", "changed Title from QA ui X to QA ui X edited", "changed Resolution from None to Fixed", and "changed Description" with no values. Timestamp reads `2026-10-24 20:53 (just now)`. Relative time: a stale span set to 3 hours ago reads "3 hours ago" after the 60-second timer, with no reload. |
| 22 | PASS | UI: a title of `<b>bold</b><script>window.__pwned = 1</script>` shows as literal text in History; no `<b>` or `<script>` element; the script did not run. Src: no `innerHTML` in History code. |
| 23 | PASS | UI: filter options are "All fields" plus the 8 fields from the API, in order. Choosing Title shows only title events, no `created`. Choosing All restores the full list (2). |
| 24 | PASS | UI: 50, then 100, then 120 items; the Show more button hides at the end; 120 unique `data-id` values. |
| 25 | PASS (substance; deviation) | Save closes the dialog (existing MVP behavior). The save sends a History refresh, which the close discards. Reopening the item shows History with the new event on top, because History is fetched fresh on each open. UI: "changed Title from QA ui X to QA ui X edited" on top after Save and reopen. A card drop cannot happen while the modal dialog is open. See "Notes for the owner". |
| 26 | PASS | UI, archived project 3: Save hidden; History tab and filter enabled; both events readable; filter works. |
| 27 | PASS | Src: `tests/source.test.js` scans the history files and the `board.js` history block for status, type, priority and resolution names. QA grep of `public/js/historyFormat.js`, the history block of `board.js`, `server/data/history.js`, `server/routes/history.js` found none. `server/historyFields.js` holds field names by design (spec Data model). |
| 28 | PASS | Test: `tests/history-extensibility.test.js` adds status "In Review", type "Spike", priority "Trivial" and resolution "Obsolete" and checks the recorded changes. Test: "every updatable column except rank has a history field". |

## Owner-specified checks

| Check | Result | Evidence |
|---|---|---|
| History written in the same transaction as the change | PASS | `createIssue`, `updateIssue`, `deleteIssue`, `releaseChildren` call the recorder inside the caller's `db.transaction`. Forced recorder throw rolls back the update (Test). |
| Failed or blocked change leaves no entry | PASS | Live: four 400s; three 409s on archived. |
| Archived-project writes leave none | PASS | Live and UI. |
| No-op saves and rank-only reorders write nothing | PASS | Live and UI. |
| Automatic resolution shares the event with the status | PASS | Live: one event with Status and Resolution. |
| Actor from session, never body | PASS | Live spoof; UI Blake. |
| Created entry on create | PASS | Live and UI. |
| Description recorded only as "changed" | PASS | Live and UI. |
| Assignee and epic keep id plus display snapshot | PASS | Live `[ids null->2]`, `[ids 9->null]`. |
| Epic delete and epic type change write Epic on each child | PASS | Live. |
| Deleting a work item deletes its history | PASS | Live, DB row counts, UI. |
| History tab next to Discussion (Discussion default); comments not duplicated | PASS | UI and Live. |
| `GET /history` limit, before, field validation; default 50; max 200; `has_more` | PASS | Live. |
| Read-only route | PASS | Live and Src. |
| Field filter and Show more | PASS | UI. |
| Text-only rendering | PASS | UI. |
| Archived projects readable | PASS | Live and UI. |
| Relative-time refresh | PASS | UI, 60-second timer. |
| No hard-coded names | PASS | Src and grep. |

## Review of the developer's disclosed deviations

**AC 25 (Save closes the dialog).** The literal text asks for the event to appear "without closing the dialog". Save closes the dialog as it did before this feature, and a card drop cannot happen while the modal is open, so the literal wording cannot apply to Save without changing existing Save behavior. In substance the criterion is met: the History tab that is opened next shows the new event on top. The developer's refresh-after-save is a request whose result is discarded (the dialog closes). It does no harm, but it is wasted work. Judged PASS in substance. The owner should accept this or amend the AC text.

**Close-handler guard (`if (els.dialog.open) return;` in `public/js/board.js`).** Checked in the browser:
- Close, Escape and Save each close the dialog, and reopening selects Discussion with an empty History list.
- Race: `dialog.close()` followed by a card click in the same task keeps the dialog open for the new item. Discussion posting worked for the new item, and its History showed only its own event.
- Discussion posting, edit state and relative times are unaffected.
- The guard does not break a plain close, because `open` is false then and the cleanup runs.
QA did not run the code without the guard (no code changes allowed), so it cannot be said from this run that the guard fixes a bug. It is harmless and passes the checks above.

## Regressions

- Login as alex, redirect to the board, sign out, redirect to sign-in, sign in as Blake: PASS (UI).
- Board renders one card per item (13 = API 13); columns render; empty board renders three columns with no cards: PASS (UI).
- Drag to Done (resolution auto-set to Fixed): PASS (UI).
- Drag within a column (rank only): no event; card stays put: PASS (UI).
- Discussion posting, including posting after the close race: PASS (UI). Comment edit and delete: PASS via Live status (count unchanged); their responses were not individually asserted.
- Suite: 126 / 126 in the main repo and in the clean copy.

## Defects

No blocking defects. Minor items, none required for GO:

1. **Minor (wording).** A field filter with no matching events shows "No history recorded yet." (`board.js` `renderHistory`). Literal to AC 20, but a filtered empty list reads as if the item has no history at all. Suggest the owner decide whether a filtered empty state should say something like "No changes to <Field> yet.".
2. **Minor (AC 25 wasted request).** After a Save, `historySaved` issues a fetch that the close discards. No visible effect; see the AC 25 note.
3. **Observation.** `server/historyFields.js` falls back to the label `'Parent'` for the epic field if no type has `isEpic`. Not a status, type, priority or resolution name; no action needed.
4. **Observation (not this feature).** `npm ci` warns that the `better-sqlite3` install script is not approved under npm 11. Tests pass in a clean copy.

## Notes for the owner

- AC 25: accept the substance-based reading, or amend the wording (for example, "after a save the History tab shows the new event when next opened").
- `docs/HANDOFF.md` and `docs/qa/resolution-partial.md` are untracked and not part of this feature. Keep them out of this feature's commit.

## Not verifiable or not tested

- Unknown-actor fallback on a live server: unreachable (`requireUser` runs first). Verified by unit test only.
- Rollback after a real database error (not an injected throw): Test uses an injected throw only.
- Assignee and epic swimlane drags in the browser, and a single gesture that crosses both column and lane: covered by Live PATCH of the same fields, not by a real drag.
- Other browsers (Firefox, Safari) and narrow viewports: not run. Only headless Chrome 155 on macOS.
- Concurrent writers (two users editing the same item): not tested; the spec does not require live updates.
- The owner's live instance on port 3001 and the migration of the real `data/app.db`: not touched by instruction. Migration was proven on a copy only.
- Real-time relative-time drift over many minutes: checked with a stale span and the 60-second timer, not over hours.

## Files

- Report: `/Users/robertmichaels/Documents/code/projectmanagement/docs/qa/ticket-history.md`
- Scratch evidence (outside the repo): `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/live-api.js`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-drive.js`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-drive2.js`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/migrate-check.js`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-history-open.png`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-archived-history.png`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/ui-long-title-history.png`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/owner-db-before.sha`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/npm-test-main.log`, `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/npm-test-clean.log`.

(`/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad` = `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad`)

VERDICT: GO
