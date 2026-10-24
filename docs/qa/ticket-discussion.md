# QA: Ticket Discussion

Spec: `docs/specs/ticket-discussion.md` (32 acceptance criteria)
Regression reference: `docs/specs/board-mvp.md`
QA date: 2026-10-24
Scope: uncommitted working tree on `main` (HEAD `09d3bf3`), application code not modified.

## Verdict

**GO.** All 32 criteria PASS. No blocking defects. Notes below are non-blocking.

VERDICT: GO

## Commands and results

| # | Command | Where | Result |
|---|---|---|---|
| 1 | `npm test` | repo root | exit 0; 49 tests, 49 pass, 0 fail |
| 2 | `npm ci && npm test` | clean copy in scratchpad (tracked + untracked-not-ignored files only) | `npm ci` ok (29 packages); `npm test` exit 0; 49/49 pass |
| 3 | `PORT=3917 DB_PATH=<scratchpad>/qa.db node server/index.js` | repo root | started on 3917 (port 3000 not touched); stopped after the run |
| 4 | curl / node `fetch` scripts against `localhost:3917` | API checks (AC 8-11, 13, 15, 22-31) | as recorded per AC below |
| 5 | Playwright 1.59.1 (`/Users/robertmichaels/node_modules/playwright`, bundled chromium) scripts in scratchpad | browser checks of the detail dialog, archived view, drag and create | as recorded below; no browser errors (`pageerror`/console error) in any run |
| 6 | Node one-off: `require('public/js/time.js').relativeTime` at 18 boundary values | AC 17 | 0 mismatches |
| 7 | `git status`, `git ls-files --others --exclude-standard`, `git check-ignore -v` | hygiene | as below |

No lint or typecheck script is configured in `package.json` (only `start` and `test`), so none was run.

## Per-criterion results

Verification key: **API** = curl/fetch against the live server; **UI** = Playwright in chromium; **Test** = `npm test` case; **Code** = read only, no run.

| AC | Result | How verified / reason |
|---|---|---|
| 1 | PASS | UI: create dialog has no visible Discussion; existing item shows it after Description and before `#detail-error` and the Save button (DOM order check). |
| 2 | PASS | UI: heading `Discussion (0)` / `(1)`; markup order is heading, post form, empty line, thread. |
| 3 | PASS | UI: thread is a `<ul>` of blocks, newest first. Scroll limit is `.thread { max-height: 40vh; overflow-y: auto }` (CSS read; scroll not measured). |
| 4 | PASS | UI: Save with a draft in the textarea closed the item and did not post the draft (thread count unchanged). Discussion buttons are `type="button"`. |
| 5 | PASS | UI: dropdown options `Alex Morgan:1, Blake Chen:2, Casey Rivera:3, Dana Patel:4` match `GET /api/users`; hint text "Temporary until sign-in is added" present. |
| 6 | PASS | UI: after a reload the stored user (Dana, 4) is preselected; a stored id not in the list (99) falls back to the first user (1). |
| 7 | PASS | UI: after switching to Casey, the new post shows author Casey Rivera; earlier posts kept their authors. API: `author_id` sent from the dropdown. |
| 8 | PASS | API: missing, string `"2"`, unknown 99, `2.5`, `null`, `0`, `true` each return 400 and create nothing. Test: "missing, non-integer and unknown author_id rejected". |
| 9 | PASS | API: `"   "` rejected; a 2000-char body accepted (201); body stored trimmed. Test: body validation. |
| 10 | PASS | UI: post inserts at top, dialog stays open, textarea cleared; message persists after reopen and reload. API: 201 with the comment. |
| 11 | PASS | UI: whitespace-only and 2001-char messages show the inline `#comment-error` (not `#detail-error`), text kept, nothing created. API: 400 with message. |
| 12 | PASS | UI: unsaved title typed before posting was still in the field after posting. |
| 13 | PASS | API: posted on a `Done` item (201); status, rank, title and `updated_at` of the item unchanged. Test: "posting on a Done item". |
| 14 | PASS (double-click) / Code (failure) | UI: double-click on Post created exactly one message. The failure branch (keeps textarea, shows inline error) was verified by reading `commentPost` handler only; no server-error injection was run. |
| 15 | PASS | API: newest first; edit of the older message left order `[2, 1]` unchanged; same-second ties ordered by id descending (test). UI: new post at top. |
| 16 | PASS | UI: text `2026-10-24 12:03 (just now)` format; API `created_at` is UTC ISO with `Z`. |
| 17 | PASS | Node: 18 boundary cases (0 s, 59.999 s, 1 min, 59 min, 1 h, 23 h, 1 d, 29 d, 1 mo, 2 mo, 12 mo, 1 y, 2 y, -5 s, -1 h future) all match. Test: relative time boundaries. |
| 18 | PASS | UI with Playwright fake clock: `just now` changed to `1 minute ago` after 61 s with no request. Stop on close is by code (`close` listener clears the interval). |
| 19 | PASS | UI: `<b>bold</b> <script>…` shown literally; `innerHTML` contains `&lt;b&gt;`; no `<script>` element. Line breaks: API stores `\n\n`; CSS `white-space: pre-wrap`. |
| 20 | PASS | UI: `No messages yet. Be the first to post.` shown at 0; hidden after first post; shown again after deleting the last. |
| 21 | PASS | UI: Edit/Delete shown only on messages by the selected user; switching user hid them. |
| 22 | PASS | UI: Save with empty text kept the editor open with an inline error; valid edit updated in place and the dialog stayed open; Cancel left text unchanged. Switching user or closing cancels the edit by code. |
| 23 | PASS | UI: `edited 2026-10-24 12:03 (just now)` marker after edit. API: same-text PATCH returns 200 with `updated_at` unchanged, so no marker. |
| 24 | PASS | API: PATCH valid → `updated_at` set, `author_id`/`issue_id`/`created_at` unchanged; invalid (empty, 2001) → 400 and row unchanged; same text → 200, `updated_at` unchanged; unknown id → 404. Test covers the same. |
| 25 | PASS | UI: Cancel on confirm changed nothing; OK removed the message, heading and card count went down; last delete showed empty state. API: DELETE 204, second DELETE 404. |
| 26 | PASS | API: DELETE 204; unknown id 404 (`Message not found.`). |
| 27 | PASS | API: `comment_count` in `GET /api/projects/:id/issues`: 0, then 2, 4 after deletes, unchanged by edit. UI: card chip `💬1` updated live after post; `💬0` shown on zero-message card. |
| 28 | PASS | UI (archived project 1): discussion visible, thread readable (5 messages), post form hidden, no Edit/Delete, Save hidden. API (archived): POST 409, PATCH 409, DELETE 409 with data unchanged; GET 200. |
| 29 | PASS | API: archive then unarchive; message list identical before and after (5 messages, same bodies); posting works again after unarchive (201). |
| 30 | PASS | API: deleting an item removed its messages (`GET` 404; orphan query on `comments` returned 0 rows). Epic delete: child kept its messages (1) and `epic_id` became null. Tests cover both, including with `foreign_keys` off. |
| 31 | PASS | API: GET/POST unknown item → 404; non-numeric ids → 404 (a 4xx); JSON shape `{ "error": "..." }`, same as existing API. |
| 32 | PASS | `npm test` 49/49 includes `tests/comments.test.js` and `tests/time.test.js` with cases for every bullet in AC 32 (create/list shape, validation incl. 2000/2001, author and 404, ordering and ties, markup verbatim, Done item, edit, delete, comment_count, cascade, archived, relative time, future timestamp, source check). |

