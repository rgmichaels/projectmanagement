# Copy board as a table
Status: Draft
Date: 2026-11-23

UI-facing spec (adds a control to the Board page): the designer step follows this spec, before the developer.

## Problem
The owner wants to paste the board into an email (Outlook or Gmail) and have it keep its layout. The Board page has no copy action, and selecting the board and pasting loses the layout, because the board is built from CSS grid and flexbox that email clients drop. The Daily Report page already solves this for a text report ("Copy for email" in `public/js/report.js`, flavors built by `public/js/reportMath.js`). The board needs the same, as an HTML table.

Decision from the owner: build "copy as table" in addition to what exists. The Daily Report copy stays untouched. A copy-as-image option is not built.

## What the board shows today (checked in the code)
- Columns: one per status, in the server's order (`state.statuses`).
- Cards: only the active sprint's non-epic items (`boardItems()`). With no active sprint the columns are not drawn and the filter bar and Group by are hidden.
- Swimlanes: Group by None, Assignee, Epic (label from the server) or Priority (`computeLanes`). While a search or filter is active and grouping is on, empty lanes are hidden. A lane can be collapsed on screen (view state only).
- Filters: search text plus Assignee, Type, Priority, Status and Resolution dropdowns (`boardFilters`); the visible items are `visibleItems()`. The bar shows "Showing N of M".
- Within a column and lane, cards are sorted by rank.
- A card shows title, type, key, priority, epic key, assignee initials, comment count, and in the terminal status the resolution and completed date.

## User stories
- As a project lead, I want to click "Copy board" and paste into an email, so my team sees the current sprint board without opening the app.
- As a recipient, I want the pasted board to look like a board (a column per status, a group heading per swimlane) in Outlook and Gmail, so I can read it at a glance.
- As a lead, I want the copy to match what I have on screen (grouping and filters), so I can narrow the board first and then send it.

## Decisions (made by the product manager; the owner can reverse them)
1. The builder is a pure module, `public/js/boardCopy.js` (global `boardCopy`, `module.exports` for node:test), in the style of `reportMath.js`. It names no status, type, priority or group; the caller passes the server's lists and the already computed lanes.
2. The caller copies exactly what is drawn: it passes `computeLanes(visibleItems())`, so grouping, filters, lane order, hidden empty lanes and card order are the same as on screen.
3. Collapsed lanes are copied expanded. Collapsing is a screen-space choice; a recipient cannot expand a lane.
4. Layout of the HTML flavor: one `<table>` with a header row (one cell per status: status name and card count), then for each lane a full-width row with the lane label and item count (omitted when grouping is None) followed by a row with one cell per status holding that lane's cards for that status. A cell with no cards is an empty cell (not collapsed away), so columns stay aligned.
5. Each card is a small block in its cell: key in bold, then title, then a second line `Type, Priority, Assignee` (assignee name, or `Unassigned`). Type uses the server's label. Nothing else from the on-screen card is copied (no epic chip, comment count, resolution, completed date, or "Added" badge).
6. Email-safe HTML: every style inline (`style="..."`), plus table attributes (`border`, `cellpadding`, `cellspacing`, `width`, `bgcolor`, `valign`) where Outlook needs them. No `class`, no `<style>` block, no flexbox, no grid, no CSS variables, no images, no scripts. Fonts as in the report (Calibri, Arial, sans-serif). Every user text (title, names, lane labels) is HTML-escaped.
7. Item keys are plain bold text, not links. The app is self-hosted and recipients may not be able to reach it. Links are deferred.
8. Heading above the table: `Board: <Project name> (<KEY>), <Sprint name>, <date>` in the report's date style (`reportMath.longDay`, local today). When grouping is on, a line `Grouped by <Group by label>`. When a search or filter is active, a line `Filtered: showing N of M work items`, using the same numbers as the filter count.
9. The plain-text flavor lists the same content: the heading lines, then per lane its label and count (when grouped), then per status a `Status (count)` line followed by `- KEY Title (Type, Priority, Assignee)` lines, and `None` under a status with no cards. Status columns stay in board order.
10. Clipboard writing reuses the report's pattern: a single `ClipboardItem` carrying both flavors, MIME names built with the `flavor()` helper idea so `tests/source.test.js` (attachment type names) is not tripped. If the async clipboard API is unavailable or fails, fall back to selecting a rendered copy of the HTML table and `document.execCommand('copy')`. The fallback selects the table built for the clipboard (placed off-screen), not the live board, so the layout survives.
11. The button is a read action: it is shown to every user who can see the board, including Viewers and in archived projects.
12. The button is shown only when the board is drawn (an active sprint exists), next to Group by in the toolbar. With no active sprint it is hidden along with the filter bar.
13. If the filters match nothing, the copy still works: heading lines, the header row, and the text `No work items match the current filters.` under the table (plain text: the same sentence).

