// History extensibility (docs/specs/ticket-history.md AC 28).
// Each node:test file runs in its own process, so adding entries to the lists
// here, before the app is created, is equivalent to editing the list files and
// restarting the server with no history code change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, terminalStatus } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { PRIORITIES } = require('../server/priorities');
const { RESOLUTIONS } = require('../server/resolutions');

STATUSES.splice(STATUSES.length - 1, 0, 'In Review'); // before the terminal status
TYPES.push({ name: 'Spike', label: 'Spike' });
PRIORITIES.push('Trivial');
RESOLUTIONS.push({ name: 'Obsolete' });

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

const latest = async (id) => {
  const [e] = (await app.get(`/api/issues/${id}/history`)).body.events;
  return Object.fromEntries(e.changes.map((c) => [c.field, [c.old, c.new]]));
};

test('moves to and from added list values appear in history (AC 28)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);

  await app.patch(`/api/issues/${item.id}`, { status: 'In Review' });
  assert.deepEqual(await latest(item.id), { status: [STATUSES[0], 'In Review'] });

  await app.patch(`/api/issues/${item.id}`, { type: 'Spike', priority: 'Trivial' });
  assert.deepEqual(await latest(item.id), { type: [item.type, 'Spike'], priority: [item.priority, 'Trivial'] });

  await app.patch(`/api/issues/${item.id}`, { status: terminalStatus(), resolution: 'Obsolete' });
  assert.deepEqual(await latest(item.id), { status: ['In Review', terminalStatus()], resolution: [null, 'Obsolete'] });

  await app.patch(`/api/issues/${item.id}`, { status: 'In Review' });
  assert.deepEqual(await latest(item.id), { status: [terminalStatus(), 'In Review'], resolution: ['Obsolete', null] });

  const res = await app.get(`/api/issues/${item.id}/history?field=status`);
  assert.equal(res.body.events.length, 3);
});
