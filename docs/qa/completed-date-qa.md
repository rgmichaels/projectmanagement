# QA: Completed date on cards (release gate)

Date: 2026-11-20
Spec: `docs/specs/completed-date-on-cards.md` (owner accepted the open-question defaults)
Design: `docs/design/completed-date/README.md`, `docs/design/completed-date/main.html`, `docs/design/STYLE.md` section 14
Scope: the uncommitted working tree (`git diff HEAD` plus untracked files). Gantt and daily report are already committed.
Environment: Windows 11, Node v24.20.0, headless Microsoft Edge driven over CDP, signed in as `robert` (Admin). Machine time zone is UTC-5 (New York).

## Verdict summary

Blocking: AC 22 (the Completed field appears in the item dialog opened from the Sprints page, and the shared dialog code on the Timeline page carries it too; the spec and the design README both say "not on the Timeline or Sprints").
Owner decision needed: AC 23 asks for an automated test of the export column (AC 21), but no exporter exists in the code, so the test cannot be written.

Everything else checked passes: the server logic, the migration and backfill on the owner's data, the Board (drag in and out, failed move, same-column drop, swimlanes, tooltips, year rule, local day, hostile text), the item dialog (read-only, unsaved change, save, reopen), the Backlog pill, the 1024px wrap, Viewer read-only, empty board, and delete. Not verified: the archived board (AC 18), because the test project has no active sprint, so its Board shows no items.

## Commands and results

