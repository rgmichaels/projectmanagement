# Style guide

Part 1 records what `public/css/app.css` already does. Part 2 lists only the new tokens and components the recommended work item dialog (task-modal-v2, option A) needs.

## 1. Current styles (as built)

**Palette (`:root` variables).** `--bg #f4f5f7` page, `--surface #fff`, `--column #ebecf0` (board columns, badges), `--border #dfe1e6`, `--text #172b4d`, `--muted #5e6c84`, `--primary #0052cc` (topbar, primary button, links, tabs), `--danger #de350b`, `--neutral #8993a4` (fallback type and unassigned colour). Other fixed colours: epic chip `#eae6ff` / `#403294` (hover `#c0b6f2`), archived badge `#fff0b3`, notice `#deebff` with `#4c9aff` border, error message `#ffebe6`, progress fill `#36b37e`. Type colours come from the server (`server/types.js`): Defect `#e5493a`, Task `#4bade8`, Issue `#f5a623`, Epic `#904ee2`.

**Type.** System stack `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`, 14px base. h1 20px, h2 16px, section h3 14px, labels 12px muted, hints 12px, badges 11px uppercase 600, card meta 12px.

**Spacing and shape.** Page padding 20px; panels 16px padding, 4px radius, 1px `--border`; controls 6px 8px padding, 3px radius; form rows are flex with 12px gap; dialog 560px wide (95vw max), 20px padding, 4px radius, shadow `0 8px 24px rgba(9,30,66,.3)`. Sections in the dialog are separated by a 1px top border with 10px padding.

**Components.**
- Buttons: white with 1px border, 3px radius, 6px 12px; `.primary` filled blue, `.danger` red text, `.link` blue text-only 12px. Hidden state via `[hidden]`.
- Fields: stacked `label` (12px muted) above the input or select.
- Badges: `.badge`, `.badge.archived`; `.type-badge` (coloured), `.resolution-label`, `.priority` (outlined), `.avatar` (24px circle, initials), `.epic-chip`.
- Card: white, 4px left border in the type colour, light shadow.
- Dialog sections: Discussion (thread, composer), tabs (`.tabs` / `.tab`, active = blue with 2px underline), History list, Links, Attachments, Epic view (progress bar 8px), image strip.
- Messages: `.error` red line with `role="alert"`; `.message` red box; `.notice` blue box; `.empty` dashed box; `.hint` / `.thread-empty` muted lines.
- Read-only: controls `disabled`; Add/Remove/Post buttons hidden; archived shown with an Archived badge.
- Focus: browser default only. No custom ring.

## 2. New in task-modal-v2 (recommended option A)

**Scope.** The palette below comes from the owner's reference site (palette and feel only: no logo, seal, branding, wording or layout; the app must not look like an official site). It is dialog-scoped: add the tokens under a `dialog` or `.detail` selector, not `:root`, until the owner decides to apply it app-wide (open question 6).

