# Time tracking and estimates
Status: Approved by owner 2026-10-28, pending review of the estimate addition (AC 34 to 58 and Open questions 1 to 3)
Date: 2026-10-28

Owner request, verbatim: "I'd like to create a time tracker for tickets with a total time spent on each ticket. I'd like a rollup value in the sprint showing how many hours have been worked so far. If there is room, add another tab on the work item for 'Time'. Current time spent in sprint should be listed on the board page in the header where it says your sprint name."

Owner addition, verbatim: "We should also put an estimate field on the work item page somewhere, so we estimate during sprint planning, and then we can list the actual later on."

**Builds on the implemented code and on these read-only references:** `docs/specs/task-dialog-redesign.md` and `public/board.html` (tabbed dialog), `docs/specs/permission-groups.md` (`write` permission, `assertCan`, ownership rules), `docs/specs/ticket-history.md`, `docs/specs/sprints-and-backlog.md`, `docs/specs/sprints-screen.md` and `docs/specs/global-project-scope.md`. References are written "Perm AC n", "History AC n", "Sprints AC n". Acceptance criteria are numbered from 1. Terminology: "work item" (the API and tables still say `issues`).

## Problem

Nobody can record how long a work item took, or how long it was expected to take. The owner wants a lightweight time tracker: during sprint planning people put an original estimate (hours) on each work item; later they log actual hours against it. Each item shows estimate, logged and remaining or over, and each sprint shows hours logged so far against hours estimated, including on the Board header beside the sprint name.

## User stories

1. As a Member, I open a work item, go to its Time tab and log hours with a date and an optional note.
2. As a user, I see a work item's total time spent, and the list of entries behind it, with who logged what and when.
3. As an author of an entry, I can fix or delete my own entry if I got it wrong.
4. As a user looking at the Board, I see the active sprint's hours logged against hours estimated next to the sprint name.
5. As a user on the Sprints page or Backlog, I see the same figure for any sprint.
6. As a Viewer, or on an archived project, I can read all time and estimate data and change none.
7. As a Member planning a sprint, I set an original estimate on each work item (in the dialog or straight from the Backlog list) and see the sprint's estimated total grow.
8. As a user, after work starts, I see per item how much of the estimate is logged and how much remains or is over.

## Decisions (owner accepted all recommendations, 2026-10-28)

