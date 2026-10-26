# projectmanagement

A proof-of-concept, Jira-style project management tool: work items, a kanban board, and swimlanes (by assignee, epic or priority), built because Jira is too expensive for a personal project.

Status: board MVP implemented (spec: `docs/specs/board-mvp.md`), plus a Discussion thread on each work item (spec: `docs/specs/ticket-discussion.md`) a Resolution on done work items (spec: `docs/specs/resolution-and-comments.md`), a username sign-in (spec: `docs/specs/username-login.md`), a History of changes on each work item (spec: `docs/specs/ticket-history.md`), Links between work items (spec: `docs/specs/work-item-links.md`), Attachments and pasted images (spec: `docs/specs/attachments-and-pasted-images.md`), and Permission groups (spec: `docs/specs/permission-groups.md`).

## Run

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Then open http://localhost:3000. If port 3000 is taken, run `PORT=3001 npm start` instead.

The database is a single local SQLite file, `data/app.db` (git-ignored). It is created with an empty schema and the seeded users on first start. New tables (such as `comments` for the Discussion, `sessions` for sign-in and `issue_history_events`/`issue_history_changes` for History, `issue_links` for Links, `attachments` for Attachments) and columns (such as `issues.resolution`, `users.username`, `issues.reporter_id` and `users.group_name`) are added to an existing database automatically on the next start; when the `resolution` column is added, work items already in the last status get the default resolution, and existing users get a username from the first word of their name (`Alex Morgan` becomes `alex`; duplicates get `2`, `3`, ...). Work items that existed before History was added get no backfilled history; theirs starts with the next change. Delete it and restart to start fresh. Set `DB_PATH` to use a different file.

Attachment files are stored in `data/files/` (git-ignored, created on start), one file per attachment named by a random key; set `FILES_DIR` to use a different directory. Back it up together with `data/app.db`.

## Signing in

**This sign-in is not secure, on purpose.** There is no password: anyone who can reach the server can sign in as any user. It only tells the app who is acting (comment authors, who may edit a message, who reported a work item) and which permission group applies (see Permission groups). Do not expose the server to the internet or use it with real or sensitive data. There is no HTTPS, no CSRF token (only `SameSite=Lax`) and no rate limiting.

Opening any page sends you to `/login.html`. Pick a user (`alex`, `blake`, `casey` or `dana`, the seeded users) and press Sign in; you land on the page you asked for. The header shows "Signed in as ..." and a Sign out button; to switch users, sign out first.

The session is a random token in the `pm_session` cookie (HttpOnly, discarded when the browser closes) backed by a row in the `sessions` table, so it survives a server restart. A session unused for 12 hours expires. Every API route except `POST /api/auth/login`, `GET /api/auth/users` and `POST /api/auth/logout` returns 401 when signed out. All identity code is in `server/auth.js`, which is the piece to replace for SSO later; routes only read `req.user`.

## Permission groups

Every user is in one group, which decides what they may change (the server checks every write and answers 403 `Your group (<group>) is not allowed to ...` otherwise; reads are open to everyone signed in):

| | Admin | Member | Viewer |
|---|---|---|---|
| Read everything (boards, items, comments, links, history, attachments) | yes | yes | yes |
| Create, edit and move work items; comment; links; attachments | yes | yes | no |
| Delete work items | yes | no | no |
| Create, edit, archive projects | yes | no | no |
| Change a user's group | yes | no | no |

Only the author may edit or delete a message, and only the uploader may delete an attachment, whatever their group. The header shows `Signed in as <name> (<group>)`; controls the group may not use are hidden.

**Changing a group:** an Admin opens **Users** in the header (`/users.html`) and picks the group from the dropdown; it is saved at once and applies to that user's next request, without signing in again. The last Admin cannot be changed to another group. A new database seeds `alex` as Admin and the others as Member; an existing database gets the `users.group_name` column on the next start, with the oldest user (lowest id) as Admin and everyone else Member.

**Adding or changing a group:** edit `GROUPS` in `server/groups.js` (the only file that names groups and their permissions: `write`, `delete-item`, `manage-projects`, `manage-users`) and restart. The client only uses the permission list from `/api/auth/me`.

## Tests

```sh
npm test
```

