# QA: Username login

Spec: `docs/specs/username-login.md` (26 acceptance criteria, numbered 1-26 within that spec)
Date: 2026-10-24 (server clock showed 2026-10-25 00:xx UTC during the run)
QA: Haiku 5.5 (qa agent), independent re-run. Developer report (91/91) was not trusted; every claim below was re-checked.

## Verdict

**GO.** All 26 acceptance criteria PASS. One minor, non-blocking data-model deviation (D-1) is recorded below. The owner may commit once the new files are added by name (they are currently untracked, see Repo hygiene).

**VERDICT: GO**

---

## How it was verified

Environment: macOS, Node v26.7.0, Google Chrome 155 (headless, CDP driven). Own QA server on port 3217 against a scratch copy of the owner's DB. Chrome debug port 9345. Ports 3000 and 3001 were not touched. The owner's `data/app.db` was only copied, never opened for write, and is still byte-identical to the copy (`cmp` clean).

Scratch directory (all QA artifacts): `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/username-qa` (probe scripts `probe1.sh`..`probe4.sh`, `browser-check.js`, `browser-results.json`, `npm-test-clean.log`, `repo-test.log`, `npm-ci.log`, `inspect.js`, `after.json`, `mig-before.db`, `mig-after.db`, `live.db`).

### Commands and results

| Command / check | Where | Result |
|---|---|---|
| `npm test` | repo `/Users/robertmichaels/Documents/code/projectmanagement` | exit 0; tests 91, pass 91, fail 0 (run twice) |
| Clean copy: `git ls-files -co --exclude-standard` (62 files) copied to scratch `clean/` | scratch | file list built; contains all auth files |
| `npm ci` | scratch clean copy | exit 0 (warn only: better-sqlite3 install script, built OK) |
| `npm test` | scratch clean copy | exit 0; tests 91, pass 91, fail 0 |
| `git check-ignore -v` on all new files | repo | exit 1: none of the new files are ignored |
| Migration: `openDb` on a copy of the owner DB (pre-migration schema), then reopened | scratch | first open OK, second open OK, see AC 23/24 |
| Live API probes (curl, jars) | `http://localhost:3217` | see per-AC table |
| Live expiry/restart probes | scratch `live.db` (back-dated `last_seen_at` only in the scratch DB) | see AC 7, 10 |
| Browser driver `node browser-check.js` | Chrome on 9345 -> `localhost:3217` | 30 checks, 30 PASS, 0 failed, 0 page or console errors |
| Owner DB integrity | `cmp data/app.db` vs scratch copy | identical |
| Stopped only my own PIDs (QA server and Chrome) | scratch PID files | ports 3000 and 3001 still listening afterwards |

Security-ish probes and the cookie/redirect results are in the per-AC table below.

---

## Per-AC table

