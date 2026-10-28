# QA: Time tracking and estimates

Date: 2026-10-28
Spec: `docs/specs/time-tracking.md` (AC 1-58, Decisions 1-9)
Design: `docs/design/time-tracking/README.md` (option A), `docs/design/STYLE.md` part 7
Branch: sprints-backlog-restyle
Code under test: the time tracking work. Note: commit `ff5680c` ("Add project scope dropdown, Sprints page, test case manager, time tracking and estimates", 2026-10-28 14:01:34 EDT) appeared while this QA was running. The tree was clean afterwards. The API and targeted test checks ran just before that commit, and the browser checks ran after it, on the same code. QA did not commit anything.

## Verdict

**GO.** No acceptance criterion fails. Seven developer deviations were judged; all are acceptable and listed for owner confirmation below. Two minor gaps (not blocking) are listed under "Gaps".

## Commands and results

1. Targeted tests (run fresh, only the listed files):
   `node --test tests/time-tracking.test.js tests/time.test.js tests/history.test.js tests/source.test.js tests/sprints.test.js tests/sprintView.test.js tests/projectScope.test.js tests/bulkMove.test.js tests/permissions.test.js`
   Result: tests 224, pass 224, fail 0, skipped 0, duration 27.3 s. (Full suite not run, per the brief.)
