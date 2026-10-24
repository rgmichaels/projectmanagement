# Ticket Discussion
Status: Draft
Date: 2026-10-24

**This spec is the single place that defines comments.** It was split out of `docs/specs/resolution-and-comments.md`, which now covers only the resolution field. The two specs are independent of each other and can be built in either order. Neither one defines anything the other needs.

**Builds on `docs/specs/board-mvp.md` (already implemented; read-only reference).** It reuses the MVP's terminology ("work item"; the table and API may still be called `issues`), seeded users (`GET /api/users`, `server/data/users.js`), the archived read-only rule (MVP AC 11, enforced by `assertWritable` in `server/routes/guards.js`), the detail dialog (`<dialog id="detail">` in `public/board.html`, driven by `openDetail` in `public/js/board.js`) and `loadIssue`. Acceptance criteria are numbered from 1 within this spec; references to the MVP are written "MVP AC n".

## Problem

A work item has only a single free-text description. People working a ticket have nowhere to message back and forth on it: questions, updates, hand-offs. The owner wants a "Discussion" section on the work item detail view, placed after the description, where users post plain-text messages, read the thread, and edit or delete their own messages.

There is no login yet. To make posting possible, the section carries a temporary "Posting as" user dropdown listing the seeded users. It is a stand-in for the login described under "Next steps" and is expected to be removed when that arrives.

## User stories

1. As a user, I see a Discussion section in a work item's detail view, directly after the Description.
2. As a user, I read the existing messages, newest first, each with who wrote it and when (absolute and relative time).
3. As a user, I choose who I am posting as from a dropdown of the seeded users, and the app remembers my choice in this browser.
4. As a user, I post a plain-text message and see it appear at the top of the thread without leaving the detail view.
5. As a user, I can edit or delete a message I posted, and an edited message shows an "edited" marker with the edit time.
6. As a user, I can see on a card how many messages the work item has (including 0), without opening it.
7. As a user viewing an archived project, I can read discussions but not post, edit or delete.
8. As the owner (future-facing), I can later replace the "Posting as" dropdown with a real login, and add pasted images to messages, without redesigning the thread or the data.

## Decisions

Made by the owner; no longer open.

1. **"Posting as" default:** the first seeded user (or the one remembered in this browser). The dropdown is a temporary stand-in for the login in "Next steps".
2. **Edit and delete:** users can edit or delete their own messages. "Own" is a UI rule only until auth exists; the API does not enforce it.
3. **Timestamps:** shown in local time and relative, for example `2026-10-24 14:05 (2 hours ago)`.
4. **Card count:** shown even when it is 0.
5. **Ordering:** newest first. The post form sits at the top of the thread, above the newest message (recommended by the PM so the form never scrolls out of view and a new message appears right under it).
6. **Message length:** 2000 characters stays.
7. **Images** pasted into messages and into the work item description are wanted but are a next step, not part of this spec. The message data model is designed so they can be added later (see Data model changes and Next steps).

## Next steps (not in this spec)

1. **Rudimentary auth.** A login with a username and no password, acting within that user's scope. The "Posting as" dropdown is a temporary stand-in for it. When it arrives, the server takes the author from the logged-in user instead of `author_id`, and the "own message" rule for edit and delete moves from a UI convenience to server enforcement.
2. **Permission groups.** Come after the login. Scope to be defined later; not specified here.
3. **Pasted images** (screen snapshots) in discussion messages and in the work item description. Not specced now. It will need: image storage (files on disk under `data/` or a blob table, with removal when a message, description or work item is deleted); size and type limits; a paste handler and some form of rich-text or markdown-with-images editing; safe rendering (no script execution, served with the right content type); and a decision on how the description (currently a plain `issues.description` text column) gains images too. This spec leaves room for it by keeping `body` as plain text, adding a `body_format` column, and putting any future images in a separate table keyed by `comment_id` (see Data model changes).

## Acceptance criteria

### Placement and layout

