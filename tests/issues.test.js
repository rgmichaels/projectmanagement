// Work items: keys, types, statuses, epics, reorder and lane drops
// (AC 12-18, 22, 24, 30, 35-37).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');

let app;
let users;
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const items = async (projectId) => (await app.get(`/api/projects/${projectId}/issues`)).body;
const getItem = async (id) => (await app.get(`/api/issues/${id}`)).body;
const columnOrder = async (projectId, status) =>
  (await items(projectId))
    .filter((i) => i.status === status)
    .sort((a, b) => a.rank - b.rank || a.id - b.id)
    .map((i) => i.title);

test('seeded users exist (AC 15)', () => {
  assert.ok(users.length >= 3 && users.length <= 4);
});

test('keys start at 1 per project, increment, and are never reused (AC 13, 18)', async () => {
  const res = await app.post('/api/projects', { name: 'Proj', key: 'PROJ' });
  const p = res.body;
  const first = await createItem(app, p.id);
  assert.equal(first.key, 'PROJ-1');
  const second = await createItem(app, p.id);
  assert.equal(second.key, 'PROJ-2');

  assert.equal((await app.del(`/api/issues/${second.id}`)).status, 204);
  assert.equal((await app.get(`/api/issues/${second.id}`)).status, 404);
  const third = await createItem(app, p.id);
  assert.equal(third.key, 'PROJ-3');

  const other = await createProject(app);
  const otherFirst = await createItem(app, other.id);
  assert.equal(otherFirst.key, `${other.key}-1`);
});

test('the four work item types, default Task, no Story/Bug (AC 12)', async () => {
  const types = (await app.get('/api/types')).body;
  assert.deepEqual(types.map((t) => t.name), ['Defect', 'Task', 'Issue', 'Enhancement', 'Epic']);
  assert.deepEqual(types.filter((t) => t.isEpic).map((t) => t.name), ['Epic']);
  assert.deepEqual(types.filter((t) => t.isDefault).map((t) => t.name), ['Task']);

  const p = await createProject(app);
  const def = await createItem(app, p.id);
  assert.equal(def.type, 'Task');
  assert.equal(def.priority, 'Medium');
  assert.equal(def.assignee_id, null);
  assert.equal(def.epic_id, null);
  for (const type of ['Defect', 'Task', 'Issue', 'Enhancement', 'Epic']) {
    assert.equal((await createItem(app, p.id, { type })).type, type);
  }
  for (const type of ['Story', 'Bug', 'task', '']) {
    const res = await app.post(`/api/projects/${p.id}/issues`, { title: 'x', type });
    assert.equal(res.status, 400);
  }
});

test('title, priority and assignee validation (AC 12, 15)', async () => {
  const p = await createProject(app);
  for (const title of ['', '   ', 'x'.repeat(201), undefined]) {
    assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title })).status, 400);
  }
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x'.repeat(200) })).status, 201);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', priority: 'Urgent' })).status, 400);
  for (const priority of ['Highest', 'High', 'Medium', 'Low', 'Lowest']) {
    assert.equal((await createItem(app, p.id, { priority })).priority, priority);
  }
  const assigned = await createItem(app, p.id, { assignee_id: users[0].id, description: 'details' });
  assert.equal(assigned.assignee_id, users[0].id);
  assert.equal(assigned.description, 'details');
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', assignee_id: 9999 })).status, 400);
});

test('new work items get the first status; statuses are the seven-step pipeline (AC 14)', async () => {
  assert.deepEqual((await app.get('/api/statuses')).body, ['Planning', 'Ready', 'In Progress', 'Internal Testing', 'UAT', 'Go Live', 'Complete']);
  const p = await createProject(app);
  const item = await createItem(app, p.id, { status: 'Complete' });
  assert.equal(item.status, 'Planning');
});

test('status change via API persists (AC 22) and invalid status/type is rejected (AC 30)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const res = await app.patch(`/api/issues/${item.id}`, { status: 'In Progress' });
  assert.equal(res.status, 200);
  assert.equal((await getItem(item.id)).status, 'In Progress');

  const before = await getItem(item.id);
  for (const body of [{ status: 'In Review' }, { status: 'Backlog' }, { type: 'Story' }, { type: 'Spike' }]) {
    const bad = await app.patch(`/api/issues/${item.id}`, { ...body, title: 'should not apply' });
    assert.ok(bad.status >= 400 && bad.status < 500);
  }
  assert.deepEqual(await getItem(item.id), before);
});

