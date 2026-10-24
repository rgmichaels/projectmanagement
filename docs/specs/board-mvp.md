# Board MVP
Status: Draft
Date: 2026-10-24

## Problem

The owner cannot afford Jira but wants a "very much like Jira" tool for personal projects. There is no code yet. The MVP must prove the core loop: create a project, create work items in it, see them on a kanban board with columns by status, drag cards between columns, and regroup the board into horizontal swimlanes (by assignee, epic or priority, switchable). Everything else is deferred.

Terminology: a "work item" is the generic thing on the board (Jira calls it an issue). Work item keys keep the Jira style (`PROJ-1`), and the code, API and tables may keep the name `issues`. Separately, `Issue` is one specific work item type (support issues that pop up), so the UI and tests should say "work item" for the generic thing to avoid confusion.

## Stack decision (no code exists yet)

- **Runtime/server:** Node.js (LTS, 20+) with Express. The installed Node at time of writing is v26.7.0.
- **Database:** local SQLite only (no cloud database), via `better-sqlite3` by default, stored in a single local file (`data/app.db`, git-ignored). Created and seeded automatically on first start. Because the installed Node is 22.5+, the developer may instead use the built-in `node:sqlite` if they prefer to avoid a native module; they must record which one was used in the README.
- **Frontend:** plain HTML, CSS and vanilla JavaScript served statically by Express. Drag-and-drop uses the native HTML5 Drag and Drop API. No framework, no bundler, no build step.
- **Run:** `npm install && npm start`, then open `http://localhost:3000`. One command, one process, one data file.
- **Why:** free, fully local, at most two runtime dependencies (express, better-sqlite3; the test runner is built into Node), no build tooling for one developer to maintain. SQLite gives real relational queries (grouping, per-project counters) without a database server. Vanilla JS keeps the board code readable and avoids framework churn for a POC.
- **BOE migration rationale:** the owner may later move this to the BOE's SQL database. Keeping the POC on plain relational SQL, with all SQL confined to one data-access layer, means that move is a swap of that layer and the schema script rather than a rewrite.

## User stories

1. As a user, I can create a project with a name and a short key (e.g. `PROJ`) so that work items get Jira-style keys.
2. As a user, I can see a list of projects with their status, and change a project's status among Planning, In Progress, Completed and Cancelled.
3. As a user, I can archive a Completed or Cancelled project to hide it from the default project list, reveal archived projects with a "Show archived" toggle, and unarchive them.
4. As a user, I can create a work item in a project with a title, type (Defect, Task, Issue or Epic), priority, assignee, optional epic and optional description.
5. As a user, I can open a project's board and see work items as cards in columns To Do, In Progress and Done. For an archived project the board is view-only.
6. As a user, I can drag a card to another column to change its status, and the change persists after reload.
7. As a user, I can switch the board between no grouping, grouping by assignee, grouping by epic, and grouping by priority, with each group shown as a horizontal swimlane spanning all columns.
8. As a user, I can drag a card between columns within a swimlane, and (for assignee/epic/priority grouping) drag it into a different lane to change that field.
9. As a user, I can click a card to view and edit its fields, and delete the work item.
10. As a user, I can create and manage epics (an epic is a work item of type Epic) and assign other work items to one.
11. As the owner (future-facing), I can add a new status or a new work item type in one place in the code and have it work across the board, forms and API without touching board, swimlane, drag-and-drop or validation code.

## Acceptance criteria

### Projects

1. The home page lists all non-archived projects showing name, key and status. With no projects it shows an empty state with a "Create project" action.
2. Creating a project requires a name (1-80 chars) and a key (2-10 uppercase letters, unique across projects). Invalid or duplicate keys show an inline error and nothing is created.
3. A new project has status `Planning` unless a different one is chosen. The project status control offers exactly `Planning`, `In Progress`, `Completed`, `Cancelled`, and a change persists after reload.
4. Changing a project's status does not delete or alter its work items.
5. Projects are never hard-deleted in the UI. Retiring a project is done by setting it to `Completed` or `Cancelled` and optionally archiving it.
6. Archive is a flag on the project, separate from status. The archive action is available only while the project's status is `Completed` or `Cancelled`; for `Planning` or `In Progress` projects the UI does not offer it and the API rejects it with a 4xx error and a message.
7. Archived projects do not appear in the default project list. A "Show archived" toggle on the home page reveals them (clearly marked as archived), and turning it off hides them again.
8. An archived project has an "Unarchive" action; after unarchiving it appears in the default list with its status unchanged. The archived flag persists after reload and server restart.
9. Changing an archived project's status to `Planning` or `In Progress` automatically unarchives it: afterwards it appears in the default list with the new status. Changing between `Completed` and `Cancelled` keeps it archived.
10. Archiving or unarchiving never deletes or alters the project's work items (count and field values identical before and after). The board of an archived project is still viewable, both from the "Show archived" list and by direct URL.
11. The board of an archived project is read-only: cards cannot be dragged, and the UI offers no create, edit or delete of work items (those controls are hidden or disabled, and the detail view is view-only). The API rejects create, update and delete of work items in an archived project with a 4xx error, leaving data unchanged. Changing the Group by control and collapsing lanes still work, since they alter no data.

