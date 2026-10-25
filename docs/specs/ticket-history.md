# Ticket History
Status: Draft
Date: 2026-10-24

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `docs/specs/ticket-discussion.md` and `docs/specs/resolution-and-comments.md` (read-only references; this spec edits none of them). It is written assuming `docs/specs/username-login.md` is built (it supplies `req.user`), and the owner has decided login is built first (Decision 14); the Unknown-actor fallback only covers entries written before then.** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "MVP AC n", "Discussion AC n", "Login AC n".

It reuses: `updateIssue`, `createIssue`, `deleteIssue` in `server/data/issues.js` (each already runs in one `db.transaction`), `loadIssue` in `server/routes/guards.js`, the single-source lists (`server/statuses.js`, `types.js`, `priorities.js`, `resolutions.js`), `public/js/time.js` (`timeFormat.timestamp`), the relative-time refresh timer and `<dialog id="detail">` in `public/js/board.js` / `public/board.html`.

## Problem

A work item shows only its current state. Nobody can see who moved a card to Done, who changed the assignee or priority, or why the resolution is "Won't Do". The owner wants a Jira-style history (audit trail) on each work item: a newest-first list of "who changed what, from what to what, and when", written by the server so it cannot be skipped or faked by the browser.

## User stories

1. As a user, I open a work item and see a History section listing every change made to it, newest first.
2. As a user, each entry reads like "Alex Morgan changed Status from To Do to In Progress" with an absolute and a relative time.
3. As a user, I see when the work item was created and by whom.
4. As a user, dragging a card to another column or into another swimlane shows up in history as the field(s) it changed.
5. As a user, I can filter the history to one field (for example Status or Resolution) and load more entries when the history is long.
6. As a user, I can still read the history of a work item in an archived project, but nobody can edit it.
7. As the owner, I can add a status, type, priority, resolution or editable field in one place and have it appear in history without touching history code.

## Decisions (confirmed by the owner; the developer does not need to ask)

Decisions 3, 4, 6, 7, 8, 10, 11, 13 and 14 answer the six questions the first draft raised; the owner accepted the recommendations in full.

