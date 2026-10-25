// Work item history (docs/specs/ticket-history.md): recording on create,
// update and delete (AC 1-14), the read API (AC 15-18) and the field list
// (AC 28). The default client is signed in as users[0]; other users act
// through their own clients.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const { STATUSES, terminalStatus } = require('../server/statuses');
const { RESOLUTIONS, defaultResolution } = require('../server/resolutions');
const { TYPES, defaultType } = require('../server/types');
const { PRIORITIES, DEFAULT_PRIORITY } = require('../server/priorities');
const { HISTORY_FIELDS, publicFields } = require('../server/historyFields');
const issues = require('../server/data/issues');
const history = require('../server/data/history');
const { actorFrom } = require('../server/routes/guards');

let app;
let users;
const clients = new Map(); // user id -> client signed in as that user
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
  for (const u of users) clients.set(u.id, u.id === users[0].id ? app : await app.client(u.username));
});
test.after(async () => { await app.close(); });

const as = (user) => clients.get(user.id);
const me = () => users[0];
const TERMINAL = terminalStatus();
const FIRST = STATUSES[0];
const MIDDLE = STATUSES[1];
const OTHER_RESOLUTION = RESOLUTIONS.find((r) => !r.isDefault).name;
const OTHER_PRIORITY = PRIORITIES.find((p) => p !== DEFAULT_PRIORITY);
const OTHER_TYPE = TYPES.find((t) => !t.isEpic && !t.isDefault).name;
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;

const getHistory = async (id, query = '') => app.get(`/api/issues/${id}/history${query}`);
const events = async (id, query = '') => (await getHistory(id, query)).body.events;
const eventCount = (id) => app.db.prepare('SELECT COUNT(*) AS n FROM issue_history_events WHERE issue_id = ?').get(id).n;
const changeCount = (id) =>
  app.db
    .prepare('SELECT COUNT(*) AS n FROM issue_history_changes c JOIN issue_history_events e ON e.id = c.event_id WHERE e.issue_id = ?')
    .get(id).n;
// The newest event's changes as { field: [old, new] }.
const latest = async (id) => {
  const [e] = await events(id);
  return Object.fromEntries(e.changes.map((c) => [c.field, [c.old, c.new]]));
};

async function newItem(fields) {
  const project = await createProject(app);
  return { project, item: await createItem(app, project.id, fields) };
}

// Runs fn with console.error silenced (the app logs 500s).
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ---------- recording ----------

test('creating a work item writes one created event with the actor and time (AC 1)', async () => {
  const { item } = await newItem();
  const list = await events(item.id);
  assert.equal(list.length, 1);
  const [e] = list;
  assert.equal(e.kind, 'created');
  assert.equal(e.actor_id, me().id);
  assert.equal(e.actor_name, me().name);
  assert.equal(e.created_at, item.created_at);
  assert.deepEqual(e.changes, []);
});

