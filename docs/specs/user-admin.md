# User Admin
Status: Draft
Date: 2026-10-28

**Extends the existing Admin-only Users page (`public/users.html`, `public/js/users.js`); no second page.** Builds on `docs/specs/permission-groups.md` (groups, `manage-users`, last-Admin rule, which deliberately left creating, renaming and deactivating users out: Decision 4) and `docs/specs/username-login.md` (passwordless sign-in picking a username; **not secure, on purpose**). Terminology: "work item". Acceptance criteria are numbered from 1 in this spec.

## Problem

The Users page can only change a user's group. There is no way in the app to add a person, fix a misspelt name or username, or retire someone who has left; the owner had to insert a user into the database by hand. Admins also cannot see what each group is allowed to do without reading `server/groups.js`.

## User stories

1. As an Admin, I add a user (name, optional username, group) from the Users page, and they can sign in straight away.
2. As an Admin, I fix a user's name or username.
3. As an Admin, I deactivate a user who has left, and reactivate them if they return. Their comments, assignments, time and history stay intact.
4. As an Admin, I see what Admin, Member and Viewer can each do, on the same page, so I pick the right level.
5. As an Admin, I cannot lock the system by deactivating or demoting the last Admin.

## Recommended scope (small)

Included: create, edit name/username, deactivate/reactivate, read-only permission matrix, last-Admin guards. Not included: delete, passwords, last-sign-in column, custom groups (see Out of scope).

Reasoning, from the code as it stands:
- **Deactivate, not delete.** `issues.assignee_id` / `reporter_id`, `comments.author_id` (NOT NULL), `test_cases.created_by_id`, `issue_test_cases`, `test_case_executions.tested_by_id`, `issue_history_events.actor_id`, `time_entries.user_id` and `sessions.user_id` all reference `users(id)`; several are NOT NULL with no ON DELETE action, so a delete would fail or orphan data. This also mirrors the project convention in CLAUDE.md (retire by status, do not delete).
- **A boolean `active` column**, not a status list: there are only two states and no workflow, so no single-source file is needed.
- **Permission levels are display only.** The matrix is read from `server/groups.js` through the API; no editable groups.
- **No "last active" column.** Sessions are deleted on sign-out and expiry, so `sessions.last_seen_at` is not a reliable last sign-in; it would need new tracking. Skipped.

## Acceptance criteria

### Creating a user

1. `POST /api/users` (needs `manage-users`) with `{ name, username?, group? }` returns 201 with `{ id, name, username, group, active: true }`. The new user appears in `GET /api/users`, in `GET /api/auth/users` (sign-in list), and can sign in with the returned username.
2. `name` is trimmed and required, 1 to 100 characters. Missing, blank or non-string: 400 `Name is required.` Longer than 100: 400 `Name must be 100 characters or fewer.`
3. `username` is optional. When omitted or blank, the server derives it from the name with the existing `deriveUsername` rule (first word, lower-cased, then `2`, `3`, ... if taken; `Eva Long` becomes `eva`, a second `Eva` becomes `eva2`). When given it is trimmed and must be 1 to 30 characters of letters, digits, `.`, `_` or `-`, else 400 `Username may only contain letters, digits, ".", "_" and "-" (1 to 30 characters).` The case is kept as typed; uniqueness is case-insensitive and includes deactivated users. A taken username: 409 `That username is already taken.` Nothing is created on any error.
4. `group` is optional and defaults to `defaultGroup()` (`Member`). An unknown group: 400 `Unknown group.` (the existing message).
5. A caller without `manage-users` gets 403 `Your group (<group>) is not allowed to manage users.` and nothing changes. Order of checks: 401, 403, then validation (as in Permission Groups AC 5).

### Editing a user

6. `PATCH /api/users/:id` is extended: the body may contain any of `name`, `username`, `group` (others ignored); each present field is validated as in AC 2 to 4, and only present fields change. Unknown user: 404 `User not found.` An empty body (no recognised field): 400 `Nothing to change.` Username unchanged by case only (`Alex` to `alex`) is allowed; a username used by another user: 409 `That username is already taken.`
7. Changing a username takes effect for the next sign-in. An already signed-in session keeps working (sessions are keyed by user id). Comments, history and work items show the user's current `name` where they join `users`; snapshot names already stored (history `actor_name`, time-entry `user_name`, attachment `uploader_name`) are not rewritten.
8. The last-Admin rule is unchanged: moving the only remaining Admin to another group returns 409 `There must be at least one Admin.` and changes nothing. An Admin may demote themself when another Admin exists.

### Deactivating and reactivating

