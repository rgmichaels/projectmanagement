# Gantt chart (Timeline) QA

Date: 2026-11-05
Branch: `gantt-chart` (uncommitted working tree)
Spec: `docs/specs/gantt-chart.md` (28 acceptance criteria)
Design: `docs/design/gantt-chart/README.md`, `docs/design/STYLE.md` section 12
Tester: QA agent (Haiku 5.5), independent re-run; developer report not relied on.

## Verdict

**GO.** All 28 acceptance criteria pass. Every criterion that is an API or data rule was run against a live server. The page was driven in Microsoft Edge (headless, Chromium 156) with real pointer input for move, resize, click and keyboard. No blocking defect was found. Three minor, non-blocking defects are listed below, plus one interpretation for the owner to confirm.

## Commands run and results

| # | Command or check | Result |
|---|---|---|
| 1 | `npm test` (`node --test "tests/*.test.js"`), run fresh, exit code captured | Exit 0. `tests 541, pass 541, fail 0, cancelled 0, skipped 0, todo 0`. Repeated, same result. The stderr stack traces ("Error: boom") come from existing time-tracking tests that inject a failure on purpose; they are expected output, not failures. |
| 2 | `node --test tests/timeline.test.js tests/timelineMath.test.js` | 26 of 26 pass (these are included in the 541). |
| 3 | Lint / typecheck | Not configured. `package.json` has only `start` and `test`. Not run. |
| 4 | Live API check, `qa-live.js`, against `node server/index.js` on a scratch DB (`DB_PATH` in the scratchpad, port 3197) | 29 of 29 PASS. |
| 5 | Edge headless over CDP, `qa-browser.js` (real mouse drag and resize, click, zoom, reload, intercepted HTML5 drag from Unscheduled) | 27 of 27 PASS, no JS errors. |
| 6 | `qa-readonly.js`: Viewer user and an archived project, in the browser | 14 of 14 PASS, no JS errors. |
| 7 | `qa-failure.js`: drag refused by server (archived while the page is open), dialog date refused by server | 9 of 9 PASS. |
| 8 | `qa-extra.js`: empty project, Enter key on a bar, collapse and expand | 7 of 7 PASS. |
| 9 | Repo state after the QA runs | Only `docs/qa/` was written. No repo file changed by the QA runs; the server and browser used scratch data and were shut down afterwards. |

