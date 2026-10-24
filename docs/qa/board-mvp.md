# QA report: Board MVP

Spec: `docs/specs/board-mvp.md` (Draft, 2026-10-24)
Build under test: working tree on `main` (uncommitted), commit `398c491` as base
QA date: 2026-10-24
Node: v26.7.0. DB driver: `better-sqlite3`.

## Verdict

**GO.** All 40 acceptance criteria pass on re-run. One minor defect (D1) is non-blocking. See the defects section.

VERDICT: GO

## Commands run and results

| # | Command | Result |
|---|---|---|
| 1 | `npm install` (in project root) | `up to date, audited 68 packages`, `found 0 vulnerabilities`. Warning: `better-sqlite3@13.0.3 (install: node-gyp rebuild)` is not covered by `allowScripts`. The native binding loads (tests pass), so this is a notice only. |
| 2 | `npm test` (run twice) | `tests 30 / pass 30 / fail 0 / cancelled 0 / skipped 0`, exit code 0 both times. |
| 3 | Lint / typecheck | Not configured (`package.json` has only `start` and `test`). Not run. |
| 4 | `PORT=3001 DB_PATH=<scratch>/app.db node server/index.js` | Started. Port 3000 (another app) was not contacted. Process stopped afterwards. |
| 5 | API scenario script (about 85 checks, `<scratch>/qa/live.mjs`) | All checks OK. The only INFO item is D1 below. |
| 6 | Headless Chromium via Playwright (`<scratch>/qa/ui.cjs`, `ui2.cjs`, `ui4.cjs`) | Create, status, archive, board, drag-and-drop, groups, cross-lane, collapse, detail delete and read-only board all OK. Zero page errors. Console errors were only the expected 400/409 responses from deliberately invalid input. |
| 7 | Rollback test with route interception returning 500 (`<scratch>/qa/ui3.cjs`) | Card returned to its column and the error message shown. |
| 8 | Empty-state and fresh-start test on a second server with an empty DB (`<scratch>/qa/ui3.cjs`) | Empty state shown. Root page has zero console errors or page errors. |
| 9 | Restart and DB-deletion test (manual `curl`) | Projects, archived flag and work items survived a restart. Deleting `app.db` and restarting recreated the schema with the 4 seed users. |

Note: `/Users/robertmichaels/Documents/code/projectmanagement/data/app.db` already existed (dated before this QA run). QA used `DB_PATH` in the scratchpad, so this file was not touched by QA. It is git-ignored.

Scratch scripts are in `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/qa/`. No application code was modified.

## Per-AC results

Legend: PASS = verified. Where the verification is automated only, the row says so.

