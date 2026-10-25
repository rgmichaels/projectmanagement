// Epic view extensibility (docs/specs/epic-view.md AC 25).
// Each node:test file runs in its own process, so adding a status to the list
// here, before the app is created, is equivalent to editing
// server/statuses.js and restarting the server with no other code change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, terminalStatus } = require('../server/statuses');
const { TYPES } = require('../server/types');

STATUSES.splice(STATUSES.length - 1, 0, 'In Review');

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('an added status appears in the epic counts in display order (AC 25)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: TYPES.find((t) => t.isEpic).name });
  const a = await createItem(app, p.id, { epic_id: epic.id });
  const b = await createItem(app, p.id, { epic_id: epic.id });
  await app.patch(`/api/issues/${a.id}`, { status: 'In Review' });
  await app.patch(`/api/issues/${b.id}`, { status: terminalStatus() });

  const { items, summary } = (await app.get(`/api/issues/${epic.id}/children`)).body;
  assert.deepEqual(summary.byStatus.map((s) => s.status), STATUSES);
  assert.equal(summary.byStatus.find((s) => s.status === 'In Review').count, 1);
  assert.equal(summary.done, 1, 'In Review is not the terminal status');
  assert.deepEqual(items.map((i) => i.id), [a.id, b.id], 'ordered by the new display order');
});
