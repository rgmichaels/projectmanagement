# Backlog row sprint picker
Status: Approved (2026-11-02; owner wants the pipeline run fast: designer and QA skipped, defaults taken)
Date: 2026-11-02

Builds on `docs/specs/sprints-and-backlog.md` ("Sprints AC n"), `docs/specs/backlog-bulk-move.md` ("Bulk AC n") and `docs/specs/sprint-scope-change.md`.

## Problem

Owner: "on the backlog page, on the backlog items not in a sprint, can we make a dropdown on each line for 'sprint' so you can just assign to a sprint quickly?" Today one item moves by a long drag, or by ticking it and using the Backlog header strip.

## User stories

1. As a user who can write, I pick a sprint from a dropdown on a Backlog row and the item moves into it.
2. As a Viewer, or on an archived project, I see the Backlog as today: no dropdown.

## Decisions (defaults taken)

1. **Sprints listed:** the Active sprint, then Planned sprints, never Completed. Same list as bulk move (`bulkTargets()`), so the controls agree; the server rejects a Completed target (409) anyway. No "Backlog" entry.
2. **Landing position:** bottom of the target sprint, as bulk move and the server default (Sprints AC 19). A picker has no drop position; the user can drag afterwards.
3. **No confirm, even for the Active sprint.** Bulk move confirms only at 10 or more items; one item is far below that, the option shows the state text, and a drag moves it back. The scope-change log still records it (Scope AC 6).
4. **Coexistence:** the dropdown never opens the dialog or starts a drag (same `pressOnSelect` and `stopPropagation` pattern as the checkbox). It moves only its own row, ticked or not; the moved row leaves the selection. Disabled while a bulk run is in progress.
5. **Errors:** as a failed drag: the item snaps back, the dropdown resets, and the page message "Could not move <key>: <server message>" shows.
6. **Control (no designer):** a native `<select>` styled with the existing `app.css` form styles, placed at the end of the row (after the avatar), with a "Sprint" heading in the list header strip.

## Acceptance criteria

1. Each Backlog row has a native select, accessible name "Sprint for <key>", placeholder "Sprint" selected, at the end of the row. Sprint sections, Completed sprints and Epics rows have none.
2. Options after the placeholder: the Active sprint then Planned sprints, as "<name> (<state>)", with no state name hard-coded. Completed sprints are not listed.
3. With no Active or Planned sprint the select is disabled, title "Create a sprint first."
4. Choosing a sprint sends one `PATCH /api/issues/:id` with `sprint_id` (no new endpoint). The item leaves the Backlog and lands at the bottom of that sprint; remaining Backlog items keep their order. No confirm dialog.
5. Only the sprint changes (status, epic, assignee, estimate untouched); exactly one `sprint` History entry is written for the signed-in user.
6. Using the select does not open the dialog, start a drag, or change the row's checkbox. With other rows ticked, only this row moves; the others stay ticked and "N selected" updates.
7. During a bulk run all row selects are disabled.
8. On PATCH failure the item stays, the select resets to "Sprint", and "Could not move <key>: <server message>" shows. Nothing else changes.
9. After a success the page reloads items once, and keyboard focus goes to the next row's select or else the Backlog toggle. The select works by keyboard and applies on selection.
10. No select for Viewers or archived projects (`ctx.readOnly()`); server 403 and 409 are unchanged. Sprint names are inserted as text.

## Data model changes

None. Client only.

## Out of scope

Selects on sprint, Completed or Epics rows; a "back to Backlog" entry; choosing the position; a confirm setting; changes to bulk move, drag or the server.

## Open questions

None blocking. If the owner later wants a confirm for the Active sprint, reuse the bulk confirm dialog.

## Implementation notes for the developer

Files: `public/js/backlog.js`, `public/css/app.css`, one README sentence. Pipeline: developer only (designer and QA skipped by the owner; run `npm test` and try it once in a browser).

1. In `renderRow`, when `selectable`, append a `sprintPicker(item)` after the avatar, with `stopPropagation` on click, `pressOnSelect` on pointerdown and a keydown stop.
2. On change call `moveItem(item, sprint.id, null)` (one PATCH with a bottom rank, optimistic, rollback with the message, one reload). Disable on `view.bulkBusy` or no targets.
3. Remember the next row id before the move and refocus its select after render, else the Backlog toggle.
4. Add the "Sprint" heading in `renderList`'s header strip when `selectable`; compact fixed width in `app.css`.
