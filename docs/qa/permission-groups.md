# QA: Permission groups (docs/specs/permission-groups.md)

Status: COMPLETE (verdict below)
Date: 2026-10-25
Tester: QA agent (re-run after an interrupted QA)

## Setup and environment

- Working tree: /Users/robertmichaels/Documents/code/projectmanagement (uncommitted; not modified by QA).
- Clean copy for tests: a snapshot of the working tree (tar, excluding .git and node_modules, with node_modules symlinked to the project's) under the QA scratchpad, `git init` + one commit so the git check-ignore test runs. Copy path: /private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/copy
- Scratch server: port 3002, run from the copy, DB_PATH = scratchpad/scratch.db (a `sqlite3 .backup` copy of data/app.db taken before any group change), FILES_DIR = scratchpad/files (copy of data/files). Port 3001 and 3000 were not touched; data/app.db and data/files/ were only read.
- Lint/typecheck: none configured (package.json has only `start` and `test`).

## Automated tests

| Command | Where | Result |
|---|---|---|
| `npm test` | clean copy | tests 260, pass 260, fail 0 (exit 0) |

## API checks (scratch server 3002, scratch DB)

Scratch state: alex Admin, blake Member, casey set to **Viewer** via `PATCH /api/users/3` by alex (200); dana Member. Scripts and logs are in the QA scratchpad (`matrix.log`, `order.log`, `archived.log`).

Write matrix, per group (Admin = alex, Member = blake, Viewer = casey). Allowed means the group check passed; the response for Member/Admin is the normal success or a later validation error where the probe body was not valid for that route (for example `Link type` names).

| Route | Admin | Member | Viewer |
|---|---|---|---|
| POST /api/projects/1/issues | 201 | 201 | 403 "...not allowed to edit work items." |
| PATCH /api/issues/:id | 200 | 200 | 403 edit work items |
| POST /api/issues/:id/comments | 201 | 201 | 403 edit work items |
| PATCH / DELETE own comment | 200 / 204 | 200 / 204 | 403 edit work items |
| PATCH / DELETE others' comment | 403 "You can only change your own messages." | 403 (alex's comment) | 403 edit work items |
| POST /api/issues/:id/attachments (own) | 201 | 201 | 403 edit work items |
| DELETE others' attachment | 403 "You can only delete your own attachments." | 403 | 403 edit work items |
| DELETE /api/issues/:id | 204 | 403 "...not allowed to delete work items." | 403 "...delete work items." |
| POST /api/projects; PATCH /api/projects/1 | 201/400 (validation after group); 200 | 403 "...manage projects." | 403 "...manage projects." |
| PATCH /api/users/3 | 200 | 403 "...manage users." | 403 "...manage users." |
| Any write with no cookie | 401 "Sign in required." | 401 | 401 |

Link POSTs were probed with an invalid link type name first, so the link-create row for Member/Admin is re-verified in the order checks (see below) rather than taken from the first run.
Note: the first matrix run had fixture-reuse artefacts (attachment ids are reused by SQLite after deletes), so ownership rows were re-run with fresh fixtures in `order.log`.

Order of checks (order.log, archived.log):

| Check | Expected | Got |
|---|---|---|
| Viewer PATCH/DELETE/POST on unknown item, comment, attachment, link | 403 | 403 (all six) |
| Member PATCH unknown item | 404 | 404 "Work item not found." |
| Viewer PATCH with invalid body | 403 | 403 |
| Member PATCH with invalid body | 400 | 400 |
| Member PATCH alex's comment with empty body | 403 (ownership before 400) | 403 |
| Viewer upload with disallowed type | 403 (group before 415) | 403 |
| Member upload with disallowed type | 415 | 415 |
| Member PATCH/POST on archived project | 409 | 409 (PATCH, comment, new item, comment delete) |
| Admin PATCH on archived project item | 409 | 409 |
| Viewer on archived project | 403 | 403 |
| Member GET archived item | 200 | 200 |
| Member on alex's comment / attachment | 403 ownership | 403 |
| Admin on blake's comment / attachment | 403 ownership (no override) | 403 (edit, delete comment; delete attachment) |

