// Username login (docs/specs/username-login.md): login, sessions, sign-out,
// 401 for signed-out API calls, page redirects, `next` validation, the
// username migration and the work item reporter (AC 5-15, 23-26).
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { openDb } = require('../server/db');
const { safeNext, loginUrl } = require('../public/js/redirect');
const auth = require('../server/auth');
const { startServer, tempDbPath, createProject, createItem } = require('./helpers');

let app;
let users;
test.before(async () => {
  app = await startServer(); // signed in as alex
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const count = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const sessionCookie = (res) => res.setCookies.find((c) => c.startsWith('pm_session='));
const tokenOf = (res) => sessionCookie(res).split(';')[0].slice('pm_session='.length);
const withCookie = (cookie) => ({ Cookie: cookie });
const HOURS = 60 * 60 * 1000;

// ---------- login (AC 5) ----------

test('known username: exact, other case, padded -> 200, user and a session cookie (AC 5, 7)', async () => {
  for (const username of ['blake', 'BLAKE', 'Blake', '  blake \n']) {
    const before = count('sessions');
    const res = await app.raw('POST', '/api/auth/login', { username });
    assert.equal(res.status, 200, username);
    const blake = users.find((u) => u.username === 'blake');
    assert.deepEqual(res.body, { id: blake.id, name: blake.name, username: 'blake' });
    const cookie = sessionCookie(res);
    assert.ok(cookie, 'sets pm_session');
    const attrs = cookie.split(';').map((a) => a.trim().toLowerCase());
    assert.ok(attrs.includes('httponly'));
    assert.ok(attrs.includes('samesite=lax'));
    assert.ok(attrs.includes('path=/'));
    assert.ok(!attrs.some((a) => a.startsWith('max-age') || a.startsWith('expires')), 'a browser-session cookie');
    assert.ok(!attrs.includes('secure'));
    const token = tokenOf(res);
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(res.body).includes(token), 'token not in the body');
    assert.equal(count('sessions'), before + 1);
  }
});

test('unknown, empty, missing and non-string usernames -> 401, no cookie, no rows (AC 5)', async () => {
  const usersBefore = count('users');
  const sessionsBefore = count('sessions');
  for (const body of [{ username: 'nobody' }, { username: '' }, { username: '   ' }, {}, { username: 42 },
    { username: null }, { username: ['alex'] }, { username: { a: 1 } }, undefined]) {
    const res = await app.raw('POST', '/api/auth/login', body);
    assert.equal(res.status, 401, JSON.stringify(body));
    assert.deepEqual(res.body, { error: 'Unknown username.' });
    assert.equal(sessionCookie(res), undefined, 'no cookie');
  }
  assert.equal(count('users'), usersBefore);
  assert.equal(count('sessions'), sessionsBefore);
});

test('logging in again replaces the session (AC 5)', async () => {
  const c = await app.client('casey');
  const oldCookie = c.cookie;
  const oldToken = oldCookie.slice('pm_session='.length);
  const before = count('sessions');
  const me = await c.login('dana');
  assert.equal(me.username, 'dana');
  assert.notEqual(c.cookie, oldCookie);
  assert.equal(count('sessions'), before, 'old row deleted, new one created');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token = ?').get(oldToken).n, 0);
  assert.equal((await app.raw('GET', '/api/auth/me', undefined, withCookie(oldCookie))).status, 401);
  assert.equal((await c.get('/api/auth/me')).body.username, 'dana');
});

// ---------- user list (AC 6) ----------

test('GET /api/auth/users is public and lists id, name, username in /api/users order (AC 6)', async () => {
  const res = await app.raw('GET', '/api/auth/users');
  assert.equal(res.status, 200);
  assert.deepEqual(res.setCookies, []);
  assert.deepEqual(res.body.map((u) => Object.keys(u).sort()), res.body.map(() => ['id', 'name', 'username']));
  assert.deepEqual(res.body.map((u) => u.id), users.map((u) => u.id));
  assert.deepEqual(res.body.map((u) => u.username), ['alex', 'blake', 'casey', 'dana']);
  assert.doesNotMatch(JSON.stringify(res.body), /[0-9a-f]{64}/, 'no token');
});

// ---------- me and session validity (AC 7, 10, 11) ----------

test('GET /api/auth/me: the user when signed in; 401 without, garbage, unknown token (AC 10, 11)', async () => {
  const me = await app.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, users.find((u) => u.username === 'alex'));

  assert.deepEqual((await app.raw('GET', '/api/auth/me')).body, { error: 'Sign in required.' });
  for (const cookie of ['pm_session=garbage', 'pm_session=%E0%A4%A', 'pm_session=', `pm_session=${'0'.repeat(64)}`, 'pm_session']) {
    const res = await app.raw('GET', '/api/auth/me', undefined, withCookie(cookie));
    assert.equal(res.status, 401, cookie);
  }
  // A present-but-dead cookie is cleared.
  const res = await app.raw('GET', '/api/auth/me', undefined, withCookie(`pm_session=${'a'.repeat(64)}`));
  assert.match(sessionCookie(res), /^pm_session=;.*Max-Age=0/i);
});