9. `users.active` is 1 for every user, including all existing users after upgrade. `PATCH /api/users/:id` also accepts `{ active: true|false }` (a non-boolean: 400 `Active must be true or false.`).
10. Deactivating a user: (a) deletes all their sessions, so their next request on any open session returns 401 `Sign in required.`; (b) removes them from the sign-in list (`GET /api/auth/users`); (c) `POST /api/auth/login` with their username returns 401 `Unknown username.` (the same response as an unknown name, so the public API does not reveal deactivated users); (d) hides them from the assignee dropdown and from the default `GET /api/users` (AC 12). Reactivating reverses all four; their old sessions are not restored.
11. Deactivation never changes or removes anything the user owns: comments, assignments, reporter, links, attachments, time entries, test cases, executions and history rows remain and still show their name. A deactivated user who is a work item's assignee still shows as the assignee on the card and in the detail dialog.
12. `GET /api/users` returns only active users unless the caller has `manage-users` and passes `?include=inactive`, in which case it returns all, each with `active`. Every user object includes `active`. (Without the permission the query flag is ignored.)
13. A work item cannot be newly assigned to a deactivated user: `PATCH /api/issues/:id` or create with `assignee_id` of an inactive user returns 400 `That user is deactivated.` Re-saving an item whose assignee is already that deactivated user, with `assignee_id` unchanged, still succeeds.
14. Guards. Deactivating the last active user in a manager group (Admin): 409 `There must be at least one Admin.` An Admin deactivating themself: 409 `You cannot deactivate yourself.` (checked first). A deactivated Admin does not count towards the "at least one Admin" rule: `countAdmins` counts active users only, so moving or deactivating the last active Admin is refused even if an inactive Admin exists. Reactivating an already active user, or deactivating an inactive one, returns 200 and changes nothing.
15. A deactivated user can still be given a new group while inactive (the group is kept for reactivation); it does not count towards any rule.

### Permission matrix (read only)

16. `GET /api/groups` keeps returning the ordered group names for the existing client code unchanged; a new `GET /api/groups/permissions` (signed in) returns the matrix: `{ permissions: [{ name, label }], groups: [{ name, permissions: [name, ...] }] }` in the order of `server/groups.js`, where `label` is the human description of each permission (for example `write`: "Create and edit work items, comment, link and attach files"; `delete-item`: "Delete work items"; `manage-projects`: "Create, edit and archive projects"; `manage-users`: "Manage users and groups"). Labels live in `server/groups.js` next to the permissions (it already has `action` wording; add a `label` there). The client does not name any group or permission.
17. The Users page shows a "What each group can do" table: one row per permission, one column per group, with a tick or dash. It updates when `server/groups.js` changes (no client edit) and has no controls.

### Users page UI

18. The Users page keeps its table (Name, Username, Group dropdown, save status) and adds: an "Add user" form (Name, Username with placeholder "Leave blank to generate", Group dropdown defaulting to the default group returned by the API, "Add" button); an Edit control per row for name and username (inline, Save and Cancel); an Active/Deactivated indicator per row with a Deactivate/Reactivate button; and a "Show deactivated users" checkbox, off by default (when off, deactivated users are not listed).
19. Adding a user shows the new row at once (in `name` order like the list) and clears the form; a server error (400/409) shows the returned message under the form and keeps what was typed. After a successful add the page shows `Added <name> (<username>).`
20. Deactivate and Reactivate ask for confirmation (`Deactivate <name>? They will be signed out and cannot sign in until reactivated. Their work stays.`). Server refusals (AC 14) are shown in the existing error line and the row is unchanged. The Admin's own row has Deactivate disabled with a title explaining why. Demoting yourself asks `You are changing your own group. Continue?` before saving.
21. The existing behaviour is kept: group changes save immediately with the status text, and a non-Admin opening the page sees `Your group (<group>) is not allowed to manage users.` instead of the table, form and matrix.

### Data and migration

22. On start, `openDb` adds `users.active` (INTEGER NOT NULL DEFAULT 1) if missing, via the guarded `PRAGMA table_info` + `ALTER TABLE` pattern; it is idempotent and keeps every existing user active. A fresh database has the column and seeds all four users active.

### Tests

23. Automated tests (`npm test`, temporary database) cover at least: create with and without username and group (derived, duplicate-derived `eva2`, taken explicit 409 case-insensitive, bad characters, blank name, too long, unknown group, defaults to Member); the new user can sign in; non-Admin 403 on create/patch/deactivate with nothing changed; edit name, edit username (case-only change allowed, taken 409); empty body 400; deactivate removes sessions (open session gets 401), hides from `/api/auth/users`, default `/api/users` and login (`Unknown username.`), but is returned with `?include=inactive` and by the public list after reactivation; history, comments, assignee name and time entries survive deactivation; new assignment to an inactive user 400 but an unchanged existing assignee saves; last-Admin demote and deactivate 409; self-deactivate 409; inactive Admin not counted; permission matrix endpoint order and content, including an extensibility check that a temporarily added group appears; migration of an old database (existing users active, idempotent). A source test confirms no group names in `public/js/`. Browser behaviour (AC 17 to 21) is verified by QA.

