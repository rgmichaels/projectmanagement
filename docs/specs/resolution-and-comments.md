# Resolution
Status: Draft
Date: 2026-10-24

**Comments are not covered here.** They moved to `docs/specs/ticket-discussion.md`, which is the single place that defines comments. This spec and that one are independent and can be built in either order.

**Depends on `docs/specs/board-mvp.md`.** This spec builds on that spec and must not be started until it is implemented and QA'd. It reuses its terminology ("work item"; the table and API may still be called `issues`), its single status list (`server/statuses.js`), type list, archived read-only rule (board-mvp AC 11), the detail view, and the `PATCH /api/issues/:id` endpoint. Acceptance criteria below are numbered from 1 within this spec; references to the MVP are written "MVP AC n".

## Problem

When a work item reaches Done there is no record of why it was closed (done as intended, will not be done, duplicate, and so on). Jira calls this the Resolution. This is kept deliberately small: one extra field with a single-source value list.

## User stories

1. As a user, when I drag a work item to Done it is automatically given the resolution `Fixed`, with no extra dialog, so closing work stays one gesture.
2. As a user, I can change the resolution of a Done work item in the detail view (for example to `Won't Do` or `Duplicate`).
3. As a user, I see a work item's resolution on its card and in its detail view once it is Done, and I see none when it is not Done.
4. As a user, when I move a work item out of Done its resolution is cleared, so a reopened item is not shown as resolved.
5. As a user viewing an archived project, I can read resolutions but not change them.
6. As the owner (future-facing), I can add a resolution value in one place in the code and have it work across the forms, API and display without other changes.

## Acceptance criteria

### Resolution: values and single source

1. The resolution list is defined in exactly one place: `server/resolutions.js`, exporting an ordered list. Initial entries, in order: `Fixed` (marked as the default, e.g. `isDefault: true`), `Won't Do`, `Duplicate`, `Cannot Reproduce`. It is exposed to the client through `GET /api/resolutions`, which returns the entries in order (including which one is the default).
2. "Terminal status" is derived from the single status list in `server/statuses.js` as its last entry (in the POC, `Done`), via one exported helper (for example `isTerminal(status)` or `terminalStatus`). No other code compares against the name `Done`.
3. A search of the source (excluding tests and seed data) finds no hard-coded resolution names (`Fixed`, `Won't Do`, `Duplicate`, `Cannot Reproduce`) outside `server/resolutions.js`, and no `CHECK` constraint on the `resolution` column. The default resolution is the entry flagged as default, not a name literal.
4. Adding one new entry to the resolution list (for example `Obsolete`) and restarting the server, with no other code changes, results in: the value appearing in the detail view's resolution control; the API accepting it on `PATCH /api/issues/:id`; and cards showing it.

### Resolution: setting and clearing

5. A new work item has no resolution (null). The resolution is never shown for, and never stored on, a work item whose status is not the terminal status.
6. Moving a work item to the terminal status (drag between columns, drag across lanes, or `PATCH` of `status`) without an explicit resolution sets the resolution to the default (`Fixed`). The server does this, not the client, so the status change and resolution are written in the same update.
7. A `PATCH` that sets the terminal status and also supplies a valid `resolution` stores the supplied resolution instead of the default.
8. Moving a work item from the terminal status to any other status clears its resolution to null in the same update. It is null after reload and in the `PATCH` response.
9. Updating a Done work item without changing status (editing other fields, reordering within the Done column, moving it between swimlanes while staying in Done) leaves its resolution unchanged. Moving it to Done when it is already Done is a no-op for resolution.
10. Changing the resolution of a Done work item in the detail view and saving persists after reload and updates the card on the board without a manual refresh.
11. Dragging a card to Done shows no dialog or prompt. The card appears in Done with the default resolution visible immediately (taken from the server response, not guessed by the client).

### Resolution: validation and API

12. `PATCH /api/issues/:id` with a `resolution` that is not in the resolution list returns a 4xx error with a message, and the work item is unchanged.
13. `PATCH /api/issues/:id` with a non-null `resolution` on a work item that is not (and is not being moved to) the terminal status returns a 4xx error, and the work item is unchanged. Sending `resolution: null` on a work item in the terminal status returns a 4xx error (a Done item always has a resolution).
14. `GET /api/projects/:id/issues` and the `PATCH` response include `resolution` (string or null) for each work item.
15. Work items that were already in the terminal status before this spec is applied (existing data) are given the default resolution by the schema update, so the invariant in AC 5 and AC 13 holds for all rows. See Open question 1.

### Resolution: display

16. In the terminal-status column a card shows its resolution as a small label (for example `Fixed`). Cards in other columns show none.
17. The detail view shows a Resolution control only while the work item is in the terminal status: a dropdown populated from `GET /api/resolutions`, showing the current value. For other statuses the control is hidden or shown as disabled with no value.
18. If the user changes the status field in the detail view to the terminal status, the resolution control appears with the default selected; changing the status back away from it removes the control and clears the value on save.

### Resolution: swimlanes and archived boards

