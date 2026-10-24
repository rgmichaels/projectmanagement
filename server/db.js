// Opens the SQLite database (better-sqlite3), creates the schema and seeds the
// fixed user list on first start. This is the single schema/setup file.
// Status and type columns deliberately have no CHECK constraints: their valid
// values come from server/statuses.js and server/types.js.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
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
`;

// Seed data: a small fixed list of placeholder people (no user management in the UI).
const SEED_USERS = ['Alex Morgan', 'Blake Chen', 'Casey Rivera', 'Dana Patel'];

function openDb(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n === 0) {
    const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
    db.transaction(() => SEED_USERS.forEach((name) => insert.run(name)))();
  }
  return db;
}

module.exports = { openDb, DEFAULT_DB_PATH, SEED_USERS };
