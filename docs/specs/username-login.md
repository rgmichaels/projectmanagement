# Username Login
Status: Draft
Date: 2026-10-24

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `docs/specs/ticket-discussion.md` and `docs/specs/resolution-and-comments.md` (read-only references; this spec does not edit them).** The resolution feature is mid-QA; this spec touches nothing in it. Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "MVP AC n" or "Discussion AC n".

**THIS IS NOT SECURE, ON PURPOSE.** There is no password. Anyone who can reach the server can sign in as any user by knowing, or picking, a username. The login exists only so the app knows who is acting (comment authorship, own-message rules, later permissions). It must not be exposed to the internet or used with real or sensitive data. See "What is deliberately not protected".

## Problem

The app has no notion of who is using it. The discussion section has a temporary "Posting as" dropdown, the API trusts whatever `author_id` the browser sends, and "edit or delete your own message" is only hidden buttons (Discussion Decisions 2, Next steps 1). The owner wants the first, rudimentary step of auth: sign in with a username and no password, then act as that user. Permission groups come after this and SSO at the BOE much later, so the identity must be available on every request and the session mechanism must be swappable.

## User stories

1. As a user, I open the app, am sent to a sign-in page, choose my username and land on the page I wanted.
2. As a user, I see who I am signed in as in the header of every page, and I can sign out.
3. As a user, my comments are authored by me automatically; there is no "Posting as" choice.
4. As a user, I can edit and delete only my own messages, and the server refuses attempts on other people's, not just the UI.
5. As the owner, I can later add permission groups by checking the user the server already attaches to every request.
6. As the owner, I can later replace this sign-in with SSO by swapping one identity module, without touching routes, data access or the UI beyond the sign-in page.
7. As the owner, I can see who created each work item.

## Decisions (made by the owner; no longer open)

1. **Username entry: pick from the seeded users, not free typing (owner confirmed).** The sign-in page lists the seeded users (name and username) as buttons or a dropdown plus "Sign in". Reason: users are a fixed seeded list with no user management, so typing adds only typo failures and an "unknown username" screen with no upside. The API still takes a `username` string and still handles an unknown one (AC 5), so a typed field can be added later without an API change.
2. **Unknown username: rejected, never auto-created.** `POST /api/auth/login` returns 401 with `Unknown username.` and creates no user and no session. Registration is out of scope.
3. **Session: a server-side session row plus an opaque cookie.** On login the server generates a random token (`crypto.randomBytes(32)`, hex), stores `(token, user_id, created_at)` in a new `sessions` table, and sets it in an `HttpOnly; SameSite=Lax; Path=/` cookie. No `Secure` flag (the POC runs on plain `http://localhost`). No new dependency: the cookie is read with a few lines of header parsing, not `cookie-parser` or `express-session`. Why not a signed token (JWT/HMAC): it needs a secret to manage and cannot be revoked at logout without extra state. Why this one is SSO-replaceable: everything outside `server/auth.js` only ever sees `req.user` (AC 8, 9); SSO later replaces how `req.user` is produced (validate an SSO assertion/cookie, map it to a `users` row) and the sign-in/out endpoints, nothing else.
4. **Work items record a reporter (owner confirmed).** `issues.reporter_id` is set from the session on create (AC 25). In, because it is one nullable column filled in one place, and cannot be reconstructed later. No `updated_by`, no audit log.
5. **Non-author edit/delete gets an explicit 403 (owner confirmed).** Order of checks on comment edit/delete: sign-in (401), record exists (404), ownership (403), archived project (409). A non-author is told 403 even on an archived project.
6. **Seeded usernames** are the derived `alex`, `blake`, `casey`, `dana` (owner confirmed).
7. **Session lifetime: until the browser closes.** The cookie is a session cookie (no `Max-Age`/`Expires`). The server also expires a session after 12 hours idle (sliding, tracked by `sessions.last_seen_at`), so a browser left open overnight is signed out.
8. **Project-level access is a later step**, on top of permission groups. Not specced here, but the design stays open for it (see Next steps and the data model note).

