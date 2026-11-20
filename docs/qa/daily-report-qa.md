# QA: Daily report

Spec: `docs/specs/daily-report.md` (Draft, 2026-11-20; owner accepted the open-question defaults).
Design contract: `docs/design/daily-report/README.md`, `main.html`, `empty-yesterday.html`, `email-preview.html`, `states.html`; `docs/design/STYLE.md` section 13.
Branch `gantt-chart`, uncommitted working tree (`git diff HEAD` plus the untracked report files).
QA date: 2026-11-20 (Fri, America/New_York).

## Verdict

**GO.** All 28 acceptance criteria pass. Every criterion was either driven in headless Microsoft Edge against a live server or checked through the API, or is a pure-function check under node. There are no blocking defects. Three deviations and one minor defect are listed below for the owner. None blocks commit.

## Commands and results

| # | Command or method | Result |
|---|---|---|
| 1 | `npm test` (runs `node --test "tests/*.test.js"`), run fresh at the start of QA | 565 tests, 565 pass, 0 fail, 0 skipped (about 45 s). Matches the developer's claim. |
| 2 | Lint and typecheck | Not configured. `package.json` has only `start` and `test`. |
| 3 | QA server: `PORT=3001 DB_PATH=<scratchpad>\qa-db\app.db node server/index.js` on a copy of `data/app.db` | Up and serving. The copy was rebuilt fresh before each full browser run. The dev server on port 3000 was not touched and is still running. |
| 4 | Browser: headless Microsoft Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) over CDP, driver `<scratchpad>\qa-browser.js` | Final run `<scratchpad>\qa-run5.log`: **63 PASS, 0 FAIL**, 15 informational. Console errors: only the two expected ones (the simulated 500 in the Yesterday failure test, and the 404 for `project=999`). |
| 5 | API calls with curl and node against the copy (login, validation, 401/404, Viewer, archived, deletion, actor and work-date checks) | All as expected (see AC table). |
| 6 | Node checks of `public/js/reportMath.js` (copy builders, Waiting variants, weekday look-back, DST day, sort order) | As expected, except defect D1 below. |
| 7 | Read-only check of `data/app.db` | Not written by QA. Its mtime moved at 10:47 EST because of the owner's own live session on port 3000: `EFS-16` and `EFS-17` were created there by Robert Michaels during this review. None of QA's test data (titles, comments, time notes) is in it. |

