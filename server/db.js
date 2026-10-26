// Opens the SQLite database (better-sqlite3), creates the schema, applies the
// additive migrations and seeds the fixed user list on first start. This is the single schema/setup file.
// New tables (comments, sessions, work item history, links, attachments,
// sprints and the sprint audit log) are created with
// CREATE TABLE IF NOT EXISTS, so existing databases gain them on start.
// Status, type and resolution columns deliberately have no CHECK constraints:
// their valid values come from server/statuses.js, server/types.js and
// server/resolutions.js.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { terminalStatus, defaultStatus } = require('./statuses');
const { defaultResolution } = require('./resolutions');
const { defaultGroup, initialAdminGroup } = require('./groups');
const { activeSprintState, finalSprintState } = require('./sprintStates');
const { epicTypeNames } = require('./types');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

// A string literal for SQL text (only used for values from our own lists).
const sqlText = (value) => `'${String(value).replace(/'/g, "''")}'`;

const SCHEMA = `
-- username is the sign-in name (unique, case-insensitive: see the index made
-- in migrateUsername). Databases created before it get it via migrateUsername.
-- group_name is the permission group (server/groups.js; no CHECK constraint;
-- "group" is an SQL keyword). Older databases get it via migrateGroups.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT ${sqlText(defaultGroup())}
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Planning',
  archived INTEGER NOT NULL DEFAULT 0,
  next_issue_number INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  assignee_id INTEGER REFERENCES users(id),
  epic_id INTEGER REFERENCES issues(id),
  rank INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolution TEXT,
  reporter_id INTEGER REFERENCES users(id),
  UNIQUE (project_id, number)
);

CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);

-- Discussion messages on a work item. body_format is always 'text' for now;
-- it is reserved so a later rich-text/image format can coexist with old rows.
-- Future images go in a separate table keyed by comment_id.
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  body_format TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);

-- Sign-in sessions (server/auth.js, server/data/sessions.js). token is the
-- opaque cookie value; times are UTC ISO 8601 set in code.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Work item history (server/data/history.js): one event per save, one change
-- row per changed field (field keys from server/historyFields.js). actor_name,
-- old_value and new_value are display snapshots; old_id/new_id are plain
-- integers with no foreign key so a deleted epic or user leaves history as is.
-- Existing databases gain these tables on start; existing items get no
-- backfilled history.
CREATE TABLE IF NOT EXISTS issue_history_events (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_events_issue ON issue_history_events(issue_id, id);

CREATE TABLE IF NOT EXISTS issue_history_changes (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES issue_history_events(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  old_id INTEGER,
  new_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_history_changes_event ON issue_history_changes(event_id);
CREATE INDEX IF NOT EXISTS idx_history_changes_field ON issue_history_changes(field);

-- Links between work items (server/data/links.js). One row per link; the
-- other end's reading is derived at read time. link_type is a name from
-- server/linkTypes.js (no CHECK constraint). For a symmetric type the lower
-- issue id is stored as source_id, so the unique key also catches the
-- reversed pair. Existing databases gain this table on start.
CREATE TABLE IF NOT EXISTS issue_links (
  id INTEGER PRIMARY KEY,
  link_type TEXT NOT NULL,
  source_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  created_by_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (link_type, source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_links_source ON issue_links(source_id);
CREATE INDEX IF NOT EXISTS idx_issue_links_target ON issue_links(target_id);

-- Files attached to a work item, pasted images included
-- (server/data/attachments.js). storage_key names the bytes in
-- server/data/storage.js; filename is a sanitized display name only, never a
-- path. uploader_name is a snapshot like comments and history. Allowed types
-- come from server/attachmentTypes.js (no CHECK constraint). Existing
-- databases gain this table on start.
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploader_id INTEGER REFERENCES users(id),
  uploader_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_issue ON attachments(issue_id, id);

-- Sprints (server/data/sprints.js, docs/specs/sprints-and-backlog.md). state is
-- a name from server/sprintStates.js (no CHECK constraint); dates are
-- YYYY-MM-DD or null and are display-only. The one-active-sprint unique index
-- and the issues.sprint_id / sprint_rank columns are added by migrateSprints.
CREATE TABLE IF NOT EXISTS sprints (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);

-- Sprint audit log (server/data/sprintHistory.js): append-only. sprint_id,
-- project_id and actor_id are plain integers with no foreign key and
-- sprint_name / actor_name are snapshots, so events outlive the sprint and
-- the user. Kinds and tracked fields come from server/sprintEvents.js.
CREATE TABLE IF NOT EXISTS sprint_events (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  sprint_id INTEGER,
  sprint_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  disposition TEXT,
  done_count INTEGER,
  item_count INTEGER,
  target_sprint_id INTEGER,
  target_sprint_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_sprint_events_project ON sprint_events(project_id, id);

CREATE TABLE IF NOT EXISTS sprint_event_changes (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES sprint_events(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);

CREATE INDEX IF NOT EXISTS idx_sprint_event_changes_event ON sprint_event_changes(event_id);
`;

