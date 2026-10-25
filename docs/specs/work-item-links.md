# Work Item Links
Status: Approved for build
Date: 2026-10-25

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `docs/specs/ticket-discussion.md`, `docs/specs/username-login.md` and `docs/specs/ticket-history.md` (read-only references; this spec edits none of them).** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "MVP AC n", "Login AC n", "History AC n".

It reuses: the single-source list style of `server/statuses.js`, `types.js`, `resolutions.js`; `loadIssue` and `assertWritable` in `server/routes/guards.js`; `actorFrom(req)` (reads `req.user`); `server/data/history.js` (`recordChanges`, `deleteHistory`) and `server/historyFields.js`; `deleteIssue` in `server/data/issues.js`; the `<dialog id="detail">` in `public/board.html` / `public/js/board.js`.

## Problem

Work items are independent. Nobody can record that one item blocks another, that two items are related, or that one is a duplicate of another. The owner wants Jira-style links: a link has a type, reads differently from each end ("A blocks B" on A, "B is blocked by A" on B), and the change is auditable.

## User stories

1. As a user, I open a work item and see a Links section listing every item linked to it, grouped by relationship ("blocks", "is blocked by", "relates to", "duplicates", "is duplicated by").
2. As a user, I add a link by choosing a relationship and another work item in the same project.
3. As a user, when I add "PM-1 blocks PM-2", PM-2 shows "is blocked by PM-1" without my doing anything.
4. As a user, I remove a link from either end and it disappears from both.
5. As a user, I click a linked item in the list to open it.
6. As a user, I see in an item's History who added or removed each link and when.
7. As a user, deleting a work item removes its links; the items it was linked to just lose that row.
8. As the owner, I add a link type in one file and it appears in the UI and API with no other code change.

## Decisions (confirmed by the owner; the developer does not need to ask)

1. **Same project only.** Links across projects are rejected with 400 (AC 5). The item picker reuses the loaded board items.
2. **Duplicates does not set Resolution.** Links are pure relationships; Resolution stays a separate choice.
3. **Cycles allowed.** "A blocks B" and "B blocks A" may both exist; only an identical row is rejected (AC 6).
4. **History on both items.** Each add or remove writes a mirrored event on both ends (AC 14-15).
5. **Partner events on delete.** Deleting an item writes a "link removed" event on each former partner (AC 17).
6. **Initial link types:** Blocks, Relates, Duplicates. Others are a one-file addition (AC 3).
7. **No limit on links per item.**

## Acceptance criteria

### Link types (single source)

1. A new file `server/linkTypes.js` is the only place link type names and their labels are defined. Each entry is `{ name, outward, inward }` (for example `{ name: 'Blocks', outward: 'blocks', inward: 'is blocked by' }`). A type where both ends read the same carries `symmetric: true` and one label (`Relates` : `relates to`). The initial list is Blocks, Relates, Duplicates (`duplicates` / `is duplicated by`), in that display order. Exports a list plus `isValidLinkType(name)` and `getLinkType(name)`.
2. `GET /api/link-types` returns the list expanded into selectable options in display order: `[{ link_type, direction: 'outward' | 'inward', label }]`. A symmetric type yields one option (`direction: 'outward'`). The client builds its relationship dropdown from this and contains no link type name or label.
3. No link type name or label (`Blocks`, `blocks`, `is blocked by`, and so on) appears in `server/` outside `linkTypes.js`, or in `public/js/` (a source test enforces this, like `tests/source.test.js`). Adding an entry to `linkTypes.js` and restarting makes it usable in the API and UI with no other change.

### Creating and removing links (server)