2. Lint and typecheck: `package.json` defines only `start` and `test`. Nothing to run.
3. Live app: a scratch copy of `data/app.db` (taken at about 13:50) served on port 3101 with `DB_PATH` and `FILES_DIR` pointing into the scratchpad. The repo DB was never used by QA. A read-only check of `data/app.db` found no QA rows (its two projects are the owner's, `Rob's project 1` and `SFDC-PM`).
4. API checks, all against the scratch server (scripts in `C:/Users/elermichaels/AppData/Local/Temp/claude/C--Users-elermichaels-Code-projectmanagement/d97fbdd8-a90e-4ca5-a02a-cae6d4cf3652/scratchpad/qa-api/`):
   - `node check.js`: 65 checks. First full run gave 62 PASS and 3 FAIL, all three from errors in the QA script itself (a Member cannot delete items, which is correct; a wrong field name in my history parser; a wrong expected value). The history change was then confirmed by a direct query (`old "8"`, `new "12"`). The deletion was re-checked with an Admin in `check2.js`.
   - `node check2.js`: 24 of 24 PASS (Viewer 403s and read, Admin-driven item delete with cascade and no orphan rows, Completed-sprint log/edit/estimate, archived project 409s with reads still 200).
5. Browser checks: headless Edge over the DevTools protocol, driver `scratchpad/qa-ui/drive.js` on a freshly seeded project (`seed-ui.js`, project 9). Result: 48 of 48 PASS, run as Member (Blake), then as Viewer (Dana). Probes `probe.js` to `probe4.js` covered the Sprints figures, dialog close, Escape, time-save refresh, no-sprint bar, epic type toggle and card text. Console: no uncaught exceptions were recorded. The 400 responses are the invalid inputs the script submitted on purpose. The 404 is `/favicon.ico`.
6. Screenshot checked: `scratchpad/qa-ui/shots/20-backlog.png` (Backlog with figure, Est. (h) column, dash for empty, wrapped long title).

## Acceptance criteria

| AC | Result | Reason |
|---|---|---|
| 1 | PASS | POST returns 201 with the full entry shape; body `user_id`/`user_name` ignored (check.js). |
| 2 | PASS | Live table: 1.5, 0.25, 24 accepted; 0, -1, 0.1, 25, "abc", "1.5", missing, 1.3 rejected with the exact message. |
| 3 | PASS | Future date and 2026-02-30 rejected; omitted date stores today. Past dates allowed (tests). |
| 4 | PASS | 501 chars rejected, 500 accepted; blank note stored as null; HTML note shown and stored as literal text. |
| 5 | PASS | Epic POST 400 `Time cannot be logged on an epic.`, nothing stored. |
| 6 | PASS | Other user PATCH/DELETE 403 with the exact message; Admin PATCH on another's entry 403; no-op PATCH keeps `updated_at`; `issue_id`/`user_id` ignored on PATCH. |
| 7 | PASS | Viewer POST/PATCH/DELETE 403 with `Your group (Viewer) is not allowed to log time.`; Member 201. Check order covered by tests. |
| 8 | PASS | Archived project: POST, PATCH, DELETE and estimate PATCH all 409; reads 200; entry unchanged. |
| 9 | PASS | Member logs, edits and deletes on items in a Completed sprint (check2). |
| 10 | PASS | Entries newest work date first, ties by id; total_hours equals sum; unknown item 404 `Work item not found.`; Viewer can read. |
| 11 | PASS | `time_spent_hours` on list and single item; epic returns 0 and `estimate_hours` null. |
| 12 | PASS | Admin deletes an item; time GET then 404; zero `time_entries` rows left in the DB. |
| 13 | PASS | Sprint `time_spent_hours` equals the sum of its items (API). Planned sprint not driven live; same SUM. |
| 14 | PASS | Moving an item moves its hours and estimate between sprint totals on the next read (API: 0/0 to 8/33.5). |
| 15 | PASS | Exact values (33.5, 31.25 h) in the API; UI rounds only for display (`0.75 h`). |
| 16 | PASS | Board bar shows `Sprint 1  11.5 h logged / 12.25 h est.` beside the name. The zero-logged text uses the same formatter; not driven live. |
| 17 | PASS | Time add: bar 11.5 to 12.25 without reload; time delete: back to 11.5; estimate save: 11.5 / 14.25. Moving an item in/out of the sprint not driven in the browser (API covered by 14). |
| 18 | PASS | Project with no active sprint: `#sprint-bar` hidden, no figure. |
| 19 | PASS | Sprints summary shows `11.5 h logged / 14.5 h est.` (Active) and `4.5 h logged / 5 h est.` (Completed). Planned uses the same renderer, not driven live. |
| 20 | PASS | Backlog sprint headers show the figure; the Backlog (unscheduled) panel shows none. |
| 21 | PASS | One shared helper (`timeFormat.hours`, `sprintFigureParts`) used by all three pages; unit tests pass; figures match across pages. |
| 22 | PASS | Time tab after Links, before Test Cases; `role="tab"`, `aria-controls` to a `role="tabpanel"`; badge shows `6.5` (logged, not estimate). Tab bar on one row at 660 px (measured 612 px of 612 px, tight style, no overflow, on this machine's fallback font). |
| 23 | PASS | Order in the panel: summary, Log time form, entries list. |
| 24 | PASS | Hours step 0.25 / min 0.25 / max 24; date max today and default today; note maxlength 500. Submit adds the entry, clears Hours and Note, updates totals. Invalid hours shows `role="alert"` and the dialog stays open. |
| 25 | PASS | Newest first; Edit and Delete only on the logged-in user's entries (Blake sees 1 of 2); inline edit saves; delete asks `confirm`. Empty-state text not driven live. |
| 26 | PASS | Epic dialog: no Time tab, no summary (live). |
| 27 | PASS | Viewer (Dana): no form, no Edit or Delete, summary and list readable, Backlog estimates read-only. Archived project UI not driven (API 409 covered). |
| 28 | PASS | Closing with unsaved Log time text: no prompt (confirm count 0, dialog closed). |
| 29 | PASS (partly) | Board figure and summary refresh after time save (live). Backlog row and Sprints figure refresh after a time save not driven live. |
| 30 | PASS | No card in the Board contains logged or estimate text (live). |
| 31 | PASS | Time entries write no history (tests). Estimate change recorded as one `changed` event (API). Sprint events unchanged (tests). |
| 32 | PASS | Edited row shows `edited` with timestamp (live); unedited saves keep `updated_at` (API). |
| 33 | PASS | Targeted suite (224 pass) covers the listed items; full `npm test` not run per brief. |
| 34 | PASS | `estimate_hours` (null when unset, not 0) and `remaining_hours` on list and single item. |
| 35 | PASS | Live table: 8, 0.25, 1000, null accepted; 0, -1, 0.1, 1000.25, "abc" rejected with exact message; empty string clears; omitted keeps. |
| 36 | PASS (see deviation 5) | Epic estimate 400 `An epic cannot have an estimate.`; create with estimate on epic 400; conversion to epic clears estimate and sprint with history. Null on epic is accepted (deviation 5). |
| 37 | PASS | Viewer estimate PATCH 403 and unchanged; Member 200; archived 409; estimate on an item in a Completed sprint editable (200). |
| 38 | PASS | Remaining under (8 h est, 6.5 logged = 1.5 remaining) and over (3.25 est, 4 logged = `▲ 0.75 h over`) live; equal case in tests. |
| 39 | PASS | Sprint `estimate_hours` and `unestimated_count` correct live (unestimated item counted; epic excluded; done item in Completed sprint counted: 5 h). |
| 40 | PASS | Move carries estimate and hours (API); completion moves unfinished items with their values (tests). Delete changes totals on next read (SUM, not separately driven). |
| 41 | PASS | Estimate field right of Sprint: `step 0.25 min 0.25 max 1000 placeholder Hours`, label "Estimate", "h" unit; saved with item Save; invalid 0.1 gives inline `role="alert"` and dialog stays open. |
| 42 | PASS | Create form shows empty Estimate for a task; create with `estimate_hours` stores it (API). |
| 43 | PASS (minor gap) | Switching Type to epic hides Estimate, switching back shows it empty (live). The Time tab stays visible until the item is saved as an epic (see gaps). |
| 44 | PASS | Viewer sees read-only `8 h` with no input. |
| 45 | PASS (see deviation 1) | Summary shows Estimate, Logged, Balance; `1.5 h remaining`; `▲ 0.75 h over` with `(over)` and `.is-over`; progress bar `role="progressbar"` with `81% of estimate logged`; no-estimate shows `No estimate` and no bar. |
| 46 | PASS (see deviation 4) | Estimate save shows on Board bar at once; reopened dialog shows `Estimate 2 h`, `1 h remaining`. The summary refreshes on next open because the dialog closes on save. |
| 47 | PASS | No-estimate state live (`No estimate`, `1 h logged`). The `0 h logged` text uses the same formatter; not driven live. |
| 48 | PASS | Estimate input has `<label for>`; error is `role="alert"` with `aria-invalid`; native number keyboard behaviour. |
| 49 | PASS | Estimate change `8` to `12` writes one `changed` event with `old "8"`, `new "12"` (API). Creation and no-op writes covered by tests. |
| 50 | PASS | `estimate` entry (label "Estimate") in `GET /api/history-fields`; tests check the list and the updatable-column test. |
| 51 | PASS | Summary is the only per-item estimate-vs-logged display; cards show none (live). |
| 52 | PASS | Backlog Enter saves with `Saved` tick and sprint header updates in place (live); Escape restores the saved value and sends nothing; invalid 0.1 shows `Estimate must be...` alert and restores the previous value with nothing stored; Viewer sees read-only text, no input; typing does not open the dialog. Blur-to-save not driven live. |
| 53 | PASS | Live: `11.5 h logged / 14.25 h est.`, `(over)` on the dialog summary. `(n not estimated)` and sprint-level over text use the same helper (unit tests); not seen live because no item was unestimated at that point. |
| 54 | PASS | Backlog sprint panels have the `Est. (h)` header strip; empty estimates show a dash (screenshot). Epic panel has no column (deviation 2). |
| 55 | PASS | Sprints table has `Estimate` and `Logged` columns, sortable arrows present. Epics never appear in sprint tables, so no epic dash case. Right alignment and widths not measured. |
| 56 | PASS | Sprint 1 has items 8, 3.5, 2 and 1 estimated (sum 14.5) and logged 6.5, 4, 1 and 0 (sum 11.5); Board, Backlog and Sprints figures all read `11.5 h logged / 14.5 h est.` |
| 57 | PASS | Targeted test files cover the listed items (224 pass). |
| 58 | PASS | Existing tests updated for the new keys and history fields; targeted suite green. |

## Developer deviations (judged)

1. **Third summary value labelled "Balance" instead of "Remaining" or "Over" (AC 45).** Accept, non-blocking. The owner-chosen design README says "Balance". The values still say `n h remaining` or `▲ n h over`, so the words and the triangle are present, and the state is not colour-only. Owner to confirm the label.
2. **No spacer cell on Backlog Epics rows.** Accept, non-blocking. Epics sit in their own panel, which has no `Est. (h)` header, so nothing needs to line up. The design README's "space kept" is not met. Epic and normal rows both end at the same right edge (1232 px). The avatar position was not measured.
3. **Completed sprints on the Backlog show the figure and keep editable estimates.** Accept. AC 20 requires the figure on each sprint panel, and AC 37 keeps estimates editable in a Completed sprint. Verified: `4.5 h logged / 5 h est.` on the Backlog and PATCH on a completed-sprint item returns 200.
4. **Saving the dialog closes it, so the Time summary refreshes on next open.** Accept. This matches the dialog's existing Save behaviour. The Board figure updates at once without reload (live). Reopening shows the new Estimate and remaining (live). Owner should know AC 46 is met on reopen rather than in place.
5. **`estimate_hours: null` on an epic is accepted as a no-op.** Accept, but the owner should confirm. AC 36 literally says `estimate_hours` on an epic returns 400. Here null means "no estimate", which an epic already has, and non-null values still get 400 `An epic cannot have an estimate.` (verified live).
6. **Time-entry PATCH with `date: null` returns 400.** Accept. The work date is NOT NULL, the spec is silent on PATCH null, and the message is the date rule (verified live).
7. **Item with logged time changed to an epic keeps its entries but counts as 0.** Accept. Epics take no time (Decision 2). Verified: the converted item's `time_spent_hours` is 0 and its single entry remains in the DB. Owner should know the entries are hidden from totals rather than deleted.

## Gaps (not blocking)

- **Time tab visible after switching Type to epic, before saving (AC 26, AC 43).** The Estimate field hides at once; the Time tab stays visible until the item is saved as an epic. Clicking Log time before saving would log to the still-saved task. Suggest the developer hide the tab on the same Type change.
- **Not driven live:** Backlog blur-to-save; the zero-logged text (`0 h logged`); the sprint-level `(n not estimated)` and over text (unit-tested only); Backlog and Sprints refresh after a time save; moving an item in or out of a sprint in the browser; Viewer on an archived project; empty project board.
- **Delete on the Board:** item delete with time was checked through the API (cascade and no orphan rows), not through the Board's delete control.
- **Drag and same-column move:** out of scope for this change and not tested.
- **Tab bar fit:** measured here with the fallback font (612 px of 612 px, one row). Real width depends on the installed font, as the design README notes; the scroll fallback is in place.

## Regression: project scope and Sprints

- Targeted suites for `projectScope`, `sprints`, `sprintView`, `permissions`, `bulkMove`, `history` and `source` all pass (inside the 224).
- Live: the top bar Project dropdown shows on the Board and Backlog (screenshot). The Sprints page loads, its sprint picker is present, and its figure loads for Active and Completed sprints.
- Live: Backlog epic rows have no checkbox, so epics stay unselectable. Viewer sees read-only estimates. Bulk move (selection strip) was not driven live; its tests pass.

## Scratch artefacts (not in the repo)

All under `C:/Users/elermichaels/AppData/Local/Temp/claude/C--Users-elermichaels-Code-projectmanagement/d97fbdd8-a90e-4ca5-a02a-cae6d4cf3652/scratchpad/`: `qa.db` (scratch DB), `qa-files/`, `qa-server.log`, `qa-api/check.js`, `qa-api/check2.js`, `qa-ui/seed-ui.js`, `qa-ui/drive.js`, `qa-ui/probe.js` to `probe4.js`, `qa-ui/shots/*.png`. The scratch server on port 3101 has been stopped.

VERDICT: GO
