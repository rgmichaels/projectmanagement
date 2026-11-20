// Completed date on work items (docs/specs/completed-date-on-cards.md AC 1-11):
// completed_at / completed_by set on entering the terminal status, cleared on
// leaving, kept otherwise; read-only through the API; one-time backfill.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { openDb } = require('../server/db');
const { STATUSES, terminalStatus, defaultStatus } = require('../server/statuses');
const { statusField } = require('../server/historyFields');
const issues = require('../server/data/issues');
const { startServer, tempDbPath, createProject, createItem } = require('./helpers');

const TERMINAL = terminalStatus();
const OTHER = STATUSES.find((s) => s !== TERMINAL && s !== defaultStatus());

let app;
let me; // the signed-in user (alex)
test.before(async () => {
  app = await startServer();
  me = (await app.get('/api/auth/me')).body;
});
test.after(async () => { await app.close(); });

const getItem = async (id) => (await app.get(`/api/issues/${id}`)).body;
const patch = async (id, body) => {
  const res = await app.patch(`/api/issues/${id}`, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};
const nameOf = (u) => (u.user || u).name;
const tick = () => new Promise((r) => setTimeout(r, 5));

test('schema: nullable completed_at and completed_by, no CHECK constraint (AC 1)', () => {
  const cols = app.db.prepare('PRAGMA table_info(issues)').all();
  for (const name of ['completed_at', 'completed_by']) {
    const col = cols.find((c) => c.name === name);
    assert.ok(col, name);
    assert.equal(col.type, 'TEXT');
    assert.equal(col.notnull, 0);
  }
  const sql = app.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'issues'").get().sql;
  assert.doesNotMatch(sql, /CHECK/i);
});

test('a new item outside the terminal status has both null, in create, single and list responses (AC 2, 8)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal(item.completed_at, null);
  assert.equal(item.completed_by, null);
  const single = await getItem(item.id);
  assert.ok('completed_at' in single && 'completed_by' in single);
  assert.equal(single.completed_at, null);
  const listed = (await app.get(`/api/projects/${p.id}/issues`)).body;
  assert.ok(listed.length > 0 && listed.every((i) => 'completed_at' in i && 'completed_by' in i));
});

// The API always creates items in the first status (validation.js), so a
// direct create in the terminal status is exercised at the data layer.
test('created directly in the terminal status: creation time and creator (AC 4)', async () => {
  const p = await createProject(app);
  const fields = { type: 'Task', title: 'Born done', status: TERMINAL, priority: 'Medium', reporter_id: me.id };
  const item = issues.createIssue(app.db, p, fields, { id: me.id, name: nameOf(me) });
  assert.equal(item.completed_at, item.created_at);
  assert.equal(item.completed_by, nameOf(me));
  const open = issues.createIssue(app.db, p, { ...fields, status: OTHER }, { id: me.id, name: nameOf(me) });
  assert.equal(open.completed_at, null);
  assert.equal(open.completed_by, null);
});

test('moving into the terminal status sets the time of that update and the actor, in the PATCH response (AC 3, 8)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id, { status: OTHER });
  await tick();
  const done = await patch(item.id, { status: TERMINAL, rank: 500 }); // a drag between columns
  assert.equal(typeof done.completed_at, 'string');
  assert.equal(done.completed_at, done.updated_at);
  assert.ok(done.completed_at > item.created_at);
  assert.equal(done.completed_by, nameOf(me));
  assert.equal(done.resolution !== null, true, 'same write as the resolution');
  const single = await getItem(item.id);
  assert.equal(single.completed_at, done.completed_at);
  const listed = (await app.get(`/api/projects/${p.id}/issues`)).body.find((i) => i.id === item.id);
  assert.equal(listed.completed_at, done.completed_at);
  assert.equal(listed.completed_by, done.completed_by);
});

test('a cross-lane drag into the terminal status by another user records that user (AC 3)', async () => {
  const p = await createProject(app);
  const users = (await app.get('/api/users')).body;
  const blakeUser = users.find((u) => u.username === 'blake');
  const item = await createItem(app, p.id, { status: OTHER });
  const blake = await app.client('blake');
  const res = await blake.patch(`/api/issues/${item.id}`, { status: TERMINAL, rank: 1000, assignee_id: blakeUser.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.assignee_id, blakeUser.id);
  assert.equal(res.body.completed_at, res.body.updated_at);
  assert.equal(res.body.completed_by, blakeUser.name);
});

test('leaving the terminal status clears both; re-completing sets a new time (AC 5)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const first = await patch(item.id, { status: TERMINAL });
  await tick();
  const reopened = await patch(item.id, { status: OTHER, rank: 100 });
  assert.equal(reopened.completed_at, null);
  assert.equal(reopened.completed_by, null);
  assert.equal((await getItem(item.id)).completed_at, null);
  await tick();
  const again = await patch(item.id, { status: TERMINAL });
  assert.ok(again.completed_at > first.completed_at, 'the earlier value is not kept');
  assert.equal(again.completed_at, again.updated_at);
});