## What is deliberately not protected

- Anyone can sign in as anyone: no password, no secret, no rate limiting, no lockout.
- The sign-in page and its user list (`GET /api/auth/users`) are public, so usernames and display names are visible to anyone who can reach the server.
- No HTTPS, so cookies and traffic are readable on the network. No `Secure` cookie flag.
- No CSRF tokens. `SameSite=Lax` is the only mitigation.
- Every signed-in user can read and write every project, work item and (except others' messages) everything else; there are no roles until permission groups exist.
- No audit trail of logins; no session list or "sign out everywhere".
- Static assets (`/css`, `/js`, `/login.html`) are served without sign-in; they contain no data.

## Acceptance criteria

### Sign-in page and flow

1. A public page `public/login.html` (served at `/login.html`) lists the seeded users, each shown as display name and username, loaded from `GET /api/auth/users` (AC 6). Choosing one and pressing "Sign in" sends `POST /api/auth/login` with `{ username }`. On success the browser goes to the page originally requested (AC 14) or `/` when none. The page states in small text that it is a POC sign-in without a password.
2. On failure (unknown username, server error) the sign-in page shows an inline error and stays on the page; no session is created.
3. If the user list cannot be loaded or is empty, the sign-in page shows an error line instead of an empty list.
4. A signed-in user who opens `/login.html` is redirected to `/` and stays signed in. To switch users they sign out first (AC 12).
5. `POST /api/auth/login` with `{ username }`: the match is case-insensitive and ignores surrounding whitespace. A match creates a session, sets the cookie (AC 7) and returns 200 with the user `{ id, name, username }`. A missing, non-string, empty or unknown username returns 401 `{ "error": "Unknown username." }` (same JSON error shape as the rest of the API), with no cookie set and no user or session row created. Logging in while already signed in replaces the session (the old session row is deleted, a new token issued).
6. `GET /api/auth/users` (public) returns `[{ id, name, username }]` for every user, in the same order as `GET /api/users`, and nothing else (no session data).

### Session

7. The session cookie is named `pm_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, with no `Max-Age` or `Expires` (a session cookie: the browser discards it when it closes). The server also enforces 12 hours idle: a session whose `last_seen_at` is more than 12 hours old is treated as absent and its row may be deleted; each authenticated request refreshes `last_seen_at` (at most once a minute is fine). The token is 64 hex characters from a cryptographically secure source and is never returned in a response body or visible to client JavaScript.
8. All identity logic lives in one module, `server/auth.js`. It exports (a) middleware that resolves the session cookie to a user and sets `req.user = { id, name, username }` (undefined when not signed in), and (b) `requireUser`, which enforces sign-in (AC 13). No other file reads the cookie or the `sessions` table.
9. Routes and data access obtain the acting user only from `req.user`. No route reads a user id from the request body, query or headers to decide who is acting.
10. A session whose user no longer exists, whose token is unknown, whose cookie is malformed, or which has expired is treated as not signed in: the cookie is cleared and AC 13 applies. Restarting the server keeps sessions (they are in the database).

### Current user, sign out

11. `GET /api/auth/me` returns 200 `{ id, name, username }` when signed in and 401 otherwise. The header (`.topbar`) on `public/index.html` and `public/board.html` shows `Signed in as <name>` and a "Sign out" button, filled from `/api/auth/me` before the page's other content loads. If `/api/auth/me` returns 401 the page goes to the sign-in flow (AC 14).
12. `POST /api/auth/logout` deletes the session row, clears the cookie and returns 204; it also returns 204 when nobody is signed in. After "Sign out" the browser is on `/login.html`; pressing Back and reloading a board or projects page sends it to sign-in again, and the old cookie value no longer works for any API call (401), even if replayed.

### Unauthenticated requests

13. Every `/api/*` route except `POST /api/auth/login`, `GET /api/auth/users` and `POST /api/auth/logout` returns 401 `{ "error": "Sign in required." }` when not signed in, for every method, with no data returned and no data changed. This includes `/api/users`, `/api/statuses` and the other metadata routes. An unknown `/api/...` path still returns the existing 404 only when signed in (401 first when not).
14. A request for an HTML page (`/`, `/index.html`, `/board.html`) when not signed in gets a 302 redirect to `/login.html?next=<original path and query, URL-encoded>`; for example `/board.html?project=3` returns to the same board after sign-in. `next` is honoured only when it is a same-origin relative path starting with a single `/` (not `//`, not a scheme); otherwise it is ignored and `/` is used. The client-side redirect on a 401 from the API (for example an expired session while a page is open) uses the same rule.
15. Public without sign-in: `/login.html`, `/css/*`, `/js/*`, the favicon request, and the three auth endpoints in AC 13. Nothing else.
16. A 401 received by the client for any API call while a page is open sends the user to `/login.html?next=...` (not an error banner). Unsaved dialog edits are lost; this is accepted.

### Discussion: author from the session

17. The "Posting as" dropdown, its hint text, its `localStorage` key `pm.postingAs` and the code that reads or writes it are removed from `public/board.html` and `public/js/board.js` (a leftover value in a user's `localStorage` is ignored). The post form shows the textarea and "Post" button, plus a line such as `Posting as <name>` (read-only text, no control). Discussion AC 2, 5, 6, 7 and 21 are superseded by this section; all other Discussion ACs stand.
18. `POST /api/issues/:id/comments` takes the author from `req.user`. The body is `{ body }`; `author_id`, if sent, is ignored (not an error, never used), so `{ author_id: <other user>, body }` creates a message authored by the signed-in user. The created and listed comments are otherwise unchanged in shape (`author_id`, `author_name`, ...). `checkCommentAuthor` is no longer used by the route and is removed or left unused; Discussion AC 8 ("missing/unknown `author_id` is rejected") no longer applies.
19. Edit and Delete actions are shown on exactly the messages whose `author_id` equals the signed-in user's id. A different user signing in on the same browser sees them on their own messages only. There is no mid-edit "Posting as" switch any more (Discussion open question 2 is moot).
20. `PATCH /api/comments/:id` and `DELETE /api/comments/:id` return 403 `{ "error": "You can only change your own messages." }` when the comment's `author_id` is not `req.user.id`, leaving the message unchanged. The author succeeds as before (Discussion AC 24, 26). A request body field `author_id` on PATCH is still ignored. The order of checks is in Decision 5.

### Read-only rules and other writes

21. Archived-project rules are unchanged: writes to work items and comments of an archived project return 409 via `assertWritable`, reading still works, and the UI stays read-only (MVP AC 11, Discussion AC 28). Signing in grants no exception.
22. All other write endpoints (projects, work items, statuses moves, resolution) behave as before for any signed-in user; no new restrictions exist until permission groups.

### Existing data and seed users

23. On start, `openDb` adds `users.username` if missing (idempotent, `PRAGMA table_info` check like `migrateResolution`), backfills it for existing rows with the lower-cased first word of `name` (`Alex Morgan` becomes `alex`), appends `2`, `3`, ... to resolve duplicates, and creates a unique index on `lower(username)`. Seeded users are `alex`, `blake`, `casey`, `dana`. A fresh database seeds usernames directly. No existing comment, assignee or work item is changed, so history keeps its original authors.
24. `sessions` is created with `CREATE TABLE IF NOT EXISTS`; no manual step is needed for an existing local database. A first start after upgrading signs everyone out (there are no sessions yet), which is expected.
25. `POST /api/projects/:id/issues` sets the new work item's `reporter_id` to `req.user.id`; a `reporter_id` in the body is ignored. The work item API returns `reporter_id` and `reporter_name` (null for work items created before this spec). The detail dialog shows "Reporter: <name>" as read-only text (hidden when null). Editing, moving or deleting a work item never changes `reporter_id`. Deleting a user is not possible (no user management), so no cleanup is needed.

### Tests

26. Automated tests (`npm test`, `node:test`, temporary database) cover at least:
    - Login: known username (exact, different case, padded) returns 200 and a `pm_session` cookie with `HttpOnly` and `SameSite=Lax`; unknown, empty, missing and non-string usernames return 401 with no cookie and no new row in `users` or `sessions` (AC 5).
    - `GET /api/auth/users` is public, lists every user with `id`, `name`, `username`, and returns no token (AC 6).
    - `GET /api/auth/me` returns the user when signed in, 401 without a cookie, with a garbage cookie, with an unknown token, with an expired session (set `last_seen_at` back 13 hours), that a request refreshes `last_seen_at`, that the login `Set-Cookie` has no `Max-Age` or `Expires`, and after the user row is removed in the test (AC 10, 11).
    - Logout returns 204, deletes the row, and the old cookie then gets 401 on `/api/auth/me` and on a protected route; logout with no session also returns 204 (AC 12).
    - Every protected API route family (projects, issues, comments, users, statuses/meta) returns 401 without a session and changes nothing; the three public auth routes work without one (AC 13, 15).
    - HTML pages: `/board.html?project=3` without a session returns 302 to `/login.html?next=%2Fboard.html%3Fproject%3D3`; with a session returns 200; `/login.html` and a `/css` file return 200 without one (AC 14, 15). Redirect target validation: `next=//evil.example` and `next=https://evil.example` resolve to `/` (a pure function in a testable module is acceptable).
    - Comments: a post is authored by the session user even when the body names another `author_id` or none (AC 18); a second user gets 403 on PATCH and DELETE of the first user's message and the message is unchanged; the author succeeds; 404 for an unknown id wins over 403; 403 wins over 409 on an archived project, and the author still gets 409 there (AC 20, 21).
    - Migration: a database file created with the old `users` table (no `username`) is opened and ends with unique usernames, including a duplicate-first-name case, with comments and assignees intact (AC 23).
    - Reporter: created work item has `reporter_id` and `reporter_name` of the session user, a body `reporter_id` is ignored, a legacy row returns null, and an update or move leaves it unchanged (AC 25).
    - Source checks in the `tests/source.test.js` style: SQL for users, sessions and reporter appears only in `server/data/`; the cookie name / session table is referenced only from `server/auth.js` and its data module; no route reads `author_id` or `reporter_id` from the request (AC 8, 9).
    - Existing tests: see "Effect on existing tests".

## Effect on existing tests

All API calls except the three auth routes now need a session, so the test helper changes, not every test:

- `tests/helpers.js`: `startServer` returns a client that keeps a cookie jar and, by default, is signed in as the first seeded user (`alex`) right after start, so tests that never mention auth (projects, issues, resolutions, extensibility) keep passing unchanged. Add `app.login(username)` / `app.logout()` and a way to make a second, independent client (a second jar) for two-user tests, plus a raw `request` that sends no cookie for 401 tests.
- `tests/comments.test.js`: its helper posts `{ author_id, body }`. Posts now ignore `author_id`, so (a) the tests that assert on `author_id`/`author_name` (lines about a valid message, ordering, edit keeps `author_id`) must sign in as the intended user before posting, or use two clients; (b) the test "missing, non-integer and unknown `author_id` rejected; anyone may post as anyone" (Discussion AC 8) is replaced by the AC 18 test, since those inputs no longer fail; (c) the edit test that sends `author_id`/`issue_id` in a PATCH keeps passing (still ignored) but should edit as the author; (d) archived-project tests act as the author.
- `tests/time.test.js` and `tests/source.test.js` are unaffected apart from the added source checks.

## Data model changes

Applied in the single setup in `server/db.js`, additive and idempotent, so existing local databases upgrade on the next start.

- **users**: add `username` (text, not null after backfill, unique case-insensitively via a unique index on `lower(username)`). Backfill per AC 23. `name` stays the display name.
- **sessions** (new): `token` (text primary key, 64 hex chars), `user_id` (integer, FK to users, not null), `created_at` (text, UTC ISO 8601 set in code), `last_seen_at` (text, UTC ISO 8601, set at creation and refreshed per request). Index on `user_id`.
- **issues**: add `reporter_id` (integer, nullable, FK to users). Existing rows stay null. Added via `ALTER TABLE` guarded by a `PRAGMA table_info` check.
- **comments**: no change. `author_id` is now always the session user.
- No change to statuses, types, priorities or resolutions.

API changes:

- New, public: `POST /api/auth/login`, `GET /api/auth/users`, `POST /api/auth/logout`.
- New, signed-in: `GET /api/auth/me`.
- All other `/api/*`: 401 `{ "error": "Sign in required." }` without a session (AC 13).
- `POST /api/issues/:id/comments`: author from session; `author_id` in body ignored (AC 18).
- `PATCH` and `DELETE /api/comments/:id`: 403 for non-authors (AC 20).
- `POST /api/projects/:id/issues` and the work item responses: `reporter_id`, `reporter_name` (AC 25).
- Pages: unauthenticated HTML requests redirect to `/login.html` (AC 14).

## Where permission groups will plug in (design hooks, not built)

- `req.user` is the single carrier of identity. Permission groups later add `groups`/`permissions` to that object inside `server/auth.js` (one lookup per request); no route signature changes.
- Checks would go in `server/routes/guards.js`, next to `assertWritable` (for example `assertCan(req.user, 'edit-issue', project)`), called from the same places `assertWritable` is called today in `server/routes/issues.js`, `server/routes/projects.js` and `server/routes/comments.js`, plus the ownership check added by AC 20. This spec writes that ownership check as a small named function (for example `assertOwnsComment(user, comment)` in `guards.js`) so it is the first example of the pattern.
- The UI would use `/api/auth/me` (which can later include permissions) to hide controls; the server stays the authority.

## Out of scope

- Passwords, password hashing, reset, registration, registration or verification emails, "remember me", account lockout, MFA.
- Permission groups, roles, project membership or any new restriction on who can read or write what (next step).
- SSO / SAML / OIDC (far future); only the replaceable seam is required.
- User management UI (create, rename, deactivate users), profile page, avatars.
- Free-typed username entry (see Decision 1 and open question 1).
- CSRF tokens, HTTPS, rate limiting, brute-force protection, security headers beyond the cookie flags.
- "Sign out everywhere", session list, configurable session timeouts.
- Project-level access (membership, per-project roles); see Next steps.
- Audit log of logins or edits, `updated_by`, `created_by` on projects, change history.
- Making `assignee` default to the current user, "my issues" filter, or any per-user view.
- Pasted images (still a Discussion next step).

## Next steps (not in this spec)

1. **Permission groups.** Next after this. Scope to be defined by the owner; hooks are listed above.
2. **Project-level authentication/authorization.** After permission groups: a user's access is scoped per project (who may see or write which project), layered on the groups. Not specced now. Where it would hook in: a membership check in `server/routes/guards.js` beside `assertWritable` (for example `assertMember(req.user, project)`, called wherever `loadProject`/`assertWritable` run today, including the comment and work item routes that resolve to a project), and filtering `GET /api/projects` (and the board's project list) by membership. To stay friendly to this, nothing in this spec assumes every user sees every project beyond AC 22, and a future `project_members` table (`project_id`, `user_id`, later a role) needs no change to `users`, `sessions` or `req.user`. Not created now.
3. **SSO at the BOE.** Far future. Replace the login endpoints and the cookie-to-user step inside `server/auth.js` with the SSO flow, mapping the SSO identity to a `users` row (this is where `username` would map to the directory login id). The `sessions` table may then be dropped or kept as a local cache.

## Open questions

None. The owner's answers to the earlier questions are recorded under Decisions (pick-from-list, reporter in, derived usernames, browser-session cookie with 12-hour idle expiry, explicit 403, project-level access as a later step).

## Implementation notes for the developer

Files to touch:

- `server/db.js`: `sessions` table; `migrateUsername(db)` (add column, backfill, unique index) and `migrateReporter(db)` in the style of `migrateResolution`; seed usernames for a fresh database (extend `SEED_USERS` to hold name and username; keep the export working for existing imports).
- `server/data/users.js`: add `getUserByUsername(db, username)` (case-insensitive, trimmed), `listUsers` to include `username`, and `listLoginUsers`.
- `server/data/sessions.js` (new): `createSession`, `getSession`, `touchSession`, `deleteSession`, `deleteSessionsForUser`. All SQL here.
- `server/auth.js` (new): cookie parsing and `Set-Cookie` building (no dependency), `authenticate` middleware setting `req.user`, `requireUser`, and the safe `next` validator. This is the SSO swap point; keep it free of route logic.
- `server/routes/auth.js` (new): login, logout, me, users. Mounted in `server/app.js`.
- `server/app.js`: order matters. `express.json()`, then the authenticate middleware, then a page gate for `/`, `/index.html`, `/board.html` (302 per AC 14) placed before `express.static`, then `express.static`, then the public auth routes, then `requireUser` on `/api`, then the existing routers and 404. Express 5 is in use.
- `server/routes/comments.js`: use `req.user.id` for the author; add `assertOwnsComment` to `server/routes/guards.js` and call it in PATCH and DELETE in the Decision 5 order. Remove `checkCommentAuthor` use (and the function if unused) in `server/validation.js`.
- `server/routes/issues.js` / `server/routes/projects.js` (wherever work item create lives) and `server/data/issues.js`: set and return `reporter_id`, `reporter_name` (join `users`).
- `public/login.html` (new) and `public/js/login.js` (new): list, sign in, error line, `next` handling. Reuse `css/app.css`.
- `public/js/api.js`: on a 401 response (other than from the login call) redirect to `/login.html?next=...`; add a small `postForm`-free `logout` use via `api.post`.
- `public/index.html`, `public/board.html`, `public/js/projects.js`, `public/js/board.js`: header "Signed in as" and "Sign out" (put the shared header code in one small file, for example `public/js/session.js`, loaded by both pages); remove `#posting-as`, `POSTING_AS_STORAGE_KEY` and related code; own-message check uses the signed-in user's id; show reporter in the detail dialog. These files are also touched by the resolution work; build after resolution is merged to avoid conflicts.
- `tests/helpers.js`, `tests/comments.test.js`, new `tests/auth.test.js`, `tests/source.test.js` additions; `README.md` note on signing in, the usernames, and the "not secure" warning.

Rules: SQL stays in `server/data/`; no new npm dependencies; no hard-coded user names outside the seed list; routes call data access only; never trust ids from the request body for identity.

Suggested order:

1. Schema and migrations (`username`, `sessions`, `reporter_id`) with migration tests (AC 23, 24).
2. `server/data/sessions.js`, `server/auth.js`, auth routes, `app.js` wiring, helper changes so the existing suite passes under a default signed-in client (AC 5-15).
3. Auth tests (AC 26 login/me/logout/401/redirect items).
4. Comments: author from session, ownership 403, update `tests/comments.test.js` (AC 18-21).
5. Reporter on work items (AC 25).
6. `login.html`, header, 401 handling in `api.js` (AC 1-4, 11, 16).
7. Remove "Posting as" from the board UI and wire own-message visibility (AC 17, 19).
8. Source checks, README note, and a manual browser pass: sign in, deep link redirect, sign out, two users in two browsers editing each other's messages.
