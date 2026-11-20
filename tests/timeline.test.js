// Dates on work items for the Timeline (docs/specs/gantt-chart.md AC 1-5, 19,
// 28): the migration, validation, the API shape, history and the archived
// and Viewer guards. alex is the seeded Admin; casey is made a Viewer per test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { startServer, createProject, createItem, tempDbPath } = require('./helpers');
const { openDb } = require('../server/db');
const usersData = require('../server/data/users');
const groups = require('../server/groups');
const { TYPES } = require('../server/types');
const { PROJECT_STATUSES } = require('../server/projectStatuses');
const { UPDATABLE } = require('../server/data/issues');
const { getField } = require('../server/historyFields');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const ARCHIVABLE = PROJECT_STATUSES.find((s) => s.archivable).name;

let app;
let ids;
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
});
test.after(async () => { await app.close(); });
test.beforeEach(() => {
  for (const [username, id] of Object.entries(ids)) usersData.setUserGroup(app.db, id, username === 'alex' ? ADMIN : MEMBER);
});

const events = async (id) => (await app.get(`/api/issues/${id}/history`)).body.events;
const columns = (db) => db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);

// ---------- AC 1: migration ----------

test('a database without the date columns gains them, nullable, without backfill; idempotent (AC 1)', () => {
  const dbPath = tempDbPath();
  openDb(dbPath).close();
  const old = new Database(dbPath);
  old.exec('ALTER TABLE issues DROP COLUMN start_date; ALTER TABLE issues DROP COLUMN due_date;');
  old.prepare("INSERT INTO projects (name, key, status, archived, next_issue_number, created_at) VALUES ('Old', 'OLD', 'Planning', 0, 2, '2026-01-01')").run();
  old.prepare(
    "INSERT INTO issues (project_id, number, key, type, title, status, priority, rank, created_at, updated_at) VALUES (1, 1, 'OLD-1', 'x', 'Legacy', 's', 'p', 1000, '2026-01-01', '2026-01-01')"
  ).run();
  assert.ok(!columns(old).includes('start_date'));
  old.close();

  let db = openDb(dbPath);
  assert.ok(columns(db).includes('start_date') && columns(db).includes('due_date'));
  const info = db.prepare('PRAGMA table_info(issues)').all().filter((c) => c.name === 'start_date' || c.name === 'due_date');
  for (const c of info) {
    assert.equal(c.type, 'TEXT');
    assert.equal(c.notnull, 0);
    assert.equal(c.dflt_value, null);
  }
  assert.deepEqual(db.prepare('SELECT start_date, due_date FROM issues').get(), { start_date: null, due_date: null });
  db.close();
  db = openDb(dbPath); // a second start changes nothing
  assert.equal(columns(db).filter((c) => c === 'start_date' || c === 'due_date').length, 2);
  db.close();
});

test('a fresh database has the date columns in CREATE TABLE; UPDATABLE and history fields list them (AC 1, 5)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../server/db.js'), 'utf8');
  const create = source.slice(source.indexOf('CREATE TABLE IF NOT EXISTS issues'), source.indexOf(');', source.indexOf('CREATE TABLE IF NOT EXISTS issues')));
  assert.match(create, /start_date TEXT/);
  assert.match(create, /due_date TEXT/);
  assert.ok(UPDATABLE.includes('start_date') && UPDATABLE.includes('due_date'));
  assert.deepEqual([getField('start_date').label, getField('start_date').kind], ['Start date', 'text']);
  assert.deepEqual([getField('due_date').label, getField('due_date').kind], ['Due date', 'text']);
});

// ---------- AC 2-4: validation and API shape ----------

