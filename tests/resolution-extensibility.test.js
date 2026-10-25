// Resolution extensibility (resolution spec AC 2, 4).
// Each node:test file runs in its own process, so changing the lists here,
// before the app is created, is equivalent to editing the list files and
// restarting the server with no other code changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES } = require('../server/statuses');
const { RESOLUTIONS } = require('../server/resolutions');

STATUSES.push('Closed'); // appended after Done: the new last entry is terminal
RESOLUTIONS.push({ name: 'Obsolete' });

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('a status appended after Done becomes the terminal status (AC 2)', async () => {
  assert.deepEqual((await app.get('/api/terminal-status')).body, { status: 'Closed' });
  const p = await createProject(app);
  const item = await createItem(app, p.id);

  let res = await app.patch(`/api/issues/${item.id}`, { status: 'Done' });
  assert.equal(res.status, 200);
  assert.equal(res.body.resolution, null, 'Done is no longer terminal');
  assert.ok((await app.patch(`/api/issues/${item.id}`, { resolution: 'Fixed' })).status >= 400);

  res = await app.patch(`/api/issues/${item.id}`, { status: 'Closed' });
  assert.equal(res.body.resolution, 'Fixed');
  res = await app.patch(`/api/issues/${item.id}`, { status: 'Done' });
  assert.equal(res.body.resolution, null);
});

test('an added resolution is listed, accepted on PATCH and returned for cards (AC 4)', async () => {
  const list = (await app.get('/api/resolutions')).body;
  assert.equal(list[list.length - 1].name, 'Obsolete');
  assert.deepEqual(list.filter((r) => r.isDefault).map((r) => r.name), ['Fixed'], 'default unchanged');

  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const res = await app.patch(`/api/issues/${item.id}`, { status: 'Closed', resolution: 'Obsolete' });
  assert.equal(res.status, 200);
  assert.equal(res.body.resolution, 'Obsolete');
  const listed = (await app.get(`/api/projects/${p.id}/issues`)).body;
  assert.equal(listed[0].resolution, 'Obsolete');
});