test('an idle session expires after 12 hours; requests refresh last_seen_at (AC 7, 10)', async () => {
  const c = await app.client('blake');
  const token = c.cookie.slice('pm_session='.length);
  const setSeen = (ms) =>
    app.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(new Date(Date.now() - ms).toISOString(), token);
  const seen = () => app.db.prepare('SELECT last_seen_at FROM sessions WHERE token = ?').get(token);

  setSeen(11 * HOURS);
  const old = seen().last_seen_at;
  assert.equal((await c.get('/api/auth/me')).status, 200);
  assert.ok(seen().last_seen_at > old, 'refreshed');
  assert.ok(Date.now() - Date.parse(seen().last_seen_at) < 60 * 1000);

  setSeen(13 * HOURS);
  const res = await c.get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(seen(), undefined, 'expired row deleted');
  assert.equal(c.cookie, null, 'cookie cleared');
});

test('a session whose user no longer exists is signed out (AC 10)', async () => {
  const db = app.db;
  const id = db.prepare("INSERT INTO users (name, username) VALUES ('Temp Person', 'temp')").run().lastInsertRowid;
  const c = await app.client('temp');
  assert.equal((await c.get('/api/auth/me')).status, 200);
  // Keep the session row (the foreign key would cascade) to test the lookup.
  db.pragma('foreign_keys = OFF');
  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  } finally {
    db.pragma('foreign_keys = ON');
  }
  assert.equal((await c.get('/api/auth/me')).status, 401);
  assert.equal((await c.get('/api/projects')).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(id).n, 0);
});

test('sessions survive a server restart (AC 10)', async () => {
  const first = await startServer();
  const cookie = first.cookie;
  const dbPath = first.dbPath;
  await first.close();
  const second = await startServer(dbPath);
  try {
    const res = await second.raw('GET', '/api/auth/me', undefined, withCookie(cookie));
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'alex');
  } finally {
    await second.close();
  }
});

// ---------- logout (AC 12) ----------

test('logout: 204, row deleted, the old cookie then gets 401 everywhere (AC 12)', async () => {
  const c = await app.client('dana');
  const cookie = c.cookie;
  const token = cookie.slice('pm_session='.length);
  const res = await c.logout();
  assert.equal(res.status, 204);
  assert.match(sessionCookie(res), /Max-Age=0/i);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE token = ?').get(token).n, 0);
  for (const url of ['/api/auth/me', '/api/projects', '/api/users']) {
    assert.equal((await app.raw('GET', url, undefined, withCookie(cookie))).status, 401, url);
  }
  assert.equal((await app.raw('POST', '/api/auth/logout')).status, 204, 'no session: still 204');
  assert.equal((await app.raw('POST', '/api/auth/logout', undefined, withCookie(cookie))).status, 204, 'replayed');
});

// ---------- signed-out API requests (AC 13, 15) ----------