| AC | Result | How verified / reason |
|---|---|---|
| 1 | PASS | `GET /api/projects` excludes archived. Board list renders name, key, status. Empty state shown on a fresh DB: "No projects yet." with a Create project button. |
| 2 | PASS | API 400 for empty name, 81-char name, lowercase key, 1-letter key, 11-letter key and digit key. Duplicate key gives 409 with a message, and no row is created (count checked). UI shows inline errors for both invalid and duplicate keys. |
| 3 | PASS | Default `Planning`. UI status select options are exactly `Planning, In Progress, Completed, Cancelled`. Change persists after reload (UI). |
| 4 | PASS | Status change via PATCH left work item JSON identical (live check). Also `tests/projects.test.js` (AC 3, 4). |
| 5 | PASS | No project DELETE route (`DELETE /api/projects/:id` returns 404). No delete control in the UI. |
| 6 | PASS | Archive while Planning or In Progress: 409 with message "A project with status Planning cannot be archived." UI shows no Archive button for Planning. Archive allowed for Completed. |
| 7 | PASS | Default list excludes archived. `includeArchived=true` includes them. UI toggle shows them with an "Archived" marker and hides them again. |
| 8 | PASS | Unarchive via UI and API; status unchanged (Cancelled). Archived flag survived a server restart. |
| 9 | PASS | Completed to Planning auto-unarchived (API). Completed to Cancelled stays archived (API and `tests/projects.test.js`). |
| 10 | PASS | Work item JSON identical before and after archive/unarchive (live). `GET` of the archived board returns 200. Archived board loads by direct URL in the browser. |
| 11 | PASS | API: POST, PATCH and DELETE on an archived project all return 409 with a message, and data is unchanged (live). UI: create button hidden, cards not draggable, detail fields disabled and Save hidden, Group by still works. |
| 12 | PASS | Four types accepted. `Story` and `Bug` return 400. Blank title and 201-char title return 400. 200-char title accepted. Default type `Task`, priority `Medium`. Invalid priority returns 400. Description, assignee and epic optional. |
| 13 | PASS | First key `PROJ-1`. Sequence increments. After deleting `PROJ-2`, the next key was `PROJ-7` (not reused). |
| 14 | PASS | `GET /api/statuses` is exactly `["To Do","In Progress","Done"]`. New item gets `To Do`. |
| 15 | PASS | Assignee must be a seeded user (unknown ID returns 400). `null` unassigns. UI select includes "Unassigned". |
| 16 | PASS | Epic must be an epic-type item in the same project (non-epic target, self, cross-project and epic-of-epic all return 400). UI epic dropdown lists only epics. Epic field hidden for Epic-type items. |
| 17 | PASS | API PATCH of title, priority, assignee and description persists (live). UI create shows the card without a manual refresh. The UI save path (edit and create) calls the same `reloadItems()`. A UI edit was not separately clicked. |
| 18 | PASS | Delete asks `confirm()`. UI delete removed the card. API returns 204, deleted item returns 404, key not reused. Deleting an epic clears child `epic_id` and keeps the children (`tests/issues.test.js`, AC 18). |
| 19 | PASS | Columns are rendered from `/api/statuses` in order. Headers show counts (screenshot). |
| 20 | PASS | Card shows key, title, type badge, priority, assignee initials or `?`, and epic chip (screenshot). Defect, Task and Epic have distinct colours. Issue colour is set in config but was not separately screenshotted. |
| 21 | PASS | Epic-type cards render in columns like any other (screenshot). |
| 22 | PASS | Native HTML5 drag in Chromium (Playwright): To Do to In Progress, persisted after reload. Drop on a non-column element leaves the card in place. |
| 23 | PASS | PATCH intercepted with 500: card returned to its original column, and message "Could not move UIT-2: boom" shown. |
| 24 | PASS | In-column UI drags persisted after reload: A,B,C to C,A,B to A,C,B to C,B,A. No-gap case covered by `tests/issues.test.js` (AC 24). |
| 25 | PASS | `server/statuses.js` is the single list. `GET /api/statuses` exposes it. Verified in `tests/source.test.js` and by reading the code. |
| 26 | PASS | `server/types.js` is the single type list. Epic behaviour keys off `isEpic` (`isEpicType` on the server, `isEpicItem` on the client). |
| 27 | PASS | `tests/source.test.js` scans `server/` and `public/` for status and type names outside the list files, and checks the schema has no CHECK. Passes. Also checked by reading `board.js`, `validation.js` and the routes. |
| 28 | PASS (automated) | `tests/extensibility.test.js` inserts `In Review` into the list in-process, then checks order and PATCH acceptance. Column and lane rendering is generic (`state.statuses`). Not run as a real server restart, and the new column was not seen live in the UI. |
| 29 | PASS (automated) | `tests/extensibility.test.js` adds `Spike` with no colour or icon. Create and PATCH accepted. The form is built from `/api/types`. The fallback card path (`card-fallback`, neutral style) is in code but was not seen live. |
| 30 | PASS with caveat (see D1) | Unknown status on PATCH: 400, item unchanged. Unknown type on create and PATCH: 400. Unknown status on POST `/issues` is silently ignored and the item is created as `To Do` (201). |
| 31 | PASS | Group by options are None, Assignee, Epic, Priority. Default None. Choice survives reload (localStorage). |
| 32 | PASS | With grouping, each lane has a header (name and count). Columns share a grid template so they align. None shows no lane header. Screenshot shows lanes. |
| 33 | PASS | Assignee lanes contain only assignees with items, with Unassigned last (screenshot). Epic lanes are headed "UIT-3 Epic A" and "No epic" is last. Priority lanes use fixed order and show only non-empty priorities. Priority lanes tested with one priority only. |
| 34 | PASS | Clicking the lane header collapses it. Collapsed header still shows the count. Clicking again expands. |
| 35 | PASS | UI cross-lane drag (Unassigned to Alex Morgan lane, To Do to Done): assignee 1 and status Done persisted after reload. Drop on Unassigned cleared assignee and set To Do (checked via API). Single PATCH with both fields (`tests/issues.test.js` AC 35). |
| 36 | PASS | Epic-type card dragged onto an epic lane: no data change (`epic_id` stays null) in the UI. API rejects with 4xx (`tests/issues.test.js` AC 36). The rejection message path is in code; it was not read visually. |
| 37 | PASS | Changing Group by only sets a localStorage key and re-renders. No PATCH is sent. Board reads are identical (`tests/issues.test.js` AC 37). |
| 38 | PASS | Projects and items survived a server restart. Deleting the DB file and restarting recreated an empty schema and the 4 seed users. |
| 39 | PASS | Server starts with `PORT=3001 DB_PATH=... node server/index.js`. Root returns 200. Root page on a fresh empty DB: zero console and page errors. Plain `npm start` on port 3000 was not run (port occupied). |
| 40 | PASS | `npm test`: 30 of 30 pass. Required areas are covered: keys and non-reuse (AC 13, 18), archive rules and auto-unarchive and read-only (AC 6-11), four types and default `Task` (AC 12), status change via API (AC 22), status and type validation and single source (AC 25-30), reorder (AC 24), lane-drop field updates (AC 35). |

