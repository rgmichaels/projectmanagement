// Projects: create/validate, statuses, archive rules (AC 1-11, 38).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

async function snapshotItems(projectId) {
  return (await app.get(`/api/projects/${projectId}/issues`)).body;
}

test('project statuses are exactly Planning, In Progress, Completed, Cancelled', async () => {
  const res = await app.get('/api/project-statuses');
  assert.deepEqual(res.body.map((s) => s.name), ['Planning', 'In Progress', 'Completed', 'Cancelled']);
});

test('create project: defaults to Planning, validates name and key, rejects duplicates (AC 2, 3)', async () => {
  const ok = await app.post('/api/projects', { name: 'Alpha', key: 'ALPHA' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, 'Planning');
  assert.equal(ok.body.archived, false);

  for (const key of ['A', 'alpha', 'AB1', 'ABCDEFGHIJK', '', undefined]) {
    const res = await app.post('/api/projects', { name: 'Bad', key });
    assert.equal(res.status, 400, `key ${key} should be rejected`);
    assert.ok(res.body.error);
  }
  for (const name of ['', '   ', 'x'.repeat(81), undefined]) {
    const res = await app.post('/api/projects', { name, key: 'NAMETEST' });
    assert.equal(res.status, 400);
  }
  const dup = await app.post('/api/projects', { name: 'Again', key: 'ALPHA' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /already/);

  const all = (await app.get('/api/projects?includeArchived=true')).body;
  assert.equal(all.filter((p) => p.key === 'ALPHA').length, 1);
  assert.equal(all.filter((p) => p.key === 'NAMETEST').length, 0);

  const chosen = await app.post('/api/projects', { name: 'Beta', key: 'BETA', status: 'In Progress' });
  assert.equal(chosen.body.status, 'In Progress');
  const bad = await app.post('/api/projects', { name: 'Gamma', key: 'GAMMA', status: 'Retired' });
  assert.equal(bad.status, 400);
});

test('status change persists and does not alter work items (AC 3, 4)', async () => {
  const p = await createProject(app);
  await createItem(app, p.id, { title: 'one' });
  const before = await snapshotItems(p.id);
  for (const status of ['In Progress', 'Completed', 'Cancelled', 'Planning']) {
    const res = await app.patch(`/api/projects/${p.id}`, { status });
    assert.equal(res.status, 200);
    assert.equal((await app.get(`/api/projects/${p.id}`)).body.status, status);
  }
  assert.deepEqual(await snapshotItems(p.id), before);
  assert.equal((await app.patch(`/api/projects/${p.id}`, { status: 'Complete' })).status, 400);
});

test('there is no project delete endpoint (AC 5)', async () => {
  const p = await createProject(app);
  const res = await app.del(`/api/projects/${p.id}`);
  assert.equal(res.status, 404);
  assert.equal((await app.get(`/api/projects/${p.id}`)).status, 200);
});

test('archive is only allowed for Completed or Cancelled projects (AC 6)', async () => {
  for (const status of ['Planning', 'In Progress']) {
    const p = await createProject(app, { status });
    const res = await app.patch(`/api/projects/${p.id}`, { archived: true });
    assert.ok(res.status >= 400 && res.status < 500);
    assert.ok(res.body.error);
    assert.equal((await app.get(`/api/projects/${p.id}`)).body.archived, false);
  }
  for (const status of ['Completed', 'Cancelled']) {
    const p = await createProject(app, { status });
    const res = await app.patch(`/api/projects/${p.id}`, { archived: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.archived, true);
  }
  // Status and archive in one request: archiving into a non-archivable status fails.
  const p = await createProject(app, { status: 'Completed' });
  const res = await app.patch(`/api/projects/${p.id}`, { status: 'Planning', archived: true });
  assert.ok(res.status >= 400 && res.status < 500);
});

test('archived projects are hidden by default and shown with includeArchived (AC 7, 8)', async () => {
  const p = await createProject(app, { status: 'Completed' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  const visible = (await app.get('/api/projects')).body;
  assert.ok(!visible.some((x) => x.id === p.id));
  const all = (await app.get('/api/projects?includeArchived=true')).body;
  const found = all.find((x) => x.id === p.id);
  assert.equal(found.archived, true);

  const un = await app.patch(`/api/projects/${p.id}`, { archived: false });
  assert.equal(un.body.archived, false);
  assert.equal(un.body.status, 'Completed');
  assert.ok((await app.get('/api/projects')).body.some((x) => x.id === p.id));
});

test('reopening an archived project auto-unarchives it; Completed <-> Cancelled keeps it archived (AC 9)', async () => {
  for (const reopen of ['Planning', 'In Progress']) {
    const p = await createProject(app, { status: 'Cancelled' });
    await app.patch(`/api/projects/${p.id}`, { archived: true });
    const res = await app.patch(`/api/projects/${p.id}`, { status: reopen });
    assert.equal(res.body.archived, false);
    assert.equal(res.body.status, reopen);
    assert.ok((await app.get('/api/projects')).body.some((x) => x.id === p.id));
  }
  const p = await createProject(app, { status: 'Completed' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  const res = await app.patch(`/api/projects/${p.id}`, { status: 'Cancelled' });
  assert.equal(res.body.archived, true);
  const back = await app.patch(`/api/projects/${p.id}`, { status: 'Completed' });
  assert.equal(back.body.archived, true);
});

test('archive/unarchive never alters work items and the board stays viewable (AC 10)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { title: 'epic', type: 'Epic' });
  await createItem(app, p.id, { title: 'child', epic_id: epic.id, priority: 'High' });
  await createItem(app, p.id, { title: 'other', type: 'Defect' });
  const before = await snapshotItems(p.id);
  await app.patch(`/api/projects/${p.id}`, { status: 'Completed' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  const whileArchived = await app.get(`/api/projects/${p.id}/issues`);
  assert.equal(whileArchived.status, 200);
  assert.deepEqual(whileArchived.body, before);
  assert.equal((await app.get(`/api/projects/${p.id}`)).status, 200);
  await app.patch(`/api/projects/${p.id}`, { archived: false });
  assert.deepEqual(await snapshotItems(p.id), before);
});

test('work items of an archived project are read-only via the API (AC 11)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id, { title: 'locked' });
  await app.patch(`/api/projects/${p.id}`, { status: 'Cancelled' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  const before = await snapshotItems(p.id);

  const create = await app.post(`/api/projects/${p.id}/issues`, { title: 'new' });
  assert.ok(create.status >= 400 && create.status < 500);
  const update = await app.patch(`/api/issues/${item.id}`, { status: 'Complete', title: 'changed' });
  assert.ok(update.status >= 400 && update.status < 500);
  assert.match(update.body.error, /archived/);
  const del = await app.del(`/api/issues/${item.id}`);
  assert.ok(del.status >= 400 && del.status < 500);

  assert.deepEqual(await snapshotItems(p.id), before);
  const proj = (await app.get(`/api/projects/${p.id}`)).body;
  assert.equal(proj.next_issue_number, 2, 'rejected create must not consume a key');
});

test('data and archived flag persist across a server restart (AC 8, 38)', async () => {
  const p = await createProject(app, { status: 'Completed' });
  await createItem(app, p.id, { title: 'survives' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  const dbPath = app.dbPath;
  await app.close();
  app = await startServer(dbPath);
  const proj = (await app.get(`/api/projects/${p.id}`)).body;
  assert.equal(proj.archived, true);
  assert.equal(proj.status, 'Completed');
  const items = (await app.get(`/api/projects/${p.id}/issues`)).body;
  assert.equal(items[0].title, 'survives');
});

// Edit project dialog (app restyle): one PATCH carries name, status and the
// archived flag; the key never changes.
test('edit project: rename, status and archive in one request; name is validated (edit dialog)', async () => {
  const p = await createProject(app);
  const res = await app.patch(`/api/projects/${p.id}`, { name: '  Renamed project  ', status: 'Completed', archived: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Renamed project', 'trimmed');
  assert.equal(res.body.status, 'Completed');
  assert.equal(res.body.archived, true);
  assert.equal(res.body.key, p.key, 'key unchanged');
  const saved = (await app.get(`/api/projects/${p.id}`)).body;
  assert.equal(saved.name, 'Renamed project');

  for (const name of ['', '   ', 'x'.repeat(81), 42]) {
    const bad = await app.patch(`/api/projects/${p.id}`, { name, status: 'Planning' });
    assert.equal(bad.status, 400, JSON.stringify(name));
    assert.ok(bad.body.error);
  }
  const after = (await app.get(`/api/projects/${p.id}`)).body;
  assert.deepEqual([after.name, after.status, after.archived], ['Renamed project', 'Completed', true], 'a rejected edit changes nothing');

  // Unarchive and reopen together, as the dialog sends it.
  const reopen = await app.patch(`/api/projects/${p.id}`, { name: 'Renamed project', status: 'In Progress', archived: false });
  assert.equal(reopen.status, 200);
  assert.deepEqual([reopen.body.status, reopen.body.archived], ['In Progress', false]);
});
