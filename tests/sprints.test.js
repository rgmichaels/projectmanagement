// Sprints and backlog: sprint endpoints, membership and ordering, history of
// sprint changes, permissions and archived projects
// (docs/specs/sprints-and-backlog.md AC 1-3, 5, 7-23, 39-40, 47-49).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, tempDbPath, createProject, createItem } = require('./helpers');
const { openDb } = require('../server/db');
const { STATUSES, terminalStatus, defaultStatus } = require('../server/statuses');
const { TYPES, defaultType } = require('../server/types');
const { defaultResolution } = require('../server/resolutions');
const { SPRINT_STATES, initialSprintState, activeSprintState, finalSprintState } = require('../server/sprintStates');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const sprintHistoryData = require('../server/data/sprintHistory');

const EPIC = TYPES.find((t) => t.isEpic).name;
const OTHER_TYPE = TYPES.find((t) => !t.isEpic && t.name !== defaultType()).name;
const MIDDLE = STATUSES[2];
const DONE = terminalStatus();
const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const ARCHIVED_MESSAGE = 'This project is archived; its work items are read-only.';
const VIEWER_MESSAGE = `Your group (${VIEWER}) is not allowed to edit work items.`;

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

async function viewer() {
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  return app.client('casey');
}

async function newSprint(projectId, fields = {}) {
  const res = await app.post(`/api/projects/${projectId}/sprints`, { name: 'Sprint X', ...fields });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function activeSprint(projectId, fields = {}) {
  const s = await newSprint(projectId, fields);
  const res = await app.post(`/api/sprints/${s.id}/start`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

const getItem = async (id) => (await app.get(`/api/issues/${id}`)).body;
const sprintsOf = async (projectId) => (await app.get(`/api/projects/${projectId}/sprints`)).body;
const container = async (projectId, sprint) => (await app.get(`/api/projects/${projectId}/issues?sprint=${sprint}`)).body;
const keys = (list) => list.map((i) => i.key);
const archive = (projectId) => app.patch(`/api/projects/${projectId}`, { status: 'Completed', archived: true });
const historyOf = async (id) => (await app.get(`/api/issues/${id}/history`)).body.events;
const sprintChanges = async (id) =>
  (await historyOf(id)).flatMap((e) => e.changes.filter((c) => c.field === 'sprint').map((c) => ({ ...c, actor: e.actor_name })));

// Every table a sprint write can touch, to show a refused request changed nothing.
const TABLES = ['issues', 'sprints', 'sprint_events', 'sprint_event_changes', 'issue_history_events', 'issue_history_changes'];
const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, app.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));

// ---------- data model (AC 1-3, 5) ----------

test('the sprints table, issue columns and indexes exist with no CHECK (AC 1-3)', () => {
  const db = openDb(tempDbPath());
  const cols = db.prepare('PRAGMA table_info(sprints)').all().map((c) => c.name);
  assert.deepEqual(cols, ['id', 'project_id', 'name', 'goal', 'start_date', 'end_date', 'state', 'created_at', 'started_at', 'completed_at']);
  const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'sprints'").get();
  assert.doesNotMatch(sql, /CHECK/i);
  assert.match(sql, /goal TEXT NOT NULL DEFAULT ''/);
  const issueCols = db.prepare('PRAGMA table_info(issues)').all().map((c) => c.name);
  assert.ok(issueCols.includes('sprint_id') && issueCols.includes('sprint_rank'));
  const index = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_sprints_one_active'").get();
  assert.match(index.sql, /UNIQUE INDEX/);
  assert.ok(index.sql.includes(`'${activeSprintState()}'`), 'the state name comes from sprintStates.js');
  // The index refuses a second active sprint in one project, not in another.
  const now = new Date().toISOString();
  db.prepare("INSERT INTO projects (name, key, created_at) VALUES ('A', 'AA', ?), ('B', 'BB', ?)").run(now, now);
  const insert = db.prepare("INSERT INTO sprints (project_id, name, state, created_at) VALUES (?, 'S', ?, ?)");
  insert.run(1, activeSprintState(), now);
  assert.throws(() => insert.run(1, activeSprintState(), now), /UNIQUE/);
  insert.run(2, activeSprintState(), now);
  insert.run(1, initialSprintState(), now);
  insert.run(1, initialSprintState(), now);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprints').get().n, 4);
  db.close();
});

test('a fresh database has no sprints, also after reopening (AC 5)', () => {
  const dbPath = tempDbPath();
  for (let pass = 0; pass < 2; pass++) {
    const db = openDb(dbPath);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprints').get().n, 0);
    db.close();
  }
});

test('the sprint state list has one initial, one active and one final state', () => {
  for (const flag of ['initial', 'active', 'final']) assert.equal(SPRINT_STATES.filter((s) => s[flag]).length, 1, flag);
});

// ---------- list, create, next name (AC 7, 8, 15, 16) ----------

test('a new project has no sprint and an empty backlog (Decision 10)', async () => {
  const p = await createProject(app);
  assert.deepEqual(await sprintsOf(p.id), []);
  assert.deepEqual(await container(p.id, 'backlog'), []);
});

test('POST creates a sprint in the initial state; fields are trimmed and validated (AC 8)', async () => {
  const p = await createProject(app);
  const res = await app.post(`/api/projects/${p.id}/sprints`, { name: '  Alpha  ', goal: ' Ship it ', start_date: '2026-11-01', end_date: '2026-11-14' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Alpha');
  assert.equal(res.body.goal, 'Ship it');
  assert.equal(res.body.state, initialSprintState());
  assert.equal(res.body.start_date, '2026-11-01');
  assert.equal(res.body.end_date, '2026-11-14');
  assert.equal(res.body.started_at, null);
  assert.equal(res.body.item_count, 0);
  assert.equal(res.body.done_count, 0);
  const minimal = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'B' })).body;
  assert.equal(minimal.goal, '');
  assert.equal(minimal.start_date, null);
  const bad = [
    [{}, /Name is required/],
    [{ name: '   ' }, /Name is required/],
    [{ name: 'x'.repeat(81) }, /1-80/],
    [{ name: 'ok', goal: 'g'.repeat(501) }, /at most 500/],
    [{ name: 'ok', goal: 5 }, /Goal must be text/],
    [{ name: 'ok', start_date: '2026-13-01' }, /Start date must be a date/],
    [{ name: 'ok', end_date: '2026-02-30' }, /End date must be a date/],
    [{ name: 'ok', end_date: '26-1-1' }, /End date must be a date/],
    [{ name: 'ok', start_date: '2026-11-05', end_date: '2026-11-04' }, /must not be before/],
    [{ name: 'ok', state: activeSprintState() }, /state cannot be changed/],
  ];
  for (const [body, message] of bad) {
    const r = await app.post(`/api/projects/${p.id}/sprints`, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.body.error, message);
  }
  assert.ok((await app.post(`/api/projects/${p.id}/sprints`, { name: 'x'.repeat(80), start_date: '2026-11-05', end_date: '2026-11-05' })).status === 201);
  assert.equal((await app.post('/api/projects/999999/sprints', { name: 'x' })).status, 404);
});