test('creating a work item with an unknown status is rejected and creates nothing (AC 30)', async () => {
  const statuses = (await app.get('/api/statuses')).body;
  const p = await createProject(app);
  const countBefore = (await items(p.id)).length;
  for (const status of ['Nonsense', 'In Review', '']) {
    assert.ok(!statuses.includes(status));
    const bad = await app.post(`/api/projects/${p.id}/issues`, { title: 'should not exist', status });
    assert.equal(bad.status, 400);
  }
  assert.equal((await items(p.id)).length, countBefore);

  // Absent status still defaults to the first status in the list (AC 14).
  const item = await createItem(app, p.id);
  assert.equal(item.status, statuses[0]);
});

test('editing fields persists (AC 17)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const res = await app.patch(`/api/issues/${item.id}`, {
    title: 'Renamed',
    type: 'Defect',
    priority: 'Low',
    assignee_id: users[1].id,
    description: 'new text',
  });
  assert.equal(res.status, 200);
  const saved = await getItem(item.id);
  assert.equal(saved.title, 'Renamed');
  assert.equal(saved.type, 'Defect');
  assert.equal(saved.priority, 'Low');
  assert.equal(saved.assignee_id, users[1].id);
  assert.equal(saved.description, 'new text');
  await app.patch(`/api/issues/${item.id}`, { assignee_id: null });
  assert.equal((await getItem(item.id)).assignee_id, null);
});

test('epic rules: same project, epic type only, epics cannot have an epic (AC 16)', async () => {
  const p = await createProject(app);
  const other = await createProject(app);
  const epic = await createItem(app, p.id, { type: 'Epic', title: 'Epic A' });
  const foreignEpic = await createItem(app, other.id, { type: 'Epic' });
  const task = await createItem(app, p.id);

  const child = await createItem(app, p.id, { epic_id: epic.id });
  assert.equal(child.epic_id, epic.id);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', epic_id: foreignEpic.id })).status, 400);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', epic_id: task.id })).status, 400);
  assert.equal(
    (await app.post(`/api/projects/${p.id}/issues`, { title: 'x', type: 'Epic', epic_id: epic.id })).status,
    400
  );
  const epic2 = await createItem(app, p.id, { type: 'Epic' });
  assert.equal((await app.patch(`/api/issues/${epic2.id}`, { epic_id: epic.id })).status, 400);
  // A child cannot become an epic while keeping its epic, but can if the epic is cleared.
  assert.equal((await app.patch(`/api/issues/${child.id}`, { type: 'Epic' })).status, 400);
  const ok = await app.patch(`/api/issues/${task.id}`, { type: 'Epic', epic_id: null });
  assert.equal(ok.status, 200);
});

test('deleting an epic clears its children, it does not delete them (AC 18)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: 'Epic' });
  const a = await createItem(app, p.id, { epic_id: epic.id });
  const b = await createItem(app, p.id, { epic_id: epic.id });
  assert.equal((await app.del(`/api/issues/${epic.id}`)).status, 204);
  assert.equal((await getItem(a.id)).epic_id, null);
  assert.equal((await getItem(b.id)).epic_id, null);
  assert.equal((await items(p.id)).length, 2);

  // Changing an epic to a non-epic type also releases its children.
  const epic2 = await createItem(app, p.id, { type: 'Epic' });
  const c = await createItem(app, p.id, { epic_id: epic2.id });
  await app.patch(`/api/issues/${epic2.id}`, { type: 'Task' });
  assert.equal((await getItem(c.id)).epic_id, null);
});

