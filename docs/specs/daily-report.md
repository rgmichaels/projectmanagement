# Daily Report
Status: Draft
Date: 2026-11-20

Builds on the implemented code and on `docs/specs/ticket-history.md`, `time-tracking.md`, `ticket-discussion.md`, `sprints-and-backlog.md`, `global-project-scope.md`, `permission-groups.md` and `export.md` (read-only references). Terminology: "work item" (the API and code still say `issues`). Acceptance criteria are numbered from 1.

Owner's request: "a report of this project so that I can send it to my manager each morning showing what I did yesterday, and what I plan to do today, and what is waiting to be done." Raised while looking at `board.html?project=3`.

## Problem

The owner reports status to a manager every morning and today rebuilds it by hand from the Board, item history and time entries. There is no single place that answers "what did I do yesterday, what am I doing today, what is still waiting", and no way to paste that into an email.

## User stories

1. As a user, I open a Report page for the current project and see Yesterday, Today and Waiting sections for me, without configuring anything.
2. As a user, I pick another person or another date and the report regenerates.
3. As a user, I click "Copy for email" and paste into Outlook as formatted text, ready to send.
4. As a Viewer, or on an archived project, I can open and copy the report. Nothing here changes data.

## Acceptance criteria

### Page and navigation

1. A new page `public/report.html` is reached by a "Report" link in the project sub-navigation (`<nav class="subnav">`) on every project-scoped page, after "Timeline" and before "Test Cases". The link carries `?project=<id>` like the others (`projectScope.js`). On the Report page the link has `aria-current="page"`. The page uses the same top bar, project dropdown, sign-in redirect, "Project not found." and "No active projects." states as the other project pages.
2. Controls at the top: a "Person" dropdown, a "Date" input (`type="date"`) and a "Copy for email" button. Person lists the active users, defaulting to the signed-in user. Date defaults to today in the browser's local time. Changing either control regenerates the report without a page reload. A "Today" button next to Date resets the date to today.
3. The report heading reads "Daily report: <project name>, <person name>, <weekday, date>" for the selected date, for example "Daily report: EFS Automation, Robert, Fri Nov 20 2026".
4. The report has three sections in this order, each with a heading: "Yesterday", "Today", "Waiting". An empty section shows a line of plain text instead of being omitted (AC 9, 14, 17).

### Yesterday (what was done)

5. **The window.** The window is the whole local calendar day of the "previous working day" before the selected date: the day before, except that Saturday, Sunday and Monday look back to the preceding Friday. Public holidays are not considered. The heading shows the day: "Yesterday (Thu Nov 19)", or "Yesterday (Fri Nov 13)" when the selected date is Monday Nov 16.
6. **What counts.** An item appears in Yesterday when, inside the window, the selected person did any of the following to it (by `actor_id` / `author_id` / `user_id`, not by assignee):
   - changed its status (history change on field `status`), including moving to Complete;
   - created it (history event kind `created`);
   - posted a comment on it;
   - logged time on it (a time entry whose `work_date` is the window day; see AC 7 for the date basis).
   Other edits (title, priority, reassigning) do not make an item appear on their own.