test('each editable field is recorded with its old and new display value (AC 2, 5, 6)', async () => {
  const { project, item } = await newItem({ description: 'first' });
  const epic = await createItem(app, project.id, { type: EPIC_TYPE, title: 'Big <b>epic</b>' });

  await app.patch(`/api/issues/${item.id}`, { title: 'Renamed' });
  assert.deepEqual(await latest(item.id), { title: ['Work item', 'Renamed'] });

  await app.patch(`/api/issues/${item.id}`, { type: OTHER_TYPE });
  assert.deepEqual(await latest(item.id), { type: [defaultType(), OTHER_TYPE] });

  await app.patch(`/api/issues/${item.id}`, { priority: OTHER_PRIORITY });
  assert.deepEqual(await latest(item.id), { priority: [DEFAULT_PRIORITY, OTHER_PRIORITY] });

  await app.patch(`/api/issues/${item.id}`, { status: MIDDLE });
  assert.deepEqual(await latest(item.id), { status: [FIRST, MIDDLE] });

  await app.patch(`/api/issues/${item.id}`, { description: 'second, much longer text' });
  let [e] = await events(item.id);
  assert.deepEqual(e.changes, [
    { field: 'description', label: 'Description', kind: 'long', old: null, new: null, old_id: null, new_id: null },
  ]);
  const stored = app.db.prepare("SELECT old_value, new_value FROM issue_history_changes WHERE field = 'description'").all();
  assert.ok(stored.length > 0 && stored.every((r) => r.old_value === null && r.new_value === null), 'no description text stored');

  await app.patch(`/api/issues/${item.id}`, { assignee_id: users[1].id });
  [e] = await events(item.id);
  assert.deepEqual(e.changes, [
    { field: 'assignee', label: 'Assignee', kind: 'user', old: null, new: users[1].name, old_id: null, new_id: users[1].id },
  ]);
  await app.patch(`/api/issues/${item.id}`, { assignee_id: null });
  [e] = await events(item.id);
  assert.deepEqual(e.changes[0], {
    field: 'assignee', label: 'Assignee', kind: 'user', old: users[1].name, new: null, old_id: users[1].id, new_id: null,
  });

  await app.patch(`/api/issues/${item.id}`, { epic_id: epic.id });
  [e] = await events(item.id);
  assert.equal(e.changes.length, 1);
  assert.equal(e.changes[0].field, 'epic');
  assert.equal(e.changes[0].kind, 'issue');
  assert.equal(e.changes[0].old, null, 'empty is null, not "None"');
  assert.equal(e.changes[0].new, `${epic.key} Big <b>epic</b>`);
  assert.equal(e.changes[0].new_id, epic.id);
  assert.equal(e.actor_name, me().name);
});

test('a multi-field PATCH is one event with one change per changed field (AC 2)', async () => {
  const { item } = await newItem();
  const before = eventCount(item.id);
  await app.patch(`/api/issues/${item.id}`, {
    title: 'New title',
    priority: OTHER_PRIORITY,
    assignee_id: users[2].id,
    type: item.type, // unchanged: not listed
  });
  assert.equal(eventCount(item.id), before + 1);
  assert.deepEqual(Object.keys(await latest(item.id)), ['title', 'priority', 'assignee']);
});

test('a PATCH that changes nothing writes no event (AC 3)', async () => {
  const { item } = await newItem({ description: 'd', assignee_id: null });
  const before = eventCount(item.id);
  assert.equal((await app.patch(`/api/issues/${item.id}`, {})).status, 200);
  const same = {
    title: item.title,
    type: item.type,
    status: item.status,
    priority: item.priority,
    assignee_id: item.assignee_id,
    epic_id: item.epic_id,
    description: item.description,
  };
  assert.equal((await app.patch(`/api/issues/${item.id}`, same)).status, 200);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { title: `  ${item.title}  ` })).status, 200, 'trimmed: same');
  assert.equal(eventCount(item.id), before);
});

test('rank is never recorded; a cross-column move records only the status (AC 4)', async () => {
  const { project, item } = await newItem();
  const other = await createItem(app, project.id);
  const before = eventCount(item.id);
  const otherBefore = eventCount(other.id);
  // Reorder within the column, including a collision that renumbers it.
  assert.equal((await app.patch(`/api/issues/${item.id}`, { rank: other.rank + 500 })).status, 200);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { rank: other.rank })).status, 200);
  assert.equal(eventCount(item.id), before);
  assert.equal(eventCount(other.id), otherBefore, 'renumbered neighbours get nothing');

  await app.patch(`/api/issues/${item.id}`, { status: MIDDLE, rank: 7 });
  assert.deepEqual(await latest(item.id), { status: [FIRST, MIDDLE] });
  const fields = app.db.prepare('SELECT DISTINCT field FROM issue_history_changes').all().map((r) => r.field);
  assert.ok(!fields.includes('rank'));
});