Viewer read sweep (gets.log): 200 for /projects, /projects/1, /projects/1/issues, /issues/1, /issues/5, comments, links, history, attachment list and details, download (pdf, png, txt), image preview, all meta lists, /groups, /users (has `group`), /auth/me. Preview of a PDF is 415 (expected: not an image). `/issues/1/children` 404 "Epic not found." (issue 1 is not an epic; expected).
Open session (AC 11): casey signed in as Member, POST comment 201; alex sets casey to Viewer; the same cookie's next POST 403 "Your group (Viewer) is not allowed to edit work items." without sign-in. PASS.
`GET /api/auth/users` (public) has no `group` field. `GET /api/auth/me` returns `group` and `permissions`. Anonymous writes and `GET /api/users`, `/api/groups` return 401.

## Browser pass (headless Chrome 155 over CDP, scratch server 3002)

Driver: scratchpad scripts (`cdp.js`, `viewer.js`, `viewer2.js`, `usersviewer.js`); each group signs in through `POST /api/auth/login` in its own browser context (the same cookie the sign-in page sets; the sign-in page itself was loaded first). Screenshots are in the scratchpad.

### Viewer (casey, set to Viewer on the Users page via API before this run)

- PASS AC14 header reads `Signed in as Casey Rivera (Viewer)`.
- PASS AC16 no `#users-link` on projects, board or detail pages.
- PASS AC16 projects page: no "New project" control, no status select, no edit control. The only "archive"-matching element is the `Show archived` filter checkbox, which is a read-only filter (not an archive control).
- PASS AC15 board: no New work item button; cards are not `draggable`; a real mouse drag over the board sent no write request.
- PASS AC15 detail dialog: only Discussion, History and Close buttons; all fields are read-only; no description Edit button; no comment form, link form or attachment add/delete controls.
- PASS AC15 discussion: no post form; casey's own old message (posted while Member) is visible, attributed to "Casey Rivera", and has no Edit or Delete buttons. Other users' messages are visible and attributed.
- PASS AC15 attachments: Download links only (fetch returns 200, text/plain); no delete or add controls.
- PASS AC15 links: "No links." with no add form and no Remove buttons.
- PASS AC1 History tab readable (events listed with actors).
- PASS AC15 a synthetic paste (image) and a file drop on the attachments section sent no request.
- PASS AC18 a replayed `PATCH /api/issues/11` from the page context returns 403 `Your group (Viewer) is not allowed to edit work items.`
- PASS AC15 epic view (My first Epic) is visible with no add/create-child controls. Note: that epic has no children, so the child-control path was only checked for absence.
- PASS AC17 `/users.html` shows the error line `Your group (Viewer) is not allowed to manage users.` with no table and no Users link in the header.
- Viewer API read sweep (above) 200.


### Member (blake)

- PASS AC14 header `Signed in as Blake Chen (Member)`; no Users link (AC16).
- PASS AC16 projects page: no New project, status or archive/edit controls.
- PASS AC15 board: "Create work item" button shown; cards draggable.
- PASS AC15 drag: synthetic HTML5 drag/drop of "QA order probe" to In Progress was accepted and the server status became In Progress. Caveat: a real OS-level mouse drag was not used (headless Chrome HTML5 drag is unreliable through CDP), so the drag path was exercised through the same `dragstart`/`dragover`/`drop` listeners.
- PASS AC15/16 detail dialog: Save, description Edit, comment form, link form and attachment add shown; Delete hidden.
- PASS AC15/19 discussion: blake's own message has Edit and Delete; Casey's and Alex's messages have none.
- PASS attachments: blake's own `fb.txt` has Delete; alex's `fa.txt` has none.
- PASS AC17 `/users.html` shows the error line for a Member.

### Admin (alex)

