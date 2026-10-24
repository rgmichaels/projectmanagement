# Ticket Discussion
Status: Draft
Date: 2026-10-24

**This spec is the single place that defines comments.** It was split out of `docs/specs/resolution-and-comments.md`, which now covers only the resolution field. The two specs are independent of each other and can be built in either order. Neither one defines anything the other needs.

**Builds on `docs/specs/board-mvp.md` (already implemented; read-only reference).** It reuses the MVP's terminology ("work item"; the table and API may still be called `issues`), seeded users (`GET /api/users`, `server/data/users.js`), the archived read-only rule (MVP AC 11, enforced by `assertWritable` in `server/routes/guards.js`), the detail dialog (`<dialog id="detail">` in `public/board.html`, driven by `openDetail` in `public/js/board.js`) and `loadIssue`. Acceptance criteria are numbered from 1 within this spec; references to the MVP are written "MVP AC n".

## Problem

A work item has only a single free-text description. People working a ticket have nowhere to message back and forth on it: questions, updates, hand-offs. The owner wants a "Discussion" section on the work item detail view, placed after the description, where users post plain-text messages and read the thread.

There is no login (auth/SSO is deferred for the POC). To make posting possible, the section carries a temporary "Posting as" user dropdown listing the seeded users. It is a stand-in for real identity and is expected to be removed when auth arrives.

## User stories

1. As a user, I see a Discussion section in a work item's detail view, directly after the Description.
2. As a user, I read the existing messages in order, each with who wrote it and when.
3. As a user, I choose who I am posting as from a dropdown of the seeded users, and the app remembers my choice in this browser.
4. As a user, I post a plain-text message and see it appear in the thread without leaving the detail view.
5. As a user, I can delete a message I posted (see Open question 2).
6. As a user, I can see on a card how many messages the work item has, without opening it.
7. As a user viewing an archived project, I can read discussions but not post or delete.
8. As the owner (future-facing), I can later replace the "Posting as" dropdown with a real signed-in user without redesigning the thread or the data.

## Acceptance criteria

### Placement and layout

1. When an existing work item is opened in the detail dialog, a "Discussion" section appears after the Description field and before the error line and the Save / Delete / Close buttons. When the dialog is used to create a new work item, the Discussion section is not shown (the item does not exist yet).
2. The section contains, top to bottom: a heading "Discussion" (with the message count, for example `Discussion (3)`), the thread, then the "Posting as" dropdown, the message textarea and a "Post" button.
3. Each message in the thread shows the author's name, a timestamp and the message text, as a vertical list (one block per message, not a chat-bubble side-by-side layout). The thread scrolls inside the dialog if it is long; the Description and fields above it are not pushed out of reach.
4. The Discussion controls are not part of the work item's own Save: pressing Save, Create or Close does not post or discard a message, and posting does not save, submit or close the work item form. The Post button must not submit the surrounding `method="dialog"` form.

### Posting as (temporary user dropdown)

5. A "Posting as" dropdown lists every seeded user (the same list as `GET /api/users`), in the order the API returns them. It is labelled in the UI as temporary, for example the hint text "Temporary until sign-in is added".
6. The selected user is stored in the browser (`localStorage`) and is preselected the next time the dialog is opened, including after a page reload. If nothing is stored, or the stored user no longer exists in the list, the first user in the list is selected. See Open question 1.
7. The author of a new message is the user selected in the dropdown at the moment "Post" is pressed; the client sends that user's id as `author_id`. Changing the dropdown affects only messages posted afterwards; existing messages keep their original author.
8. The API rejects a missing, non-integer or unknown `author_id` with a 4xx error and creates nothing. There is no enforcement of identity: anyone can post as anyone (the dropdown is a convenience, not security).

### Posting