| AC | Result | How verified |
|---|---|---|
| 1 | PASS | Browser B1-B4: signed-out board lands on `/login.html?next=%2Fboard.html%3Fproject%3D1`; list shows 4 radios with name and username; note "without a password" present; choosing blake and pressing Sign in returns to `/board.html?project=1`. With no `next`, sign-in goes to `/` (S6). |
| 2 | PASS | Browser B19: injected 500 on `POST /api/auth/login` shows `Could not sign in: boom`, stays on `/login.html`, and `GET /api/auth/me` is still 401 (no session). Unknown username: curl returns 401 `Unknown username.`; the UI path is the same code as B19. |
| 3 | PASS | Browser B17: injected 500 on users list shows "Could not load the user list: ...", no radios. B18: injected `[]` shows "No users are available to sign in as.". |
| 4 | PASS | curl: signed-in `GET /login.html` returns `302 Location: /`. Browser S6 confirms the redirect path. |
| 5 | PASS | curl: `"  ALEX  "` returns 200 `{id:1,name:"Alex Morgan",username:"alex"}` with a cookie. Unknown, `""`, `"   "`, `123`, `null`, `{}`, `["alex"]`, and no body each return 401 `{"error":"Unknown username."}` with no `Set-Cookie`. Re-login replaces the session: with the old cookie sent, the old token returns 401 and the new one 200 (live). Row counts for users and sessions after failed logins are asserted in `tests/auth.test.js` (line 50) rather than counted live. |
| 6 | PASS | curl: `GET /api/auth/users` is public (200). Fields are exactly `id,name,username`. Ordering identical to `GET /api/users` (diff of id lists is empty). No token in the body. |
| 7 | PASS | curl `Set-Cookie: pm_session=<token>; HttpOnly; SameSite=Lax; Path=/` with no `Max-Age` or `Expires`. Token is 64 lowercase hex (regex-checked). Idle: live, a session back-dated 13h returned 401 and its row was deleted; one back-dated 11h returned 200 and `last_seen_at` was refreshed to now. Browser-level discard on close: see Not verifiable. |
| 8 | PASS | `tests/source.test.js` "the session cookie and table are used only by server/auth.js" passes. Grep of `pm_session` and sessions SQL: only `server/auth.js`, `server/data/sessions.js` (plus tests and the test helper). Identity is one module. |
| 9 | PASS | `tests/source.test.js` "no route reads the acting user from the request" passes. Grep of `server/routes`: the only body-derived identity-like read is the login route's `username`, which is the sign-in itself. Authoring and reporter come from `req.user` (live probes). |
| 10 | PASS | curl: `pm_session=garbage` and an unknown 64-hex token each return 401 with `Set-Cookie: pm_session=; ... Max-Age=0` (cookie cleared). Malformed percent-encoding returns 401. Expired session: AC 7 live probe. Deleted user: `tests/auth.test.js` line 127. Restart: live server stopped and restarted on the same DB, `me` still 200. |
| 11 | PASS | curl: `/api/auth/me` 200 signed in, 401 otherwise. Browser B5, B13: header shows `Signed in as Blake Chen` and a Sign out button. `board.js:751` and `projects.js:123` await `session.ready` before loading content. Browser B21: mid-page 401 goes to sign-in. |
| 12 | PASS | curl: logout returns 204; logout with no session returns 204; replayed cookie: `/api/auth/me` 401, `/api/projects` 401, `/board.html?project=1` 302 to sign-in. Browser B14: Sign out lands on `/login.html`. B15: Back after sign-out ends on sign-in (server redirect with `next`). B16: replayed cookie in browser gives 401. |
| 13 | PASS | curl signed out, every method (GET, POST, PUT, PATCH, DELETE, OPTIONS) on `/api/projects` gives 401 `{"error":"Sign in required."}`. Also 401 on `/api/users`, `/api/statuses`, `/api/types`, `/api/projects/1/issues`, `/api/issues/1`, `/api/issues/1/comments`, `/api/nope`, `/API/projects`, and a malformed JSON body. Signed-in `/api/nope` returns 404. Three auth routes work signed out. |
| 14 | PASS | curl: `/board.html?project=3` returns 302 `Location: /login.html?next=%2Fboard.html%3Fproject%3D3`. `/` and `/index.html` redirect (next=`/index.html`). Open-redirect probes: `//evil.example` -> `/login.html` (no next); `/%2F%2Fevil.example` -> same-origin encoded path; raw `/\evil.example` -> `/login.html` (no next); `/%5Cevil` -> same-origin. Browser B20a-c: `next=//evil.example`, `next=https://evil.example`, `next=/%5Cevil.example` all land on the same origin (`http://localhost:3217`), never off-site. Client 401 rule uses the same helper (B21). |
| 15 | PASS | curl signed out: `/login.html`, `/css/app.css`, `/js/login.js` return 200; `/favicon.ico` returns 404 (not a redirect). `/nope.html`, `/BOARD.HTML`, `/css/../../package.json` return 302 to sign-in (no traversal). |
| 16 | PASS | Browser B21: cookie deleted while board open; dragging a card sends PATCH, gets 401, and the page goes to `/login.html?next=%2Fboard.html%3Fproject%3D1` with no error banner. Unsaved dialog edits are lost as the spec accepts (not separately tested). |
| 17 | PASS | Browser B7: `#posting-as` text is `Posting as Blake Chen`, the composer has no `select` or `input`, a leftover `localStorage` `pm.postingAs` is ignored, and the string `pm.postingAs` does not appear in the page. Grep: no `postingAs` or `POSTING_AS` in `public/js` or `public/board.html`; no hint text in the composer. `tests/source.test.js` "Posting as control ... gone" passes. |
| 18 | PASS | curl: alex posts `{"author_id":2,"body":...}` and gets `author_id:1`, `author_name:"Alex Morgan"`. `tests/comments.test.js` line 72 covers `undefined`, `null`, `'abc'`, `1.5`, `0`, `-1`, `99999` and another user's id. `checkCommentAuthor` has no remaining references. |
| 19 | PASS | Browser B9 (blake): Edit and Delete only on blake's own message; alex's shows none. Browser B22 (alex, after sign-out and sign-in): Edit and Delete only on alex's message. |
| 20 | PASS | curl: blake PATCH and DELETE on alex's message return 403 `{"error":"You can only change your own messages."}`, message unchanged on re-read. Alex PATCH with `author_id:2` in body returns 200 and `author_id` stays 1. 404 wins over 403: blake on id 999999 returns 404 (`Message not found.`). `tests/comments.test.js` line 84. |
| 21 | PASS | curl on an archived project (`status Completed, archived true`): alex PATCH and POST on comments return 409; alex PATCH on a work item returns 409; blake PATCH on alex's message returns 403 (403 before 409); blake reads the thread 200. Browser B23: archived badge shown, composer hidden, Edit and Delete absent. B23b: drag refused, status unchanged. |
| 22 | PASS | curl and suites: create project, create work item (201), same-column move (`To Do` to `To Do`, 200), move to Done (browser B12, resolution `Fixed`), delete work item by another user (204). `npm test` 91/91. |
| 23 | PASS | Migration on a copy of the owner DB (pre-migration schema: `users(id,name)`, 4 users, 5 work items, 1 comment, 2 projects). After `openDb`: usernames `alex, blake, casey, dana`. Work item data hash identical before and after (excluding `reporter_id`); comments hash identical; `reporter_id` null for all 5 items; idempotent (second open changes nothing). Index `idx_users_username ON users(lower(username))` present. Duplicate-name and case cases (`alex2`, `alex3`, `solo`) are in `tests/auth.test.js` line 342. Fresh DB seeds usernames (line 380). See D-1 for the nullability note. |
| 24 | PASS | `sessions` created by the schema `CREATE TABLE IF NOT EXISTS` on the copied legacy DB without manual steps; columns `token, user_id, created_at, last_seen_at`. Everyone signed out on first start (no sessions), as the spec says. |
| 25 | PASS | curl: alex creates a work item with `reporter_id:4` in the body; response `reporter_id:1`, `reporter_name:"Alex Morgan"`. PATCH with `reporter_id:4` leaves reporter at 1. Browser B8: `Reporter: Alex Morgan` shown read-only (no inputs). B11: a legacy item with null reporter hides the reporter line. |
| 26 | PASS | `npm test` 91/91 (repo and clean copy). `tests/auth.test.js` (384 lines) covers: login variants and cookie flags; public users list; me with no, garbage, unknown, expired (13h), refreshed and deleted-user cases; `Max-Age`/`Expires` absence; logout and replay; 401 across route families with no change; public auth routes; HTML 302 with `next`; `next` validation; comment author, 403, 404 and 409 ordering; migration; reporter; source checks. |