4. `POST /api/issues/:id/links` with body `{ link_type, direction, target_id }` returns 201 with the created link and stores one row. `direction: 'outward'` means this item (`:id`) is the source ("`:id` blocks target"); `'inward'` means the target is the source ("target blocks `:id`"). `direction` may be omitted for a symmetric type.
5. Validation (each returns the status shown, with an `error` message, and writes nothing): unknown or missing `link_type` 400; `direction` not `outward`/`inward` for a non-symmetric type 400; missing or non-integer `target_id` 400; `:id` or target not found 404 (`Work item not found.`); target equals `:id` 400 (`A work item cannot be linked to itself.`); target in a different project than `:id` 400 (`Links must be within one project.`).
6. Duplicates are rejected with 409: the same type between the same two items in the same direction; and, for a symmetric type, the same pair in either order. (A and B may still be linked with different types.)
7. Only one row is stored per link. The other end's view ("is blocked by") is derived at read time from the same row, never stored twice.
8. `GET /api/issues/:id/links` returns 200 with `[{ id, link_type, direction, label, other: { id, key, title, type, status } }]`. `direction` and `label` are from the point of view of `:id` (so for the row "PM-1 blocks PM-2", asking for PM-2 gives `direction: 'inward'`, `label: 'is blocked by'`, `other` = PM-1). Ordered by link type display order, then direction (outward first), then `other.key`. Unknown id returns 404. Readable on archived projects.
9. `DELETE /api/issues/:id/links/:linkId` returns 204 and removes the row. It works from either end of the link (the item id must be the source or the target of that link). A link id that does not exist, or does not involve `:id`, returns 404 (`Link not found.`).
10. Archived project: `POST` and `DELETE` on a work item of an archived project return 409 (`assertWritable`, MVP AC 11) and change nothing. Reads are allowed (AC 8).
11. A signed-out request to any links endpoint returns 401 (Login AC, `requireUser`). The creator is recorded from `req.user` only; a body containing `created_by_id` or `actor_id` has no effect.

### Deleting work items

12. `deleteIssue` removes every link where the item is source or target, in the same transaction as the delete. Afterwards no `issue_links` row references the deleted id, and `GET /api/issues/:id/links` on each former partner no longer lists it. The partners themselves are not changed or deleted. Deleting a project's items one at a time or via the existing flows needs no other change.
13. Changing a work item's type, status, epic or any other field does not affect its links (links are not tied to the epic mechanism).

### History

14. Adding a link writes a history event on both items, in the same transaction as the insert. Each event is `kind: 'changed'` with one change on the field `link` (label `Link`, kind `link`): `old` null, `new` the text from that item's point of view, `<label> <other key>` (for example PM-1 shows `blocks PM-2`; PM-2 shows `is blocked by PM-1`); `new_id` is the other item's id. The actor is `actorFrom(req)`, i.e. `req.user`, the same on both events.
15. Removing a link writes the mirror event on both items: `old` is the same text, `new` null, `old_id` the other item's id, same actor rule.
16. The History tab renders these with the existing format: "Alex Morgan changed Link from None to blocks PM-2" for an add, and "changed Link from blocks PM-2 to None" for a remove. The History field filter lists `Link`; `GET /api/history-fields` includes it; `field=link` returns only link events.
17. Deleting a work item writes a "link removed" event on each former partner (old: the link text, new: none), attributed to the actor, in the delete transaction (the same rule as epic children, History Decision 9). The deleted item's own history is deleted with it (History Decision 7).
18. A failed add or remove (validation error, 409, or database error) writes no history event and leaves links unchanged (the row and both events commit or roll back together).
19. History code does not change how existing fields are recorded; a PATCH to a work item still writes no link events. `server/historyFields.js` gains one entry for `link`. The existing test that every `UPDATABLE` column has a history field still passes, and `link` (which has no `issues` column) is not required to be updatable.

### UI

20. The detail dialog has a "Links" section between the Description and the Discussion/History tabs. It lists links grouped under the relationship label for this item ("blocks", "is blocked by", ...), each row showing the other item's key, title, type icon and status. Groups with no links are not shown; with no links at all the section shows "No links."
21. Clicking a linked item's key or title opens that item's detail dialog (the same dialog, re-pointed; no page reload).
22. An "Add link" control has a relationship dropdown (from `GET /api/link-types`), an item dropdown listing the other work items of the same project (key and title; excludes the item itself; built from the items the board already loaded), and an Add button. Add is disabled until both are chosen. After a successful add, the new link appears in the list without closing the dialog. A server error (400/404/409) is shown inline and the form keeps its values.
23. Each row has a Remove button. Removing deletes the link via the API and the row disappears without closing the dialog. There is no confirmation prompt (links are cheap to recreate).
24. On an archived project the Links section is readable, but the Add control and Remove buttons are not shown.
25. Titles and keys are inserted as text, never parsed as HTML; a linked item titled `<b>x</b>` appears literally.
26. If History is the open tab when a link is added or removed, it refreshes (same rule as History AC 25).

## Data model changes

One new table in `server/db.js` (`CREATE TABLE IF NOT EXISTS`, so existing databases gain it on start; no data migration). No CHECK constraint on `link_type`, same as statuses/types/resolutions.

- **issue_links**: `id` INTEGER PK, `link_type` TEXT NOT NULL (a name from `server/linkTypes.js`), `source_id` INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE, `target_id` INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE, `created_by_id` INTEGER REFERENCES users(id), `created_at` TEXT NOT NULL (ISO). `UNIQUE (link_type, source_id, target_id)`; indexes on `source_id` and `target_id`. For a symmetric type, store the lower issue id as `source_id` so the unique constraint also catches the reversed pair.