1. When an existing work item is opened in the detail dialog, a "Discussion" section appears after the Description field and before the error line and the Save / Delete / Close buttons. When the dialog is used to create a new work item, the Discussion section is not shown (the item does not exist yet).
2. The section contains, top to bottom: a heading "Discussion" with the message count (for example `Discussion (3)`, and `Discussion (0)` when empty); the "Posting as" dropdown, the message textarea and a "Post" button (the post form); then the thread, newest message first.
3. Each message in the thread shows the author's name, the timestamp text (AC 16), and the message text, as a vertical list (one block per message). The thread scrolls inside the dialog if it is long; the post form and the fields above it are not pushed out of reach.
4. The Discussion controls are not part of the work item's own Save: pressing Save, Create or Close does not post or discard a message, and posting, editing or deleting a message does not save, submit or close the work item form. Discussion buttons must not submit the surrounding `method="dialog"` form.

### Posting as (temporary user dropdown)

5. A "Posting as" dropdown lists every seeded user (the same list as `GET /api/users`), in the order the API returns them. It is labelled in the UI as temporary, for example the hint text "Temporary until sign-in is added".
6. The selected user is stored in the browser (`localStorage`) and is preselected the next time the dialog is opened, including after a page reload. If nothing is stored, or the stored user no longer exists in the list, the first user in the list is selected.
7. The author of a new message is the user selected in the dropdown at the moment "Post" is pressed; the client sends that user's id as `author_id`. Changing the dropdown affects only messages posted afterwards; existing messages keep their original author.
8. The API rejects a missing, non-integer or unknown `author_id` with a 4xx error and creates nothing. There is no enforcement of identity: anyone can post as anyone.

### Posting