7. **Date basis.** History events, comments and creation are timestamped in UTC, so the browser converts the local window to a UTC range and sends it to the server (AC 22). Time entries use their own `work_date` (a plain local date), compared to the window day as text, not by `created_at`.
8. **Per-item line.** One line per item (never more, however many actions), ordered by item number ascending (`EFS-2` before `EFS-10`). Each line shows the key, the title, and a short summary of what happened, joined with semicolons, in this order when present:
   - status changes as `Ready -> Complete` (several changes in the window show first old value to last new value, for example `Planning -> Complete`; a change that ends back where it started is omitted);
   - the resolution when the final status is Complete: `Complete (Done)`;
   - `created`;
   - `commented` with a count when more than one (`commented x2`);
   - `logged 1h 30m` (that person's time on that item in the window).
   Example: `EFS-6 Set up build agent: Ready -> Complete (Done); logged 2h`. The key links to the work item, opening it the way the Board does (same dialog or `board.html?project=<id>` deep link, whichever the Board already supports; if neither exists, plain text).
9. If nothing qualifies, Yesterday shows "No recorded activity on <day>." (this is the case today for project 3, where all activity happened on the report date).
10. Below the lines, a "Time logged" line shows the person's total for the window across all items in this project, as `Total time logged: 3h 45m`, shown even when 0 (`0h`). It uses the same duration format as the existing time display (`public/js/time.js`).
11. Items of type epic are included when the rules in AC 6 apply to them, and are labelled with their type like the Board does.

### Today (planned)

12. Today lists the work items in this project assigned to the selected person whose status is in the active work range: every status from `In Progress` up to but not including the terminal status (`In Progress`, `Internal Testing`, `UAT`, `Go Live`). The range comes from the order of `STATUSES` in `server/statuses.js`: everything after `Ready` and before the terminal status. It is not a hard-coded list on the client, so adding a status keeps working.
13. Ordered by the Board's order: status column order first, then rank within the column. Each line: key, title, status, priority, and the remaining estimate when the item has one (`remaining 4h`). Epics are listed too.
14. If none, Today shows "Nothing in progress."
15. Today always reflects the current state of the items, whatever the selected date (it is "planned", not a historical snapshot). When the selected date is not today the section heading carries a note: "Today (current status as of now)".

### Waiting

16. Waiting lists work items in this project that have not started: status `Planning` or `Ready` (the statuses before `In Progress` in `STATUSES`), for the whole project, not only the selected person, each with its assignee name ("Unassigned" when none). Epics are excluded here (they are containers, not work to be done).
17. It is split into two sub-lists: "In the active sprint" (items whose sprint is the project's sprint in the `Active` state) and "Backlog and other sprints" (everything else: no sprint, or a sprint that is not active). Each sub-list is ordered by `sprint_rank` and shows key, title, status, priority and assignee. An empty sub-list shows "None." If there is no active sprint, "In the active sprint" shows "No active sprint."
18. A sprint progress line sits at the top of Waiting when an active sprint exists: `Sprint 4: 6 of 13 complete, ends Nov 27` — counting non-epic items in that sprint, complete meaning the terminal status. A sprint with no end date reads `... complete, no end date`. With zero items: `Sprint 4: no items, ends Nov 27`. Like Today, Waiting is the current state, and the section heading carries the same note as AC 15 when the date is not today.

### Copy for email

19. "Copy for email" writes to the clipboard two flavors in one operation: `text/html` (headings, bulleted lists, bold item keys, no external CSS, inline styles only, no images, so it pastes cleanly into Outlook) and `text/plain` (the fallback, with the same content as headings in plain lines and `- ` bullets, `->` arrows). It uses `navigator.clipboard.write` with a `ClipboardItem` carrying both flavors. If that is unavailable or rejected, it falls back to selecting the rendered report and `document.execCommand('copy')`.
20. The copied content is the report body as currently shown, exactly: heading line, three sections, totals. It contains no controls, no navigation and no page chrome. All user text (titles, names, project name) is escaped in the HTML flavor.
21. On success a `role="status"` message says "Copied. Paste into your email." and clears after a few seconds; on failure a `role="alert"` message says "Could not copy. Select the report and copy it by hand." and the report stays selectable. Focus stays on the button.

### Data and permissions

22. A new read-only endpoint `GET /api/projects/:id/report?user=<id>&from=<ISO UTC>&to=<ISO UTC>&day=<YYYY-MM-DD>` returns the activity for the Yesterday section only: for the given user inside `[from, to)`, per item `{ issue_id, key, title, type, status_changes: [{from, to}] (ordered), resolution, created: bool, comments: n, minutes: n }` plus `total_minutes`. `day` is the window's local date, used to match time entries' `work_date` (AC 7). Today and Waiting are built in the browser from `GET /api/projects/:id/issues` and `/api/sprints` data the pages already load, the same as the Board.
23. Validation: `user` must be a positive integer for an existing user; `from`/`to` valid ISO instants with `from < to` and a span of at most 48 hours (a DST-length day plus slack); `day` a valid `YYYY-MM-DD`. Anything else returns 400 with `{ error }` in the project's existing error shape. An unknown project is 404. No new permission: any signed-in user with access to the project (every group, including Viewer, archived projects included) can call it; the existing project-scope middleware applies. The endpoint performs no writes and records no history.
24. The query is efficient: it reads history events/changes, comments and time entries with date-bounded SQL joined to `issues` by `project_id`, not one request per item. Items from other projects never appear. Deleted items (history cascades away with them) never appear.
25. Status change detail comes from the `status` field entries in `issue_history_changes` (old/new value). Resolution for a completed item is the item's current resolution.
26. Page state: the person and date selections are not persisted and not in the URL, except that the page honors optional `?user=<id>&date=<YYYY-MM-DD>` query parameters on load (so a bookmark or link can open a specific report); invalid values are ignored and the defaults apply.

### Read-only

27. The page never creates, edits or deletes data. Viewers and archived projects see the same page, with no disabled controls or banners needed beyond the existing archived banner if the other project pages show one.
28. The page is keyboard-operable: native `<select>`, `<input type="date">` and `<button>`; each control has a label; sections use `<h2>` headings and the lists are real `<ul>`.

## Data model changes

None. No new tables or columns. One new read-only endpoint (AC 22) and, if helpful, an index on `comments(created_at)` and `issue_history_events(created_at)` only if the developer finds the query slow; not required for the POC.

## Out of scope

- Sending email, scheduling, or a "send each morning" job; saving or archiving past reports.
- Multi-project or whole-team rollups, a manager view, a report for several people at once.
- Public holidays, per-user work calendars, configurable working days.
- Editable notes or a free-text "plans" field; "Today" is derived from status, not typed in.
- Diff detail beyond status (priority, assignee or title changes), comment text in the report, and attachments.
- Charts, burndown, CSV/PDF export of the report (the existing Export spec is separate).
- Showing who else worked on an item.

## Open questions

Each has a recommended default that the spec already uses; nothing blocks the developer.

1. **Does "Today" include items in `Ready`?** Default: no. Ready is "not started" and is listed under Waiting; Today means actively in progress (In Progress through Go Live). The owner may want Ready items assigned to them in Today instead.
2. **Time zone.** Default: the browser's local time defines "yesterday". The server sees only the UTC range the browser sends. Matters if the owner travels or the server and the owner differ.
3. **"Yesterday" attributed by actor, not assignee.** Default: yes, so it shows what the selected person did, even on items assigned to someone else, and does not show items only reassigned. Alternative: assignee-based.
4. **Holidays.** Default: ignored; the date picker lets the owner choose the date manually after a holiday.
5. **Does "Waiting" for a person mean the whole project's not-started items?** Default: yes, whole project, with assignee shown (the owner's wording was "what is waiting to be done", not "my waiting items"). A "my items only" toggle is a likely follow-up.
6. **Epics in Yesterday/Today but not Waiting.** Default as written; confirm.
7. **Retired/cancelled statuses** are still an open question in `CLAUDE.md`; if one is added, Today and Waiting need to exclude it. The status ranges are derived from `STATUSES` order so only the terminal rule would change.

## Implementation notes for the developer

Suggested order:

1. `server/data/report.js` (new): one function `activityFor(db, projectId, userId, fromIso, toIso, day)` returning the shape in AC 22. SQL lives here, like the other `server/data/*` files; reuse `UNKNOWN_ACTOR` only if needed. Use `issue_history_events` joined to `issue_history_changes` (field `status`, and kind `created`), `comments` (author_id, created_at) and `time_entries` (user_id, `work_date`) all joined to `issues` on `project_id`. Time entries with a null `user_id` (deleted user) never match.
2. `server/routes/report.js` (new) and register it in `server/app.js` next to the other routers: validation per AC 23, using `loadProject` from `server/routes/guards.js`; no `assertCan`, since reads need no permission, like `GET /projects/:id/issues`. The path begins `/projects/:id/`, so project scope resolves automatically in `server/projectPermissions.js`.
3. `public/js/reportMath.js` (new, pure, loadable from `node:test` like `timelineMath.js`): previous working day (AC 5), local-day to UTC range, duration text, per-item summary text, status-range selection from the `/api/meta` status list, plain-text and HTML builders for the copy flavors (with escaping).
4. `public/report.html` and `public/js/report.js` (new): controls, fetches, rendering, copy. Follow `public/timeline.html` / `public/js/timeline.js` for project scoping, the shared top bar and the sub-nav. Check how `public/js/api.js` and `public/js/time.js` are used before adding helpers.
5. Add the "Report" link to the sub-nav in `public/board.html`, `backlog.html`, `sprints.html`, `timeline.html`, `test-cases.html`, and make `public/js/projectScope.js` set its href with `?project=` like the others (give it id `nav-report`).
6. Styles in `public/css/app.css`; the designer should cover this page since it adds a screen. Report text needs readable inline styles in the HTML flavor, independent of app.css.
7. Tests: `tests/report.test.js` (endpoint: yesterday with status change/comment/time/created, other users' activity excluded, other projects excluded, window edges, 400/404 cases, Viewer allowed) and `tests/reportMath.test.js` (Monday looks back to Friday, summary lines, plain-text and HTML builders, escaping). Check `tests/helpers.js` for fixtures and `tests/source.test.js` for any source-level conventions that apply to new files.