test('in-column reorder by rank persists, including when no gap is left (AC 24)', async () => {
  const p = await createProject(app);
  const a = await createItem(app, p.id, { title: 'A' });
  const b = await createItem(app, p.id, { title: 'B' });
  const c = await createItem(app, p.id, { title: 'C' });
  assert.deepEqual(await columnOrder(p.id, 'Planning'), ['A', 'B', 'C']);

  // Move C between A and B using the midpoint rank, as the board does.
  await app.patch(`/api/issues/${c.id}`, { rank: Math.floor((a.rank + b.rank) / 2) });
  assert.deepEqual(await columnOrder(p.id, 'Planning'), ['A', 'C', 'B']);

  // Move C to the top.
  await app.patch(`/api/issues/${c.id}`, { rank: a.rank - 1000 });
  assert.deepEqual(await columnOrder(p.id, 'Planning'), ['C', 'A', 'B']);

  // No gap: send the rank of the card to drop in front of; the server renumbers.
  await app.patch(`/api/issues/${a.id}`, { rank: 10 });
  await app.patch(`/api/issues/${b.id}`, { rank: 11 });
  await app.patch(`/api/issues/${c.id}`, { rank: 12 });
  assert.deepEqual(await columnOrder(p.id, 'Planning'), ['A', 'B', 'C']);
  await app.patch(`/api/issues/${c.id}`, { rank: 11 });
  assert.deepEqual(await columnOrder(p.id, 'Planning'), ['A', 'C', 'B']);
  const ranks = (await items(p.id)).map((i) => i.rank);
  assert.equal(new Set(ranks).size, ranks.length);

  // Moving to another column with a rank places it there.
  const d = await createItem(app, p.id, { title: 'D' });
  await app.patch(`/api/issues/${a.id}`, { status: 'Complete' });
  await app.patch(`/api/issues/${d.id}`, { status: 'Complete', rank: (await getItem(a.id)).rank - 1000 });
  assert.deepEqual(await columnOrder(p.id, 'Complete'), ['D', 'A']);

  assert.equal((await app.patch(`/api/issues/${a.id}`, { rank: 1.5 })).status, 400);
});

test('lane drops update the grouped field and status in one request (AC 35)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: 'Epic' });
  const item = await createItem(app, p.id, { assignee_id: users[0].id });

  // Assignee lane: change assignee and status together.
  let res = await app.patch(`/api/issues/${item.id}`, { status: 'In Progress', assignee_id: users[1].id });
  assert.equal(res.status, 200);
  let saved = await getItem(item.id);
  assert.equal(saved.status, 'In Progress');
  assert.equal(saved.assignee_id, users[1].id);

  // Dropping onto Unassigned clears the field.
  await app.patch(`/api/issues/${item.id}`, { status: 'In Progress', assignee_id: null });
  assert.equal((await getItem(item.id)).assignee_id, null);

  // Epic lane, then No epic.
  await app.patch(`/api/issues/${item.id}`, { status: 'Complete', epic_id: epic.id });
  saved = await getItem(item.id);
  assert.equal(saved.epic_id, epic.id);
  assert.equal(saved.status, 'Complete');
  await app.patch(`/api/issues/${item.id}`, { status: 'Complete', epic_id: null });
  assert.equal((await getItem(item.id)).epic_id, null);

  // Priority lane.
  await app.patch(`/api/issues/${item.id}`, { status: 'Planning', priority: 'Highest' });
  saved = await getItem(item.id);
  assert.equal(saved.priority, 'Highest');
  assert.equal(saved.status, 'Planning');

  // Same lane, different column: only status changes.
  const before = await getItem(item.id);
  await app.patch(`/api/issues/${item.id}`, { status: 'In Progress' });
  const after = await getItem(item.id);
  assert.equal(after.status, 'In Progress');
  assert.equal(after.priority, before.priority);
  assert.equal(after.assignee_id, before.assignee_id);
  assert.equal(after.epic_id, before.epic_id);
});

test('an epic cannot be dropped into another epic lane (AC 36)', async () => {
  const p = await createProject(app);
  const epicA = await createItem(app, p.id, { type: 'Epic' });
  const epicB = await createItem(app, p.id, { type: 'Epic' });
  const res = await app.patch(`/api/issues/${epicB.id}`, { status: 'Complete', epic_id: epicA.id });
  assert.ok(res.status >= 400 && res.status < 500);
  const saved = await getItem(epicB.id);
  assert.equal(saved.status, 'Planning');
  assert.equal(saved.epic_id, null);
});

test('reading the board (any grouping is client-side) changes no data (AC 37)', async () => {
  const p = await createProject(app);
  await createItem(app, p.id);
  const first = await items(p.id);
  const second = await items(p.id);
  assert.deepEqual(first, second);
});