test('moving to and from the terminal status records the automatic resolution (AC 7)', async () => {
  const { item } = await newItem();
  await app.patch(`/api/issues/${item.id}`, { status: TERMINAL });
  assert.deepEqual(await latest(item.id), { status: [FIRST, TERMINAL], resolution: [null, defaultResolution()] });

  await app.patch(`/api/issues/${item.id}`, { resolution: OTHER_RESOLUTION });
  assert.deepEqual(await latest(item.id), { resolution: [defaultResolution(), OTHER_RESOLUTION] });

  await app.patch(`/api/issues/${item.id}`, { status: FIRST });
  assert.deepEqual(await latest(item.id), { status: [TERMINAL, FIRST], resolution: [OTHER_RESOLUTION, null] });
  assert.equal(eventCount(item.id), 4, 'created + three changes');
});

test('a swimlane drag records the lane field, with the status in the same event (AC 8)', async () => {
  const { project, item } = await newItem();
  const epic = await createItem(app, project.id, { type: EPIC_TYPE });
  // Assignee lane plus a column change.
  await app.patch(`/api/issues/${item.id}`, { status: MIDDLE, rank: 1000, assignee_id: users[3].id });
  assert.deepEqual(await latest(item.id), { status: [FIRST, MIDDLE], assignee: [null, users[3].name] });
  // Priority lane, same column.
  await app.patch(`/api/issues/${item.id}`, { status: MIDDLE, rank: 2000, priority: OTHER_PRIORITY });
  assert.deepEqual(await latest(item.id), { priority: [DEFAULT_PRIORITY, OTHER_PRIORITY] });
  // Epic lane.
  await app.patch(`/api/issues/${item.id}`, { status: MIDDLE, rank: 3000, epic_id: epic.id });
  assert.deepEqual(await latest(item.id), { epic: [null, `${epic.key} ${epic.title}`] });
});

test('deleting an epic records an epic change on each child, by the acting user (AC 9)', async () => {
  const { project } = await newItem();
  const epic = await createItem(app, project.id, { type: EPIC_TYPE, title: 'Parent' });
  const a = await createItem(app, project.id, { epic_id: epic.id });
  const b = await createItem(app, project.id, { epic_id: epic.id });
  const actor = users[1];
  assert.equal((await as(actor).del(`/api/issues/${epic.id}`)).status, 204);
  for (const child of [a, b]) {
    const [e] = await events(child.id);
    assert.equal(e.actor_id, actor.id);
    assert.equal(e.actor_name, actor.name);
    assert.deepEqual(e.changes, [
      { field: 'epic', label: e.changes[0].label, kind: 'issue', old: `${epic.key} Parent`, new: null, old_id: epic.id, new_id: null },
    ]);
  }
});

test('changing an epic to another type records an epic change on each child (AC 9)', async () => {
  const { project } = await newItem();
  const epic = await createItem(app, project.id, { type: EPIC_TYPE, title: 'Parent' });
  const child = await createItem(app, project.id, { epic_id: epic.id });
  const actor = users[2];
  assert.equal((await as(actor).patch(`/api/issues/${epic.id}`, { type: OTHER_TYPE })).status, 200);
  assert.deepEqual(await latest(epic.id), { type: [EPIC_TYPE, OTHER_TYPE] });
  const [e] = await events(child.id);
  assert.equal(e.actor_name, actor.name);
  assert.deepEqual(await latest(child.id), { epic: [`${epic.key} Parent`, null] });
});

test('deleting a work item deletes its history; its history is then 404 (AC 10)', async () => {
  const { item } = await newItem();
  await app.patch(`/api/issues/${item.id}`, { title: 'x' });
  assert.ok(eventCount(item.id) > 0 && changeCount(item.id) > 0);
  const changeIds = app.db
    .prepare('SELECT c.id FROM issue_history_changes c JOIN issue_history_events e ON e.id = c.event_id WHERE e.issue_id = ?')
    .all(item.id)
    .map((r) => r.id);
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  assert.equal(eventCount(item.id), 0);
  const left = app.db.prepare(`SELECT COUNT(*) AS n FROM issue_history_changes WHERE id IN (${changeIds.join(',')})`).get().n;
  assert.equal(left, 0);
  const res = await getHistory(item.id);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Work item not found.');
});

