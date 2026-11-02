# Backlog bulk move to sprint
Status: Approved (2026-10-26; design option B; Open question 1 stays open and does not block)
Date: 2026-10-26

**Builds on the implemented code and on `docs/specs/sprints-and-backlog.md` (read-only reference; this spec edits it not).** That spec's "Out of scope" lists "Moving several items at once (multi-select, ...)". This spec lifts that one line for the Backlog section only. References to it are written "Sprints AC n" or "Sprints Decision n". Acceptance criteria are numbered from 1 within this spec.

## Problem

Project 2 (SFPM) has about 94 items that look like backlog. Per the existing rules (Sprints Decision 16, AC 31) only the non-epic ones (79 tasks) are in the Backlog section; the 15 epics are shown read-only in the Epics section and cannot be in a sprint. Moving 79 tasks into a sprint today means 79 individual drags (`public/js/backlog.js`, `moveItem`, one PATCH of `sprint_id` and `sprint_rank` per drop), usually across a long scroll. The owner wants to tick a set of rows and move them all to a sprint in one action.

## Decisions (owner-approved 2026-10-26)

1. **Backlog section only.** Sprint rows, Completed sprints and the Epics section get no checkboxes.
2. **Best-effort, repeated PATCH.** No new server endpoint and no all-or-nothing move.
3. **Confirm large moves into the Active sprint.** Threshold is a named constant `BULK_CONFIRM_MIN = 10` (proposed; the owner may change the number). See AC 13.
4. **Moved items keep their Backlog order** (not tick order).
5. **No select-all checkbox.** Selection is per-row checkboxes only. The header shows "N selected" and the "Move to [sprint]" control.
6. **Design option B** (`docs/design/backlog-bulk-move/b-selection-strip.html`): a dark teal selection strip inside a sticky Backlog header. Options A and C are not built.
7. **Failure message as designed.** Failed keys are a list, with the bold labels "Partly moved." and "Stopped." (states S9-S12 of `docs/design/backlog-bulk-move/states.html`), instead of the one-line sentence first written in AC 22 and 23. See AC 29.
8. **Result messages inside the Backlog panel**, under its header (`div.bulk-result`), not in the page-level `#message`. Success needs its own path, since `ctx.showMessage` is error-only. See AC 30.
9. **"Clear selection" link** next to the "N selected" count. See AC 31.

## User stories

1. As a user who can write, I tick a checkbox on any row in the Backlog section to select it.
2. As that user, once at least one row is ticked, I see in the Backlog header "N selected" and a "Move to [sprint]" control: I pick a sprint (planned or active) and confirm, and all selected items move into it.
3. As that user, I keep my selection if some items fail to move, and I am told exactly which ones failed and why.
4. As a Viewer, or on an archived project, I see the Backlog as today: no checkboxes, no move control.

## Acceptance criteria

### Checkboxes and selection

1. In the Backlog section (and only there), each item row has a checkbox at the start of the row, before the drag handle. Its accessible name is "Select <key> <title>" (text inserted as text). Rows in sprint sections, Completed sprints and the Epics section have no checkbox.
2. There is no select-all checkbox, in the header or anywhere else, and no other "select many" shortcut. Each item is selected by its own checkbox.
3. Ticking or unticking a checkbox does not open the work item dialog and does not start a drag (a click on the checkbox is not treated as a row click). The row title button still opens the dialog, and drag and drop of a row still works exactly as before (Sprints AC 33).
4. The Backlog header shows a live count "N selected" (singular and plural handled, for example "1 selected") whenever N is at least 1. The count is also exposed to assistive technology through a `role="status"` region. With N = 0 the count is hidden.
5. The selection survives a re-render of the page that does not move the items (quick create in the Backlog, sprint history load, collapse and expand of sections). Items that leave the Backlog for any reason (moved, deleted, reloaded from the server and no longer there) drop out of the selection. The selection is page-view state only and is not persisted across reloads.
6. Rows in a collapsed Backlog section cannot be ticked, but the selection is kept; the header ("N selected" and the move control) stays visible when the section is collapsed.
7. Keyboard: every checkbox and the move control are reachable by Tab and operable by Space/Enter. Shift-click range select is not required.

### The "Move to [sprint]" control

