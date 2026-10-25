# Permission Groups
Status: Approved for build
Date: 2026-10-25

**Builds on the implemented code and on `docs/specs/username-login.md`, `docs/specs/work-item-links.md` and `docs/specs/ticket-history.md`, and on `docs/specs/attachments-and-pasted-images.md` (being built now), as read-only references.** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "Login AC n", "History AC n".

**Build order: do not start until the attachments work and `docs/specs/epic-view.md` are both committed.** All three edit `public/js/board.js` and `public/board.html`.

It reuses: the single-source list style of `server/statuses.js`; `req.user` and `server/auth.js` (the hook Login left: "permission groups later add `groups`/`permissions` to that object inside `server/auth.js`"); `server/routes/guards.js` (`assertWritable`, `assertOwnsComment`, `assertOwnsAttachment`, `actorFrom`); `ValidationError` for 403s; `/api/auth/me` and `public/js/session.js` for the UI.

## Problem

Every signed-in user can do everything: delete work items, create and archive projects, change anything (Login AC 22). The owner wants three levels of access, enforced by the server and reflected in the UI: Admins run the system, Members do the day-to-day work, Viewers only look.

## User stories

1. As a Viewer, I can open projects, boards and work items and read everything (description, comments, links, history, attachments), but nothing I see lets me change data.
2. As a Member, I create and edit work items, move them across the board, comment, link and attach files, but I cannot delete work items or manage projects.
3. As an Admin, I can do everything a Member can, and also delete work items, create/edit/archive projects, and change which group each user is in.
4. As an Admin, I open a Users page, see every user with their group, and change a group from a dropdown.
5. As a user whose group changes, I see the new access on my next request or page load, without signing in again.
6. As the owner, I add a group (or change what a group may do) in one file.
7. As the owner, I can later add per-project membership without reworking the checks.

## Decisions (made by the owner; no longer open)

1. **Global groups, one per user.** Not per project. Starting set: Admin, Member, Viewer.
2. **Admin extras are exactly:** delete work items; create, edit and archive projects; manage users' groups. Admin does **not** override authorship: only the author edits or deletes a comment, only the uploader deletes an attachment (Login AC 20, attachments spec).
3. **Groups live in a single-source file**, `server/groups.js`, like `statuses.js`.
4. **"Manage users" means changing a user's group only.** Creating, renaming and deactivating users are not part of this spec.
5. **Migration:** the lowest-id user (`alex` on the seeded database) becomes Admin; all other existing users become Member.
6. **No Viewer is seeded on a fresh database** (`alex` Admin, the rest Member). Viewer is demonstrated by changing a group on the Users page.
7. **The Users page is Admin only.** `GET /api/users` stays readable by all signed-in users (the assignee dropdown needs it).
8. **A Viewer's existing comments stay visible and attributed**; nothing is rewritten, they just cannot be edited while the user is a Viewer.

## Permission matrix

| Action | Admin | Member | Viewer |
|---|---|---|---|
| Read anything (projects, boards, items, comments, links, history, attachments, downloads) | yes | yes | yes |
| Create / edit work item, move on board | yes | yes | no |
| Comment (post); edit/delete own comment | yes | yes | no |
| Add / remove link | yes | yes | no |
| Upload attachment; delete own attachment | yes | yes | no |
| Delete work item | yes | no | no |
| Create / edit / archive project | yes | no | no |
| Change a user's group | yes | no | no |

"Own" rules still apply on top: a Member cannot touch someone else's comment or attachment, and neither can an Admin.

## Acceptance criteria

### Groups (single source) and data

1. `server/groups.js` is the only place group names and what they may do are defined. It exports the ordered list of group names (`Admin`, `Member`, `Viewer`), `isValidGroup(name)`, `defaultGroup()` (`Member`), and `can(group, permission)`. Permissions are a small fixed set of names kept in the same file: `write` (create/edit/move work items, comment, link, attach), `delete-item`, `manage-projects`, `manage-users`. `Admin` has all four, `Member` has `write`, `Viewer` has none. Adding a group or changing its permissions is a change to this file only.
2. No group name appears in `server/` outside `server/groups.js` (and the seed and migration in `server/db.js`, which may import from it), or in `public/js/`; a source test enforces this like `tests/source.test.js`. The client never compares against a group name; it uses the permission list from `/api/auth/me` (AC 14).
3. `GET /api/groups` (signed in) returns the group names in order, for the Users page dropdown.

### Enforcement on the server

