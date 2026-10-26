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
    'attachments',
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
  // A tab panel after the description and the tab bar (task-dialog-redesign AC 14, 21).
  const tabs = html.indexOf('<div id="activity-tabs"');
  assert.ok(html.indexOf('name="description"') < tabs && tabs < open);
  assert.match(markup, /role="tabpanel" aria-labelledby="tab-links"/);
});

// ---------- attachments (docs/specs/attachments-and-pasted-images.md AC 1, 5, 11, 29, 36) ----------

const REQUIRES_FS = /require\(\s*['"](node:)?fs(\/promises)?['"]\s*\)/;

test('only server/data/storage.js touches the file system for attachment bytes (attachments AC 1)', () => {
  // server/db.js uses fs only to create the database's directory.
  assert.deepEqual(offendersOf(REQUIRES_FS, new Set(['server/data/storage.js', 'server/db.js'])), []);
  assert.doesNotMatch(read(path.join(root, 'server/db.js')), /data\/files|FILES_DIR|attachment bytes/i);
  // Tests: only tests/storage.test.js reads the files directory. helpers.js
  // makes the empty scratch directory; this file reads source text.
  const testFiles = walk(path.join(root, 'tests')).filter((f) => f.endsWith('.js'));
  const allowed = new Set(['tests/storage.test.js', 'tests/helpers.js', 'tests/source.test.js']);
  const offenders = testFiles
    .filter((f) => !allowed.has(rel(f)) && REQUIRES_FS.test(read(f)) && /FILES_DIR|data\/files|storage_key|storage\./.test(read(f)))
    .map(rel);
  assert.deepEqual(offenders, []);
  // The storage module exports exactly the four functions.
  assert.deepEqual(Object.keys(require('../server/data/storage')).sort(), ['exists', 'open', 'put', 'remove']);
});

test('attachment SQL appears only in server/data/attachments.js and the schema (attachments AC 5)', () => {
  const pattern = /\b(FROM\s+attachments|INSERT\s+INTO\s+attachments|UPDATE\s+attachments|JOIN\s+attachments)\b/i;
  assert.deepEqual(offendersOf(pattern, new Set(['server/db.js', 'server/data/attachments.js'])), []);
  assert.match(read(path.join(root, 'server/data/attachments.js')), /INSERT\s+INTO\s+attachments/);
  const route = read(path.join(root, 'server/routes/attachments.js'));
  assert.match(route, /require\('\.\.\/data\/attachments'\)/);
  assert.match(route, /require\('\.\.\/data\/storage'\)/);
  assert.doesNotMatch(route, /\.prepare\(|\bdb\.exec\(/, 'no SQL in the route');
  // deleteIssue removes attachment rows through the attachments module.
  assert.match(read(path.join(root, 'server/data/issues.js')), /attachments\.deleteAttachmentsFor\(/);
});

test('attachment type names and limits appear only in server/attachmentTypes.js (attachments AC 6, 11)', () => {
  const { ATTACHMENT_TYPES } = require('../server/attachmentTypes');
  const names = new Set(ATTACHMENT_TYPES.flatMap((t) => [t.extension, t.mime]));
  const files = sourceFiles.filter((f) => /^(server|public\/js)\//.test(rel(f)) && rel(f) !== 'server/attachmentTypes.js');
  const offenders = [];
  for (const file of files) {
    // DataTransfer formats (card drag-and-drop) are not attachment types.
    const text = read(file).replace(/\b(set|get)Data\(\s*'[^']*'/g, '');
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${rel(file)}: ${name}`);
    if (/10485760|10\s*\*\s*1024\s*\*\s*1024/.test(text)) offenders.push(`${rel(file)}: size limit`);
  }
  assert.deepEqual(offenders, []);
});

test('Attachments and rich text render text only; buttons cannot submit the form (attachments AC 29, 33)', () => {
  const js = boardJs();
  const start = js.indexOf('// ---------- attachments ----------');
  assert.ok(start !== -1, 'board.js has an attachments section');
  const end = js.indexOf('// ----------', start + 10);
  const section = js.slice(start, end === -1 ? undefined : end);
  for (const [name, text] of [['board.js', js], ['richText.js', read(path.join(root, 'public/js/richText.js'))]]) {
    assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, name);
  }
  for (const call of section.match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<section id="attachments"');
  const markup = html.slice(open, html.indexOf('</section>', open));
  assert.ok(open !== -1 && markup.length > 0);
  assert.doesNotMatch(markup, /<form\b/i, 'no nested form');
  for (const b of markup.match(/<button\b[^>]*>/gi) || []) assert.match(b, /type="button"/, b);
  assert.match(markup, />Save the work item first\.</);
  // Comments and the description go through the one shared renderer.
  assert.match(js, /richText\.render\(/);
  assert.equal((js.match(/richText\.render\(/g) || []).length, 1, 'one call site, used by comments and the description');
  assert.doesNotMatch(js, /el\('div', \{ class: 'message-body' \}, comment\.body\)/, 'comment bodies use the renderer');
});

test('the schema has attachments with a unique storage key and no CHECK (attachments data model)', () => {
  const db = openDb(tempDbPath());
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'attachments'").get();
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'attachments'").all().map((r) => r.name);
  db.close();
  assert.doesNotMatch(sql, /CHECK/i);
  assert.match(sql, /storage_key TEXT NOT NULL UNIQUE/);
  assert.match(sql, /issue_id INTEGER NOT NULL REFERENCES issues\(id\) ON DELETE CASCADE/);
  assert.ok(indexes.includes('idx_attachments_issue'));
});

// ---------- epic view (docs/specs/epic-view.md AC 8, 23, 25, 26) ----------

function boardSection(marker) {
  const js = boardJs();
  const start = js.indexOf(marker);
  assert.ok(start !== -1, `board.js has a "${marker}" section`);
  const end = js.indexOf('// ----------', start + 10);
  return js.slice(start, end === -1 ? undefined : end);
}

test('epic view code names no status, type, priority or resolution (epic view AC 25)', () => {
  const { STATUSES } = require('../server/statuses');
  const { TYPES } = require('../server/types');
  const { PRIORITIES } = require('../server/priorities');
  const { RESOLUTIONS } = require('../server/resolutions');
  const names = new Set([...STATUSES, ...TYPES.flatMap((t) => [t.name, t.label]), ...PRIORITIES, ...RESOLUTIONS.map((r) => r.name)]);
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<section id="epic-view"');
  const sources = [
    ['public/js/board.js (epic view section)', boardSection('// ---------- epic view ----------')],
    ['public/board.html (epic view section)', html.slice(open, html.indexOf('</section>', open))],
    ['server/data/issues.js', read(path.join(root, 'server/data/issues.js'))],
    ['server/routes/issues.js', read(path.join(root, 'server/routes/issues.js'))],
  ];
  const offenders = [];
  for (const [file, text] of sources) {
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
  // The summary is built from the status list and the terminal-status rule.
  const data = read(path.join(root, 'server/data/issues.js'));
  const summary = data.slice(data.indexOf('function childSummary'), data.indexOf('// Rank that places'));
  assert.match(summary, /STATUSES\.map\(/);
  assert.match(summary, /isTerminalStatus\(/);
});

test('epic view SQL is in the data layer and the route is read-only (epic view AC 8, 26)', () => {
  const route = read(path.join(root, 'server/routes/issues.js'));
  assert.doesNotMatch(route, /\.prepare\(|\bdb\.exec\(/, 'no SQL in the route');
  const handler = route.slice(route.indexOf("router.get('/issues/:id/children'"), route.indexOf('router.patch('));
  assert.ok(handler.length > 0);
  assert.match(handler, /issues\.listChildren\(/);
  assert.match(handler, /issues\.childSummary\(/);
  assert.doesNotMatch(handler, /assertWritable\(/, 'readable on archived projects');
  assert.doesNotMatch(route, /router\.(post|put|patch|delete)\(\s*'\/issues\/:id\/children'/);
  const data = require('../server/data/issues');
  assert.equal(typeof data.listChildren, 'function');
  assert.equal(typeof data.childSummary, 'function');
});

test('the epic view renders text only and its buttons cannot submit the form (epic view AC 23)', () => {
  const section = boardSection('// ---------- epic view ----------');
  assert.doesNotMatch(section, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  for (const call of section.match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<section id="epic-view"');
  const markup = html.slice(open, html.indexOf('</section>', open));
  assert.ok(open !== -1 && markup.length > 0);
  assert.doesNotMatch(markup, /<form\b/i, 'no nested form');
  for (const b of markup.match(/<button\b[^>]*>/gi) || []) assert.match(b, /type="button"/, b);
  // The link to a child's epic is a button in the dialog's band, not beside
  // the Epic dropdown (task-dialog-redesign AC 3, Decision 7).
  const band = html.slice(html.indexOf('<div class="band">'), html.indexOf('<div class="detail-body">'));
  assert.match(band, /<button type="button" id="epic-open" class="epicchip"/);
  const epicField = html.slice(html.indexOf('id="epic-field"'), html.indexOf('</label>', html.indexOf('id="epic-field"')));
  assert.doesNotMatch(epicField, /epic-open/);
});

// ---------- permission groups (docs/specs/permission-groups.md AC 2) ----------

test('no group name outside server/groups.js (and db.js) in server/ or public/js/ (permission groups AC 2)', () => {
  const { groupNames } = require('../server/groups');
  const allowed = new Set(['server/groups.js', 'server/db.js']);
  const files = sourceFiles.filter((f) => /^(server|public\/js)\//.test(rel(f)) && !allowed.has(rel(f)));
  assert.ok(files.length > 0);
  const offenders = [];
  for (const file of files) {
    const text = read(file);
    for (const name of groupNames()) if (quoted(name).test(text)) offenders.push(`${rel(file)}: ${name}`);
  }
  assert.deepEqual(offenders, []);
  // The client decides from the permission list, never from the group.
  const client = sourceFiles.filter((f) => rel(f).startsWith('public/js/')).map(read).join('\n');
  assert.doesNotMatch(client, /\.group\s*[!=]==?/, 'no comparison against a group');
  assert.match(client, /permissions/);
});

test('every write route calls assertCan before loading records (permission groups AC 4, 5)', () => {
  const routes = walk(path.join(root, 'server/routes')).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const file of routes) {
    const src = read(file);
    const re = /router\.(post|put|patch|delete)\(\s*'([^']+)'[^\n]*\n\s*([^\n]*)/g;
    for (const m of src.matchAll(re)) {
      if (rel(file) === 'server/routes/auth.js') continue; // sign-in itself is public
      if (!/^assertCan\(req\.user, '[a-z-]+'/.test(m[3])) offenders.push(`${rel(file)}: ${m[1]} ${m[2]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// ---------- search and filters (docs/specs/search-and-filters.md AC 8, 14, 23, 25, 26, 27) ----------

const filterSources = () => {
  const html = read(path.join(root, 'public/board.html'));
  const open = html.indexOf('<div id="filter-bar"');
  const notice = html.indexOf('<div id="filter-notice"');
  return [
    ['public/js/filters.js', read(path.join(root, 'public/js/filters.js'))],
    ['public/js/board.js (filters section)', boardSection('// ---------- filters ----------')],
    ['public/board.html (filter bar)', html.slice(open, html.indexOf('</div>', open))],
    ['public/board.html (filter notice)', html.slice(notice, html.indexOf('</div>', notice))],
  ];
};

test('filter code names no status, type, priority or resolution (search AC 9, 25)', () => {
  const { STATUSES } = require('../server/statuses');
  const { TYPES } = require('../server/types');
  const { PRIORITIES } = require('../server/priorities');
  const { RESOLUTIONS } = require('../server/resolutions');
  const names = new Set([...STATUSES, ...TYPES.flatMap((t) => [t.name, t.label]), ...PRIORITIES, ...RESOLUTIONS.map((r) => r.name)]);
  const offenders = [];
  for (const [file, text] of filterSources()) {
    assert.ok(text.length > 0, `${file} found`);
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
  // Options are built from the loaded lists.
  const section = boardSection('// ---------- filters ----------');
  for (const list of ['state.users', 'state.types', 'state.priorities', 'state.statuses', 'state.resolutions']) {
    assert.match(section, new RegExp(`${list.replace('.', '\\.')}\\.map\\(`), list);
  }
});

test('filters.js is pure and matches text literally (search AC 6)', () => {
  const src = read(path.join(root, 'public/js/filters.js'));
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|localStorage|fetch\(|\bapi\./, 'no DOM, storage or network');
  assert.doesNotMatch(src, /new RegExp|\.match\(|\.search\(|\.test\(/, 'no pattern built from user input');
  assert.match(src, /\.includes\(/);
});

test('the filter UI renders text only, has labels and cannot submit anything (search AC 8, 14, 26)', () => {
  const html = read(path.join(root, 'public/board.html'));
  for (const [file, text] of filterSources()) {
    assert.doesNotMatch(text, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
    if (file.startsWith('public/board.html')) {
      assert.doesNotMatch(text, /<form\b/i, `${file}: no form`);
      for (const b of text.match(/<button\b[^>]*>/gi) || []) assert.match(b, /type="button"/, b);
    }
  }
  for (const call of boardSection('// ---------- filters ----------').match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) {
    assert.match(call, /type: 'button'/, call);
  }
  // Every control is inside a <label>, in the order search, five dropdowns, Clear, count.
  const bar = filterSources().find(([f]) => f === 'public/board.html (filter bar)')[1];
  const order = ['filter-text', 'filter-assignee', 'filter-type', 'filter-priority', 'filter-status', 'filter-resolution', 'filter-clear', 'filter-count'];
  const positions = order.map((id) => bar.indexOf(`id="${id}"`));
  assert.ok(positions.every((p) => p !== -1), 'all controls present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'in spec order');
  for (const id of order.slice(0, 6)) assert.match(bar, new RegExp(`<label[^>]*>[^<]+<(input|select)[^>]*id="${id}"`), id);
  // The filter bar sits in the toolbar, after Group by; filters.js loads before board.js.
  assert.ok(html.indexOf('id="group-by"') < html.indexOf('<div id="filter-bar"'));
  assert.ok(html.indexOf('js/filters.js') < html.indexOf('js/board.js'));
});

test('filters are read-only UI, stored per project with try/catch (search AC 15, 17, 23, 24)', () => {
  const section = boardSection('// ---------- filters ----------');
  assert.doesNotMatch(section, /api\.(post|patch|put|del)\(/, 'no write endpoint');
  assert.doesNotMatch(section, /readOnly\(\)|session\.can\(/, 'no permission or archive check');
  assert.doesNotMatch(section, /localStorage\./, 'storage goes through the try/catch helpers');
  const js = boardJs();
  assert.match(js, /FILTERS_STORAGE_PREFIX = 'pm\.filters\.'/);
  assert.match(section, /\$\{FILTERS_STORAGE_PREFIX\}\$\{state\.project\.id\}/);
  const helpers = js.slice(js.indexOf('function storageGet'), js.indexOf('const state = {'));
  assert.equal((helpers.match(/try \{/g) || []).length, 2, 'reads and writes wrapped');
  assert.equal((js.match(/localStorage\./g) || []).length, (helpers.match(/localStorage\./g) || []).length, 'no unguarded localStorage use');
});

test('lanes come from every item and drag ranks from the full column (search AC 18, 19)', () => {
  const js = boardJs();
  const lanes = js.slice(js.indexOf('function computeLanes('), js.indexOf('// ---------- rendering ----------'));
  assert.match(lanes, /const items = state\.items;/, 'lane list from the unfiltered set');
  assert.match(lanes, /visible\.filter\(/, 'lane contents from the filtered set');
  const rank = js.slice(js.indexOf('function computeRank('), js.indexOf('async function moveItem('));
  assert.match(rank, /const column = state\.items\.filter\(/, 'neighbours from the unfiltered column');
  const render = js.slice(js.indexOf('function render()'), js.indexOf('function renderHeader()'));
  assert.match(render, /visibleItems\(\)/);
  assert.doesNotMatch(render, /state\.items\.filter\(/, 'column counts use the filtered items');
});

// ---------- task dialog redesign (docs/specs/task-dialog-redesign.md AC 7, 14-16, 31, 33, 35, 38) ----------

function detailSection() {
  const js = boardJs();
  const start = js.indexOf('// ---------- detail view ----------');
  assert.ok(start !== -1, 'board.js has a detail view section');
  const end = js.indexOf('// ---------- discussion ----------', start);
  return js.slice(start, end);
}
const detailMarkup = () => {
  const html = read(path.join(root, 'public/board.html'));
  return html.slice(html.indexOf('<dialog id="detail"'), html.indexOf('</dialog>'));
};

test('the status track is built from the server list and names no status (redesign AC 7, 38)', () => {
  const { STATUSES } = require('../server/statuses');
  const { TYPES } = require('../server/types');
  const { PRIORITIES } = require('../server/priorities');
  const { RESOLUTIONS } = require('../server/resolutions');
  const names = new Set([...STATUSES, ...TYPES.flatMap((t) => [t.name, t.label]), ...PRIORITIES, ...RESOLUTIONS.map((r) => r.name)]);
  const offenders = [];
  for (const [file, text] of [['board.js (detail view)', detailSection()], ['board.html (dialog)', detailMarkup()]]) {
    for (const name of names) if (quoted(name).test(text)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, []);
  const js = detailSection();
  assert.match(js, /state\.statuses\.map\(/, 'one step per server status');
  assert.match(js, /type: 'radio', name: 'status'/, 'radios named status');
  assert.match(js, /isTerminal\(selectedStatus\(\)\)/, 'resolution follows the terminal-status rule');
  const html = detailMarkup();
  assert.match(html, /<fieldset id="status-field" class="track">\s*<legend>Status<\/legend>/);
  assert.doesNotMatch(html, /<select name="status"/, 'the select is replaced');
});

test('the dialog has one tab bar with five tabs and a panel for each (redesign AC 14-16)', () => {
  const html = detailMarkup();
  const open = html.indexOf('<div id="activity-tabs"');
  const bar = html.slice(open, html.indexOf('</div>', open));
  assert.match(bar, /role="tablist" aria-label="Activity"/);
  const tabs = bar.match(/<button\b[^>]*>/gi) || [];
  assert.deepEqual(
    tabs.map((b) => b.match(/id="([^"]+)"/)[1]),
    ['tab-children', 'tab-discussion', 'tab-history', 'tab-links', 'tab-attachments'],
    'in spec order'
  );
  const panels = { 'tab-children': 'epic-view', 'tab-discussion': 'discussion', 'tab-history': 'history', 'tab-links': 'links', 'tab-attachments': 'attachments' };
  for (const b of tabs) {
    assert.match(b, /type="button"/, b);
    assert.match(b, /role="tab"/, b);
    assert.match(b, /aria-selected="(true|false)"/, b);
    const id = b.match(/id="([^"]+)"/)[1];
    assert.match(b, new RegExp(`aria-controls="${panels[id]}"`), b);
    assert.match(html, new RegExp(`<section id="${panels[id]}"[^>]*role="tabpanel" aria-labelledby="${id}"`), id);
    assert.match(bar, new RegExp(`id="${id}"[^>]*>[^<]*<span class="n"`), `${id} has a count pill`);
  }
  assert.match(tabs[0], /\shidden>/, 'Children only for epic types');
  // Default tab per open; errors open their tab.
  const js = detailSection();
  assert.match(js, /selectTab\(item && isEpicItem\(item\) \? 'children' : 'discussion'\)/);
  for (const id of ['linkError', 'attachmentError', 'epicViewError', 'epicAddError', 'commentError']) {
    assert.match(js, new RegExp(`\\[els\\.${id}, '`), id);
  }
});

test('the dialog renders text only and only Save submits (redesign AC 13, 31, 33)', () => {
  assert.doesNotMatch(detailSection(), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  for (const call of detailSection().match(/el\(\s*'button',\s*\{[^}]*\}/g) || []) assert.match(call, /type: 'button'/, call);
  const html = detailMarkup();
  const buttons = html.match(/<button\b[^>]*>/gi) || [];
  const submits = buttons.filter((b) => !/type="button"/.test(b));
  assert.deepEqual(submits, ['<button type="submit" value="save" id="detail-save" class="primary">']);
  assert.match(html, /<dialog id="detail" aria-labelledby="detail-heading">/);
  assert.match(html, /<button type="button" id="detail-x" class="x" aria-label="Close">/);
  assert.match(html, /<textarea name="title"[^>]*maxlength="200"[^>]*aria-label="Title"/);
  assert.match(html, /<p class="error" id="title-error" role="alert"/);
  assert.match(html, /<p id="detail-banner" class="banner" role="status"/);
  assert.match(detailSection(), /'Title is required\. Enter a title and save again\.'/);
});

test('the dialog palette is scoped to dialog#detail, not :root (redesign AC 35)', () => {
  const css = read(path.join(root, 'public/css/app.css'));
  const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  for (const token of ['--teal', '--navy', '--gold', '--linkblue', '#0b5d66', '#face00']) {
    assert.ok(!rootBlock.includes(token), `${token} not in :root`);
  }
  const scoped = css.slice(css.indexOf('dialog#detail {'), css.indexOf('}', css.indexOf('dialog#detail {')));
  for (const decl of ['--teal: #0b5d66', '--teal-soft: #e5eded', '--navy: #154973', '--linkblue: #004dd1', '--gold: #face00', '--danger: #c0300b']) {
    assert.ok(scoped.includes(decl), decl);
  }
  // Gold appears only on the band and the dark summary panel.
  for (const line of css.split('\n').filter((l) => /var\(--gold\)/.test(l))) {
    assert.match(line, /\.band|\.epicchip|\.x:hover|\.title-in:focus|\.darkpanel/, line);
  }
  assert.doesNotMatch(css, /@import|url\(\s*['"]?https?:/, 'no external fonts or images');
});

test('description image thumbnails show under the read view too (redesign AC 12)', () => {
  const js = boardJs();
  const fn = js.slice(js.indexOf('function setDescriptionEditing('), js.indexOf('function renderDescriptionView('));
  assert.match(fn, /renderDescriptionImages\(\);/, 'the strip is rendered in both views');
  assert.doesNotMatch(fn, /descriptionImages\.hidden = true/, 'the read view does not hide the strip');
  const strip = js.slice(js.indexOf('function renderDescriptionImages('), js.indexOf("els.descriptionEdit.addEventListener('click'"));
  assert.match(strip, /editing\.description/, 'read view uses the saved text');
  assert.match(strip, /els\.description\.value/, 'edit view uses the textarea');
  assert.doesNotMatch(strip, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});