test('GET sprints: active first, planned by id, completed newest first, with counts excluding epics (AC 7)', async () => {
  const p = await createProject(app);
  const c1 = await activeSprint(p.id, { name: 'C1' });
  await app.post(`/api/sprints/${c1.id}/complete`, { disposition: 'backlog' });
  const c2 = await activeSprint(p.id, { name: 'C2' });
  await app.post(`/api/sprints/${c2.id}/complete`, { disposition: 'backlog' });
  const p1 = await newSprint(p.id, { name: 'P1' });
  const a = await activeSprint(p.id, { name: 'A' });
  const p2 = await newSprint(p.id, { name: 'P2' });
  await createItem(app, p.id, { sprint_id: a.id });
  const done = await createItem(app, p.id, { sprint_id: a.id });
  await app.patch(`/api/issues/${done.id}`, { status: DONE });
  await createItem(app, p.id, { type: EPIC }); // never counted
  const list = await sprintsOf(p.id);
  assert.deepEqual(list.map((s) => s.name), ['A', 'P1', 'P2', 'C2', 'C1']);
  assert.deepEqual([list[0].item_count, list[0].done_count], [2, 1]);
  assert.deepEqual(list.map((s) => s.state), [activeSprintState(), initialSprintState(), initialSprintState(), finalSprintState(), finalSprintState()]);
  assert.ok(p1.id < p2.id);
  assert.equal((await app.get('/api/projects/999999/sprints')).status, 404);
  assert.equal((await app.raw('GET', `/api/projects/${p.id}/sprints`)).status, 401);
  await archive(p.id);
  assert.equal((await app.get(`/api/projects/${p.id}/sprints`)).status, 200, 'readable when archived');
});

