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

test('no hard-coded resolution names outside server/resolutions.js (resolution AC 3)', () => {
  const names = ['Fixed', "Won't Do", 'Duplicate', 'Cannot Reproduce'];
  const offenders = [];
  for (const file of sourceFiles) {
    if (rel(file) === 'server/resolutions.js') continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const name of names) {
      const pattern = new RegExp(`(['"\`]${name}['"\`])|(>\\s*${name}\\s*<)`);
      if (pattern.test(text)) offenders.push(`${rel(file)}: ${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('the terminal status is derived only in server/statuses.js (resolution AC 2)', () => {
  // Nothing else picks the last status itself; the client asks the server.
  const pattern = /STATUSES\[STATUSES\.length - 1\]|statuses\[(state\.)?statuses\.length - 1\]|\.at\(-1\)/;
  const offenders = sourceFiles
    .filter((f) => rel(f) !== 'server/statuses.js')
    .filter((f) => pattern.test(fs.readFileSync(f, 'utf8')))
    .map(rel);
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

test('comment SQL appears only in the data-access layer (ticket-discussion AC 32)', () => {
  const allowed = new Set(['server/db.js', 'server/data/comments.js', 'server/data/issues.js']);
  const pattern = /\b(FROM\s+comments|INSERT\s+INTO\s+comments|UPDATE\s+comments|JOIN\s+comments)\b/i;
  const offenders = sourceFiles
    .filter((f) => !allowed.has(rel(f)))
    .filter((f) => pattern.test(fs.readFileSync(f, 'utf8')))
    .map(rel);
  assert.deepEqual(offenders, []);
  assert.match(fs.readFileSync(path.join(root, 'server/data/comments.js'), 'utf8'), pattern);
});

test('Discussion buttons cannot submit the method="dialog" form (ticket-discussion AC 4)', () => {
  const html = fs.readFileSync(path.join(root, 'public/board.html'), 'utf8');
  const section = html.slice(html.indexOf('<section id="discussion"'), html.indexOf('</section>', html.indexOf('<section id="discussion"')));
  assert.ok(section.length > 0);
  assert.doesNotMatch(section, /<form\b/i, 'no nested form');
  const buttons = section.match(/<button\b[^>]*>/gi) || [];
  assert.ok(buttons.some((b) => /id="comment-post"/.test(b)));
  for (const b of buttons) assert.match(b, /type="button"/, b);
  // Buttons built in script for Edit, Delete, Save and Cancel are type="button" too.
  const js = fs.readFileSync(path.join(root, 'public/js/board.js'), 'utf8');
  const discussionJs = js.slice(js.indexOf('// ---------- discussion ----------'));
  for (const call of discussionJs.match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
});

test('schema has no CHECK constraint on status, type or resolution (AC 27, resolution AC 3)', () => {
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
  assert.deepEqual(tables.sort(), [
    'comments',
    'issue_history_changes',
    'issue_history_events',
    'issue_links',
    'issues',
    'projects',
    'sessions',
    'users',
  ]);
  const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  db.close();
  assert.ok(users >= 3);
  // Re-opening does not duplicate the seed users.
  const again = openDb(dbPath);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM users').get().n, users);
  again.close();
});

// ---------- username login (docs/specs/username-login.md AC 8, 9, 26) ----------

const read = (f) => fs.readFileSync(f, 'utf8');
const offendersOf = (pattern, allowed) =>
  sourceFiles.filter((f) => !allowed.has(rel(f)) && pattern.test(read(f))).map(rel);

test('users, sessions and reporter SQL appear only in the data-access layer (login AC 26)', () => {
  const checks = [
    [/\b(FROM\s+users|INSERT\s+INTO\s+users|UPDATE\s+users|JOIN\s+users)\b/i, ['server/data/users.js', 'server/data/sessions.js', 'server/data/comments.js', 'server/data/issues.js']],
    [/\b(FROM\s+sessions|INSERT\s+INTO\s+sessions|UPDATE\s+sessions|JOIN\s+sessions)\b/i, ['server/data/sessions.js']],
    [/\breporter_id\s*=|reporter_name/i, ['server/data/issues.js', 'public/js/board.js']],
  ];
  for (const [pattern, files] of checks) {
    assert.deepEqual(offendersOf(pattern, new Set(['server/db.js', ...files])), [], String(pattern));
  }
  assert.match(read(path.join(root, 'server/data/sessions.js')), /INSERT\s+INTO\s+sessions/);
});

test('the session cookie and table are used only by server/auth.js (login AC 8)', () => {
  const authOnly = new Set(['server/auth.js']);
  assert.deepEqual(offendersOf(/pm_session/, authOnly), [], 'cookie name');
  assert.deepEqual(offendersOf(/headers\.cookie|req\.cookies|get\(\s*['"]cookie['"]/i, authOnly), [], 'cookie header');
  assert.deepEqual(offendersOf(/require\([^)]*data\/sessions/, authOnly), [], 'sessions data module');
  assert.match(read(path.join(root, 'server/auth.js')), /pm_session/);
  for (const name of ['authenticate', 'requireUser']) {
    assert.equal(typeof require('../server/auth')[name], 'function', name);
  }
});

test('no route reads the acting user from the request (login AC 9)', () => {
  const routes = walk(path.join(root, 'server/routes')).filter((f) => f.endsWith('.js'));
  assert.ok(routes.length > 0);
  const pattern =
    /\b(body|query|headers|params)\s*(\.|\[\s*['"])\s*(author_id|reporter_id|user_id|userId)\b|\{[^}]*\b(author_id|reporter_id)\b[^}]*\}\s*=\s*(req\.)?(body|query)/;
  assert.deepEqual(routes.filter((f) => pattern.test(read(f))).map(rel), []);
  // Comments and work items take the user from req.user.
  assert.match(read(path.join(root, 'server/routes/comments.js')), /req\.user\.id/);
  assert.match(read(path.join(root, 'server/routes/projects.js')), /reporter_id: req\.user\.id/);
});

test('seed user names appear only in the seed list (login implementation rules)', () => {
  const { SEED_USERS } = require('../server/db');
  const offenders = [];
  for (const file of sourceFiles) {
    if (rel(file) === 'server/db.js') continue;
    const text = read(file);
    for (const u of SEED_USERS) {
      for (const value of [u.name, u.username]) {
        if (new RegExp(`(['"\`]${value}['"\`])|(>\\s*${value}\\s*<)`).test(text)) offenders.push(`${rel(file)}: ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('the "Posting as" control and its storage key are gone (login AC 17)', () => {
  const html = read(path.join(root, 'public/board.html'));
  const js = read(path.join(root, 'public/js/board.js'));
  assert.doesNotMatch(html, /<select[^>]*id="posting-as"/);
  assert.doesNotMatch(js, /pm\.postingAs|POSTING_AS|localStorage\.(get|set)Item\(\s*POSTING/);
  assert.doesNotMatch(js, /author_id:/, 'the client never sends an author');
});

// ---------- ticket history (docs/specs/ticket-history.md AC 13, 22, 27) ----------

const boardJs = () => read(path.join(root, 'public/js/board.js'));
// The history part of board.js: from its section marker to the next one.
function boardHistorySection() {
  const js = boardJs();
  const start = js.indexOf('// ---------- history ----------');
  assert.ok(start !== -1, 'board.js has a history section');
  const end = js.indexOf('// ----------', start + 10);
  return js.slice(start, end === -1 ? undefined : end);
}
const HISTORY_FILES = ['server/historyFields.js', 'server/data/history.js', 'server/routes/history.js', 'public/js/historyFormat.js'];
const historySources = () => [
  ...HISTORY_FILES.map((f) => [f, read(path.join(root, f))]),
  ['public/js/board.js (history section)', boardHistorySection()],
];
const quoted = (name) => new RegExp(`(['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`])|(>\\s*${name}\\s*<)`);

test('history code names no status, type, priority or resolution (AC 27)', () => {
  const { STATUSES } = require('../server/statuses');
  const { TYPES } = require('../server/types');
  const { PRIORITIES } = require('../server/priorities');
  const { RESOLUTIONS } = require('../server/resolutions');
  const names = [...STATUSES, ...TYPES.flatMap((t) => [t.name, t.label]), ...PRIORITIES, ...RESOLUTIONS.map((r) => r.name)];
  const offenders = [];
  for (const [file, text] of historySources()) {
    for (const name of new Set(names)) if (quoted(name).test(text)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
});

test('only server/historyFields.js names the history fields (AC 27, 28)', () => {
  const { HISTORY_FIELDS } = require('../server/historyFields');
  const names = new Set(HISTORY_FIELDS.flatMap((f) => [f.key, f.column, f.label]).filter(Boolean));
  const offenders = [];
  for (const [file, text] of historySources()) {
    if (file === 'server/historyFields.js') continue;
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
});

test('history SQL appears only in server/data/history.js and the schema', () => {
  const pattern = /\bissue_history_(events|changes)\b/;
  assert.deepEqual(offendersOf(pattern, new Set(['server/db.js', 'server/data/history.js'])), []);
  assert.match(read(path.join(root, 'server/data/history.js')), /INSERT\s+INTO\s+issue_history_changes/);
  // Routes reach history through the data layer only.
  assert.match(read(path.join(root, 'server/routes/history.js')), /require\('\.\.\/data\/history'\)/);
});

test('the history route is read-only (AC 13)', () => {
  const src = read(path.join(root, 'server/routes/history.js'));
  assert.doesNotMatch(src, /router\.(post|put|patch|delete|all)\(/);
  assert.doesNotMatch(src, /assertWritable\(/, 'readable on archived projects');
});

test('History renders text only and its buttons cannot submit the form (AC 22)', () => {
  for (const [file, text] of historySources().filter(([f]) => f.startsWith('public/'))) {
    assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
  }
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<section id="history"');
  const section = html.slice(open, html.indexOf('</section>', open));
  assert.ok(section.length > 0);
  const tabs = html.slice(html.indexOf('<div id="activity-tabs"'), html.indexOf('</div>', html.indexOf('<div id="activity-tabs"')));
  for (const b of [...(section.match(/<button\b[^>]*>/gi) || []), ...(tabs.match(/<button\b[^>]*>/gi) || [])]) {
    assert.match(b, /type="button"/, b);
  }
  for (const call of boardHistorySection().match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
});

// ---------- work item links (docs/specs/work-item-links.md AC 3, 25) ----------

test('no link type name or label outside server/linkTypes.js (links AC 3)', () => {
  const { LINK_TYPES } = require('../server/linkTypes');
  const names = new Set(LINK_TYPES.flatMap((t) => [t.name, t.outward, t.inward]).filter(Boolean));
  const files = sourceFiles.filter((f) => {
    const r = rel(f);
    return (r.startsWith('server/') && r !== 'server/linkTypes.js') || r.startsWith('public/js/');
  });
  assert.ok(files.length > 0);
  const offenders = [];
  for (const file of files) {
    const text = read(file);
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${rel(file)}: ${name}`);
  }
  assert.deepEqual(offenders, []);
});