// Seed data: a small fixed list of placeholder people (no user management in
// the UI). `name` is the display name, `username` the sign-in name, `group`
// the permission group: the first user is the initial Admin, the rest get the
// default group (no Viewer is seeded).
const SEED_USERS = [
  { name: 'Alex Morgan', username: 'alex', group: initialAdminGroup() },
  { name: 'Blake Chen', username: 'blake', group: defaultGroup() },
  { name: 'Casey Rivera', username: 'casey', group: defaultGroup() },
  { name: 'Dana Patel', username: 'dana', group: defaultGroup() },
];

// The username derived from a display name: its first word, lower-cased
// (`Alex Morgan` -> `alex`), made unique against `taken` with 2, 3, ...
function deriveUsername(name, taken) {
  const base = (String(name).trim().split(/\s+/)[0] || 'user').toLowerCase();
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${n}`;
  taken.add(candidate);
  return candidate;
}

// Databases created before the username-login spec lack users.username. Add
// it (idempotent), backfill rows without one, and enforce uniqueness
// case-insensitively. Existing user ids are kept, so comments, assignees and
// work items are untouched.
function migrateUsername(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  db.transaction(() => {
    if (!columns.includes('username')) db.exec('ALTER TABLE users ADD COLUMN username TEXT');
    const rows = db.prepare('SELECT id, name, username FROM users ORDER BY id').all();
    const missing = rows.filter((r) => !r.username);
    if (missing.length) {
      const taken = new Set(rows.filter((r) => r.username).map((r) => r.username.toLowerCase()));
      const update = db.prepare('UPDATE users SET username = ? WHERE id = ?');
      for (const r of missing) update.run(deriveUsername(r.name, taken), r.id);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(lower(username))');
  })();
}

// Databases created before the username-login spec lack issues.reporter_id.
// Existing work items keep a null reporter.
function migrateReporter(db) {
  const columns = db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);
  if (columns.includes('reporter_id')) return;
  db.exec('ALTER TABLE issues ADD COLUMN reporter_id INTEGER REFERENCES users(id)');
}

// Databases created before the resolution spec lack issues.resolution. Add it
// (idempotent: only when missing) and give work items already in the terminal
// status the default resolution, so "terminal status <=> resolution" holds.
function migrateResolution(db) {
  const columns = db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);
  if (columns.includes('resolution')) return;
  db.transaction(() => {
    db.exec('ALTER TABLE issues ADD COLUMN resolution TEXT');
    db.prepare('UPDATE issues SET resolution = ? WHERE status = ?').run(defaultResolution(), terminalStatus());
  })();
}

// Databases created before the permission-groups spec lack users.group_name.
// Add it (idempotent: only when missing); everyone gets the default group
// and the lowest-id user becomes the initial Admin, so at least one user can
// manage groups. Comments, items and history are untouched.
function migrateGroups(db) {
  const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (columns.includes('group_name')) return;
  db.transaction(() => {
    db.exec(`ALTER TABLE users ADD COLUMN group_name TEXT NOT NULL DEFAULT ${sqlText(defaultGroup())}`);
    const admins = db.prepare('SELECT COUNT(*) AS n FROM users WHERE group_name = ?').get(initialAdminGroup()).n;
    if (admins === 0) {
      db.prepare('UPDATE users SET group_name = ? WHERE id = (SELECT MIN(id) FROM users)').run(initialAdminGroup());
    }
  })();
}

// Work items created before the status pipeline (To Do / In Progress / Done)
// move to the nearest new status. In Progress keeps its name. Idempotent.
function migrateStatuses(db) {
  const rename = db.prepare('UPDATE issues SET status = ? WHERE status = ?');
  db.transaction(() => {
    rename.run(defaultStatus(), 'To Do');
    rename.run(terminalStatus(), 'Done');
    // Items that just reached the terminal status carry the default resolution.
    db.prepare('UPDATE issues SET resolution = ? WHERE status = ? AND resolution IS NULL').run(defaultResolution(), terminalStatus());
  })();
}

const SPRINT_RANK_STEP = 1000;

// The partial unique index that allows one sprint per project in the active
// state. Recreated if the active state's name in server/sprintStates.js changed.
function ensureOneActiveIndex(db) {
  const where = `WHERE state = ${sqlText(activeSprintState())}`;
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_sprints_one_active'").get();
  if (row && row.sql.includes(where)) return;
  if (row) db.exec('DROP INDEX idx_sprints_one_active');
  db.exec(`CREATE UNIQUE INDEX idx_sprints_one_active ON sprints(project_id) ${where}`);
}

// Databases created before the sprints spec lack issues.sprint_id and
// issues.sprint_rank. Add them (only when missing, so this runs once) and,
// per project with at least one non-epic work item, create one `Sprint 1`
// holding every non-epic item in rank order (sprint_rank in steps of 1000):
// Active for a non-archived project, Completed for an archived one. Epics stay
// out of sprints (both columns null). No history, no sprint events and no
// updated_at change. A fresh database gets the columns and no sprint.
function migrateSprints(db) {
  const columns = db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);
  if (!columns.includes('sprint_id')) {
    db.transaction(() => {
      db.exec('ALTER TABLE issues ADD COLUMN sprint_id INTEGER REFERENCES sprints(id)');
      db.exec('ALTER TABLE issues ADD COLUMN sprint_rank INTEGER');
      const epics = epicTypeNames();
      const notEpic = epics.length ? `AND type NOT IN (${epics.map(() => '?').join(', ')})` : '';
      const now = new Date().toISOString();
      const projectRows = db.prepare('SELECT id, archived FROM projects ORDER BY id').all();
      const itemsOf = db.prepare(`SELECT id FROM issues WHERE project_id = ? ${notEpic} ORDER BY rank, id`);
      const insertSprint = db.prepare(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, state, created_at, started_at, completed_at)
         VALUES (?, 'Sprint 1', '', NULL, NULL, ?, ?, ?, ?)`
      );
      const place = db.prepare('UPDATE issues SET sprint_id = ?, sprint_rank = ? WHERE id = ?');
      for (const project of projectRows) {
        const items = itemsOf.all(project.id, ...epics);
        if (items.length === 0) continue;
        const archived = project.archived === 1;
        const sprintId = insertSprint.run(
          project.id,
          archived ? finalSprintState() : activeSprintState(),
          now,
          now,
          archived ? now : null
        ).lastInsertRowid;
        items.forEach((item, i) => place.run(sprintId, (i + 1) * SPRINT_RANK_STEP, item.id));
      }
    })();
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_issues_sprint ON issues(project_id, sprint_id, sprint_rank)');
  ensureOneActiveIndex(db);
}

function openDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateResolution(db);
  migrateStatuses(db); // after migrateResolution: the column must exist
  migrateUsername(db);
  migrateReporter(db);
  migrateGroups(db);
  migrateSprints(db); // after migrateStatuses, so it is the last legacy step
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    const insert = db.prepare('INSERT INTO users (name, username, group_name) VALUES (?, ?, ?)');
    db.transaction(() => SEED_USERS.forEach((u) => insert.run(u.name, u.username, u.group)))();
  }
  return db;
}

module.exports = { openDb, DEFAULT_DB_PATH, SEED_USERS };