test('GET /api/sprint-states lists the states with their flags (AC 15)', async () => {
  const res = await app.get('/api/sprint-states');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, SPRINT_STATES.map((s) => ({ name: s.name, initial: Boolean(s.initial), active: Boolean(s.active), final: Boolean(s.final) })));
});

test('next-name is one more than the largest "Sprint <n>", or Sprint 1 (AC 16)', async () => {
  const p = await createProject(app);
  const next = async () => (await app.get(`/api/projects/${p.id}/sprints/next-name`)).body.name;
  assert.equal(await next(), 'Sprint 1');
  await newSprint(p.id, { name: 'Sprint 3' });
  await newSprint(p.id, { name: 'Sprint 10' });
  await newSprint(p.id, { name: 'Sprint 12a' });
  await newSprint(p.id, { name: 'Release' });
  assert.equal(await next(), 'Sprint 11');
  assert.equal((await app.get('/api/projects/999999/sprints/next-name')).status, 404);
  await archive(p.id);
  assert.equal((await app.get(`/api/projects/${p.id}/sprints/next-name`)).status, 200);
});

// ---------- edit (AC 9) ----------

test('PATCH edits name, goal and dates of a planned or active sprint; never the state (AC 9)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id, { name: 'One', start_date: '2026-11-01' });
  let res = await app.patch(`/api/sprints/${s.id}`, { name: ' Two ', goal: 'Goal', end_date: '2026-11-10' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.name, res.body.goal, res.body.start_date, res.body.end_date], ['Two', 'Goal', '2026-11-01', '2026-11-10']);
  res = await app.patch(`/api/sprints/${s.id}`, { end_date: '2026-10-01' });
  assert.equal(res.status, 400, 'checked against the stored start date');
  res = await app.patch(`/api/sprints/${s.id}`, { state: activeSprintState() });
  assert.equal(res.status, 400);
  assert.equal((await sprintsOf(p.id))[0].state, initialSprintState());
  res = await app.patch(`/api/sprints/${s.id}`, { start_date: null, end_date: '' });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.start_date, res.body.end_date], [null, null]);
  await app.post(`/api/sprints/${s.id}/start`);
  assert.equal((await app.patch(`/api/sprints/${s.id}`, { goal: 'Active edit' })).status, 200);
  await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  res = await app.patch(`/api/sprints/${s.id}`, { name: 'Late' });
  assert.equal(res.status, 409);
  assert.equal((await app.patch('/api/sprints/999999', { name: 'x' })).status, 404);
});

// ---------- delete (AC 10) ----------

test('DELETE a planned sprint returns its items to the bottom of the backlog in order (AC 10)', async () => {
  const p = await createProject(app);
  const b1 = await createItem(app, p.id, { title: 'b1' });
  const s = await newSprint(p.id, { name: 'Doomed' });
  const s1 = await createItem(app, p.id, { title: 's1', sprint_id: s.id });
  const s2 = await createItem(app, p.id, { title: 's2', sprint_id: s.id });
  await app.patch(`/api/issues/${s2.id}`, { sprint_rank: (await getItem(s1.id)).sprint_rank - 1 }); // s2 before s1
  const res = await app.del(`/api/sprints/${s.id}`);
  assert.equal(res.status, 204);
  assert.deepEqual(keys(await container(p.id, 'backlog')), [b1.key, s2.key, s1.key]);
  assert.deepEqual(await sprintsOf(p.id), []);
  const changes = await sprintChanges(s1.id);
  assert.equal(changes.length, 1);
  assert.deepEqual([changes[0].old, changes[0].new, changes[0].old_id, changes[0].new_id], ['Doomed', 'Backlog', s.id, null]);
  assert.equal(changes[0].actor, 'Alex Morgan');
  // Only planned sprints can be deleted.
  const a = await activeSprint(p.id);
  assert.equal((await app.del(`/api/sprints/${a.id}`)).status, 409);
  await app.post(`/api/sprints/${a.id}/complete`, { disposition: 'backlog' });
  assert.equal((await app.del(`/api/sprints/${a.id}`)).status, 409);
  assert.equal((await app.del('/api/sprints/999999')).status, 404);
});

