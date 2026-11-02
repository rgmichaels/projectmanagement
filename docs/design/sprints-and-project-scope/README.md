# Project dropdown and Sprints screen: design options

Specs: `docs/specs/global-project-scope.md` ("Scope AC n") and `docs/specs/sprints-screen.md` ("Sprints AC n"). Open the `.html` files straight from disk (no network, no scripts; each file inlines a copy of `public/css/app.css` plus the new block). Open dropdown lists are drawn; the real list is the operating system's. Focus is drawn with `.is-focus`. The narrow frames are a 380px box that applies the narrow rules by hand; the real rule is one `@media (max-width: 600px)` block.

Files:
- `topbar-a-light-field.html`, `topbar-b-outlined.html`, `topbar-c-merged-nav.html`: the project dropdown, 12 frames each, same frame numbers.
- `sprints-a-panel.html`, `sprints-b-summary-card.html`, `sprints-c-compact.html`: the Sprints page, 18 frames each, same frame numbers. The topbar in them is topbar A; any topbar option combines with any Sprints option.
- `states.html`: what is identical everywhere (sort header states, row details, the two confirms).

## Topbar options (project dropdown)

**A. Light field with visible label (recommended).** A white native select with a small visible "Project" label sits right of the brand. Sub-navigation stays in the page as today. White field on teal gives the highest contrast, needs no custom arrow, and the open list looks right on every browser. Smallest build.

**B. Outlined, no label.** Transparent select with a white outline, own chevron, a thin divider after the brand, name given by `aria-label` only. It blends into the bar better, but needs `appearance: none`, a data-URI chevron and an `option { color: #000; background: #fff }` rule, and the open list differs between browsers (not verified, see below).

**C. Dropdown and project nav in one bar.** Board / Backlog / Sprints links move into the teal bar next to the dropdown, and the page loses its `.subnav` row (saves about 45px of height). The spec describes the sub-navigation as its own row (Sprints AC 1, 2), and `.subnav` is built on two pages, so this needs the owner's yes and is the most work.

## Sprints options (sprint dropdown, summary, table)

**A. One panel (recommended).** The sprint dropdown, state badge, dates and "N items, M done" live in the pale teal header of one white panel, exactly the Backlog's sprint header (`.sprint`, `.sprint-head`; `.is-active` gives the teal top edge, `.is-completed` the page colour). Goal, the fallback note and the sort line sit inside the panel, the table below them. It reuses the most existing CSS and makes the Sprints page look like a Backlog page with one sprint.

**B. Summary card above a separate table.** The dropdown and summary sit in the existing `.sprint-bar` card (white, teal left edge, as above the Board); the table is its own bordered card. Clear separation, a little more vertical space, two boxes.

**C. Compact toolbar.** The dropdown sits on the title row beside "Sprints"; the summary is plain text under it; the table is denser (5px row padding). Smallest footprint, but the sprint state badge and summary have no container, so on a Completed sprint the page looks less different from an Active one.

## Recommendation

Topbar A with Sprints A. They reuse the most existing components (`.topbar`, `.sprint`, `.sprint-head`, `.badge`), carry the least new CSS, have the best contrast, and keep the sub-navigation where it is. Take Sprints B if the owner wants the summary visually separate; take topbar C only if vertical space matters more than a small spec deviation.

## UI contract (what the developer builds and QA checks)

New CSS is the block "Project dropdown", "Sprint dropdown + summary" and "Sortable table" in the `<style>` of each file (shared by all options; per-option extras are `.outlined`/`.sep` for topbar B, `.has-nav`/`.topnav` for C). Copy the shared block and the chosen options' rules to `public/css/app.css`; drop the mock-only rules (`.is-focus` stand-ins, `.fake-list`, `.narrow`, `.dim`, `.mini-detail`, `.anno`).

