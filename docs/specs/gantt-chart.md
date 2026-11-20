# Gantt chart (Timeline)
Status: Draft
Date: 2026-11-05

**Builds on the implemented code, `docs/specs/global-project-scope.md` (project dropdown, `?project=<id>`, `projectScope.js`), `docs/specs/sprints-screen.md` (a project page with sub-nav), `docs/specs/epic-view.md` and `docs/specs/ticket-history.md`.** Owner scope: "Standard". Acceptance criteria are numbered from 1. Terminology: "work item" (table `issues`).

## Problem

There is no way to see work over time. Sprints already have `start_date` and `end_date`, but work items have no dates at all, and epics cannot be seen as a schedule. The owner wants a Jira-style Timeline: epics, sprints and work items as bars on a time axis, with zoom, a today marker, and drag to reschedule.

## User stories

1. As a user, I open "Timeline" in the project navigation and see the project's epics, sprints and work items as bars on a date axis.
2. As a user, I switch the zoom between Day, Week and Month, and see a marker for today.
3. As a user, I give a work item a start date and a due date in its dialog.
4. As a user, I drag a bar to move it, or drag its left or right edge to resize it, and the new dates are saved.
5. As a user, work items without dates appear in an "Unscheduled" list, and I can give one dates by dragging it onto the chart or via its dialog.
6. As a Viewer, or on an archived project, I can read the timeline but not change it.

## Acceptance criteria

### Dates on work items

1. `issues` gains two optional columns, `start_date` and `due_date` (TEXT `YYYY-MM-DD`, null = not set). Existing items get null; no backfill.
2. `POST /api/issues` and `PATCH /api/issues/:id` accept `start_date` and `due_date` as a valid calendar date `YYYY-MM-DD` or `null`/`''` (stored as null). Anything else (bad format, `2026-02-30`) returns 400 with an `error` message. Reuse the existing `checkDate` helper in `server/validation.js`.
3. If both are set, `due_date` earlier than `start_date` returns 400 (checked against the stored value when only one is sent). Equal dates are allowed (a one-day bar). Only one date set is allowed.
4. Both fields are returned by every API that returns a work item (list, get, create, update).
5. Changing either date records history exactly like other fields: one entry per changed field with labels "Start date" and "Due date", old and new as text, null when cleared; a save with an unchanged value records nothing (`ticket-history.md` Decisions 1, 2). Archived projects return 409 as today.
6. The work item dialog (create and edit) shows two date inputs, "Start date" and "Due date", beside the other metadata fields. They are editable by users who can edit work items, read-only for Viewers and archived projects. A validation error from the server is shown in the dialog's existing error area. The dialog's dirty flag (`global-project-scope.md` AC 14a) includes the two fields.

### The Timeline page

7. A new page `public/timeline.html` with script `public/js/timeline.js` is reachable from a "Timeline" link in the `.subnav` of Board, Backlog, Sprints and Test Cases (and itself, with `aria-current="page"`). It carries `?project=<id>` and uses the shared project dropdown and project resolution of `global-project-scope.md` (AC 1-13), including "Project not found." and the archived read-only behaviour. Switching project drops other query parameters.
8. The chart is hand-rolled HTML/CSS/SVG. No new npm or CDN dependency is added.
9. Rows are grouped by epic. Each epic is a group header row with its own bar; its child work items (by `epic_id`) are rows beneath it, each with a bar. A final group "No epic" holds scheduled work items that have no epic. Groups can be collapsed and expanded; the initial state is expanded.
10. **Epic bar.** An epic with its own start and due date shows a bar for those dates. An epic with no dates of its own shows a lighter, non-draggable "rollup" bar spanning the earliest start to the latest due date of its scheduled children; with no scheduled children it shows no bar.
11. **Work item bar.** A work item with a start and a due date shows a bar from start to due, inclusive. A work item with only one date shows a one-day bar on that date. The bar label shows the key and title (truncated, full text in a tooltip), and the bar colour reflects status category (Done items visibly muted). Clicking a bar (without dragging) opens the work item dialog.
12. **Sprint bars.** A separate "Sprints" group at the top shows one bar per sprint of the project that has both `start_date` and `end_date`, labelled with the sprint name and coloured by state (Planned, Active, Completed). A sprint without both dates is listed in a note "Sprints without dates: <names>" and has no bar. Sprint bars are read-only in this version (edited on the Backlog page).
13. **Unscheduled list.** A panel "Unscheduled" lists every work item (not epics-as-groups; epics with no dates and no scheduled children appear here too) that has neither a start nor a due date, each row showing type icon, key and title; clicking opens the dialog. The panel shows a count and "Nothing unscheduled." when empty.
14. **Axis and zoom.** A header shows the time axis with a segmented control "Day | Week | Month" (default Week). Day shows one column per day labelled by date; Week one column per week labelled by the Monday date; Month one column per month labelled "Nov 2026". Changing zoom redraws the chart keeping today (or the current scroll centre) in view. The zoom choice is remembered per browser in `localStorage` (key `pm.timelineZoom`, access wrapped like the existing storage helper). The chart scrolls horizontally inside its container; the row labels column stays fixed while scrolling.
15. **Visible range.** The axis spans from one month before the earliest date on the page to one month after the latest (any bar), and always includes today plus at least three months forward. With no dates anywhere it shows today minus 1 month to today plus 3 months.
16. **Today marker.** A vertical line labelled "Today" at the current local date is drawn across all rows in every zoom, and the chart opens scrolled so today is visible.
17. Weekends are lightly shaded in Day zoom. (No working-day calendar logic: durations are plain calendar days.)
18. Empty states: a project with no work items shows "No work items yet." with the Unscheduled panel empty; the page never errors on missing dates.
19. The page shows only items of the current project. It loads from the existing `GET /api/projects/:id/issues` and sprints endpoints; no new endpoint is required unless the developer finds those lack the new fields (then add them there).

