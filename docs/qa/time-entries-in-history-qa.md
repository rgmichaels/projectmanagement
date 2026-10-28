# QA: Time entries in work item history

Spec: `docs/specs/time-tracking.md`, Decision 4 (reversed 2026-10-28) and AC 31-33.
Related spec checked for regressions: `docs/specs/ticket-history.md`.
Branch: `sprints-backlog-restyle`. Scope: history work only. The concurrent New project dropdown work (`public/js/projectScope.js`, `docs/specs/new-project-from-dropdown.md`) was ignored.
QA date: 2026-10-28. Reviewer: QA agent (Haiku 5.5).

## Commands run

1. Targeted tests (fresh, from the repo root):
   `node --test tests/time-tracking.test.js tests/time.test.js tests/history.test.js tests/historyFormat.test.js tests/source.test.js tests/permissions.test.js`
   Result: **170 tests, 170 pass, 0 fail, 0 cancelled, 0 skipped.** The stack traces in the output are the expected `boom` errors from the injected-failure test (rollback case). They are not failures.
2. Live API checks: scratch server on port **3071**, against a copy of `data/app.db` at `C:\Users\elermichaels\AppData\Local\Temp\claude\C--Users-elermichaels-Code-projectmanagement\d97fbdd8-a90e-4ca5-a02a-cae6d4cf3652\scratchpad\qa\qa.db`. `data/app.db` was not written. Script: `...\scratchpad\qa\api-check.js`.
   Result: 27 checks, 26 PASS. The single FAIL was a bad check on my side. The item's estimate was already 3, so the PATCH was a true no-op and wrote no event. A second probe with a 3 to 5 change confirmed the estimate event is written as `Estimate` (`3 -> 5`), so the estimate history is unchanged. The probe restored the estimate to 3.
3. Live UI check: headless Edge (`msedge.exe --headless=new --remote-debugging-port=9333`), scratch profile in the scratchpad, same scratch server, page `/board.html?project=2`. Script: `...\scratchpad\qa\ui-check.js`. Output: `...\scratchpad\qa\ui-check.out.txt`. Result: all checks PASS (listed below). The first run showed 0 history events because the check read the list before it finished loading. The rerun, after waiting for the load, showed 16 events. The app was not at fault.
4. Stopped the scratch server (PID 42808). Port 3071 no longer answers. Nothing was committed.

## Acceptance criteria