test('updates that stay in the terminal status leave both unchanged (AC 6)', async () => {
  const p = await createProject(app);
  const users = (await app.get('/api/users')).body;
  const item = await createItem(app, p.id);
  const done = await patch(item.id, { status: TERMINAL });
  const keep = { completed_at: done.completed_at, completed_by: done.completed_by };
  const resolutions = (await app.get('/api/resolutions')).body.map((r) => r.name);
  const updates = [
    { title: 'Renamed' },
    { rank: 1 }, // reorder in the column
    { status: TERMINAL, rank: 2 }, // drop in the same column
    { status: TERMINAL }, // PATCH with the current status
    { assignee_id: users[1].id }, // change swimlane
    { resolution: resolutions[resolutions.length - 1] },
  ];
  for (const body of updates) {
    await tick();
    const after = await patch(item.id, body);
    assert.deepEqual({ completed_at: after.completed_at, completed_by: after.completed_by }, keep, JSON.stringify(body));
  }
  // Another user's edit does not take over the completer either.
  const blake = await app.client('blake');
  const res = await blake.patch(`/api/issues/${item.id}`, { title: 'By Blake' });
  assert.equal(res.body.completed_by, keep.completed_by);
});

test('completed_at and completed_by are not writable through the API (AC 7)', async () => {
  const p = await createProject(app);
  const fake = { completed_at: '2000-01-01T00:00:00.000Z', completed_by: 'Mallory' };

  const open = await app.post(`/api/projects/${p.id}/issues`, { title: 'Open', ...fake });
  assert.equal(open.status, 201);
  assert.equal(open.body.completed_at, null);
  assert.equal(open.body.completed_by, null);

  const created = await app.post(`/api/projects/${p.id}/issues`, { title: 'Done', ...fake });
  assert.equal(created.status, 201);
  assert.equal(created.body.completed_at, null);
  await patch(created.body.id, { status: TERMINAL });

  // Ignored on an open item, a completed one, and alongside a status change.
  const res1 = await app.patch(`/api/issues/${open.body.id}`, fake);
  assert.ok(res1.status === 200 || (res1.status >= 400 && res1.status < 500));
  assert.equal((await getItem(open.body.id)).completed_at, null);
  assert.equal((await getItem(open.body.id)).completed_by, null);

  const before = await getItem(created.body.id);
  await app.patch(`/api/issues/${created.body.id}`, fake);
  const after = await getItem(created.body.id);
  assert.equal(after.completed_at, before.completed_at);
  assert.equal(after.completed_by, before.completed_by);

  const moved = await patch(open.body.id, { status: TERMINAL, ...fake });
  assert.notEqual(moved.completed_at, fake.completed_at);
  assert.equal(moved.completed_by, nameOf(me));
});

test('the status change is recorded as before and the completed fields add no history (AC 9)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  await patch(item.id, { status: TERMINAL });
  await patch(item.id, { status: OTHER });
  const res = await app.get(`/api/issues/${item.id}/history`);
  assert.equal(res.status, 200);
  const fields = app.db
    .prepare(
      `SELECT c.field FROM issue_history_changes c JOIN issue_history_events e ON e.id = c.event_id
       WHERE e.issue_id = ? ORDER BY c.id`
    )
    .all(item.id)
    .map((r) => r.field);
  assert.ok(fields.includes(statusField().key));
  assert.ok(!fields.some((f) => /completed/.test(f)), fields.join(','));
  // Two saves, two change events, plus the created event.
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM issue_history_events WHERE issue_id = ?').get(item.id).n, 3);
});

// ---------- migration and backfill (AC 10, 11) ----------