### Project dropdown (all options)
- `<select id="project-select" class="project-select">` inside `div.project-scope` in `.topbar`, right of `a.brand`, before `.session`. Accessible name "Project": visible `<label for>` in A; `aria-label="Project"` in B and C. `type`-less; no custom widget.
- Option text `KEY - name` as text. Selected = current project. Archived by URL: extra last option `KEY - name (archived)`, selected, plus the existing Archived badge in the toolbar.
- Width: `min-width 200px`, `max-width 340px`, ellipsis. Narrow (max-width 600px): `.topbar { flex-wrap: wrap }`, `.project-scope { order: 3; flex: 1 1 100%; margin-left: 0 }`, select `flex: 1; max-width: none`.
- Focus: gold 2px ring (existing `.topbar :focus-visible`). Never shown on Projects, Users or sign-in.
- Sub-navigation: Board, Backlog, Sprints in that order, current has `aria-current="page"`, links carry `?project=<id>`. Not rendered in the "No active projects." and "Project not found." states (no project to carry).
- States: "No active projects." in `.empty` with a link "Go to the Projects page" and no dropdown; "Project not found." in `.empty` with `role="alert"` and the same link, dropdown listing projects with a disabled, hidden placeholder option "Choose a project" selected; list request failed shows the current project only and the existing `.message` text "Could not load the project list. Showing the current project only." (wording is the designer's).

### Sprints page
- Order: topbar, `.subnav`, toolbar (`<h1>Sprints</h1>`, Archived badge when archived, link "Manage sprints on the Backlog" to `backlog.html?project=<id>` pushed right), optional `.notice role="status"`, then the option's sprint header and the table.
- Sprint dropdown: `label "Sprint"` + native select, options `name (state)` in server order, no Backlog entry. No sprints: select disabled showing "No sprints", table hidden, message "This project has no sprints yet." with a link to the Backlog.
- Fallback note under the dropdown, `role="status"`: "No sprint is active; showing the next planned sprint." / "No sprint is active and none is planned; showing the most recently completed sprint." Bad `?sprint=`: `.notice` "Sprint not found; showing <name> instead.".
- Summary: state badge, dates (`datesText`), "N items, M done", overdue badge "Overdue - ended X ago" (existing `.badge.overdue`), goal line "Goal: ..." (`.sprint-goal`).
- Sort line above the table: "Sprint order", or "Sorted by <Column>, <direction>" with link-button "Reset sort" (only while sorted). Separate visually hidden `<p role="status">` is the live region: "Sorted by <Column>, ascending."
- Table `table.sprint-table` inside `.table-wrap` (`overflow-x: auto`, table `min-width: 720px`): columns Key, Title, Type, Epic, Priority, Status, Assignee. `<th scope="col" aria-sort="none|ascending|descending">` with `button.sort` (text, `span.arrow[aria-hidden]` U+2195 / U+25B2 / U+25BC, and `span.visually-hidden` " sorted ascending|descending" only when sorted). Sorted header also gets a 3px teal bottom edge. Focus is an inset 2px ring and stays on the button after sorting.
- Cells: Key `button.key-btn` and Title `button.title-btn` (both open the dialog); Type `.type-badge`; Epic `button.epic-chip` with the epic key, `title` and `aria-label="Epic <key>: <title>"`, or "-" (hidden text "No epic"); Priority `.priority`; Status `.status-pill` (`.is-done` check mark); Assignee avatar plus name, or grey "?" avatar plus "Unassigned". No handles, checkboxes, quick create or sprint actions.
- States: loading `<p class="hist-loading" role="status">Loading...</p>`; empty sprint `.brows-empty` "No work items in this sprint." (table head hidden); error `.banner-warn role="alert"` with bold "Could not load work items.", message, Retry button. Archived and Viewer: the same page; archived adds the Archived badge.

### Confirms (same shell as Delete sprint: `dialog.app-dialog`, `.band`, `.dialog-body`, `.dialog-foot`)
- Switch project: heading "Switch project?", body "You have unsaved changes to this work item. Switch project and discard them?", buttons "Cancel" (focused) and `.danger` "Discard and switch". Cancel resets the dropdown.
- Close guard: heading "Discard changes?", body "Your unsaved changes to this work item will be lost.", buttons "Cancel" (focused) and `.danger` "Discard changes". Used for X, Close, Escape and re-pointing via a chip. Cancel keeps all edits; focus returns to the closing control (title field for Escape).
- If the developer uses native `window.confirm` (the specs allow it), use the single strings in the specs; the two dialogs above are the recommended look and need one small shared promise-returning helper (the specs ask for one shared confirm helper either way). Both confirms contain only fixed text.

## State to acceptance criteria

Topbar files (T) and Sprints files (S); `states.html` (X).

| State | Frame | Scope AC | Sprints AC |
|---|---|---|---|
| Dropdown closed on Board | T1 | 1, 3, 4, 13 | 1 |
| Dropdown keyboard-focused | T2 | 5 | |
| Dropdown open, live projects only | T3 | 3, 5 | |
| Archived by URL, extra "(archived)" option | T4, T5 | 3a, 19 | 25 |
| No active projects | T6 | 9c | |
| Project not found | T7 | 10 | |
| Project list failed | T8 | 6 | |
| Long and hostile project names | T9 | 3 | |
| Narrow window | T10 | 1 | |
| Viewer sees dropdown | T11 | 6 | |
| Projects, Users, sign-in without dropdown | T12 | 16, 17, 18 | |
| Active sprint default, sprint order, all `aria-sort="none"` | S1 | 13 | 1-4, 8-11, 17 |
| Sorted ascending (Priority), announcement, Reset sort | S2, X1 | | 16, 18-21, 23 |
| Sorted descending (Assignee), Unassigned last | S3 | | 18-21 |
| Key numeric order | S4 | | 19 |
| Sprint dropdown open, every state incl. Completed | S5 | | 3 |
| Sprint dropdown focused | S6 | | 3 |
| Planned fallback with note | S7 | | 4 |
| Completed fallback with note | S8 | | 4 |
| Bad `?sprint=` message | S9 | 12 | 6, 7 |
| Empty sprint | S10 | | 13 |
| No sprints at all | S11 | | 4 |
| Loading, load error and Retry | S12, S13 | | 13 |
| Overdue Active sprint | S14 | | 8 |
| Long and hostile text | S15 | | 3, 8, 12 |
| Narrow window | S16 | | 12 (layout) |
| Archived project | S17 | 3a, 19 | 25 |
| Viewer | S18 | | 24 |
| Row hover, done check, epic chip, unassigned, no epic, no write controls | X2 | | 10, 11, 14, 15 |
| Switch project confirm | X3 | 14, 14a, 14b | |
| Discard changes confirm (X, Close, Escape, re-point) | X4 | 14c-14f | (7 of Decisions) |

Not drawn because nothing changes visually: URL writes (`replaceState`, `pushState`), `localStorage` (Scope AC 7, 8, 11, 15, 20), sub-navigation link targets, `beforeunload` (browser wording), sort resetting on sprint change (Sprints AC 22), client-side-only sorting (AC 23), source rules and pure functions (AC 26, 27), the dialog's read-only Sprint field in a Completed sprint (existing).

## Questions for the owner

1. Which topbar option and which Sprints option? (Recommended: topbar A, Sprints A.)
2. Wording the specs leave open and the designer proposed: the Completed-fallback note, the "Choose a project" placeholder in "Project not found", the "Could not load the project list..." message, and the confirm button labels "Discard and switch" and "Discard changes" (specs say only OK and Cancel). Confirm or change.
3. Topbar C moves the sub-navigation into the bar, which departs from Sprints AC 2's order (topbar, then sub-navigation). Only pick C if that is acceptable.
4. In the "No active projects." and "Project not found." states I draw no sub-navigation, since its links would carry no project. The specs do not say; confirm.
5. Scope AC 14b says the dropdown is inert while the dialog is open, so the Switch project confirm is rarely reachable. It is designed anyway as the spec requires; say if you would rather drop it.

## What I could not verify

I rendered the files in headless Edge on Windows and looked at topbar C, Sprints A (frames 1 to 6) and `states.html`. Not checked by eye: Sprints B and C and topbar B past what the shared CSS implies, the narrow frames of every file, and the real operating-system select list (drawn as an approximation; styled `option` colours in topbar B vary by browser and operating system). Contrast was reasoned from the existing token ratios (white and `#cfe3e5` on `--teal`, `--muted` on white) and not measured with a tool. The mockup narrow frames simulate the media query by hand, so the real `@media` rule is untested.