19. With grouping by Assignee, Epic or Priority, dropping a card on the terminal-status column of a different lane sends one `PATCH` containing status and the lane field; the server sets the default resolution in that same update. If the request fails, the card returns to its original place, shows its original resolution (or none), and an error is shown (MVP AC 23).
20. A cross-lane drop that MVP AC 36 rejects (Epic-type item into another epic's lane) changes nothing, including resolution.
21. On an archived project's board, resolutions are visible on cards and in the detail view but cannot be edited (control disabled or read-only). The API rejects any `PATCH` that changes `resolution` or `status` on a work item in an archived project with a 4xx error, leaving data unchanged (already covered by MVP AC 11; this just confirms resolution is included).
22. Archiving or unarchiving a project does not alter any resolution.

### Tests

23. Automated tests (`npm test`, `node:test`, temporary database) cover at least:
    - `GET /api/resolutions` returns the configured list in order with one default (AC 1).
    - Moving to the terminal status sets the default resolution; moving out clears it; a supplied valid resolution is honoured; same-status updates and in-column reorder keep it (AC 6-9).
    - Invalid resolution, non-null resolution on a non-terminal item, and null resolution on a terminal item are rejected with the item unchanged (AC 12-13).
    - The terminal status is derived from the status list: a test that appends a status after `Done` to the list shows the new last entry becomes terminal, and a test that adds a resolution entry exercises AC 4 (AC 2, 4).
    - Cross-lane drop into the terminal column sets the default resolution in the single update (AC 19), and archived-project writes to resolution are rejected (AC 21).

## Data model changes

Applied through the same single schema/setup file used by the MVP (an additive change; the developer decides whether existing local databases are migrated by an idempotent `ALTER TABLE ... ADD COLUMN` step or by documenting "delete `data/app.db`"; see AC 15 and Open question 1).

- **issues**: add `resolution` (text, nullable). Valid values come from `server/resolutions.js`, not a `CHECK`. Invariant maintained by the data-access layer: `resolution` is non-null if and only if `status` is the terminal status.
- **`server/resolutions.js`** (new, not a table): ordered list of entries, each with `name` and optional display metadata (for example a colour), and `isDefault: true` on exactly one entry. Same pattern as `server/statuses.js` and `server/types.js`.
- **`server/statuses.js`**: add one exported helper that identifies the terminal (last) status. The status list itself does not change.

API additions and changes (REST, JSON):

- `GET /api/resolutions` (new)
- `PATCH /api/issues/:id` (existing; accepts `resolution`, returns `resolution`)
- `GET /api/projects/:id/issues` (existing; each item gains `resolution`)

## Out of scope

- Comments and discussion (see `docs/specs/ticket-discussion.md`).
- An activity history / audit log (status changes, resolution changes, field edits shown as history); a planned later phase.
- A resolution prompt or dialog on drag to Done (the default-and-change-later approach is the recommendation).
- Per-project or UI-managed resolution lists, and workflow rules tying resolutions to particular transitions.
- A "Resolved date" field, resolution filters or reports, and showing resolution in swimlane grouping.
- Re-pointing existing resolutions when the status list changes (see Open question 2).
- Everything already out of scope in `board-mvp.md` unless listed above as now in scope.

## Open questions

1. **Existing Done items.** If work items are already in Done when this ships, the spec backfills them with the default resolution (`Fixed`) so the "Done always has a resolution" rule holds. Alternative: leave them blank and allow the invariant to be relaxed for legacy rows. Which does the owner prefer? (If the MVP has no real data yet, the backfill can be skipped.)
2. **Changing the status list later.** If a status is later added after `Done`, the terminal status changes and existing Done items would hold a resolution on a non-terminal status. The spec does not migrate these; it only guarantees the helper follows the list. Is leaving this to the planned full-workflow phase acceptable?
3. **Default resolution wording and values.** Are `Fixed`, `Won't Do`, `Duplicate`, `Cannot Reproduce` the right set and order (Jira's defaults also include `Done`, `Incomplete` and `Declined`)? Should Epics and other types use the same list?

## Implementation notes for the developer

Start only after `board-mvp.md` is merged and passing. Files to touch (names follow the MVP's suggested layout; adjust to what was actually built):

- `server/resolutions.js` (new) and `server/statuses.js` (add terminal-status helper)
- `server/db.js` / schema file (add `issues.resolution`, with an idempotent migration for existing databases)
- `server/data/issues.js` (resolution rules on update)
- `server/routes/issues.js` (validation of `resolution`), route for `GET /api/resolutions`
- `public/js/api.js`, `public/js/board.js` (resolution label on cards), the detail view script/markup (resolution control), `public/css/app.css`
- `tests/` (new file for resolution), `README.md` if the schema step needs a note

Rules to follow (same as the MVP):

- **SQL stays in the data-access layer.** The resolution set/clear rule belongs in the data-access functions, not in routes or client code. Routes validate input and call data-access only.
- **No hard-coded names** for statuses, types or resolutions outside their single list modules (and tests/seed data). The client loads `GET /api/resolutions` and renders the control by iterating it; it never decides the default or the terminal column itself, it uses what the server returns.
- Do not add `CHECK` constraints on `resolution`.
- Archived guard: reuse the MVP's guard (`assertWritable`) for resolution writes.

Suggested order:

1. Schema additions, `server/resolutions.js`, terminal-status helper, `GET /api/resolutions` (AC 1-3).
2. Resolution rules in the data-access update (set default, clear, validate) and API validation (AC 5-9, 12-15), with tests.
3. Resolution on cards and in the detail view, then drag and cross-lane behaviour using the server response (AC 10-11, 16-22).
4. Extensibility tests (AC 4, and the terminal-status test in AC 23) and a final check of AC 3 by searching the source.