### Work items

12. Creating a work item requires a title (1-200 chars) and a type. Type is one of the configured work item types: `Defect` (defects only), `Task` (development work), `Issue` (support issues that pop up), `Epic` (grouping type, see AC 16). Default type is `Task`. Priority is one of `Highest`, `High`, `Medium`, `Low`, `Lowest` (default `Medium`). Description, assignee and epic are optional. `Story` and `Bug` do not exist.
13. Each work item gets a key `<PROJECT_KEY>-<n>`, where `n` starts at 1 per project, increments by 1 and is never reused, even after an item is deleted. The first work item in project `PROJ` is `PROJ-1`.
14. A new work item gets the first status in the configured status list (`To Do` in the POC). The statuses are exactly `To Do`, `In Progress`, `Done`, in that order.
15. Assignee is chosen from a fixed seeded list of users (see Data model); "Unassigned" is allowed.
16. The epic field lists only work items of type `Epic` in the same project. A work item of type Epic cannot itself have an epic.
17. Editing any field in the detail view and saving persists after reload and updates the card on the board without a manual refresh.
18. Deleting a work item asks for confirmation, removes it from the board, and does not reuse its key. Deleting an Epic clears the epic field of its child work items (it does not delete them).

### Board

19. A project's board shows one column per entry in the configured status list, rendered by iterating that list in its configured order (in the POC: `To Do`, `In Progress`, `Done`), each with a header showing the column name and the count of cards in it.
20. Each card shows key, title, type, priority, assignee (name or initials), and epic key if set. Each type is visually distinct on the card (distinct label, icon or colour; see open question 2), and a type with no defined styling still renders with a neutral fallback.
21. Epic-type work items appear on the board like any other work item.
22. Dragging a card and dropping it on another column changes its status immediately, and the new status is still there after a page reload. A drop outside any column leaves the card where it was.
23. If saving a move fails (server error), the card returns to its original column and an error message is shown.
24. Cards within a column are ordered by manual rank. Dropping a card at a specific position in a column keeps it at that position after reload. (Reordering within a column is in scope; rank is a simple integer.)

### Extensibility (statuses and types)

25. The status list and column order are defined in exactly one place (a single constants/config module on the server, exposed to the client through `GET /api/statuses`, or alternatively a `statuses` table).
26. The work item type list is defined in exactly one place (e.g. `server/types.js`, exposed through `GET /api/types`, or alternatively a `types` table). The one type with epic behaviour (grouping, the epic field, "cannot have an epic") is identified by a flag on its entry in that list (e.g. `isEpic: true`), not by comparing against the name `Epic` in other code.
27. A search of the source (excluding tests and seed data) finds no hard-coded status names (`To Do`, `In Progress`, `Done`) or type names (`Defect`, `Task`, `Issue`, `Epic`) in board, swimlane, drag-and-drop, validation, form or route code. The schema has no `CHECK` constraint on work item status or type.
28. Adding one new entry to the status list (e.g. `In Review` between `In Progress` and `Done`) and restarting the server, with no other code changes, results in: a new column in the correct position on the board and in every swimlane; the API accepting that status on `PATCH /api/issues/:id`; and a card being draggable into it with the change persisting after reload.
29. Adding one new entry to the type list (e.g. `Spike`) and restarting the server, with no other code changes, results in: the type appearing in the create and edit forms; the API accepting it on create and update; and cards of that type rendering on the board (with fallback styling if none is defined).
30. The API rejects a status or type that is not in its configured list with a 4xx error, and the work item is unchanged.

### Swimlanes

31. A "Group by" control offers `None`, `Assignee`, `Epic`, `Priority`. Default is `None`. The choice survives page reload (stored in the browser).
32. With `None`, the board is one set of columns. With any other grouping, the board is a stack of horizontal swimlanes; each lane has a header (group name and work item count) and contains the same status columns, so columns stay aligned across lanes.
33. Assignee lanes: one lane per assignee that has at least one work item, plus `Unassigned` last. Epic lanes: one lane per epic that has at least one child work item (headed with epic key and title), plus `No epic` last. Priority lanes: fixed order Highest to Lowest; empty priority lanes are hidden.
34. Lanes can be collapsed and expanded by clicking the lane header; collapsed lanes still show their count.
35. Dragging a card to a different column within the same lane changes only status. Dragging a card to a different lane (in any column) changes the grouped field (assignee, epic or priority) to that lane's value, and status to the target column's status. Both changes persist after reload. Dropping onto `Unassigned` or `No epic` clears the field.
36. When grouping by Epic, Epic-type work items appear in the `No epic` lane (they cannot have an epic) and cannot be dropped into another epic's lane; such a drop is rejected and the card returns to its place.
37. Changing the grouping never changes any work item data by itself.

