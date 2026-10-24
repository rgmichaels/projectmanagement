// Static checks on the source (AC 25-27, 38) and SQL confinement.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../server/db');
const { tempDbPath } = require('./helpers');

const root = path.join(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const rel = (f) => path.relative(root, f).split(path.sep).join('/');
const sourceFiles = [...walk(path.join(root, 'server')), ...walk(path.join(root, 'public'))].filter((f) =>
  /\.(js|html|css)$/.test(f)
);

// The single-source list files (and seed data in db.js) may name these values.
const LIST_FILES = new Set(['server/statuses.js', 'server/types.js', 'server/projectStatuses.js']);

test('no hard-coded work item status or type names outside their list files (AC 27)', () => {
  const names = ['To Do', 'In Progress', 'Done', 'Defect', 'Task', 'Issue', 'Epic'];
  const offenders = [];
  for (const file of sourceFiles) {
    if (LIST_FILES.has(rel(file))) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const name of names) {
      // String literals in code and text nodes in markup.
      const pattern = new RegExp(`(['"\`]${name}['"\`])|(>\\s*${name}\\s*<)`);
      if (pattern.test(text)) offenders.push(`${rel(file)}: ${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the epic behaviour keys off the isEpic flag (AC 26)', () => {
  const { TYPES } = require('../server/types');
  assert.equal(TYPES.filter((t) => t.isEpic).length, 1);
});

test('SQL appears only in the data-access layer', () => {
  const allowed = new Set(['server/db.js']);
  const offenders = sourceFiles
    .filter((f) => !allowed.has(rel(f)) && !rel(f).startsWith('server/data/'))
    .filter((f) => /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(fs.readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(offenders, []);
});

test('schema has no CHECK constraint on status or type (AC 27)', () => {
  const db = openDb(tempDbPath());
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'issues'").get();
  db.close();
  assert.doesNotMatch(sql, /CHECK/i);
});

test('a fresh database file gets the schema and seed users (AC 38)', () => {
  const dbPath = tempDbPath();
  assert.ok(!fs.existsSync(dbPath));
  const db = openDb(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  assert.deepEqual(tables.sort(), ['issues', 'projects', 'users']);
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  db.close();
  assert.ok(users >= 3);
  // Re-opening does not duplicate the seed users.
  const again = openDb(dbPath);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM users').get().n, users);
  again.close();
});
