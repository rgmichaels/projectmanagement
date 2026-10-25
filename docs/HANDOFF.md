# Handoff: pick up here

Rewritten 2026-10-25 ~10:35 EDT. Pipeline per CLAUDE.md: product-manager (Sonnet) → owner reviews the spec → developer (Opus) → qa (Haiku) → owner commits. The orchestrating session routes work through the team and does not implement features directly. Standing owner instructions: **QA, then commit on GO, then push to `origin/main`** (private repo `rgmichaels/projectmanagement`).

## Git state

Pushed to `origin/main`: board MVP `09d3bf3`, discussion `fffe1cb`, resolution `31e8d02`, login `8ba2c08`, history `6876f3a`, handoff `1969f57`, links `67dd20a`, attachments `b91e72d`, epic view `fd1b833`.

**Permission groups: see "Status of permission groups" below.** Check `git status` and `git log` first; do not trust this file over them.

## Status of permission groups: DONE (QA GO 21/21, committed and pushed 2026-10-25 17:0x; ignore the stale "stopped" text below)

Re-run QA gave **GO** (`docs/qa/permission-groups.md`, 260/260 tests, browser pass as Viewer/Member/Admin). Note: write 403 messages are per-permission ("edit work items", "delete work items", "manage projects", "manage users"), not always "edit work items". Real DB is NOT yet migrated until 3001 is restarted from the project folder (back up `data/app.db` first). Everything below this heading up to "Running the app" is history.

## (history) Status of permission groups

- Spec: `docs/specs/permission-groups.md`, Approved for build (untracked until committed).
- Built by the developer: 260/260 tests, uncommitted in the working tree (new `server/groups.js`, `server/routes/users.js`, `public/users.html`, `public/js/users.js`, `tests/permissions.test.js`, `tests/groups-extensibility.test.js`, plus edits to routes, `server/auth.js`, `server/db.js`, `public/js/*`, README).
- **QA was stopped by the owner at ~10:38 before it finished; no report was written** (`docs/qa/permission-groups.md` does not exist). **Next step: re-run QA** (qa agent, spare port such as 3002 with a scratch DB copy and scratch `FILES_DIR`, never 3001/3000, never the real DB). The developer could not test the UI in a browser, so QA's per-group browser pass (Viewer / Member / Admin, checklist in the developer's report: Viewer read-only everywhere incl. /users.html error line; Member cannot delete or manage projects; Admin Users page, last-Admin 409, group change applies to an open session) is the important part. On **GO**: commit the permission files by name (not `git add -A`; check `git status`, including `tests/permissions.test.js` and `docs/HANDOFF.md`), push, then restart 3001 (below). On **NO-GO**: send the report to the developer first. The owner has pre-approved "QA, then commit and push on GO".
- The built-but-uncommitted code is in the working tree and `npm test` was 260/260 per the developer.
- Owner decisions: global groups, one per user; Admin does everything plus delete items, manage projects, change user groups; Admin does NOT override others' comments/attachments; migrated `alex` (lowest id) becomes Admin, everyone else Member; no Viewer seeded; Users page Admin only; a Viewer's old comments stay visible.

## Running the app

- Live server on **3001** is currently a **snapshot of committed code** (`fd1b833`, epic view) run from the scratchpad with `DB_PATH` and `FILES_DIR` pointing at the real `data/app.db` and `data/files/`. This is because developers edit the working folder while the server runs. It dies with the session/computer; to restart normally, from the project folder: `cp data/app.db data/app.db.bak7 && PORT=3001 npm start` (never kill port 3000, an unrelated Next.js app; never broad `pkill`; kill 3001 by its PID from `lsof -nP -iTCP:3001 -sTCP:LISTEN -t`).
- **Restarting with the permission-groups code migrates the real DB** (adds `users.group_name`; alex Admin, others Member). Back up first (backups so far: `data/app.db.bak` … `bak6`, git-ignored).
- Tests: `npm test`. Local DB `data/app.db` and uploaded files `data/files/` are git-ignored.
- Single-source lists: statuses, types, resolutions, link types, attachment types, groups (`server/*.js`); `tests/source.test.js` enforces no hard-coded names elsewhere.

## Owner to-do / things to try (nothing blocks the next build)

- Try a **real Cmd+V screenshot paste** in a comment and in a description (QA only tested synthetic paste, Chrome only); also Safari/Firefox.
- Try dragging a child card to Done and reopening its epic; dragging a card by its epic chip.
- Confirm the new description read view with an **Edit** button (the textarea is no longer always visible on saved items) is acceptable; the attachments spec said editing is unchanged.
- Minor QA notes, none blocking: attachments spec AC 2 vs AC 7 wording conflict on `../../etc/passwd` (refused 415 because no allowed extension); document `GET /api/attachments/:id` in the README; the 413 message repeats "10 MB" instead of deriving it; a paste still uploading when a dialog is closed and reopened could leave the counter off; `target_id` given as a digit string is accepted by the links API; an epic child in an unknown old status counts in the total but not per status; comments in `public/js/users.js` and `board.js` mention "Admin"/"Viewer" (allowed by the source test); the `users.username` nullable note on migrated legacy databases.

## Next ideas (not scoped; ask the owner)

1. Project-level authentication / per-project membership (hook exists: `assertCan(user, permission, project)` ignores `project` today).
2. Project-level activity feed (archive, status, create/delete). Ask what "work item history" meant beyond per-item history.
3. Search and filters (Claude's suggested next pick), then backlog and sprints, labels/components/due dates, subtasks, reports.
4. Configurable workflow (custom statuses and transitions).
- Dropped by the owner: BOE hosting, SSO.

## Practical notes

- QA reports in `docs/qa/` (one per feature); specs in `docs/specs/` (all approved ones are committed except permission groups until it lands).
- Project statuses Planning / In Progress / Completed / Cancelled; archive is a flag; archived boards are read-only. Work item types Defect, Task (default), Issue, Epic.
- Lesson learned: a `.gitignore` rule once hid `server/data/` from a commit. Always check the committed file list after `git add` by name.
- Memory notes live in `~/.claude/projects/-Users-robertmichaels-Documents-code-projectmanagement/memory/`.