### General

38. All data persists in the SQLite file across server restarts. Deleting the file and restarting recreates an empty schema and the seed users.
39. `npm start` on a fresh clone after `npm install` starts the app with no other setup, and the root URL loads without console errors.
40. Automated tests (run with `npm test`) cover at least: key generation and non-reuse (AC 13, 18), project archive rules including auto-unarchive and archived read-only enforcement (AC 6-11), the four work item types and default `Task` (AC 12), status change via API (AC 22), status and type list validation and the single-source behaviour (AC 28-30), reorder (AC 24), and lane-drop field updates (AC 35).

## Data model changes

New schema, created on first start. Keep it in one migration/setup file.

- **users**: `id`, `name`. Seeded with a small fixed list (e.g. 3 to 4 placeholder people). No login, no passwords, no roles.
- **projects**: `id`, `name`, `key` (unique, uppercase), `status` (`Planning` | `In Progress` | `Completed` | `Cancelled`, default `Planning`), `archived` (integer 0/1, default 0; may be 1 only while status is `Completed` or `Cancelled`; set back to 0 automatically when status changes to `Planning` or `In Progress`), `next_issue_number` (integer, default 1), `created_at`.
- **issues** (the work items table; name may stay `issues`): `id`, `project_id` (FK), `number` (per-project integer), `key` (derived `KEY-number`, unique), `type` (text; valid values come from the single type list, not a schema `CHECK`), `title`, `description`, `status` (text; valid values come from the single status list, not a schema `CHECK`), `priority` (`Highest` | `High` | `Medium` | `Low` | `Lowest`), `assignee_id` (nullable FK to users), `epic_id` (nullable FK to issues, must reference the epic-flagged type in the same project), `rank` (integer, per status column within a project), `created_at`, `updated_at`.
- **Status list and type list (not tables by default):** `server/statuses.js` exports the ordered list `['To Do', 'In Progress', 'Done']`. `server/types.js` exports the type list, in this order, each entry carrying its display metadata (label, colour/icon) and the epic flag: `Defect`, `Task`, `Issue`, `Epic` (with `isEpic: true`), default `Task`. Tables are an acceptable alternative; either way there must be one source of truth for each.

Suggested API (REST, JSON): `GET /api/projects` (excludes archived unless `?includeArchived=true`), `POST /api/projects`, `PATCH /api/projects/:id` (name, status, `archived`), `GET /api/projects/:id/issues`, `POST /api/projects/:id/issues`, `PATCH /api/issues/:id` (any field, including `status`, `assignee_id`, `epic_id`, `priority`, `rank`), `DELETE /api/issues/:id`, `GET /api/users`, `GET /api/statuses`, `GET /api/types`.

## Out of scope

- Authentication, accounts, permissions, multi-tenant or multi-user collaboration (users are a fixed seeded list; the app is single-user, local).
- Real-time sync between browser tabs or users.
- Sprints, backlog view, story points and estimates, velocity, burndown and all reports/dashboards (later phase).
- A full configurable workflow: user-defined statuses/columns or types in the UI, transitions between statuses, per-project workflows or board configuration, WIP limits. This is a planned later phase; the POC only guarantees the code is left open for it (AC 25-30). The POC ships exactly three statuses and four types.
- The `Story` and `Bug` types (dropped by the owner).
- Archiving or pulling out individual work items from an archive (deferred; the owner will figure it out later). Archiving applies to whole projects only.
- Comments, attachments, activity history, watchers, notifications, @mentions.
- Labels, components, versions, custom fields, issue links, subtasks.
- Search, JQL or saved filters (a later phase; a simple quick filter is a candidate).
- Integrations (GitHub, Slack, email, import/export from Jira).
- Mobile/touch drag-and-drop support, keyboard-accessible drag alternative (candidate for a later phase).
- Hosting/deployment, Docker, CI, any cloud database.
- Adding users in the UI, and a cross-project board.
- Salesforce data model, roles and Chatter from the earlier NYSBOE design (per CLAUDE.md).

## Decisions

Made by the owner; no longer open.