// ---------- start (AC 11, 14) ----------

test('start: one active sprint per project, empty sprints allowed, only planned ones (AC 11, Decision 1)', async () => {
  const p = await createProject(app);
  const s1 = await newSprint(p.id, { name: 'S1' });
  const s2 = await newSprint(p.id, { name: 'S2' });
  let res = await app.post(`/api/sprints/${s1.id}/start`);
  assert.equal(res.status, 200);
  assert.equal(res.body.state, activeSprintState());
  assert.ok(res.body.started_at);
  res = await app.post(`/api/sprints/${s2.id}/start`);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'Complete the active sprint first.');
  assert.equal((await app.post(`/api/sprints/${s1.id}/start`)).status, 409, 'not planned');
  // Another project is independent.
  const other = await createProject(app);
  await activeSprint(other.id);
  // After completing, the next planned sprint may start (AC 14).
  res = await app.post(`/api/sprints/${s1.id}/complete`, { disposition: 'backlog' });
  assert.equal(res.status, 200);
  assert.equal((await sprintsOf(p.id)).filter((s) => s.state === activeSprintState()).length, 0);
  assert.deepEqual(await container(p.id, 'active'), []);
  assert.equal((await app.post(`/api/sprints/${s2.id}/start`)).status, 200);
  assert.equal((await app.post(`/api/sprints/${s1.id}/start`)).status, 409, 'completed');
});

// ---------- complete (AC 12-14) ----------

async function sprintWithWork(name = 'Run') {
  const p = await createProject(app);
  const s = await activeSprint(p.id, { name });
  const u1 = await createItem(app, p.id, { title: 'u1', sprint_id: s.id });
  const d1 = await createItem(app, p.id, { title: 'd1', sprint_id: s.id });
  const u2 = await createItem(app, p.id, { title: 'u2', sprint_id: s.id });
  await app.patch(`/api/issues/${u2.id}`, { status: MIDDLE, assignee_id: ids.dana });
  await app.patch(`/api/issues/${d1.id}`, { status: DONE });
  const backlog = await createItem(app, p.id, { title: 'b' });
  return { p, s, u1, d1, u2, backlog };
}

test('complete to the backlog: unfinished to the top in order, done items stay (AC 12, 13)', async () => {
  const { p, s, u1, d1, u2, backlog } = await sprintWithWork();
  const bob = await app.client('blake');
  const res = await bob.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog', actor: 'Somebody Else' });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['moved', 'sprint']);
  assert.equal(res.body.sprint.state, finalSprintState());
  assert.ok(res.body.sprint.completed_at);
  assert.deepEqual(res.body.moved, { count: 2, to: null });
  assert.deepEqual(keys(await container(p.id, 'backlog')), [u1.key, u2.key, backlog.key]);
  assert.deepEqual(keys(await container(p.id, s.id)), [d1.key]);
  const moved = await getItem(u2.id);
  assert.equal(moved.status, MIDDLE, 'status kept');
  assert.equal(moved.assignee_id, ids.dana, 'assignee kept');
  const changes = await sprintChanges(u1.id);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].actor, 'Blake Chen', 'attributed to the signed-in user');
  assert.deepEqual((await sprintChanges(d1.id)).length, 0);
});

test('complete to the next sprint: bottom of the planned sprint, order kept (AC 12)', async () => {
  const { p, s, u1, u2 } = await sprintWithWork();
  const next = await newSprint(p.id, { name: 'Next' });
  const already = await createItem(app, p.id, { sprint_id: next.id });
  const res = await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'next-sprint', next_sprint_id: next.id });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.moved, { count: 2, to: next.id });
  assert.deepEqual(keys(await container(p.id, next.id)), [already.key, u1.key, u2.key]);
  assert.deepEqual((await sprintChanges(u1.id))[0].new, 'Next');
});