---

## Regression checks (board-mvp, ticket-discussion, resolution)

- Suites: all 91 tests pass, including `tests/issues.test.js`, `tests/projects.test.js`, `tests/comments.test.js`, `tests/resolutions.test.js`, and `tests/source.test.js`.
- Browser: board renders cards (B6); a card drag to Done saves and shows a resolution label, and the API returns `resolution: "Fixed"` (B12); detail dialog opens, the discussion posts (B10), and the thread shows messages with the right author names (B9, B22); legacy work items show no reporter (B11); archived boards are read-only (B23).
- `moveItem` (`public/js/board.js` lines 363-392, the previous QA defect): fixed as described in the spec. Verified with proxy-style injection (Chrome Fetch interception):
  - D1a: failed PATCH (500) rolls the card back to Done and shows `Could not move PMPO-5: injected PATCH failure`.
  - D1b: successful PATCH then failed reload (GET issues 500): the card stays in the new column, the server state is the moved state, and the message is `PMPO-5 was moved, but the board could not be refreshed: ...` (not "Could not move").
  - D1c: after a page reload the board shows the server state.
- Browser console and page errors across the whole run: 0.

## Gap checks (brief)

- Empty project: `GET /api/projects/:id/issues` returns `[]` (200); its board page returns 200.
- Very long titles: 300 and 5000 characters return 400 `Title is required and must be 1-200 characters.`; a 200-character title returns 201.
- Same-column move: 200.
- Delete a work item that has messages: 204; the item and its messages are gone (later GETs 404). Any signed-in user can delete an item; the spec does not restrict this (AC 22).
- Delete a missing message: 404.