4. A guard `assertCan(user, permission, project)` in `server/routes/guards.js` throws `ValidationError` with status 403 and the message `Your group (<group>) is not allowed to <action>.`, for example `Your group (Viewer) is not allowed to edit work items.` The optional `project` argument is accepted and ignored for now (AC 20). Routes call it first, before loading records.
5. Order of checks on every write: sign-in 401, group 403, record exists 404, ownership 403 (comments, attachments), archived project 409, then field validation 400. A Viewer is told 403 even for an unknown id or an archived project; nothing is revealed or changed.
6. These routes require the permission shown; a user without it gets 403 and nothing changes (no data, no file, no history event, no link row):
   - `write`: `POST /api/projects/:id/issues`, `PATCH /api/issues/:id`, `POST /api/issues/:id/comments`, `PATCH /api/comments/:id`, `DELETE /api/comments/:id`, `POST /api/issues/:id/links`, `DELETE /api/issues/:id/links/:linkId`, `POST /api/issues/:id/attachments`, `DELETE /api/attachments/:id`.
   - `delete-item`: `DELETE /api/issues/:id`.
   - `manage-projects`: `POST /api/projects`, `PATCH /api/projects/:id` (name, status and archive alike).
   - `manage-users`: `PATCH /api/users/:id` (AC 9).
7. Every `GET` route stays open to all three groups. The group is never read from the request; it is looked up from `users` on each request (AC 11).
8. Existing ownership and archived rules are unchanged: an Admin or Member who is not the author still gets 403 `You can only change your own messages.` / `You can only delete your own attachments.`; an archived project still gives 409 on writes (Login AC 21).

### Changing a group

9. `PATCH /api/users/:id` with `{ group }` (Admin only) returns 200 with the user `{ id, name, username, group }`. Unknown user 404; missing or unknown `group` 400 (`Unknown group.`). Any other body field is ignored. An Admin may change their own group, except that changing the **last remaining Admin** to anything else returns 409 (`There must be at least one Admin.`) and changes nothing.
10. `GET /api/users` returns `group` for each user (all signed-in users may read it). `GET /api/auth/users` (the public sign-in list) does not include `group`.
11. A group change takes effect on that user's next request, including requests on a session that is already open (no sign-out needed). It does not touch their comments, assignments, reporter or history.

### Existing data and seed

12. On start, `openDb` adds `users.group_name` if missing (idempotent, `PRAGMA table_info` check, like `migrateUsername`). Existing users become `Member`; the user with the lowest `id` (the oldest, `alex` on the seeded database) becomes `Admin`, but only when the column is first added and no Admin exists. A fresh database seeds `alex` as Admin and the other three as Member. Existing comments, items and history are untouched. After upgrade there is always at least one Admin.
13. The column is named `group_name` because `group` is an SQL keyword; the API field is `group`.

### UI

14. `GET /api/auth/me` returns `{ id, name, username, group, permissions: [...] }`, where `permissions` is the list of permission names the user's group has. `session.js` exposes it; all hiding below is driven by `permissions`, and the header reads `Signed in as <name> (<group>)`.
15. Without `write`: the "New work item" control, card dragging, and Save/Delete-comment/Edit-comment controls are hidden or disabled; the detail dialog shows the fields read-only (no Save); the discussion post form, "Add link" form and Remove buttons, and "Add files"/Delete attachment controls are not shown. Reading everything (including History, downloads, previews) still works. The board shows no drag affordance and a drop never starts a request.
16. Without `delete-item`: the work item Delete button is not shown. Without `manage-projects`: "New project", project edit, status change and archive/unarchive controls are not shown on the projects page or the board header. Without `manage-users`: there is no Users link in the header.
17. With `manage-users`, a "Users" link in the header opens `public/users.html`: a table of every user (name, username, group) where the group is a dropdown filled from `GET /api/groups`. Changing the dropdown sends `PATCH /api/users/:id` immediately, shows the saved group, and on an error (for example the last-Admin 409) shows the message and reverts the dropdown. Typing the URL as a non-Admin shows the page with an error line instead of the table (the API returns 403); no user data beyond what `GET /api/users` already gives is exposed.
18. If the server still returns 403 for an action (for example the group was changed in another browser), the client shows the returned message in the same place it shows other errors and leaves the UI state unchanged (a failed drag snaps the card back, as for other errors).

### History and actor

19. Denied requests write nothing, including no history event. Allowed writes record the actor exactly as before (`actorFrom(req)`); an Admin deleting a work item is the actor on the delete's partner/child events (History, Links AC 17). Group changes are not recorded in any history (no user or project feed exists; see Out of scope). Group is not stored on history events: past events keep their actor name only.

### Hook for per-project membership (not built)

20. `assertCan(user, permission, project)` already takes `project`; `can(group, permission)` is the only place that decides. Later, a `project_members` table (`project_id`, `user_id`, role) would be consulted inside `assertCan` when a project is passed, giving an effective role of the global group or the project role. No route changes shape, and `req.user.permissions` stays the global default. This spec creates no membership table, no project parameter use, and no UI for it.

### Tests