test('complete to a new sprint: created in the same step with the default or given name (AC 12, 13, 16)', async () => {
  const one = await sprintWithWork('Sprint 4');
  let res = await app.post(`/api/sprints/${one.s.id}/complete`, { disposition: 'new-sprint' });
  assert.equal(res.status, 200);
  assert.equal(res.body.created_sprint.name, 'Sprint 5');
  assert.equal(res.body.created_sprint.state, initialSprintState());
  assert.equal(res.body.moved.to, res.body.created_sprint.id);
  assert.equal(res.body.created_sprint.item_count, 2);
  assert.deepEqual(keys(await container(one.p.id, res.body.created_sprint.id)), [one.u1.key, one.u2.key]);

  const two = await sprintWithWork();
  res = await app.post(`/api/sprints/${two.s.id}/complete`, { disposition: 'new-sprint', new_sprint_name: '  Hardening  ' });
  assert.equal(res.body.created_sprint.name, 'Hardening');
  const three = await sprintWithWork();
  res = await app.post(`/api/sprints/${three.s.id}/complete`, { disposition: 'new-sprint', new_sprint_name: '   ' });
  assert.equal(res.body.created_sprint.name, 'Sprint 1', 'blank uses the default');
});

test('complete validates the sprint state and the body; refusals change nothing (AC 12)', async () => {
  const { p, s } = await sprintWithWork();
  const otherProject = await createProject(app);
  const foreign = await newSprint(otherProject.id);
  const planned = await newSprint(p.id);
  const before = snapshot();
  const cases = [
    [{}, 400],
    [{ disposition: 'trash' }, 400],
    [{ disposition: 'next-sprint' }, 400],
    [{ disposition: 'next-sprint', next_sprint_id: foreign.id }, 400],
    [{ disposition: 'next-sprint', next_sprint_id: s.id }, 400],
    [{ disposition: 'next-sprint', next_sprint_id: 999999 }, 400],
    [{ disposition: 'new-sprint', new_sprint_name: 'x'.repeat(81) }, 400],
  ];
  for (const [body, status] of cases) {
    const res = await app.post(`/api/sprints/${s.id}/complete`, body);
    assert.equal(res.status, status, JSON.stringify(body));
  }
  assert.equal((await app.post(`/api/sprints/${planned.id}/complete`, { disposition: 'backlog' })).status, 409, 'not active');
  assert.equal((await app.post('/api/sprints/999999/complete', { disposition: 'backlog' })).status, 404);
  assert.deepEqual(snapshot(), before);
});

test('complete runs in one transaction: a failure part-way changes nothing, events included (AC 12)', async () => {
  const { p, s } = await sprintWithWork();
  const original = sprintHistoryData.recordSprintEvent;
  const before = snapshot();
  let calls = 0;
  // Fail on the last write (the completed event), after the new sprint, its
  // created event and every move have been written.
  sprintHistoryData.recordSprintEvent = (...args) => {
    calls += 1;
    if (calls === 2) throw new Error('disk full');
    return original(...args);
  };
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'new-sprint' });
    assert.equal(res.status, 500);
  } finally {
    sprintHistoryData.recordSprintEvent = original;
    console.error = quiet;
  }
  assert.equal(calls, 2);
  assert.deepEqual(snapshot(), before);
  assert.equal((await sprintsOf(p.id))[0].state, activeSprintState());
});

test('complete with nothing unfinished moves nothing (AC 12, 36)', async () => {
  const p = await createProject(app);
  const s = await activeSprint(p.id);
  const d = await createItem(app, p.id, { sprint_id: s.id });
  await app.patch(`/api/issues/${d.id}`, { status: DONE });
  const res = await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  assert.deepEqual(res.body.moved, { count: 0, to: null });
  assert.equal(res.body.sprint.done_count, 1);
});

// ---------- work item membership (AC 17-23) ----------

test('items carry sprint_id and sprint_rank; ?sprint= filters and never returns epics (AC 17)', async () => {
  const p = await createProject(app);
  const s = await activeSprint(p.id);
  const planned = await newSprint(p.id);
  const epic = await createItem(app, p.id, { type: EPIC });
  const inActive = await createItem(app, p.id, { sprint_id: s.id, epic_id: epic.id });
  const inPlanned = await createItem(app, p.id, { sprint_id: planned.id });
  const inBacklog = await createItem(app, p.id);
  const all = (await app.get(`/api/projects/${p.id}/issues`)).body;
  assert.equal(all.length, 4, 'the full list still includes epics');
  for (const i of all) assert.ok('sprint_id' in i && 'sprint_rank' in i);
  const e = all.find((i) => i.id === epic.id);
  assert.deepEqual([e.sprint_id, e.sprint_rank], [null, null]);
  assert.deepEqual(keys(await container(p.id, 'active')), [inActive.key]);
  assert.deepEqual(keys(await container(p.id, 'backlog')), [inBacklog.key]);
  assert.deepEqual(keys(await container(p.id, planned.id)), [inPlanned.key]);
  for (const bad of ['all', '0', '-1', 'x1']) {
    assert.equal((await app.get(`/api/projects/${p.id}/issues?sprint=${bad}`)).status, 400, bad);
  }
  const empty = await createProject(app);
  assert.deepEqual(await container(empty.id, 'active'), [], 'no active sprint');
});

