# projectmanagement

A proof-of-concept, Jira-style project management tool: work items, a kanban board, and swimlanes (by assignee, epic or priority), built because Jira is too expensive for a personal project.

Status: board MVP implemented (spec: `docs/specs/board-mvp.md`), plus a Discussion thread on each work item (spec: `docs/specs/ticket-discussion.md`).

## Run

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Then open http://localhost:3000. If port 3000 is taken, run `PORT=3001 npm start` instead.

The database is a single local SQLite file, `data/app.db` (git-ignored). It is created with an empty schema and the seeded users on first start. New tables (such as `comments` for the Discussion) are added to an existing database automatically on the next start. Delete it and restart to start fresh. Set `DB_PATH` to use a different file.

## Tests

```sh
npm test
```

Tests use the built-in `node:test` runner against the API, each with its own temporary database. `public/js/time.js` (Discussion timestamps) is also unit tested directly.

## Stack

- Node.js + Express 5, serving the API and the static frontend in `public/` (plain HTML, CSS and vanilla JavaScript, native HTML5 drag and drop, no build step).
- SQLite driver: **`better-sqlite3`** (the spec's default; it installs a prebuilt binary for the current Node, so the built-in `node:sqlite` was not needed).

## Layout

- `server/statuses.js`: the single list of work item statuses and the board's column order.
- `server/types.js`: the single list of work item types, with display metadata, the default flag and the `isEpic` flag.
- `server/priorities.js`, `server/projectStatuses.js`: the priority list and the project status list.
- `server/db.js`: schema and seed users. `server/data/`: the data-access layer; all SQL lives in these two places.
- `server/routes/`: REST API (validation, archived read-only guard); routes call the data-access layer only.
- `public/`: project list (`index.html`), board (`board.html`), scripts in `public/js/`.

## Discussion

Open a work item to see its Discussion after the Description: post plain-text messages (newest first), and edit or delete your own. There is no login yet, so a temporary "Posting as" dropdown picks the author from the seeded users; it is remembered in this browser and provides no security (the API accepts any user). Cards show each item's message count. Archived projects show discussions read-only.
- `tests/`: API and source checks.

To add a status or work item type, add an entry to `server/statuses.js` or `server/types.js` and restart; the board, swimlanes, forms and validation pick it up.

See `CLAUDE.md` for how the AI dev team (product manager, developer, QA) builds this.