test('every protected route family returns 401 without a session and changes nothing (AC 13)', async () => {
  const p = await createProject(app, { name: 'Untouched' });
  const item = await createItem(app, p.id, { title: 'Untouched item' });
  const msg = (await app.post(`/api/issues/${item.id}/comments`, { body: 'untouched' })).body;
  const snapshot = () => ({
    projects: app.db.prepare('SELECT * FROM projects ORDER BY id').all(),
    issues: app.db.prepare('SELECT * FROM issues ORDER BY id').all(),
    comments: app.db.prepare('SELECT * FROM comments ORDER BY id').all(),
    users: app.db.prepare('SELECT * FROM users ORDER BY id').all(),
  });
  const before = snapshot();

  const calls = [
    ['GET', '/api/projects'],
    ['POST', '/api/projects', { name: 'X', key: 'NOAUTH' }],
    ['GET', `/api/projects/${p.id}`],
    ['PATCH', `/api/projects/${p.id}`, { name: 'Changed' }],
    ['GET', `/api/projects/${p.id}/issues`],
    ['POST', `/api/projects/${p.id}/issues`, { title: 'New' }],
    ['GET', `/api/issues/${item.id}`],
    ['PATCH', `/api/issues/${item.id}`, { title: 'Changed' }],
    ['DELETE', `/api/issues/${item.id}`],
    ['GET', `/api/issues/${item.id}/comments`],
    ['POST', `/api/issues/${item.id}/comments`, { body: 'x' }],
    ['PATCH', `/api/comments/${msg.id}`, { body: 'x' }],
    ['DELETE', `/api/comments/${msg.id}`],
    ['GET', '/api/users'],
    ['GET', '/api/statuses'],
    ['GET', '/api/terminal-status'],
    ['GET', '/api/resolutions'],
    ['GET', '/api/types'],
    ['GET', '/api/priorities'],
    ['GET', '/api/project-statuses'],
    ['GET', '/api/auth/me'],
    ['GET', '/api/no-such-route'],
    ['PUT', '/api/projects'],
    ['GET', '/api'],
    ['GET', '/API/projects'],
  ];
  for (const [method, url, body] of calls) {
    const res = await app.raw(method, url, body);
    assert.ok(res.status === 401 || (url === '/API/projects' && res.status === 302), `${method} ${url}: ${res.status}`);
    if (res.status === 401) assert.deepEqual(res.body, { error: 'Sign in required.' }, `${method} ${url}`);
  }
  // A malformed JSON body still gets 401, not 400.
  const bad = await app.raw('POST', '/api/projects', undefined, { 'Content-Type': 'application/json' });
  assert.equal(bad.status, 401);
  const badJson = await fetch(`${app.base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  assert.equal(badJson.status, 401);
  assert.deepEqual(snapshot(), before, 'nothing changed');

  // Signed in, an unknown API path is the usual 404.
  assert.equal((await app.get('/api/no-such-route')).status, 404);
});

test('the three public auth routes work without a session (AC 13, 15)', async () => {
  assert.equal((await app.raw('GET', '/api/auth/users')).status, 200);
  assert.equal((await app.raw('POST', '/api/auth/logout')).status, 204);
  assert.equal((await app.raw('POST', '/api/auth/login', { username: 'alex' })).status, 200);
});

// ---------- pages (AC 4, 14, 15) ----------

test('signed-out page requests redirect to sign-in with next; signed-in get the page (AC 14)', async () => {
  const res = await app.raw('GET', '/board.html?project=3');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login.html?next=%2Fboard.html%3Fproject%3D3');
  for (const url of ['/', '/index.html', '/board.html', '/BOARD.HTML', '/%62oard.html', '/css/../board.html', '/nope.html']) {
    const r = await app.raw('GET', url);
    assert.equal(r.status, 302, url);
    assert.match(r.headers.get('location'), /^\/login\.html/, url);
  }
  assert.equal((await app.raw('GET', '/')).headers.get('location'), '/login.html', 'next=/ is the default');

  for (const url of ['/', '/index.html', '/board.html?project=3']) {
    const r = await app.get(url);
    assert.equal(r.status, 200, url);
    assert.match(r.body, /<html/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('public files load without a session; /login.html sends a signed-in user to / (AC 4, 15)', async () => {
  for (const url of ['/login.html', '/css/app.css', '/js/api.js', '/js/login.js', '/js/redirect.js']) {
    assert.equal((await app.raw('GET', url)).status, 200, url);
  }
  const r = await app.get('/login.html');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/');
  assert.equal((await app.get('/api/auth/me')).status, 200, 'still signed in');
});

test('next validation: only same-origin relative paths (AC 14)', () => {
  for (const ok of ['/', '/board.html?project=3', '/index.html#x', '/a/b?c=//d']) assert.equal(safeNext(ok), ok);
  for (const bad of ['//evil.example', 'https://evil.example', 'http:/x', '/\\evil.example', '\\\\evil', '/\t/evil.example',
    '/\n/evil', 'javascript:alert(1)', 'board.html', '', ' /x', null, undefined, 42]) {
    assert.equal(safeNext(bad), '/', JSON.stringify(bad));
  }
  assert.equal(loginUrl('/board.html?project=3'), '/login.html?next=%2Fboard.html%3Fproject%3D3');
  assert.equal(loginUrl('//evil.example'), '/login.html');
  assert.equal(auth.safeNext, safeNext, 'the server uses the same rule');
});

// ---------- reporter (AC 25) ----------

test('work items record the signed-in reporter, never from the body, never changed (AC 25)', async () => {
  const blake = await app.client('blake');
  const p = await createProject(app);
  const alex = users.find((u) => u.username === 'alex');
  const blakeUser = users.find((u) => u.username === 'blake');

  const created = await blake.post(`/api/projects/${p.id}/issues`, { title: 'By blake', reporter_id: alex.id, reporter_name: 'x' });
  assert.equal(created.status, 201);
  assert.equal(created.body.reporter_id, blakeUser.id);
  assert.equal(created.body.reporter_name, blakeUser.name);
  assert.deepEqual((await app.get(`/api/issues/${created.body.id}`)).body, created.body);
  const listed = (await app.get(`/api/projects/${p.id}/issues`)).body.find((i) => i.id === created.body.id);
  assert.equal(listed.reporter_id, blakeUser.id);
  assert.equal(listed.reporter_name, blakeUser.name);

  const statuses = (await app.get('/api/statuses')).body;
  const updated = await app.patch(`/api/issues/${created.body.id}`, { title: 'Edited by alex', reporter_id: alex.id });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.reporter_id, blakeUser.id);
  const moved = await app.patch(`/api/issues/${created.body.id}`, { status: statuses[1], rank: 5 });
  assert.equal(moved.body.reporter_id, blakeUser.id);
  assert.equal(moved.body.reporter_name, blakeUser.name);

  // A work item from before the reporter existed.
  app.db.prepare('UPDATE issues SET reporter_id = NULL WHERE id = ?').run(created.body.id);
  const legacy = (await app.get(`/api/issues/${created.body.id}`)).body;
  assert.equal(legacy.reporter_id, null);
  assert.equal(legacy.reporter_name, null);
  assert.equal((await app.patch(`/api/issues/${created.body.id}`, { title: 'still legacy' })).body.reporter_id, null);
});

test('archived projects stay read-only when signed in (AC 21)', async () => {
  const p = await createProject(app, { status: 'Completed' });
  const item = await createItem(app, p.id);
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x' })).status, 409);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { title: 'x' })).status, 409);
  assert.equal((await app.get(`/api/issues/${item.id}`)).status, 200);
});

// ---------- migration (AC 23, 24) ----------

// The schema as it was before this spec: no users.username, no
// issues.reporter_id, no sessions table.
const OLD_SCHEMA = `
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'Planning', archived INTEGER NOT NULL DEFAULT 0,
  next_issue_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE issues (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL, key TEXT NOT NULL UNIQUE, type TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL,
  assignee_id INTEGER REFERENCES users(id), epic_id INTEGER REFERENCES issues(id), rank INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolution TEXT, UNIQUE (project_id, number));
CREATE TABLE comments (id INTEGER PRIMARY KEY, issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, body_format TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL, updated_at TEXT);
`;

test('an old database gains unique usernames and reporter_id, data intact (AC 23, 24)', () => {
  const dbPath = tempDbPath();
  const old = new Database(dbPath);
  old.exec(OLD_SCHEMA);
  const names = ['Alex Morgan', 'Blake Chen', 'Casey Rivera', 'Dana Patel', 'Alex Smith', 'ALEX Jones', '  Solo  '];
  const insertUser = old.prepare('INSERT INTO users (name) VALUES (?)');
  names.forEach((n) => insertUser.run(n));
  const now = '2026-01-01T00:00:00.000Z';
  old.prepare("INSERT INTO projects (name, key, created_at) VALUES ('Old', 'OLD', ?)").run(now);
  old.prepare(
    "INSERT INTO issues (project_id, number, key, type, title, status, priority, assignee_id, rank, created_at, updated_at) VALUES (1, 1, 'OLD-1', 'Task', 'Legacy', 'To Do', 'Medium', 5, 1000, ?, ?)"
  ).run(now, now);
  old.prepare("INSERT INTO comments (issue_id, author_id, body, created_at) VALUES (1, 6, 'old note', ?)").run(now);
  const issuesBefore = old.prepare('SELECT * FROM issues').all();
  const commentsBefore = old.prepare('SELECT * FROM comments').all();
  old.close();

  const db = openDb(dbPath);
  const rows = db.prepare('SELECT id, name, username FROM users ORDER BY id').all();
  assert.deepEqual(rows.map((r) => r.username), ['alex', 'blake', 'casey', 'dana', 'alex2', 'alex3', 'solo']);
  assert.deepEqual(rows.map((r) => r.name), names, 'names and ids unchanged');
  assert.equal(new Set(rows.map((r) => r.username.toLowerCase())).size, rows.length);
  assert.throws(() => db.prepare("INSERT INTO users (name, username) VALUES ('X', 'ALEX')").run(), /UNIQUE/);

  const issuesAfter = db.prepare('SELECT * FROM issues').all();
  assert.deepEqual(issuesAfter.map(({ reporter_id, ...rest }) => rest), issuesBefore);
  assert.ok(issuesAfter.every((i) => i.reporter_id === null));
  assert.deepEqual(db.prepare('SELECT * FROM comments').all(), commentsBefore);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0, 'everyone signed out');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, names.length, 'no seed users added');
  db.close();

  // Idempotent: reopening changes nothing.
  const again = openDb(dbPath);
  assert.deepEqual(again.prepare('SELECT id, name, username FROM users ORDER BY id').all(), rows);
  again.close();
});

test('a fresh database seeds alex, blake, casey and dana (AC 23)', () => {
  const db = openDb(tempDbPath());
  assert.deepEqual(db.prepare('SELECT username FROM users ORDER BY id').all().map((r) => r.username), ['alex', 'blake', 'casey', 'dana']);
  db.close();
});
