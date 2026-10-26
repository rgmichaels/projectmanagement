# Backlog bulk move: design options

Spec: `docs/specs/backlog-bulk-move.md`. Open the `.html` files straight from disk (no network, no scripts, every state is drawn statically; hover and keyboard focus are drawn with the helper classes `is-hover` and `is-focus`).

Files:
- `a-header-actions.html`, `b-selection-strip.html`, `c-quiet-checkbox.html`: the three options, 11 or 12 frames each (same frame numbers in each).
- `states.html`: everything that is identical in all three options (read-only, confirm dialog, result messages, text edge cases).

What the options vary: only the header control (count, "Move to" dropdown, Move button) and the row checkbox treatment. The confirm dialog, the result messages, the selected-row look and all wording are the same in all three.

## Options

**A. Header actions (recommended).** The count ("3 selected") and the "Move to [Choose a sprint] [Move]" control sit in the pale teal Backlog header, on the right, exactly where the sprint panels put Start, Edit and Delete. Both appear only when N is at least 1; at 0 the header looks as it does today. The checkbox is always visible, so the feature is discoverable and works on touch. Smallest build: it reuses `.sprint-head` and `.sprint-actions`.

**B. Selection strip.** When N is at least 1 a dark teal strip appears inside the Backlog header with the white "N selected" count on the left and the control on the right. The header is `position: sticky`, so with 79 rows the count and Move button stay in view while the user scrolls and ticks (the main cost of A: the header scrolls away after about 10 rows). Cost: `.sprint { overflow: hidden }` breaks sticky, so the Backlog panel needs `overflow: visible` (frame 12 shows it working). The strip is a stronger signal, but it is a second visual mode for the header.

**C. Quiet checkbox.** The control is always in the header, disabled at 0 with the hint "Tick work items to move them.". The checkbox is hidden (`opacity: 0`, still in the tab order) until the row is hovered or focused, or until anything is ticked, then all boxes show. Cleanest list at rest, best discoverability of the control, but the checkboxes are invisible on first look, and hover-reveal is poor on touch (a `@media (hover: none)` rule shows them always). Not recommended for a POC where discoverability matters.

## Recommendation

Option A. It is the least new UI, it matches the existing sprint header pattern, it is fully usable by keyboard and touch, and nothing is hidden behind hover. If the owner finds scrolling back up to Move annoying with 79 items, take B: it is A plus a sticky header and a strip, and the contract below is otherwise the same. The row checkbox should be the always-visible version (A and B).

## UI contract (what the developer builds and QA checks)

New CSS is in the `<style>` of each file under the comment "Backlog bulk move" (shared block, plus the option-specific block). Copy the shared block and the chosen option's block into `public/css/app.css`.

### Row checkbox (AC 1-3, 7)
- Backlog rows only: `label.brow-select > input[type="checkbox"]` as the first child of `li.brow`, before `.brow-handle`. Sprint rows, Completed sprints and Epics rows have none (`states.html` S3).
- Accessible name on the input: `aria-label="Select <key> <title>"`, text inserted as text.
- Hit area 30px, box 18px, `accent-color: var(--teal)`. Visible focus ring: the global `:focus-visible` (2px teal, 2px offset).
- The click on the label/checkbox must not open the dialog and must not start a drag (stop propagation on click; the checkbox area is not a drag source). The title button still opens the dialog; drag and drop is unchanged.
- Selected row: class `is-selected`: pale teal fill plus a 3px teal left edge plus the ticked box. Never colour alone.
- Disabled while a run is in progress.

### Backlog header (AC 4-6, 8, 10, 11)
- Count: `<span class="sel-count" role="status">` always in the DOM, empty at 0 (so the live region announces changes). Text: "1 selected", "3 selected". Hidden when empty.
- Control: `div.bulk[role="group"][aria-label="Move selected work items"]` containing `label "Move to"` + `select` + `button.navy "Move"`.
  - Select placeholder option: "Choose a sprint" (disabled, selected). Options: Active sprint first then Planned sprints, each as "<name> (<state text>)", e.g. "Sprint 4 (Active)", "Sprint 5 (Planned)". No Completed sprints, no "Backlog" entry. State words from the existing sprint-state helpers.
  - Move is disabled until a sprint is chosen. While running: button text "Moving...", select and Move disabled, checkboxes and quick create disabled, `aria-busy="true"` on the list.
  - No Active or Planned sprint: the select and Move are replaced by the text "Create a sprint first." and a `button.navy "Create sprint"` that opens the existing Create sprint dialog.
- Visibility by option: A and B show count and control only when N is at least 1. C always shows the control (select and Move disabled at 0, hint "Tick work items to move them.") and hides only the count.
- Collapsed Backlog (frame 6): rows hidden, selection kept, count and control stay visible in the header. The toggle keeps `aria-expanded`.
- No select-all checkbox anywhere. Nothing is drawn for Viewer or archived projects (below).

