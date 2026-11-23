# QA: Copy board as a table

Spec: `docs/specs/copy-board-as-table.md` (Draft, 2026-11-23)
Design: `docs/design/copy-board-as-table/README.md`, `docs/design/STYLE.md` section 15
QA date: 2026-11-23
Reviewed files: `public/js/boardCopy.js` (new), `public/js/board.js` (copy section and render wiring), `public/board.html`, `public/css/app.css` (copy block and the modified `.group-by[hidden] + .copy-board[hidden] + #create-item` selector), `tests/boardCopy.test.js` (new).

## 1. Commands run and results

| # | Command (from project root) | Result |
|---|---|---|
| 1 | `npm test` (`node --test "tests/*.test.js"`) | 600 tests, 600 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo. Duration about 69 s. The run was piped through `tail`, so the process exit code was not captured; the summary lines are the evidence. |
| 2 | `node --test tests/boardCopy.test.js` | 14 tests, 14 pass, 0 fail. |
| 3 | `node --test tests/source.test.js` | 73 tests, 73 pass, 0 fail. |
| 4 | `git diff --quiet HEAD -- public/js/report.js public/js/reportMath.js` | No output and exit 0: both files are unchanged against HEAD. |
| 5 | `node` script that calls `boardCopy.buildModel`, `toPlainText` and `toHtml` on a sample with a hostile title, grouped by Assignee, filtered | Output as specified: heading lines, lane lines with counts, `Status (count)` lines, `- KEY Title (Type, Priority, Assignee)` lines, `None`; HTML starts with the inline-styled wrapper and `h1`. The `<b>` in the title is escaped in the HTML. |

Lint and typecheck: `package.json` defines no `lint` or `typecheck` script, so none were run.

Browser: no browser tool (Playwright MCP or in-app browser) is available in this session. The app was not started and no clicks were made. See section 4.

## 2. Acceptance criteria

Code checks are by reading the code and by the tests named. "Test" means `tests/boardCopy.test.js` passed.

| AC | Verdict | Reason |
|---|---|---|
| 1 | PASS | `board.html` puts `#copy-board` (`type="button"`, class `navy`) after `label.group-by` and before `#create-item`. `render()` calls `syncCopyBoard(active)`, which hides `#copy-board-wrap` when there is no active sprint. The button is never disabled and there is no `readOnly()` or `session.can()` gate on it (test passes). Viewer and archived visibility is by code reading only. |
| 2 | PASS (code) | `copyBoard()` makes one `new ClipboardItem({ 'text/html', 'text/plain' })` and calls `navigator.clipboard.write`. Paste behaviour in Outlook, Gmail or a plain field is not verified (owner checks by hand, per the spec). |
| 3 | PASS (code) | Success text is `✓ Copied. Paste into your email.` (check mark) with role `status`. Failure is `Could not copy. Select the board and copy it by hand.` with role `alert`. `els.copyBoard.focus()` runs on every path. Visual rendering not checked. |
| 4 | PASS | Header row has one `th` per status in `state.statuses` order, with `Status (count)`; counts are summed over the lanes passed in, which are the filtered cards (test passes; sample output confirms). |
| 5 | PASS | Group by None gives a header row and one body row with no `colspan` (test). |
| 6 | PASS | Each lane gets a `td colspan=N` heading row with `label - N work item(s)`, followed by one status row. Lanes come from `computeLanes(visibleItems())`, so screen order is kept (test). |
| 7 | PASS | Cards are in the status cell in `byRank` order. Each card has `<b>KEY</b> title` and a meta line `Type, Priority, Assignee` (`Unassigned` when none) (test). |
| 8 | PASS | Empty cells hold `&nbsp;`; every row has one cell per status (test). |
| 9 | PASS | `shown` is `visibleItems().length` and `total` is `boardItems().length`, the same figures as `renderFilterCount` (`Showing N of M`). Empty lanes are removed by `computeLanes` while a filter is active. The Filtered line appears only when `boardFilters.isActive` (test). |
| 10 | PASS | The copy section never reads `state.collapsed`, and `computeLanes` ignores collapse (test asserts this). |
| 11 | PASS | Title is `Board: <name> (<KEY>), <sprint>, <longDay of local today>`; `Grouped by <label>` is added when grouped (test; sample output). |
| 12 | PASS | Test asserts no `class=`, `<style`, `<img`, `<script`, `<a `, `display:flex`, `display:grid` or `var(`, and that every styled element has an inline `style`. |
| 13 | PASS | `escapeHtml` covers `& < > " '`. Test feeds `<b>x</b> & "y" 'z'` and a hostile name and checks the escaped output and the literal plain text. |
| 14 | PASS | Plain text heading, lane lines, `Status (count)` per status in board order, card lines, `None` (test checks the full expected text). |
| 15 | PASS | Empty filter result gives the header row with `(0)`, no lane rows, and the sentence `No work items match the current filters.`, in both flavors (test). |
| 16 | PASS (code) | `copyBySelection` builds an off-screen `div` (`aria-hidden`, `left:-9999px`), selects it, runs `execCommand('copy')`, restores the saved selection and removes the div. The `execCommand` path was not run in a browser. |
| 17 | PASS | The copy section has no `api.` or `fetch(` call, no write to `state.filters` or `state.groupBy`, and no `.disabled` (test). |
| 18 | PASS | `boardCopy.js` has no DOM, storage or network references and names no status, type or priority (test). `tests/boardCopy.test.js` (14), `tests/source.test.js` (73) and the full suite (600) pass. `report.js` and `reportMath.js` are unchanged against HEAD. |
| 19 | PASS (static) / UNTESTED (visual) | Placement, `navy` class, hover rule (`var(--teal)`), `.copy-status` override and the `max-width:600px` wrapper rule are in the code and the test. The keyboard path is a native `<button>`, so Enter and Space work by default. Focus ring and 360px layout were not seen. |

