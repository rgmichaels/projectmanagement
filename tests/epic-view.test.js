// Epic view (docs/specs/epic-view.md): the children endpoint (AC 1-8) and
// membership changes through the existing PATCH (AC 9-10). Status, type and
// resolution names are taken from their list files, never typed here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const { STATUSES, terminalStatus } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { RESOLUTIONS } = require('../server/resolutions');

let app;
let users;
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const OTHER_TYPE = TYPES.find((t) => !t.isEpic && !t.isDefault).name;
const TERMINAL = terminalStatus();
const FIRST = STATUSES[0];
const MIDDLE = STATUSES[1];
const NON_DEFAULT_RESOLUTION = RESOLUTIONS.find((r) => !r.isDefault).name;

const children = (id, client = app) => client.get(`/api/issues/${id}/children`);
const epicEvents = async (id) => (await app.get(`/api/issues/${id}/history?field=epic`)).body.events;
const zeroCounts = () => STATUSES.map((status) => ({ status, count: 0 }));

async function epicWithProject(fields = {}) {
  const project = await createProject(app);
  const epic = await createItem(app, project.id, { type: EPIC_TYPE, title: 'Epic', ...fields });
  return { project, epic };
}

// ---------- the children endpoint (AC 1-8) ----------

test('an epic with no children: empty list, zero summary with every status (AC 1, 2)', async () => {
  const { epic } = await epicWithProject();
  const res = await children(epic.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { items: [], summary: { total: 0, done: 0, byStatus: zeroCounts() } });
});

test('children carry their fields and assignee name, ordered by status then number (AC 1)', async () => {
  const { project, epic } = await epicWithProject();
  const assignee = users[1];
  const a = await createItem(app, project.id, { title: 'A', epic_id: epic.id, assignee_id: assignee.id, type: OTHER_TYPE });
  const b = await createItem(app, project.id, { title: 'B', epic_id: epic.id });
  const c = await createItem(app, project.id, { title: 'C', epic_id: epic.id });
  const d = await createItem(app, project.id, { title: 'D', epic_id: epic.id });
  await app.patch(`/api/issues/${a.id}`, { status: TERMINAL });
  await app.patch(`/api/issues/${c.id}`, { status: MIDDLE });

  const res = await children(epic.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => i.key), [b.key, d.key, c.key, a.key]);
  const first = res.body.items.find((i) => i.id === a.id);
  for (const field of ['id', 'key', 'title', 'type', 'status', 'priority', 'assignee_id', 'assignee_name']) {
    assert.ok(field in first, field);
  }
  assert.equal(first.type, OTHER_TYPE);
  assert.equal(first.status, TERMINAL);
  assert.equal(first.priority, a.priority);
  assert.equal(first.assignee_id, assignee.id);
  assert.equal(first.assignee_name, assignee.name);
  const unassigned = res.body.items.find((i) => i.id === b.id);
  assert.equal(unassigned.assignee_id, null);
  assert.equal(unassigned.assignee_name, null);
});

test('done counts every child in the terminal status whatever its resolution (AC 2)', async () => {
  const { project, epic } = await epicWithProject();
  const items = [];
  for (let n = 0; n < 5; n += 1) items.push(await createItem(app, project.id, { epic_id: epic.id }));
  await app.patch(`/api/issues/${items[0].id}`, { status: TERMINAL });
  await app.patch(`/api/issues/${items[1].id}`, { status: TERMINAL, resolution: NON_DEFAULT_RESOLUTION });
  await app.patch(`/api/issues/${items[2].id}`, { status: MIDDLE });

  const { summary } = (await children(epic.id)).body;
  assert.equal(summary.total, 5);
  assert.equal(summary.done, 2);
  assert.deepEqual(summary.byStatus.map((s) => s.status), STATUSES, 'every status, in display order');
  const count = (status) => summary.byStatus.find((s) => s.status === status).count;
  assert.equal(count(FIRST), 2);
  assert.equal(count(MIDDLE), 1);
  assert.equal(count(TERMINAL), 2);
  assert.equal(summary.byStatus.reduce((n, s) => n + s.count, 0), summary.total);
});

test('a non-epic or unknown id is 404 "Epic not found." (AC 3)', async () => {
  const { project } = await epicWithProject();
  const task = await createItem(app, project.id);
  for (const id of [task.id, 999999, 'abc', 0]) {
    const res = await children(id);
    assert.equal(res.status, 404, String(id));
    assert.deepEqual(res.body, { error: 'Epic not found.' });
  }
});

test('only children of that epic, from any part of the project (AC 4)', async () => {
  const { project, epic } = await epicWithProject();
  const otherEpic = await createItem(app, project.id, { type: EPIC_TYPE });
  const mine = await createItem(app, project.id, { epic_id: epic.id });
  await createItem(app, project.id, { epic_id: otherEpic.id });
  await createItem(app, project.id); // no epic
  const other = await epicWithProject();
  await createItem(app, other.project.id, { epic_id: other.epic.id });

  const res = await children(epic.id);
  assert.deepEqual(res.body.items.map((i) => i.id), [mine.id]);
  assert.equal(res.body.summary.total, 1);
});

test('signed out: 401 (AC 5)', async () => {
  const { epic } = await epicWithProject();
  assert.equal((await app.raw('GET', `/api/issues/${epic.id}/children`)).status, 401);
});