## Defects

**D1 (minor, non-blocking). POST work item with an unknown status is accepted.**
- Repro: `POST /api/projects/:id/issues` with `{"title":"x","status":"Nonsense"}`. Result: 201, item created with status `To Do`.
- Expected under AC 30: rejected with a 4xx, nothing created.
- Why non-blocking: the stored value is always valid, and PATCH and type validation are correct. This is a judgement call on the wording of AC 30. The owner can make it blocking if they read AC 30 as covering create.
- Suggested fix (for the developer, not applied): in `server/routes/projects.js` or `validation.js`, reject a `status` that is present and not in the status list on create. Add a test to `tests/issues.test.js`.

No other defects found.

## Gaps checked (brief)

- Empty board: renders columns with count 0 and no cards (browser).
- Very long title: 200 chars accepted, 201 rejected. Card title uses `word-break: break-word`, and the card wraps in the screenshot.
- Moving a card to the column it is already in: same-column reorder is exercised (in-column drags). A same-status PATCH with no rank change is a no-op in `updateIssue`.
- Deleting an item that is on the board: card removed from the board (browser). Epic children are released, not deleted (API test).
- Epic-type item moved out of Epic via type change releases its children (live check).

## Not verifiable or not run

- Real mouse and touch drag feel. Chromium native drag was driven by Playwright. Touch is out of scope per spec.
- Visual distinctness of types: judged from the screenshot (Defect, Task, Epic). Issue colour and the fallback style for unknown types were not seen live.
- Live restart with a modified `statuses.js` or `types.js` (AC 28, 29): only simulated in-process in the test suite.
- A clean-clone `npm install` and `npm start` was not repeated from scratch. `node_modules` was already present and was checked with `npm install`.
- Lint and typecheck: not configured in this project.
- Browser console on every page: only root and board were loaded in the browser. Project list edge cases were checked by the scripts.

## Screenshot evidence

`/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/qa/board.png` (board grouped by assignee, showing cards, types, epic chip, lanes and Unassigned last).