Result: 18 of 19 criteria PASS by code and tests; criterion 19 is PASS for the markup and CSS, with its visual and keyboard checks UNTESTED. No criterion FAILs.

## 3. Design README check

| Design item | Result |
|---|---|
| Placement after Group by, before Create work item | PASS |
| `div.copy-board` wrapper with button and `p.copy-status[role=status]` | PASS |
| `.copy-board` inline-flex, 10px gap, wrap | PASS (CSS) |
| `.copy-board .copy-status` auto width, `min-height:0` | PASS (CSS) |
| Hover teal fill and border on this button only | PASS (CSS) |
| Below 600px wrapper `flex-basis:100%` | PASS (CSS); the toolbar is `flex-wrap:wrap`. Not seen at 360px. |
| Hidden with Group by when no active sprint, status text cleared | PASS (code) |
| Pasted table: wrapper, h1, p lines, table attributes, header `th` with `bgcolor` `#e5eded`, navy lane row, `#f8fafa` status cells, white card blocks with `#d0d0ce` border | PASS (code; sample output matches) |
| Long titles wrap inside the cell | DEFECT (minor), see section 5 |

## 4. What was not verified

- No browser was available, so none of the following were observed in a running app:
  - the actual clipboard contents (`text/html` and `text/plain`) after clicking Copy board with Group by Assignee and a filter active;
  - the confirmation text and its role change on success and failure, and the 4-second clear;
  - keyboard focus after copying, and that Tab reaches the button after Group by;
  - the fallback path (`execCommand('copy')`) and that the live selection is unchanged afterwards;
  - the 360px layout, and the wrapper on its own line below 600px;
  - button visibility in the UI for a Viewer, in an archived project, and with no active sprint;
  - that the button is not shown on Backlog, Sprints or Timeline. (By code: `render()` returns early when `!onBoard`, the click listener is attached only `if (onBoard)`, and `boardCopy.js` is loaded only by `board.html`. The three pages load `board.js` but not `boardCopy.js`.)
- Pasting into Outlook and Gmail was not checked (the spec assigns this to the owner).
- The app was not started, so no API call was made. The copy code makes no network request by reading, so this was not needed for AC 17.

## 5. Defects

1. **Minor, not blocking: long unbroken titles do not wrap in the email.** The pasted table uses `table-layout:fixed`, but no cell or card carries `word-wrap`, `overflow-wrap` or `word-break` (grep of `public/js/boardCopy.js` finds none). Titles with spaces wrap; a single token of many characters (for example a long URL or identifier) will overflow its cell. The design README (pasted-table item 7) says long titles wrap inside the cell. Suggested fix: add `word-wrap:break-word;overflow-wrap:anywhere;` to the `card` and `td` styles in `STYLE` in `boardCopy.js`, and add a test for it. This does not affect any acceptance criterion.
2. **Note: untracked file outside the spec.** `start.bat` in the project root is untracked and is not in the spec's file list. Do not include it in the copy-board commit unless the owner wants it there.
3. **Open question for the owner (not a defect).** Plain text prints the count per lane under each status (`Status (N)` inside each lane). The HTML header row uses the board-wide total. The design README asks whether the plain text should use the board-wide count instead. The code follows the spec's wording (`Status (count)` per status), so no change is needed unless the owner decides otherwise.

## 6. Verdict

No acceptance criterion fails. The 600-test suite passes, the new module and its wiring match the spec and design by code reading, and the report files are unchanged. Browser-level checks (clipboard contents, focus, fallback, 360px layout, role-based visibility, Outlook and Gmail paste) were not run and are listed in section 4; the owner's hand check in Outlook and Gmail is still required by the spec. Defect 1 is a minor design deviation and can be fixed after release.

VERDICT: GO