test('create puts the item at the bottom of its container; separate sequences (AC 21, Decision 15)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id);
  const a = await createItem(app, p.id);
  const b = await createItem(app, p.id, { sprint_id: null });
  const c = await createItem(app, p.id, { sprint_id: s.id });
  const d = await createItem(app, p.id, { sprint_id: s.id });
  assert.deepEqual([a.sprint_id, b.sprint_id, c.sprint_id], [null, null, s.id]);
  assert.ok(b.sprint_rank > a.sprint_rank);
  assert.ok(d.sprint_rank > c.sprint_rank);
  assert.equal(c.sprint_rank, a.sprint_rank, 'each container starts its own sequence');
  assert.equal(c.status, defaultStatus());
  // Creating straight into a sprint records only the created event (AC 39).
  const events = await historyOf(c.id);
  assert.deepEqual(events.map((e) => e.kind), ['created']);
  // Epics: no sprint (400), and null columns without one.
  let res = await app.post(`/api/projects/${p.id}/issues`, { title: 'E', type: EPIC, sprint_id: s.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Epics cannot be added to a sprint.');
  res = await app.post(`/api/projects/${p.id}/issues`, { title: 'E', type: EPIC });
  assert.deepEqual([res.body.sprint_id, res.body.sprint_rank], [null, null]);
  // Validation as for PATCH.
  const other = await newSprint((await createProject(app)).id);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: other.id })).status, 400);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: 999999 })).status, 400);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: 'abc' })).status, 400);
  const done = await activeSprint(p.id);
  await app.post(`/api/sprints/${done.id}/complete`, { disposition: 'backlog' });
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: done.id })).status, 409);
});

test('PATCH sprint_id: same project, not completed, bottom of the target; epics refused (AC 18, 19, 49)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id, { name: 'Target' });
  const first = await createItem(app, p.id, { sprint_id: s.id });
  const item = await createItem(app, p.id);
  let res = await app.patch(`/api/issues/${item.id}`, { sprint_id: s.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.sprint_id, s.id);
  assert.ok(res.body.sprint_rank > first.sprint_rank, 'bottom of the target');
  // Another project's sprint, unknown ids: 400 and nothing changed.
  const foreign = await newSprint((await createProject(app)).id);
  const before = snapshot();
  for (const bad of [foreign.id, 999999, 'x', 0]) {
    res = await app.patch(`/api/issues/${item.id}`, { sprint_id: bad });
    assert.equal(res.status, 400, String(bad));
  }
  assert.deepEqual(snapshot(), before);
  // Epics: a sprint or a rank is refused; null is a no-op.
  const epic = await createItem(app, p.id, { type: EPIC });
  for (const body of [{ sprint_id: s.id }, { sprint_rank: 5 }, { sprint_id: null, sprint_rank: 5 }]) {
    res = await app.patch(`/api/issues/${epic.id}`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, 'Epics cannot be added to a sprint.');
  }
  res = await app.patch(`/api/issues/${epic.id}`, { sprint_id: null });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.sprint_id, res.body.sprint_rank], [null, null]);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { sprint_rank: 1.5 })).status, 400);
});