test('readable on an archived project (AC 6)', async () => {
  const { project, epic } = await epicWithProject();
  const child = await createItem(app, project.id, { epic_id: epic.id });
  assert.equal((await app.patch(`/api/projects/${project.id}`, { status: 'Completed' })).status, 200);
  assert.equal((await app.patch(`/api/projects/${project.id}`, { archived: true })).body.archived, true);
  const res = await children(epic.id);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items.map((i) => i.id), [child.id]);
});

test('reflects status changes at once (AC 7)', async () => {
  const { project, epic } = await epicWithProject();
  const child = await createItem(app, project.id, { epic_id: epic.id });
  assert.equal((await children(epic.id)).body.summary.done, 0);
  await app.patch(`/api/issues/${child.id}`, { status: TERMINAL });
  const { summary, items } = (await children(epic.id)).body;
  assert.equal(summary.done, 1);
  assert.equal(summary.byStatus.find((s) => s.status === TERMINAL).count, 1);
  assert.equal(items[0].status, TERMINAL);
  await app.patch(`/api/issues/${child.id}`, { status: FIRST });
  assert.equal((await children(epic.id)).body.summary.done, 0);
});

test('an epic changed to a non-epic type releases its children and is 404 (AC 7)', async () => {
  const { project, epic } = await epicWithProject();
  const child = await createItem(app, project.id, { epic_id: epic.id });
  assert.equal((await app.patch(`/api/issues/${epic.id}`, { type: OTHER_TYPE })).status, 200);
  assert.equal((await children(epic.id)).status, 404);
  assert.equal((await app.get(`/api/issues/${child.id}`)).body.epic_id, null);
  // Back to an epic: the released child does not come back.
  await app.patch(`/api/issues/${epic.id}`, { type: EPIC_TYPE });
  assert.deepEqual((await children(epic.id)).body.items, []);
});

test('a deleted epic is 404 and its children survive with no epic (AC 7)', async () => {
  const { project, epic } = await epicWithProject();
  const child = await createItem(app, project.id, { epic_id: epic.id });
  assert.equal((await app.del(`/api/issues/${epic.id}`)).status, 204);
  assert.equal((await children(epic.id)).status, 404);
  assert.equal((await app.get(`/api/issues/${child.id}`)).body.epic_id, null);
});

test('the children endpoint writes nothing (AC 8)', async () => {
  const { project, epic } = await epicWithProject();
  await createItem(app, project.id, { epic_id: epic.id });
  const events = () => app.db.prepare('SELECT COUNT(*) AS n FROM issue_history_events').get().n;
  const before = events();
  await children(epic.id);
  assert.equal(events(), before);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const res = await app.request(method, `/api/issues/${epic.id}/children`, method === 'DELETE' ? undefined : {});
    assert.equal(res.status, 404, method);
  }
});

// ---------- membership through the existing PATCH (AC 9-10) ----------

test('add and remove a child with PATCH epic_id; each writes an epic history event (AC 9, 10)', async () => {
  const { project, epic } = await epicWithProject({ title: 'Parent' });
  const otherEpic = await createItem(app, project.id, { type: EPIC_TYPE, title: 'Other' });
  const item = await createItem(app, project.id, { epic_id: otherEpic.id });
  const actor = users[1];
  const client = await app.client(actor.username);

  // Adding an item from another epic moves it.
  assert.equal((await client.patch(`/api/issues/${item.id}`, { epic_id: epic.id })).status, 200);
  assert.deepEqual((await children(epic.id)).body.items.map((i) => i.id), [item.id]);
  assert.deepEqual((await children(otherEpic.id)).body.items, []);
  let [e] = await epicEvents(item.id);
  assert.equal(e.actor_name, actor.name);
  assert.equal(e.changes.length, 1);
  assert.equal(e.changes[0].old, `${otherEpic.key} Other`);
  assert.equal(e.changes[0].new, `${epic.key} Parent`);

  assert.equal((await client.patch(`/api/issues/${item.id}`, { epic_id: null })).status, 200);
  assert.equal((await children(epic.id)).body.summary.total, 0);
  assert.equal((await app.get(`/api/issues/${item.id}`)).status, 200, 'removed, not deleted');
  [e] = await epicEvents(item.id);
  assert.equal(e.actor_name, actor.name);
  assert.equal(e.changes[0].old, `${epic.key} Parent`);
  assert.equal(e.changes[0].new, null);
});

test('existing epic validation still applies (AC 9)', async () => {
  const { project, epic } = await epicWithProject();
  const task = await createItem(app, project.id);
  const notEpic = await createItem(app, project.id);
  const other = await epicWithProject();
  const anotherEpic = await createItem(app, project.id, { type: EPIC_TYPE });

  assert.equal((await app.patch(`/api/issues/${task.id}`, { epic_id: other.epic.id })).status, 400, 'other project');
  assert.equal((await app.patch(`/api/issues/${task.id}`, { epic_id: notEpic.id })).status, 400, 'not an epic');
  assert.equal((await app.patch(`/api/issues/${anotherEpic.id}`, { epic_id: epic.id })).status, 400, 'epic in epic');
  assert.equal((await children(epic.id)).body.summary.total, 0);

  assert.equal((await app.patch(`/api/projects/${project.id}`, { status: 'Completed' })).status, 200);
  assert.equal((await app.patch(`/api/projects/${project.id}`, { archived: true })).status, 200);
  assert.equal((await app.patch(`/api/issues/${task.id}`, { epic_id: epic.id })).status, 409, 'archived');
  assert.equal((await children(epic.id)).body.summary.total, 0);
});