1. **Project statuses** are `Planning` (default), `In Progress`, `Completed`, `Cancelled`.
2. **Archiving** is a flag on projects, not a status. Only Completed and Cancelled projects can be archived; archived projects are hidden from the default list, revealed by a "Show archived" toggle, and can be unarchived. Archiving never deletes or alters work items.
3. **Archived boards are read-only** (no drag, edit, create or delete of work items) but remain viewable. Pulling an individual item out of an archive is deferred.
4. **Reopening:** changing an archived project's status to Planning or In Progress auto-unarchives it. Archived is only allowed while Completed or Cancelled.
5. **Completed and Cancelled** change nothing on the board or work items beyond archiving.
6. **Epic-type work items** sit in the `No epic` lane when grouping by Epic.
7. **Users** are a fixed seeded list; no user management in the UI.
8. **Statuses** stay at exactly three for the POC (To Do, In Progress, Done). One definition of the list and column order; all rendering and validation driven by it. A full configurable workflow is a planned later phase.
9. **Work item types** are `Defect` (defects only), `Task` (development work, the default), `Issue` (support issues that pop up), plus `Epic` kept as a grouping type. `Story` and `Bug` are dropped. The type list lives in one place so more types can be added later.
10. **One board per project**; no cross-project board.
11. **Database** is local SQLite, no cloud database. `better-sqlite3` by default, with all SQL in the data-access layer so it can later be swapped for the BOE's SQL database.

## Open questions

1. **Epic as a fourth type.** Should `Epic` stay as a fourth work item type (the spec's assumption, since the Epic swimlane and epic field depend on it), or does the owner want a different grouping concept (e.g. a separate "Group"/"Initiative" entity that is not a work item type)?
2. **Visual distinction of types.** The spec assumes `Defect`, `Task` and `Issue` (and Epic) are visually distinguished on cards with a distinct label, icon or colour. Confirm, or specify what is wanted (e.g. specific colours).

Deferred (not open for the POC): archiving or removing individual work items from an archive.

## Implementation notes for the developer

Suggested layout (adjust as needed):

- `package.json` (scripts: `start`, `test`; deps: `express`, `better-sqlite3`)
- `server/index.js` (Express app, static hosting of `public/`, route wiring)
- `server/statuses.js` and `server/types.js` (the single status list/order and the single type list with display metadata and the epic flag; used by validation, defaults, and `GET /api/statuses` and `GET /api/types`)
- `server/db.js` (open DB, create schema, seed users) and the data-access functions (e.g. `server/data/projects.js`, `server/data/issues.js`)
- `server/routes/projects.js`, `server/routes/issues.js` (validation per the acceptance criteria; routes call the data-access layer only)
- `public/index.html` (project list with "Show archived" toggle), `public/board.html` (board), `public/css/app.css`
- `public/js/api.js` (fetch helpers), `public/js/board.js` (render, grouping, drag-and-drop), `public/js/projects.js`
- `tests/` using `node:test` against the API with a temporary database
- `.gitignore` entries for `node_modules/` and `data/`; update `README.md` with the run command and which SQLite driver was used

Rules to follow:

- **SQL stays in the data-access layer.** No SQL strings in route handlers, validation or client code; routes call data-access functions. Use plain, portable SQL where possible (avoid SQLite-only features unless wrapped) so the layer can later be swapped for the BOE's SQL database.
- **No hard-coded status or type names** outside `server/statuses.js` and `server/types.js` (and tests/seed data). The client loads both lists from the API and renders columns, lanes, drop targets, form options and card styling by iterating them. Default status is the first status entry; default type is the entry marked default in the type list. Epic behaviour keys off the `isEpic` flag. Do not add `CHECK` constraints on status or type.
- **Archived projects:** enforce read-only in the data-access layer or a shared route guard (reject create/update/delete of work items when the project is archived), and in the UI disable dragging and hide edit controls. Status change to Planning or In Progress sets `archived = 0` in the same update.
- Check `node --version` before choosing the driver (v26.7.0 was installed when this spec was written, so `node:sqlite` is available), and keep `better-sqlite3` as the default unless there is a reason not to.

Suggested order:

1. Scaffold server, DB schema, status and type modules and seed users; project create/list/status/archive endpoints (including auto-unarchive) plus the project list page with the "Show archived" toggle (AC 1-10).
2. Work item create/edit/delete with key generation, type/status validation and the archived read-only guard (AC 11-18, 30), with a simple form driven by `GET /api/types`.
3. Static board with columns rendered from the status list, and cards with per-type styling (AC 19-21, 25-27).
4. Drag-and-drop between columns with optimistic update and rollback on failure (AC 22-23), then in-column ranking (AC 24).
5. Grouping control and swimlane rendering for Assignee, Epic, Priority (AC 31-34, 37).
6. Cross-lane drop semantics (AC 35-36).
7. Tests (AC 40, including tests that add a status and a type to their lists and exercise AC 28-29) and README run instructions (AC 39).

Implementation hint: compute lanes client-side from the project's full work item list (one fetch), and send a single `PATCH /api/issues/:id` containing both the status and the lane field on a cross-lane drop so the move is atomic. Use a gap-based integer rank (e.g. steps of 1000) to avoid renumbering on every reorder.