test('completed sprints are closed both ways; other fields stay editable (AC 18)', async () => {
  const { p, s, d1, u1 } = await sprintWithWork();
  await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  const next = await newSprint(p.id);
  for (const body of [{ sprint_id: null }, { sprint_id: next.id }, { sprint_rank: 1 }, { type: EPIC }]) {
    const res = await app.patch(`/api/issues/${d1.id}`, body);
    assert.equal(res.status, 409, JSON.stringify(body));
  }
  assert.equal((await app.patch(`/api/issues/${u1.id}`, { sprint_id: s.id })).status, 409, 'into a completed sprint');
  const res = await app.patch(`/api/issues/${d1.id}`, { title: 'Still editable', sprint_id: s.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.title, 'Still editable');
});

test('sprint_rank reorders within a container, rebalancing ties with the moved item first (AC 19, 20)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id);
  const [a, b, c] = [await createItem(app, p.id, { sprint_id: s.id }), await createItem(app, p.id, { sprint_id: s.id }), await createItem(app, p.id, { sprint_id: s.id })];
  await app.patch(`/api/issues/${c.id}`, { status: DONE });
  const doneBefore = await getItem(c.id);
  const historyBefore = (await historyOf(c.id)).length;
  // c to the rank of b: tie, so the container is renumbered with c first among equals.
  const res = await app.patch(`/api/issues/${c.id}`, { sprint_rank: (await getItem(b.id)).sprint_rank });
  assert.equal(res.status, 200);
  const list = await container(p.id, s.id);
  assert.deepEqual(keys(list), [a.key, c.key, b.key]);
  assert.deepEqual(list.map((i) => i.sprint_rank), [1000, 2000, 3000]);
  const after = await getItem(c.id);
  assert.deepEqual([after.status, after.rank, after.resolution], [doneBefore.status, doneBefore.rank, doneBefore.resolution], 'reorder touches nothing else');
  assert.equal((await historyOf(c.id)).length, historyBefore, 'no history for a reorder');
  // A drop into another container with a position: one PATCH with both.
  const backlogItem = await createItem(app, p.id);
  const moved = await app.patch(`/api/issues/${backlogItem.id}`, { sprint_id: s.id, sprint_rank: 1 });
  assert.equal(moved.body.sprint_id, s.id);
  assert.equal(keys(await container(p.id, s.id))[0], backlogItem.key);
});

test('moving never changes status, resolution, epic, assignee or comments; done items can return (AC 22)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id);
  const epic = await createItem(app, p.id, { type: EPIC });
  const item = await createItem(app, p.id, { epic_id: epic.id, assignee_id: ids.casey });
  await app.patch(`/api/issues/${item.id}`, { status: DONE });
  await app.post(`/api/issues/${item.id}/comments`, { body: 'note' });
  const before = await getItem(item.id);
  await app.patch(`/api/issues/${item.id}`, { sprint_id: s.id });
  await app.patch(`/api/issues/${item.id}`, { sprint_id: null });
  const after = await getItem(item.id);
  for (const field of ['status', 'resolution', 'epic_id', 'assignee_id', 'rank']) assert.deepEqual(after[field], before[field], field);
  assert.equal(after.resolution, defaultResolution());
  assert.equal((await app.get(`/api/issues/${item.id}/comments`)).body.length, 1);
});

test('changing type to an epic clears the sprint with history; back again lands at the bottom of the backlog (AC 22, 39)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id, { name: 'Holder' });
  const item = await createItem(app, p.id, { sprint_id: s.id });
  const backlogItem = await createItem(app, p.id);
  let res = await app.patch(`/api/issues/${item.id}`, { type: EPIC });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.sprint_id, res.body.sprint_rank], [null, null]);
  let [latest] = await historyOf(item.id);
  assert.deepEqual(latest.changes.map((c) => c.field).sort(), ['sprint', 'type']);
  assert.equal(latest.changes.find((c) => c.field === 'sprint').old, 'Holder');
  res = await app.patch(`/api/issues/${item.id}`, { type: OTHER_TYPE });
  assert.equal(res.body.sprint_id, null);
  assert.ok(res.body.sprint_rank > backlogItem.sprint_rank, 'bottom of the backlog');
  [latest] = await historyOf(item.id);
  assert.deepEqual(latest.changes.map((c) => c.field), ['type'], 'only the type change');
  assert.deepEqual(keys(await container(p.id, 'backlog')), [backlogItem.key, item.key]);
});

