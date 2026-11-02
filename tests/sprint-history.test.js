// The sprint audit log (docs/specs/sprints-and-backlog.md AC 41-46, Decision 18).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const { terminalStatus } = require('../server/statuses');
const { SPRINT_EVENT_KINDS, SPRINT_HISTORY_FIELDS, EVENT, publicSprintEventKinds } = require('../server/sprintEvents');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const sprintHistoryData = require('../server/data/sprintHistory');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();

let app;
let ids;
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
});
test.after(async () => { await app.close(); });
test.beforeEach(() => {
  for (const [username, id] of Object.entries(ids)) usersData.setUserGroup(app.db, id, username === 'alex' ? ADMIN : MEMBER);
});

const historyOf = async (projectId, query = '') => (await app.get(`/api/projects/${projectId}/sprint-history${query}`)).body;
const eventCount = () => app.db.prepare('SELECT COUNT(*) AS n FROM sprint_events').get().n;

test('GET /api/sprint-event-kinds lists the kinds and the tracked fields (AC 44)', async () => {
  const res = await app.get('/api/sprint-event-kinds');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, publicSprintEventKinds());
  assert.deepEqual(res.body.kinds.map((k) => k.key), ['created', 'edited', 'started', 'completed', 'deleted']);
  assert.deepEqual(res.body.fields.map((f) => f.key), ['name', 'goal', 'start_date', 'end_date']);
  assert.deepEqual(res.body.fields.map((f) => f.label), SPRINT_HISTORY_FIELDS.map((f) => f.label));
  assert.equal(SPRINT_EVENT_KINDS.length, Object.keys(EVENT).length);
});

test('each kind is recorded with the signed-in actor, newest first (AC 42, 43)', async () => {
  const p = await createProject(app);
  const blake = await app.client('blake');
  const s = (await blake.post(`/api/projects/${p.id}/sprints`, { name: 'Sprint 3', actor_name: 'Mallory', actor_id: 1 })).body;
  await blake.patch(`/api/sprints/${s.id}`, { goal: 'Ship', end_date: '2026-11-30' });
  await blake.patch(`/api/sprints/${s.id}`, { goal: 'Ship' }); // nothing changed: no event
  await blake.post(`/api/sprints/${s.id}/start`);
  const done = await createItem(app, p.id, { sprint_id: s.id });
  await app.patch(`/api/issues/${done.id}`, { status: terminalStatus() });
  await createItem(app, p.id, { sprint_id: s.id });
  await createItem(app, p.id, { sprint_id: s.id });
  const res = await blake.post(`/api/sprints/${s.id}/complete`, { disposition: 'new-sprint' });
  const created = res.body.created_sprint;
  const doomed = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'Doomed' })).body;
  await createItem(app, p.id, { sprint_id: doomed.id });
  await app.del(`/api/sprints/${doomed.id}`);

  const body = await historyOf(p.id);
  assert.deepEqual(Object.keys(body).sort(), ['events', 'has_more']);
  const events = body.events;
  assert.deepEqual(events.map((e) => [e.kind, e.sprint_name]), [
    ['deleted', 'Doomed'],
    ['created', 'Doomed'],
    ['completed', 'Sprint 3'],
    ['created', 'Sprint 4'],
    ['started', 'Sprint 3'],
    ['edited', 'Sprint 3'],
    ['created', 'Sprint 3'],
  ]);
  const by = (kind, name) => events.find((e) => e.kind === kind && e.sprint_name === name);
  for (const e of events.slice(2)) assert.equal(e.actor_name, 'Blake Chen', `${e.kind}: from req.user, never the body`);
  assert.equal(by('deleted', 'Doomed').actor_name, 'Alex Morgan');
  const edited = by('edited', 'Sprint 3');
  assert.deepEqual(edited.changes, [
    { field: 'goal', label: 'Goal', old: null, new: 'Ship' },
    { field: 'end_date', label: 'End date', old: null, new: '2026-11-30' },
  ]);
  const completed = by('completed', 'Sprint 3');
  assert.deepEqual(
    [completed.disposition, completed.done_count, completed.item_count, completed.target_sprint_id, completed.target_sprint_name],
    ['new-sprint', 1, 2, created.id, 'Sprint 4']
  );
  assert.equal(by('deleted', 'Doomed').item_count, 1);
  assert.equal(by('deleted', 'Doomed').sprint_id, doomed.id, 'the event outlives the sprint');
  for (const e of events) {
    assert.match(e.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    for (const k of ['id', 'kind', 'sprint_id', 'sprint_name', 'actor_name', 'created_at', 'changes']) assert.ok(k in e, k);
  }
});