test('blocked writes on an archived project write nothing; its history stays readable (AC 11, 15)', async () => {
  const { project, item } = await newItem();
  await app.patch(`/api/issues/${item.id}`, { title: 'Before archive' });
  const archiveStatus = (await app.get('/api/project-statuses')).body.find((s) => s.archivable);
  const archived = await app.patch(`/api/projects/${project.id}`, { status: archiveStatus.name, archived: true });
  assert.equal(archived.status, 200);
  const before = eventCount(item.id);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { title: 'Blocked' })).status, 409);
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 409);
  assert.equal((await app.post(`/api/projects/${project.id}/issues`, { title: 'Blocked' })).status, 409);
  assert.equal(eventCount(item.id), before);
  const res = await getHistory(item.id);
  assert.equal(res.status, 200);
  assert.equal(res.body.events.length, before);
  assert.ok(res.body.events.every((e) => e.changes.every((c) => c.field !== 'archived')), 'no project events');
});

test('a failing write leaves the item unchanged and writes no event (AC 2)', async () => {
  const { item } = await newItem();
  const before = eventCount(item.id);
  // Validation fails after a valid field.
  assert.equal((await app.patch(`/api/issues/${item.id}`, { title: 'Changed', status: 'No such status' })).status, 400);
  // The recorder throws inside the update's transaction.
  const original = history.recordChanges;
  history.recordChanges = () => { throw new Error('injected failure'); };
  try {
    const res = await quietly(() => app.patch(`/api/issues/${item.id}`, { title: 'Changed', priority: OTHER_PRIORITY }));
    assert.equal(res.status, 500);
  } finally {
    history.recordChanges = original;
  }
  const now = (await app.get(`/api/issues/${item.id}`)).body;
  assert.equal(now.title, item.title);
  assert.equal(now.priority, item.priority);
  assert.equal(eventCount(item.id), before);
});

test('a failing created event rolls back the create (AC 1, 2)', async () => {
  const project = await createProject(app);
  const original = history.recordCreated;
  history.recordCreated = () => { throw new Error('injected failure'); };
  try {
    const res = await quietly(() => app.post(`/api/projects/${project.id}/issues`, { title: 'Never' }));
    assert.equal(res.status, 500);
  } finally {
    history.recordCreated = original;
  }
  assert.deepEqual((await app.get(`/api/projects/${project.id}/issues`)).body, []);
  const item = await createItem(app, project.id);
  assert.equal(item.number, 1, 'the number was not used up');
});

test('the actor comes from the signed-in user only (AC 12)', async () => {
  const { project, item } = await newItem();
  const actor = users[1];
  const spoof = { actor_id: users[3].id, actor_name: 'Mallory', user_id: users[3].id };
  await as(actor).patch(`/api/issues/${item.id}`, { title: 'By the session user', ...spoof });
  let [e] = await events(item.id);
  assert.equal(e.actor_id, actor.id);
  assert.equal(e.actor_name, actor.name);

  const created = (await as(actor).post(`/api/projects/${project.id}/issues`, { title: 'New', ...spoof })).body;
  [e] = await events(created.id);
  assert.equal(e.kind, 'created');
  assert.equal(e.actor_id, actor.id);
  assert.equal(e.actor_name, actor.name);
});

test('with no signed-in user the actor is Unknown (AC 12)', async () => {
  assert.deepEqual(actorFrom({}), { id: null, name: 'Unknown' });
  assert.deepEqual(actorFrom({ user: undefined }), { id: null, name: 'Unknown' });
  const u = users[2];
  assert.deepEqual(actorFrom({ user: { ...u, extra: 1 } }), { id: u.id, name: u.name });

  const { item } = await newItem();
  issues.updateIssue(app.db, item.id, { title: 'No session' }, undefined);
  const [e] = await events(item.id);
  assert.equal(e.actor_id, null);
  assert.equal(e.actor_name, 'Unknown');
  const row = app.db.prepare('SELECT actor_id, actor_name FROM issue_history_events WHERE id = ?').get(e.id);
  assert.deepEqual({ ...row }, { actor_id: null, actor_name: 'Unknown' });
});