Summary: 32 PASS, 0 FAIL, 0 UNTESTED. Two criteria (14, and the parts of 3, 18, 22 that are code only) rely partly on code reading; noted above.

## Regression check against board-mvp

- `npm test`: all MVP suites (`issues`, `projects`, `extensibility`, `source`) pass. The one edit to an MVP test is `tests/source.test.js`: the expected table list gained `comments`, which is intended.
- Browser: creating a work item from the dialog (Create) works; dragging a card from To Do to In Progress persisted the status; Save and Escape close the dialog; no page errors.
- Archived board: read-only behaviour (Save hidden, no delete, no drag) confirmed in UI for project 1 (archived via PATCH); MVP archived writes still 409 (`PATCH /api/issues/:id` returned 409).
- Not re-run: MVP grouping swimlanes (assignee/epic/priority) and the drag-into-lane flows, beyond the unit tests and code read.

## Repository hygiene

- `.gitignore` now has `/data/` (was `data/`). `git check-ignore`: `data/app.db` matched by `/data/` (ignored); `node_modules` ignored (`node_modules/`).
- `server/data/*.js` are not ignored. `git ls-files --others --exclude-standard` lists `server/data/comments.js`, `server/data/issues.js`, `server/data/projects.js`, `server/data/users.js`, `public/js/time.js`, `server/routes/comments.js`, `tests/comments.test.js`, `tests/time.test.js`. `git status` shows `?? server/data/`.
- HEAD `09d3bf3` has no `server/data/` in its tree (`git ls-tree`), so HEAD alone does not run. The uncommitted set above is required for the app to run; it must all be added in the commit.
- Clean-copy check: copied tracked plus untracked-not-ignored files into a scratch directory, `npm ci` succeeded, `npm test` 49/49 passed.

## Non-blocking notes

1. Non-numeric comment ids return 404 (`Work item not found.` / `Message not found.`), not 400. AC 31 allows any 4xx, so this is acceptable.
2. AC 14 failure branch (server error keeps text and shows error) and AC 3 scroll height are verified by code reading only. The repo has no browser tests; the spec does not require them.
3. Spec header still says `Status: Draft`. Cosmetic.
4. Report path: the request asked for `docs/qa/ticket-discussion.md`; the CLAUDE.md convention would be `docs/qa/ticket-discussion-qa.md`. The requested path was used.
5. Length is counted in UTF-16 code units (JS `.length`), so emoji count as 2 characters toward the 2000 limit. Client and server agree.

## Not verifiable here

- Real-browser behaviour on other browsers (only chromium 1.59.1 via Playwright).
- Server-error injection for Post, Edit and Delete (AC 14 failure path, AC 22 error path).
- Visual layout and the scroll position of the thread at 40vh (no screenshots reviewed).
- Concurrency between two tabs (out of scope per spec).

## Artifacts

- Scratch DB and scripts: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/` (`qa.db`, `ui.js`, `ui2.js`, `ui3.js`, `ui4.js`, `flow.js`, `archive.js`, `archive2.js`, `clean/`).
- The QA server on port 3917 was stopped. Port 3000 was not touched.
- No application code was modified.