1. **Sprint rollup = hours logged on work items currently in the sprint** (not "time logged while the item was in the sprint"). One SUM over existing data; no per-entry sprint snapshot. When a sprint is completed and unfinished items move to another sprint or the backlog, their hours (and estimates) go with them, so a Completed sprint's figures cover only items that stayed in it. A per-entry sprint stamp can be revisited if the owner reports on finished sprints.
2. **Epics take no time and no estimate.** Epics are containers and are not in sprints (Sprints Decision 16). They get no Time tab, no total and no estimate field; the API refuses entries and estimates on them. No roll-up of children's time or estimates onto the epic in this POC.
3. **Units: decimal hours**, entered as a number (for example `1.5`), stored as whole minutes, shown as hours with up to two decimals (`1.5 h`, `0.25 h`). No "1h 30m" parsing. Quarter-hour steps, at most 24 h per entry.
4. **Time entries are recorded in the work item's history (owner change request, 2026-10-28: "I think we're not logging time logged into the history.").** This reverses the original decision (no history for time entries). Logging, editing and deleting an entry each write one `changed` event on the work item, attributed to the signed-in user, in the same transaction as the entry write (AC 31). The row keeps its `edited` marker as well. Sprint events stay free of time data.
5. **Dates:** no future dates, no lower limit on back-dating.
6. **Unsaved Log time form on close:** no "Discard changes?" prompt, because the form is small and separate from the item's fields.
7. **Who may log:** any Member or Admin logs time on any non-epic item, not only items assigned to them (as comments are not assignee-limited). Own entries only for edit and delete.
8. **Header wording:** "logged" (`37.5 h logged`), shown beside the sprint name. With estimates it reads `12 h logged / 20 h est.`.
9. **Estimate (new, recommended; confirm with the spec review):**
   - Field name "Estimate" (the original estimate; it is not re-estimated as work proceeds). Stored as whole minutes, entered and shown in decimal hours, quarter-hour steps, like time entries.
   - **Where on the item:** a field in the dialog's Properties (side) column directly under Sprint, so it is visible on every tab and sits beside the field planners already set. The Time tab repeats it read-only in its summary (estimate, logged, remaining or over). Not on the Details tab, which holds the description.
   - **Settable on creation:** yes, an optional Estimate field in the create form (non-epic types only), and always editable afterwards.
   - **Who edits:** anyone with `write` (Member, Admin), through the normal work item save, like every other field. Not tied to the assignee or to the entry-ownership rule. Viewers see it read-only.
   - **Planning on the Backlog:** the Backlog list gets an Estimate column with an inline number input per non-epic row (saves on Enter or blur through the same `PATCH /api/issues/:id`), so a whole sprint can be estimated without opening each item. The sprint panel header shows the estimated total, which updates as estimates are entered. No bulk "set estimate" action.
   - **Display:** per item, sprint figure `12 h logged / 20 h est.` on the Board sprint bar, the Sprints summary line and Backlog sprint headers; the Sprints page table gains Estimate and Logged columns (previously out of scope). Cards and Backlog rows do not show logged time.
   - **History:** estimate is an editable work item column, so it is a field edit recorded in ticket history. Verified against `docs/specs/ticket-history.md`: History AC 2 records one change per edited field, and History AC 28 plus `tests/history.test.js` fail if an updatable column (other than `rank`) has no entry in `server/historyFields.js`. So `estimate` gets one entry (`kind: 'text'`, label "Estimate"; old and new values stored as the hours text, empty as null), and appears in the History tab and the field filter with no history code change. Time entries are in history too, as their own `time_entry` field (Decision 4, AC 31).

## Acceptance criteria

### Logging (server)