### Drag to move and resize

20. **Move.** Dragging a work item bar horizontally shifts both dates by the same whole number of days; the bar snaps to day boundaries at every zoom. A bar with only one date shifts that date. While dragging, a tooltip shows the new start and due dates.
21. **Resize.** Dragging the left edge changes `start_date`, the right edge changes `due_date`; the dates snap to days, and the edges cannot cross (minimum length one day).
22. **Persist.** On release the page sends `PATCH /api/issues/:id` with only the changed date field(s). On success the bar stays in place; the change appears in the item's History tab as in AC 5. On failure (400, 403, 409, network) the bar returns to its original position and the error is shown in the page's message area; there is no silent failure.
23. Dragging an **epic's own-date bar** works exactly as in AC 20-22 (the epic is a work item); moving an epic does not move its children. A rollup bar (AC 10) is not draggable.
24. **Drag from Unscheduled.** Dragging a row from the Unscheduled list onto the chart sets `start_date` to the day dropped on and `due_date` to that day plus 6 days, in every zoom (Open question 3). The item then moves from the list to its epic's group (or "No epic"). Dropping never changes the item's epic; membership is changed only in the dialog.
25. The bar position, move, resize and drop only make sense for users who can edit: for Viewers and on archived projects bars have no resize handles, a default cursor, no drag, and the Unscheduled rows are not draggable.
26. Keyboard fallback: every bar and Unscheduled row is focusable and Enter opens the dialog, where the dates can be edited (AC 6). Drag itself need not be keyboard accessible in this POC.
27. A click on a bar after a drag does not open the dialog; a drag that moves less than 3 pixels counts as a click.

### Other

28. Existing Board, Backlog and Sprints behaviour, the Export, and all existing tests are unchanged. New tests cover AC 1-5 (server) and the pure date-to-pixel, snap and range functions (AC 14, 15, 20, 21) in a unit-testable client module (for example `public/js/timelineMath.js`, pattern as `sprintView.js` / `tests/sprintView.test.js`).

## Data model changes

- `issues.start_date TEXT` and `issues.due_date TEXT`, both nullable, added by a new idempotent `migrateDates(db)` in `server/db.js` (check `PRAGMA table_info(issues)`, then `ALTER TABLE issues ADD COLUMN`, as `migrateEstimate` does), called from `openDb`. Also add the columns to the `CREATE TABLE IF NOT EXISTS issues` statement so fresh databases match.
- `UPDATABLE` in `server/data/issues.js` gains `start_date` and `due_date`.
- `server/historyFields.js` gains two entries (`start_date` "Start date", `due_date` "Due date", kind `text`); `tests/history.test.js` fails otherwise.

## Out of scope

- Dependency arrows from work-item links, critical path, auto-scheduling, and shifting dependants or children when a parent moves.
- Editing sprint dates by dragging a sprint bar.
- Baselines, milestones/releases, progress fill inside bars, working-day calendars, holidays.
- Filters, grouping options other than by epic, swimlane choices, search on the timeline.
- Keyboard-operable drag, touch/mobile drag, print or image export of the chart.
- Inline date editing in the Backlog table, bulk date changes, import.
- Dates on the Export (unless the export spec already lists all issue columns, in which case follow it; open question 6).

## Open questions (defaults chosen; owner may overrule)

1. **Field names**: `start_date` and `due_date` (sprints already use `start_date`/`end_date`). Default: as written.
2. **Epic without own dates**: shows a read-only rollup bar of its children (AC 10) instead of requiring dates on every epic. Default: rollup.
3. **Default length when dropping an Unscheduled item**: 7 days (start + 6). Default: as written.
4. **One date only**: allowed, shown as a one-day bar. Default: allowed (Jira allows either).
5. **Done items**: still shown, muted; no hide toggle. Default: shown.
6. **Export**: whether the new date columns join the draft export. Default: include only if the export already emits all issue columns.
7. **Who may drag**: anyone who can edit work items in the project (same permission as PATCH today); no extra permission. Default: same as dialog edit.
8. **Sprint vs item dates**: no rule ties a work item's dates to its sprint's dates, and no warning is shown when they disagree. Default: no coupling.

## Implementation notes for the developer

Suggested order:

1. `server/db.js`: `migrateDates` and the CREATE TABLE columns; `server/data/issues.js`: `UPDATABLE`, create path, and the SELECTs/serialization; `server/historyFields.js`: two entries.
2. `server/validation.js` `checkIssueFields`: date parsing with `checkDate`, the start-before-due rule (merge with `existing`).
3. Server tests: migration idempotence (pattern of `tests/sprints-migration.test.js`), validation, history, archived 409.
4. Dialog: `public/board.html`, `public/backlog.html`, `public/sprints.html` (same dialog markup in each) and `public/js/board.js` (load, save, dirty flag, read-only for Viewer/archived).
5. `public/js/timelineMath.js` (pure: date to x, x to date, snap, range, week/month starts) plus its unit test.
6. `public/timeline.html`, `public/js/timeline.js`, CSS in `public/css/app.css`; add the "Timeline" link to the `.subnav` of every project page and wire it in `projectScope.js` (line ~196-205 handles sub-nav links).
7. Designer is recommended for this new screen before step 6 per `CLAUDE.md` (UI-facing); if the deadline forbids, build to `docs/design/STYLE.md`.
8. README: add Timeline to the feature list if one exists.
