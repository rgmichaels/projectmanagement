const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');

test('project groups persist, isolate permissions, and apply to open sessions', async () => {
  const app = await startServer();
  try {
    const a = await createProject(app);
    const b = await createProject(app);
    const itemA = await createItem(app, a.id);
    const itemB = await createItem(app, b.id);
    const member = await app.client('blake');
    const user = (await app.get('/api/users')).body.find((u) => u.username === 'blake');
    const set = (group) => app.patch(`/api/users/${user.id}`, { project_id: a.id, group });
    assert.equal((await set('Viewer')).status, 200);
    assert.equal((await member.patch(`/api/issues/${itemA.id}`, { title: 'Denied' })).status, 403);
    assert.equal((await member.post(`/api/projects/${a.id}/issues`, { title: 'Denied' })).status, 403);
    assert.equal((await member.patch(`/api/issues/${itemB.id}`, { title: 'Allowed' })).status, 200);
    const list = (await app.get(`/api/users?project=${a.id}`)).body;
    assert.equal(list.find((u) => u.id === user.id).group, 'Viewer');
    assert.equal(list.find((u) => u.id === user.id).defaultGroup, 'Member');
    assert.deepEqual((await member.get('/api/auth/me')).body.projectPermissions[a.id], []);
    assert.equal((await set('Admin')).status, 200);
    assert.equal((await member.patch(`/api/projects/${a.id}`, { name: 'Allowed' })).status, 200);
    assert.equal((await member.patch(`/api/projects/${b.id}`, { name: 'Denied' })).status, 403);
    assert.equal((await member.patch(`/api/users/${user.id}`, { group: 'Admin' })).status, 403);
    assert.equal((await member.patch(`/api/users/${user.id}`, { project_id: b.id, group: 'Admin' })).status, 403);
    assert.equal((await set('Invalid')).status, 400);
    assert.equal(app.db.prepare('SELECT group_name FROM project_permissions WHERE project_id = ? AND user_id = ?').get(a.id, user.id).group_name, 'Admin');
    assert.equal((await set(null)).body.inherited, true);
    assert.equal((await member.patch(`/api/issues/${itemA.id}`, { title: 'Default restored' })).status, 200);
    assert.equal((await app.get(`/api/users?project=999999`)).status, 404);
  } finally { await app.close(); }
});

test('project restrictions cover nested resources and cannot be overridden by query or body', async () => {
  const app = await startServer();
  try {
    const a = await createProject(app);
    const b = await createProject(app);
    const item = await createItem(app, a.id);
    const member = await app.client('blake');
    const comment = (await member.post(`/api/issues/${item.id}/comments`, { body: 'Before' })).body;
    const user = (await app.get('/api/users')).body.find((u) => u.username === 'blake');
    await app.patch(`/api/users/${user.id}`, { project_id: a.id, group: 'Viewer' });
    assert.equal((await member.patch(`/api/comments/${comment.id}?project=${b.id}`, { body: 'Denied', project_id: b.id })).status, 403);
    assert.equal((await member.del(`/api/comments/${comment.id}`)).status, 403);
    assert.equal((await member.upload(item.id, 'x.txt', Buffer.from('Denied'), 'text/plain')).status, 403);
    assert.equal((await member.post(`/api/projects/${a.id}/sprints`, { name: 'Denied' })).status, 403);
    assert.equal((await member.post(`/api/issues/${item.id}/time`, { hours: 1 })).status, 403);
  } finally { await app.close(); }
});