1. A time entry has: work item, user (who worked; always the signed-in user), hours, work date, optional note, created and updated times. `POST /api/issues/:id/time` with `{ hours, date, note? }` creates one and returns 201 with the entry `{ id, issue_id, user_id, user_name, hours, date, note, created_at, updated_at }`. The user comes from `req.user` only; a body field `user_id` or `user_name` is ignored.
2. **Hours validation (400, message `Hours must be a number greater than 0 and at most 24, in steps of 0.25.`):** a number (not a string with units), greater than 0, at most 24 per entry, a multiple of 0.25. Stored as integer minutes (`minutes = hours * 60`); the API returns hours. `1.5`, `0.25`, `24` are accepted; `0`, `-1`, `0.1`, `25`, `"abc"`, missing are rejected and nothing is stored.
3. **Date validation (400):** `date` is `YYYY-MM-DD`, a real calendar date, and not later than today (server date). It defaults to today when omitted on create. Past dates are allowed (logging yesterday's work).
4. **Note:** optional text, trimmed, at most 500 characters (400 beyond that); an empty note is stored as null. Notes are plain text, shown as text, never HTML.
5. **Epics:** `POST` on an epic (type from the server's epic flag in `server/types.js`, no type name hard-coded) returns 400 `Time cannot be logged on an epic.` and stores nothing.
6. **Edit and delete (own entries only):** `PATCH /api/time/:id` (any of `hours`, `date`, `note`, same validation) and `DELETE /api/time/:id` (204). Only the user who logged the entry may do either; anyone else, Admin included, gets 403 `You can only change your own time entries.` (same rule as comments, Perm Decision 2). `user_id` and `issue_id` cannot be changed by PATCH. A PATCH that changes nothing succeeds without changing `updated_at`.
7. **Permissions:** create, edit and delete require the `write` permission (Perm AC 1, AC 4). A Viewer gets 403 `Your group (Viewer) is not allowed to log time.` and nothing changes. The new routes are added to the Perm AC 21 route matrix and coverage guard. Order of checks as Perm AC 5: sign-in 401, group 403, record 404, ownership 403, archived 409, validation 400.
8. **Archived project:** create, edit and delete return 409 (as Login AC 21) and change nothing; reads work.
9. **Completed sprint:** logging, editing and deleting time stays allowed on work items that are in a Completed sprint (late logging). Only the sprint field is read-only there (Sprints AC 37).
10. **Reading:** `GET /api/issues/:id/time` (any signed-in user, archived projects included) returns `{ entries: [...], total_hours }`, entries newest work date first, ties by id descending, each as in AC 1. `total_hours` is the sum of the entries' minutes divided by 60, so it is exact for quarter hours. Unknown id returns 404 `Work item not found.`. An item with no entries returns `{ entries: [], total_hours: 0 }`.
11. **Per-item total on lists:** every work item returned by `GET /api/projects/:id/issues` and `GET /api/issues/:id` includes `time_spent_hours` (the same total, 0 when none), computed in the same query (a grouped sum, no per-item request), so cards, the Backlog and the dialog need no extra call. An epic returns 0.
12. **Cascade:** deleting a work item deletes its time entries in the same transaction (like comments). Deleting a user is not a feature; if it exists, entries keep their `user_name` snapshot.

### Sprint rollup (server)

13. Each sprint in `GET /api/projects/:id/sprints` (and the single-sprint response, if one exists) includes `time_spent_hours`: the sum of the minutes of all time entries on work items whose `sprint_id` is that sprint, divided by 60, whatever the date or author (Decision 1). Planned sprints can show a value too (time logged ahead of the start). A sprint with no entries returns 0.
14. The rollup counts every item currently in the sprint, finished or not. Moving an item to another sprint (or the backlog) moves its hours with it, and the next read of both sprints reflects it. Nothing is stored on the sprint; the value is always computed, so it can never drift from the entries.
15. The value is rounded only for display. The API returns the exact value (quarter hours are exact to two decimals).

### Board header

16. On the Board, the sprint header bar (`#sprint-bar`, the line that carries the sprint name, state, dates and goal) shows the active sprint's figure next to the sprint name, using the shared sprint figure of AC 53: `<n> h logged` when no item in the sprint has an estimate (for example `Sprint 4  .  37.5 h logged`), and `<n> h logged / <m> h est.` when the estimated total is above 0 (for example `Sprint 4  .  12 h logged / 20 h est.`). It shows `0 h logged` when nothing is logged, never blank. The text is set as text; the numbers have visible labels, so it is not colour- or icon-only.
17. The figure updates without a page reload after the user saves a time entry from the dialog opened on the Board (add, edit or delete), after an estimate is saved, and after any save that moves an item in or out of the sprint. Reopening or refreshing shows the same numbers.
18. When the project has no active sprint, the bar is hidden as today and no figure appears.

### Sprints page and Backlog

19. **Sprints page** (`sprints.html`): the sprint summary line (Sprints AC 8) adds the sprint figure of AC 53 for the selected sprint, for Active, Planned and Completed alike. The table's new columns are in AC 55.
20. **Backlog** (`backlog.html`): each sprint panel header shows the sprint figure of AC 53 beside its name and counts. The Backlog (unscheduled) panel shows no sprint figure (its rows still carry the Estimate column, AC 54).
21. One shared helper formats the figures for all three pages so the text is identical (for example `timeFormat.hours(1.5)` returns `1.5 h`, `37` returns `37 h`, `0.25` returns `0.25 h`, up to two decimals, no trailing zeros). The same file holds the sprint figure formatter of AC 53.

### Work item dialog: Time tab

22. The dialog's tab bar gets a "Time" tab, placed after "Links" and before "Test Cases", with a count badge showing the item's total in hours when above 0 (for example `Time 6.5`). It is a real `role="tab"` button with `aria-controls` on its own `role="tabpanel"`, reachable and operable by keyboard like the other tabs. The tab bar must still fit on one row at the dialog's usual width, or wrap/scroll gracefully (designer decides; see Designer section).
23. The Time tab shows, from top to bottom: the item summary (AC 51: estimate, total time spent, remaining or over), a "Log time" form, then the list of entries.
24. **Log time form:** Hours (number input, step 0.25, min 0.25, max 24), Date (date input, default today, `max` = today), Note (single line or short textarea, 500 characters), and a "Log time" button. Submitting posts AC 1, then clears Hours and Note, keeps the list and totals updated, and shows server validation messages inline (`role="alert"`) without closing the dialog. The form is not shown to users without `write`, on an archived project, or for an epic.
25. **Entries list:** newest first, each row shows the user's name, hours, work date, note (if any) and the logged-at time via `timeFormat.timestamp`. Each of the signed-in user's own entries has Edit and Delete controls; other people's entries have none, for every group (AC 6). Delete asks for confirmation as comments do. Editing happens inline in the row (hours, date, note, Save/Cancel). Empty state: "No time logged yet."
26. **Epics:** the Time tab is not shown for an epic (like the Sprint field's "not applicable" treatment). The item summary is not shown for an epic.
27. **Viewer and archived project:** the tab is shown, the summary and the list are readable, and no form, Edit or Delete appears (Perm AC 15 pattern, driven by `permissions` from `/api/auth/me`; the client never compares group names).
28. **Interplay with the dialog's Save/discard guard** (Scope AC 14c-14f): time entries are saved by their own buttons straight to the server, not through the item's Save button, and do not make the item "dirty". Closing the dialog with an unsaved, partly typed Log time form does not trigger the "Discard changes?" prompt (Decision 6). The Estimate field, in contrast, is an item field: editing it makes the item dirty like any other field and is saved by the item's Save button (AC 41).
29. Saving a time entry refreshes the dialog's summary and count badge, the Backlog row (if open there), and the sprint figure on whichever page is open (AC 17, 19, 20).

### Cards

30. Cards on the Board and rows on the Backlog do **not** show per-item logged time in this POC (Out of scope); it lives in the dialog only. `time_spent_hours` is in the API so a later change needs no server work. (The Backlog's Estimate column, AC 54, shows estimates only.)

### History and audit

31. Time entries **are** written to the work item's history (Decision 4), as the history field `time_entry` (label "Time entry", kind `time-entry`, no issues column; recorded by `server/data/timeEntries.js`, like links and attachments). The actor is the signed-in user (`actorFrom(req)`), never the body. Each change's text is `<hours> h on <YYYY-MM-DD>`, plus `: <note>` when the entry has a note (notes longer than 60 characters are shortened to 57 plus `...`; if an edit changes only the part of the note past the excerpt, both texts carry the full notes so they differ). `old_id`/`new_id` are the entry's id.
    - **Log** (`POST /api/issues/:id/time`, 201): one event with old null and new the entry text. The History tab shows "Blake Lee logged 1.5 h on 2026-10-28: fix login".
    - **Edit** (`PATCH /api/time/:id`, 200, hours, date and/or note changed): one event with the old and new text, shown as "changed Time entry from 1.5 h on 2026-10-28 to 2 h on 2026-10-28" (date and note changes show the same way). A PATCH that changes nothing writes no event.
    - **Delete** (`DELETE /api/time/:id`, 204): one event with old the entry text and new null, shown as "deleted time entry 1.5 h on 2026-10-28".
    - The event is written in the same transaction as the entry insert, update or delete: if either fails, neither is stored. Rejected writes (400, 403, 404, 409) write no event.
    - `GET /api/history-fields` lists `{ key: 'time_entry', label: 'Time entry', kind: 'time-entry' }` and `field=time_entry` returns only these events; the History tab's filter offers "Time entry".
    - After a log, edit or delete in the open dialog, a loaded History tab is refreshed (History AC 25), with the existing History row look (actor, timestamp, one line).
    - Estimate changes, being edits of a work item field, are recorded as before (AC 49). Sprint events are unchanged: sprint completion or moves record no time or estimate data. Deleting a work item deletes its entries and its history (History AC 10) with no extra events.
32. An edited entry also shows `edited` with its `updated_at` in the row (when `updated_at` differs from `created_at`). Deleted entries are gone from the Time tab; their deletion stays in History.

### Tests

33. Automated tests (`npm test`, `node:test`, temporary database) cover at least: AC 2 and 3 as a table of accepted and rejected values; note length and trimming; epic refusal (5); own-only edit/delete including Admin getting 403 (6); Viewer 403, Member 201, archived 409 and check order (7, 8); Completed-sprint logging allowed (9); `total_hours` and `time_spent_hours` sums with quarter hours (10, 11); sprint rollup including moving an item between sprints and an epic never counting (13, 14); cascade on item delete (12); `timeFormat.hours` outputs (21); and that log, edit and delete each write one `time_entry` history event with the right actor, text and ids, a no-op PATCH and rejected or archived writes write none, a failing history write rolls the entry change back, and the History tab text of the three cases (`tests/historyFormat.test.js`) (31). The route matrix and coverage guard of Perm AC 21 include the three new write routes. The estimate tests are in AC 57. Browser behaviour (AC 16 to 18, 22 to 29, 41 to 56) is verified by QA.

### Estimate: item field (server)

34. A work item has an optional original estimate. `POST /api/issues` and `PATCH /api/issues/:id` accept `estimate_hours` (a number, or null/empty to clear). It is stored as integer minutes in `issues.estimate_minutes` (null = not estimated). Every work item returned by the issue list and `GET /api/issues/:id` includes `estimate_hours` (null when not set, never 0 as a stand-in) and, for non-epics, `remaining_hours` (see AC 38).
35. **Estimate validation (400, message `Estimate must be a number greater than 0 and at most 1000, in steps of 0.25, or empty.`):** a number (not a string with units), greater than 0, at most 1000, a multiple of 0.25; null or an empty string clears it. `8`, `0.25`, `1000`, `null` are accepted; `0`, `-1`, `0.1`, `1000.25`, `"abc"` are rejected and nothing changes. `estimate_hours` omitted from a PATCH leaves it unchanged.
36. **Epics:** `estimate_hours` on an epic (create or PATCH) returns 400 `An epic cannot have an estimate.` (type from the server's epic flag, no type name hard-coded); epics return `estimate_hours: null`. If the existing code clears the sprint when an item's type is changed to an epic, the estimate is cleared in the same save in the same way, and that clearing is recorded in history like any other change.
37. **Permissions and state:** setting or changing the estimate needs `write` (Perm AC 1) through the existing create and PATCH routes, so no new route and no new matrix entry; a Viewer gets the existing 403 and nothing changes. Archived project returns 409. An item in a Completed sprint keeps an editable estimate (only the sprint field is read-only there, Sprints AC 37).
38. **Remaining or over (computed, never stored):** `remaining_hours = estimate_hours - time_spent_hours`, null when there is no estimate; negative means over. It is exact for quarter hours and rounded only for display.

### Estimate: sprint rollup (server)

39. Each sprint returned by `GET /api/projects/:id/sprints` includes `estimate_hours`: the sum of `estimate_minutes` (divided by 60) of all work items whose `sprint_id` is that sprint, finished or not (the same item set as AC 13), and `unestimated_count`: the number of non-epic items in the sprint with no estimate. A sprint with no estimated items returns `estimate_hours: 0`. Computed in the same grouped query style as AC 13, never stored on the sprint.
40. Moving an item between sprints or to the backlog, changing its estimate, or deleting it changes both figures on the next read of the affected sprints. Completing a sprint moves unfinished items, with their estimates, with them (Decision 1).

### Estimate: work item dialog

41. The dialog's Properties column shows an "Estimate" field directly under Sprint: a number input (step 0.25, min 0.25, max 1000, placeholder "Hours"), with a visible "h" unit label. It is saved with the item's Save button like other fields (AC 28); clearing the input and saving removes the estimate. Server messages (AC 35) show inline (`role="alert"`) without closing the dialog.
42. The create form shows the same optional Estimate input for non-epic types and sends `estimate_hours` with the new item. Leaving it empty creates an item with no estimate.
43. **Epic:** the Estimate field is not shown for an epic, with the same "not applicable" treatment as the Sprint field. Switching the Type control to an epic hides it; switching back shows it empty.
44. **Viewer and archived project:** the field is shown read-only with its value (or "Not estimated"); no input appears (Perm AC 15 pattern, from `permissions`; the client never compares group names).
45. The Time tab summary (AC 23) shows three labelled values: `Estimate` (hours, or "Not estimated"), `Logged` (total time spent) and either `Remaining` or `Over`. Remaining is `estimate - logged` as `<n> h remaining`; when logged is above the estimate it shows `<n> h over` (the absolute difference) with the word "over", not colour alone; exactly equal shows `0 h remaining`. With no estimate the third value is not shown and the summary reads `No estimate` beside the logged total. A small progress bar is optional and, if drawn, has a text equivalent.
46. The Estimate field in the Properties column and the Time tab summary agree at all times: saving a new estimate refreshes the summary, the Time tab badge is unchanged (it stays the logged total), and logging time refreshes the remaining or over value, with no reload.
47. The Time tab summary and the Estimate field appear in the same states as the rest of the Time tab and Properties column, and a new item with no time and no estimate shows `No estimate` and `0 h logged`.
48. The estimate input accepts the same keyboard behaviour as other numeric inputs, has a visible label associated with it, and its inline error is announced (`role="alert"`).

### Estimate: history

49. Changing the estimate through `PATCH /api/issues/:id` writes a change on the standard `changed` event (History AC 2) for the field `estimate` (label "Estimate"), with old and new value as the hours text (for example `8` to `12`) and null for empty. Setting it on creation writes no extra change (History AC 1: created events have no field changes). Clearing it records old value and null. A save that sends the same value writes nothing (History AC 3 pattern).
50. `server/historyFields.js` gets one `estimate` entry (`column: 'estimate_minutes'`, `kind: 'text'`; the history writer reads the value as hours text, so the stored column stays minutes while history shows hours, via a small value formatter beside the entry). The field appears in `GET /api/history-fields` and in the History tab's field filter with no change to history code, and `tests/history.test.js`'s "every updatable column has an entry" test passes with `estimate_minutes` as an updatable column.

### Estimate: display and planning

51. **Item summary** is as AC 45 and is the only per-item estimate-vs-actual display in the dialog; cards show neither estimate nor logged time.
52. **Backlog** (`backlog.html`) inline planning: each non-epic row has an Estimate cell with a number input (step 0.25) showing the current value or empty. Entering a valid value and pressing Enter or leaving the field sends `PATCH /api/issues/:id` with `estimate_hours` and updates the row and its sprint panel figure without reloading; an invalid value shows an inline message, restores the previous value, and stores nothing. The cell is read-only text for a Viewer or an archived project, and absent on epic rows.
53. **Shared sprint figure** (one formatter, used by AC 16, 19, 20, 55): with estimated total `E` and logged `L` hours, the text is `L h logged / E h est.` when `E > 0`, and `L h logged` when `E` is 0. On the Sprints summary line and Backlog sprint headers it adds `(<n> not estimated)` when `unestimated_count` is above 0 and `E > 0`; on the Board bar the count is omitted to keep the bar short. When `L > E` and `E > 0` the figure adds `over` text (for example `24 h logged / 20 h est. (over)`), not colour alone. Examples: `timeFormat.sprintFigure(12, 20)` returns `12 h logged / 20 h est.`; `(0, 0)` returns `0 h logged`.
54. **Backlog Estimate column:** every Backlog panel (unscheduled and each sprint) shows the Estimate column in the list view; its header is "Est. (h)". Empty estimates show a dash.
55. **Sprints page table** (`sprints.html`): the work item table gains two columns, "Estimate" (hours or dash) and "Logged" (`time_spent_hours`), sortable only if existing columns are. Epic rows show dashes. Column widths keep the table usable at the page's usual width (designer decides), and the existing column order is otherwise unchanged. The Estimate cell is not editable here in this POC.
56. Per-sprint totals shown on the three pages equal the sum of the visible items' estimates and logged hours for the same sprint (QA check on a seeded sprint, including one unestimated item and one over-estimate item).

### Estimate: tests

57. Automated tests cover at least: AC 35 as a table of accepted and rejected values; clearing with null and with an empty string; omitted field unchanged; epic refusal and (if applicable) clearing on conversion to epic (36); Viewer 403, Member 200, archived 409 (37); `remaining_hours` with an under, equal and over case (38); sprint `estimate_hours` and `unestimated_count` including moving an item between sprints, an epic never counting, and a done item counting (39, 40); an estimate change writing exactly one history change with the right old and new text, a no-op save writing none, and creation writing no field change (49, 50); the history field list API including `estimate`; `timeFormat.sprintFigure` outputs of AC 53. `tests/source.test.js` rules continue to pass.
58. The existing tests that assert a work item's exact response keys, the history field list, or the Sprints page columns are updated for the new `estimate_hours`, `remaining_hours`, `estimate` field and columns.

## Data model changes

New table `time_entries`, created idempotently in `server/db.js` (`CREATE TABLE IF NOT EXISTS`, no migration of existing rows, a fresh and an existing database both open):

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `issue_id` | INTEGER NOT NULL | references `issues(id)`, `ON DELETE CASCADE` |
| `user_id` | INTEGER | the logger; null only if the user is gone |
| `user_name` | TEXT NOT NULL | display-name snapshot, like history actors |
| `minutes` | INTEGER NOT NULL | greater than 0, at most 1440 |
| `work_date` | TEXT NOT NULL | `YYYY-MM-DD` |
| `note` | TEXT | null when empty, at most 500 characters |
| `created_at` / `updated_at` | TEXT NOT NULL | server time, as other tables |

Index on `issue_id`.

New column on `issues`: `estimate_minutes INTEGER` (null = not estimated; when set, greater than 0 and at most 60000), added idempotently the way earlier columns were added in `server/db.js` (check for the column, then `ALTER TABLE ... ADD COLUMN`; existing rows stay null). Remember to add it to the `UPDATABLE` list in `server/data/issues.js` and a matching history entry (AC 50).

No column is added to `sprints`: logged and estimated totals are always computed with grouped SUMs (Decision 1, AC 14, AC 39). Data access for time lives in one new file, `server/data/timeEntries.js`, as for comments and links. `tests/source.test.js` rules (no hard-coded type, status or group names) apply.

## Out of scope

- Remaining-time re-estimates (only the original estimate exists), burn-down or burn-up charts, velocity, capacity planning, story points, and blocking or warning pop-ups when logged exceeds the estimate (only the passive "over" text in AC 45 and 53).
- Estimate on epics, and rolling children's estimates or time up to an epic.
- A bulk "set estimate" action on the Backlog selection strip, and estimate editing on the Sprints page table or on Board cards.
- Estimate in search, filters or sorting; estimate import.
- Timers (start/stop), timesheets, weekly views, per-user or per-project time reports, CSV export.
- A "time logged while in sprint" rollup and any per-entry sprint snapshot.
- Per-item logged time on cards and Backlog rows, sorting or filtering by time, and a time field in search.
- "1h 30m" style input, working-day units (days, 8 h), story-point conversion, billing rates or cost.
- Logging time on behalf of another user, and an Admin override of the own-entries rule.
- Time entries in sprint events, and a project-level time log. (Time entries are in work item history, AC 31.)
- Time entries in attachments, links or the Test Case manager.

## Open questions

1. **Estimate edits after the sprint starts.** Recommended: allowed at any time (AC 37), every change recorded in history (AC 49), so scope creep is visible in the History tab. Alternative: lock the estimate once the sprint is Active or Completed, which keeps "original" literal but blocks fixing a typo. Confirm.
2. **Items with no estimate in the sprint figure.** Recommended: they count as 0 in the estimated total and the Sprints and Backlog figures note `(n not estimated)` (AC 53), so a half-planned sprint is not mistaken for a small one. Alternative: no note. Confirm.
3. **Where the Backlog Estimate column and inline edit appear.** Recommended: in the list view for every non-epic row, editable inline (AC 52). Alternative: dialog only, no inline edit, which is less work but slower for planning many items. Confirm.

## Designer needed: yes

This adds a tab, a field and several values, so run the `designer` before the developer. Design inputs:

(a) The Time tab: the summary (Estimate, Logged, Remaining or Over, with and without an estimate, and the over-estimate state, AC 45), the Log time form, the entries list with own-entry Edit/Delete and the inline edit state, its empty, error, Viewer/archived (read-only) and epic (tab hidden) states.

(b) The Estimate field in the dialog's Properties column under Sprint (AC 41 to 44): editable, empty, read-only ("Not estimated"), error, hidden for epics, and the optional Estimate input in the create form.

(c) Whether the tab bar still fits with a seventh tab ("Children", "Discussion", "History", "Links", "Time", "Test Cases", "Attachments") at the dialog's usual width, and how it wraps or scrolls if not (the owner said "if there is room", so if it does not fit, the designer proposes the fallback, for example placing the summary on the Properties side and the tab as an overflow, and flags it for the owner).

(d) The sprint figure (`12 h logged / 20 h est.`, AC 53) in the Board's sprint bar next to the name, in the Sprints summary line (with the `not estimated` note) and in the Backlog sprint panel headers, including the zero-estimate, no-time and over-estimate states and how the bar stays on one line.

(e) The Backlog Estimate column with inline number inputs, their saving and error states, and the read-only version (AC 52, 54).

(f) The Sprints page table with the new Estimate and Logged columns (AC 55).

Mockups in `docs/design/time-tracking/`, using `docs/design/STYLE.md`.

## Implementation notes for the developer

Build to the owner-chosen design in `docs/design/time-tracking/` and `docs/design/STYLE.md`. Suggested order:

1. `server/db.js`: create `time_entries` and its index, and add `issues.estimate_minutes` (all idempotent). New `server/data/timeEntries.js`: create, update, delete, list by issue, minutes sum by issue, and a sum by sprint (one grouped query joining `issues.sprint_id`).
2. New `server/timeValidation.js` (hours, date, note rules, AC 2 to 4, and the estimate rule of AC 35), kept pure so it is unit-tested directly. Reuse `ValidationError`.
3. New `server/routes/time.js`, mounted in `server/app.js`: `GET`/`POST /api/issues/:id/time`, `PATCH`/`DELETE /api/time/:id`. Use `assertCan(user, 'write', ...)`, `loadIssue`, `assertWritable`, `actorFrom` from `server/routes/guards.js`; add an `assertOwnsTimeEntry` beside `assertOwnsComment`. Epic check through `server/types.js` helpers.
4. `server/data/issues.js`: add `estimate_minutes` to `UPDATABLE` and to create, with `estimate_hours` in and out of the API; add `time_spent_hours`, `estimate_hours` and `remaining_hours` to issue responses (AC 11, 34, 38); handle the epic refusal and conversion (AC 36, check how `sprint_id` is handled on conversion and mirror it). Delete entries in `deleteIssue`'s transaction (AC 12).
5. `server/historyFields.js` (AC 50): one `estimate` entry plus a value formatter minutes to hours text; check `server/data/history.js` `recordChanges` so the stored text is hours, not minutes. `server/data/sprints.js` (and routes): add `time_spent_hours`, `estimate_hours`, `unestimated_count` (AC 13, 39).
6. `public/js/time.js`: add `timeFormat.hours` and `timeFormat.sprintFigure` (AC 21, 53), loadable from `node:test`.
7. `public/board.html` and `public/js/board.js`: Estimate field in Properties and create form (AC 41 to 44), Time tab button, summary, form and list (AC 22 to 29, 45 to 48), then the `#sprint-bar` figure (AC 16 to 18). Repeat the tab and panel markup in `backlog.html` and `sprints.html`, whose dialog markup is shared; check `public/css/app.css` for tab-bar fit.
8. `public/js/backlog.js`: Estimate column with inline edit, and sprint panel figures (AC 20, 52, 54). `public/js/sprintView.js`: summary figure and the new table columns (AC 19, 55), refreshed after dialog saves.
9. Tests (AC 33, 57, 58), then add the new routes to the permission route matrix in `tests/permissions.test.js`. Update `README.md`'s feature and API list.

Note the working tree has uncommitted work touching `public/js/board.js`, `public/board.html`, `server/data/issues.js` and `server/db.js` (global project scope, sprints page, test case manager). Build this after those are committed.