test('history cannot be edited or deleted through the API (AC 13)', async () => {
  const { item } = await newItem();
  const [e] = await events(item.id);
  const before = eventCount(item.id);
  const urls = [`/api/issues/${item.id}/history`, `/api/issues/${item.id}/history/${e.id}`, `/api/history/${e.id}`];
  for (const url of urls) {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await app.request(method, url, method === 'DELETE' ? undefined : { kind: 'changed' });
      assert.ok([404, 405].includes(res.status), `${method} ${url} -> ${res.status}`);
    }
  }
  assert.equal(eventCount(item.id), before);
});

test('comments write no history (AC 14)', async () => {
  const { item } = await newItem();
  const before = eventCount(item.id);
  const c = (await app.post(`/api/issues/${item.id}/comments`, { body: 'hello' })).body;
  await app.patch(`/api/comments/${c.id}`, { body: 'edited' });
  await app.del(`/api/comments/${c.id}`);
  assert.equal(eventCount(item.id), before);
});

// ---------- reading ----------

// Adds n title changes straight through the data layer (faster than HTTP).
function addChanges(itemId, n, actor = me()) {
  for (let i = 0; i < n; i += 1) issues.updateIssue(app.db, itemId, { title: `Title ${i}` }, actor);
}

test('the history response shape, newest first (AC 15)', async () => {
  const { item } = await newItem();
  await app.patch(`/api/issues/${item.id}`, { title: 'One' });
  await app.patch(`/api/issues/${item.id}`, { status: TERMINAL });
  const res = await getHistory(item.id);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['events', 'has_more']);
  assert.equal(res.body.has_more, false);
  const list = res.body.events;
  assert.deepEqual(list.map((e) => e.kind), ['changed', 'changed', 'created']);
  const ids = list.map((e) => e.id);
  assert.deepEqual(ids, [...ids].sort((x, y) => y - x), 'by id descending');
  for (const e of list) {
    assert.deepEqual(Object.keys(e).sort(), ['actor_id', 'actor_name', 'changes', 'created_at', 'id', 'kind']);
    assert.match(e.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    for (const c of e.changes) {
      assert.deepEqual(Object.keys(c).sort(), ['field', 'kind', 'label', 'new', 'new_id', 'old', 'old_id']);
      assert.ok(['text', 'long', 'user', 'issue'].includes(c.kind));
    }
  }
  assert.deepEqual(list[0].changes.map((c) => c.field), ['status', 'resolution']);
});

test('unknown or non-numeric ids return 404 (AC 15)', async () => {
  for (const id of ['999999', 'abc', '0', '-1', '1.5']) {
    const res = await getHistory(id);
    assert.equal(res.status, 404, id);
    assert.equal(res.body.error, 'Work item not found.');
  }
});

test('limit: default 50, clamped to 200, invalid values are 400 (AC 16)', async () => {
  const { item } = await newItem();
  addChanges(item.id, 210);
  let res = await getHistory(item.id);
  assert.equal(res.body.events.length, 50);
  assert.equal(res.body.has_more, true);
  res = await getHistory(item.id, '?limit=1000');
  assert.equal(res.status, 200);
  assert.equal(res.body.events.length, 200);
  assert.equal(res.body.has_more, true);
  res = await getHistory(item.id, '?limit=7');
  assert.equal(res.body.events.length, 7);
  for (const bad of ['0', '-1', '1.5', 'abc', '', '1e2']) {
    assert.equal((await getHistory(item.id, `?limit=${bad}`)).status, 400, `limit=${bad}`);
  }
  assert.equal((await getHistory(item.id, '?limit=1&limit=2')).status, 400, 'repeated');
  assert.equal((await getHistory(item.id, '?before=abc')).status, 400);
});