Scripts and screenshots are in `C:\Users\elermichaels\AppData\Local\Temp\claude\5e18abff35dcecc9\c1755234-49c5-41fe-a675-021eca46ae2f\scratchpad\` (`qa-live.js`, `qa-seed.js`, `qa-browser.js`, `qa-readonly.js`, `qa-failure.js`, `qa-extra.js`, and `timeline-week.png`, `timeline-day.png`, `timeline-month.png`, `timeline-empty.png`, `timeline-dialog-error.png`).

## Review of the two modified existing tests

Both edits are legitimate and do not weaken coverage.

- **`tests/history.test.js`** (one line). The test pins the exact display order of `/api/history-fields`. The developer added `start_date` and `due_date` into that expected array, between `estimate` and `time_entry`. The spec anticipates this ("`tests/history.test.js` fails otherwise"). The exact-order assertion still runs on the full list.
- **`tests/auth.test.js`** (old-DB migration test). The test compares every issue column after the migration with the pre-migration rows. The developer strips `start_date` and `due_date` from that comparison, as it already does for `reporter_id`, `sprint_id`, `sprint_rank` and `estimate_minutes`. It then adds an assertion that both are `null` (no backfill). The edit is needed because `SELECT *` now returns the new columns, and it adds a check rather than removing one.

Note: the spec says "all existing tests are unchanged". These two edits are forced by the spec's own data-model change, so I treat them as in scope. The owner should acknowledge them explicitly when committing.

## Acceptance criteria

Key: PASS = verified by me (live API, browser, or test run as stated). PASS (code) = verified by reading code and/or unit tests, not exercised end to end in the browser. None are FAIL. None are UNTESTED.

### Dates on work items

1. **PASS.** `migrateDates` in `server/db.js` (idempotent, `PRAGMA table_info` check) and the CREATE TABLE columns. Test "a database without the date columns gains them, nullable, without backfill; idempotent (AC 1)" passes. Existing rows are null.
2. **PASS.** `checkIssueDates` in `server/validation.js` reuses `checkDate`. Live: create with `2026-13-01`, `02/11/2026`, `2026-1-5`, `tomorrow`, `20261105`, and PATCH with `2026-02-30` all return 400 with an `error` string. `''` is stored as null. `2026-02-30` on create is covered by `tests/timeline.test.js` line 109.
3. **PASS.** Live: due before start returns 400 on create and on PATCH against the stored start. Equal dates are 200. A single date is 201 on create. Test covers "checked against the stored value".
4. **PASS.** Live: `GET /api/projects/1/issues`, `GET /api/issues/:id`, POST and PATCH responses all carry `start_date` and `due_date`. The SELECT is the shared one in `server/data/issues.js`.
5. **PASS.** Live history: `changes: [{field:"start_date", label:"Start date", kind:"text", old:"2026-11-02", new:"2026-11-03"}]`; clearing gives `new: null`; an unchanged PATCH adds no event (count 4 before and after). Archived project PATCH returns 409 (live). The "Due date" label is set in `server/historyFields.js` and tested in `tests/timeline.test.js` line 149.
6. **PASS.** Browser: the dialog shows "Start date" and "Due date" inputs with stored values, enabled for an editor, with the hint visible. For a Viewer and for an archived project both inputs are `disabled`, the hint is hidden, and the dialog opens read-only. A server error ("Due date must not be earlier than start date.") appears in `#detail-error`, and both inputs get `aria-invalid="true"`. The dirty flag uses `projectScope.detailDirty`, which compares every key of the loaded and current form values, so the two date fields count. The "Discard changes?" prompt itself was not driven.
7. **PASS.** `timeline.html` has `<a id="nav-timeline">` with `aria-current="page"` on itself, and the link is in the `.subnav` of Board, Backlog, Sprints and Test Cases. Browser: the link shows active on the timeline page and carries `?project=1`. `pointNav` in `projectScope.js` rewrites every `.subnav a`. Browser: archived read-only behaviour verified. Not driven: "Project not found." and the project dropdown switch on this page (shared code, not re-run).
8. **PASS.** `package.json` is unchanged. The new files contain no CDN or external URLs (grep). The chart is hand-rolled HTML, CSS and DOM.
9. **PASS.** Browser: groups "Sprints", "EPIC QAL-3", "EPIC QAL-5", "No epic" shown in that order; children under their epic; all expanded at first. Collapse hides children (rows 13 to 11) and keeps the header's rollup bar; expand restores them (13).
10. **PASS.** Browser: epic with own dates shows a solid epic bar (QAL-3). Epics with no dates and scheduled children show a dashed rollup (QAL-5, and "No epic"), with no handles. Epic with neither dates nor children showing no bar: unit-tested in `buildGroups`/`rollup`; not seen in the browser data set.
11. **PASS.** Browser: "Payment API" bar spans Nov 2 to Nov 13 inclusive. "QAL-9 One-day item" is a one-day bar. Long "Cart UI" title truncates with an ellipsis. The Done item ("QAL-8") is grey and muted with a leading check mark (screenshot). A plain click opens the work item dialog. The full-text `title` tooltip is in the code.
12. **PASS (Planned verified; Active and Completed by code).** Browser: "Sprint 3 · Planned" bar, Oct 26 to Nov 8. Note "Sprints without dates: Sprint 4 (no dates)". The Active and Completed classes (`sp-active`, `sp-completed`) are in CSS and code; the test data has no active or completed sprint. Sprint bars are not draggable (no handler, `role="img"`).
13. **PASS.** Browser: "Unscheduled" count 2, rows show dot, key and title; click opens the dialog. Empty project: "Nothing unscheduled." with `role="status"`.
14. **PASS.** Browser: default zoom Week (`aria-pressed`), buttons "Day", "Week", "Month". Day shows one column per day (weekday and date labels), Week shows Monday dates ("Oct 5", "Oct 12", …), Month shows "Sep 2026", "Oct 2026", … Zoom keeps Today in view (Month screenshot shows Today). `localStorage` key `pm.timelineZoom` is set to `day`, `month` or `week` and survives a reload. The chart scrolls horizontally (`scrollWidth` 2024 against a smaller viewport) and the 260px label column stays in place in the screenshots. Not verified by a manual scroll.
15. **PASS.** Unit tests (`visibleRange`: no dates is today −1 month to +3 months; one month around the dates; always three months forward; widened to Monday and whole months). Browser: the seeded range starts on a Monday before the earliest date (Oct 20, one month back, Sep 14) and runs past the latest date. Consistent with the Sep 25 drop position and the Month screenshot (Sep 2026 to Feb 2027).
16. **PASS.** Browser: red "Today" flag and 2px line in Day, Week and Month screenshots. The chart opens with Today centred (Week: Today at about x=688 of the visible width).
17. **PASS.** Browser: 39 weekend cells shaded in Day zoom, 0 in Week and Month.
18. **PASS.** Browser, empty project: "No work items yet." with hint; Unscheduled "Nothing unscheduled."; no JS errors. A project with undated items also renders without errors (QAL project before dates were added).
19. **PASS.** Only the current project's data is requested (`/api/projects/:id/issues` and `/sprints`). No new endpoint in the diff. Browser: only project 1 items appear.
20. **PASS.** Browser, real mouse input: dragging "Payment API" right by 84px in Week zoom (12px per day) moved both dates by exactly 7 days (2026-11-02..13 became 2026-11-09..20) and the PATCH persisted. Ghost outline removed on release. Snap at Day and Month zoom and the tooltip text during a live drag: unit-tested (`snapDays`, `moveTip`), not captured live.
21. **PASS.** Browser: right edge dragged 36px (3 days) changed `due_date` only (2026-11-23), `start_date` unchanged. Left edge, minimum one day, and edges not crossing: unit-tested (`resizeDates`), not driven live.
22. **PASS.** Success persists (browser and live). Only changed fields are sent (unit test "only the changed date fields go into the PATCH"). Failure, browser: project archived while the page was open, drag refused with 409. The bar returned to its original left edge (730.0 before and after), got the red `is-reverting` outline, the ghost was removed, the server dates were unchanged, and the message area showed "Could not save. QAL-6: This project is archived; its work items are read-only. The bar was returned to its original dates. Dismiss". The History refresh after a successful drag (`historySaved`) is code-reviewed only.
23. **PASS (code).** The epic's own bar uses the same `itemBar` and `save` path, with a PATCH to the epic only (`moveDates` touches only the item, so children do not move). Rollup bars have no pointer handler and no handles; verified in the browser (rollups show no handles, and rollup is read-only for Viewers). Epic drag itself was not driven live.
24. **PASS (CDP-intercepted drag).** Browser: "Unscheduled plain item" dropped on the chart at Sep 25 became `start_date` 2026-09-25, `due_date` 2026-10-01 (7 days inclusive), and `epic_id` stayed null. The drag was an intercepted HTML5 drag driven through CDP, not an OS-level drag. Week zoom only.
25. **PASS.** Browser, Viewer ("Casey Rivera"): banner "You can view the timeline but not change it.", no resize handles, cursor `default`, every Unscheduled row `draggable=false`, no grips, hint "Read-only. Click a row to open it.". A click on a bar still opens the dialog, read-only. Browser, archived project: banner "This project is archived. You can read the timeline but not change it.", archived badge shown, no handles, not draggable.
26. **PASS.** Browser: a focused bar opens the dialog with Enter. Bars and Unscheduled rows are native `<button>` elements. Dates are editable in the dialog for an editor. Drag is not keyboard-operable, which the spec allows.
27. **PASS (plain click verified; post-drag suppression by code).** Browser: a plain click opens the dialog. The 3px threshold (`isClick`) is unit-tested. The rule "a click after a drag does not open" is in the `dragged` flag in `timeline.js`; it was not isolated in a browser test.
28. **PASS.** `npm test` 541 of 541. New tests cover AC 1 to 5 (server, `tests/timeline.test.js`) and the pure date, pixel, snap and range functions (`tests/timelineMath.test.js`). The two edits to existing tests are reviewed above. Caveat: Board, Backlog and Sprints were not regression-tested in the browser by QA; the shared dialog code changed, and the timeline page exercised it.