## Data model changes

- **users**: add `active` INTEGER NOT NULL DEFAULT 1 (AC 22). No other table changes; no foreign key changes; no deletes.
- `server/groups.js`: add a `label` to each entry of `PERMISSIONS` and an exported `matrix()` (or similar) helper for AC 16.
- `server/data/users.js`: `listUsers` takes an include-inactive option and returns `active`; `listLoginUsers` returns active only; `countAdmins` counts active only; new `createUser`, `updateUser`, `setUserActive`, `usernameTaken`.
- `server/data/sessions.js` (and `server/auth.js`): a session whose user is inactive counts as absent; a function to delete all sessions of a user.
- `server/validation.js`: the assignee check rejects an inactive user (AC 13).
- API: new `POST /api/users`, `GET /api/groups/permissions`; changed `PATCH /api/users/:id`, `GET /api/users`, `GET /api/auth/users`, `POST /api/auth/login`.

## Out of scope

- Deleting users (they own too much history); a retired/cancelled status list for users.
- Passwords, invitations, email, SSO, password reset (sign-in stays the passwordless POC).
- Editable or custom groups, per-permission toggles, several groups per user (change `server/groups.js` to add one).
- Last sign-in or last-active column (needs new tracking; sessions are not a reliable record).
- Audit history of user changes (as with group changes in Permission Groups AC 19).
- Bulk import, avatars, profile photos, user self-service profile editing.
- Reassigning a deactivated user's open work items automatically.

## Open questions

1. **Is it acceptable that a deactivated user's open work items stay assigned to them?** Recommendation: yes (the card still shows their name; an Admin or Member reassigns when needed). A bulk "reassign" tool is out of scope.
2. **Should a changed name rewrite stored snapshot names (history actor, time-entry name, uploader)?** Recommendation: no; snapshots record who it was at that time, and live joins show the new name.
3. **Should the username rules be this strict (letters, digits, `.`, `_`, `-`, up to 30 characters)?** Recommendation: yes; it keeps sign-in and the URL-free list tidy, and existing seeded and derived usernames already comply except names with non-ASCII first words, whose derived username could fail the rule. Confirm, or relax the rule for derived names.
4. **Deactivated user typing their username on a typed-login screen: is `Unknown username.` clear enough?** Recommendation: yes for the POC (the sign-in page is pick-from-list, so it is rarely seen), and it avoids revealing deactivated names publicly.

## Designer needed: yes (extends an existing screen)

Design inputs for `docs/design/user-admin/` (follow `docs/design/STYLE.md`):
- Users page layout with four zones: the "Add user" form (inline row or collapsible panel above the table), the users table, the "Show deactivated users" toggle, and the "What each group can do" matrix (below the table or in a side panel).
- Table row states: normal, editing (name and username inputs with Save and Cancel), deactivated (muted row with a "Deactivated" tag and a Reactivate button), own row (Deactivate disabled), saving, error.
- The confirm dialogs for Deactivate/Reactivate and for self-demotion, and the inline error line and success message.
- The matrix: permissions as rows with plain-language labels, groups as columns, tick or dash cells, accessible without colour alone.
- Narrow-screen behaviour of the table with the extra actions column.

## Implementation notes for the developer

Files to touch: `server/db.js` (migration `migrateActive`, SCHEMA, seed), `server/groups.js` (labels, matrix helper), `server/data/users.js`, `server/data/sessions.js`, `server/auth.js`, `server/validation.js` (assignee), `server/routes/users.js` (POST, extended PATCH, `?include=inactive`, `/groups/permissions`), `server/routes/auth.js` (login for inactive), `server/routes/guards.js` (reuse `assertCan`), `public/users.html`, `public/js/users.js`, `public/css/app.css`, `public/js/board.js` only if the assignee dropdown needs the `active` flag (it should work unchanged from the default `GET /api/users`), `tests/users-admin.test.js` (new), `tests/permissions.test.js`, `tests/source.test.js`, `README.md` (how to add and deactivate users).

Rules: SQL only in `server/data/`; routes validate then call the data layer; no new dependencies; no group names in the client; the existing Permission Groups tests must keep passing (the last-Admin message and `GET /api/users` shape for active users are unchanged apart from the added `active` field).

Suggested order:
1. Migration and `active` column with tests (AC 22).
2. Data layer, `countAdmins` active-only, sessions invalidation, login and public list filtering (AC 10, 14).
3. `POST /api/users` and extended `PATCH` with validation and messages (AC 1 to 9, 14, 15).
4. `GET /api/users?include=inactive` and the assignee check (AC 12, 13).
5. `GET /api/groups/permissions` and labels (AC 16).
6. Server tests (AC 23), then wait for the chosen design.
7. Users page UI to the design (AC 17 to 21), then a QA browser pass as Admin, Member and Viewer.
