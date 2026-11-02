# Sprints screen
Status: Approved
Date: 2026-10-26

Owner answers recorded 2026-10-26 (see Decisions). Approved by the owner 2026-10-26.

**Builds on the implemented code, `docs/specs/sprints-and-backlog.md` (read-only reference) and `docs/specs/global-project-scope.md` (part 1 of this change; build it first).** References are written "Sprints AC n" and "Scope AC n". Acceptance criteria are numbered from 1. Terminology: "work item" (the API still says `issues`).

## Problem

The Board shows only the active sprint, and the Backlog page shows sprints as stacked drag-and-drop panels. There is no place to pick any one sprint (including a completed one) and read its work items as a sortable list. The owner wants a third project page, "Sprints", beside Board and Backlog: a sprint dropdown, then a table of that sprint's work items, sortable, defaulting to the project's current sprint.

## User stories

1. As a user, I click "Sprints" in the project navigation and see the current (active) sprint's work items in a table.
2. As a user, I pick any sprint of the project from a dropdown, with its state shown, and the table shows that sprint's work items.
3. As a user, I sort the table by clicking a column heading, and click again to reverse.
4. As a user, I click a row and the work item opens, as on the Board and Backlog.
5. As a user, I can share or bookmark the URL and get the same sprint.
6. As a Viewer or on an archived project, I can read everything; I change nothing here.

## Decisions (owner, 2026-10-26)

1. **No-active-sprint fallback (AC 4): default, not an owner choice.** The owner has no preference; the drafted order stands (first Planned, then latest Completed, then empty state). It lives in one pure function, `defaultSprint`, so it is easy to change later.
2. **Sort is not remembered** (AC 22): it resets to sprint order on every sprint change and reload.
3. **Columns (AC 9): default, not an owner choice.** The seven drafted columns stand (Key, Title, Type, Epic, Priority, Status, Assignee); easy to change later.
4. **No "Backlog" entry in the sprint dropdown** (AC 3, Out of scope). The Backlog page remains the place for unscheduled work.
5. **Dropdown order is the server's order** (active, planned by id, completed newest first), AC 3.
6. **Files:** `public/sprints.html` and page script `public/js/sprintView.js` (the shared helper `public/js/sprints.js` is untouched).
7. **The work item dialog's close guard** ("Discard changes?", `global-project-scope.md` AC 14c-14f) applies on this page too, because it opens the shared dialog.

## Acceptance criteria

### Navigation and page

1. A new page `public/sprints.html` exists. The project sub-navigation (`.subnav`) on Board, Backlog and Sprints shows three links in this order: Board, Backlog, Sprints. The current page has `aria-current="page"`. All three carry the current `?project=<id>` (Scope AC 13). The link is visible to every user who can open the project.
2. The page has the shared topbar with the project dropdown (Scope AC 1), then the sub-navigation, a toolbar with `<h1>` "Sprints" and the project's archived badge when archived (as on the Backlog page), then the sprint dropdown, the sprint summary line, and the table. A signed-out visitor is sent to sign-in by the existing `api.js` behaviour.

### Sprint dropdown

