# QA: global project scope and Sprints screen

Date: 2026-10-28
Branch: sprints-backlog-restyle (uncommitted working tree; not committed)
Specs: `docs/specs/global-project-scope.md` ("Scope AC n"), `docs/specs/sprints-screen.md` ("Sprints AC n")
Design: `docs/design/sprints-and-project-scope/README.md` (topbar A, Sprints A), `docs/design/STYLE.md` section 6
Tester: QA agent (independent re-run; developer report not relied on)

## Summary

- Targeted tests: 126 of 126 pass (exit 0).
- Live app (headless Edge over CDP, scratch database, port 3077): 94 checks run, 90 passed first time; the 4 others were errors in my own expectations, re-probed and confirmed correct. Browser probes (probe2 to probe4) add about 30 further checks (interception, unload prompt, Viewer, sign-in redirect).
- No blocking defect found. No console or page exceptions were logged in any run.
- Non-blocking: the Test Cases sub-navigation link (a fourth link on Sprints AC 1), and the Test Cases page and tab, which come from the uncommitted test-case work. Both need an owner decision, see "Deviations" and "Risks".

## Commands run and results

1. Targeted tests (exact command from the task):

   `node --test tests/projectScope.test.js tests/sprintView.test.js tests/bulkMove.test.js tests/sprints.test.js tests/source.test.js`

   Result: `tests 126, pass 126, fail 0, cancelled 0, skipped 0, todo 0`, exit code 0, about 8 s. The source rules (no state, status, type or priority names in `sprintView.js`; only `projectScope.js` reads `?project=` and the storage key) pass.

2. Live server for the UI and API checks:

   `PORT=3077 DB_PATH=<scratchpad>/qa/qa.db node server/index.js` (a scratch database in the session scratchpad; the repository database was not touched). Port 3055 was already in use by another process and was left alone. The server was stopped at the end.

   Seed data: project 1 `PM` (epic PM-1, items PM-2 to PM-13, Sprint 1 Active with 7 items and 2 done, Sprint 2 Planned, Sprint 3 Planned empty; one title of 199 characters; one title containing `<b>` markup); project 2 `SF` (one Planned sprint, no active); project 3 `OLD` (archived, no sprints); project 4 `DN` (one Completed sprint, one Completed sprint with a done item kept); project 5 `EM` (empty).

3. Browser checks: headless Edge 156 driven over the DevTools protocol with scripts kept in the scratchpad (`qa/run.mjs`, `qa/probe.mjs`, `qa/probe2.mjs`, `qa/probe3.mjs`, `qa/probe4.mjs`). Screenshots in `shots/` in the scratchpad (board-topbar.png, sprints-desktop.png, sprints-sorted.png, sprints-longtitle.png, sprints-narrow.png).

4. Lint and typecheck: none configured in `package.json` (scripts: `start`, `test`). Not run.

5. Full test suite: not run, per the task instruction. `tests/test-cases.test.js` was not run, see Risks.

## Acceptance criteria: global-project-scope.md