- PASS AC14 header `Signed in as Alex Morgan (Admin)`; Users link present; New project and status/archive controls present (AC16).
- PASS AC17 Users page: four rows (name, username, group); each group is a dropdown with `Admin, Member, Viewer` from `GET /api/groups`.
- PASS AC17 changing casey's dropdown to Viewer shows `Saved: Viewer`; later changed back to Member (`Saved: Member`).
- PASS AC9/17 demoting the only Admin (alex to Member) shows `Could not change Alex Morgan's group: There must be at least one Admin.` and the dropdown reverts to Admin. (The message has the developer's prefix; the required text is present verbatim.)
- PASS AC11 open session: casey's page was loaded as Member (drag affordance present); Admin set casey to Viewer; casey's still-open page then dragged a card: the board showed `Could not move PMPO-9: Your group (Viewer) is not allowed to edit work items.` and the status stayed In Progress (card snaps back); the replayed PATCH on the same cookie returned 403. After Admin set casey back to Member, the same open session posted a comment and got 201, with no sign-in.
- PASS AC19 Admin cannot edit or delete Casey's or Blake's messages (no buttons) and cannot delete blake's attachment (no Delete); Admin's own message has Edit and Delete.


### Other browser checks (Admin, same run)

- PASS AC16 Admin creates a project through the New project form (`QA UI Project`, opens its board).
- PASS Edge: an empty board (new project, no items) renders with 0 cards, the Create button and no error.
- PASS Edge: a 200-character work item title creates and renders in its card without horizontal overflow.
- PASS AC16 Admin Delete in the detail dialog removes the card from the board.
- PASS Edge: dropping a card onto its own column is a quiet no-op (no error message, no change).
- PASS Delete of an item with a link (API, `delink.js`): Member gets 403 and nothing changes; Admin gets 204, the link row is removed (issue 1 links 1 to 0), and the partner history event on the other item records the actor (Alex Morgan, id 1).


## Denied writes change nothing (denied.js)

Viewer (casey) POST comment, POST link, POST attachment (bytes and file), PATCH item, DELETE item, POST project, and Member (blake) DELETE item: all 403. Row counts before and after (comments, links, attachments, history events, items, projects, history changes) and the number of files in FILES_DIR were identical (8, 1, 4, 33, 12, 4, 26; 5 files). PASS AC6, AC19.

## Users API and unknown group (edge.js, scratch DB only)

- PASS AC9 `PATCH /api/users/:id` with `{group:'Owner'}` or no group: 400 `Unknown group.`; unknown user: 404; extra fields (`name`, `username`) ignored; Admin change returns `{id,name,username,group}`.
- PASS AC9 Member `GET /api/users` 200 (open to signed-in users; includes `group`).
- PASS Deviation (unknown stored group): a user whose stored group is `Ghost` (set directly in the scratch DB only) gets `permissions: []` from `/api/auth/me`, reads still return 200, writes return 403 `Your group (Ghost) is not allowed to edit work items.`, and the Admin can move the user to a known group.
- PASS AC9 the last-Admin rule: alex (the only Admin) demoted to Viewer while the others were Members returns 409 and alex stays Admin.

## Migration on a DB copy (migrate.js, migrate.db)

Copy of the pre-change `data/app.db` (taken with `sqlite3 .backup`, the real file was only read):

- PASS AC12 first open adds `group_name`: alex Admin; blake, casey, dana Member (the lowest-id user is the only Admin).
- PASS AC12 counts before and after open, and after a second open: issues 6, comments 2, attachments 2, history events 9, links 1, projects 2, users 4. Unchanged.
- PASS AC12 idempotent: a second open does not re-promote anyone. With alex set to Viewer in the copy, reopening leaves alex as Viewer and there is still one column (no new Admin).
- PASS AC12 fresh database seeds alex Admin, blake/casey/dana Member.

## Source checks

- PASS AC2 `server/` contains no group name outside `server/groups.js` and `server/db.js` (grep; `server/data/users.js` only uses the word in an identifier `countAdmins`). `tests/source.test.js` (permission groups AC 2) passes.
- Minor (non-blocking): comments in `public/js/users.js:1`, `public/js/users.js:42` and `public/js/board.js:136` contain the words "Admin" and "Viewer". Comments are not string literals, so the source test allows them; the spec's wording "no group name appears in public/js/" is literally broken by comments only.
- PASS AC2 the client compares no group (`/\.group\s*[!=]==?/` test passes); session.js uses `session.can(permission)`.

Additional API check: a Member add link (`Blocks`, valid) 201 and remove 204; denied and allowed link paths confirmed.

## Developer deviations (judged)

1. **`groups.js` exports `GROUPS` and `groupNames()`** instead of only the name list. Acceptable: `groupNames()` is the ordered name list AC 1 asks for, `GROUPS` is in the same single-source file and never reaches the client (`/api/auth/me` returns only the permission names).
2. **Last-Admin message built from `managerGroups()`**: produces exactly `There must be at least one Admin.` today and stays in the single source. Acceptable.
3. **Users page shows the not-allowed message client-side** (`public/js/users.js` checks the permission from `session`, and `GET /api/users` stays open): acceptable. The page shows the error line and no table (AC 17), and the server's own 403 for `PATCH /api/users/:id` was verified by API and by the replayed-write path. The text names the group only via the session, not by comparing groups.
4. **"Every write 403 says 'edit work items'" is not what the code does, and the handoff description is wrong.** The code uses the action for each permission: `edit work items` (write), `delete work items` (delete-item), `manage projects`, `manage users`. Verified by API (see matrix). This matches the spec's `<action>` format, so I judge it correct; the developer's note should be corrected in the handoff.
5. **Unknown stored group has no permissions**: verified (`Ghost` gives `permissions: []`, writes 403, reads 200). Acceptable.

## Acceptance criteria

| AC | Result | Reason |
|---|---|---|
| 1 | PASS | `server/groups.js` defines the names (Admin, Member, Viewer), `isValidGroup`, `defaultGroup()` = Member, `can()`, the four permissions, and their mapping. (Exports `groupNames()`; see deviation 1.) |
| 2 | PASS | Grep and `tests/source.test.js` (permission groups AC 2): no quoted group name in `server/` (outside groups.js, db.js) or `public/js/`. Only comments mention "Admin"/"Viewer" (non-blocking, see Notes). Client compares no group. |
| 3 | PASS | `GET /api/groups` → `["Admin","Member","Viewer"]`. |
| 4 | PASS | 403 text `Your group (Viewer) is not allowed to edit work items.` etc. from `assertCan`; `project` argument accepted and ignored. |
| 5 | PASS | Order verified: Viewer on unknown item/comment/attachment/link gets 403 (not 404); Member PATCH on unknown item 404; Member invalid body 400 after group; Member on alex's comment with empty body 403 (ownership before 400); Viewer bad upload 403 before 415; Member archived 409; Viewer archived 403. Code order in comments/attachments/links handlers matches (group, load 404, ownership, archived, validation). |
| 6 | PASS | Write matrix run for Admin, Member and Viewer on every AC 6 route: allowed for the right groups, 403 with the message for denied; no row/file/history change for denied (denied.js). Delete: Member/Viewer 403, Admin 204. Projects and users: Member/Viewer 403. |
| 7 | PASS | Every GET 200 for Viewer incl. download, preview, history, links, epic children (gets.log); group read from `users` on each request (open-session test). |
| 8 | PASS | Admin on blake's comment/attachment 403 ownership; Member on alex's comment/attachment 403; archived project 409 for Member and Admin. |
| 9 | PASS | Admin PATCH returns `{id,name,username,group}`; unknown user 404; unknown or missing group 400 `Unknown group.`; extra fields ignored; last Admin demotion 409 and nothing changes (alex stayed Admin). Member/Viewer 403. |
| 10 | PASS | `GET /api/users` has `group`; `GET /api/auth/users` has no `group` key. |
| 11 | PASS | Open session: casey Member → POST 201; set Viewer → same cookie POST 403 with no sign-in; set back to Member → same cookie POST 201. Browser: Admin's casey change applied to the open page. |
| 12 | PASS | Migration on DB copy: `group_name` added; alex Admin, others Member; counts unchanged (issues 6, comments 2, attachments 2, history events 9, links 1, projects 2, users 4); second open no change; alex set to Viewer and reopened stays Viewer (no re-promotion). Fresh DB: alex Admin, others Member. |
| 13 | PASS | Column `group_name`; API field `group`. |
| 14 | PASS | `/api/auth/me` → `{id,name,username,group,permissions}`; header `Signed in as <name> (<group>)` for Viewer, Member, Admin. Hiding is driven by `permissions`. |
| 15 | PASS | Browser per group (see sections above): Viewer: no create, no drag affordance, drag sends no request, read-only detail, no Save/Delete/description Edit, no discussion form, no edit/delete on own old message, no link form/remove, no attachment add/delete, paste and file drop send no request, History and downloads work. Member: create/drag/comment/link/attach shown; Delete hidden. |
| 16 | PASS | Delete button hidden for Member and Viewer; project controls (New project, status, archive/edit) hidden for Member and Viewer, shown for Admin; Users link only for Admin. |
| 17 | PASS | Admin Users page: 4 rows, dropdowns from `/api/groups`; `Saved: Viewer`; last-Admin demotion shows `Could not change Alex Morgan's group: There must be at least one Admin.` and reverts to Admin. Viewer and Member see the error line and no table. (Message prefix is the developer's wording; required text present.) |
| 18 | PASS | Admin changed casey to Viewer while casey's page had the drag affordance; the drag showed `Could not move PMPO-9: Your group (Viewer) is not allowed to edit work items.` and the status stayed In Progress. Replayed PATCH returned the same 403. |
| 19 | PASS | Denied requests write nothing (denied.js); Admin cannot edit/delete others' messages or attachments (browser and API); allowed writes record the actor (Admin delete's partner history event shows Alex Morgan); group changes are not in any history. |
| 20 | PASS | Code review: `assertCan(user, permission, project)` takes `project` and ignores it; no `project_members` table; `can()` is the only decision point. |
| 21 | PASS | `npm test` 260/260 in a clean copy, including the matrix, coverage guard, ordering, reads, groups, `/api/auth/me`, migration, extensibility and the source test. QA's API and browser runs reproduce the same behaviour. |

Browser UI criteria 14-18 were checked by QA in headless Chrome as each group (see sections above).

## Notes (non-blocking)

- Comments in `public/js/users.js` (line 1 and 42) and `public/js/board.js` (line 136) contain the words "Admin"/"Viewer". The source test allows comments, so the test passes; the spec's wording "no group name appears in public/js/" is literally broken by comments. Suggest rewording to "an administrator" next time.
- The synthetic HTML5 drag (dragstart, dragover, drop events) was used for Member and Admin drags; a real OS-level mouse drag was not exercised.
- `data/app.db` mtime changed to 17:00 during the QA window. QA only read it (`sqlite3 .backup`); every QA request went to port 3002. The change is most likely the live 3001 server (PID 48414, committed code) writing sessions. Restarting 3001 on the new code will run the migration on the real DB (already verified on a copy).
- Scratch DB state at the end: alex Admin, blake Member, casey Member, dana Member; QA created probe items and comments in the scratch DB only.

## Not tested

- Real OS-level mouse drag in the browser; Safari/Firefox; a real Cmd+V screenshot paste (synthetic ClipboardEvent only).
- Archive and unarchive through the UI (the controls are shown; the API path was verified).
- Restart of 3001 and the migration on the real `data/app.db` (out of scope: the owner's live DB was not written).
- Lint and typecheck: none configured.
- Demoting an Admin via the UI while a second Admin exists (API covered by npm test).

## Summary

- `npm test` (clean copy, 260 tests): 260 pass, 0 fail.
- All 21 acceptance criteria PASS; the browser checks per group PASS.
- No blocking defects found. The deviations are acceptable.

VERDICT: GO
