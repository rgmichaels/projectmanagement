# Time tracking and estimates: design

Spec: `docs/specs/time-tracking.md` ("AC n"). Open the `.html` files straight from disk (no network, no scripts; each inlines a copy of `public/css/app.css` plus `src/time.css`, the new CSS to append to `public/css/app.css`). Today in the mockups is 2026-10-28, the signed-in user is Dana Lee. Topbar A and Sprints A (the chosen designs) are used throughout.

Files:
- `a-time-tab.html` (recommended), `b-summary-strip.html`, `c-time-section.html`: the work item dialog (Time tab, Estimate field, create form, tab-bar fit).
- `sprint-figure.html`: the figure on the Board bar, Sprints summary line and Backlog sprint headers.
- `backlog-estimate.html`: the Backlog Estimate column and inline edit.
- `sprints-table.html`: the Sprints table with Estimate and Logged.

## Options (dialog)

**A. Time tab (recommended).** One new tab "Time" after Links and before Test Cases. It holds the summary (Estimate, Logged, Balance, progress bar), the Log time form and the entries list. The Estimate input sits in the Properties grid right of Sprint. This is exactly what the owner asked for and the spec describes; the dialog gets no extra height.

**B. Summary strip plus tab.** Same Estimate field and tab, but the summary is a one-line strip under Properties, visible on every tab, and the tab holds only the form and list. Good if people want estimate versus logged always in view; costs about 36px of height and shows the estimate twice (input and strip).

**C. Time section, no tab (fallback only).** A collapsible "Time" section between Properties and Description with the figure in its summary line. Only needed if the owner refuses to touch the tab bar; it pushes Description and the tabs down and departs from "another tab" and AC 22.

**Recommendation: A**, with the tab-bar fix below. The Backlog column, sprint figure and Sprints table have no real alternative except one rejected cell style (shown, `backlog-estimate.html` frame 4).

## Is there room for a seventh tab? Answer for the owner

Short answer: not without a small fix, but there are never seven tabs on one item. An epic has no Time tab, so the maximum is six (Children, Discussion, History, Links, Test Cases, Attachments for an epic; Discussion, History, Links, Time, Test Cases, Attachments for any other item), the same six as today.

Measured in headless Edge, dialog 660px (597px of tab space), fallback font: with typical counts the tab bar needs 639px for a work item once Time is added (653px for an epic today), so it already scrolls sideways (the existing `overflow-x: auto`) and Attachments is cut off. Proposed fix (`.tabs.tight` in `time.css`): tab padding 7px and badge margin 4px. That gives 597px for typical counts (fits, no spare) and 611px for the worst realistic counts (99, 128, 12, 120.5, 14, 10), which scrolls by 14px. Real width depends on the installed font (Proxima Nova is not available here), so keep the scroll as the safety net and call `scrollIntoView({ inline: 'nearest' })` on the selected tab. Also add `overflow-y: hidden` to `.tabs` (in `time.css`): the -1px tab margin otherwise draws a vertical scrollbar. More room if wanted: widen the dialog 660px to 720px. Last resort: option C.

## UI contract (developer builds, QA checks)

### Dialog: Estimate field (all options)
- In `.props`, right after the Sprint field: `div.est-field` with `<label for>` "Estimate", `input type="number" step="0.25" min="0.25" max="1000" placeholder="Hours"` (name `estimate_hours`) and the unit "h" (`aria-hidden`). Saved with the item's Save button; dirty-tracked like any field (AC 28, 41). Server message in `p.error[role=alert]` under the input; input gets `aria-invalid="true"` and `aria-describedby`.
- Viewer or archived: no input; `p.est-ro` shows `8 h` or italic "Not estimated" (AC 44), labelled by the "Estimate" text.
- Epic: the whole field is removed (Sprint keeps its "Not applicable" line). Switching Type to an epic removes it; switching back shows it empty.
- Create form: same field for non-epic types, empty by default.
- Properties is a two-column grid, not a side column: Estimate is the cell beside Sprint. Resolution, when shown, moves to the next row.

### Dialog: Time tab (A)
- Tab button `role="tab"` `id="tab-time"`, label `Time`, count `span.n` showing logged hours (`6.5`, no badge at 0, never the estimate), `aria-controls` its `role="tabpanel"`. Hidden for epics.
- Panel order: summary, `Log time` form, `Entries` list.
- Summary `.time-sum`: three labelled values. With an estimate: Estimate `8 h`; Logged `6.5 h`; Balance `1.5 h remaining`, or `▲ 2.5 h over` (triangle, the word "over", danger text, 6px danger left edge), or `0 h remaining` when equal. Under it a `role="progressbar"` (capped at 100%) and the text `81% of estimate logged` (` (over)` appended when over). No estimate: Estimate cell reads `No estimate`, Logged reads `3 h logged` (or `0 h logged`), no Balance cell and no bar (AC 45, 47).
- Log time `div.time-form role="group"` (not a nested `<form>`; the dialog is already a form): heading "Log time"; Hours (`step 0.25 min 0.25 max 24`, placeholder "e.g. 1.5"), Date (`type=date`, `max` today, default today), "Note (optional)" (single line, `maxlength 500`), navy button "Log time" (`type="button"`); hint "Quarter hours from 0.25 to 24. The date cannot be in the future. Notes up to 500 characters."; server errors in `p.error[role=alert]` with `aria-invalid` on the field at fault. After success Hours and Note clear. Hidden for Viewer, archived project and epic.
- Entries: heading "Entries" plus a hint "3 entries, 6.5 h"; newest work date first. Row: name (bold), hours `2.5 h` (bold), date `YYYY-MM-DD` (mono), `logged <timeFormat.timestamp>`, `edited <timestamp>` pill when updated, note below (text, `pre-wrap`, wraps). Own entries only: `Edit` and `Delete` link buttons (any group). Edit turns the row into a form on pale teal (Hours, Date, Note, navy `Save`, plain `Cancel`). Delete: native `confirm("Delete this time entry? This cannot be undone.")`.
- States: empty "No time logged yet."; loading "Loading time entries..." (`role="status"`; the summary shows at once from item data); load error box with bold "Could not load time entries.", message and `Retry`; Viewer and archived: summary and list only, with the existing banners.