test('the dialog and drag record one sprint change with names; backlog reads Backlog (AC 39)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id, { name: 'Named <b>' });
  const item = await createItem(app, p.id);
  await (await app.client('blake')).patch(`/api/issues/${item.id}`, { sprint_id: s.id });
  await app.patch(`/api/sprints/${s.id}`, { name: 'Renamed' });
  await app.patch(`/api/issues/${item.id}`, { sprint_id: null });
  const changes = await sprintChanges(item.id);
  assert.equal(changes.length, 2);
  assert.deepEqual([changes[1].old, changes[1].new, changes[1].old_id, changes[1].new_id, changes[1].actor], ['Backlog', 'Named <b>', null, s.id, 'Blake Chen']);
  assert.deepEqual([changes[0].old, changes[0].new], ['Renamed', 'Backlog'], 'names are snapshots');
  assert.equal(changes[0].label, 'Sprint');
  const stored = app.db
    .prepare("SELECT c.old_value FROM issue_history_changes c JOIN issue_history_events e ON e.id = c.event_id WHERE e.issue_id = ? AND c.field = 'sprint' ORDER BY c.id")
    .all(item.id);
  assert.equal(stored[0].old_value, null, 'the backlog is stored as null');
});

// ---------- permissions and archived projects (AC 23, 47-49) ----------

test('a Viewer reads everything and gets 403 on every sprint write, before 404 (AC 47, 23)', async () => {
  const p = await createProject(app);
  const s = await newSprint(p.id);
  const a = await activeSprint((await createProject(app)).id);
  const item = await createItem(app, p.id);
  const v = await viewer();
  for (const url of [`/api/projects/${p.id}/sprints`, `/api/projects/${p.id}/sprints/next-name`, `/api/projects/${p.id}/sprint-history`,
    `/api/projects/${p.id}/issues?sprint=backlog`, `/api/projects/${p.id}/issues?sprint=active`, `/api/projects/${p.id}/issues`]) {
    assert.equal((await v.get(url)).status, 200, url);
  }
  const before = snapshot();
  const writes = [
    v.post(`/api/projects/${p.id}/sprints`, { name: 'x' }),
    v.post('/api/projects/999999/sprints', { name: 'x' }),
    v.patch(`/api/sprints/${s.id}`, { name: 'x' }),
    v.patch('/api/sprints/999999', { name: 'x' }),
    v.del(`/api/sprints/${s.id}`),
    v.post(`/api/sprints/${s.id}/start`),
    v.post(`/api/sprints/${a.id}/complete`, { disposition: 'backlog' }),
    v.patch(`/api/issues/${item.id}`, { sprint_id: s.id }),
    v.patch(`/api/issues/${item.id}`, { sprint_rank: 5 }),
    v.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: s.id }),
  ];
  for (const res of await Promise.all(writes)) {
    assert.equal(res.status, 403);
    assert.equal(res.body.error, VIEWER_MESSAGE);
  }
  assert.deepEqual(snapshot(), before);
  // A Member can do every sprint action.
  const m = await app.client('blake');
  const created = await m.post(`/api/projects/${p.id}/sprints`, { name: 'By member' });
  assert.equal(created.status, 201);
  assert.equal((await m.post(`/api/sprints/${created.body.id}/start`)).status, 200);
  assert.equal((await m.patch(`/api/issues/${item.id}`, { sprint_id: created.body.id })).status, 200);
  assert.equal((await m.post(`/api/sprints/${created.body.id}/complete`, { disposition: 'new-sprint' })).status, 200);
});

test('archived projects: every sprint and membership write is 409; reads work; states unchanged (AC 48, Decision 6)', async () => {
  const p = await createProject(app);
  const planned = await newSprint(p.id);
  const a = await activeSprint(p.id);
  const item = await createItem(app, p.id, { sprint_id: a.id });
  await archive(p.id);
  const before = snapshot();
  const writes = [
    app.post(`/api/projects/${p.id}/sprints`, { name: 'x' }),
    app.post(`/api/projects/${p.id}/sprints`, {}), // archived wins over validation
    app.patch(`/api/sprints/${planned.id}`, { name: 'x' }),
    app.del(`/api/sprints/${planned.id}`),
    app.post(`/api/sprints/${planned.id}/start`),
    app.post(`/api/sprints/${a.id}/complete`, { disposition: 'backlog' }),
    app.patch(`/api/issues/${item.id}`, { sprint_id: null }),
    app.patch(`/api/issues/${item.id}`, { sprint_rank: 3 }),
  ];
  for (const res of await Promise.all(writes)) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error, ARCHIVED_MESSAGE);
  }
  assert.deepEqual(snapshot(), before);
  const list = await sprintsOf(p.id);
  assert.deepEqual(list.map((s) => s.state), [activeSprintState(), initialSprintState()], 'archiving changes no state');
  assert.equal((await app.get(`/api/projects/${p.id}/sprint-history`)).status, 200);
});