### Confirm dialog (AC 13, 14; `states.html` S4, S5)
`<dialog class="app-dialog">`, same markup and look as the Delete sprint dialog: band heading, `.dialog-body` with the text and a `.hint`, `.dialog-foot` with `.error`, Cancel and primary button.
- Heading: "Move N work items to <sprint name>?"
- Body: "<sprint name> is the active sprint, so these N work items will appear on the board right away." Hint: "They keep their Backlog order and go to the bottom of the sprint."
- Buttons: "Cancel" (focused when the dialog opens, global focus ring), "Move N work items" (`.primary`).
- Shown only for the Active sprint with N at least `BULK_CONFIRM_MIN` (10). Sprint name and N inserted as text; long names wrap (`overflow-wrap: anywhere`).

### Result messages (AC 11, 12, 20-25; `states.html` S6-S12)
One region inside the Backlog panel, directly under the header (not at the top of the page, which scrolls out of view with 79 rows): `div.bulk-result`.
- Success (S6, S7): existing `.notice` with `role="status"`, a check mark, "Moved N work items to <sprint name>." (singular "Moved 1 work item to ..."), and a `button.link` "Dismiss". Selection is cleared.
- Partial failure (S9, S10): existing `.banner-warn` with `role="alert"`: bold "Partly moved." (a short label so the state is not colour alone), then "Moved X of N work items to <sprint name>. Could not move:", then a list, one item per failed key as `<key> (<server message>)`. More than 5: list the first 5, then a line "and K more". A hint line "The items that could not be moved are still ticked. Press Move to try again." Failed items stay ticked (and stay `is-selected`); moved ones are gone from the list.
- Stopped run (S11, S12): `.banner-warn`, bold "Stopped.", "Moved X of N work items to <sprint name>. K not attempted. <server message once>", hint that the remaining items are still ticked. When the target sprint is gone or completed (S12) X is 0 and the dropdown, after the reload, no longer lists that sprint and nothing is chosen.
- The region stays until Dismiss, the next Move, or a page reload. `ctx.showMessage` is error-only today, so success needs its own path (the top-of-page `#message` stays for single-item errors).

### Read-only (AC 19; `states.html` S1, S2)
Viewer and archived project: the Backlog renders as today. No checkbox column, no count, no control, and the row layout does not leave a gap where the checkbox would be.

### Text (AC 27)
All names, titles, keys and server messages as text. Frames 10 (option files) and S5, S8, S13 show markup and quotes literally.

## State to acceptance criteria

| State | Where | AC |
|---|---|---|
| Nothing selected (A, B: control and count absent; C: control disabled) | frame 1 | 4, 8, 26 |
| Row hovered, checkbox keyboard-focused | frame 2 | 1, 3, 7 |
| Some selected, no sprint chosen (Move disabled) | frame 3 | 4, 8, 10 |
| One selected, sprint chosen (singular, Move enabled) | frame 4 | 4, 10, 11 |
| Run in progress ("Moving...", all disabled) | frame 5 | 11 |
| Backlog collapsed with selection | frame 6 | 5, 6 |
| No Active or Planned sprint | frame 7 | 10 |
| Partly failed run, failed rows still ticked | frame 8, S9, S10 | 22, 25 |
| Fully successful run, selection cleared | frame 9, S6, S7 | 12 |
| Long and hostile text | frame 10, S5, S8, S13 | 1, 14, 27 |
| Narrow window | frame 11 | (responsive) |
| Sticky header while scrolling (B only) | B frame 12 | 6 (usability) |
| Viewer, no checkboxes | S1 | 19 |
| Archived project, no checkboxes | S2 | 19 |
| Checkboxes only in the Backlog | S3 | 1, 2, 18 |
| Confirm dialog, 10 or more into Active, Cancel focused | S4, S5 | 13, 14 |
| Run stopped (archived, permission lost) | S11 | 20, 23 |
| Target sprint completed or deleted | S12 | 24 |

Not drawn because nothing changes visually: Escape or closing the confirm dialog (AC 13, no UI), the board showing moved items (AC 12, no board change), ordering (AC 15, 16, 21), history entries (AC 17) and the server test (AC 28).

## Questions for the owner

1. Which option? (Recommended: A; take B if scrolling back to the Move button is a concern with 79 rows.)
2. The spec gives the failure text as one sentence ("Moved X of N ... Could not move: <key> (<message>), ..."). The mockup renders the keys as a list for readability and adds the bold labels "Partly moved." and "Stopped." so the state is not conveyed by colour alone. If you want the literal one-line sentence, drop the list and the labels; AC 22 and 23 would be unchanged otherwise.
3. The result region is placed inside the Backlog panel, not in the page-level `#message` at the top, because the top of the page is off screen after ticking rows. This is a small departure from "the existing message area"; confirm.
4. The spec says nothing about a "Clear selection" control. Without select-all, unticking 40 rows one by one is tedious. Not designed, because the spec lists no shortcuts beyond per-row boxes; say if you want a "Clear" link next to the count.
