# Daily Report
Status: Draft (amended, see Amendment 1)
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

5. **The window.** *(Amended, Amendment 1.)* The window is the whole local calendar day before the selected date, with two exceptions: when the selected date is a **Monday**, the window is the three local calendar days Friday 00:00 through Sunday 24:00 before it (Fri, Sat and Sun, as one window); when it is a **Saturday or Sunday**, the window is the preceding Friday only (unchanged, open question 8). Public holidays are not considered. The heading shows the day or the range: "Yesterday (Thu Nov 19)", "Yesterday (Fri Nov 13)" for Sat Nov 14 or Sun Nov 15, and "Yesterday (Fri Nov 13 – Sun Nov 15)" for Monday Nov 16 (en dash, each end as weekday, month, day, even across a month boundary: "Fri Oct 30 – Sun Nov 1").
6. **What counts.** An item appears in Yesterday when, inside the window, the selected person did any of the following to it (by `actor_id` / `author_id` / `user_id`, not by assignee):
   - changed its status (history change on field `status`), including moving to Complete;
   - created it (history event kind `created`);
   - posted a comment on it;
   - logged time on it (a time entry whose `work_date` falls on any day of the window; see AC 7 for the date basis).
   Other edits (title, priority, reassigning) do not make an item appear on their own.