8. The Backlog header contains a control labelled "Move to..." made of a sprint dropdown and a "Move" button. It is shown only when at least one item is selected; with N = 0 it is hidden or disabled (implementer's choice, but there is no way to submit an empty selection).
9. The dropdown lists the project's Active sprint and every Planned sprint (name plus state text), in the same order as the page (active first, then planned). It does not list Completed sprints, and it has no "Backlog" entry (the items are already there). The state names come from the existing sprint-state helpers (`ctx.isActiveSprint`, `ctx.isFinalSprint`), not hard-coded.
10. There is no sprint preselected: the placeholder reads "Choose a sprint" and the Move button is disabled until a sprint is chosen. When the project has no Active or Planned sprint, the dropdown is replaced by the text "Create a sprint first." and a "Create sprint" button that opens the existing Create sprint dialog.
11. Choosing a sprint and pressing Move moves every selected item to that sprint (after the confirmation of AC 13 where it applies). The button label while working is "Moving..." and the whole control (checkboxes, dropdown, Move) is disabled until the run ends. A second submit while a run is in progress does nothing.
12. After a fully successful run a status message (`role="status"`) says "Moved N work items to <sprint name>." (singular for 1) and the selection is cleared. Moving into the Active sprint makes those items appear on the board immediately (Sprints AC 24).

### Confirmation for large moves into the Active sprint

13. When the chosen target is the Active sprint and the number of selected items is `BULK_CONFIRM_MIN` or more (a single named constant in `public/js/backlog.js`, value 10), pressing Move opens a confirmation dialog (a `<dialog class="app-dialog">`, same look as the sprint delete dialog) before anything is sent:
    - Heading: "Move N work items to <sprint name>?"
    - Body: "<sprint name> is the active sprint, so these N work items will appear on the board right away." followed by the hint "They keep their Backlog order and go to the bottom of the sprint."
    - Buttons: "Cancel" (focused by default) and "Move N work items" (primary).
    Cancel, Escape or closing the dialog sends nothing and keeps the selection and the chosen sprint. Confirm starts the run (AC 11). Moves into a Planned sprint, and moves into the Active sprint of fewer than `BULK_CONFIRM_MIN` items, are not confirmed and start at once.
14. The sprint name in the dialog is inserted as text. The count N is the number selected when the dialog opens; the run moves that same set even if the page re-renders in the meantime.

### Ordering

15. The moved items are placed at the bottom of the target sprint, in the same relative order they had in the Backlog (ascending `sprint_rank`, then id), regardless of the order the user ticked them. Items already in the target sprint keep their order and stay above the moved items.
16. The moved items are removed from the Backlog without changing the order of the items that remain in it (the remaining items keep their relative `sprint_rank` order).
17. A bulk move never changes status, resolution, epic, assignee or comments of an item (Sprints AC 22). Each moved item gets exactly one `sprint` History entry attributed to the signed-in user (Sprints AC 39), the same as a dialog or drag move.

### Epics

18. Epics cannot be selected: they never appear in the Backlog section (Sprints AC 24 and AC 30), so they have no checkbox and are never sent in a move. The Epics section stays read-only and has no checkbox (Sprints AC 31). If an epic id were ever submitted, the server's existing 400 `Epics cannot be added to a sprint.` applies and is reported as a failure under AC 22. (Whether epics should be handled some other way is Open question 1.)

### Permissions and archived projects

19. For a user without the `write` permission (Viewer) and on an archived project, the Backlog section renders as today: no checkboxes, no "N selected", no move control. The client decides this with the existing `readOnly()` (user permission names, never a group name).
20. Server enforcement is unchanged and is the real guard: a Viewer receives 403 and an archived project 409 on `PATCH /api/issues/:id` with `sprint_id` (Sprints AC 23, 47, 48). If the permission or archived state changed since the page loaded, the first failed item aborts the run (AC 23) and the message shows the server text.

### Mechanism and failure handling

21. **Repeated `PATCH /api/issues/:id`, no new server endpoint** (Decision 2). The client sends one PATCH per selected item with `{ sprint_id: <target id> }` and no `sprint_rank`, one at a time (sequentially, never in parallel), in the order of AC 15. The server's existing rule "sprint_id changed and no sprint_rank supplied: place at the bottom of the target" (Sprints AC 19) is what produces the ordering.
22. Partial failure (message layout per AC 29): a failed PATCH (400, 404, 409, network error) does not roll back items already moved and does not stop the other items, except as in AC 23. After the run the page reloads items from the server (`ctx.reloadItems`) and the result is shown in a `role="alert"` message: "Moved X of N work items to <sprint name>. Could not move: <key> (<server message>), ..." listing each failed key (long lists may truncate after 5 with "and K more"). The failed items stay ticked, the successfully moved items are cleared from the selection (they have left the Backlog), so the user can retry by pressing Move again.
23. Abort conditions: a 401, 403 or 409 whose cause is project-wide or sprint-wide (project archived, target sprint completed or no longer exists, user lost write permission) will fail every remaining item, so after the first such response the run stops, the remaining items are not sent, and they are reported as "not attempted". The message says how many were moved, how many were not attempted and the server message once. A 400/404 on a single item (for example an item deleted by someone else) does not abort; the run continues with the next item.
24. If the target sprint was completed or deleted by someone else since the page loaded, nothing is moved, the message is the server's, and the page reloads so the dropdown no longer offers that sprint.
25. After every run, successful or not, the page reloads the item and sprint lists once (not once per item) so counts on the sprint headers and the Backlog are correct.
26. Empty selection: with nothing selected there is no way to trigger a move (AC 8). Unticking every row hides the control again.

### Source and tests

27. No sprint state name, status or type name is hard-coded in the new client code (same rule as Sprints AC 51). All text inserted as text.
28. Tests: there is no browser-less unit test harness for `backlog.js`, so QA verifies AC 1-20 and 22-26 in a browser against a scratch copy of the database on a spare port. A server test (`tests/sprints.test.js`) adds the case that sequential `PATCH { sprint_id }` calls on N backlog items produce bottom placement in call order, one History entry each, and that a completed target sprint returns 409 for each (this documents the contract the client relies on).

### Added by the owner on approval (2026-10-26)

29. **Failure message layout** (Decision 7; replaces the one-line wording of AC 22 and 23, which are otherwise unchanged). The message is a `.banner-warn` with `role="alert"`:
    - Partial failure: bold "Partly moved." then "Moved X of N work items to <sprint name>. Could not move:", then a list with one entry per failed key as "<key> (<server message>)". With more than 5 failures the first 5 are listed, then a line "and K more". Then the hint "The items that could not be moved are still ticked. Press Move to try again."
    - Stopped run (AC 23, 24): bold "Stopped." then "Moved X of N work items to <sprint name>. K not attempted. <server message once>", and the hint "The K work items that were not moved are still ticked."
    - Singular is handled ("1 work item"). Names and server messages are inserted as text.
30. **Where results show** (Decision 8). The success message (AC 12) and the failure messages (AC 29) appear in one region inside the Backlog panel, directly under its header (`div.bulk-result`), not in the page-level `#message` (which stays for single-item errors). Success is an existing `.notice` with `role="status"`. Each message has a "Dismiss" link and stays until Dismiss, the next Move, or a page reload.
31. **Clear selection** (Decision 9). Next to the "N selected" count there is a "Clear selection" link (a button styled as a link). It is shown only when N is at least 1, unticks every Backlog row, makes no server call, and is disabled while a run is in progress (AC 11). It is not a select-many shortcut (AC 2 still holds: there is no select-all).

## Data model changes

None. No new columns, tables, endpoints or history fields. The feature is client-only: it uses the existing `issues.sprint_id`/`sprint_rank`, `PATCH /api/issues/:id` and `GET /api/projects/:id/sprints`.

## Out of scope

- Checkboxes or "move to" on rows inside sprint sections or Completed sprints (Decision 1).
- A select-all checkbox or any other bulk-select shortcut: select by filter or search, shift-click range, "select the first N" (Decision 5).
- Bulk edit of other fields (assignee, priority, type, epic, status) and bulk delete.
- A server bulk endpoint and all-or-nothing atomic moves (Decision 2).
- Drag and drop of a multi-selection.
- Persisting the selection across reloads; undo of a bulk move.
- Moving epics, or adding checkboxes to the Epics section.
- Confirmation for moves into Planned sprints, or any confirmation setting in the UI (the threshold is a constant).
- Any change to the board.

## Open questions

1. **The "~94 items" count.** 15 of them are epics, which are not backlog items and cannot be moved into a sprint (Sprints Decision 16). Only 79 are selectable, and the spec keeps that behaviour (epics are not selectable). The owner is still discussing whether this is what they expect, or whether epics should be handled differently (for example selecting the children of an epic together). Not included here; AC 18 is the only place that would change.

Resolved by the owner and moved into Decisions: sprint-row checkboxes (no), atomic vs best-effort (best-effort), confirmation for large moves (yes, threshold 10 proposed), order of moved items (Backlog order), select-all (none).

## Implementation notes for the developer

Built to design option B and AC 29-31 (owner decisions 6-9). The order, the sequential loop and the result text live in `public/js/bulkMove.js` (pure, unit-tested in `tests/bulkMove.test.js`); `public/js/backlog.js` draws the controls.

Pipeline: owner reviews this spec, then the `designer` (new checkbox column, header selection state, Move control, confirm dialog, message styles), then `developer`, then `qa`. Re-read `public/js/backlog.js`, `public/backlog.html` and `public/css/app.css` first; the Backlog page was last changed in the sprints commit.

Why no server endpoint: `PATCH /api/issues/:id` already does everything needed per item, in the right order: it validates the same-project sprint, rejects a completed target (409), rejects epics (400), places a changed `sprint_id` at the bottom (`bottomSprintRank` in `server/data/issues.js`), writes the `sprint` History entry, and enforces the `write`/archived guards. Moving 79 items is 79 local SQLite writes, a few seconds at worst. A bulk endpoint would buy atomicity only, which the owner declined.

Files to touch and suggested order:

1. `public/js/backlog.js`: add `view.selected` (a `Set` of item ids) and the constant `const BULK_CONFIRM_MIN = 10;` next to `RANK_STEP`. In `renderRow` accept a `selectable` flag (true only for the Backlog list when not `ctx.readOnly()`); add the checkbox before the handle with `click` guards so it does not trigger `ctx.openDetail` or a drag. Pass the flag through `renderList` for the Backlog section only.
2. `public/js/backlog.js`, `renderBacklogSection`: in the header add the `role="status"` "N selected" count and the Move control built from `ctx.activeSprint()` plus `plannedSprints()`. No select-all. Prune `view.selected` against `itemsIn(null)` at the start of `render()`.
3. `public/backlog.html`: add the bulk-move confirm dialog next to `sprint-delete-dialog` (same `app-dialog` markup: band heading, body text and hint, Cancel and confirm buttons); wire it in `backlog.js` the way `openDelete` is.
4. `public/js/backlog.js`, new `bulkMove(sprint)`: take the selected items ordered by `bySprintRank`; if the target is the Active sprint and the count is at least `BULK_CONFIRM_MIN`, open the confirm dialog and continue only on confirm (AC 13-14). Then loop sequentially with `await api.patch('/api/issues/' + id, { sprint_id: sprint.id })`, collect `moved`, `failed` and `notAttempted` per AC 22-23, call `ctx.historySaved(id)` per success (as `moveItem` does), then `await ctx.reloadItems()` once and update `view.selected`. Check how `ctx.showMessage` styles success versus error in `public/js/board.js` (line ~268); add a success path if it only does errors.
5. Disable the controls during the run with a `view.bulkBusy` flag and re-render.
6. `public/css/app.css`: checkbox column width in `.brow`, header selection bar, disabled state. Follow `docs/design/` when the designer delivers.
7. `tests/sprints.test.js`: add the sequential-PATCH contract test of AC 28 (copy an existing sprint test for setup).
8. `README.md`: one sentence under the Backlog description.
9. QA: scratch copy of the SFPM database on a spare port (not 3001, never 3000). Select 3 items out of order and move to a planned sprint (order check); select 10 and move to the Active sprint (confirm dialog appears; Cancel sends nothing); select 9 and move to the Active sprint (no confirm); simulate partial failure (delete an item through a second session, or complete the target sprint in a second tab); Viewer and archived read-only; keyboard-only operation.