test('paging with before visits every event exactly once (AC 16, 24)', async () => {
  const { item } = await newItem();
  addChanges(item.id, 119); // 120 events with the created one
  const all = [];
  const pages = [];
  let query = '';
  for (;;) {
    const { body } = await getHistory(item.id, query);
    pages.push(body.events.length);
    all.push(...body.events);
    if (!body.has_more) break;
    query = `?before=${body.events[body.events.length - 1].id}`;
  }
  assert.deepEqual(pages, [50, 50, 20]);
  assert.equal(all.length, 120);
  assert.equal(new Set(all.map((e) => e.id)).size, 120, 'no duplicates');
  assert.equal(all[all.length - 1].kind, 'created');
  const ids = all.map((e) => e.id);
  assert.deepEqual(ids, [...ids].sort((x, y) => y - x));

  // Exactly one page: has_more is false at the boundary.
  const { item: small } = await newItem();
  addChanges(small.id, 4); // 5 events
  assert.equal((await getHistory(small.id, '?limit=5')).body.has_more, false);
  assert.equal((await getHistory(small.id, '?limit=4')).body.has_more, true);
});

test('field filters events and their changes, and excludes created events (AC 17)', async () => {
  const { item } = await newItem();
  await app.patch(`/api/issues/${item.id}`, { title: 'A', priority: OTHER_PRIORITY });
  await app.patch(`/api/issues/${item.id}`, { status: TERMINAL });
  await app.patch(`/api/issues/${item.id}`, { title: 'B' });
  await app.patch(`/api/issues/${item.id}`, { resolution: OTHER_RESOLUTION });

  let list = await events(item.id, '?field=title');
  assert.equal(list.length, 2);
  assert.ok(list.every((e) => e.changes.length === 1 && e.changes[0].field === 'title'));
  list = await events(item.id, '?field=resolution');
  assert.deepEqual(list.map((e) => e.changes.map((c) => [c.old, c.new])), [
    [[defaultResolution(), OTHER_RESOLUTION]],
    [[null, defaultResolution()]],
  ]);
  assert.ok(!list.some((e) => e.kind === 'created'));
  assert.deepEqual(await events(item.id, '?field=assignee'), []);

  const page = (await getHistory(item.id, '?field=title&limit=1')).body;
  assert.equal(page.has_more, true);
  const rest = (await getHistory(item.id, `?field=title&limit=1&before=${page.events[0].id}`)).body;
  assert.equal(rest.events.length, 1);
  assert.equal(rest.has_more, false);

  for (const bad of ['bogus', 'rank', 'assignee_id']) {
    const res = await getHistory(item.id, `?field=${bad}`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, `Unknown field: ${bad}`);
  }
});

test('GET /api/history-fields lists the fields in display order (AC 18)', async () => {
  const res = await app.get('/api/history-fields');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, publicFields());
  assert.deepEqual(res.body.map((f) => f.key), ['type', 'title', 'description', 'status', 'priority', 'assignee', 'epic', 'resolution', 'link', 'attachment']);
  for (const f of res.body) assert.deepEqual(Object.keys(f).sort(), ['key', 'kind', 'label']);
  assert.ok(!res.body.some((f) => f.key === 'rank'));
});

// ---------- extensibility ----------

test('every updatable column except rank has a history field (AC 28)', () => {
  const tracked = new Set(HISTORY_FIELDS.map((f) => f.column));
  const missing = issues.UPDATABLE.filter((c) => c !== 'rank' && !tracked.has(c));
  assert.deepEqual(missing, []);
  assert.ok(!tracked.has('rank'));
  // A field with no issues column (links, docs/specs/work-item-links.md AC 19)
  // is recorded by its own code and is not required to be updatable.
  for (const f of HISTORY_FIELDS.filter((x) => x.column)) {
    assert.ok(issues.UPDATABLE.includes(f.column), `${f.key} tracks an updatable column`);
  }
});