New single-source list `server/linkTypes.js` (AC 1). New entry in `server/historyFields.js` for `link` (AC 14, 19). No change to `issues`, `comments`, `users`, `projects`.

All SQL lives in a new `server/data/links.js` (plus the explicit link deletion in `deleteIssue` in `server/data/issues.js`, calling into it).

## Out of scope

- Links across projects (see Open question 1).
- Link types beyond the initial three (adding one is a one-file change, AC 3), custom or per-project link types.
- A blocked indicator on board cards, filtering or swimlanes by link, "can't move to Done while blocked" rules.
- Cycle detection (A blocks B, B blocks A is allowed), transitive blocking, dependency graphs or roadmaps.
- Closing the duplicate automatically (setting Resolution to `Duplicate` when "duplicates" is added; see Open question 2).
- Links to external URLs or other systems (Jira "remote links").
- Link comments, link-level permissions, bulk link, or linking from the board by drag.
- Subtasks (a parent/child hierarchy is a different feature from links).
- A project-level activity feed.

## Open questions

None. The owner accepted all seven recommendations (Decisions 1-7).

## Implementation notes for the developer

Suggested order, each step testable alone:

1. **`server/linkTypes.js`**: the list and helpers (AC 1); a `linkOptions()` helper that expands it for AC 2 and a `labelFor(type, direction)` helper. `GET /api/link-types` in `server/routes/meta.js`.
2. **`server/db.js`**: add `issue_links` and its indexes to `SCHEMA`.
3. **`server/data/links.js`**: all link SQL: `addLink(db, source, target, linkType, actor, when)`, `removeLink(db, linkId)`, `listLinks(db, issueId)` (joins the other issue's key/title/type/status), `getLink`, `deleteLinksFor(db, issueId, actor, when)`. Each write runs in `db.transaction` and records history in that transaction. Symmetric normalisation (lower id first) happens here. Map the unique-constraint violation to a 409 `ValidationError`.
4. **`server/historyFields.js` and `server/data/history.js`**: add the `link` field (kind `link`, no `column`, so the column-diff loop in `recordChanges` must skip it) and a small `recordLinkChange(db, issueId, actor, { oldText, newText, oldId, newId }, when)` that writes one `changed` event with one `link` change. Check `GET /api/issues/:id/history?field=link` works with no special route code, and check how `publicFields()` and the existing field-coverage test treat a field with no column (AC 19).
5. **`server/data/issues.js`**: `deleteIssue` calls `links.deleteLinksFor(db, id, actor, now)` before deleting the row (AC 12, 17), inside the existing transaction; do not open a second one.
6. **`server/routes/links.js`** (new, mounted in `server/app.js` with the other routers): `GET/POST /issues/:id/links`, `DELETE /issues/:id/links/:linkId`. Use `loadIssue`, `assertWritable` (writes only), `actorFrom(req)`, and the validation order in AC 5. Routes call only the data layer, no SQL.
7. **Frontend**: a Links section and add form in `public/board.html`, state and rendering in `public/js/board.js` (build with `el(...)` and text nodes only; fetch link types once; fill the item dropdown from the loaded board items of the same project; re-point the dialog on a click, AC 21), and styles in `public/css/app.css`. Render the `link` kind in the history formatter alongside the existing kinds (it is just text; check `public/js/historyFormat.js` or wherever the format lives needs no new case).
8. **Tests** (`node:test`, following `tests/comments.test.js`, `tests/history.test.js`, `tests/helpers.js`):
   - Link types: list shape, `GET /api/link-types` options, a test that temporarily adds a type through the list and uses it (as `extensibility.test.js` does), a source test for AC 3.
   - API: create outward and inward, both ends read correctly (AC 4, 8); every validation case and status code in AC 5; duplicate and symmetric reversed pair 409 (AC 6); delete from either end and 404 cases (AC 9); archived 409 on writes and 200 on reads (AC 10); 401 signed out, body `actor_id` ignored (AC 11).
   - Delete: deleting an item removes its links and leaves partners (AC 12), writes partner events (AC 17).
   - History: add and remove write mirrored events on both items with the `req.user` actor (AC 14-15); a failed add writes nothing (AC 18); `field=link` filter and `/api/history-fields` (AC 16); PATCH writes no link events (AC 19).
   - Source checks: link SQL appears only in `server/data/`.
   - UI behavior (AC 20-26) is verified by QA in the browser.