test('link SQL appears only in server/data/ (links data model)', () => {
  const pattern = /\bissue_links\b/;
  assert.deepEqual(offendersOf(pattern, new Set(['server/db.js', 'server/data/links.js'])), []);
  assert.match(read(path.join(root, 'server/data/links.js')), /INSERT\s+INTO\s+issue_links/);
  // deleteIssue removes links through the links module, in its transaction.
  assert.match(read(path.join(root, 'server/data/issues.js')), /links\.deleteLinksFor\(/);
  assert.match(read(path.join(root, 'server/routes/links.js')), /require\('\.\.\/data\/links'\)/);
});

test('the schema has issue_links with no CHECK on link_type (links data model)', () => {
  const db = openDb(tempDbPath());
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'issue_links'").get();
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'issue_links'").all().map((r) => r.name);
  db.close();
  assert.doesNotMatch(sql, /CHECK/i);
  assert.match(sql, /UNIQUE\s*\(\s*link_type,\s*source_id,\s*target_id\s*\)/);
  assert.ok(indexes.includes('idx_issue_links_source') && indexes.includes('idx_issue_links_target'));
});

test('Links renders text only and its buttons cannot submit the form (links AC 25)', () => {
  const js = boardJs();
  const start = js.indexOf('// ---------- links ----------');
  assert.ok(start !== -1, 'board.js has a links section');
  const end = js.indexOf('// ----------', start + 10);
  const section = js.slice(start, end === -1 ? undefined : end);
  assert.doesNotMatch(section, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  for (const call of section.match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<section id="links"');
  const markup = html.slice(open, html.indexOf('</section>', open));
  assert.ok(open !== -1 && markup.length > 0);
  assert.doesNotMatch(markup, /<form\b/i, 'no nested form');
  for (const b of markup.match(/<button\b[^>]*>/gi) || []) assert.match(b, /type="button"/, b);
  // Between the description and the Discussion/History tabs (AC 20).
  assert.ok(html.indexOf('name="description"') < open && open < html.indexOf('<div id="activity-tabs"'));
});