**New tokens.** `--teal #0b5d66` (band, headings, primary button, selected tab, progress, current step), `--teal-mid #65999e` (borders and hover only), `--teal-soft #e5eded` (rail, finished steps, read-only fields, banner), `--page #f8fafa` (dialog background), `--navy #154973` (input borders, action and secondary buttons), `--linkblue #004dd1` (inline links), `--gold #face00` (only on dark teal), `--ink #000`, `--muted #62666a`, `--line #d0d0ce`, `--line2 #e4e4e4`, `--danger #c0300b` (dialog text; the app's `#de350b` is 4.34:1 on `#f8fafa`), `--mono ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Font stack for the dialog: `"Proxima Nova", "Helvetica Neue", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (the brand fonts are licensed; they apply only if installed). Headings, labels, tabs, buttons and the title are weight 700, body 400. Sizes are unchanged.

**New components.**
- Top band (`.band`): dark teal, white bold title (20 to 22px), key chip and epic link; gold 2px focus ring inside it.
- Key chip (`.keychip`): white, black mono 12px/600, type-coloured dot.
- Epic link in the band (`.epicchip`): gold, uppercase, bold 12px, underlined, trailing arrow.
- Status track (`fieldset.track > .steps > label.step`): equal steps, radio inside, `.past` pale teal, `.now` solid teal with white text and a dot, `.locked` when read-only. Use for Status only.
- Dark summary panel (`.darkpanel`): teal, 16px radius, 1px mid-teal border, bold white heading, gold progress fill. Use for the epic progress summary only.
- Details rail (`aside.rail`): 260px, pale teal, left border, label/select stacks, collapsed `details.acc` cards with a count pill.
- Count pill (`.n`): 11px, `--line2` background, black text.
- Navy button (`button.navy`): navy fill, white bold text; for Post, Add, Add link, Add files. Secondary buttons are white with a navy border and navy text; Save is `.primary` deep teal.
- Read-only banner (`.banner`): pale teal, mid-teal border, `role="status"`. Read-only fields keep black text on pale teal.
- Focus ring: `:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px }` (gold on the band).

**Contrast.** Every text/background pair was checked against WCAG AA; the list is in `docs/design/task-modal-v2/README.md`.

**Do.** Use gold only on dark teal. Use `#65999e` only for borders and hover. Use link blue only for inline links. Show counts on every secondary section. Write empty states that say what to do. Insert user text with `textContent`.

**Don't.** Don't use gold or `#65999e` as text on light backgrounds. Don't tint the dialog by type. Don't add a logo, seal, nav bar or official-site wording. Don't use external fonts or icons.

## 3. App-wide restyle (app-restyle, recommended option A)

Supersedes the "dialog-scoped" note in part 2 once the owner approves. Details and per-screen contract: `docs/design/app-restyle/README.md`.

**Tokens.** Part 2 tokens move from `dialog#detail` to `:root`. Legacy variables are re-pointed: `--bg` = `--page`, `--column` = `--teal-soft`, `--border` = `--line`, `--text` = `--ink`, `--primary` = `--teal`, `--neutral` = `#62666a`. `--primary #0052cc` and `--danger #de350b` are retired.

**New or changed components.**
- Top bar (A): `--teal` background, white bold brand, outlined white Sign out, gold focus ring. (B: white with 3px teal bottom border.)
- Table header: `--teal-soft` background, teal bold 12px text, `--teal-mid` bottom rule.
- Board column: `--teal-soft`, radius 8 (B: white bordered). Column header: teal uppercase bold.
- Filter bar: white card, `--line` border, radius 8.
- Type badge: white chip, black text, type-colour dot (contrast fix). Badge: pill with `--teal-soft` fill.
- Sign-in card (A): title band in teal like the dialog.
- `button.navy` and the focus ring become global.

**Do.** Keep the type colour on the card's left edge. **Don't.** Don't put white text on type colours; don't reintroduce `#0052cc`.

## 4. Sprints and backlog (sprints-and-backlog, recommended option A)

Full contract: `docs/design/sprints-and-backlog/README.md`. The CSS is `docs/design/sprints-and-backlog/src/sprints.css` (append to `public/css/app.css`). No new colours or tokens; only existing ones.

**New components.**
- Sub-navigation (`.subnav`): Board and Backlog links, current one `aria-current="page"` with a 3px teal underline. First element in `<main>` of the board and backlog pages.
- Sprint panel (`.sprint`, `.is-active` adds a 4px teal top border, `.is-completed` uses the page colour): pale-teal header (`.sprint-head`) with toggle, name (`.sprint-name`), state badge, dates and counts (`.sprint-meta`), actions (`.sprint-actions`). Collapsible extras use `details.sprint > summary.sprint-head`.
- State badges: `.badge.state-active` (teal fill, white text), planned (default pale teal), `.badge.state-completed` (outlined grey), `.badge.overdue` (white, danger border and text, with a warning sign and the word Overdue).
- Backlog row (`.brow`): handle, type chip, key, title button (`.brow-title`), epic chip, priority, status pill (`.status-pill`, `.is-done` adds a check mark), avatar. List `.brows`; `.brows.drop-target` (dashed navy outline) for an empty or hovered container; the existing `.drop-indicator` marks the drop position; `.brows-empty` for empty states.
- Quick create (`.quick`): a row on `--page` at the bottom of a list, input plus navy Create, inline `.error`.
- Warning banner (`.banner-warn`): white, danger border with a 6px left edge, bold danger "Overdue" word plus text; `role="status"`. Also used for a recoverable load error (`role="alert"`) with a Retry button.
- Sprint bar (`.sprint-bar`): white card with a 4px teal left edge above the board toolbar (name, state, dates, link, goal).
- Complete dialog choices (`.choices`, `.choice`, `.choice-body`, `.choice-label`): radio cards; selected = 2px teal border and pale fill (the radio is also visible); disabled = page colour with a hint.
- Sprint history list (`.hist-list`, `.hist-item`, `.hist-text`, `.hist-time`, `.hist-changes`).
- Option B only (not built unless chosen): `.split` two-pane grid and `.sprint-tabs`.

**Do.** Always write the state as a word (Active, Planned, Completed, Overdue) and mark done with a check mark; hide write controls for Viewers and archived projects; insert sprint names, goals, titles and actor names as text.
**Don't.** Don't use colour alone for overdue or done; don't draw epics as cards or rows in sprints; don't use gold or `--teal-mid` as text.

## 5. Backlog bulk move (backlog-bulk-move, option A recommended)

Full contract and the CSS: `docs/design/backlog-bulk-move/README.md` and the "Backlog bulk move" block in `a-header-actions.html`. No new tokens.

**New components.**
- Row checkbox (`label.brow-select > input`): first item of a Backlog row, 18px box in a 30px hit area, teal accent. Backlog rows only.
- Selected row (`.brow.is-selected`): pale teal fill, 3px teal left edge and the ticked box.
- Selection count (`.sel-count`, `role="status"`): bold teal 13px, empty when nothing is selected.
- Bulk control (`.bulk`): "Move to" label, select ("Choose a sprint"), navy Move button; sits in `.sprint-actions` of the Backlog header.
- Bulk result (`.bulk-result`): holds an existing `.notice` (success) or `.banner-warn` (failure, with `.fail-list`) inside the panel under the header.
- Option B only: `.sel-strip` (dark teal strip in a sticky header). Option C only: `.hide-check` (checkbox revealed on hover or focus).

**Do.** Show selection with fill, edge and tick together; keep Cancel focused in the confirm dialog; insert names, titles and server messages as text. **Don't.** Don't add a select-all checkbox; don't draw checkboxes on sprint rows or Epics; don't rely on colour alone for success or failure.

## 6. Project dropdown and Sprints screen (sprints-and-project-scope, topbar A + Sprints A recommended)

Full contract and CSS: `docs/design/sprints-and-project-scope/README.md` and the shared `<style>` block in its files. No new colours or tokens.

**New components.**
- Project dropdown (`.project-scope > label + select.project-select`): white native select in the teal top bar, small pale label "Project", bold 13px, 200 to 340px wide, ellipsis. Gold focus ring (existing). Topbar B only: `.outlined` (transparent, chevron), `.sep`. Topbar C only: `.has-nav`, `.topnav`.
- Sprint picker (`.sprint-pick`): "Sprint" label plus native select, bold; disabled = pale teal. `.sprint-why` is the one-line "why this sprint" note (muted 12px, `role="status"`).
- Sortable table (`table.sprint-table` in `.table-wrap`): header like `table.projects`; each `th` holds `button.sort` with an arrow glyph; `th[aria-sort="ascending|descending"]` adds a 3px teal bottom edge and a teal arrow. `.sort-line` shows "Sprint order" or "Sorted by X, direction" plus a "Reset sort" link button. `.key-btn` and `.title-btn` are the text-only row buttons.
- Table wrapper `.table-wrap` scrolls sideways on narrow screens (table min-width 720px).

**Do.** Show sort as arrow plus `aria-sort` plus the word in the sort line; keep Cancel focused in confirms; insert project, sprint and item text as text. **Don't.** Don't colour-only the sorted column; don't add write controls to the Sprints table; don't list archived projects in the dropdown.

## 7. Time tracking and estimates (time-tracking, option A recommended)

Full contract and CSS: `docs/design/time-tracking/README.md` and `docs/design/time-tracking/src/time.css` (append to `public/css/app.css`). No new colours or tokens.

**New components.**
- Sprint figure (`.sprint-fig`): bordered white 13px bold tag, `--teal-mid` border; `.fig-note` muted for "(n not estimated)"; `.is-over` turns border and text `--danger` and carries the word "(over)". Used on the Board sprint bar, the Sprints summary line and Backlog sprint headers.
- Estimate field (`.est-field` in the dialog's `.props` grid, right of Sprint): label, number input (max 120px) and an "h" unit; read-only `.est-ro` looks like a disabled field.
- Time summary (`.time-sum`, `dl` of Estimate, Logged, Balance; `.is-over` adds a 6px danger left edge; `.time-bar` is an 8-10px progress bar with a visible "n% of estimate logged" text).
- Log time form (`.time-form`, grid Hours, Date, Note, navy button) and entries list (`.time-list`, `.time-item`, `.time-edited` marker, `.is-editing` inline edit on pale teal).
- Backlog Estimate column: `.brows-head` header strip "Est. (h)" and `.brow-est` 76px cell with a right-aligned number input, `.est-state` ("Saving...", "Saved"), `.brow-error` under the row.
- Sprints table: `th.num` / `td.num` right-aligned Estimate and Logged columns, `table.with-time` min-width 880px.
- Tab bar `.tabs.tight`: 7px tab padding, no gap, so six tabs fit the 660px dialog. Option B only: `.time-strip`. Option C only: `details.time-sec`.

**Do.** Write over-estimate as words and a triangle, never colour alone; label every number with its unit "h"; show a dash (with hidden text) for no estimate; set names, notes and server messages as text. **Don't.** Don't warn with pop-ups when logged exceeds the estimate; don't show per-item time on cards; don't give epics a Time tab or Estimate field.

## 8. New project from the dropdown (new-project-from-dropdown)

Contract: `docs/design/new-project-from-dropdown/README.md`. No new tokens or components. It reuses `.project-scope` / `select.project-select` (top bar A) and `dialog.app-dialog` (band, `.dialog-body`, `.dialog-foot` with `p.error[role="alert"]`, `button.primary`). Only addition: a narrow-width rule for the dialog (14px side padding below 600px).

**Do.** Keep the separator as a disabled text option and the entry as a plain option; show server errors as text in the foot. **Don't.** Don't build a custom dropdown for the entry; don't add a key chip or extra fields to the dialog.

## 9. User admin (user-admin, option A recommended)

Contract: `docs/design/user-admin/README.md`. CSS: `docs/design/user-admin/src/user-admin.css` (append to `public/css/app.css`). No new tokens. Reuses `.panel`, `.form-row`, `.notice`, `.error`, `table.projects`, `.badge.archived` (for Deactivated), `dialog.app-dialog`.

**New components.**
- `.sr-only`: visually hidden text for tick/dash cells and the table's Actions header.
- Add user panel (`.panel.add-user`): one form row (Name, Username, narrow Group, primary Add), hint and error line beneath; `input[aria-invalid="true"]` gets a 2px danger border.
- List tools (`.list-tools`): count text plus "Show deactivated users" toggle above the table.
- Users table states: `tr.is-inactive` (muted on page colour), `tr.is-editing` (white, 3px teal left edge, inputs), `tr.row-error` (red message row under the edited row), `.row-hint` (visible reason under a disabled button), `.you` marker.
- Permission matrix (`table.projects.matrix`): row header = permission label, one column per group; cell = teal tick or muted dash, each with hidden "Allowed" / "Not allowed".
- Narrow (below 700px): `table.users` rows stack as cards using `td[data-label]`.

**Do.** Say Deactivated and Active in words; give every disabled button a visible reason; insert names and server messages as text. **Don't.** Don't name groups in the client; don't offer delete; don't use colour alone in the matrix.

## 10. Sprint scope change (sprint-scope-change, option pending owner choice)

Contract: `docs/design/sprint-scope-change/README.md`. CSS: the "NEW" block of `docs/design/sprint-scope-change/src/scope.css` (append to `public/css/app.css`). No new tokens; there is no dark mode in this app, so none is designed. Reuses `.badge`, `.sprint`, `.banner-warn`, `.card-key`, `.hint`, `.visually-hidden`.

**New components (all options).**
- Added-after-start badge (`.badge.added-late`): white, navy border and text, sentence case, leading "+" (CSS). `.short` is the Board card form: visible "Added", `title` and hidden text "Added after start".
- Scope panel (`section.scope`): head with h3 and hint, figures, `.scope-lines` (Baseline, Adjusted in first 24h, final line), `.scope-note`, `.late-note` ("Baseline captured on <date>", pale teal with mid-teal border).
- Scope log (`details.scope-log`, `.log-list`, `.log-item`, `.log-hours`, `.log-meta`), `.grace-tag` (dashed outline: "adjusted in first 24h", "no estimate"), `.log-empty`.
- State messages: `.scope-msg` (Planned, not tracked, loading), error reuses `.banner-warn` with Retry inside `.scope-err`.
- Layout, chosen option only: A `.tiles` / `.tile` (`.is-total`, `.is-growth`); B `table.scope-table` (`.is-sum`, `.is-total`); C `.split-c` with `.scope-side` (`.side-growth`).

**Do.** Write signs, units ("h") and the words growth / shrink / n/a; keep Planned + net = Current visible; insert titles and actor names as text. **Don't.** Don't colour-only growth; don't add write controls; don't show a badge for grace-period adds; don't use a hover-only tooltip for the baseline explanation.

## 11. Export buttons (export, option A recommended)

Contract: `docs/design/export/README.md`. CSS: the NEW block of `docs/design/export/src/export.css` (append to `public/css/app.css`). No new tokens. Reuses `.notice`, `.banner-warn`, `.hint`, `button.link`.

**New components.**
- Export button (`button.export-btn`): secondary navy-outline, 30px high, 13px bold, label "Export"; hover = teal text and a second border line; busy = "Exporting..." with `aria-busy` and `aria-disabled` (keeps focus), min-width 104px. Option B only: `.icon-only` 32px square with inline SVG and a left-opening tooltip (`data-tip`).
- Placement slots: `.filter-export` (right end of the Board filter bar), last item of `.sprint-actions` (Backlog headers), last item of `.sprint-pick` (Sprints).
- `.export-why`: muted 12px reason beside a disabled button (only if disabled-when-empty is chosen).
- `.export-msg` (`.on-board` variant): holds a `.notice` (role="status", headers-only) or `.banner-warn` (role="alert", "Export failed.") with a Dismiss link, under the Board filter bar or under a panel header.

**Do.** Name the target in `aria-label` ("Export Sprint 4"); keep Export visible for Viewers and archived projects; set names and server text as text. **Don't.** Don't use `disabled` while busy (focus is lost); don't rely on a hover-only tooltip for meaning; don't show Export as a primary button.

## 12. Timeline (gantt-chart, single recommended design)

Contract: `docs/design/gantt-chart/README.md`. CSS: the "NEW: Timeline" block of `docs/design/gantt-chart/src/timeline.css` (append to `public/css/app.css`). No new tokens; reuses the epic chip purple (`#eae6ff` / `#403294`), `--danger` for the Today line, `.subnav`, `.badge`, `.banner`, `.banner-warn`, `.panel`, `.n` count pill.

**New components.**
- Zoom control (`.seg` of `button[aria-pressed]`): joined buttons, active = teal fill, white text.
- Chart (`.tl` scroll container, `.tl-head` sticky axis with `.ax` cells, `.tl-row` rows with sticky `.tl-label` and `.tl-track`, `.tl-grid` lines and weekend shading, `.tl-today` line and `.tl-flag`).
- Bars (`button.bar` with `.s-todo`, `.s-prog`, `.s-done` (muted, check mark), `.epic`, `.rollup` (striped, dashed), `.is-short` outside label; sprint bars `.sp-planned`, `.sp-active`, `.sp-completed`). Edit affordances: `.h.l`, `.h.r` handles, `.is-dragging`, `.bar-origin`, `.is-reverting`, `.tl-tip`, `.tl-dropcol`, `.tl.is-drop-target`, `.tl.is-readonly`.
- Unscheduled panel (`.unsched`, `.un-row` with `.grip`, `.un-empty`, `.epic-tag`).
- Dialog date fields: two `input[type=date]` in the existing `.props` grid.

**Do.** Pair every status colour with a word, check mark or pattern (Done = check, rollup = dashes, Today = label); set titles as text; show dates in the tooltip while dragging. **Don't.** Don't put white text on pale fills or type colours; don't make sprint bars or rollup bars draggable; don't add handles for read-only users.

## 13. Daily report (daily-report, single recommended design)

Contract: `docs/design/daily-report/README.md`. CSS: the "NEW: Daily report" block of `docs/design/daily-report/src/report.css` (append to `public/css/app.css`). No new tokens; reuses `.panel`, `.subnav`, `.badge.archived`, `.banner-warn`, `.n`, `.status-pill`, `.priority`, `.epic-chip`, `.hint`, `.empty`, `button.navy`.

**New components.**
- Controls panel (`form.panel.report-controls`): labels stacked above Person select and Date input, "Today" button beside Date, navy "Copy for email" right-aligned, `p.copy-status` line (`.ok` teal bold with a check mark, `role="status"`; `.fail` danger bold, `role="alert"`).
- Report panel (`article.panel.report`, 860px max): `p.report-title` (18px bold teal, not a heading), `section` with a top rule and `h2`, `.h-note` muted 12px note in the heading, `h3` navy sub-headings with a `.n` count.
- Rows (`ul.rows > li`): `.r-key` mono bold link, `.r-title` (wraps anywhere), `.r-meta` (pill, priority, remaining, assignee), `.r-sum` activity line on its own row.
- `.total-line` (pale teal strip, bold), `.empty-line` (dashed teal-mid box, plain text), `.sprint-line` (white, 4px teal left edge, bold).
- Copied email styles are inline only and independent of app.css (see the README).

**Do.** Write every empty section as a plain sentence; keep keys as links on screen and bold text in the email; insert all user text as text. **Don't.** Don't disable controls for Viewers or archived projects; don't add class names or a style block to the copied HTML; don't make the report title a heading.

## 14. Completed date (completed-date, single recommended design)

Contract: `docs/design/completed-date/README.md`. CSS: `docs/design/completed-date/src/completed.css` (append to `public/css/app.css`). No new tokens; text is `--muted`, fields reuse `--teal-soft` and the existing status pill.

**New components.**
- `.card-done` (Board card): a full-width last row of `.card-meta` (`order: 1`) holding the resolution label and `.completed`. Terminal-status cards only.
- `.completed` (12px muted, `white-space: nowrap`): `✓ Completed Nov 20`; `title` has the full local date, time and completer.
- `.completed-field` with `input.ro` (dialog): read-only text input styled like a disabled field, after Resolution, shown only for a saved terminal item.
- `.pill-date` (Backlog): ` · Nov 20` suffix inside `.status-pill.is-done`, regular weight.

**Date format.** `Nov 20`; `Nov 20, 2025` when not the current year; viewer's local time. Tooltip always has the year.

**Do.** Set dates and names as text; omit the row when there is no date; keep the tooltip detail non-essential. **Don't.** Don't add colour to the date; don't append it to the first meta row; don't make it a click target.

## 15. Copy board (copy-board-as-table, single recommended design)

Contract: `docs/design/copy-board-as-table/README.md`. CSS: the NEW block in `docs/design/copy-board-as-table/toolbar.html` (append to `public/css/app.css`). No new tokens; the pasted email uses only existing hex values inline.

**New components.**
- Copy board group (`div.copy-board`): inline-flex wrapper in the Board toolbar after Group by, holding `button.navy#copy-board` and `p.copy-status` (existing `.ok` and `.fail`, `role="status"` or `"alert"`); `.copy-board .copy-status` is auto width, not full width. Button hover is teal fill (this button only). Hidden with Group by when there is no active sprint.
- Email table (inline styles only, never app.css): header row `#e5eded` / `#0b5d66`, lane row `#154973` / white, cells `#f8fafa`, cards white with `#d0d0ce` border, meta line `#62666a` 12px.

**Do.** Keep the button enabled for Viewers and archived projects; escape all user text in the email; use `&nbsp;` in empty cells. **Don't.** Don't add classes, a style block, links, images or type colours to the copied HTML; don't disable the button while copying.