7. **Date basis.** History events, comments and creation are timestamped in UTC, so the browser converts the local window to a UTC range and sends it to the server (AC 22). Time entries use their own `work_date` (a plain local date), compared as text with the window's first and last local day inclusive (`from_day` <= `work_date` <= `to_day`), not by `created_at`. *(Amended: was a single day.)* On a Monday, time logged for Fri, Sat or Sun all counts, and so do history events, comments and creations at any instant in `[Fri 00:00, Mon 00:00)` local.
8. **Per-item line.** One line per item (never more, however many actions), ordered by item number ascending (`EFS-2` before `EFS-10`). Each line shows the key, the title, and a short summary of what happened, joined with semicolons, in this order when present:
   - status changes as `Ready -> Complete` (several changes in the window, even across the three days of a Monday window, show first old value to last new value, for example `Planning -> Complete`; a change that ends back where it started is omitted from this position, but see the round-trip rule below);
   - the resolution when the final status is Complete: `Complete (Done)`;
   - `created`;
   - `commented` with a count when more than one (`commented x2`);
   - `logged 1h 30m` (that person's time on that item in the window).
   **Round trip and empty summary** *(Amended, defect D1)*: when the summary is otherwise empty because the status changes net to nothing (for example Ready to In Progress to Ready, with no creation, comment or time), the summary shows the path taken, joined with arrows: `Ready -> In Progress -> Ready`. If a net-zero change is accompanied by other parts (`commented`, `logged 1h`, `created`), it is still omitted, as before. The line never ends with a dangling colon: if for any reason the summary is empty, the line is the key and title only, with no `:` and no trailing space, in the on-screen, plain-text and HTML renderings.
   Example: `EFS-6 Set up build agent: Ready -> Complete (Done); logged 2h`. The key links to the work item, opening it the way the Board does (same dialog or `board.html?project=<id>` deep link, whichever the Board already supports; if neither exists, plain text).
9. If nothing qualifies, Yesterday shows "No recorded activity on <day>." for a single-day window, and "No recorded activity <first day> – <last day>." for a Monday window, for example "No recorded activity Fri Nov 13 – Sun Nov 15." *(Amended.)*
10. Below the lines, a "Time logged" line shows the person's total for the whole window (all three days on a Monday) across all items in this project, as `Total time logged: 3h 45m`, shown even when 0 (`0h`). It uses the same duration format as the existing time display (`public/js/time.js`).
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

19. "Copy for email" writes to the clipboard two flavors in one operation: `text/html` (headings, bulleted lists, bold item keys, no external CSS, inline styles only, no images, so it pastes cleanly into Outlook) and `text/plain` (the fallback, with the same content as headings in plain lines and `- ` bullets, `->` arrows). The Yesterday heading and empty text carry the same day or range wording as on screen, including the en dash *(Amended)*. It uses `navigator.clipboard.write` with a `ClipboardItem` carrying both flavors. If that is unavailable or rejected, it falls back to selecting the rendered report and `document.execCommand('copy')`.
20. The copied content is the report body as currently shown, exactly: heading line, three sections, totals. It contains no controls, no navigation and no page chrome. All user text (titles, names, project name) is escaped in the HTML flavor.
21. On success a `role="status"` message says "Copied. Paste into your email." and clears after a few seconds; on failure a `role="alert"` message says "Could not copy. Select the report and copy it by hand." and the report stays selectable. Focus stays on the button.

### Data and permissions

22. A new read-only endpoint `GET /api/projects/:id/report?user=<id>&from=<ISO UTC>&to=<ISO UTC>&from_day=<YYYY-MM-DD>&to_day=<YYYY-MM-DD>` returns the activity for the Yesterday section only: for the given user inside `[from, to)`, per item `{ issue_id, key, title, type, status_changes: [{from, to}] (ordered), resolution, created: bool, comments: n, minutes: n }` plus `total_minutes`. `from_day` and `to_day` are the first and last local dates of the window (inclusive), used to match time entries' `work_date` (AC 7). *(Amended: was a single `day`.)* For backward compatibility the old `day=<YYYY-MM-DD>` is still accepted and means `from_day = to_day = day`. The response shape is unchanged. Today and Waiting are built in the browser from `GET /api/projects/:id/issues` and `/api/sprints` data the pages already load, the same as the Board.
23. Validation: `user` must be a positive integer for an existing user; `from`/`to` valid ISO instants with `from < to` and a span of at most **76 hours** (three local days, 72 hours, plus one hour of DST change and slack; was 48 hours) *(Amended)*; the days given as either `day` alone, or `from_day` and `to_day` together, each a valid `YYYY-MM-DD` with `from_day <= to_day` and at most 3 calendar days covered (`to_day` at most `from_day` + 2). Sending `day` together with `from_day` or `to_day`, only one of `from_day`/`to_day`, or none of the three, is a 400. Anything else returns 400 with `{ error }` in the project's existing error shape. An unknown project is 404. No new permission: any signed-in user with access to the project (every group, including Viewer, archived projects included) can call it; the existing project-scope middleware applies. The endpoint performs no writes and records no history.
24. The query is efficient: it reads history events/changes, comments and time entries with date-bounded SQL joined to `issues` by `project_id`, not one request per item. Items from other projects never appear. Deleted items (history cascades away with them) never appear.
25. Status change detail comes from the `status` field entries in `issue_history_changes` (old/new value). Resolution for a completed item is the item's current resolution.
26. Page state: the person and date selections are not persisted and not in the URL, except that the page honors optional `?user=<id>&date=<YYYY-MM-DD>` query parameters on load (so a bookmark or link can open a specific report); invalid values are ignored and the defaults apply.

### Read-only

27. The page never creates, edits or deletes data. Viewers and archived projects see the same page, with no disabled controls or banners needed beyond the existing archived banner if the other project pages show one.
28. The page is keyboard-operable: native `<select>`, `<input type="date">` and `<button>`; each control has a label; sections use `<h2>` headings and the lists are real `<ul>`.

## Amendment 1 (2026-11-20)

Owner's request: "can we make one change on the daily report. If the day is a MONDAY, Yesterday on the report should include Friday, Saturday and Sunday." Also folds in QA defect D1 from `docs/qa/daily-report-qa.md`. The feature is built and committed; this amendment changes behavior, so the developer re-opens `server/routes/report.js`, `server/data/report.js`, the time-entry query it uses (`minutesByUserOnDay`) and `public/js/reportMath.js`. Text-only change: no designer step, no new controls or layout.

What changed, by acceptance criterion (edited in place above, marked *(Amended)*):

- **AC 5** window: a Monday looks back over Fri, Sat and Sun as one window; Sat and Sun still look back to Friday only; heading names the range.
- **AC 6, 7, 10** follow: time entries match on a day range, activity and total cover the whole window.
- **AC 8** per-item line: round-trip fix for D1 (see AC 8, "Round trip and empty summary").
- **AC 9** empty text names the range on Mondays.
- **AC 19** copy flavors follow the same wording.
- **AC 22, 23** endpoint: `from_day`/`to_day` replace `day` (still accepted), span cap 48 h to 76 h.

New acceptance criteria for QA, numbered to continue the list:

29. Selecting Monday Nov 16 2026 shows the heading "Yesterday (Fri Nov 13 – Sun Nov 15)". Time logged with `work_date` 2026-11-14 (Sat) and 2026-11-15 (Sun) and a comment posted on Sunday both appear for that Monday, and the "Total time logged" sums Fri, Sat and Sun. Activity on Monday Nov 16 itself does not appear.
30. Selecting Tuesday Nov 17 shows "Yesterday (Mon Nov 16)" only. Selecting Saturday Nov 14 or Sunday Nov 15 shows "Yesterday (Fri Nov 13)" only, with nothing from Sat or Sun in it.
31. An empty Monday window shows "No recorded activity Fri Nov 13 – Sun Nov 15." in the page, the plain-text copy and the HTML copy. The Yesterday heading line in both copy flavors also reads "Yesterday (Fri Nov 13 – Sun Nov 15)".
32. A Monday after a DST change inside the window (for example Monday Nov 2 2026, after the Nov 1 fall-back, so the window is 73 hours) works: the request is not rejected, and activity just after Friday 00:00 and just before Monday 00:00 local both appear. The same holds for Monday Mar 15 2027 (71-hour window after the Mar 14 spring-forward).
33. `GET /api/projects/:id/report` with `from_day=2026-11-13&to_day=2026-11-15` and a matching 72-hour `from`/`to` returns 200, counting time entries dated Nov 13, 14 and 15 and not those dated Nov 12 or 16. The old form with `day=2026-11-19` and a 24-hour range still returns 200 with the same result as before the amendment.
34. The endpoint returns 400 with `{ error }` for: a `from`/`to` span over 76 hours; `from_day` after `to_day`; `to_day` more than 2 days after `from_day`; `day` sent together with `from_day` or `to_day`; only one of `from_day`/`to_day`; none of `day`, `from_day`, `to_day`; an invalid date such as `2026-02-30`. Permissions are unchanged (Viewer and archived projects can still call it) and it still performs no writes.
35. (D1) A work item whose status went Ready to In Progress back to Ready inside the window, with no other qualifying action, shows as `KEY Title: Ready -> In Progress -> Ready` in the page, the plain-text copy (`- KEY Title: Ready -> In Progress -> Ready`) and the HTML copy. No rendering shows a line ending in ": " or ":".

## Data model changes

None. No new tables or columns, and the amendment changes none. One new read-only endpoint (AC 22) and, if helpful, an index on `comments(created_at)` and `issue_history_events(created_at)` only if the developer finds the query slow; not required for the POC.

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
8. **Saturday and Sunday report dates** *(Amendment 1)*. The owner asked only for Monday. Default: unchanged, Saturday and Sunday reports look back to Friday only (a Sunday report does not include Saturday). Alternative: Sunday also includes Saturday, or all weekend reports include the weekend before.
9. **D1 wording** *(Amendment 1)*. Default: a net-zero status change with nothing else shows the path (`Ready -> In Progress -> Ready`). Alternatives: show the item with no summary, or drop the item from Yesterday.
7. **Retired/cancelled statuses** are still an open question in `CLAUDE.md`; if one is added, Today and Waiting need to exclude it. The status ranges are derived from `STATUSES` order so only the terminal rule would change.

## Implementation notes for the developer

Suggested order:

1. `server/data/report.js` (new): one function `activityFor(db, projectId, userId, fromIso, toIso, day)` returning the shape in AC 22. SQL lives here, like the other `server/data/*` files; reuse `UNKNOWN_ACTOR` only if needed. Use `issue_history_events` joined to `issue_history_changes` (field `status`, and kind `created`), `comments` (author_id, created_at) and `time_entries` (user_id, `work_date`) all joined to `issues` on `project_id`. Time entries with a null `user_id` (deleted user) never match.
2. `server/routes/report.js` (new) and register it in `server/app.js` next to the other routers: validation per AC 23, using `loadProject` from `server/routes/guards.js`; no `assertCan`, since reads need no permission, like `GET /projects/:id/issues`. The path begins `/projects/:id/`, so project scope resolves automatically in `server/projectPermissions.js`.
3. `public/js/reportMath.js` (new, pure, loadable from `node:test` like `timelineMath.js`): previous working day (AC 5; amended: return a first and last day, three days on a Monday, and a range-text helper producing "Fri Nov 13 – Sun Nov 15" or "Thu Nov 19"; `localDayRange` becomes a range from the first day's local midnight to the local midnight after the last day, built with `new Date(y, m, d)` so DST is handled by the platform), local-day to UTC range, duration text, per-item summary text, status-range selection from the `/api/meta` status list, plain-text and HTML builders for the copy flavors (with escaping).
4. `public/report.html` and `public/js/report.js` (new): controls, fetches, rendering, copy. Follow `public/timeline.html` / `public/js/timeline.js` for project scoping, the shared top bar and the sub-nav. Check how `public/js/api.js` and `public/js/time.js` are used before adding helpers.
5. Add the "Report" link to the sub-nav in `public/board.html`, `backlog.html`, `sprints.html`, `timeline.html`, `test-cases.html`, and make `public/js/projectScope.js` set its href with `?project=` like the others (give it id `nav-report`).
6. Styles in `public/css/app.css`; the designer should cover this page since it adds a screen. Report text needs readable inline styles in the HTML flavor, independent of app.css.
7. Tests: `tests/report.test.js` (endpoint: yesterday with status change/comment/time/created, other users' activity excluded, other projects excluded, window edges, 400/404 cases, Viewer allowed) and `tests/reportMath.test.js` (Monday looks back to Friday, summary lines, plain-text and HTML builders, escaping). Check `tests/helpers.js` for fixtures and `tests/source.test.js` for any source-level conventions that apply to new files.

### Amendment 1: implementation notes (2026-11-20)

Suggested order:

1. `public/js/reportMath.js`: window helper (Mon gives Fri..Sun, Sat and Sun give Fri..Fri, otherwise the day before), range text with an en dash, `buildReport` heading note and empty text from it, and `activitySummary`/`rowRest` for D1 (path when the net change is empty and nothing else qualifies; never emit `: ` with an empty summary, in `toPlainText`, `toHtml` and the on-screen render in `public/js/report.js`).
2. `public/js/report.js`: request `from`/`to` for the whole window and `from_day`/`to_day`.
3. `server/routes/report.js`: raise `MAX_SPAN_MS` to 76 hours, accept `day` or the `from_day`/`to_day` pair, validate per AC 23, pass both days to the data layer.
4. `server/data/report.js` and the time-entry query: match `work_date` with `BETWEEN fromDay AND toDay` (text comparison on YYYY-MM-DD). `activityFor(db, projectId, userId, fromIso, toIso, fromDay, toDay)`; the old `day` becomes `fromDay = toDay`.
5. Tests: extend `tests/report.test.js` (AC 33, 34, and a window-edge case at Fri 00:00 and Mon 00:00) and `tests/reportMath.test.js` (AC 29 to 32 and 35, including the DST Mondays and the plain-text and HTML copies). Update the existing Monday look-back test, which expects Friday only.
