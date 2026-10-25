# QA: Epic View (docs/specs/epic-view.md)

Date: 2026-10-25. Reviewer: QA agent (Haiku 5.5). Nothing committed. Only this file was written in the project tree.

## Verdict

VERDICT: GO

Notes: AC 22 is UNTESTED (see below). Nothing in the verified set fails. Non-blocking observations are listed under "Deviations" and "Gaps".

## 1. Test suite (fresh, clean copy)

- Copy: the working tree was copied (without `data/` and `node_modules/`; `node_modules` symlinked, `server/data/` included) into the scratchpad `qa-copy`, then `git init` and a snapshot commit so the `git check-ignore` test runs.
- Command: `npm test` (= `node --test "tests/*.test.js"`) in the copy.
- Result: `ℹ tests 226 / pass 226 / fail 0 / skipped 0`. Developer's count (226/226) confirmed.
- Epic-specific files present and included: `tests/epic-view.test.js` (13 tests), `tests/epic-view-extensibility.test.js`, and the new rules in `tests/source.test.js`.
- Lint/typecheck: none configured in `package.json`.
- Log: scratchpad `npm-test.log` in the QA scratch directory.

## 2. Environment for the browser and API checks

- Scratch server on port 3002 from the copy, `DB_PATH` = a copy of `data/app.db`, `FILES_DIR` = a scratch directory. Started and then stopped by QA.
- Port 3001 was not touched (still answers 302 afterwards). Port 3000 was not touched. `data/app.db` and `data/files/` were only read (copied, plus read-only `sqlite3` queries).
- Scratch data added on 3002 (not in the real DB): epics PMPO-4 (children PMPO-2 Done/Fixed, PMPO-3 Done/Won't Do, PMPO-5 `<b>x</b>` To Do), PMPO-8 (Epic B), an empty epic, a stale epic, and an archived project ARCH (Completed then archived) with an epic and a child.
- Browser: Google Chrome (headless) driven by puppeteer-core (installed in the scratch tools directory, not in the project).

## 3. Acceptance criteria

| AC | Result | Reason (what was checked) |
|---|---|---|
| 1 | PASS | `GET /api/issues/4/children` and `/6/children` return `{items, summary}`; items have id, key, title, type, status, priority, assignee_id, assignee_name; ordered by status display order then number. |
| 2 | PASS | `total`/`done` correct (epic 4: total 3, done 2 with Won't Do counted); `byStatus` = To Do, In Progress, Done with zeros present. |
| 3 | PASS | Non-epic id 1, unknown 999 and `abc` each return 404 `{"error":"Epic not found."}`. |
| 4 | PASS | Epic 4 list excludes items of epic 11 and the other project's PMPA-1; list changes as items move. |
| 5 | PASS | Signed-out `GET /children` returns 401. |
| 6 | PASS | Children of epic 8 on archived project ARCH return 200. |
| 7 | PASS | Status PATCH reflected at once (progress 2 of 4 → 3 of 4 after a status change); retype epic to Task then `/children` returns 404 and child released (`epic_id` null); deleting epic 11 released its child. |
| 8 | PASS | Route in `server/routes/issues.js` calls only `issues.listChildren` / `issues.childSummary`; no SQL in the routes diff; new SQL is in `server/data/issues.js` next to `countChildren`. |
| 9 | PASS | Add/remove via PATCH `epic_id`. Cross-project epic, non-epic target and epic-under-epic each 400; archived add and remove each 409. |
| 10 | PASS | Child History shows `changed` with field epic, actor "Alex Morgan" (API and UI History tab); moving PMPO-8 → PMPO-4 recorded old/new ids. |
| 11 | PASS | Section shown for the epic (heading via `epicLabel()` from the types list); hidden on a child dialog. Label not hard-coded (grep of added lines finds no type names). |
| 12 | PASS | "2 of 3 done"; bar width 67% (rounded from 66.7%); counts "To Do 1 / In Progress 0 / Done 2" (zero shown). Status names from server; no literal status names in added code. |
| 13 | PASS | Rows show type icon, key, title, status, assignee, priority, Remove. Clicking a child title re-points the same dialog (no reload). Key click not separately clicked (same `openLinked` path). |
| 14 | PASS | Chip click opens the epic dialog; card status unchanged and card dialog not opened. Drag started on the chip moved the card (synthetic DragEvents, see Gaps). |
| 15 | PASS | Child Epic field shows link "PMPO-4 My first Epic"; clicking it returns to the epic; dropdown still present. |
| 16 | PASS | Picker lists "PMPO-6 TmpEpic" and "Other item (PMPO-8)" (current epic key shown); excludes epics (PMPO-4, PMPO-8), current children, and other-project PMPA-1. Add disabled until a pick, enabled after. Add updated list and progress (4 rows, "2 of 4 done") with dialog still open. Server error (item deleted behind the UI) shown as "Could not add: Work item not found." with selection kept. |
| 17 | PASS | Remove button (not the key/title button) removed the row; progress updated to "2 of 3 done"; dialog stayed open; zero confirm dialogs fired. |
| 18 | PASS | Create child: epic preselected to 4, type default "Task" (non-epic), title entered and saved; epic reopened listing "New child" and "2 of 4 done". |
| 19 | PASS | Empty epic shows "No items in this epic yet.", "0 of 0 done", Add and Create child visible. |
| 20 | PASS | Archived ARCH epic: Add, Create child hidden, zero Remove buttons; list (1 row) and progress readable. |
| 21 | PASS | Status change by drag, then reopen: "3 of 4 done", counts "To Do 1 / In Progress 0 / Done 3". Add, remove and create refreshed the open section without closing. |
| 22 | UNTESTED | Not run: a change made while the child's History tab is open and the epic dialog open. AC 10 (History entry) is verified, but this specific interaction was not driven. |
| 23 | PASS | Child titled `<b>x</b>` shows literally in the list and in the dialog title; no `<b>` element in the list. |
| 24 | PASS | Epic deleted via API while its link was stale: inline "Could not load the epic's items: Epic not found." and the dialog stayed open. |
| 25 | PASS | `npm test` 226/226 includes `tests/source.test.js` (new epic rules) and `tests/epic-view-extensibility.test.js`; grep of added lines in `board.js`, `board.html`, `server/` finds no status, type or resolution name literal. Adding a status and restarting was not separately run (covered by the extensibility test). |
| 26 | PASS | SQL only in `server/data/issues.js` (`listChildren`, `childSummary`); routes diff contains no SQL. |

Totals: 25 PASS, 1 UNTESTED (AC 22), 0 FAIL.

## 4. Requested browser checks (developer's list)

| # | Result | Note |
|---|---|---|
| (1) chip opens epic, no card open, no drag; drag on chip still drags | PASS | Chip-start drag moved PMPO-2 to In Progress with the card dialog closed. Synthetic events, not native pointer drag. |
| (2) progress text, bar, counts incl. zeros | PASS | See AC 12. |
| (3) picker rules, Add disabled, no close, inline errors | PASS | See AC 16. |
| (4) Remove without confirmation | PASS | No dialog event fired. |
| (5) child re-point; epic link leads back | PASS | See AC 13 and AC 15. |
| (6) Create child preselects epic and default type, returns to epic with child | PASS | See AC 18. |
| (7) drag child to last column, reopen epic | PASS | PMPO-2 and PMPO-5 moved to Done; reopened progress updated. |
| (8) empty epic with actions | PASS | See AC 19. |
| (9) archived read-only | PASS | See AC 20. |
| (10) child History shows epic add/remove as signed-in user | PASS | Epic change attributed to Alex Morgan. |
| (11) `<b>x</b>` renders literally | PASS | See AC 23. |
| (12) epic deleted elsewhere shows "Epic not found." inline | PASS | Message reads "Could not load the epic's items: Epic not found." (contains the required text). |

## 5. Regression and extra checks

- Won't Do style resolution counts as done: PASS (PMPO-3 Done/Won't Do counted in done).
- Moving a card to the column it is already in (drop PMPO-3 on Done): PASS, status and resolution unchanged, no page error.
- 200-character child title: API create 201; list rows render and dialog stays visible; no page error.
- Delete of an epic releases children (with history): PASS (API).
- Links, attachments, comments, history: API tests in the 226-test suite pass. In the browser, only History tab was checked (shows the epic change). Links, attachments and comments were not exercised in the browser: UNTESTED in UI.
- Page errors: none. Console 404s seen only from the deliberate stale/deleted-item requests.

## 6. Deviations (developer's, judged)

- Create child reopens the epic after create: ACCEPTED. It satisfies AC 18 ("returns to the epic with the new child listed").
- Epic field link points to the saved epic (not the unsaved dropdown choice): ACCEPTED. It matches AC 15 and avoids opening an unsaved selection.
- `byStatus` as an array of `{status, count}`: ACCEPTED. It has one entry per status in display order, as AC 2 requires.
- Children in an unknown old status count in `total` but get no `byStatus` entry: ACCEPTED, non-blocking. The per-status counts can then sum to less than `total`; the UI shows what the server sends. Worth a note in a future spec.

## 7. Gaps and what could not be tested

- Native pointer drag: headless Chrome via puppeteer did not start an HTML5 drag, so drags were driven with synthetic `DragEvent`s on the board. Chip-start drag was checked only this way.
- AC 22 (History tab open during an add or remove) not driven.
- Key click on a child row not separately exercised (title click verified).
- Links, attachments and comments not exercised in the browser (API tests only).
- Retype of an epic and delete of an epic via the UI buttons not exercised (API only).
- Extensibility (adding a status to `statuses.js`, restart, see count) not run by hand; covered by the new test only.
- Not tested: mobile/narrow layout, keyboard-only navigation of the picker, multi-user concurrency.
- Scratch data created on the 3002 scratch DB only; port 3001 and 3000 untouched; `data/app.db` and `data/files/` not written.
