# Epic View
Status: Approved for build
Date: 2026-10-25

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `docs/specs/ticket-history.md` and `docs/specs/work-item-links.md` (read-only references; this spec edits none of them).** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "MVP AC n", "Login AC n", "History AC n".

**Build order: do not start until the attachments work (`docs/specs/attachments-and-pasted-images.md`) is committed.** Both features edit `public/js/board.js` and `public/board.html`.

It reuses: `epic_id` on `issues` and `countChildren`, `releaseChildren` in `server/data/issues.js`; `isEpicType` in `server/types.js`; `isTerminalStatus` and `STATUSES` in `server/statuses.js`; `loadIssue` and `assertWritable` in `server/routes/guards.js`; the existing `PATCH /api/issues/:id` with its validation (`server/validation.js`, epic rules around lines 85-122) and history (`recordChanges`); the create dialog and the `<dialog id="detail">` with its `openLinked` re-pointing in `public/js/board.js`.

## Problem

Work items can already belong to an epic (the Epic dropdown in the dialog, the epic chip on cards, Epic swimlanes). There is no place to see an epic together with all of its items, how far along it is, or to manage its membership in one step. The owner wants an epic view that shows progress and children, lets users add, remove and create children, and is reachable by clicking the epic chip.

## User stories

1. As a user, I open an epic and see a progress bar (done of total) and a count of children per status.
2. As a user, I see the epic's children listed with key, title, type icon, status, assignee and priority, and click one to open it.
3. As a user, I click the epic chip on a card, or the Epic field in a child's dialog, and land on that epic's view.
4. As a user, I add an existing work item from the same project to the epic.
5. As a user, I remove a child from the epic without deleting it.
6. As a user, I create a new child straight from the epic, with the epic already chosen.
7. As a user, I see an empty epic clearly, with the Add and Create actions available.
8. As a user, on an archived project I can read the epic view but not change it.
9. As a user, I see membership changes in each child's History, as today.
10. As the owner, adding a status or type needs no change to this feature.

## Decisions (confirmed by the owner; the developer does not need to ask)

