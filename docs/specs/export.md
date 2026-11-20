# Export
Status: Draft
Date: 2026-10-29

Builds on the implemented code and on `docs/specs/sprints-and-backlog.md`, `sprints-screen.md`, `time-tracking.md`, `global-project-scope.md`, `search-and-filters.md` and `permission-groups.md` (read-only references). Terminology: "work item" (the API and code still say `issues`). Acceptance criteria are numbered from 1.

Owner decisions recorded 2026-10-29: export is built in the browser (no endpoint), extra columns kept, Board export includes epics, hours as decimals.

## Problem

Work items can only be read inside the app. The owner wants to take them out to a spreadsheet: the items on the Board, the sprints and backlog on the Backlog page, and each sprint on the Sprints page.

## User stories

1. As a user on the Board, I click Export and get a CSV of the items I am looking at (project scope and active search/filters respected).
2. As a user on the Backlog page, I export any one sprint panel, or the Backlog section, as its own CSV.
3. As a user on the Sprints page, I export the selected sprint.
4. As a Viewer, or on an archived project, I can export what I can view.
5. As a user opening the file in Excel, titles with commas, quotes, accents or line breaks look right, and nothing in a cell runs as a formula.

## Acceptance criteria

### Where the buttons are

1. **Board:** an "Export" button in the toolbar, next to the search/filter controls and the "Showing n of m" count. Exports the items currently shown (after search and filters), AC 6.
2. **Backlog:** each sprint panel header and the Backlog section header has its own "Export" button, beside the existing header controls. A button exports only that container's items. Backlog has no filters today, so it exports the whole container.
3. **Sprints:** one "Export" button beside the sprint dropdown, exporting the selected sprint (all its items, in sprint order; the current table sort is not applied).
4. Every button is a native `<button>` with an accessible name that names its target ("Export Sprint 4", "Export Backlog", "Export board"). Buttons are visible and enabled for every signed-in user, including Viewers and archived projects. Nothing here changes any data.

### Where the data comes from (no server change)

5. Export is built entirely in the browser from the items the page has already loaded (`GET /api/projects/:id/issues` and the meta lists). There is **no new endpoint, no POST and no new permission**. What a user can view is what they can export: Viewers and archived projects can export, and a signed-out visitor is sent to sign-in by the existing `api.js` behaviour. Clicking Export makes no network request and writes nothing to the server.
6. Scope contents: Sprints page and Backlog sprint panel = the non-epic items of that sprint, in `sprint_rank` order; Backlog section = the non-epic items with no sprint, in `sprint_rank` order; Board = **exactly the items the Board shows after search and filters, including epics**, in the Board's own order (column, then rank). With no filters active the Board exports all items. The data row count equals the "Showing n" number. The export uses the same filtered list the Board renders, not a second copy of the filter logic.
7. **File name:** `<project key>-<scope label>-<YYYY-MM-DD>.csv` (local date), for example `PM-board-2026-10-29.csv`, `PM-backlog-2026-10-29.csv`, `PM-sprint-4-2026-10-29.csv`. The scope label is reduced to lower-case letters, digits and hyphens (spaces become hyphens) so it is safe as a file name. The project key is likewise reduced to letters and digits.
8. **Data check against the existing payload (no API change needed).** Already in each item the pages load: key, title, type, status, resolution, priority, reporter_name, epic_id, sprint_id, created_at, updated_at, estimate_hours, time_spent_hours and, for non-epics, remaining_hours. Not in the item, looked up on the client from lists the pages already hold: Assignee name (from the loaded users, by assignee_id), Epic key (from the full item list, by epic_id) and Sprint name (from the loaded sprints, by sprint_id). **No existing API needs an addition.** The developer must confirm each page holds those three lists: the Board has `state.users`, `state.items`, `state.sprints`; the Sprints page loads the full item list for epic chips (Scope AC 10) and the sprint list; check the Backlog does the same, and if a page lacks one, call the meta endpoint it already uses elsewhere instead of adding a server route.

### Content