| AC | Result | Reason |
|---|---|---|
| 1 | PASS | Dropdown right of the brand on Board, Backlog, Sprints (and Test Cases); `label for` "Project"; `.crumb` removed from board and backlog topbars (S1d, S1e, S1f, L-backlog check). |
| 2 | PASS | `js/projectScope.js` loaded after `session.js` on board, backlog, sprints and test-cases pages; `storageGet`/`storageSet` now come from it (`board.js` line 37), no third copy. |
| 3 | PASS | Options read `PM - Alpha Platform` etc. in server order; OLD absent from the list (S1a, S1b). |
| 3a | PASS | `board.html?project=3` shows archived badge and the extra `OLD - Old Retired (archived)` option selected (S7, S7b); not written to storage (S7c); the extra option is gone after switching (code, and S2). |
| 4 | PASS | Switch navigates to `board.html?project=2` (S2); switching from Sprints drops `sprint=` (H1). |
| 5 | PASS | Native `<select>`, no custom widget (code). Arrow-key operation was not driven by keyboard. |
| 6 | PASS | Dropdown shown to Viewer (I1). List request failure: message "Could not load the project list. Showing the current project only." and only the current project in the dropdown, page still loads (E). |
| 7 | PASS | URL governs the view (S4, S7, F-series). |
| 8 | PASS | `pm.project` written on a successful live load and on change; an archived id is never written (S3, S5b, S7c). Storage-throwing path is wrapped in try/catch (code); not driven. |
| 9 | PASS | Remembered id used (S4); remembered archived id skipped, first live used (S5); URL replaced with `?project=` (S4, S5). No live project shows "No active projects." with a link and no dropdown (F). |
| 10 | PASS | `project=999` and `project=abc` show "Project not found." with the dropdown still listing projects (S6, S6b, S6e); remembered id not overwritten (S6d). |
| 11 | PASS | `board.html?project=<id>` bookmarks work (S4, S7); `projects.js` line 52 link unchanged (file not in the diff). |
| 12 | PASS | `sprint=` dropped on switch; default selection applies (H1, H1a). |
| 13 | PASS | Sub-navigation links carry `?project=` (S1g, P3e, L1b); brand goes to `/` (S1h). |
| 14 | UNTESTED (unreachable) | The dropdown is inert while the work item dialog is open; verified (probe2: select cannot take focus while the dialog is open). The spec (14b) accepts this. The confirm path exists in `projectScope.js` but cannot be reached. |
| 14a | PASS | Unload prompt appears when a dirty dialog is left, with trusted input (probe3, `beforeunload`); no prompt when not dirty (probe2). Dirty for a new item and for an unposted comment: code only, not driven. |
| 14b | PASS | Verified inert (see 14). |
| 14c | PASS | X, Close and Escape ask "Discard changes?" with the detail line when dirty (J2, J2a, J4, J5); no prompt without edits (J7). |
| 14d | PASS | Cancel keeps all fields (J3, I after cancel). Focus return after Cancel is code only, not verified. |
| 14e | PASS | Escape handled via the dialog's keydown and cancel path; the second Escape is the confirm's Cancel (J5, J5a); Save clears dirty and closes (J6). Failed-save-stays-dirty not driven. |
| 14f | PASS | Board X (probe2), Sprints Close/X/Escape (J), epic re-point while dirty asks "Discard changes?" (probe4 I). Backlog close guard: shared code, not driven. |
| 15 | UNTESTED | Board filters and Group by are untouched by the diff; not exercised in this run. |
| 16 | PASS | `index.html`, `users.html`, `login.html` have no dropdown (J); `/` shows the Projects list (J). |
| 17 | PASS | `/` does not redirect (J). |
| 18 | PASS | Signed-out visit to `sprints.html?project=1` goes to `login.html?next=%2Fsprints.html%3Fproject%3D1` (G). `redirect.js` unchanged. Round trip after sign-in not re-driven. |
| 19 | PASS (partial) | Archived by URL: badge shown and no create control path exercised. The archived project has no items, so the read-only dialog on it was not opened. |
| 20 | PASS | Archived remembered project skipped (S5); the stale id is overwritten on the next successful live load (S5b). |

## Acceptance criteria: sprints-screen.md

| AC | Result | Reason |
|---|---|---|
| 1 | PASS (deviation) | `sprints.html` exists; order Board, Backlog, Sprints, Test Cases; `aria-current` on Sprints (P3e, L1b). The spec says three links; the fourth is a deviation, see below. |
| 2 | PASS | Topbar, sub-navigation, toolbar `<h1>Sprints</h1>`, archived badge, sprint dropdown, summary, table (screenshot sprints-desktop.png; P3, G4). Signed-out goes to sign-in (G). |
| 3 | PASS | Options `Sprint 1 (Active)`, `Sprint 2 (Planned)`, `Sprint 3 (Planned)` in server order (P1, P1a); a Completed sprint is listed (B: `DN Sprint 1 (Completed)`); no Backlog entry. |
| 4 | PASS | Active default (P2); planned fallback with note (G1, `SF Sprint 1 (Planned)`); completed fallback with note (G2); no sprints: "This project has no sprints yet.", link to Backlog, dropdown disabled (G3). |
| 5 | PASS | `?project=1&sprint=1` written by replaceState (P2, F4b); choosing another sprint pushes state, table reloads with no page reload, Back restores (F1, F2). |
| 6 | PASS | `sprint=999`, `sprint=abc` and another project's sprint (`sprint=4`) fall back with "Sprint not found; showing Sprint 1 instead." (role status) and never show other items (F4, F4a, F5, F6). |
| 7 | PASS | Switch drops `sprint=` (H1, H1a). |
| 8 | PASS (partial) | "7 items, 2 done" (P3f, screenshot); goal shown as text, `<i>` not rendered (C); dates `2025-12-01 to 2026-01-05` and "Overdue · ended 296 days ago" (C). Same overdue wording as `backlog.js` line 258. |
| 9 | PASS | Seven columns Key, Title, Type, Epic, Priority, Status, Assignee in order (P3a); no Resolution, dates or Sprint column. |
| 10 | PASS | Epics never listed (P3, rows are PM-2, 3, 4, 5, 6, 8, 9); chip shows `PM-1` with title tooltip and aria-label; empty cell shows "-" with hidden "No epic" (P3b, probe); chip opens the epic (J8). |
| 11 | PASS | Assignee name or "Unassigned"; status name with check mark on the terminal status; type chip; priority name (screenshot). |
| 12 | PASS | `<b>bold</b>` shown as text (E6a); long titles wrap (narrow screenshot). |
| 13 | PASS | Empty sprint: "No work items in this sprint." and no table (F3, G2a). Error: role alert with Retry; Retry recovers (D). Loading text per code. |
| 14 | PASS | Key and Title open the dialog in place (J1); Save refreshes the table and keeps the sort (J6); moving an item to another sprint drops it on refresh (J9); Sprint field read-only in a Completed sprint (H). |
| 15 | PASS | No handles, checkboxes or sprint controls in table (P3c); "Manage sprints on the Backlog" links to `backlog.html?project=1` (P3d). |
| 16 | PASS | Each of the seven headings is `button.sort` in `th scope="col"` (E-series; DOM). |
| 17 | PASS | Default is sprint order, "Sprint order" shown, all `aria-sort="none"` (P3g). |
| 18 | PASS | Click ascending, click again descending, one column at a time, "Reset sort" only while sorted (E1, E2, E9). |
| 19 | PASS | Key numeric (E1); Title case-insensitive (E6); Type by server order (E8); Epic by key with no-epic last (E7); Priority by server order, highest first (E3); Status by pipeline (E4); Assignee with Unassigned last both ways (E5, E5a). |
| 20 | PASS | Ties by sprint rank ascending even when descending (E3a, E2); unit tests for key-number ties. |
| 21 | PASS | `aria-sort` on the sorted header; arrow aria-hidden; visually hidden "sorted ascending" (E10a); focus stays on the button after Enter (E10); status region announces "Sorted by Title, ascending." (E1b). Space not driven (native button). |
| 22 | PASS | Choosing a sprint resets sort (F1a); a fresh load shows sprint order (P3g). |
| 23 | PASS (code) | `sortBy` redraws from loaded rows; no request on sort (code, not network-logged). |
| 24 | PASS | Viewer sees the same page and dropdown (I1); dialog title disabled and no Save (I2). |
| 25 | PASS (partial) | Archived badge (G4); the read-only dialog on an archived project with items was not opened (no items in the archived project). |
| 26 | PASS | `tests/source.test.js` passes (no state, status, type or priority names in `sprintView.js`). |
| 27 | PASS | `defaultSprint(sprints, states)`, `resolveSprintParam(raw, sprints)`, `sortRows(rows, column, direction, orders)` exist with those signatures and are covered by `tests/sprintView.test.js` (all pass). |

