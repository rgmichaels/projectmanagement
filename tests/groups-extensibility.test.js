// Permission group extensibility (docs/specs/permission-groups.md AC 1, 21).
// Each node:test file runs in its own process, so editing the list here,
// before the app is created, is equivalent to editing server/groups.js and
// restarting the server with no other code change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { GROUPS } = require('../server/groups');

// A new group with chosen permissions, and a changed one.
GROUPS.splice(2, 0, { name: 'Triager', permissions: ['write', 'delete-item'] });
GROUPS.find((g) => g.name === 'Viewer').permissions.push('manage-projects');

const { startServer, createProject, createItem } = require('./helpers');

let app;
let ids;
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
});
test.after(async () => { await app.close(); });

test('an added group is listed in order and can be assigned (AC 1, 3, 9)', async () => {
  assert.deepEqual((await app.get('/api/groups')).body, ['Admin', 'Member', 'Triager', 'Viewer']);
  const res = await app.patch(`/api/users/${ids.blake}`, { group: 'Triager' });
  assert.equal(res.status, 200);
  assert.equal(res.body.group, 'Triager');
});

test('the guard honours the added group\'s permissions (AC 1, 4)', async () => {
  await app.patch(`/api/users/${ids.blake}`, { group: 'Triager' });
  const blake = await app.client('blake');
  assert.deepEqual((await blake.get('/api/auth/me')).body.permissions, ['write', 'delete-item']);
  const p = await createProject(app);
  const item = await createItem(blake, p.id);
  assert.equal((await blake.del(`/api/issues/${item.id}`)).status, 204);
  const denied = await blake.post('/api/projects', { name: 'x', key: 'TRI' });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'Your group (Triager) is not allowed to manage projects.');
});

test('a changed group\'s permissions take effect (AC 1)', async () => {
  await app.patch(`/api/users/${ids.casey}`, { group: 'Viewer' });
  const casey = await app.client('casey');
  assert.deepEqual((await casey.get('/api/auth/me')).body.permissions, ['manage-projects']);
  assert.equal((await casey.post('/api/projects', { name: 'By a viewer', key: 'VIEW' })).status, 201);
  const p = await createProject(app);
  assert.equal((await casey.post(`/api/projects/${p.id}/issues`, { title: 'x' })).status, 403);
});