test('an existing database gains the columns and a one-time backfill; restart changes nothing (AC 10, 11)', () => {
  const dbPath = tempDbPath();
  // A current database, then the two columns dropped: the schema as it was
  // before this spec, with history tables present.
  openDb(dbPath).close();
  const old = new Database(dbPath);
  old.exec('ALTER TABLE issues DROP COLUMN completed_at');
  old.exec('ALTER TABLE issues DROP COLUMN completed_by');
  const T0 = '2026-01-01T00:00:00.000Z';
  const T_UPD = '2026-03-01T00:00:00.000Z';
  old.prepare("INSERT INTO projects (name, key, created_at) VALUES ('Old', 'OLD', ?)").run(T0);
  const addItem = old.prepare(
    "INSERT INTO issues (project_id, number, key, type, title, status, priority, rank, resolution, created_at, updated_at) VALUES (1, ?, ?, 'Task', 't', ?, 'Medium', 1000, ?, ?, ?)"
  );
  const addEvent = old.prepare('INSERT INTO issue_history_events (issue_id, kind, actor_id, actor_name, created_at) VALUES (?, ?, NULL, ?, ?)');
  const addChange = old.prepare('INSERT INTO issue_history_changes (event_id, field, old_value, new_value) VALUES (?, ?, ?, ?)');
  const field = statusField().key;
  const statusChange = (issueId, from, to, who, when) => {
    const ev = addEvent.run(issueId, 'changed', who, when).lastInsertRowid;
    addChange.run(ev, field, from, to);
  };

  // 1: completed twice, reopened in between: the latest completion wins.
  addItem.run(1, 'OLD-1', TERMINAL, 'Fixed', T0, T_UPD);
  addEvent.run(1, 'created', 'Ann', T0);
  statusChange(1, OTHER, TERMINAL, 'Ann', '2026-01-10T10:00:00.000Z');
  statusChange(1, TERMINAL, OTHER, 'Bo', '2026-01-11T10:00:00.000Z');
  statusChange(1, OTHER, TERMINAL, 'Cy', '2026-01-12T10:00:00.000Z');
  // A later non-status change does not count.
  const titleEv = addEvent.run(1, 'changed', 'Di', '2026-02-01T00:00:00.000Z').lastInsertRowid;
  addChange.run(titleEv, 'title', 'a', 'b');

  // 2: created in the terminal status (created event, no status change).
  addItem.run(2, 'OLD-2', TERMINAL, 'Fixed', '2026-01-05T00:00:00.000Z', T_UPD);
  addEvent.run(2, 'created', 'Ann', '2026-01-05T00:00:00.000Z');

  // 3: no history at all (completed before history existed).
  addItem.run(3, 'OLD-3', TERMINAL, 'Fixed', T0, T_UPD);

  // 4: status history, but no change into the terminal status recorded.
  addItem.run(4, 'OLD-4', TERMINAL, 'Fixed', T0, T_UPD);
  addEvent.run(4, 'created', 'Ann', T0);
  statusChange(4, defaultStatus(), OTHER, 'Ann', '2026-01-02T00:00:00.000Z');

  // 5: not in the terminal status, though it was once completed.
  addItem.run(5, 'OLD-5', OTHER, null, T0, T_UPD);
  addEvent.run(5, 'created', 'Ann', T0);
  statusChange(5, OTHER, TERMINAL, 'Ann', '2026-01-03T00:00:00.000Z');
  statusChange(5, TERMINAL, OTHER, 'Ann', '2026-01-04T00:00:00.000Z');

  const before = old.prepare('SELECT * FROM issues ORDER BY id').all();
  const historyBefore = old.prepare('SELECT COUNT(*) AS n FROM issue_history_changes').get().n;
  old.close();

  const db = openDb(dbPath);
  const rows = db.prepare('SELECT * FROM issues ORDER BY id').all();
  assert.deepEqual(rows.map(({ completed_at, completed_by, ...rest }) => rest), before, 'no other column changed');
  const got = rows.map((r) => [r.key, r.completed_at, r.completed_by]);
  assert.deepEqual(got, [
    ['OLD-1', '2026-01-12T10:00:00.000Z', 'Cy'],
    ['OLD-2', '2026-01-05T00:00:00.000Z', null],
    ['OLD-3', T_UPD, null],
    ['OLD-4', T_UPD, null],
    ['OLD-5', null, null],
  ]);
  assert.ok(rows.filter((r) => r.status === TERMINAL).every((r) => r.completed_at !== null), 'AC 11');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM issue_history_changes').get().n, historyBefore, 'no history written');
  db.close();

  // Restart: nothing changes, even after the data moves on.
  const again = openDb(dbPath);
  assert.deepEqual(again.prepare('SELECT * FROM issues ORDER BY id').all(), rows);
  again.prepare('UPDATE issues SET completed_at = NULL WHERE id = 3').run();
  again.close();
  const third = openDb(dbPath);
  assert.equal(third.prepare('SELECT completed_at FROM issues WHERE id = 3').get().completed_at, null, 'backfill ran once only');
  third.close();
});

test('a fresh database has the columns and backfills nothing', () => {
  const db = openDb(tempDbPath());
  const cols = db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);
  assert.ok(cols.includes('completed_at') && cols.includes('completed_by'));
  db.close();
});