21. Automated tests (`npm test`, `node:test`, temporary database) cover at least:
    - **Route matrix:** one table-driven test listing every write route in AC 6 with a valid request, run once per group (Admin, Member, Viewer) with the expected status (2xx/204 for allowed, 403 with the message for denied). For each denied case, assert nothing changed (item, comment, link, attachment and history counts unchanged).
    - **Coverage guard:** a test that walks the Express router and fails if any non-GET route is neither in the matrix nor in the public auth list (so a future write route cannot silently skip a check).
    - Order of checks: Viewer on an unknown id gets 403 not 404; Member on someone else's comment gets 403 (ownership); Admin on someone else's comment and attachment still gets 403; Member on an archived project gets 409.
    - Reads: all `GET` routes return 200 for a Viewer, including attachment download and history.
    - Groups: `GET /api/groups` order; `PATCH /api/users/:id` by Admin works and shows in `GET /api/users`; by Member and Viewer 403; unknown group 400; last-Admin demotion 409, and succeeds once a second Admin exists; effect on an already-open session (AC 11).
    - `/api/auth/me` returns `group` and `permissions`; the public `/api/auth/users` has no `group`.
    - Migration: an old database with no `group_name` opens with everyone Member and exactly one Admin (lowest id), is idempotent on a second open, and keeps comments and items intact.
    - Extensibility: temporarily add a group with chosen permissions to the list and show the guard honours it (as `extensibility.test.js` does); source test for AC 2.
    - UI behaviour (AC 14-18) is verified by QA in the browser, once per group.

## Effect on existing tests

`tests/helpers.js` signs in as `alex` by default, who is now Admin, so existing tests pass unchanged. The new tests sign in as `blake`/`casey` and change groups through the data layer or `PATCH /api/users/:id`. The developer should check for existing tests that sign in as other seeded users and expect writes to work; the seed keeps those as Member, so they should too.

## Data model changes

- **users**: add `group_name` TEXT NOT NULL DEFAULT `'Member'`. No CHECK constraint (same as statuses and types); validity is checked in code against `server/groups.js`. Added by a guarded `ALTER TABLE` in `server/db.js` with the backfill in AC 12; the fresh-database `SCHEMA` and `SEED_USERS` include it.
- New single-source file `server/groups.js` (AC 1).
- `server/data/users.js`: `listUsers`/`getUser` return `group`; new `setUserGroup(db, id, group)` and `countAdmins(db)`. `listLoginUsers` unchanged. All SQL stays in `server/data/`.
- `server/auth.js`: `req.user` gains `group` and `permissions`, read from the user row each request.
- API: new `GET /api/groups`, `PATCH /api/users/:id`; changed `GET /api/users`, `GET /api/auth/me`; 403 added to the write routes in AC 6. No change to `projects`, `issues`, history or sessions tables.

## Out of scope

- Per-project roles or membership, hiding projects from users (the hook is AC 20; project-level authentication is the next step after this).
- Several groups per user, custom or editable groups in the UI (add one in `server/groups.js`), per-permission toggles.
- Creating, renaming or deactivating users (Decision 4), passwords, SSO.
- Admin override of others' comments or attachments (Decision 2).
- Audit trail or history of group changes; a project or user activity feed.
- Restricting reads (a Viewer sees everything a Member sees), field-level permissions, "own items only" rules, assignee-based rules.
- Rate limiting, CSRF, or any security hardening beyond the 403 checks (Login's "not secure on purpose" caveat still stands).

## Open questions

None. The owner accepted all five recommendations (Decisions 4-8).

## Implementation notes for the developer

Files to touch: `server/groups.js` (new), `server/db.js`, `server/data/users.js`, `server/auth.js`, `server/routes/guards.js`, `server/routes/projects.js`, `server/routes/issues.js`, `server/routes/comments.js`, `server/routes/links.js`, `server/routes/attachments.js`, `server/routes/meta.js` (groups, users patch; or a small new `server/routes/users.js` mounted in `server/app.js`), `public/js/session.js`, `public/js/board.js`, `public/js/projects.js`, `public/board.html`, `public/index.html`, `public/users.html` and `public/js/users.js` (new), `public/js/api.js` (surface 403 messages), `public/css/app.css`, `tests/helpers.js`, `tests/permissions.test.js` (new), `tests/source.test.js`, `README.md` (groups and how to change one).

Rules: SQL only in `server/data/`; no new dependencies; no group names in the client; routes call guards then the data layer.

Suggested order:

1. `server/groups.js` and its unit tests (AC 1-3).
2. Schema, seed and migration for `group_name`, with migration tests (AC 12-13).
3. `server/data/users.js` and `server/auth.js` (`req.user.group` and `permissions`); `/api/auth/me`, `/api/users`, `/api/groups` (AC 3, 10, 14).
4. `assertCan` in `guards.js`, then wire it into every write route in AC 6 as the first line of each handler, in the order of AC 5.
5. `PATCH /api/users/:id` with the last-Admin rule (AC 9, 11).
6. The route matrix and coverage-guard tests (AC 21); fix any route they find unguarded.
7. UI: header group and Users link; hide/disable controls by permission (AC 14-16, 18); then the Users page (AC 17). Start only after attachments and the epic view are committed, since this touches `board.js` and `board.html` in the same places.
8. Source checks, README note, and a manual browser pass as each group: Viewer sees no controls and gets 403 via a replayed request; Member cannot delete or manage projects; Admin changes a user's group and the change applies to an already-open session.