9. **Columns, in order, one header row:** Key, Title, Type, Status, Resolution, Completed, Priority, Assignee, Reporter, Epic, Sprint, Estimate (hours), Logged (hours), Remaining (hours), Created, Updated. Headers are fixed plain English.
10. Values: Assignee and Reporter as the user's name (empty when none); Epic as the parent epic's key (empty when none); Sprint as the sprint name (empty for the backlog and for epics); hours as plain decimals with a dot and no unit (`1.5`); Estimate and Remaining empty when there is no estimate; Logged `0` when nothing is logged; an epic row has all three hours cells empty; Created, Updated and Completed as ISO 8601 UTC timestamps as the API returns them (Completed is the item's `completed_at`, empty when null; added by `docs/specs/completed-date-on-cards.md` AC 21). Type, status, resolution and priority are the names as loaded; none is hard-coded in the exporter.
11. **Not exported:** description, comments, attachments, links, history, time entries.
12. **Encoding:** UTF-8 with a leading BOM (`EF BB BF`), `\r\n` line endings, and a trailing line break after the last row.
13. **Quoting (RFC 4180):** a cell containing a comma, a double quote, `\r` or `\n` is wrapped in double quotes with inner quotes doubled. A title `He said "hi", then` + newline + `left` round-trips through a CSV parser to the same string, in a single row.
14. **Formula injection:** a text cell whose first character is `=`, `+`, `-`, `@`, tab or carriage return is written with a leading single quote (`'=SUM(A1)`) so a spreadsheet shows it as text. Applies to every text column, not only Title. Numeric hours cells are never prefixed.
15. An empty list (empty container, or a Board filtered to nothing) still downloads a file with the BOM and the header row only; the page shows a notice "Nothing to export; the file has headers only." (`role="status"`). It is not an error.
16. A large list (the unit test uses 5,000 items) is exported without error and without a row cap.

### Client behavior

17. Clicking Export builds the CSV and saves it through the browser (Blob and a temporary link, URL revoked afterwards) with the name from AC 7. No page reload; page state (filters, sort, selection) is unchanged. On success focus stays on the button.
18. If building or saving fails, an inline `role="alert"` message says so and the button stays usable. Messages never insert user text as HTML.

## Data model changes

None. No new tables, columns, settings, endpoints or API fields.

## Out of scope

- Import, scheduled or emailed exports, saved export presets, choosing columns, other formats (XLSX, JSON, PDF).
- Exporting a whole project or all projects at once, comments, history, time entries, attachments.
- Exporting the Epic view or Test case manager.
- Backlog search/filters (the Backlog has none today).
- Any server endpoint, new permission or group right: export is client-side and needs only view access.

## Open questions

Decided by the owner (2026-10-29), not to be re-asked:

- Client-side CSV from already loaded items, respecting the page's filters and search; no endpoint (AC 5-8).
- Columns in AC 9 stay, including Resolution, Reporter, Epic, Remaining, Created and Updated, for now. Description stays excluded (rich text).
- Board export includes epics (AC 6).
- Hours as decimals, `1.5` (AC 10).
- Defaults accepted: CSV only, UTF-8 BOM, `\r\n`; the Sprints export ignores the table's current sort; the Backlog exports whole containers.

Still open:

1. **Formula guard:** the leading quote changes the cell text for non-Excel tools. Kept as the standard defence unless vetoed.
2. **Future:** if `sprint-scope-change.md` (approved, not yet built) lands, an "Added after start" column could be added to the sprint exports (Backlog sprint panel and Sprints page). Not part of this change.

## Implementation notes for the developer

Designer needed: yes, small. Recommendation: a quiet secondary button labelled "Export" (a download glyph is optional, never the only cue) in each toolbar/header named in AC 1-3. The designer should check the Backlog panel headers, which are already busy, and the narrow-width layout.

Suggested order:

1. New pure module `public/js/csv.js`, using the same browser / `module.exports` pattern as `public/js/time.js` and `public/js/historyFormat.js` so `node:test` can load it. It exports `toCsv(headers, rows)` (BOM, `\r\n`, AC 12-14), `exportRows(items, lookups)` (the AC 9-10 columns and the AC 8 lookups) and `fileName(projectKey, label, date)` (AC 7). Unit tests in `tests/csv.test.js`: commas, quotes and newlines in a title (round-trip through a small RFC 4180 parser inside the test), `=`, `+`, `-`, `@`, tab and CR prefixes, empty list (BOM and header only), non-ASCII, the 5,000-row case, an epic row with empty hours cells, null estimate, unassigned item, missing epic or sprint, file name sanitising.
2. A small `saveCsv(name, text)` DOM helper (Blob, link, revoke) in `public/js/csv.js` behind a `typeof document` guard, or in `public/js/api.js`. Not unit tested; QA covers it in the browser.
3. Wire it into `public/js/board.js` (the filtered list behind "Showing n of m", epics included), `public/js/backlog.js` (panel and Backlog section headers) and `public/js/sprintView.js`. Add the buttons to `public/board.html`, `public/backlog.html` and `public/sprints.html` once a design is chosen, and make each page load `js/csv.js`.
4. QA: open a CSV in Excel (accents, a multi-line title, a title starting with `=`), export as a Viewer and on an archived project, and confirm the browser's Network tab shows no request on click.