test('create and update accept valid dates and null/empty, and return both fields everywhere (AC 2, 4)', async () => {
  const p = await createProject(app);
  const plain = await createItem(app, p.id);
  assert.equal(plain.start_date, null);
  assert.equal(plain.due_date, null);

  const created = await createItem(app, p.id, { start_date: '2026-11-02', due_date: '2026-11-20' });
  assert.equal(created.start_date, '2026-11-02');
  assert.equal(created.due_date, '2026-11-20');

  const got = (await app.get(`/api/issues/${created.id}`)).body;
  assert.deepEqual([got.start_date, got.due_date], ['2026-11-02', '2026-11-20']);
  const listed = (await app.get(`/api/projects/${p.id}/issues`)).body.find((i) => i.id === created.id);
  assert.deepEqual([listed.start_date, listed.due_date], ['2026-11-02', '2026-11-20']);
  const backlog = (await app.get(`/api/projects/${p.id}/issues?sprint=backlog`)).body.find((i) => i.id === created.id);
  assert.deepEqual([backlog.start_date, backlog.due_date], ['2026-11-02', '2026-11-20']);

  let res = await app.patch(`/api/issues/${created.id}`, { start_date: '', due_date: null });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.start_date, res.body.due_date], [null, null], "'' and null are stored as null");
  assert.deepEqual(app.db.prepare('SELECT start_date, due_date FROM issues WHERE id = ?').get(created.id), { start_date: null, due_date: null });

  // Epics carry dates too (their own-date bar).
  const epic = await createItem(app, p.id, { type: EPIC_TYPE, start_date: '2026-10-12', due_date: '2026-12-04' });
  assert.deepEqual([epic.start_date, epic.due_date], ['2026-10-12', '2026-12-04']);
  res = await app.patch(`/api/issues/${epic.id}`, { due_date: '2026-12-11' });
  assert.equal(res.body.due_date, '2026-12-11');
});

test('bad dates are 400 with an error message, on create and update (AC 2)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const bad = ['2026-02-30', '2026-13-01', '26-11-05', '2026/11/05', '2026-11-5', 'tomorrow', 20261105, true, {}, '2026-11-05T00:00:00Z'];
  for (const value of bad) {
    for (const field of ['start_date', 'due_date']) {
      const res = await app.patch(`/api/issues/${item.id}`, { [field]: value });
      assert.equal(res.status, 400, `${field}=${JSON.stringify(value)}`);
      assert.match(res.body.error, field === 'start_date' ? /^Start date must be a date as YYYY-MM-DD\./ : /^Due date must be a date as YYYY-MM-DD\./);
    }
  }
  const res = await app.post(`/api/projects/${p.id}/issues`, { title: 'x', due_date: '2026-02-29' }); // not a leap year
  assert.equal(res.status, 400);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', due_date: '2028-02-29' })).status, 201, 'leap day');
  assert.deepEqual(app.db.prepare('SELECT start_date, due_date FROM issues WHERE id = ?').get(item.id), { start_date: null, due_date: null });
});

test('due before start is 400, checked against the stored value; equal and one date are allowed (AC 3)', async () => {
  const p = await createProject(app);
  const MESSAGE = 'Due date must not be earlier than start date.';
  let res = await app.post(`/api/projects/${p.id}/issues`, { title: 'x', start_date: '2026-11-10', due_date: '2026-11-09' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, MESSAGE);

  const item = await createItem(app, p.id, { start_date: '2026-11-10', due_date: '2026-11-10' });
  assert.deepEqual([item.start_date, item.due_date], ['2026-11-10', '2026-11-10'], 'one-day bar');

  res = await app.patch(`/api/issues/${item.id}`, { due_date: '2026-11-09' });
  assert.equal(res.status, 400, 'only due sent: compared with the stored start');
  assert.equal(res.body.error, MESSAGE);
  res = await app.patch(`/api/issues/${item.id}`, { start_date: '2026-11-11' });
  assert.equal(res.status, 400, 'only start sent: compared with the stored due');
  // Moving both together is fine, as is clearing one.
  assert.equal((await app.patch(`/api/issues/${item.id}`, { start_date: '2026-11-20', due_date: '2026-11-25' })).status, 200);
  res = await app.patch(`/api/issues/${item.id}`, { start_date: null });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.start_date, res.body.due_date], [null, '2026-11-25'], 'only a due date');
  res = await app.patch(`/api/issues/${item.id}`, { due_date: null, start_date: '2026-12-01' });
  assert.deepEqual([res.body.start_date, res.body.due_date], ['2026-12-01', null], 'only a start date');
});