9. The message is plain text. It is trimmed; a valid message is 1 to 2000 characters after trimming.
10. Pressing "Post" with a valid message sends `POST /api/issues/:id/comments`, appends the new message at the bottom of the thread without closing or reloading the dialog, clears the textarea, and the message is still there after reload and after reopening the work item.
11. An empty or whitespace-only message, or one over 2000 characters, is rejected: the UI shows an inline error in the Discussion section (not the work item's error line), the textarea content is kept, and nothing is created. The API returns a 4xx with a message for the same inputs.
12. Posting does not discard unsaved edits the user has made to the work item's other fields in the same open dialog (title, priority, and so on remain as typed).
13. Messages can be posted on a work item in any status, including `Done`. A message never changes the work item's status, fields or position.
14. While a post request is in flight the Post button is disabled, so a double click creates one message. If the request fails (server error), the textarea content is kept and an inline error is shown.

### Display, ordering and timestamps

15. Messages are listed oldest first (ascending creation time, ties broken by ascending id), so the newest is at the bottom next to the form. After a post, the thread scrolls so the new message is visible.
16. The timestamp is set by the server at creation (UTC, ISO 8601 with a `Z`) and displayed in the viewer's local time in a readable form, for example `2026-10-24 14:05`. The same message shows the same instant after reload.
17. Message text is displayed as plain text only. HTML or markup typed in (for example `<b>x</b>` or `<script>alert(1)</script>`) appears literally and is never interpreted. Line breaks in the message are preserved on display. Leading/trailing whitespace trimming (AC 9) does not remove line breaks inside the message.
18. A work item with no messages shows an empty-state line in the thread area, for example "No messages yet. Start the discussion below.", and the heading shows no count or `0`. The empty state disappears after the first post and returns if the last message is deleted.

### Delete

19. Each message whose author is the user currently selected in "Posting as" shows a "Delete" action; messages by other users do not. Changing the dropdown updates which messages show Delete. (This is a UI convenience only; see Open question 2.)
20. Pressing Delete asks for confirmation. On confirm, the message disappears from the thread and the database, and the count (heading and card) goes down by one. Cancel changes nothing.
21. `DELETE /api/comments/:id` removes the message and returns 2xx; an unknown id returns 404. The API does not check that the caller authored the message.
22. There is no edit action and no `PATCH` endpoint for messages (see Out of scope and Open question 2).

### Comment count on the card

23. `GET /api/projects/:id/issues` includes `comment_count` (integer, 0 or more) for each work item, computed in the data-access layer so the board needs no extra request per card. A card shows a message count (for example a speech-bubble icon with `3`) when the count is 1 or more, and shows nothing when it is 0. Posting or deleting a message updates the count on the card behind the dialog (and the card in its swimlane) without a manual page refresh.

### Archived projects

24. On an archived project's board, the Discussion section stays visible and readable, but the "Posting as" dropdown, textarea and Post button are hidden or disabled and no Delete action is shown. The API rejects `POST /api/issues/:id/comments` and `DELETE /api/comments/:id` for work items in an archived project with the same 4xx the MVP uses for archived writes (409 via `assertWritable`), leaving data unchanged. `GET` of the thread still works.
25. Archiving or unarchiving a project does not alter any message.

### Deleting work items

26. Deleting a work item also deletes all its messages; no orphan rows remain in `comments`. Deleting an Epic (which clears its children's epic field, MVP AC 18) does not delete or change the children's messages.

### API errors and unknown records

27. `GET` or `POST /api/issues/:id/comments` for an unknown work item returns 404. A non-numeric id returns a 4xx. The error response uses the same JSON shape as the existing API errors (`ValidationError`).

### Tests

28. Automated tests (`npm test`, `node:test`, temporary database, same helpers as `tests/helpers.js`) cover at least:
    - Create a valid message and list it back with `author_name`, `body` and a UTC `created_at` (AC 8, 10, 16).
    - Empty, whitespace-only, and 2001-character bodies rejected with nothing created; a 2000-character body accepted; body is trimmed on store (AC 9, 11).
    - Missing and unknown `author_id` rejected (AC 8); unknown work item returns 404 (AC 27).
    - Oldest-first listing, including two messages created in the same second ordering by id (AC 15).
    - A body containing `<script>` is stored and returned verbatim (AC 17).
    - Posting on a `Done` item works and leaves the item's status and other fields unchanged (AC 13).
    - Delete removes the message and returns 404 for an unknown id (AC 20, 21).
    - `comment_count` is correct after add and after delete, per work item (AC 23).
    - Deleting a work item removes its messages (query the `comments` table directly, so it holds whether or not the foreign-keys pragma is on), and deleting an Epic leaves its children's messages intact (AC 26).
    - On an archived project, POST and DELETE are rejected with the item unchanged, GET still works, and unarchiving restores the ability to post (AC 24, 25).
    - Source check in `tests/source.test.js` style: the comment SQL appears only in the data-access layer (no SQL in routes).

## Data model changes

Applied through the existing single schema/setup in `server/db.js` (additive; the new table uses `CREATE TABLE IF NOT EXISTS`, so existing local databases pick it up on the next start with no manual step).

- **comments** (new table): `id`, `issue_id` (FK to issues, not null, `ON DELETE CASCADE`), `author_id` (FK to users, not null), `body` (text, not null; 1-2000 chars after trim, enforced in validation), `created_at` (text, UTC ISO 8601 set by the server). No `updated_at` because editing is out of scope. Index on `issue_id`. (The table keeps the name `comments` and the API path keeps `comments`; "Discussion" is the UI label only.)
- `foreign_keys = ON` is already set in `server/db.js`, but the cascade is not trusted alone: `deleteIssue` in `server/data/issues.js` must also delete the item's comments explicitly inside its existing transaction, so AC 26 holds either way.
- **issues**: no column change. `comment_count` is derived (a count subquery or grouped join in the list query), not stored.
- No change to `users`, `statuses`, `types` or any list module. Message count, author name and timestamps need no new single-source list.

API (REST, JSON):

- `GET /api/issues/:id/comments` (new; oldest first, each with `id`, `issue_id`, `author_id`, `author_name`, `body`, `created_at`)
- `POST /api/issues/:id/comments` (new; body `{ author_id, body }`; returns 201 and the created comment in the same shape)
- `DELETE /api/comments/:id` (new)
- `GET /api/projects/:id/issues` (existing; each item gains `comment_count`)

## Out of scope

- Editing messages, threaded replies, quoting, reactions.
- An activity history / audit log (status changes, field edits shown as history). It is a planned later phase and would naturally sit beside the discussion in the detail view, which is why messages store a server timestamp and author now.
- @mentions, notifications, watchers, unread markers.
- Attachments, images, emoji pickers.
- Rich text and markdown rendering; plain text only.
- Real authentication, SSO, or enforcing that only the author may delete. The "Posting as" dropdown is a temporary stand-in and provides no security.
- Live updates: a message posted by someone else in another tab or browser appears only after the dialog is reopened or the page reloaded (the MVP already excludes real-time sync).
- Search over messages, pagination or a cap on the number of messages per work item.
- A Discussion section in the create-work-item dialog.
- Adding users in the UI (users remain the fixed seeded list).
- Everything already out of scope in `board-mvp.md` unless listed above as now in scope.
- Resolution (see `docs/specs/resolution-and-comments.md`).

## Open questions

1. **Default and remembered "Posting as" user.** This spec preselects the last used user from `localStorage`, else the first user in the list. Alternative: start on a "Select a user..." placeholder and require a choice before Post is enabled, which avoids accidentally posting as the wrong person in a demo. Which does the owner prefer?
2. **Delete and edit.** This spec carries over the earlier draft's recommendation: delete is in (shown only on messages by the currently selected user, UI rule only), edit is out. Confirm, or ask for edit (adds `updated_at`, an "edited" marker, an inline editor), or for no delete at all.
3. **Timestamp format.** Absolute local time (`2026-10-24 14:05`) is assumed. Would the owner prefer relative ("5 minutes ago") with the absolute time on hover?
4. **Count display on the card.** Hide when zero (assumed) or always show `0`?
5. **Thread order.** Oldest first with the form below the thread (assumed, chat-like). Jira's default is also oldest first, but some prefer newest first. Confirm.
6. **Message length limit.** 2000 characters is an assumption; is that enough?

## Implementation notes for the developer

Files to touch (the codebase already exists; layout confirmed by reading it):

- `server/db.js`: add `CREATE TABLE IF NOT EXISTS comments` and the `issue_id` index to the schema block.
- `server/data/comments.js` (new): `listComments(db, issueId)`, `createComment(db, issueId, authorId, body)`, `getComment(db, id)`, `deleteComment(db, id)`. All SQL here. List joins `users` for `author_name` and orders by `created_at, id`. Set `created_at` in code (`new Date().toISOString()`), not `CURRENT_TIMESTAMP`, so it is unambiguous UTC with a `Z`.
- `server/data/issues.js`: add `comment_count` to the project work-item list query; make `deleteIssue` delete the item's comments in its existing transaction.
- `server/routes/comments.js` (new) or additions to `server/routes/issues.js`, wired in `server/app.js`: the four endpoints above. Use `loadIssue` and `projects.getProject` plus `assertWritable` for POST and DELETE (for DELETE, resolve comment to issue to project; add a `loadComment` helper to `server/routes/guards.js`). Validation (trim, 1-2000, author exists) in `server/validation.js` style; routes call data-access only.
- `public/board.html`: add a `<section id="discussion">` inside the `#detail-form`, after the Description label and before `#detail-error`. Contents: heading, `<ul id="thread">`, "Posting as" `<select id="posting-as">`, `<textarea id="comment-body">`, `<button type="button" id="comment-post">`, and an inline `<p id="comment-error">`. Controls must not be `<form>` elements (nesting is invalid).
- `public/js/board.js`: in `openDetail`, show the section only when `item` exists, load the thread with `GET /api/issues/:id/comments`, and populate "Posting as" from `state.users`. The existing loop `for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;` will also disable the new select and textarea; this is wanted for archived boards but means the section's markup must still render the thread readable (a disabled select/textarea is fine). Keep the Post and Delete handlers separate from the form's submit handler. After a post or delete, update the heading count and call `reloadItems()` so the card count refreshes; note that `reloadItems` re-renders the board only, so it does not reset the open dialog's fields (AC 12). Render message text with `textContent` and CSS `white-space: pre-wrap`; never `innerHTML`.
- `public/js/api.js`: no change expected if `api.get/post/del` already exist (they are used in `board.js`).
- `renderCard` in `public/js/board.js`: add the count chip to `.card-meta` when `comment_count > 0`.
- `public/css/app.css`: thread, message block, count chip, scrollable thread area.
- `tests/comments.test.js` (new) plus a source-check addition; `README.md` only if a note is wanted.

Rules to follow (same as the MVP):

- SQL stays in the data-access layer; no SQL in routes or client code.
- No new hard-coded status, type or user names; the dropdown iterates `state.users`.
- Do not add `CHECK` constraints that duplicate list modules (none are needed here).

Suggested order:

1. Schema, `server/data/comments.js`, delete cascade in `deleteIssue`, `comment_count` in the list query, with data-layer tests (AC 23, 26).
2. Routes and validation, archived guard, API tests (AC 8-11, 13, 15-17, 21, 24, 25, 27).
3. Detail dialog markup and thread rendering, empty state, timestamp formatting (AC 1-3, 15-18).
4. "Posting as" dropdown with `localStorage`, posting flow, inline errors, double-click guard, preserved unsaved edits (AC 4-7, 10-14).
5. Delete action and confirmation, card count chip and live refresh, archived read-only UI (AC 19-20, 23, 24).
6. Final pass over the test list (AC 28) and a manual check in the browser of placement after the Description.