---

## Defects

### D-1 (minor, non-blocking): `users.username` is nullable on a migrated database

- Spec: Data model section says `users.username` is "text, not null after backfill". Fresh database: `notnull=1` (correct). Migrated legacy database (scratch copy): `username notnull=0`.
- Cause: `migrateUsername` in `server/db.js` runs `ALTER TABLE users ADD COLUMN username TEXT`, which cannot add NOT NULL without a default. The unique index still enforces uniqueness.
- Impact: none for current behaviour. Every user write path supplies a username, and no AC is failed (AC 23 does not state NOT NULL). A future insert path that omits username would be accepted on a migrated DB only.
- Suggestion: accept and note in the spec, or rebuild the `users` table in a later change (with care for foreign keys from `issues`, `comments` and `sessions`).

### Observations (not defects)

- `server/auth.js` requires `public/js/redirect.js`, so server code reaches into `public/`. It works and keeps one copy of the `next` rule; it may be worth a `shared/` location later.
- The owner's DB migration was checked on a copy only; the running instance on 3001 was not touched or tested (per instructions).

---

## Repo hygiene

- `git status --short`: all new auth files are untracked (`??`): `server/auth.js`, `server/routes/auth.js`, `server/data/sessions.js`, `public/login.html`, `public/js/login.js`, `public/js/session.js`, `public/js/redirect.js`, `tests/auth.test.js`, `docs/specs/username-login.md`. Add them by name when committing.
- `git check-ignore -v` on all new files (including this report): exit 1, nothing ignored.
- Clean copy (tracked plus untracked-not-ignored, 62 files): `npm ci` exit 0; `npm test` exit 0, 91/91.
- `docs/qa/resolution-partial.md` is still untracked and stale (HANDOFF says it can be deleted); not part of this change.

## Not verifiable (and why)

- Browser-level discard of the session cookie on browser close: only the header (no `Max-Age`/`Expires`) was checked. Headless Chrome was not restarted between sessions.
- Real 12-hour idle expiry: simulated by back-dating `last_seen_at` in the scratch DB, which the server then checked.
- Back-button behaviour from the back/forward cache in a headed browser: checked with `history.back()` in headless Chrome; the server redirect fired.
- Two users in two browsers at once: simulated sequentially in one browser profile and with separate cookie jars (curl). No simultaneous-browser race test.
- Tab character in `next`: a raw tab cannot be sent through Node's HTTP client; the browser strips it, and the code rejects control characters (`public/js/redirect.js`). Not exercised live.
- Unknown username shown in the sign-in page (the UI path): the API response was verified; the inline-error path is the same as B19, which was run with an injected failure.
- One harness artifact: in an earlier driver run, a `Failed to fetch` happened from a page left at the odd path `/%5Cevil.example`. curl shows the server answers that path correctly (signed-in 404 HTML, logout 204), and the final driver run navigated away first, so it was not reproduced. Treated as a harness artifact, not a product defect.
- Owner's running app on port 3001: not tested (not to be touched).