test('completing to the backlog records no target (AC 13, 42)', async () => {
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).body;
  await app.post(`/api/sprints/${s.id}/start`);
  await createItem(app, p.id, { sprint_id: s.id });
  await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  const [e] = (await historyOf(p.id)).events;
  assert.deepEqual([e.kind, e.disposition, e.done_count, e.item_count, e.target_sprint_id, e.target_sprint_name], ['completed', 'backlog', 0, 1, null, null]);
});

test('refused requests record nothing (AC 42)', async () => {
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).body;
  const before = eventCount();
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  const refused = [
    await viewer.post(`/api/projects/${p.id}/sprints`, { name: 'x' }), // 403
    await app.patch('/api/sprints/999999', { name: 'x' }), // 404
    await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' }), // 409 not active
    await app.patch(`/api/sprints/${s.id}`, { name: '' }), // 400
    await app.post(`/api/projects/${p.id}/sprints`, { name: 'ok', end_date: 'soon' }), // 400
  ];
  assert.deepEqual(refused.map((r) => r.status), [403, 404, 409, 400, 400]);
  assert.equal(eventCount(), before);
});

test('an event rolls back with its write (AC 42)', async () => {
  const p = await createProject(app);
  const original = sprintHistoryData.recordSprintEvent;
  sprintHistoryData.recordSprintEvent = (db, actor, sprint, kind, ...rest) => {
    original(db, actor, sprint, kind, ...rest);
    throw new Error('boom after the event was written');
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await app.post(`/api/projects/${p.id}/sprints`, { name: 'Ghost' })).status, 500);
  } finally {
    sprintHistoryData.recordSprintEvent = original;
    console.error = quiet;
  }
  assert.deepEqual((await app.get(`/api/projects/${p.id}/sprints`)).body, []);
  assert.deepEqual((await historyOf(p.id)).events, []);
});

test('paging: limit (default 50, max 100) and before (AC 43)', async () => {
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'Pager' })).body;
  for (let i = 0; i < 104; i += 1) await app.patch(`/api/sprints/${s.id}`, { goal: `g${i}` });
  let page = await historyOf(p.id);
  assert.equal(page.events.length, 50);
  assert.equal(page.has_more, true);
  page = await historyOf(p.id, '?limit=500');
  assert.equal(page.events.length, 100, 'capped at 100');
  const first = await historyOf(p.id, '?limit=3');
  const second = await historyOf(p.id, `?limit=3&before=${first.events[2].id}`);
  assert.ok(second.events.every((e) => e.id < first.events[2].id));
  assert.equal(second.events.length, 3);
  const last = await historyOf(p.id, `?before=${first.events[0].id - 103}`);
  assert.deepEqual(last.events.map((e) => e.kind), ['created']);
  assert.equal(last.has_more, false);
  for (const bad of ['?limit=0', '?limit=x', '?before=-1']) assert.equal((await app.get(`/api/projects/${p.id}/sprint-history${bad}`)).status, 400, bad);
});

test('readable by Viewers and on archived projects; 404 and 401 (AC 43, 45)', async () => {
  const p = await createProject(app, { status: 'Completed' });
  await app.post(`/api/projects/${p.id}/sprints`, { name: 'Kept' });
  await app.patch(`/api/projects/${p.id}`, { archived: true });
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  const res = await viewer.get(`/api/projects/${p.id}/sprint-history`);
  assert.equal(res.status, 200);
  assert.equal(res.body.events.length, 1);
  assert.equal((await app.get('/api/projects/999999/sprint-history')).status, 404);
  assert.equal((await app.raw('GET', `/api/projects/${p.id}/sprint-history`)).status, 401);
});

test('events are append-only: no write route on the history (AC 41)', async () => {
  const p = await createProject(app);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal((await app.request(method, `/api/projects/${p.id}/sprint-history`, {})).status, 404, method);
  }
});