3. The dropdown has no "Backlog" entry (Decision 4). A native `<select>` labelled "Sprint" lists **every sprint of the project, including Completed**, from `GET /api/projects/:id/sprints` (already ordered: active first, then planned by id, then completed newest first; Sprints AC 7). Each option reads `<name> (<state>)`, for example `Sprint 4 (Active)`, with the state word taken from the sprint's `state` as the server returns it (no state name hard-coded; use `GET /api/sprint-states` for any logic such as "is active"). Names are inserted as text.
4. **Default selection (no `?sprint=`):** the project's Active sprint. **When there is no Active sprint:** select the first Planned sprint (lowest id, i.e. the next one to start); if there are no Planned sprints, select the most recently completed sprint (first Completed in the server order). If the project has no sprints at all, show the empty state "This project has no sprints yet." with a link to the Backlog page, hide the table, and disable the dropdown. A short note under the dropdown says why the sprint was chosen when it was a fallback, for example "No sprint is active; showing the next planned sprint." (see Open question 1).
5. **URL:** the selected sprint is reflected as `?project=<id>&sprint=<sprint id>`. Choosing another option updates the URL with `history.replaceState`/`pushState` (implementer's choice; pushState so Back returns to the previous sprint is preferred) and reloads the table without a full page reload. Opening the page with a valid `?sprint=` selects that sprint. Opening without it applies AC 4 and then writes `?sprint=` into the URL with `replaceState`.
6. If `?sprint=` is not a positive integer, names a sprint that does not exist, or belongs to another project, the page falls back to AC 4 and shows a short message "Sprint not found; showing <name> instead." (role="status"). It never shows another project's items.
7. Switching project with the project dropdown drops `?sprint=` and applies AC 4 for the new project (Scope AC 12).
8. A summary line under the dropdown shows the selected sprint's goal when set, its dates when set (`sprintUtil.datesText`), "N items, M done" (non-epic items; done = terminal status), and for an overdue Active sprint the same "Overdue" badge and text as the Backlog page (uses `sprintUtil.isOverdue`, Sprints Decision 19). Goal and name as text, long text wraps.

### The table

9. The table lists the work items of the selected sprint, fetched with `GET /api/projects/:id/issues?sprint=<sprint id>` (Sprints AC 17). Columns, in order: Key, Title, Type, Epic, Priority, Status, Assignee. No Resolution, dates, or Sprint column.
10. **Epics do not appear.** Epics cannot be in a sprint (Sprints Decision 16) and the filter never returns them. The Epic column shows the item's parent epic as a chip with the epic's key (and title as its tooltip/accessible name), or an empty cell "-" when none; the epic's key and title come from the project's full item list (`GET /api/projects/:id/issues`), loaded once per page load. Clicking the Epic chip opens the epic's work item dialog (like the existing epic chip).
11. Assignee shows the user's name or "Unassigned". Status shows the status name as text (plus the existing check mark for the terminal status). Type shows the type chip. Priority shows the priority name. Nothing is colour-only.
12. Titles and every user-supplied text are inserted as text, never HTML; long titles truncate or wrap without breaking the layout.
13. Empty sprint: the table is replaced by "No work items in this sprint." (heading row hidden). While loading, "Loading..." is shown; on a load error an inline `role="alert"` message with a Retry button.
14. Clicking a row (the Key or Title button) opens the work item dialog in place, no reload, exactly as on the Board and Backlog (the dialog markup and `js/board.js` dialog code are shared; this page adds the same dialog markup as `backlog.html`). Saving or deleting in the dialog refreshes the table behind it, keeping the current sort and sprint. If the item's sprint changed in the dialog so it is no longer in the selected sprint, it drops out of the table on refresh. In a Completed sprint, the dialog shows the Sprint field read-only as today (Sprints AC 37).
15. Rows have no drag handles, checkboxes, quick create, or sprint controls (no Start, Complete, Edit, Delete). Reordering and sprint management stay on the Backlog page. A link "Manage sprints on the Backlog" points to `backlog.html?project=<id>`.

### Sorting

16. **Sortable columns:** Key, Title, Type, Epic, Priority, Status, Assignee (all of them). Each heading is a `<button>` inside a `<th scope="col">`.
17. **Default sort:** the sprint's own order, `sprint_rank` ascending (the order on the Backlog page and in the issues API response). It is shown as "Sprint order" in a small note, and no heading is marked sorted (no `aria-sort` other than `none`).
18. **Toggle:** clicking an unsorted column sorts it ascending; clicking the sorted column toggles descending and back to ascending. Only one column is sorted at a time. There is no way to return to sprint order other than a visible "Reset sort" button (shown only while a column sort is active) or reloading.
19. **Sort rules per column:**
    - Key: by the numeric part of the key, so `PM-2` precedes `PM-10` (not text order).
    - Title: case-insensitive text order (`localeCompare` with `sensitivity: 'base'`).
    - Type: by the server's type list order (`GET /api/types`), not alphabetical.
    - Epic: by the epic's key (numeric part); items with no epic sort last in both directions.
    - Priority: by the server's priority list order (`GET /api/priorities`) from highest to lowest priority when ascending; no names hard-coded.
    - Status: by the server's status pipeline order (`GET /api/statuses`), first to terminal when ascending.
    - Assignee: case-insensitive by name; "Unassigned" sorts last in both directions.
20. **Ties** break by `sprint_rank` ascending (always ascending, even when the primary sort is descending), so the result is stable and deterministic. Items with equal `sprint_rank` break by key number.
21. **Accessibility:** the sorted heading's `<th>` carries `aria-sort="ascending"` or `"descending"`; other sortable headings have `aria-sort="none"` or omit it. The sort button's text includes an arrow indicator that is not the only cue (the `aria-sort` and a visually hidden "sorted ascending"/"sorted descending" text). Buttons are reachable by Tab and operable with Enter and Space. After a sort the focus stays on the clicked button, and a `role="status"` region announces "Sorted by <column>, ascending."
22. The sort is **not** saved in the URL or storage; it resets to sprint order when the sprint changes or the page reloads (Decision 2).
23. Sorting is client-side on the rows already loaded; it makes no request.

### Permissions and archived projects

24. Everything on this page is a read. Viewers see the same page; no control is hidden because there is none that writes. The work item dialog follows its existing permission rules (Viewer sees it read-only).
25. On an archived project the page works, shows the archived badge, and the work item dialog opens read-only, as on the Backlog page.

### Source rules

26. No sprint state name, status name, type name or priority name is hard-coded in the new JS (a source test like `tests/source.test.js` covers `public/js/sprintView.js`). Sorting order comes from the server lists of AC 19.
27. The sort and default-selection logic are pure functions in a file loadable from the browser and from `node:test`, tested without a browser: `sortRows(rows, column, direction, orders)`, `defaultSprint(sprints, states)`, `resolveSprintParam(raw, sprints)`.

## Data model changes

None. No server change: `GET /api/projects/:id/sprints`, `GET /api/projects/:id/issues?sprint=<id>`, `GET /api/sprint-states`, `/api/types`, `/api/priorities`, `/api/statuses` and `/api/users` already exist. (If the developer finds the type or priority list order is not exposed by these endpoints, add it there rather than hard-coding.)

## Out of scope

- Drag-and-drop, reordering, quick create, bulk move, sprint start/complete/edit/delete on this page (Backlog page keeps them).
- Filtering or searching the table, group by, column chooser, saved sort, export.
- Multi-column sort.
- Sprint comparison, reports, burndown, velocity, story points.
- Showing epics as rows, or a "backlog" entry in the dropdown (the backlog is not a sprint; use the Backlog page).
- Pagination (the largest sprint is small; render all rows).
- Inline editing in the table.

## Open questions

None. All questions are answered (Decisions 1-7). Decisions 1 and 3 are defaults the owner had no preference on.

## Implementation notes for the developer

Pipeline: owner reviews both specs, then the `designer` (table styling, sort indicators, dropdown and summary line, empty/error states; STYLE.md section 3 has the table-header look to reuse), then `developer`, then `qa`. Build `docs/specs/global-project-scope.md` first. Re-read `public/js/board.js`, `public/backlog.html`, `public/js/backlog.js` first (uncommitted bulk-move work touches them).

Suggested order:

1. **Pure logic** in a new `public/js/sprintView.js` (UMD-style like `public/js/sprints.js`; do not extend `sprints.js`, it is shared by the Board and Backlog): `defaultSprint`, `resolveSprintParam`, `sortRows` with the column rules of AC 19-20, key-number helper. Write `tests/sprintView.test.js` first (ties, descending ties still ascending by rank, Unassigned and no-epic last both ways, key `PM-2` before `PM-10`, order from supplied lists).
2. **`public/sprints.html`**: copy the topbar, sub-navigation, work item dialog markup and script list from `backlog.html` (minus the sprint dialogs and bulk-confirm dialog), set `data-page="sprints"`. Add the Sprints link to `board.html` and `backlog.html` sub-navigation, and make the sub-navigation links carry `?project=` (Scope AC 13; `renderHeader` in `board.js` sets `navBoard`/`navBacklog` hrefs, add `navSprints`).
3. **`public/js/board.js`**: it is the shared bootstrap and dialog. `onBoard = data-page !== 'backlog'` (line 30) must become a three-way check so `sprints` does not run the board (`fillFilterControls`, board render). Add a `sprintsPage.init(ctx)` hook beside `backlogPage.init(backlogContext())` (line ~2399) exposing what the page needs: state, `openDetail`, reload callback. After a dialog save the page's reload callback re-fetches sprints and items.
4. **Page script** (same `public/js/sprintView.js` DOM part, or a second file `sprintsPage.js`): sprint dropdown, URL sync, fetches, table render with text nodes, sort buttons, `aria-sort`, status region.
5. **`public/css/app.css`**: table, sort button, summary line (reuse tokens and `.badge`, `.banner-warn`, `.subnav`; no new colours). Add a short block to `docs/design/STYLE.md` section if the designer adds components.
6. **Tests**: `tests/sprintView.test.js` (step 1); source rule additions in `tests/source.test.js` (AC 26); no server tests needed unless an endpoint is added for list order (then follow `tests/helpers.js`).
7. **`README.md`**: one paragraph on the Sprints screen.
8. QA (scratch DB copy, spare port, not 3000 or 3001): active default; project with no active sprint (planned fallback, completed fallback); project with no sprints; `?sprint=` valid, bogus, other project's; switching project; sort each column both directions with ties; keyboard sort and `aria-sort`; row click opens dialog, edit title, table refreshes with sort kept; move an item's sprint in the dialog and see it drop out; epic never listed; Viewer and archived project.
