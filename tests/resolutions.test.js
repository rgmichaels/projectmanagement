// Resolution (docs/specs/resolution-and-comments.md AC 1, 5-9, 12-15, 19-22).
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { openDb } = require('../server/db');
const { startServer, tempDbPath, createProject, createItem } = require('./helpers');

let app;
let users;
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const getItem = async (id) => (await app.get(`/api/issues/${id}`)).body;
const items = async (projectId) => (await app.get(`/api/projects/${projectId}/issues`)).body;
const is4xx = (res) => res.status >= 400 && res.status < 500;

async function doneItem(projectId, fields = {}) {
  const item = await createItem(app, projectId, fields);
  return (await app.patch(`/api/issues/${item.id}`, { status: 'Done' })).body;
}

test('GET /api/resolutions returns the list in order with one default (AC 1)', async () => {
  const res = await app.get('/api/resolutions');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((r) => r.name), ['Fixed', "Won't Do", 'Duplicate', 'Cannot Reproduce']);
  assert.deepEqual(res.body.filter((r) => r.isDefault).map((r) => r.name), ['Fixed']);
});

test('the terminal status is the last status (AC 2)', async () => {
  assert.deepEqual((await app.get('/api/terminal-status')).body, { status: 'Done' });
});

test('a new work item has no resolution, in GET and list responses (AC 5, 14)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal(item.resolution, null);
  assert.equal((await getItem(item.id)).resolution, null);
  const listed = await items(p.id);
  assert.ok(listed.every((i) => 'resolution' in i));
  assert.equal(listed[0].resolution, null);
});

test('moving to Done sets the default; moving out clears it (AC 6, 8)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const done = await app.patch(`/api/issues/${item.id}`, { status: 'Done' });
  assert.equal(done.status, 200);
  assert.equal(done.body.resolution, 'Fixed', 'PATCH response carries the server-set default');
  assert.equal((await getItem(item.id)).resolution, 'Fixed');

  // Drag between columns sends status and rank.
  const back = await app.patch(`/api/issues/${item.id}`, { status: 'In Progress', rank: 500 });
  assert.equal(back.body.resolution, null);
  assert.equal((await getItem(item.id)).resolution, null);

  // Explicit null when leaving the terminal status is allowed.
  await app.patch(`/api/issues/${item.id}`, { status: 'Done' });
  const reopened = await app.patch(`/api/issues/${item.id}`, { status: 'To Do', resolution: null });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.resolution, null);
});

test('a supplied valid resolution is stored instead of the default (AC 7)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const res = await app.patch(`/api/issues/${item.id}`, { status: 'Done', resolution: 'Duplicate' });
  assert.equal(res.status, 200);
  assert.equal(res.body.resolution, 'Duplicate');
  assert.equal((await getItem(item.id)).resolution, 'Duplicate');
});

test('changing the resolution of a Done item persists (AC 10)', async () => {
  const p = await createProject(app);
  const item = await doneItem(p.id);
  const res = await app.patch(`/api/issues/${item.id}`, { resolution: "Won't Do" });
  assert.equal(res.status, 200);
  assert.equal(res.body.resolution, "Won't Do");
  assert.equal((await items(p.id))[0].resolution, "Won't Do");
});

test('updates that keep the item in Done keep its resolution (AC 9)', async () => {
  const p = await createProject(app);
  const other = await doneItem(p.id, { title: 'other' });
  const item = await doneItem(p.id);
  await app.patch(`/api/issues/${item.id}`, { resolution: 'Cannot Reproduce' });

  // Other fields edited, with status sent unchanged (as the detail form does).
  await app.patch(`/api/issues/${item.id}`, { title: 'renamed', status: 'Done', priority: 'High' });
  assert.equal((await getItem(item.id)).resolution, 'Cannot Reproduce');
  // Reorder within the Done column.
  await app.patch(`/api/issues/${item.id}`, { status: 'Done', rank: other.rank - 1 });
  // Lane change while staying in Done.
  await app.patch(`/api/issues/${item.id}`, { status: 'Done', assignee_id: users[0].id });
  await app.patch(`/api/issues/${item.id}`, { status: 'Done', priority: 'Lowest' });
  // Moving to Done when already Done.
  await app.patch(`/api/issues/${item.id}`, { status: 'Done' });

  const saved = await getItem(item.id);
  assert.equal(saved.resolution, 'Cannot Reproduce');
  assert.equal(saved.assignee_id, users[0].id);
  assert.equal(saved.title, 'renamed');
});

test('an unknown resolution is rejected and the item is unchanged (AC 12)', async () => {
  const p = await createProject(app);
  const todo = await createItem(app, p.id);
  const done = await doneItem(p.id);
  for (const resolution of ['Obsolete', 'fixed', '', 5]) {
    const a = await app.patch(`/api/issues/${done.id}`, { resolution, title: 'changed' });
    assert.ok(is4xx(a), `resolution ${JSON.stringify(resolution)}`);
    assert.match(a.body.error, /resolution/i);
    const b = await app.patch(`/api/issues/${todo.id}`, { status: 'Done', resolution });
    assert.ok(is4xx(b));
  }
  assert.deepEqual(await getItem(done.id), done);
  assert.deepEqual(await getItem(todo.id), todo);
});