## Epics on the Backlog

PASS. Epic row `[data-id="1"]` in the Backlog Epics group has no checkbox and is not draggable, while sprint rows have checkboxes (L1, L1a). Bulk move excludes epics (`bulkMove.js` line 738).

## Developer deviations, judged

1. **Sub-navigation order Board, Backlog, Sprints, Test Cases.** Order is correct. The fourth link is not in the Sprints spec (AC 1 says three). It comes from the draft `docs/specs/test-case-manager.md` line 41, which asks for `test-cases.html?project=<id>` in the sub-navigation. Acceptable for this change; the owner should confirm, and the Sprints spec could be amended. Not blocking.
2. **Styled confirm dialogs instead of `window.confirm`.** Acceptable. Sprints/global specs allow either; the design README recommends the styled dialog. Texts match ("Switch project?" plus the specified body; "Discard changes?" plus "Your unsaved changes to this work item will be lost."). Cancel is focused; Escape is Cancel.
3. **Epic type name taken from the server.** Acceptable. The column header is "Epic" from `/api/types`; no name is hard-coded.
4. **Counts from server sprint counts.** Acceptable. Server counts exclude epics (test "counts excluding epics") and done means the terminal status (Sprint 1 shows 2 done for two Complete items).

## Gap checks

- Empty board: `board.html?project=5` and `backlog.html?project=5` load without error (L2, L3). Empty sprint list and empty sprint table both show their messages (G3, F3).
- Very long title: 199 characters accepted and wrap in the table; 200+ characters refused by the server with "Title is required and must be 1-200 characters." (the 321-character attempt).
- Moving a card to the column it is already in: server PATCH with the same status returns 200. Board drag-and-drop to the same column was not driven (UNTESTED).
- Deleting an issue that is on the board: deleted PM-11 from the Sprints dialog with the native delete confirm; the dialog closed and the row was removed (K1, K1a). Deleting an item on the Board page was not driven.

## Risks

- **Test Cases work is outside this QA scope and was not run.** `public/test-cases.html` and `public/js/testCaseManager.js` were edited, and `tests/test-cases.test.js` was not run (per instruction, no full suite). A browser smoke load of `test-cases.html?project=1` shows the dropdown, selected project 1 and no exceptions (T1), but the test-case tests must be run before the owner commits.
- The Test Cases tab in the work item dialog and the `testCases.js` load are on Board, Backlog and Sprints. They loaded with no console errors in any run.

## Observations (not blocking)

- With no `?project=` and a failing project list, the page shows "Could not load the project list: <message>" in the "Project not found" style and no dropdown. The spec is silent on this case.
- The dialog key chip reads `Enhancement PM-4` (type name in the chip). This is existing dialog behaviour, not changed here.

## Verdict

No acceptance criterion is FAIL. Every criterion marked UNTESTED is either unreachable by design (14) or covered by code review only, and none is a blocking defect. The deviations are acceptable with the owner's confirmation of the Test Cases sub-navigation link, and the test-case tests must be run before commit.

VERDICT: GO
