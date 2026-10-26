// Sprints extensibility (docs/specs/sprints-and-backlog.md AC 52, user story 11).
// Each node:test file runs in its own process, so adding entries to the lists
// here, before the app is created, is equivalent to editing the list files and
// restarting the server with no sprint code change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, terminalStatus } = require('../server/statuses');
const { SPRINT_EVENT_KINDS, SPRINT_HISTORY_FIELDS } = require('../server/sprintEvents');
const { SPRINT_STATES } = require('../server/sprintStates');

const TERMINAL = terminalStatus();
STATUSES.splice(STATUSES.length - 1, 0, 'Signed Off'); // a new status before the terminal one
SPRINT_EVENT_KINDS.push({ key: 'archived', label: 'Archived' });
SPRINT_HISTORY_FIELDS.push({ key: 'capacity', column: 'capacity', label: 'Capacity' });
SPRINT_STATES.splice(1, 0, { name: 'Ready to start' }); // a state with no flag, between initial and active

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('an added status: done counts, completion and the board still follow the terminal status (AC 52)', async () => {
  assert.equal(terminalStatus(), TERMINAL, 'the terminal status is still the last entry');
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).body;
  await app.post(`/api/sprints/${s.id}/start`);
  const signed = await createItem(app, p.id, { sprint_id: s.id });
  const done = await createItem(app, p.id, { sprint_id: s.id });
  assert.equal((await app.patch(`/api/issues/${signed.id}`, { status: 'Signed Off' })).status, 200);
  await app.patch(`/api/issues/${done.id}`, { status: TERMINAL });
  const board = (await app.get(`/api/projects/${p.id}/issues?sprint=active`)).body;
  assert.deepEqual(board.map((i) => i.status).sort(), ['Signed Off', TERMINAL].sort(), 'the board shows both');
  const [listed] = (await app.get(`/api/projects/${p.id}/sprints`)).body;
  assert.deepEqual([listed.item_count, listed.done_count], [2, 1]);
  const res = await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  assert.deepEqual(res.body.moved, { count: 1, to: null }, 'the added status counts as unfinished');
  assert.deepEqual((await app.get(`/api/projects/${p.id}/issues?sprint=backlog`)).body.map((i) => i.id), [signed.id]);
});

test('an added event kind and field flow through GET /api/sprint-event-kinds unchanged (AC 52)', async () => {
  const res = await app.get('/api/sprint-event-kinds');
  assert.deepEqual(res.body.kinds[res.body.kinds.length - 1], { key: 'archived', label: 'Archived' });
  assert.deepEqual(res.body.fields[res.body.fields.length - 1], { key: 'capacity', label: 'Capacity' });
});

test('an added sprint state is listed in order and the flags still decide (AC 15)', async () => {
  const states = (await app.get('/api/sprint-states')).body;
  assert.equal(states[1].name, 'Ready to start');
  assert.deepEqual([states[1].initial, states[1].active, states[1].final], [false, false, false]);
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).body;
  assert.equal(s.state, states.find((x) => x.initial).name);
  assert.equal((await app.post(`/api/sprints/${s.id}/start`)).body.state, states.find((x) => x.active).name);
});