test('resolution on a non-terminal item, or null on a terminal one, is rejected (AC 13)', async () => {
  const p = await createProject(app);
  const todo = await createItem(app, p.id);
  const done = await doneItem(p.id);

  let res = await app.patch(`/api/issues/${todo.id}`, { resolution: 'Fixed' });
  assert.ok(is4xx(res));
  res = await app.patch(`/api/issues/${done.id}`, { status: 'To Do', resolution: 'Fixed' });
  assert.ok(is4xx(res));
  res = await app.patch(`/api/issues/${done.id}`, { resolution: null });
  assert.ok(is4xx(res));
  res = await app.patch(`/api/issues/${todo.id}`, { status: 'Done', resolution: null });
  assert.ok(is4xx(res));
  // A new item never starts with a resolution.
  res = await app.post(`/api/projects/${p.id}/issues`, { title: 'x', resolution: 'Fixed' });
  assert.ok(is4xx(res));

  assert.deepEqual(await getItem(todo.id), todo);
  assert.deepEqual(await getItem(done.id), done);
  assert.equal((await items(p.id)).length, 2);
});

test('a cross-lane drop into Done sets the default in the same update (AC 19)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: 'Epic' });
  const a = await createItem(app, p.id, { assignee_id: users[0].id });
  const b = await createItem(app, p.id);
  const c = await createItem(app, p.id, { priority: 'Low' });

  let res = await app.patch(`/api/issues/${a.id}`, { status: 'Done', rank: 1000, assignee_id: users[1].id });
  assert.equal(res.status, 200);
  assert.equal(res.body.resolution, 'Fixed');
  assert.equal(res.body.assignee_id, users[1].id);

  res = await app.patch(`/api/issues/${b.id}`, { status: 'Done', rank: 2000, epic_id: epic.id });
  assert.equal(res.body.resolution, 'Fixed');
  assert.equal(res.body.epic_id, epic.id);

  res = await app.patch(`/api/issues/${c.id}`, { status: 'Done', rank: 3000, priority: 'Highest' });
  assert.equal(res.body.resolution, 'Fixed');
  assert.equal(res.body.priority, 'Highest');

  // A failed cross-lane drop (bad lane value) changes nothing.
  const before = await getItem(epic.id);
  res = await app.patch(`/api/issues/${epic.id}`, { status: 'Done', assignee_id: 9999 });
  assert.ok(is4xx(res));
  assert.deepEqual(await getItem(epic.id), before);
});

test('a rejected epic-into-epic-lane drop changes nothing, including resolution (AC 20)', async () => {
  const p = await createProject(app);
  const epicA = await createItem(app, p.id, { type: 'Epic' });
  const epicB = await createItem(app, p.id, { type: 'Epic' });
  const res = await app.patch(`/api/issues/${epicB.id}`, { status: 'Done', epic_id: epicA.id });
  assert.ok(is4xx(res));
  assert.deepEqual(await getItem(epicB.id), epicB);
});

test('archived projects: resolutions readable, writes rejected, archiving keeps them (AC 21, 22)', async () => {
  const p = await createProject(app);
  const done = await doneItem(p.id);
  await app.patch(`/api/issues/${done.id}`, { resolution: 'Duplicate' });
  const todo = await createItem(app, p.id);
  await app.patch(`/api/projects/${p.id}`, { status: 'Completed' });
  const before = await items(p.id);

  await app.patch(`/api/projects/${p.id}`, { archived: true });
  assert.deepEqual(await items(p.id), before, 'archiving alters no resolution');
  assert.equal((await getItem(done.id)).resolution, 'Duplicate');

  for (const [id, body] of [
    [done.id, { resolution: 'Fixed' }],
    [done.id, { status: 'To Do' }],
    [todo.id, { status: 'Done' }],
  ]) {
    const res = await app.patch(`/api/issues/${id}`, body);
    assert.ok(is4xx(res));
    assert.match(res.body.error, /archived/);
  }
  assert.deepEqual(await items(p.id), before);

  await app.patch(`/api/projects/${p.id}`, { archived: false });
  assert.deepEqual(await items(p.id), before, 'unarchiving alters no resolution');
});

test('existing Done items get the default resolution when the column is added (AC 15)', () => {
  const dbPath = tempDbPath();
  // A database in the schema from before this spec (no resolution column).
  const old = new Database(dbPath);
  old.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'Planning', archived INTEGER NOT NULL DEFAULT 0,
      next_issue_number INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
    CREATE TABLE issues (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
      number INTEGER NOT NULL, key TEXT NOT NULL UNIQUE, type TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL,
      assignee_id INTEGER REFERENCES users(id), epic_id INTEGER REFERENCES issues(id),
      rank INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE (project_id, number));
    INSERT INTO projects (id, name, key, created_at) VALUES (1, 'Old', 'OLD', '2026-01-01');
  `);
  const insert = old.prepare(
    `INSERT INTO issues (project_id, number, key, type, title, status, priority, rank, created_at, updated_at)
     VALUES (1, ?, ?, 'Task', 't', ?, 'Medium', ?, '2026-01-01', '2026-01-01')`
  );
  ['To Do', 'In Progress', 'Done', 'Done'].forEach((status, i) => insert.run(i + 1, `OLD-${i + 1}`, status, i));
  old.close();

  const db = openDb(dbPath);
  const rows = db.prepare('SELECT status, resolution FROM issues ORDER BY number').all();
  assert.deepEqual(rows.map((r) => r.resolution), [null, null, 'Fixed', 'Fixed']);
  // Re-opening is a no-op (idempotent) and keeps later changes.
  db.prepare("UPDATE issues SET resolution = 'Duplicate' WHERE number = 3").run();
  db.close();
  const again = openDb(dbPath);
  assert.equal(again.prepare('SELECT resolution FROM issues WHERE number = 3').get().resolution, 'Duplicate');
  assert.equal(again.prepare("SELECT sql FROM sqlite_master WHERE name = 'issues'").get().sql.includes('CHECK'), false);
  again.close();
});