Scratchpad artifacts (`C:\Users\elermichaels\AppData\Local\Temp\claude\5e18abff35dcecc9\5ae3531c-268e-49d7-9f7f-0d81a98a442b\scratchpad\`): `qa-browser.js`, `qa-run5.log`, `clipboard-main.html`, `clipboard-main.txt`, `report-main-fri20.png`, `report-mobile-360.png`, `report-yesterday-error.png`, `report-empty-today.png`, `report-archived.png`.

Test data used on the QA copy only: comments on EFS-7 and two on EFS-13; a 1.5 h time entry on EFS-7 dated 2026-11-20; a hostile-text task (EFS-17) and an epic (EFS-18), both moved to In Progress; an Alex comment and 1 h on EFS-9 (cross-person check); a 2 h entry on EFS-8 dated 2026-11-19 (work-date check); robert switched to Viewer and back; project 3 set to Completed, archived, then restored; EFS-14 deleted. Robert's group and project 3's status were restored on the copy.

Scope note: the data set has only Robert as an actor on the report date, so "other people's activity is excluded" was checked by the API with Alex's actions, not in the browser.

## Acceptance criteria

| AC | Verdict | Reason |
|---|---|---|
| 1 | PASS | `report.html` exists. The Report link sits between Timeline and Test Cases on all six project pages, with `?project=3` after the sub-nav rewrite. `aria-current="page"` is on the Report page only. Anonymous request redirects to `login.html?next=...`. "Project not found." shows for `project=999`. "No active projects." not driven. |
| 2 | PASS | Person lists the five active users and defaults to Robert. Date is `type=date`, defaults to today (local). Changing either control regenerates with no reload. Today resets the date. Date was set through the value plus a `change` event, not typed keys. |
| 3 | PASS | Title reads "Daily report: EFS Automation, Robert Michaels, Sat Nov 21 2026". The spec example says "Robert", but the design README chose the stored display name. Accepted as written in the design. |
| 4 | PASS | Three `h2` sections in order: Yesterday, Today, Waiting. Empty sections show a sentence, not an omission. |
| 5 | PASS | Sat 21 looks back to Fri 20. Sun 22 to Fri 20. Mon 23 to Fri 20. Tue 24 to Mon 23. Today Fri 20 gives Thu 19. Holidays ignored, as specified. |
| 6 | PASS | Attribution is by actor. Status changes, creation, comments and time count. Alex's comment and time did not appear in Robert's report, and did appear in Alex's. Other edits do not qualify: the SQL filters `field = 'status'` in the join (code review; not driven live). |
| 7 | PASS | Local day converted to UTC (05:00Z to 05:00Z in New York). A time entry dated 2026-11-19 but created on the 20th counts on the 19th window only (120 min), not the 20th. |
| 8 | PASS | One line per item, ascending by number (EFS-1 to EFS-18). Format: `Planning -> Complete (Fixed); created`, `Planning -> In Progress; created; commented; logged 1h 30m`, `commented x2`. Keys link to `board.html?project=3&issue=N`, which `board.js` supports. Edge case: see D1. |
| 9 | PASS | With date = today: "No recorded activity on Thu Nov 19." |
| 10 | PASS | "Total time logged: 1h 30m"; "Total time logged: 0h" when empty. Duration format deviates from time.js; see Deviation 1. |
| 11 | PASS | Epic created in the window (EFS-18) appears in Yesterday with an "Epic" chip, and in Today. Epic excluded from Waiting (node check). |
| 12 | PASS | Today includes In Progress only (the Internal Testing, UAT and Go Live range is empty in the data). Ready items EFS-8 to EFS-12 do not appear. Range comes from `/api/statuses` and `/api/started-status`. |
| 13 | PASS | Board order: status column, then rank (EFS-7 rank 1000 before EFS-13 rank 2000, then new items). Shows key, title, status and priority; "remaining 1h" shown for the item with an estimate. |
| 14 | PASS | "Nothing in progress." for Alex. |
| 15 | PASS | Heading "Today (current status as of now)" when date != today; no note when date = today. Same for Waiting. |
| 16 | PASS | Waiting is whole-project Planning and Ready items, each with assignee name ("Robert Michaels"). Epics excluded (node check). "Unassigned" label is code-only: no unassigned Ready item in the data. |
| 17 | PASS | "In the active sprint 5" lists EFS-8 to EFS-12 by sprint rank. "Backlog and other sprints 0" shows "None.". "No active sprint." is code-checked with node, not driven live. |
| 18 | PASS | Sprint line "EFS - File a disclosure report: 8 of 16 complete, ends Nov 27" matches the sprints API (`done_count` of `item_count`, non-epic). After deleting EFS-14, it recounted to 7 of 15 from the data. "no end date", "no items" and omitted-when-no-active-sprint checked with node. |
| 19 | PASS | Copy writes text/html and text/plain in one `ClipboardItem` (payload captured in page). Fallback: when clipboard write is rejected, execCommand copy succeeds and shows "Copied" (copy event captured). Failure: with both paths failing, the alert "Could not copy. Select the report and copy it by hand." shows. |
| 20 | PASS | Copied content is the report body only, with no controls or nav. HTML flavor has no class, no style block, no img, no link, inline styles, escaped text (the hostile title shows as `&lt;img ...`). Matches `email-preview.html` in headings, order, row formats, sub-headings and totals. The live copy adds "(current status as of now)" as AC 15 requires. |
| 21 | PASS | Success: "✓ Copied. Paste into your email.", `role="status"`, `ok` class, cleared after 4.8 s. Failure: `role="alert"`, exact text, `fail` class. Focus stays on Copy in both cases. |
| 22 | PASS | `GET /api/projects/3/report?user&from&to&day` returns `{ items: [{issue_id, key, title, type, status_changes, resolution, created, comments, minutes}], total_minutes }`. Two date-bounded queries plus a per-project issues lookup, no per-item requests (code review). |
| 23 | PASS | 400 for: `user=abc`, `user=999` (no such user), `from=x`, `from` after `to`, a 72 h span, `day=2026-02-30`, missing `day`. 404 for unknown project. 401 anonymous. Viewer and archived projects are allowed (200). |
| 24 | PASS | Date-bounded SQL joined to `issues` by `project_id`. Deleted item (EFS-14) gone from Yesterday. Other-project filter is in the SQL (code review). |
| 25 | PASS | Status detail from `issue_history_changes` where `field='status'`. Resolution is the item's current one ("Fixed"). |
| 26 | PASS | `?user=2&date=2026-11-21` opens Blake on that date. `?user=abc&date=2026-02-30` is ignored and the defaults apply. |
| 27 | PASS | Robert as Viewer: page loads, Yesterday populated, copy works, no controls disabled, no banner. Archived project: "Archived (read-only)" badge shown, report loads, copy works, controls enabled. |
| 28 | PASS | Native `select`, `input type=date`, `button`, each with a `<label for>`. Sections are `h2`; rows are real `ul.rows`. Focus stays on Copy after copying. Visible focus ring not inspected pixel by pixel. |

Design and layout: screenshots at 1280 px and 360 px reviewed against the README. Subnav, controls panel, report panel, error banner with Retry, epic chip, status pills, and sprint line all render as designed. No sideways scroll at 360 px. Not a pixel diff.

## Deviations (judged)

1. **Durations as `1h 30m`, not time.js's `1.5 h`.** AC 10 says "the same duration format as `public/js/time.js`", but AC 8 and AC 10 give examples in `1h 30m` / `3h 45m` form, and time.js would print `1.5 h` / `3.75 h`. The spec contradicts itself; the implementation follows its examples. Non-blocking. Owner should confirm which form to keep.
2. **Second new endpoint, `GET /api/started-status`.** The spec's Data model section says "One new read-only endpoint". This is read-only and harmless, and it exposes the `startedStatus()` constant from `server/statuses.js`. Non-blocking. Owner to accept it or fold it into the report endpoint.
3. **Copy fallback (`execCommand`) pastes on-screen markup.** Keys arrive as links, with `class` attributes and no inline styles. AC 19 asks for exactly this fallback ("selecting the rendered report"), so this is per spec. The primary path, which is the one designed for Outlook, is correct. Non-blocking; the owner should know that the fallback pastes less cleanly.
4. **Today button is a no-op when the date is already today.** Harmless; AC 2 is still met.

## Defects

**D1 (minor, non-blocking). Net-zero status change leaves a dangling colon.** AC 8 says a change that ends where it started is omitted. The item still qualifies under AC 6, so `activitySummary` returns an empty string, and `rowRest` writes `Title: ` with nothing after it. Both flavors show it (`- P-1 Round trip: ` in text/plain). Reproduced in node with Ready to In Progress to Ready and `created: false`. Not reachable with this project's data, because every item was created in the window; it needs an older item round-tripped within the window. Suggested fix: omit the colon and summary when empty, or drop the item.

## Not driven, and why

- "No active projects." state: not set up.
- "No active sprint." and the sprint-line variants ("no end date", "no items"): covered by node checks against `reportMath.buildReport`, not driven live.
- Real OS clipboard contents: `navigator.clipboard.read()` was denied in headless Edge. The payload passed to `navigator.clipboard.write` was captured by wrapping it in the page, and the fallback's copy event was captured instead.
- Visible focus ring: not pixel-inspected; focus target was verified in the DOM.
- Holidays and "other edits do not qualify" are covered by the spec defaults and code review, not live tests.

## Notes for the owner

- The dev server on port 3000 is still running pre-change code against `data/app.db`, and the owner created `EFS-16` and `EFS-17` through it during this review. The report therefore reflects the live data at the time of each copy. The QA copy is not the live database.
- Stored seed title `EFS-1` contains the literal text `&amp;`. The report shows it literally, the same way the Board does. Not a report defect.

VERDICT: GO
