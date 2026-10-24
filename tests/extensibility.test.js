// Single-source status and type lists (AC 25, 26, 28, 29).
// Each node:test file runs in its own process, so adding entries to the lists
// here, before the app is created, is equivalent to editing the list file and
// restarting the server with no other code changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES } = require('../server/statuses');
const { TYPES } = require('../server/types');

STATUSES.splice(STATUSES.indexOf('Done'), 0, 'In Review');
TYPES.push({ name: 'Spike', label: 'Spike' }); // no colour/icon: fallback styling

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('an added status appears in order and is accepted on PATCH (AC 28)', async () => {
  assert.deepEqual((await app.get('/api/statuses')).body, ['To Do', 'In Progress', 'In Review', 'Done']);
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal(item.status, 'To Do');
  const res = await app.patch(`/api/issues/${item.id}`, { status: 'In Review', rank: 1000 });
  assert.equal(res.status, 200);
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.status, 'In Review');
  assert.equal((await app.patch(`/api/issues/${item.id}`, { status: 'Blocked' })).status, 400);
});

test('an added type is listed and accepted on create and update (AC 29)', async () => {
  const types = (await app.get('/api/types')).body;
  assert.ok(types.some((t) => t.name === 'Spike' && !t.color));
  const p = await createProject(app);
  const spike = await createItem(app, p.id, { type: 'Spike' });
  assert.equal(spike.type, 'Spike');
  const task = await createItem(app, p.id);
  assert.equal(task.type, 'Task', 'default type is unchanged');
  const res = await app.patch(`/api/issues/${task.id}`, { type: 'Spike' });
  assert.equal(res.status, 200);
  assert.equal(res.body.type, 'Spike');
  // A non-epic added type gets no epic behaviour.
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', epic_id: spike.id })).status, 400);
});