1. **One change event per save, with one row per changed field.** A drag from `To Do` to `Done` that also auto-sets Resolution to `Fixed` is one event with two changes, shown as two lines under one actor and time. This matches Jira's grouping and keeps the auto-set resolution visible (Blake's `Fixed` to `Won't Do` is just another Resolution change).
2. **Only real changes are recorded.** A save whose value equals the stored value (including a PATCH that resends every field) writes no event. If a save changes nothing, no entry exists.
3. **Rank-only reorders are ignored.** Dragging a card up or down within a column changes only `rank`, which is bookkeeping and not something a person decides; recording it would bury real events. `rank` is never in history, including when a status move assigns a new rank or `rebalanceIfNeeded` renumbers a column. Only the status change of a cross-column move is recorded.
4. **Comments are not copied into history.** The Discussion thread stays the only place comments live. History records changes to the work item itself. The owner confirmed there is no merged "All" view (Decision 11).
5. **Both ids and a display snapshot are stored.** For people and epics the row keeps the id (so a later filter or link is possible) and the text shown at the time (so history stays readable if a name changes or the epic is deleted). The actor also keeps both.
6. **Long text is recorded as "changed", not diffed.** Description changes store no old/new text, only that it changed. Title (max 200 chars) stores old and new values.
7. **Deleting a work item deletes its history (owner-confirmed).** Same rule as its comments (`deleteIssue` removes them explicitly). It keeps data small and avoids orphaned rows pointing at nothing. No tombstone is kept.
8. **Archive.** History is readable on an archived project and gets no new entries, because archived work items cannot change (MVP AC 11). Blocked writes (409) are not recorded: nothing changed, so there is nothing to audit. Archiving, unarchiving and project status changes are project events, not work item changes, and do not appear in any work item's history (a project-level log is a later phase, see Next steps). The owner confirmed this: no "Project archived" note appears on items.
9. **Side effects on other items are recorded on those items.** Deleting an epic clears the epic of its children (MVP AC 18), and changing an epic's type releases its children (`clearChildren`). Each affected child gets its own `Epic` change event (old: the epic, new: none), attributed to the actor who did it.
10. **Actor.** From `req.user` (Login AC 8-9): `actor_id = req.user.id`, `actor_name = req.user.name`. If this spec is built before login exists, or `req.user` is undefined for any reason, the actor is `actor_id = null`, `actor_name = 'Unknown'`, shown as "Unknown". Never take the actor from the request body. When login lands, nothing in history changes except that the helper that builds the actor starts finding `req.user`; the developer should build that helper (`actorFrom(req)`) so it already reads `req.user` and returns the Unknown actor when it is absent. Entries written as Unknown stay Unknown. The owner decided login is built first (Decision 14), so this should affect only entries made before login ships.
11. **UI placement: a two-tab area, "Discussion | History", not an All view in v1.** The detail dialog already has the Discussion section after the Description. Add a "History" tab beside it in the same place; Discussion stays the default tab and its behavior, newest-first order and the "Posting as" or signed-in rules are unchanged. History is also newest first, so both tabs scan the same way. A merged "All / Comments / History" feed was considered and rejected by the owner for now; it would require either duplicating comments into history or merging two sources on the client, so it is left out of the POC and comments are never copied into history.
12. **Timestamps match Discussion.** `timeFormat.timestamp(created_at)` gives `2026-10-24 14:05 (2 hours ago)`, and History joins the existing timer that refreshes relative times while the dialog is open.
13. **Existing work items get no backfilled history.** Items created before this feature simply start recording from the first change after it ships. Their History tab shows "No history recorded yet." until then. No synthetic "created" entry is added for them.
14. **Build order: login first.** `username-login.md` is built before this spec, so history entries have a real actor from the start. Entries written before then (if any) say "Unknown".

## Acceptance criteria

### Recording (server)

1. Creating a work item writes one `created` event, in the same transaction as the insert, with the actor and the time of creation. It has no field changes. The History tab shows it as "<actor> created this work item".
2. Updating a work item via `PATCH /api/issues/:id` writes one `changed` event containing one change per field whose stored value actually changed, from the set of editable fields: type, title, description, status, priority, assignee, epic, resolution. The event and the update commit or roll back together: if validation fails, the update fails, or the database throws, no event is written (QA: force a failing PATCH and check the history count is unchanged).
3. A PATCH that changes no stored value (identical values, or an empty body) writes no event and the history count is unchanged.
4. A PATCH that changes only `rank` writes no event. A PATCH that changes `status` records the status change but not the rank change. Dragging a card within its column (rank only) leaves history unchanged; the rank is never listed.
5. Each change stores the field key, the old and new value as display text, and, for assignee and epic, the old and new id. Empty values are stored as null (not the string "None"). Assignee text is the user's display name; epic text is `<key> <title>` of the epic at the time. Statuses, types, priorities and resolutions are stored as their plain names.
6. Description changes store the field key and no old or new text. Title changes store both.
7. Moving a card to the terminal status writes the Status change and the automatic Resolution change (null to the default) in the same event. Moving it out writes Status and Resolution (value to null). Changing only the Resolution of a terminal item writes one Resolution change (for example `Fixed` to `Won't Do`).
8. Dragging a card into a different swimlane for assignee, epic or priority grouping records the field that changed (Assignee, Epic or Priority); if the same drag also crosses columns, the Status change is in the same event.
9. Deleting an epic, or changing an epic's type to a non-epic type, writes an Epic change (epic to none) for each affected child, attributed to the acting user, in the same transaction as the delete or type change.
10. Deleting a work item deletes its history events and changes in the same transaction (no history rows remain for that `issue_id`), and `GET /api/issues/:id/history` for it returns 404 like any missing item.
11. A blocked write on an archived project (409, MVP AC 11) writes no event.
12. The actor is taken from `req.user` only (Decision 10): a request body containing `actor_id`, `actor_name` or `user_id` has no effect on the stored actor. With no `req.user` the event is stored as `actor_id` null, `actor_name` "Unknown".
13. History is append-only through the API: there is no endpoint to edit or delete an event or change (`PATCH`/`PUT`/`DELETE` on `/api/issues/:id/history` and on any history id return 404 or 405). Rows disappear only through AC 10.
14. Comments (create, edit, delete) write no history events.