| # | Criterion | Result | Reason |
|---|---|---|---|
| 31 | Log writes one `time_entry` event (old null, new the text), in the same transaction | PASS | Live: POST 201 gave one event, `new: "1.5 h on 2026-10-28: fix login"`, `new_id` = entry id. Code: `createEntry` runs the insert and `recordTimeEntryChange` inside one `db.transaction`. Test at time-tracking.test.js:463. |
| 31 | Edit writes one event with old and new text | PASS | Live: hours 1.5 to 2 gave one event, old `1.5 h on ...`, new `2 h on ...`, same id on both sides. Date edit also one event. |
| 31 | Delete writes one event (old text, new null) | PASS | Live: DELETE 204, one event, `old` = entry text, `new` = null. |
| 31 | Actor is the signed-in user; body `user_id`/`user_name` ignored | PASS | Live: POST with a body `user_id: 2` still gave `Alex Morgan`, actor_id 1. `actorFrom(req)` is used in every route. |
| 31 | No event for a no-op PATCH | PASS | Live: PATCH resending identical hours, date and note gave 200 and no new event. `updateEntry` returns early when no field differs. |
| 31 | No event for rejected writes (400, 403) | PASS | Live: hours 0 (400), hours 25 on POST (400), date in the future (400), Blake PATCH (403), Blake DELETE (403), epic POST (400). History count unchanged. |
| 31 | No event for rejected writes (404, 409) | UNTESTED (live) | Not run live. Routes call `assertWritable` and `loadTimeEntry` before any data call, so no history write can happen. Covered by the order-of-checks test (time-tracking.test.js:225); the no-event assertion for 409 is not explicit there. |
| 31 | Rollback: a failing history write rolls back the entry change | PASS | Test time-tracking.test.js:509 stubs `recordTimeEntryChange` to throw for update and delete and checks the entry is unchanged. |
| 31 | Note text: `: <note>`, long notes shortened to 57 + `...` | PASS | Live: 70-char note gave `0.25 h on 2026-10-28: xxx...` (57 x's then `...`). |
| 31 | Note-only edit past the excerpt still shows different old and new texts | PASS | Live: note changed only after char 57 gave one event with old and new both showing full notes, and `old !== new`. |
| 31 | `GET /api/history-fields` lists `{ key: 'time_entry', label: 'Time entry', kind: 'time-entry' }` | PASS | Live: field present. |
| 31 | `field=time_entry` returns only these events; the filter offers "Time entry" | PASS | Live: API 200. UI: filter option "Time entry" present; filtered list showed only time-entry lines. |
| 31 | History tab refreshes after log, edit and delete in the open dialog | PASS | Live (UI): History loaded, then log (shows `logged 1.25 h on 2026-10-28: UI check...`), edit (shows `changed Time entry from 1.25 h ... to 2 h ...`) and delete (shows `deleted time entry 2 h on ...`) all appeared without closing the dialog. `timeChanged` calls `historySaved` (board.js:1914). |
| 31 | Row look: actor, timestamp, one line | PASS | Live: `Alex Morgan / 2026-10-28 15:18 (just now) / logged 1.25 h ...`. |
| 31 | Sprint events carry no time data | UNTESTED | Not exercised live. Sprint history recording code was not changed in this diff. |
| 31 | Estimate changes recorded as before | PASS | Live: estimate 3 to 5 gave one `estimate` change, `3` to `5`. |
| 31 | Deleting a work item cascades its entries and history with no extra event | PASS | Live: item with a logged hour, then DELETE 204, then `GET .../history` 404. History had 2 events before delete. |
| 32 | Edited entry shows `edited` with `updated_at` | UNTESTED (live) | Covered by the entry-row UI and the time tests, not run in this QA pass. Not affected by the history change. |
| 33 | Automated tests cover log, edit, delete events, no-op and rejected writes, rollback, and History text | PASS | Targeted run: all 170 pass. historyFormat.test.js:46 covers the `logged`, `changed` and `deleted` wording. |
| Decision 4 | Logging, editing and deleting each write one event in the same transaction as the entry | PASS | Code (`timeEntries.js` createEntry, updateEntry, deleteEntry each wrap insert/update/delete and the history write in `db.transaction`) and live results above. |
| Decision 4 | Actor is the signed-in user | PASS | As above. |
| Decision 4 | Sprint events free of time data | UNTESTED | As AC 31 sprint row. |

### Existing history spec (`docs/specs/ticket-history.md`)

| Criterion | Result | Reason |
|---|---|---|
| AC 1 to 15 (recording, reading, paging) | PASS | `tests/history.test.js` passes (in the targeted run). Live: created/changed events, newest first, `limit=2` returned 2 with `has_more`. |
| AC 16 to 18 (limit, before, field, history-fields) | PASS | Live: `limit=2` and `field=time_entry` return 200. Field list returned. |
| AC 19 to 26 (UI tabs, loading, filter, refresh) | PASS (partly live) | Live UI: Discussion/History tabs, History loads on selection, filter changed to Time entry, refresh after time save. Show-more paging not exercised live. |
| AC 27 (no field names in history code) | PASS | `tests/source.test.js` passes (targeted run). |
| AC 28 (every UPDATABLE field except rank has a history field) | PASS | `tests/history.test.js` passes. |

### Wording (developer choice vs spec text)

The developer's text matches the spec exactly. The lowercase verb is the spec's own wording, not a deviation.

- Log: `logged 1.5 h on 2026-10-28: fix login` (spec AC 31 gives exactly this, with the actor name before it).
- Edit: `changed Time entry from 1.5 h on 2026-10-28 to 2 h on 2026-10-28` (the generic `changed <Label> from <old> to <new>` form; spec gives the same text).
- Delete: `deleted time entry 1.5 h on 2026-10-28` (lowercase label, spec text).

HTML in notes is shown literally (`<b>bold</b>` appeared as text, no `<b>` element).

## Gaps checked (briefly)

- Empty history on a fresh item: a new item shows "No history recorded yet." (tested by the history suite).
- Long note: 70 characters truncated and shown; a note-only change past the excerpt still differs.
- Deleting an item with time entries: no extra events, history gone (404).
- Viewer 403 for logging time: not run live; time-tracking.test.js:200 covers it (403 with the log-time wording, nothing changes).
- Archived project 409 for time writes: not run live; the route order tests cover it. The 409 path writes nothing by construction.

## Findings

No blocking defects found. No code changes were made. Non-blocking notes:

1. The `timeEntries.js` `deleteEntry` call to `recordTimeEntryChange` omits the optional `when` argument, so the timestamp is taken inside the helper. This is fine but is different from the create and update paths, which pass `now`. Consistency only.
2. Two rows are UNTESTED live (404/409 no-event, sprint events). Both are covered by code review and tests, not by a live run.

## Verdict

All blocking criteria (AC 31 log, edit, delete, actor, no-op, rejected writes, transaction, History filter and refresh; Decision 4; existing history ACs) PASS in the fresh targeted run and the live API and UI checks. No blocking criteria fail.

VERDICT: GO