### Sprint figure (all pages, `sprint-figure.html`)
- Tag `span.sprint-fig`, text from `timeFormat.sprintFigure`: `12 h logged / 20 h est.`; `37.5 h logged` when nothing is estimated; `0 h logged` never blank. Over: `24 h logged / 20 h est. (over)` with `.is-over`. Not over when equal.
- Board `#sprint-bar`: name, figure, state badge, dates, overdue badge, link right, goal; no `(n not estimated)`. Hidden with the bar when no sprint is active. Sprints summary line (after "N items, M done") and Backlog sprint headers (after the counts, before the actions): add the muted `(n not estimated)` only when estimated total is above 0. The Backlog panel and Epics have no figure. The tag never wraps internally; it drops to the next line as a unit. On the Backlog give it `role="status"` so a change after an estimate save is announced politely.

### Backlog (`backlog-estimate.html`)
- Every panel's list has a header strip (`.brows-head`, "Est. (h)", hidden under 600px) and each non-epic row ends with `span.brow-est` (76px) before the avatar: `input type="number" step="0.25" min="0.25" max="1000" placeholder="-"` with `aria-label="Estimate in hours for PM-41"`. Enter or blur saves (`PATCH` with `estimate_hours`), Escape restores, unchanged value sends nothing. Saving: input disabled with "Saving..." (`role="status"`); done: "✓ Saved". Invalid or failed: previous value restored, `p.brow-error[role=alert]` under the row with the server message (or "Could not save the estimate. Try again."), input `aria-invalid`. Typing must not start a row drag or open the dialog.
- Viewer or archived: right-aligned text (`8`, or a dash with hidden "Not estimated"). Epic rows: no cell (space kept so the avatar does not move).

### Sprints table (`sprints-table.html`)
- Two columns appended after Assignee: "Estimate" and "Logged", `th.num` right-aligned, sortable with the existing sort pattern (arrow, `aria-sort`, teal edge, sort line, announcement); unestimated items sort last in both directions. Cells show `8 h` / `0.5 h`; no estimate is a dash with hidden text "Not estimated"; Logged is `0 h` when none. Table gets `with-time` (min-width 880px; `.table-wrap` scrolls). No edit controls.

## States to acceptance criteria

| State | Where | AC |
|---|---|---|
| Time tab loaded / empty / over / equal / no estimate | a-time-tab frames 1 to 4 | 22, 23, 45, 47 |
| Inline edit, delete confirm, "edited" marker | a-time-tab 5, 1 | 6, 25, 32 |
| Form validation error | a-time-tab 6 | 2, 24 |
| Loading and load error | a-time-tab 7 | 10, 25 |
| Viewer, archived | a-time-tab 8, 9 | 8, 27, 44 |
| Epic (no tab, no field) | a-time-tab 10 | 26, 43 |
| Long and hostile text shown literally | a-time-tab 11 | 4, 25 |
| Estimate field states, create form | a-time-tab 12, 13 | 41 to 44, 48 |
| Tab bar fit | a-time-tab 14 | 22 |
| Figure variants, narrow, Sprints, Backlog | sprint-figure 1 to 6 | 16 to 20, 53 |
| Backlog column states, read-only, narrow | backlog-estimate 1 to 5 | 52, 54 |
| Sprints table, sorted, narrow, read-only | sprints-table 1 to 4 | 55, 56 |

Not drawn: the progress of a sprint figure when the project has no active sprint (the bar is hidden as today), the empty, loading and error states of the Sprints and Backlog pages (unchanged), the native delete confirm.

## Questions for the owner

1. Option A (Time tab, recommended), B (always-visible strip) or C (section)?
2. Tab fix: tighten the tabs (recommended) or widen the dialog to 720px?
3. Epic Estimate: I removed the field entirely; AC 43 says "same not applicable treatment as Sprint". Do you want a second "Not applicable (epics have no estimate)" line instead?
4. The spec calls the Properties area a "side column"; it is a two-column grid, so Estimate sits beside Sprint rather than under it. Acceptable?
5. I added the muted note "(n not estimated)" inside the figure tag and a progress bar with percentage text in the summary (spec allows both). Keep?
6. Not in the spec, proposed: the Backlog "Saved" tick and the Escape-to-undo behaviour.

## What I could not verify

Rendered in headless Edge on Windows only; viewed frames of all files except option B and C, the narrow frame of the dialog files and the second half of `a-time-tab.html` closely. Tab-bar widths depend on the system font (Proxima Nova is not installed). Contrast was reasoned from the existing token ratios, not measured with a tool. Native `confirm()`, date inputs and number spinners look different per browser.