## Defects

No blocking defects. Minor items, none blocking:

1. **Minor, cosmetic (Week zoom).** The red "Today" flag covers the top-tier "Nov 2026" axis label when Today falls in the first week of a month. Seen in `timeline-week.png`. The label is hidden under the flag at Nov 5. Suggest offsetting the flag or the month label.
2. **Minor, cosmetic (Day zoom).** Second-tier labels for two-digit days are clipped in the 36px column: "Mo 26" renders as "Mo 2(", "We 28" as "We 2(" (`timeline-day.png`). Suggest a smaller font or a tighter format.
3. **Minor, UI design.** `render()` in `timeline.js` returns early when the project has no work items, so dated sprints are not drawn in that case. The design README says sprints and the axis "may still render". Spec AC 18 only requires the empty message, which is shown. Optional fix.

Interpretation for the owner to confirm (not a defect): an undated epic that has scheduled children appears only as its rollup bar, not in the Unscheduled list. This follows the design README. Spec AC 13's literal wording ("every work item ... that has neither a start nor a due date") could be read to include it. The owner should confirm.

## Not verified (known gaps)

- OS-level mouse drag from the Unscheduled list. The drag was an intercepted HTML5 drag through CDP, which drives the same drop handlers.
- Touch and pointer input on touch devices (the spec puts touch out of scope).
- Firefox and Safari. Only Edge (Chromium 156) was used.
- Layout below 900px (Unscheduled panel stacking).
- Live capture of the drag tooltip text; left-edge resize; Day and Month snapping; the minimum one-day clamp. Unit-tested only.
- Click-after-drag suppression in the browser.
- Epic own-date drag in the browser.
- Active and Completed sprint bar colours (no such sprint in the data).
- The dialog's "Discard changes?" prompt on the timeline page.
- "Project not found." and the project dropdown on the timeline page.
- The History tab refresh after a successful drag.
- Keyboard focus rings and screen-reader names.
- Board, Backlog and Sprints in the browser (only covered by the existing automated tests).
- Export: not changed by this work; spec open question 6 (whether dates join the export) was not checked.

## Summary

Code and tests match the spec. The server rules (AC 1 to 5) hold against a live server. The page behaves as specified in a real browser for editor, Viewer and archived states, for real-mouse move and resize, and for the failure paths. The defects are cosmetic. The items the developer marked as unverified (real-mouse drag from Unscheduled, Viewer state in the browser, the save-failure path) are now covered, with the caveats above. Recommend commit after the owner confirms the interpretation in the Defects section and accepts the two edits to existing tests.

VERDICT: GO