## Acceptance criteria
1. The Board page toolbar has a button labelled "Copy board" (`type="button"`) next to the Group by control. It is hidden when the board has no active sprint, and visible for Viewers and in archived projects.
2. Clicking it with the clipboard API available writes one clipboard item that has an HTML flavor and a plain-text flavor. Pasting into a rich editor (Outlook, Gmail compose, or a contenteditable page) inserts a table; pasting into a plain-text field inserts the plain text.
3. On success, a polite status message (`role="status"`) near the button reads `Copied. Paste into your email.` with a check mark, as on the Report page. On failure it reads `Could not copy. Select the board and copy it by hand.` Focus returns to the button.
4. The HTML flavor is a `<table>` with a header row of one cell per status, in the server's status order, each showing the status name and the number of cards in it (after filters).
5. With Group by None the table has one body row of cells, one per status, and no lane heading row.
6. With Group by Assignee, Epic or Priority the table has, for each lane shown on screen, a full-width heading row (`colspan` equal to the status count) with the lane label and `N work item(s)`, followed by one row of status cells. Lanes appear in the same order as on screen.
7. Cards sit in the cell of their status within their lane, in the same order as on screen. Each card shows the bold key, the title, and a line `Type label, Priority, Assignee name` (`Unassigned` when none).
8. A status with no cards in a lane is an empty cell; the table has the same number of cells in every row, so columns line up.
9. The copy reflects the screen: with a search or any filter active, only matching cards are copied, the counts in the header cells match, empty lanes hidden on screen are not copied, and the heading shows `Filtered: showing N of M work items` with the same N and M as the on-screen filter count. With no filter active the Filtered line is absent.
10. A lane that is collapsed on screen is copied with its cards.
11. The heading above the table names the project, project key, active sprint and today's date, and (when grouped) `Grouped by <label>`.
12. The HTML flavor contains no `class=` attribute, no `<style` element, no `<img`, no `<script`, no `<a ` link, and no `display:flex`, `display:grid` or `var(` in its styles. Every element that is styled carries an inline `style`.
13. A title or name containing `<`, `>`, `&`, `"` or `'` (for example `<b>x</b> & "y"`) appears in the HTML flavor escaped and displays as the literal text after paste. No unescaped user text appears.
14. The plain-text flavor has the heading lines, lane lines (when grouped), a `Status (count)` line per status in board order, `- KEY Title (Type, Priority, Assignee)` lines in card order, and `None` under a status with no cards.
15. With filters that match nothing, the copy still succeeds; it contains the heading, the header row with 0 counts, and `No work items match the current filters.`
16. When the clipboard API is missing or rejects, the fallback copies the same table by selection plus `execCommand('copy')`; if that fails too, the failure message in AC 3 shows. The live board's appearance and selection are unchanged afterward.
17. Copying changes no data: no network request is made, and no card, filter, grouping or collapse state changes.
18. `boardCopy` is pure and loads in node: `tests/boardCopy.test.js` covers AC 4 to 15 (model, HTML, plain text, escaping, empty states) without a DOM. The existing tests, including `tests/source.test.js`, still pass, and `public/js/report.js` and `public/js/reportMath.js` are unchanged.
19. The button matches the design chosen for this feature (`docs/design/copy-board-as-table/README.md` and `docs/design/STYLE.md`), checked by QA, including keyboard operation (Tab to it, Enter or Space activates).

## Data model changes
None. No server or database change; the copy is built in the browser from data the Board already holds.

## Out of scope
- Copy as an image.
- Any change to the Daily Report copy.
- Links on keys back into the app.
- Download or export to file (the Export spec is separate), print stylesheet, or sending email.
- Copying the Backlog, Sprints or Timeline pages.
- Colors for types, priorities or status on cards in the email, and the resolution, completed date, comment count, epic chip and "Added" badge.
- Reflecting collapsed lanes, or a "copy only this lane" action.
- Verifying rendering in each email client in an automated way; the owner checks Outlook and Gmail by hand.

## Open questions
1. Should keys link back to the app? Default: no (plain bold text), because recipients may not reach a self-hosted server. If the owner wants links, a configurable base URL would be needed first.
2. Should the copy also include the Epic key or the estimate on each card? Default: no, to keep the cells narrow in email. Say so if it helps your readers.

## Implementation notes for the developer
Suggested order:
1. `public/js/boardCopy.js` (new): `buildModel({ project, sprint, groupByLabel, statuses, lanes, shown, total, filtersActive, typeLabel, userName, now })` returning a model; `toHtml(model)`, `toPlainText(model)`, `escapeHtml`. Mirror `reportMath.js`: IIFE, global `boardCopy`, `module.exports` guard. Name no status, type, priority or group. Use `reportMath.longDay` only in the caller, or duplicate nothing: pass the date text in.
2. `tests/boardCopy.test.js` (new): node:test cases for the AC 4 to 15 items listed above, using the style of `tests/reportMath.test.js`.
3. `public/board.html`: add `<button type="button" id="copy-board">Copy board</button>` and a `<p id="copy-board-status" role="status">` in the toolbar next to Group by; add `<script src="js/reportMath.js">` (for `longDay`, if used) and `<script src="js/boardCopy.js">` before `js/board.js`.
4. `public/js/board.js`: in the `onBoard` branch only (this file also runs on Backlog, Sprints and Timeline, which have no such elements), add `copyBoard()` modeled on `copyReport()` in `public/js/report.js` (lines ~198 to 243): build the model from `computeLanes(visibleItems())`, `state.statuses`, `activeSprint()`, `groupOptions()` label for the current `state.groupBy`, `typeOf(item.type).label`, and `userById`; write both flavors via `navigator.clipboard.write`; fall back to selecting an off-screen rendered copy of the HTML. Show or hide the button in `render()` next to the existing `els.groupBy.closest('label').hidden = !active`.
5. `public/css/app.css`: style only the button and the status text (reuse `.copy-status` rules, line ~1072). The email HTML carries its own inline styles and must not depend on this file.
6. Run `npm test`. Check by hand: paste into Outlook and Gmail compose; with Group by Assignee and a filter active.

Files to touch: `public/board.html`, `public/js/board.js`, `public/js/boardCopy.js` (new), `tests/boardCopy.test.js` (new), `public/css/app.css`. Do not touch `public/js/report.js` or `public/js/reportMath.js`.