9. The message is plain text. It is trimmed; a valid message is 1 to 2000 characters after trimming.
10. Pressing "Post" with a valid message sends `POST /api/issues/:id/comments`, inserts the new message at the top of the thread without closing or reloading the dialog, clears the textarea, and the message is still there after reload and after reopening the work item.
11. An empty or whitespace-only message, or one over 2000 characters, is rejected: the UI shows an inline error in the Discussion section (not the work item's error line), the textarea content is kept, and nothing is created. The API returns a 4xx with a message for the same inputs.
12. Posting does not discard unsaved edits the user has made to the work item's other fields in the same open dialog (title, priority, and so on remain as typed).
13. Messages can be posted on a work item in any status, including `Done`. A message never changes the work item's status, fields or position.
14. While a post request is in flight the Post button is disabled, so a double click creates one message. If the request fails (server error), the textarea content is kept and an inline error is shown.

### Display, ordering and timestamps

15. Messages are listed newest first (descending creation time, ties broken by descending id). Editing a message does not change its position. The post form is above the thread, so a new message appears directly beneath it; after a post the thread is scrolled to the top.
16. Each message's timestamp text is `<local date and time> (<relative>)`, for example `2026-10-24 14:05 (2 hours ago)`. The local part is `YYYY-MM-DD HH:mm` in the viewer's local time zone, 24-hour clock. The same message shows the same instant after reload.
17. Relative text is computed in the browser from the server's `created_at` and the current time, using the largest unit that fits, rounded down: under 60 seconds `just now`; under 60 minutes `N minute(s) ago`; under 24 hours `N hour(s) ago`; under 30 days `N day(s) ago`; under 365 days `N month(s) ago` (30-day months); otherwise `N year(s) ago` (365-day years). Singular for 1 (`1 hour ago`, not `1 hours ago`). A timestamp slightly in the future (clock difference between server and browser) shows `just now`.
18. Relative text is recomputed (no server request) when the thread is rendered and then every 60 seconds while the detail dialog is open, so `just now` becomes `1 minute ago` without reopening. The refresh stops when the dialog closes. The absolute part never changes.
19. Message text is displayed as plain text only. HTML or markup typed in (for example `<b>x</b>` or `<script>alert(1)</script>`) appears literally and is never interpreted. Line breaks in the message are preserved on display. Trimming (AC 9) does not remove line breaks inside the message.
20. A work item with no messages shows an empty-state line below the post form, for example "No messages yet. Be the first to post.", and the heading reads `Discussion (0)`. The empty state disappears after the first post and returns if the last message is deleted.

### Edit

21. Each message whose author is the user currently selected in "Posting as" shows "Edit" and "Delete" actions; messages by other users show neither. Changing the dropdown updates which messages show them. (UI convenience only; the API does not enforce it.)
22. Pressing "Edit" replaces that message's text with a textarea prefilled with its current text and "Save" and "Cancel" buttons. Only one message can be in edit mode at a time. Cancel, closing the dialog, or changing the "Posting as" user leaves the message unchanged. Saving applies AC 9 validation (trimmed, 1-2000 characters) with an inline error on that message, keeps the editor open on error, updates the text in place on success without closing the dialog, and the change persists after reload. Saving does not affect unsaved edits to the work item's other fields (as in AC 12).
23. A message that has been edited shows an "edited" marker with the edit time in the same format as AC 16, for example `edited 2026-10-24 15:30 (1 hour ago)`; the relative part refreshes per AC 18. A message never edited shows no marker. If the saved text equals the current text after trimming, nothing changes and no marker appears.
24. `PATCH /api/comments/:id` with body `{ body }` applies AC 9 validation, stores the new text, sets `updated_at` to the server's current UTC time, and returns the updated comment. It never changes `author_id`, `issue_id` or `created_at`. An unknown id returns 404; an invalid body returns a 4xx and leaves the message unchanged. A request that sends text equal to the stored text returns 2xx and leaves `updated_at` unchanged.

### Delete

25. Pressing "Delete" asks for confirmation. On confirm, the message disappears from the thread and the database, and the count (heading and card) goes down by one. Cancel changes nothing.
26. `DELETE /api/comments/:id` removes the message and returns 2xx; an unknown id returns 404.

### Comment count on the card

27. `GET /api/projects/:id/issues` includes `comment_count` (integer, 0 or more) for each work item, computed in the data-access layer so the board needs no extra request per card. Every card shows its message count (for example a speech-bubble icon with `3`), including `0`. Posting or deleting a message updates the count on the card behind the dialog (and the card in its swimlane) without a manual page refresh. Editing does not change the count.

### Archived projects

28. On an archived project's board, the Discussion section stays visible and readable, but the post form (dropdown, textarea, Post) is hidden or disabled and no Edit or Delete action is shown. The API rejects `POST /api/issues/:id/comments`, `PATCH /api/comments/:id` and `DELETE /api/comments/:id` for work items in an archived project with the same 4xx the MVP uses for archived writes (409 via `assertWritable`), leaving data unchanged. `GET` of the thread still works.
29. Archiving or unarchiving a project does not alter any message.

### Deleting work items

30. Deleting a work item also deletes all its messages; no orphan rows remain in `comments`. Deleting an Epic (which clears its children's epic field, MVP AC 18) does not delete or change the children's messages.

### API errors and unknown records

31. `GET` or `POST /api/issues/:id/comments` for an unknown work item returns 404. A non-numeric id on any comment endpoint returns a 4xx. The error response uses the same JSON shape as the existing API errors (`ValidationError`).

### Tests

32. Automated tests (`npm test`, `node:test`, temporary database, same helpers as `tests/helpers.js`) cover at least:
    - Create a valid message and list it back with `author_name`, `body`, a UTC `created_at` and `updated_at` null (AC 8, 10, 16).
    - Empty, whitespace-only, and 2001-character bodies rejected with nothing created; a 2000-character body accepted; body is trimmed on store (AC 9, 11).
    - Missing and unknown `author_id` rejected (AC 8); unknown work item returns 404 (AC 31).
    - Newest-first listing, including two messages created in the same second ordering by descending id, and an edited older message keeping its position (AC 15).
    - A body containing `<script>` is stored and returned verbatim (AC 19).
    - Posting on a `Done` item works and leaves the item's status and other fields unchanged (AC 13).
    - Edit: valid edit changes `body`, sets `updated_at`, keeps `author_id`, `issue_id`, `created_at`; invalid edit rejected and unchanged; same-text edit leaves `updated_at` null; unknown id returns 404 (AC 22-24).
    - Delete removes the message and returns 404 for an unknown id (AC 25, 26).
    - `comment_count` is correct after add and after delete, is 0 for an item with none, and is unchanged by an edit (AC 27).
    - Deleting a work item removes its messages (query the `comments` table directly, so it holds whether or not the foreign-keys pragma is on), and deleting an Epic leaves its children's messages intact (AC 30).
    - On an archived project, POST, PATCH and DELETE are rejected with the data unchanged, GET still works, and unarchiving restores the ability to post (AC 28, 29).
    - The relative-time function (a small pure function the client exposes in a testable way, for example in a file also loadable by `node:test`) returns the expected text at each boundary in AC 17, including singular forms and the future-timestamp case.
    - Source check in `tests/source.test.js` style: the comment SQL appears only in the data-access layer (no SQL in routes).

## Data model changes

Applied through the existing single schema/setup in `server/db.js` (additive; the new table uses `CREATE TABLE IF NOT EXISTS`, so existing local databases pick it up on the next start with no manual step).

- **comments** (new table): `id`, `issue_id` (FK to issues, not null, `ON DELETE CASCADE`), `author_id` (FK to users, not null), `body` (text, not null; 1-2000 chars after trim, enforced in validation), `body_format` (text, not null, default `'text'`; always `'text'` now, reserved so a later rich-text or image-capable format can coexist with old messages), `created_at` (text, UTC ISO 8601 set by the server), `updated_at` (text, UTC ISO 8601, null until the first real edit). Index on `issue_id`. The table keeps the name `comments` and the API path keeps `comments`; "Discussion" is the UI label only.
- **Image-ready, not implemented:** images later go in a separate table (for example `comment_attachments` with `comment_id` FK) added by a future spec, so `comments` itself needs no change and no rewrite. Nothing for images is created now.
- `foreign_keys = ON` is already set in `server/db.js`, but the cascade is not trusted alone: `deleteIssue` in `server/data/issues.js` must also delete the item's comments explicitly inside its existing transaction, so AC 30 holds either way.
- **issues**: no column change. `comment_count` is derived (a count subquery or grouped join in the list query), not stored.
- No change to `users`, `statuses`, `types` or any list module.

API (REST, JSON):

- `GET /api/issues/:id/comments` (new; newest first, each with `id`, `issue_id`, `author_id`, `author_name`, `body`, `created_at`, `updated_at`)
- `POST /api/issues/:id/comments` (new; body `{ author_id, body }`; returns 201 and the created comment in the same shape)
- `PATCH /api/comments/:id` (new; body `{ body }`; returns the updated comment)
- `DELETE /api/comments/:id` (new)
- `GET /api/projects/:id/issues` (existing; each item gains `comment_count`)

## Out of scope

- Pasted images and any attachments, in messages or in the description (a next step; see Next steps).
- Rich text and markdown rendering; plain text only for now.
- Real authentication or enforcing that only the author may edit or delete (next step; see Next steps). The "Posting as" dropdown is a temporary stand-in and provides no security. Permission groups.
- Edit history (previous versions of an edited message are not kept), threaded replies, quoting, reactions.
- An activity history / audit log (status changes, field edits shown as history). It is a planned later phase and would naturally sit beside the discussion in the detail view, which is why messages store a server timestamp and author.
- @mentions, notifications, watchers, unread markers.
- Emoji pickers.
- Live updates: a message posted by someone else in another tab or browser appears only after the dialog is reopened or the page reloaded (the MVP already excludes real-time sync).
- Search over messages, pagination or a cap on the number of messages per work item.
- A Discussion section in the create-work-item dialog.
- Adding users in the UI (users remain the fixed seeded list).
- Everything already out of scope in `board-mvp.md` unless listed above as now in scope.
- Resolution (see `docs/specs/resolution-and-comments.md`).

## Open questions

No blocking questions remain. Two small items for the owner to confirm; the spec proceeds on the stated assumption.

1. **Form placement.** The post form is placed above the thread (AC 2, 15), as recommended. Alternative: form at the bottom with the newest message at the top, which splits the form from the newest message.
2. **Editing someone else's draft state.** While a message is in edit mode, switching "Posting as" cancels the edit (AC 22). Acceptable, or should the edit stay open?

## Implementation notes for the developer

Files to touch (the codebase already exists; layout confirmed by reading it):

- `server/db.js`: add `CREATE TABLE IF NOT EXISTS comments` and the `issue_id` index to the schema block.
- `server/data/comments.js` (new): `listComments(db, issueId)`, `createComment(db, issueId, authorId, body)`, `getComment(db, id)`, `updateComment(db, id, body)`, `deleteComment(db, id)`. All SQL here. List joins `users` for `author_name` and orders by `created_at DESC, id DESC`. Set `created_at` and `updated_at` in code (`new Date().toISOString()`), not `CURRENT_TIMESTAMP`, so they are unambiguous UTC with a `Z`. `updateComment` is a no-op (no `updated_at` change) when the trimmed text equals the stored text.
- `server/data/issues.js`: add `comment_count` to the project work-item list query; make `deleteIssue` delete the item's comments in its existing transaction.
- `server/routes/comments.js` (new) or additions to `server/routes/issues.js`, wired in `server/app.js`: the endpoints above. Use `loadIssue` and `projects.getProject` plus `assertWritable` for POST, PATCH and DELETE (for PATCH and DELETE, resolve comment to issue to project; add a `loadComment` helper to `server/routes/guards.js`). Validation (trim, 1-2000, author exists) in `server/validation.js` style; routes call data-access only.
- `public/board.html`: add a `<section id="discussion">` inside the `#detail-form`, after the Description label and before `#detail-error`. Contents: heading, the post form (`<select id="posting-as">`, `<textarea id="comment-body">`, `<button type="button" id="comment-post">`, inline `<p id="comment-error">`), then `<ul id="thread">`. These must not be `<form>` elements (nesting is invalid).
- `public/js/board.js`: in `openDetail`, show the section only when `item` exists, load the thread with `GET /api/issues/:id/comments`, and populate "Posting as" from `state.users`. The existing loop `for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;` will also disable the new select and textarea; this is wanted for archived boards, but the thread must still render readable. Keep the Post, Edit and Delete handlers separate from the form's submit handler. After a post, edit or delete, update the heading count and call `reloadItems()` so the card count refreshes; `reloadItems` re-renders the board only, so it does not reset the open dialog's fields (AC 12). Render message text with `textContent` and CSS `white-space: pre-wrap`; never `innerHTML`. Start a 60-second `setInterval` when the dialog opens that only rewrites the relative text, and clear it on close (listen to the dialog's `close` event so Escape is covered).
- Relative-time and timestamp formatting: put in a small pure function (for example `public/js/time.js`, usable from the browser and from `node:test` via a `module.exports` guard) so the AC 17 boundaries can be unit tested.
- `public/js/api.js`: add a `patch` helper if it does not already exist (it is used for issues in `board.js`).
- `renderCard` in `public/js/board.js`: add the count chip to `.card-meta` for every card, including 0.
- `public/css/app.css`: thread, message block, "edited" marker, count chip, scrollable thread area.
- `tests/comments.test.js` (new) plus a source-check addition; `README.md` only if a note is wanted.

Rules to follow (same as the MVP):

- SQL stays in the data-access layer; no SQL in routes or client code.
- No new hard-coded status, type or user names; the dropdown iterates `state.users`.
- Do not add `CHECK` constraints that duplicate list modules (none are needed here).
- Do not build anything for images now; only the `body_format` column and keeping `body` as plain text.

Suggested order:

1. Schema, `server/data/comments.js`, delete cascade in `deleteIssue`, `comment_count` in the list query, with data-layer tests (AC 27, 30).
2. Routes and validation, archived guard, API tests (AC 8-11, 13, 15, 19, 24, 26, 28, 29, 31).
3. Pure time formatter and its tests (AC 16-18).
4. Detail dialog markup, post form, thread rendering, empty state, refresh timer (AC 1-3, 15-20).
5. "Posting as" dropdown with `localStorage`, posting flow, inline errors, double-click guard, preserved unsaved edits (AC 4-7, 10-14).
6. Edit and Delete actions, "edited" marker, card count chip with live refresh, archived read-only UI (AC 21-23, 25, 27, 28).
7. Final pass over the test list (AC 32) and a manual browser check of placement after the Description.
