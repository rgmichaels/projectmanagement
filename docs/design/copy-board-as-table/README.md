# Copy board as a table: design

Spec: `docs/specs/copy-board-as-table.md`. As the owner asked for no pauses, this folder gives **one recommended design, not several options**.

Mockups (open from disk):
- `toolbar.html`: the button in the Board toolbar in every state (default, hover and focus, copied, error, fallback, read-only, hidden with no active sprint, narrow screen).
- `email-preview.html`: what lands in the email. Four cases (Group by Assignee with a filter, Group by None with a long title, filters that match nothing, hostile text), each with the rendered HTML flavor, its source and the plain-text flavor. Generated from the same rules the developer must follow, so the source is the reference markup.

## Recommended design

A secondary-looking-but-navy `Copy board` button (the Daily Report's `button.navy`) directly after Group by and before Create work item, with the Report's `p.copy-status` confirmation line to its right. Reuse over invention: no new colour, no icon, no new CSS beyond about six lines (a wrapper, a hover colour, a narrow-screen rule). The pasted table is a single `<table>`: a pale-teal header row (status name and count), an optional navy full-width heading row per lane, then one row of status cells holding white card blocks on a near-white cell. It uses only colours the Report email already uses (`#0b5d66`, `#154973`, `#e5eded`, `#8d9499`, `#62666a`, `#f8fafa`), so the two emails look related. Rejected: an icon-only button (hidden meaning, extra asset), putting the button in the filter bar (the filter bar is for narrowing; the spec says next to Group by), and a toast (not needed, the Report's inline line is already the app pattern).

## UI contract (what the developer builds, what QA checks)

**Placement (`public/board.html`, inside `section.toolbar`, in this order):** `label.group-by`, then

```html
<div class="copy-board" id="copy-board-wrap">
  <button type="button" id="copy-board" class="navy">Copy board</button>
  <p id="copy-board-status" class="copy-status" role="status"></p>
</div>
```

then Create work item. Group by keeps its `margin-left: auto`, so the three controls sit together on the right.

**CSS (the NEW block in `toolbar.html`, append to `app.css`):** `.copy-board` inline-flex, 10px gap, wraps; `.copy-board .copy-status` has `min-height: 0` (the Report's rule sets `flex-basis: 100%`; inside this wrapper that must be overridden to auto, so the line sits beside the button); `.copy-board button.navy:hover` teal fill and border; below 600px the wrapper is `flex-basis: 100%`. `.copy-status`, `.ok` and `.fail` are the existing rules.

**Button states**
| State | Look | Notes |
|---|---|---|
| Default | Navy fill, white bold text "Copy board" | `type="button"`. Never `disabled`, including for Viewers and archived projects. |
| Hover | Teal fill and border | New, only on this button. |
| Focus | Existing 2px teal ring, 2px offset | Tab reaches it after Group by; Enter and Space activate. Focus is on the button after copying (the code must not move it). |
| Copied | `p.copy-status.ok[role="status"]`: check mark (`&#10003;`) then "Copied. Paste into your email." | Teal bold. Cleared after about 4 seconds. Set with `textContent`. |
| Error | `p.copy-status.fail[role="alert"]`: "Could not copy. Select the board and copy it by hand." | Danger bold. Stays until the next click or until grouping, filters or sprint change. The role switches to alert for the failure, back to status for success, as on the Report. |
| Fallback | No visible UI | Off-screen copy of the table selected, `execCommand('copy')`, then removed (`aria-hidden="true"`, `position:absolute; left:-9999px`). Ends in Copied or Error. The live board and the user's selection are unchanged. |
| Read-only | Identical to default | Shown to Viewers and in archived projects; Create work item is the only thing hidden. |
| No active sprint | Whole `.copy-board` wrapper hidden (`hidden`), status text cleared | Hidden in `render()` with Group by and the filter bar. |
| Narrow (below 600px) | Wrapper on its own line, message wraps under the button | No horizontal scroll at 360px. |

All strings are fixed; no user text appears in the button or its messages.

**Pasted table (see `email-preview.html`).** Inline styles and table attributes only. Never `class`, `<style>`, `<img`, `<script`, `<a`, flex, grid or `var(`.

1. Wrapper `div`: `font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000000`.
2. Title `h1` 18px bold, margin `0 0 4px 0`: `Board: <Project> (<KEY>), <Sprint>, <Mon Nov 23 2026>`. Then, in 13px `#62666a` `p` lines (margin `0 0 2px 0`), only when they apply: `Grouped by <Group by label>` and `Filtered: showing N of M work items`.
3. `<table border="1" cellpadding="0" cellspacing="0" width="100%" bordercolor="#8d9499">` with `table-layout:fixed;border-collapse:collapse;border:1px solid #8d9499;margin:10px 0 0 0`.
4. Header row: one `th` per status, `width` = floor(100 / status count) %, `bgcolor="#e5eded"`, color `#0b5d66`, 13px bold, padding `6px 8px`. Text: `Status name` then ` (count)` in normal weight. Counts are totals across all lanes, after filters.
5. Lane heading row (only when grouped, one per lane drawn): one `td colspan="<status count>"`, `bgcolor="#154973"`, white 13px bold text: lane label, then ` - N work item(s)` in normal weight (`1 work item`, `3 work items`).
6. Status row: one `td` per status in every lane, `valign="top"`, `bgcolor="#f8fafa"`, padding `6px`, 1px `#8d9499` border. No cards: the cell holds `&nbsp;` (never collapsed, so columns align).
7. Card: mail clients stripped the border, background and margin of a styled `div` (cards ran together when pasted into a dark-mode client), so each status cell holds one nested `<table border="0" cellpadding="0" cellspacing="0" width="100%">`: one `<tr><td bgcolor="#ffffff">` per card (1px `#8d9499` border, padding `5px 6px`, 13px) with a 10px spacer row (`<td height="10">&nbsp;</td>`) between cards. The card cell holds `<b>KEY</b> Title`, then an inner `div` 12px `#62666a`, margin `2px 0 0 0`: `Type, Priority, Assignee` (`Unassigned` when none). No type colour, epic chip, comments, resolution, completed date or Added badge. Key is bold text, not a link. Long titles wrap inside the cell.
8. No matches: heading and lines, header row with `(0)` counts, no lane rows (empty lanes are hidden while filtering), then `<p>` "No work items match the current filters." under the table.
9. All user text (project, sprint, titles, lane labels, names) goes through `escapeHtml` (`& < > " '`). Case D in the preview is the QA fixture.

**Plain-text flavor** (shown under each case): heading lines; per lane (when grouped) `Label (N work items)`; per status `Status (count)` then `- KEY Title (Type, Priority, Assignee)` lines or `None`. Note for the developer: in grouped mode the mockup prints the count per lane under each status; the header-row count in the HTML is the board-wide total. Both are consistent with the spec; tell the owner if the plain text should print the board-wide count instead.

## Notes and questions for the owner

1. **Outlook caution.** Outlook (Word renderer) honours `bgcolor`, td padding and borders, and card `div` padding and borders, but ignores margins on tables. Cards are `div`s, not nested tables, to keep the HTML small; the 6px gap between cards relies on div margin, which Word honours. If it renders tight in Outlook on the owner's check, switch cards to nested one-cell tables with a spacer row. No change to the UI contract.
2. **Why the lane row is navy.** It is the only strong block in the table, so the lanes read as groups at a glance; white on `#154973` is above AA. If the owner prefers quieter output, use `#e5eded` with teal text and the headers lose their distinction; not recommended.
3. Spec open questions 1 and 2 (links on keys, epic key and estimate on cards) are answered as the spec defaults: no. The cell width at six statuses is about 16% of the email, which is why.
4. No conflict found between the design and the acceptance criteria.
