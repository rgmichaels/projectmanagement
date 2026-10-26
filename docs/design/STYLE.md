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
