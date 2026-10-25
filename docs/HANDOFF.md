# Handoff: pick up here

Written 2026-10-24 ~12:20 EDT, mid-session. Pipeline per CLAUDE.md: product-manager (Sonnet) → owner reviews spec → developer (Opus) → qa (Haiku) → owner commits. The orchestrating session routes work through the team and does not implement features directly.

## Git state

- `main`: `398c491` scaffolding → `09d3bf3` board MVP → `fffe1cb` ticket discussion (also fixed `.gitignore` so `server/data/` is tracked). Nothing pushed.
- After `fffe1cb` the working tree had these **uncommitted** changes (check `git status`; do not trust this list over it):
  - **Resolution feature, built, QA was running** when this was written. Code: `server/resolutions.js`, `tests/resolutions.test.js`, `tests/resolution-extensibility.test.js`, plus edits to `server/statuses.js`, `server/db.js`, `server/data/issues.js`, `server/validation.js`, `server/routes/meta.js`, `public/board.html`, `public/js/board.js`, `public/css/app.css`, `tests/source.test.js`, `README.md`. Developer reported 66/66 tests. QA report goes to `docs/qa/resolution.md`.
  - New draft specs: `docs/specs/username-login.md`, `docs/specs/ticket-history.md` (the latter may still have been in progress).
- Owner's standing instruction: **commit the resolution work once QA says GO.** If QA says NO-GO, send the report back to the developer first. Add files by name or check `git status` and the committed file list; do not `git add -A` blindly while specs are mid-edit. Verify new files are not ignored (`git check-ignore`).

## Queue, in order

000. **UPDATE (21:00):** Ticket history QA = **GO**, committed as `6876f3a`. App on 3001 restarted with it (backup `data/app.db.bak3`). The whole queue (board MVP, discussion, resolution, login, history) is built, QA'd and committed. Open items: the owner's answer on what "work item history" means (see Later); QA minor notes on history (a field filter with no matches says "No history recorded yet."; Save closes the dialog so the post-save History refresh has no visible effect, owner to accept or amend AC 25 wording); the cosmetic `users.username` nullable note. Nothing is pushed. Still untracked: `docs/HANDOFF.md` and the stale `docs/qa/resolution-partial.md` (delete).
00. **(older) UPDATE (20:40):** Username login QA = **GO**, committed as `8ba2c08` (also includes the reload-rollback fix). The app on port 3001 was restarted with it (pre-restart backups: `data/app.db.bak`, `data/app.db.bak2`). The ticket history spec was then sent to the developer (build in progress; QA next; commit on GO, adding files by name; the owner has been giving "commit on GO" for each feature). Minor known item: on a migrated legacy DB `users.username` is nullable (SQLite ALTER limitation), while fresh DBs have NOT NULL; no AC fails. Untracked and not to be committed with features: `docs/HANDOFF.md` (commit it when the owner agrees), `docs/qa/resolution-partial.md` (stale, delete).
0. **(older) UPDATE (20:15):** Resolution QA finished with **GO** (`docs/qa/resolution.md`) and is **committed as `31e8d02`**. The login spec was then sent to the developer (build in progress; QA next, commit on GO). `docs/qa/resolution-partial.md` below is superseded and can be deleted. QA also found one minor, non-blocking, pre-existing defect: in `public/js/board.js` `moveItem`, if the follow-up `reloadItems()` GET fails after a successful PATCH, the card is rolled back and "Could not move" is shown even though the server saved the move (fix: move the reload out of the rollback `try`). Not fixed yet. Items 1 below is history.
1. **(Done, see above)** **Resolution:** QA was **stopped by the owner before it finished** (12:27). Partial notes are in `docs/qa/resolution-partial.md` (tests 66/66 in a clean copy, migration and backfill verified, 45 browser checks passing, no defects found; regression baseline and final verdict not done). Re-run QA (or a short finishing pass using those notes) and write `docs/qa/resolution.md`. The owner's standing instruction: **if GO, commit** (suggested message: "Add resolution field"), adding the resolution files by name. The running app on port 3001 was restarted with this code, and `data/app.db.bak` is a pre-migration backup. Spec: `docs/specs/resolution-and-comments.md` (title "Resolution"; the filename is a leftover, the PM offered to rename it `resolution.md`).
2. **Username login:** `docs/specs/username-login.md`. Owner approved these defaults; the PM was asked to fold them into the spec:
   - pick the username from a list
   - add `reporter_id` on work items
   - usernames `alex`, `blake`, `casey`, `dana`
   - session lasts until the browser closes (replaces the spec's 30 days)
   - explicit 403 when editing or deleting another user's message
   - leave a hook open for **project-level authentication** (a later step; do not spec or build it yet)
   
   Owner said to **send it to the developer once it is ready**, which means after resolution is committed (both touch `public/board.js` and the board page) and the spec reflects the answers above. Then run QA, then commit when GO (owner has pre-approved "QA, then commit on GO" for each earlier feature, but ask if unsure).
3. **Ticket history:** `docs/specs/ticket-history.md` (per-work-item history: who changed what and when). The owner accepted all six PM recommendations (login first; separate Discussion/History tabs; delete history with the item; description changes recorded as "changed" only; no backfill; project-level changes deferred) and the PM was asked to fold them in. Build it **after** login, because it takes the actor from `req.user`. Then QA, then commit.

## Later (not scoped, see memory `pm-poc-next-steps`)

- Permission groups, then project-level authentication.
- A project-level activity/history feed (archive and status changes, items created or deleted).
- The owner also said "we'll need a work item history too later on" (2026-10-24). The per-item history is already specced above, so **ask what else they meant** (a project-level feed? history that survives deleting an item?) before scoping anything.
- Pasting images (screen snapshots) into discussion messages and work item descriptions.
- Full configurable workflow (custom statuses, transitions); possibly SSO at the BOE.
- Possible Jira-style additions mentioned: backlog and sprints, search and filters, subtasks and links, labels, components, due dates, reports.

## Practical notes

- **Run the app:** `PORT=3001 npm start` (port 3000 is used by an unrelated Next.js app, FlawFerret2; never kill it, and never use broad `pkill`). Tests: `npm test`.
- **Local DB:** `data/app.db`, git-ignored. Local SQLite for now; the BOE may move to a SQL database later, so all SQL stays in `server/data/`.
- **Single-source lists:** statuses (`server/statuses.js`), types (`server/types.js`), resolutions (`server/resolutions.js`). No hard-coded names elsewhere; `tests/source.test.js` enforces this.
- **QA reports** in `docs/qa/`: `board-mvp.md`, `ticket-discussion.md`, `resolution.md`.
- **Other spec decisions:** project statuses Planning/In Progress/Completed/Cancelled; archive is a flag on Completed/Cancelled projects, archived boards are read-only, and moving an archived project back to Planning/In Progress unarchives it. Work item types Defect, Task (default), Issue, Epic.
- **Lesson learned:** a `.gitignore` rule `data/` once hid `server/data/` from a commit. Always check the committed file list.