### Reading (API)

15. `GET /api/issues/:id/history` returns 200 with `{ events: [...], has_more: boolean }`, newest first (by `id` descending, which is time order). Each event is `{ id, kind: 'created' | 'changed', actor_id, actor_name, created_at, changes: [{ field, label, kind, old, new, old_id, new_id }] }`. `kind` of a change is `text`, `long`, `user` or `issue` (from the field list, see Data model changes). `old`/`new` are null for empty and always null for `long` fields. `created` events have `changes: []`. Unknown or non-numeric id returns 404 with `Work item not found.`. The endpoint is readable for archived projects (no `assertWritable`).
16. `limit` (integer, default 50, max 200; larger values are clamped, non-integers or below 1 return 400) caps the number of events. `before=<event id>` returns only events older than that id. `has_more` is true exactly when older events exist beyond the returned page. Paging with `before` set to the last returned id visits every event once, with none repeated or skipped.
17. `field=<key>` returns only events that contain a change to that field (and only that field's changes in each event). An unknown key returns 400 with `Unknown field: <key>`. `created` events are excluded when a field filter is used.
18. `GET /api/history-fields` returns the field list `[{ key, label, kind }]` in display order, so the client does not hard-code names.

### UI

19. The detail dialog shows tabs "Discussion" and "History" in the area after the Description. Discussion is selected by default each time a dialog opens and behaves exactly as before. Selecting History shows the list without reloading the page; the tab can be reached with the keyboard.
20. History loads on first selection of the tab (or when the dialog opens with History already selected) from `GET /api/issues/:id/history`, newest first. While loading it shows "Loading..."; on failure an inline error with a Retry control; with no events, "No history recorded yet."
21. Each event shows the actor's name, then the timestamp from `timeFormat.timestamp` (absolute local time plus relative, for example `2026-10-24 14:05 (2 hours ago)`), then one line per change in the form `changed <Label> from <old> to <new>`, e.g. "Alex Morgan changed Status from To Do to In Progress". A null old or new value renders as "None". A `long` field renders `changed Description` with no values. A `created` event renders "created this work item". The relative times update on the same timer Discussion uses, without reloading.
22. Values and names are inserted as text (never parsed as HTML); a title containing `<b>x</b>` appears literally.
23. A field filter dropdown (default "All fields", options from `GET /api/history-fields`) restricts the list per AC 17. Changing it reloads from the start.
24. When `has_more` is true a "Show more" button loads the next page with `before` and appends it; it disappears when `has_more` is false. A work item with 120 events shows 50, then 100, then 120 across two clicks, with no duplicates.
25. After a successful save or card drop made while the dialog is open, a History tab that is open (or opened next) shows the new event without closing the dialog. A History tab that was already loaded is refreshed from the server after each save in that dialog; no polling of other users' changes is required.
26. On an archived project the History tab is fully readable and shows the same list; the tab and filter are not disabled by read-only mode.
27. No field, status, type, priority or resolution name appears in `public/js/` history code or in `server/` history code (see Tests).

### Extensibility

28. Adding a status to `server/statuses.js`, a type to `types.js`, a priority to `priorities.js`, or a resolution to `resolutions.js` and restarting makes moves to and from it appear in history with no history code change. Adding a new editable work item column to `UPDATABLE` requires only one entry in the history field list (`server/historyFields.js`) and a test fails if an `UPDATABLE` field other than `rank` has no entry (so it cannot be forgotten silently).

## Data model changes

Two new tables in `server/db.js` (`CREATE TABLE IF NOT EXISTS`, so existing databases gain them on start; no data migration, Decision 13). Like comments, no CHECK constraints on field or kind values.

- **issue_history_events**: `id` INTEGER PK, `issue_id` INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE, `kind` TEXT NOT NULL (`created` or `changed`), `actor_id` INTEGER NULL REFERENCES users(id), `actor_name` TEXT NOT NULL (snapshot), `created_at` TEXT NOT NULL (ISO, same format as `comments.created_at`). Index on `(issue_id, id)`.
- **issue_history_changes**: `id` INTEGER PK, `event_id` INTEGER NOT NULL REFERENCES issue_history_events(id) ON DELETE CASCADE, `field` TEXT NOT NULL, `old_value` TEXT NULL, `new_value` TEXT NULL, `old_id` INTEGER NULL, `new_id` INTEGER NULL. Index on `event_id` and on `field`. `old_id`/`new_id` are plain integers with no foreign key, so a deleted epic or user does not block or alter history.

New single-source list `server/historyFields.js` (same style as `statuses.js`): an ordered array of `{ key, label, kind }` for `type`, `title`, `description` (`long`), `status`, `priority`, `assignee_id` (key shown as `assignee`, kind `user`), `epic_id` (key `epic`, kind `issue`), `resolution`. `kind` tells the recorder how to snapshot a value (`text`: as is; `long`: no values; `user`: id plus `users.name`; `issue`: id plus `<key> <title>`). `rank` is deliberately absent. It contains field names only, never status or type values.

No change to `issues`, `comments` or `users`. `deleteIssue` deletes history explicitly (like it does comments) as well as relying on the cascade.

## Out of scope

- Undo / revert to a previous value from history.
- Export of history (CSV, JSON, PDF).
- A project-level audit log or activity feed, and project archive/status events (see Next steps).
- Diffs of long descriptions beyond "changed" (no old/new text, no line diff).
- Recording rank-only reorders, comment activity, or attempted-but-blocked writes.
- Editing or deleting history entries, retention limits, purging.
- Backfilling history for items that existed before this feature, or reconstructing it from `updated_at`.
- Real-time updates of another user's changes (no polling, no websockets).
- Permissions on who may view history (everyone who can read the item can read it).
- A merged "All / Comments / History" feed.

## Next steps (not part of this spec)

1. **Project-level activity/history feed (later phase):** a page listing recent events across a project: project archive/unarchive and status changes, work items created or deleted, plus the per-item events recorded here. The `(issue_id, id)` index and per-event shape make the item part a query with a `project_id` join. Because deleting a work item deletes its history (Decision 7), a "work item deleted" line would need its own project-level record written at delete time; that is a decision for that later spec.
2. **"Work item history" as a later idea:** the owner also mentioned "work item history" as a later idea. It is unclear whether that means something beyond this per-item history (for example the project-level feed above, history that survives deletion, or a different view). Clarify with the owner before speccing it; this spec does not assume an answer.
3. **Pasted images** in Discussion (reserved `body_format`): when comments gain images, history needs no change, since comments are not mirrored.

## Open questions

None. The six questions from the first draft were answered by the owner (Decisions 3, 4, 6, 7, 8, 10, 11, 13, 14).

## Implementation notes for the developer

Suggested order, each step testable alone:

1. **`server/historyFields.js`**: the field list and small helpers (`getField(key)`, `isHistoryField(key)`), mirroring `statuses.js`. Add `GET /api/history-fields` in `server/routes/meta.js`.
2. **`server/db.js`**: add the two tables and indexes to `SCHEMA`.
3. **`server/data/history.js`**: all history SQL and the single recorder. Export `recordCreated(db, issueId, actor, when)`, `recordChanges(db, issueId, actor, before, after, when)` and `listHistory(db, issueId, { limit, before, field })`, and `deleteHistory(db, issueId)`. `recordChanges` loops over `historyFields` comparing `before[f]` and `after[f]`, snapshots values by `kind` (looking up `users.name` or the epic's `key title`), writes one event with its changes, and writes nothing if the diff is empty. It must be called with the same `db` inside the caller's transaction. This is the only place that decides what is recorded, so rank is excluded here by omission from the list.
4. **`server/data/issues.js`**: `createIssue`, `updateIssue`, `deleteIssue` take an `actor` argument (`{ id, name }`). In `createIssue` call `recordCreated`. In `updateIssue` read `current` (already done), after the UPDATE read the new row and call `recordChanges(current, updated)` so the automatic resolution and status changes are captured in one event. For `clearChildren` and for `deleteIssue`, load the children (`epic_id = id`) before clearing and call `recordChanges` for each, with the epic changing from the id to null (build the `after` copy with `epic_id: null`); in `deleteIssue` also call `deleteHistory(db, id)`. Keep every existing `db.transaction` as the single boundary; do not open a nested or second one. Remember that `better-sqlite3` transactions nest safely, but recording must happen before the transaction function returns.
5. **`server/routes/guards.js`**: add `actorFrom(req)` returning `{ id: req.user.id, name: req.user.name }` or `{ id: null, name: 'Unknown' }` when `req.user` is absent. Routes in `server/routes/issues.js` and `projects.js` (where work items are created) pass `actorFrom(req)` to the data layer. Never read the actor from `req.body`.
6. **`server/routes/history.js`** (new, mounted in `server/app.js`): `GET /issues/:id/history` with `limit`, `before`, `field` parsing and validation (AC 15-17), using `loadIssue` for the 404 and no `assertWritable`. Fetch `limit + 1` events to compute `has_more`.
7. **Frontend**: add the tab strip and a `<section id="history">` next to `#discussion` in `public/board.html`; in `public/js/board.js` add a `history` state object modeled on `discussion` (issueId, events, loadSeq to ignore stale responses, hasMore). Render with `el(...)` and text nodes only. Fill the filter from `/api/history-fields`. Use `timeFormat.timestamp` and register History's time elements with the same `refreshRelativeTimes` pass as Discussion. Re-fetch the first page after each save or delete-driven change in the open dialog. Put styles in `public/css/app.css`.
8. **Tests** (`node:test`, following `tests/comments.test.js` and `tests/helpers.js`; the helper client is signed in as a seeded user once login exists, otherwise the actor is Unknown):
   - Recording: create writes `created`; changing each field writes the right change; multi-field PATCH is one event (AC 2); no-op PATCH and rank-only PATCH write nothing (AC 3-4); move to terminal records Status plus Resolution; `Fixed` to `Won't Do` (AC 7); drag across a swimlane field (AC 8); epic delete and type change write child entries (AC 9); delete removes history (AC 10); archived 409 writes nothing (AC 11); injected failure (for example a PATCH that fails validation after partial change, or stubbing `recordChanges` to throw) leaves the item unchanged and no event (AC 2); actor from `req.user`, body `actor_id` ignored, Unknown fallback (AC 12); no mutation endpoints (AC 13); comments write nothing (AC 14).
   - API: ordering, response shape, `limit` clamp and 400s, `before` paging over 120 events with no duplicates, `field` filter, unknown field 400, 404s, archived readable (AC 15-18).
   - Extensibility: a source test in the style of `tests/source.test.js` and `tests/resolution-extensibility.test.js` that greps history code in `server/` and `public/js/` for hard-coded status, type, priority and resolution names (read from the single-source lists) and fails if found (AC 27); a test that every `UPDATABLE` field except `rank` has a `historyFields` entry (AC 28); a test that temporarily adds a status through the list (as `extensibility.test.js` does) and sees moves recorded.
   - Source checks: history SQL appears only in `server/data/`; routes call only the data layer.
   - UI behavior (AC 19-26) is verified by QA in the browser, plus a pure-function test for any formatting helper written for the client in the style of `tests/time.test.js`.
