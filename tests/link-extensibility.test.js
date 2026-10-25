// Link type extensibility (docs/specs/work-item-links.md AC 3).
// Each node:test file runs in its own process, so adding entries to the list
// here, before the app is created, is equivalent to editing
// server/linkTypes.js and restarting the server with no other code change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { LINK_TYPES } = require('../server/linkTypes');

LINK_TYPES.push({ name: 'Causes', outward: 'causes', inward: 'is caused by' });
LINK_TYPES.push({ name: 'Mirrors', outward: 'mirrors', symmetric: true });

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('added link types appear in the options, in order (AC 2, 3)', async () => {
  const options = (await app.get('/api/link-types')).body;
  assert.deepEqual(options.slice(-3), [
    { link_type: 'Causes', direction: 'outward', label: 'causes' },
    { link_type: 'Causes', direction: 'inward', label: 'is caused by' },
    { link_type: 'Mirrors', direction: 'outward', label: 'mirrors' },
  ]);
});

test('added link types can be created, read from both ends, recorded and removed (AC 3)', async () => {
  const p = await createProject(app);
  const a = await createItem(app, p.id);
  const b = await createItem(app, p.id);

  const res = await app.post(`/api/issues/${a.id}/links`, { link_type: 'Causes', direction: 'outward', target_id: b.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.label, 'causes');
  const [fromB] = (await app.get(`/api/issues/${b.id}/links`)).body;
  assert.equal(fromB.label, 'is caused by');
  const [e] = (await app.get(`/api/issues/${b.id}/history?field=link`)).body.events;
  assert.equal(e.changes[0].new, `is caused by ${a.key}`);

  assert.equal((await app.post(`/api/issues/${b.id}/links`, { link_type: 'Mirrors', target_id: a.id })).status, 201);
  assert.equal((await app.post(`/api/issues/${a.id}/links`, { link_type: 'Mirrors', target_id: b.id })).status, 409);
  const list = (await app.get(`/api/issues/${a.id}/links`)).body;
  assert.deepEqual(list.map((l) => l.label), ['causes', 'mirrors']);

  assert.equal((await app.del(`/api/issues/${a.id}/links/${res.body.id}`)).status, 204);
  assert.equal((await app.get(`/api/issues/${a.id}/links`)).body.length, 1);
});