1. **Placement:** an "Epic" section in the existing work item detail dialog, shown only when the open item is an epic type. No new page or UI route.
2. **Progress:** a progress bar (done / total) plus a count per status.
3. **Child actions:** create child from the epic; add and remove existing items.
4. **Navigation:** the epic chip on cards and the Epic field in a child's dialog open the epic.
5. **Done counting:** any item in the terminal status counts as done, regardless of Resolution (including Won't Do style resolutions).
6. **No swimlane header summary** in v1.
7. **Empty epic:** show the empty state with the Add and Create actions.
8. **Picker keeps items from other epics:** adding one moves it (its History records the epic change), and the picker shows each item's current epic key next to its name.

## Acceptance criteria

### Children endpoint (server)

1. `GET /api/issues/:id/children` returns 200 with `{ items, summary }` for an epic-type work item. `items` is every work item whose `epic_id` is `:id`, each with `id, key, title, type, status, priority, assignee_id` and the assignee display name, ordered by status display order then item number. `summary` is `{ total, done, byStatus }`.
2. `summary.total` is the number of children. `summary.done` is the number of children whose status is the terminal status (`isTerminalStatus`). Resolution is not considered (any item in the terminal status counts, including Won't Do style resolutions). `summary.byStatus` has one entry for every status in `STATUSES`, in display order, with a count of 0 where none (so the UI never invents a status name).
3. `:id` that exists but is not an epic type returns 404 with an `error` message (`Epic not found.`). An unknown id returns 404 with the same response.
4. Only children of that epic are returned. Items in other epics or other projects are excluded; the result is not limited to what the board has loaded.
5. A signed-out request returns 401 (`requireUser`).
6. The endpoint is readable on archived projects (200).
7. The response reflects changes immediately: after a child's status is changed, a new GET shows the updated `done` and `byStatus`. After the epic is deleted or changed to a non-epic type (existing release behavior), children no longer appear and the endpoint returns 404 for a non-epic.
8. The endpoint adds no new write path; SQL lives in `server/data/issues.js` next to `countChildren`, and the route in `server/routes/issues.js` calls only the data layer.

### Membership changes (existing PATCH, verified not changed)

9. Adding an existing item is `PATCH /api/issues/:id` with `epic_id` set to the epic. Removing is the same PATCH with `epic_id: null`. Existing validation still applies: an `epic_id` from another project, or one that is not an epic type, is rejected (400); an epic cannot itself have an epic (400); an archived project returns 409.
10. Each add or remove writes the usual epic change event in the child's History (History AC), attributed to `req.user`. No new history field or event kind is added.

### UI

11. When the open item is an epic type, the detail dialog shows an "Epic" section. For other types the section is not shown. The section label uses the type label from the types list, not a hard-coded name.
12. The section shows a progress bar filled to `done / total` with text such as "3 of 8 done", and one count per status in `STATUSES` order (zero counts shown). Status names come from the server response; none is hard-coded in the client.
13. Below the progress, the children are listed with key, title, type icon, status, assignee and priority. Clicking a child's key or title opens that item's dialog (re-pointed in the same dialog, no reload).
14. The epic chip on a board card is clickable and opens that epic's dialog. Clicking it does not start a drag and does not also open the card's own dialog.
15. In a child's dialog, the Epic field shows the epic's key and title as a link that opens that epic's dialog. The dropdown for changing the epic remains available.
16. An "Add existing item" control has a dropdown of work items from the same project that are not epic types and are not already children of this epic (key and title, plus the item's current epic key if it has one), and an Add button. Add is disabled until an item is chosen. After a successful add, the child appears in the list and the progress and counts update without closing the dialog. A server error is shown inline and the form keeps its values.
17. Each child row has a Remove button. Removing sets `epic_id` to null via the API; the row disappears and the progress and counts update without closing the dialog. There is no confirmation prompt.
18. A "Create child" button opens the existing create dialog with the Epic field preselected to this epic and the project fixed to the epic's project. The Type default is the normal default (a non-epic type). After creating, the new item appears in the epic's list and in the progress without a manual reload.
19. An epic with no children shows an empty state ("No items in this epic yet.") with the Add and Create actions still available and a progress bar of 0.
20. On an archived project the Epic section is readable (progress, counts, children list), but the Add control, Remove buttons and Create child button are not shown.
21. After a child's status changes (by drag on the board or in its dialog), reopening the epic shows updated progress and counts. If the epic dialog is open when a change is made from within it (add, remove, create), the section refreshes without closing.
22. If History is the open tab when a child is added or removed, the epic's own dialog is unaffected; the child's History shows the change when opened (AC 10).
23. Titles and keys are inserted as text, never parsed as HTML; a child titled `<b>x</b>` appears literally.
24. Server errors from loading the section (for example 404 after the epic was deleted elsewhere) show an inline message and do not break the dialog.

### Source and extensibility

25. No status name, type name or resolution name is hard-coded in the new server or client code (`tests/source.test.js` rules continue to pass, with a new rule covering the epic view code). Adding a status to `statuses.js` and restarting makes it appear in the epic counts with no other change.
26. All SQL for the epic view appears only in `server/data/`.

## Data model changes

None. `issues.epic_id` already exists. No new tables, columns or history fields.

## Out of scope

- Rollup of story points or any estimate.
- Roadmap, timeline or Gantt view of epics.
- Nested epics (validation already forbids an epic having an epic).
- A project-level epics list page.
- Showing the epic summary on the board swimlane header (see Open question 2).
- Bulk add, drag-and-drop of items onto an epic, or reordering children within the epic.
- Filtering or sorting the children list, or pagination.
- A child's blocked or linked indicators in the list (links are a separate feature).
- Changing delete or type-change behavior for epics (children are still released with history).

## Open questions

None. The owner accepted all recommendations (Decisions 5-8).

## Implementation notes for the developer

Suggested order, each step testable alone:

1. **`server/data/issues.js`**: add `listChildren(db, epicId)` and `childSummary(db, epicId)` next to `countChildren` (about line 39). Build `byStatus` from `STATUSES` so zero counts appear, and `done` from `isTerminalStatus`; no literal status names. Export both.
2. **`server/routes/issues.js`**: add `GET /issues/:id/children` using `loadIssue` and `isEpicType`; 404 with `Epic not found.` for a missing or non-epic item (AC 3). Read-only, so no `assertWritable`.
3. **Tests** (`node:test`, following `tests/links.test.js`, `tests/helpers.js`): extend `tests/issues.test.js` where it fits and add `tests/epic-view.test.js` covering 200 shape (AC 1), done/total and byStatus with zero entries (AC 2), 404 for non-epic and unknown id (AC 3), cross-project and other-epic exclusion (AC 4), 401 signed out (AC 5), archived read 200 (AC 6), counts update after a status PATCH, release when the epic is deleted or retyped (AC 7), PATCH add/remove with validation and history events (AC 9-10), and an extensibility test that adds a status via the list and sees it in `byStatus` (AC 25, in the style of `extensibility.test.js`). Add source-test rules in `tests/source.test.js` (AC 25-26).
4. **`public/board.html`**: add the Epic section markup inside the detail dialog (progress bar, counts, list, add control, Create child button), hidden by default.
5. **`public/js/board.js`**: fetch children when an epic-type item opens (`openLinked`-style, `board.js` around line 1019); render with `el(...)` and text nodes only; fill the Add dropdown from the loaded board items (same project, non-epic, `epic_id !== this.id`); Add and Remove call the existing PATCH, then re-fetch and also refresh `state.items` so cards and swimlanes update. Make the card epic chip (around line 211) a click target that stops propagation and calls `openLinked(epic.id)`; make the Epic field in a child's dialog (around lines 443-475) render a link beside the dropdown. Create child reuses the create dialog with the epic preselected (around line 470 builds the Epic options). Hide write controls when the project is archived.
6. **`public/css/app.css`**: styles for the progress bar, counts, child rows, and chip hover state.
7. **`README.md`**: one paragraph on the epic view and the new endpoint.
8. **Rebase check**: after the attachments commit lands, re-read `public/js/board.js` and `public/board.html` before editing, since both change there.
9. UI behavior (AC 11-24) is verified by QA in a browser on a scratch DB copy on a spare port (not 3001; never 3000): open an epic from its chip, move a child to Done and check progress, add an existing item, remove one, create a child with the epic preselected, confirm an archived project is read-only, and confirm the child's History shows the epic changes.
