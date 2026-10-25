// Opens the SQLite database (better-sqlite3), creates the schema, applies the
// additive migrations and seeds the fixed user list on first start. This is the single schema/setup file.
// New tables (comments, sessions, work item history) are created with
// CREATE TABLE IF NOT EXISTS, so existing databases gain them on start.
// Status, type and resolution columns deliberately have no CHECK constraints:
// their valid values come from server/statuses.js, server/types.js and
// server/resolutions.js.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { terminalStatus } = require('./statuses');
const { defaultResolution } = require('./resolutions');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

const SCHEMA = `
-- username is the sign-in name (unique, case-insensitive: see the index made
-- in migrateUsername). Databases created before it get it via migrateUsername.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL
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
`;

// Seed data: a small fixed list of placeholder people (no user management in
// the UI). `name` is the display name, `username` the sign-in name.
const SEED_USERS = [
  { name: 'Alex Morgan', username: 'alex' },
  { name: 'Blake Chen', username: 'blake' },
  { name: 'Casey Rivera', username: 'casey' },
  { name: 'Dana Patel', username: 'dana' },
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

function openDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateResolution(db);
  migrateUsername(db);
  migrateReporter(db);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    const insert = db.prepare('INSERT INTO users (name, username) VALUES (?, ?)');
    db.transaction(() => SEED_USERS.forEach((u) => insert.run(u.name, u.username)))();
  }
  return db;
}

module.exports = { openDb, DEFAULT_DB_PATH, SEED_USERS };