1. `npm test` (in the project root; the script is `node --test "tests/*.test.js"`): **tests 581, pass 581, fail 0, skipped 0**. Duration about 48 s. This matches the developer's claim. The two new test files are included in the glob (`tests/completed-date.test.js`, `tests/completedDate.test.js`).
2. Lint and typecheck: none configured (no eslint or tsconfig in the repo). Not run.
3. Migration on the owner's data. I copied `data/app.db` to the scratchpad (`qa-app.db`, byte-identical at copy time; no `completed_at` column yet, so pre-migration) and started my own server on port 3001 with `PORT=3001 DB_PATH=<copy>`. The copy was migrated at startup. Read-only query on the copy after startup:
   - EFS-1, 2, 3, 4, 5, 6, 14, 15 (project 3): `completed_at` and `completed_by` equal the most recent `status -> Complete` history event and its actor, Robert Michaels (for example EFS-1 `2026-11-20T13:57:53.043Z`, EFS-4 `2026-11-20T14:00:36.209Z`, EFS-6 `2026-11-20T14:06:42.114Z`, EFS-14 `2026-11-20T14:28:22.512Z`).
   - EFS-4, 5 and 6 each went Planning -> Ready -> Complete. The value used is the last Complete event, as required.
   - All 47 items with status `Complete` across all projects have non-null `completed_at` (0 nulls). Non-terminal items with a completed value: 0.
   - Restart: I stopped and restarted my server on the same copy. The `issues` rows before and after the restart are byte-identical (`cmp`), so the backfill did not run again.
   - Second run on a fresh copy (started again from the owner's file): the same backfilled values appear in the browser's API data (EFS-1..4, 6, 14 match the first run).
4. Browser run, two drivers (scratchpad `qa-completed.js` and `qa-extra.js`), against my port 3001 only. Results: main run 42 pass, 1 fail (H3, a data gap, see below), 11 info. Follow-up run: F8 pass, G2 info (Sprints dialog shows the field), K2 failed on a stricter check than the design (see AC 12 and the layout notes). The only console error is the 500 I injected on purpose for the failed-move check.
5. The owner's server on port 3000 was not touched. The owner's `data/app.db` was only read (copied and compared). Its mtime moved from 11:06 to 11:23 during this session. The owner's live server on 3000 is the likely writer; I did not open it for writing.

Cleanup: my Edge processes were killed by PID tree (`taskkill /PID <pid> /T /F`). My server on 3001 was stopped by PID. No `msedge.exe` process was killed by image name, because the owner may have Edge open.

## Acceptance criteria

| AC | Result | Reason |
|---|---|---|
| 1 | PASS | `issues` has nullable TEXT `completed_at` and `completed_by`, no CHECK (unit test `schema`; migration added the columns on the copy). |
| 2 | PASS | Non-terminal items have both null (unit test; browser: open cards show no line; API null after moving out, D2). |
| 3 | PASS | Set on drag into Complete (browser D1), dialog status change and save (browser E6), cross-lane PATCH by another user (unit test). Same write as resolution (unit test). |
| 4 | PASS (data layer only) | Unit test creates an item in Complete via `createIssue`. The API always creates in the first status, so the path is not reachable from the UI or API. Deviation 3 accepted. |
| 5 | PASS | Clear on leaving (D2, E9, unit test); re-completion gets a new time, not the earlier one (E11, unit test). |
| 6 | PASS | Reorder, same-column drop, rename, swimlane change, resolution change and same-status PATCH leave both unchanged (unit test; browser D3). |
| 7 | PASS | Client-sent `completed_at` / `completed_by` are ignored on create and PATCH (unit test). |
| 8 | PASS | Present in list, single and PATCH responses; string or null (unit test; browser uses the list endpoint for every card). |
| 9 | PASS | Only the status history event is written; no completed-field changes in `issue_history_changes` (unit test). |
| 10 | PASS | Columns added with the guarded migration; backfill checked on the owner's data (see Commands 3). Items not in Complete stay null. Restart changes nothing (cmp). Wording deviation for "no history at all" (uses `updated_at`) is discussed below. |
| 11 | PASS | 47 of 47 Complete items on the copy have a date; unit test covers the three seeded cases. |
| 12 | PASS (with note) | Card line `✓ Completed Nov 20` in the card's meta row, last row, `order: 1` (C2, C9, K1). Text is 12px muted per the design. I did not measure it against the card's other text sizes. Card height grows by 23 px on EFS-1 (174 px to 151 px without the row), and by the same 23 px on the long-title card; the design says "about 20px". The date rests on its own line (C11). |
| 13 | PASS | `Nov 20` for the current year and `Nov 20, 2025` otherwise (C5, EFS-15). 23:30 local on Nov 20 shows Nov 20, tooltip 11:30 PM (C4). Unit test covers the year rule and the local day. |
| 14 | PASS | Tooltip `Completed Nov 20, 2026 at 11:22 AM by Robert Michaels` (C3, D1, E1, F2). `by` omitted when null: unit test (browser did not seed a null completer). |
| 15 | PASS | Card dragged out loses the line immediately, from the server response (D2). Only Complete cards show the line (C1). |
| 16 | PASS | Dragged-in card shows the line from the PATCH response (D1). Failed PATCH: card back in In Progress, no line, API null (D4). |
| 17 | PASS | Cards remain draggable (C12, D1), and clicks open the dialog (E1, F8). |
| 18 | PASS for swimlanes; UNTESTED for archived board | Group by Assignee, Epic and Priority: every Complete card in every lane shows the line (C13 x3). Archived board: project 1 has no sprint, so its board shows no cards (the board shows only the active sprint's items), so this cannot be checked with the data available. Viewer read-only path is checked (H1). |
| 19 | PASS | Dialog shows `Completed` with the date, read-only, no `name`, tooltip on the input, focusable (E1, E2), typing does nothing (E3). Hidden for In Progress (E4). Unsaved status change to Complete does not show it (E5). After save it shows (E6, E7). Reopen after Complete -> In Progress: hidden (E9, E10). Viewer: shown read-only, Save hidden (H2). |
| 20 | PASS | Backlog pill suffix ` · Nov 20` on the 10 Complete rows only (F1, F3). Tooltip matches (F2). Row click opens the dialog with the field (F8). At 1024px no row grows when the suffix is added (F5, F6: all rows 44 px with and without). |
| 21 | PASS (docs only) | `docs/specs/export.md` lists `Completed` after Resolution (checked in the diff). No exporter exists: no CSV module (`public/js/csv.js` absent), no export route, and the only CSV reference is the attachment MIME table in `server/attachmentTypes.js`. Nothing to change in code. Deviation 2 accepted. |
| 22 | **FAIL** | The Completed field is shown in the item dialog on the Sprints page (G2: `Nov 20` for EFS-14). `public/timeline.html` loads the same `board.js` and includes the same field markup, so the Timeline dialog shows it too (not browser-verified because EFS-14 has no dates, so it is not on the Timeline). The design README says "Not on Timeline, Sprints, Test Cases or Daily Report", and AC 22 says the same. Test Cases and the Daily Report contain no completed-date code (grep: no matches). See deviation 4. |
| 23 | **FAIL (partial)** | Tests cover AC 1-11, 13 and 14, and the unit test covers the formatter. The export-column test (AC 21) is not present, and cannot be written because no exporter exists. Owner decision needed (waive, amend AC 23, or defer until the exporter is built). |

## Judgement on the developer's declared deviations

1. **Backfill with no history at all uses `updated_at`.** Accepted. The Decisions section and Open question 1 (owner-accepted) say `created_at` only for an item created in Complete, otherwise `updated_at`. An item with no history cannot be shown to have been created in Complete, so `updated_at` follows the accepted default. AC 10's wording ("created_at when the item has no status history at all") conflicts with that default. Owner should align the AC text. Not blocking.
2. **AC 21 docs-only.** Accepted for AC 21 (see table). AC 23's export test is the open point (owner decision above).
3. **AC 4 only via the data layer.** Accepted. The API cannot create an item outside the first status, so the path is not reachable without the data layer. The unit test covers it.
4. **Dialog field on all four pages.** **Not accepted.** The field is in the shared item dialog and so appears on Sprints (verified) and Timeline (by markup). AC 22 and the design README both say it must not appear on those pages. Fix: hide the field when the dialog is opened from the Timeline or Sprints pages, or the owner waives the deviation in writing. This is the one blocking defect.
5. **Narrow exemption in `tests/source.test.js`.** Accepted. The exemption removes only the exact markup `<label for="completed-input">Completed</label>` before the sprint-state name check, so the guard still applies to every other occurrence of "Completed" in server, client and page code. The reason is real: "Completed" is a sprint state name, and the field label has the same word.
6. **Two small CSS additions beyond the design.** Accepted. `.completed-field[hidden] { display:none }` is needed because `display:flex` on the field would otherwise override the `hidden` attribute (verified: E4 and E10 hidden). `label { margin:0 }` overrides the global label margin the design already mentions.
7. **Backlog pill wrap at 1024px.** Checked in the browser: no row grows when the suffix is added (F5, F6). Accepted.

## Other gap checks

- Empty project board: loads with no cards, no line, no errors (I1).
- Very long title (188 characters): wraps inside the title, no horizontal overflow (C7).
- Hostile title (`<img src=x onerror=...>`) and hostile completer name: rendered as text, no injected image, handler did not run (C6, C7, F4).
- Drop into the column the card is already in: `completed_at` unchanged, line still shown (D3).
- Delete a Complete item on the board: DELETE 204, board reloads without it, no errors (I2).
- Two-row card-done layout at the 220px column width that the Board renders: EFS-15 (`Fixed` plus `✓ Completed Nov 20, 2025`) becomes two stacked units, and the date is not broken mid-text. The design's wrap rule ("the date moves under the label as a unit") is met. My stricter one-line check (K2) fails on EFS-15 only for that reason, not for a defect.
- Column width on the Board at 1280px is 220px in this layout, not the 240px in the design README. The column is not changed by this feature; I did not investigate further.
- Console: no errors or exceptions other than the 500 I injected for the failed-move check.

## Defects

1. **(Blocking) Completed field shows on the Sprints and Timeline pages** (AC 22, design README "Not on Timeline, Sprints"). Repro: open `/sprints.html?project=3`, click EFS-14's key; the dialog shows `Completed Nov 20`. Fix: gate the field on the page (or on an opener flag) or get a written owner waiver.
2. **(Owner decision) AC 23 export test cannot exist yet.** No exporter in the code.
3. **(Spec wording, non-blocking)** AC 10 says `created_at` for "no status history"; Decisions and Open question 1 say `created_at` only for items created in Complete. The code follows the Decisions. Owner should align the AC text.

## Notes for the owner

- The Board's default view shows only the active sprint's items. Items with no sprint are invisible on the Board, which is existing behaviour and not related to this feature.
- The browser checks ran on a copy, not on `data/app.db`. The owner's live server on port 3000 is still running and was not stopped.

## Re-check after developer fixes (2026-11-20)

Requested by the coordinator after the developer changed the code and spec. This section supersedes the table rows for AC 10, 21 and 23, and deviation 4, above.

Checks run:
1. `npm test`: tests 581, pass 581, fail 0, skipped 0 (duration about 44 s).
2. Migration: a fresh copy of `data/app.db` (read, copied to the scratchpad; the owner's file was not written) started on my own server on port 3001. Earlier migration evidence still applies: the backfill values, the 47 of 47 terminal items with a date, and an unchanged restart.
3. Browser (headless Edge, `robert`, gate driver on the fresh copy, 7 pass, 0 fail):
   - J1 Board dialog, Complete item (EFS-14): Completed field shown, `Nov 20`, read-only, tooltip present.
   - J3 Board dialog after saving a status change into Complete (EFS-16, reopened): shown.
   - J4 Backlog dialog, Complete row (EFS-1): shown.
   - J5 Sprints dialog, Complete item (EFS-14): field `hidden`, computed `display: none`.
   - J7 Sprints dialog after a save and a page reload, Complete item: still hidden.
   - J8 Timeline dialog, Complete item (EFS-14, given dates so it is on the Timeline): hidden, `display: none`.
   - J10 Timeline dialog after a save and a page reload: still hidden.
   - The Sprints and Timeline dialogs close on save, so "after save" is verified by reopening after the save and a reload. Console: no errors.
4. Spec amendments: AC 10 now says `created_at` only for an item created in the terminal status (a `created` event and no status change), and `updated_at` otherwise, including an item with no history. This matches the code (`migrateCompleted`) and Decisions / Open question 1. AC 21 says the export column is specified in the export spec and implemented with the export feature. AC 23 defers the export-column test to that feature. These resolve the three points above. Note that the developer edited accepted criteria. The owner should confirm the AC 21 and AC 23 deferral, since those criteria were previously accepted as written.

Updated results:
- AC 10: PASS (wording aligned with the accepted default; the code matches).
- AC 21: PASS under the amended spec (docs and deferral; no exporter exists).
- AC 22: PASS. The field is gated in script (`completedDate.showInDialog`: board and backlog only). It stays hidden on Sprints and Timeline, including for a Complete item and after save, and shows on Board and Backlog.
- AC 23: PASS under the amended spec (export test deferred with the export feature).
- Deviation 4: accepted under the gate.
- No blocking defects remain.

Cleanup: my server on 3001 was stopped by PID. The owner's server on 3000 is still running (answering on `/api/auth/me`). The owner's `data/app.db` mtime is now 11:35 (the owner's live server writes it; I only read it).

VERDICT: GO