// ---------- AC 5: history, archived, Viewer ----------

test('date changes record history like other fields; unchanged saves record nothing (AC 5)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  await app.patch(`/api/issues/${item.id}`, { start_date: '2026-11-02', due_date: '2026-11-20' });
  let list = await events(item.id);
  assert.equal(list.length, 2);
  assert.deepEqual(
    list[0].changes.map((c) => [c.field, c.label, c.old, c.new]),
    [['start_date', 'Start date', null, '2026-11-02'], ['due_date', 'Due date', null, '2026-11-20']]
  );

  await app.patch(`/api/issues/${item.id}`, { start_date: '2026-11-02', due_date: '2026-11-20', title: item.title });
  assert.equal((await events(item.id)).length, 2, 'same values write nothing');

  await app.patch(`/api/issues/${item.id}`, { due_date: '2026-11-27' });
  list = await events(item.id);
  assert.deepEqual(list[0].changes.map((c) => [c.field, c.old, c.new]), [['due_date', '2026-11-20', '2026-11-27']], 'only the changed field');

  await app.patch(`/api/issues/${item.id}`, { start_date: '' });
  list = await events(item.id);
  assert.deepEqual(list[0].changes.map((c) => [c.field, c.old, c.new]), [['start_date', '2026-11-02', null]], 'cleared is null');

  const filtered = (await app.get(`/api/issues/${item.id}/history?field=due_date`)).body.events;
  assert.equal(filtered.length, 2);
  const fields = (await app.get('/api/history-fields')).body;
  assert.deepEqual(fields.find((f) => f.key === 'start_date'), { key: 'start_date', label: 'Start date', kind: 'text' });
  assert.deepEqual(fields.find((f) => f.key === 'due_date'), { key: 'due_date', label: 'Due date', kind: 'text' });
});

test('archived projects return 409 and Viewers 403 for date changes; nothing is written (AC 5, 25)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id, { start_date: '2026-11-02' });

  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  let res = await viewer.patch(`/api/issues/${item.id}`, { start_date: '2026-11-03' });
  assert.equal(res.status, 403);
  const member = await app.client('blake');
  assert.equal((await member.patch(`/api/issues/${item.id}`, { start_date: '2026-11-04' })).status, 200, 'a Member may edit');

  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  res = await app.patch(`/api/issues/${item.id}`, { due_date: '2026-11-30' });
  assert.equal(res.status, 409);
  const after = (await app.get(`/api/issues/${item.id}`)).body;
  assert.deepEqual([after.start_date, after.due_date], ['2026-11-04', null]);
  assert.equal((await app.get(`/api/projects/${p.id}/issues`)).status, 200, 'still readable');
});

// ---------- AC 7, 28: the page and its links (static) ----------

test('the Timeline page exists, uses no new dependency and is linked from every project page (AC 7, 8)', () => {
  const root = path.join(__dirname, '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const page = read('public/timeline.html');
  assert.match(page, /<a id="nav-timeline" href="timeline\.html" aria-current="page">Timeline<\/a>/);
  assert.match(page, /js\/timelineMath\.js[\s\S]*js\/timeline\.js[\s\S]*js\/board\.js/);
  assert.doesNotMatch(page, /<script[^>]+src="https?:/, 'no CDN script');
  for (const f of ['public/board.html', 'public/backlog.html', 'public/sprints.html', 'public/test-cases.html']) {
    assert.match(read(f), /<a id="nav-timeline" href="timeline\.html">Timeline<\/a>/, f);
  }
  for (const f of ['public/board.html', 'public/backlog.html', 'public/sprints.html', 'public/timeline.html']) {
    const html = read(f);
    assert.match(html, /<label for="start-date-input">Start date <input type="date" id="start-date-input" name="start_date"><\/label>/, f);
    assert.match(html, /<label for="due-date-input">Due date <input type="date" id="due-date-input" name="due_date"><\/label>/, f);
  }
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['better-sqlite3', 'express']);
});