Tests use the built-in `node:test` runner against the API, each with its own temporary database and a scratch attachment directory (never `data/files/`). The test client in `tests/helpers.js` is signed in as `alex`; `app.client(username)` gives a second, independent signed-in client and `app.raw(...)` sends requests with no cookie. `public/js/time.js` (Discussion and History timestamps), `public/js/historyFormat.js` (History lines), `public/js/richText.js` (comment and description rendering) and `public/js/redirect.js` (the sign-in `next` rule) are also unit tested directly. There are no browser (UI) tests.

## Stack

- Node.js + Express 5, serving the API and the static frontend in `public/` (plain HTML, CSS and vanilla JavaScript, native HTML5 drag and drop, no build step).
- SQLite driver: **`better-sqlite3`** (the spec's default; it installs a prebuilt binary for the current Node, so the built-in `node:sqlite` was not needed).

## Layout

- `server/statuses.js`: the single list of work item statuses and the board's column order.
- `server/types.js`: the single list of work item types, with display metadata, the default flag and the `isEpic` flag.
- `server/resolutions.js`: the single list of resolutions, in display order, with the default flag.
- `server/priorities.js`, `server/projectStatuses.js`: the priority list and the project status list.
- `server/historyFields.js`: the work item fields recorded in History, with their labels and how each is recorded.
- `server/attachmentTypes.js`: the allowed attachment file types, the 10 MB size limit and the 25-per-item limit.
- `server/data/storage.js`: the only code that reads or writes attachment bytes (`put`, `open`, `remove`, `exists`); replace it to move files off local disk.
- `server/linkTypes.js`: the single list of link types (Blocks, Relates, Duplicates), with the label each end reads.
- `server/auth.js`: sign-in sessions and the `pm_session` cookie; sets `req.user` (with the user's group and permissions).
- `server/groups.js`: the permission groups and what each may do; `server/routes/guards.js` `assertCan` enforces them.
- `server/db.js`: schema, migrations and seed users. `server/data/`: the data-access layer; all SQL lives in these two places.
- `server/routes/`: REST API (validation, archived read-only guard); routes call the data-access layer only.
- `public/`: sign-in (`login.html`), project list (`index.html`), board (`board.html`), users and groups (`users.html`, Admin only), scripts in `public/js/`.
- `tests/`: API and source checks.

## Search and filters

The board toolbar has a search box (key, title or description, ignoring case) and Assignee, Type, Priority, Status and Resolution dropdowns; all active criteria must match, and "Showing n of m" gives the count. Filtering happens in the browser on the items the board already loaded (no server request), and the choices are remembered per project in the browser's localStorage (`pm.filters.<projectId>`) until you press Clear. Dropdown options come from the server lists. Filters are read-only, so they work for every group and on archived projects.

## Discussion

The work item dialog has a dark header band (key, epic link, title), a status track you click to change status, the properties and description, then one tab bar: Children (epics only), Discussion, History, Links and Attachments, each with a count. Open a work item to see its Discussion tab: post plain-text messages (newest first) as the signed-in user, and edit or delete your own; the server refuses changes to other people's messages (403). Cards show each item's message count. The detail view also shows the work item's Reporter (who created it; empty for items created before sign-in existed). Archived projects show discussions read-only.

## Resolution

The last status in `server/statuses.js` (`Done`) is the terminal status. Moving a work item into it (by drag or in the detail view) sets its resolution to the default (`Fixed`), with no dialog; moving it out clears the resolution. Change it in the detail view's Resolution dropdown, which appears only while the status is the terminal one. Cards in the terminal column show the resolution as a small label. On archived projects resolutions are read-only. The server enforces the rule: a work item has a resolution if and only if it is in the terminal status.

To add a status, work item type or resolution, add an entry to `server/statuses.js`, `server/types.js` or `server/resolutions.js` and restart; the board, swimlanes, forms and validation pick it up. Note that appending a status after `Done` makes the new one terminal; existing resolutions on `Done` items are not migrated.

## History

Open a work item and select the **History** tab next to Discussion (Discussion stays the default) to see who changed what, newest first: for example "Alex Morgan" with `2026-10-24 14:05 (2 hours ago)` and "changed Status from To Do to In Progress". The server records every change as part of the same save, attributed to the signed-in user, so the browser cannot skip or fake it:

- One entry per save, with one line per field that actually changed (type, title, status, priority, assignee, epic, resolution; the description is recorded only as "changed"). Saves that change nothing, and reordering cards within a column (rank), are not recorded.
- Moving a card into the terminal status shows the status change and the automatic resolution together; dropping it into another swimlane shows the assignee, epic or priority change.
- Creating a work item records "created this work item". Deleting an epic records an epic change on each of its children; changing an epic's type does the same.
- Deleting a work item deletes its history. Comments and project changes (status, archive) do not appear in work item history.
- Filter by field with the dropdown; "Show more" loads older entries 50 at a time. History is readable on archived projects. There is no way to edit or delete history.

API: `GET /api/issues/:id/history?limit=&before=&field=` (newest first, `limit` default 50, max 200, `before` an event id for the next page) returns `{ events, has_more }`; `GET /api/history-fields` lists the fields. To record a new editable work item column, add one entry to `server/historyFields.js` (a test fails if one is missing). New statuses, types, priorities and resolutions need no history change.

## Epic view

Opening an epic (click its card, the epic chip on any of its children's cards, or the epic link in a child's dialog header) shows a **Children** tab in the detail dialog: a progress bar ("3 of 8 done", where done means the terminal status whatever the resolution), a count for every status, and the children with key, title, type, status, assignee and priority (click one to open it). **Add** puts an existing item of the same project into the epic (an item already in another epic moves; the picker shows its current epic), **Remove** takes a child out without deleting it, and **Create child** opens the create form with the epic chosen and returns to the epic after Create. Membership changes go through the normal work item update, so each child's History records them. On archived projects the tab is read-only.

API: `GET /api/issues/:id/children` returns `{ items, summary: { total, done, byStatus: [{ status, count }] } }` for an epic (404 `Epic not found.` otherwise). Adding and removing use `PATCH /api/issues/:id` with `epic_id`. New statuses appear in the counts with no other change.

## Links

The detail dialog has a **Links** tab. It lists the items linked to this one, grouped by how the link reads from here ("blocks", "is blocked by", "relates to", "duplicates", "is duplicated by"). Pick a relationship and another work item of the same project and press **Add link**; the other item shows the reverse reading at once. **Remove** works from either end. Click a linked item's key or title to open it in the same dialog. Each add or remove appears in the History of both items (as "Link"), and deleting a work item removes its links and records the removal on each former partner. Links are same-project only; cycles are allowed; on archived projects links are read-only.

API: `GET /api/link-types` (the relationship options), `GET|POST /api/issues/:id/links` (body `{ link_type, direction: 'outward' | 'inward', target_id }`; `direction` may be omitted for a symmetric type), `DELETE /api/issues/:id/links/:linkId`. To add a link type, add an entry to `server/linkTypes.js` and restart.

## Attachments and pasted images

The detail dialog of a saved work item has an **Attachments** tab: **Add files** (several at once) or drop files onto the tab. Each row shows the file name, size, uploader and time, a Download link, a thumbnail for images (click it to open the full image in a new tab) and, for your own uploads only, Delete. A new work item must be saved first. On archived projects attachments are read-only (download and preview still work).

Paste a screenshot (Ctrl/Cmd+V) into the Discussion box, a message being edited, or the description (click **Edit** next to Description first): it is uploaded as an attachment named `pasted-image-<date>-<time>.png` and the token `![image](attachment:<id>)` is inserted at the cursor. After posting or saving, the token shows as the image; the text is still stored as plain text. The token is the only markup; a deleted image shows `[image removed]`. Pasted images also appear in the Attachments list.

Limits: 10 MB per file, 25 files per work item. Allowed: png, jpg/jpeg, gif, webp (previewable images), pdf, txt, md, csv, log, docx, xlsx, pptx, zip. SVG, HTML, JavaScript and executables are refused, and an image whose bytes do not match its extension is refused. Only the uploader may delete an attachment. Adding and removing appear in History ("added attachment ...", "removed attachment ..."). Deleting a work item deletes its attachments and their files.

API: `GET /api/attachment-types` (types and limits), `GET|POST /api/issues/:id/attachments` (POST body: the raw file bytes, header `X-Filename`: the URL-encoded file name), `GET /api/attachments/:id` (details), `GET /api/attachments/:id/download`, `GET /api/attachments/:id/preview` (images only), `DELETE /api/attachments/:id`. To allow a new type, add an entry to `server/attachmentTypes.js` and restart.

See `CLAUDE.md` for how the AI dev team (product manager, developer, QA) builds this.
