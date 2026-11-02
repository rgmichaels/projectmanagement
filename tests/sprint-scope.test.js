// Sprint scope-change tracking (docs/specs/sprint-scope-change.md AC 1-19,
// 29, 31). No test waits 24 hours: the grace rule is unit-tested with given
// timestamps, and `age()` moves a sprint's start, baseline and recorded
// events into the past, so what happens next is after the grace period.
// alex is the seeded Admin; casey is made a Viewer where needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const usersData = require('../server/data/users');
const issuesData = require('../server/data/issues');
const groups = require('../server/groups');
const { TYPES } = require('../server/types');
const { PROJECT_STATUSES } = require('../server/projectStatuses');
const { terminalStatus } = require('../server/statuses');
const { SCOPE, SCOPE_EVENT_KINDS } = require('../server/scopeEvents');
const { isInGrace, graceEndsAt, GRACE_PERIOD_MS } = require('../server/scopePolicy');
const { finalSprintState } = require('../server/sprintStates');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const ARCHIVABLE = PROJECT_STATUSES.find((s) => s.archivable).name;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

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

// ---------- helpers ----------

const count = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const eventsOf = (sprintId) => app.db.prepare('SELECT * FROM sprint_scope_events WHERE sprint_id = ? ORDER BY id').all(sprintId);
const sprintRow = (id) => app.db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
const scope = async (id, client = app) => (await client.get(`/api/sprints/${id}/scope`)).body;
const kinds = (sprintId) => eventsOf(sprintId).map((e) => e.kind);
const earlier = (iso, ms) => (iso ? new Date(Date.parse(iso) - ms).toISOString() : iso);

// Moves the sprint's started_at, baseline_at and recorded events `hours`
// into the past (test-only time travel; production code never edits events).
function age(sprintId, hours = 25) {
  const ms = hours * HOUR;
  const s = sprintRow(sprintId);
  app.db.prepare('UPDATE sprints SET started_at = ?, baseline_at = ? WHERE id = ?').run(earlier(s.started_at, ms), earlier(s.baseline_at, ms), sprintId);
  const update = app.db.prepare('UPDATE sprint_scope_events SET created_at = ? WHERE id = ?');
  for (const e of eventsOf(sprintId)) update.run(earlier(e.created_at, ms), e.id);
}

async function newSprint(projectId, name = 'S') {
  const res = await app.post(`/api/projects/${projectId}/sprints`, { name });
  assert.equal(res.status, 201);
  return res.body;
}

// A started sprint holding items with the given estimates (hours or null).
async function startedSprint(estimates = []) {
  const p = await createProject(app);
  const s = await newSprint(p.id);
  const items = [];
  for (const est of estimates) items.push(await createItem(app, p.id, { sprint_id: s.id, estimate_hours: est }));
  const res = await app.post(`/api/sprints/${s.id}/start`);
  assert.equal(res.status, 200);
  return { p, s, items };
}

const patch = async (id, body, client = app) => {
  const res = await client.patch(`/api/issues/${id}`, body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};

const liveEstimate = async (p, sprintId) => (await app.get(`/api/projects/${p.id}/sprints`)).body.find((x) => x.id === sprintId).estimate_hours;

// ---------- the grace rule (AC 13, 31) ----------

test('isInGrace: 23h59m is in grace, exactly 24h and 24h01m count (AC 13)', () => {
  const sprint = { baseline_at: '2026-10-12T09:00:00.000Z' };
  const at = (ms) => ({ created_at: new Date(Date.parse(sprint.baseline_at) + ms).toISOString() });
  assert.equal(GRACE_PERIOD_MS, 24 * HOUR);
  assert.equal(isInGrace(at(0), sprint), true, 'the start itself');
  assert.equal(isInGrace(at(24 * HOUR - MINUTE), sprint), true, '23h59m');
  assert.equal(isInGrace(at(24 * HOUR - 1), sprint), true, 'one millisecond before');
  assert.equal(isInGrace(at(24 * HOUR), sprint), false, 'exactly 24h counts');
  assert.equal(isInGrace(at(24 * HOUR + MINUTE), sprint), false, '24h01m counts');
  assert.equal(graceEndsAt(sprint), '2026-10-13T09:00:00.000Z');
  assert.equal(isInGrace(at(0), { baseline_at: null }), false, 'untracked: nothing is grace');
});

test('isInGrace: across midnight and a daylight-saving change it is an absolute 24 hours (AC 13, edge cases)', () => {
  // Started at 23:50 local (UTC-4): grace runs to 23:50 the next evening.
  const late = { baseline_at: '2026-10-12T23:50:00-04:00' };
  assert.equal(isInGrace({ created_at: '2026-10-13T00:10:00-04:00' }, late), true, 'after midnight, still in grace');
  assert.equal(isInGrace({ created_at: '2026-10-13T23:49:00-04:00' }, late), true, '23h59m');
  assert.equal(isInGrace({ created_at: '2026-10-13T23:50:00-04:00' }, late), false, 'exactly 24h');
  // US clocks spring forward on 2026-03-08 at 02:00 (EST -05:00 -> EDT -04:00):
  // 24 hours after 01:30 EST is 02:30 EDT on the wall clock.
  const dst = { baseline_at: '2026-03-08T01:30:00-05:00' };
  assert.equal(isInGrace({ created_at: '2026-03-09T02:29:00-04:00' }, dst), true, '23h59m across the change');
  assert.equal(isInGrace({ created_at: '2026-03-09T01:30:00-04:00' }, dst), true, 'same wall time is only 23h');
  assert.equal(isInGrace({ created_at: '2026-03-09T02:30:00-04:00' }, dst), false, 'exactly 24h across the change');
  assert.equal(isInGrace({ created_at: '2026-03-09T02:31:00-04:00' }, dst), false, '24h01m');
  // Falling back on 2026-11-01 (02:00 EDT -> 01:00 EST): 24 hours after
  // 12:00 EDT is 11:00 EST the next day on the wall clock.
  const fall = { baseline_at: '2026-10-31T12:00:00-04:00' };
  assert.equal(isInGrace({ created_at: '2026-11-01T10:59:00-05:00' }, fall), true);
  assert.equal(isInGrace({ created_at: '2026-11-01T11:00:00-05:00' }, fall), false);
});

// ---------- kinds (AC 5, 19) ----------

test('GET /api/scope-event-kinds lists the kinds in order with labels (AC 5, 19)', async () => {
  const res = await app.get('/api/scope-event-kinds');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, SCOPE_EVENT_KINDS.map(({ key, label, effect }) => ({ key, label, effect })));
  assert.deepEqual(res.body.map((k) => k.effect), ['add', 'remove', 'delta']);
  assert.deepEqual(res.body.map((k) => k.key), [SCOPE.added, SCOPE.removed, SCOPE.estimate_changed]);
  assert.equal((await app.raw('GET', '/api/scope-event-kinds')).status, 401);
});

// ---------- baseline at start (AC 2, 3) ----------

test('starting a sprint stores its baseline in the same transaction, baseline_at = started_at (AC 3)', async () => {
  const { s, items } = await startedSprint([4, null, 2.5]);
  const row = sprintRow(s.id);
  assert.equal(row.baseline_item_count, 3);
  assert.equal(row.baseline_minutes, 390, 'null counts as 0');
  assert.ok(row.started_at);
  assert.equal(row.baseline_at, row.started_at, 'the same value');
  const baseline = app.db.prepare('SELECT * FROM sprint_baseline_items WHERE sprint_id = ? ORDER BY issue_id').all(s.id);
  assert.deepEqual(baseline.map((b) => [b.issue_id, b.issue_key, b.estimate_minutes]), items.map((i) => [i.id, i.key, i.estimate_hours === null ? null : i.estimate_hours * 60]));
  assert.deepEqual(eventsOf(s.id), [], 'the baseline is not an event');
  const sum = await scope(s.id);
  assert.equal(sum.tracked, true);
  assert.equal(sum.baseline_late, false);
  assert.deepEqual(sum.baseline, { item_count: 3, hours: 6.5 });
  assert.equal(sum.planned_hours, 6.5);
  assert.equal(sum.grace_ends_at, new Date(Date.parse(row.started_at) + GRACE_PERIOD_MS).toISOString());
});

test('starting an empty sprint stores count 0 and minutes 0 (tracked); a refused start stores nothing (AC 3)', async () => {
  const { p, s } = await startedSprint([]);
  const row = sprintRow(s.id);
  assert.deepEqual([row.baseline_item_count, row.baseline_minutes], [0, 0]);
  assert.ok(row.baseline_at);
  const sum = await scope(s.id);
  assert.equal(sum.tracked, true);
  assert.equal(sum.planned_hours, 0);
  assert.equal(sum.growth_percent, null, 'n/a when planned is 0');
  // A second sprint cannot start while one is active: 409, no baseline.
  const other = await newSprint(p.id, 'Other');
  await createItem(app, p.id, { sprint_id: other.id, estimate_hours: 1 });
  const before = count('sprint_baseline_items');
  assert.equal((await app.post(`/api/sprints/${other.id}/start`)).status, 409);
  const otherRow = sprintRow(other.id);
  assert.deepEqual([otherRow.baseline_item_count, otherRow.baseline_minutes, otherRow.baseline_at], [null, null, null]);
  assert.equal(count('sprint_baseline_items'), before);
});

// ---------- recording (AC 6-11) ----------

test('entering an Active sprint writes one added event with the estimate after the save (AC 6)', async () => {
  const { p, s } = await startedSprint([1]);
  const created = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 3 });
  const backlog = await createItem(app, p.id, { estimate_hours: 2 });
  await patch(backlog.id, { sprint_id: s.id });
  const both = await createItem(app, p.id, { estimate_hours: 2 });
  await patch(both.id, { sprint_id: s.id, estimate_hours: 5 }); // estimate changed in the same save
  const events = eventsOf(s.id);
  assert.deepEqual(events.map((e) => [e.kind, e.issue_id, e.estimate_minutes, e.old_estimate_minutes]), [
    [SCOPE.added, created.id, 180, null],
    [SCOPE.added, backlog.id, 120, null],
    [SCOPE.added, both.id, 300, null],
  ]);
  const e = events[0];
  assert.deepEqual([e.project_id, e.issue_key, e.issue_title, e.actor_id, e.actor_name], [p.id, created.key, created.title, ids.alex, 'Alex Morgan']);
  assert.ok(Math.abs(Date.parse(e.created_at) - Date.now()) < 60 * 1000, 'server time');
});

test('leaving an Active sprint writes one removed event with the estimate before the change (AC 7)', async () => {
  const { p, s, items } = await startedSprint([4, 2, 1]);
  const [toBacklog, toEpic, toDelete] = items;
  await patch(toBacklog.id, { sprint_id: null, estimate_hours: 6 }); // also re-estimated: removed at the old 4 h
  await patch(toEpic.id, { type: EPIC_TYPE });
  assert.equal((await app.del(`/api/issues/${toDelete.id}`)).status, 204);
  const events = eventsOf(s.id);
  assert.deepEqual(events.map((e) => [e.kind, e.issue_id, e.estimate_minutes]), [
    [SCOPE.removed, toBacklog.id, 240],
    [SCOPE.removed, toEpic.id, 120],
    [SCOPE.removed, toDelete.id, 60],
  ]);
  assert.deepEqual([events[2].issue_key, events[2].issue_title], [toDelete.key, toDelete.title], 'a deleted item keeps its snapshot');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM issues WHERE id = ?').get(toDelete.id).n, 0);
  assert.equal(await liveEstimate(p, s.id), 0);
});

test('moves between sprints record on the Active sprint only (AC 8)', async () => {
  const { p, s, items } = await startedSprint([3]);
  const planned = await newSprint(p.id, 'Next');
  await patch(items[0].id, { sprint_id: planned.id });
  const fromPlanned = await createItem(app, p.id, { sprint_id: planned.id, estimate_hours: 1 });
  await patch(fromPlanned.id, { sprint_id: s.id });
  assert.deepEqual(eventsOf(s.id).map((e) => [e.kind, e.issue_id]), [[SCOPE.removed, items[0].id], [SCOPE.added, fromPlanned.id]]);
  assert.deepEqual(eventsOf(planned.id), [], 'the Planned sprint records nothing');
});

test('estimate changes on an Active sprint item: old and new, null as none; same value writes nothing (AC 9)', async () => {
  const { s, items } = await startedSprint([null, 4]);
  const [none, four] = items;
  await patch(none.id, { estimate_hours: 2 }); // null -> value
  await patch(four.id, { estimate_hours: null }); // value -> null
  await patch(none.id, { estimate_hours: 2 }); // same value
  await patch(four.id, { estimate_hours: null }); // same (none)
  await patch(none.id, { title: 'Renamed', estimate_hours: 2 }); // other field, same estimate
  assert.deepEqual(eventsOf(s.id).map((e) => [e.kind, e.issue_id, e.old_estimate_minutes, e.estimate_minutes]), [
    [SCOPE.estimate_changed, none.id, null, 120],
    [SCOPE.estimate_changed, four.id, 240, null],
  ]);
});

test('one save never writes both a membership event and an estimate change (AC 9)', async () => {
  const { p, s, items } = await startedSprint([4]);
  await patch(items[0].id, { sprint_id: null, estimate_hours: 1 });
  const other = await createItem(app, p.id, { estimate_hours: 1 });
  await patch(other.id, { sprint_id: s.id, estimate_hours: 8 });
  assert.deepEqual(eventsOf(s.id).map((e) => [e.kind, e.estimate_minutes, e.old_estimate_minutes]), [
    [SCOPE.removed, 240, null],
    [SCOPE.added, 480, null],
  ]);
});

test('nothing is recorded for Planned sprints, epics, reorders, other fields, time, Complete, Delete or sprint edits (AC 10)', async () => {
  const p = await createProject(app);
  const planned = await newSprint(p.id, 'Planned');
  const a = await createItem(app, p.id, { sprint_id: planned.id, estimate_hours: 1 });
  await patch(a.id, { estimate_hours: 2 });
  await patch(a.id, { sprint_id: null });
  await patch(a.id, { sprint_id: planned.id });
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sprint_scope_events WHERE project_id = ?').get(p.id).n, 0, 'Planned');

  const active = await newSprint(p.id, 'Active');
  const b = await createItem(app, p.id, { sprint_id: active.id, estimate_hours: 3 });
  const c = await createItem(app, p.id, { sprint_id: active.id, estimate_hours: 1 });
  assert.equal((await app.post(`/api/sprints/${active.id}/start`)).status, 200);
  const epic = await createItem(app, p.id, { type: EPIC_TYPE });
  await patch(epic.id, { title: 'Epic renamed' });
  await patch(b.id, { sprint_rank: 1 }); // reorder only
  await patch(b.id, { status: (await app.get('/api/statuses')).body[1], title: 'New title', assignee_id: ids.blake, priority: (await app.get('/api/priorities')).body.priorities[0] });
  await patch(b.id, { epic_id: epic.id });
  assert.equal((await app.post(`/api/issues/${b.id}/time`, { hours: 1 })).status, 201);
  assert.equal((await app.patch(`/api/sprints/${active.id}`, { goal: 'A goal' })).status, 200);
  assert.equal((await app.del(`/api/sprints/${planned.id}`)).status, 204, 'Delete (Planned only)');
  await patch(c.id, { status: terminalStatus() });
  const done = await app.post(`/api/sprints/${active.id}/complete`, { disposition: 'backlog' });
  assert.equal(done.status, 200);
  assert.equal(done.body.moved.count, 1, 'b moved out by Complete');
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sprint_scope_events WHERE project_id = ?').get(p.id).n, 0);
  // After completion the sprint records nothing (Decision 9).
  const completedItem = c;
  await patch(completedItem.id, { title: 'Done item renamed' });
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM sprint_scope_events WHERE project_id = ?').get(p.id).n, 0);
});

test('refused requests (400, 403, 404, 409) write no events; a rolled-back write leaves none (AC 11)', async () => {
  const { p, s, items } = await startedSprint([2]);
  const before = count('sprint_scope_events');
  assert.equal((await app.patch(`/api/issues/${items[0].id}`, { estimate_hours: 'lots' })).status, 400);
  assert.equal((await app.patch(`/api/issues/${items[0].id}`, { sprint_id: 999999 })).status, 400);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: '', sprint_id: s.id })).status, 400);
  assert.equal((await app.patch('/api/issues/999999', { sprint_id: s.id })).status, 404);
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  assert.equal((await viewer.patch(`/api/issues/${items[0].id}`, { sprint_id: null })).status, 403);
  assert.equal((await viewer.del(`/api/issues/${items[0].id}`)).status, 403);
  assert.equal(count('sprint_scope_events'), before);
  // Rolled back: the write and its event go together.
  assert.throws(() => app.db.transaction(() => {
    issuesData.updateIssue(app.db, items[0].id, { sprint_id: null }, { id: ids.alex, name: 'Alex Morgan' });
    assert.equal(count('sprint_scope_events'), before + 1, 'written inside the transaction');
    throw new Error('boom');
  })(), /boom/);
  assert.equal(count('sprint_scope_events'), before);
  assert.equal((await app.get(`/api/issues/${items[0].id}`)).body.sprint_id, s.id);
  // Archived: 409, nothing written.
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  assert.equal((await app.patch(`/api/issues/${items[0].id}`, { sprint_id: null })).status, 409);
  assert.equal((await app.del(`/api/issues/${items[0].id}`)).status, 409);
  assert.equal(count('sprint_scope_events'), before);
});

test('events are attributed to the signed-in user, never the body (AC 11)', async () => {
  const { p, s } = await startedSprint([]);
  const blake = await app.client('blake');
  const res = await blake.post(`/api/projects/${p.id}/issues`, { title: 'x', sprint_id: s.id, actor_id: ids.alex, actor_name: 'Spoof' });
  assert.equal(res.status, 201);
  const [e] = eventsOf(s.id);
  assert.deepEqual([e.actor_id, e.actor_name], [ids.blake, 'Blake Chen']);
});

// ---------- grace and totals (AC 13-14) ----------

test('grace-period events are listed as adjusted in first 24h and fold into Planned; later ones count (AC 13, 14)', async () => {
  const { p, s, items } = await startedSprint([4, 6]);
  // Within the first 24 hours.
  const early = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 2 });
  await patch(items[0].id, { estimate_hours: 5 });
  await patch(items[1].id, { sprint_id: null });
  let sum = await scope(s.id);
  assert.equal(sum.events.length, 3);
  assert.ok(sum.events.every((e) => e.in_grace));
  assert.deepEqual(sum.grace, { added: { count: 1, hours: 2 }, removed: { count: 1, hours: 6 }, estimate_change: { count: 1, hours: 1 } });
  assert.deepEqual([sum.added, sum.removed, sum.estimate_change], [{ count: 0, hours: 0 }, { count: 0, hours: 0 }, { count: 0, hours: 0 }]);
  assert.equal(sum.planned_hours, 10 - 6 + 2 + 1, 'baseline + grace adjustments (Decision 8)');
  assert.equal(sum.net_change_hours, 0);
  assert.equal(sum.current_total_hours, 7);
  assert.equal(sum.growth_percent, 0);

  age(s.id); // the first 24 hours are now over
  const late = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 3 });
  await patch(early.id, { estimate_hours: 1 }); // 2 -> 1: -1
  await patch(items[0].id, { sprint_id: null }); // removed at 5
  const blank = await createItem(app, p.id, { sprint_id: s.id }); // no estimate
  sum = await scope(s.id);
  assert.deepEqual(sum.events.map((e) => e.in_grace), [true, true, true, false, false, false, false]);
  assert.deepEqual(sum.added, { count: 2, hours: 3 });
  assert.deepEqual(sum.removed, { count: 1, hours: 5 });
  assert.deepEqual(sum.estimate_change, { count: 1, hours: -1 });
  assert.equal(sum.planned_hours, 7);
  assert.equal(sum.net_change_hours, 3 - 5 - 1);
  assert.equal(sum.current_total_hours, 4);
  assert.equal(sum.growth_percent, Math.round((-3 / 7) * 1000) / 10);
  assert.equal(sum.unestimated_added_count, 1);
  assert.equal(sum.current_total_hours, await liveEstimate(p, s.id));
  // Event shape, oldest first.
  const last = sum.events[sum.events.length - 1];
  assert.deepEqual(Object.keys(last).sort(), ['actor_name', 'created_at', 'hours', 'id', 'in_grace', 'issue_id', 'issue_key', 'issue_title', 'kind', 'old_hours'].sort());
  assert.deepEqual([last.kind, last.issue_id, last.hours, last.old_hours], [SCOPE.added, blank.id, null, null]);
  const change = sum.events.find((e) => e.kind === SCOPE.estimate_changed && !e.in_grace);
  assert.deepEqual([change.issue_key, change.old_hours, change.hours], [early.key, 2, 1]);
  assert.ok(sum.events.some((e) => e.issue_id === late.id));
  assert.deepEqual(sum.events.map((e) => e.id), [...sum.events.map((e) => e.id)].sort((a, b) => a - b));
});

test('the boundary on stored events: 23h59m after baseline is grace, exactly 24h counts (AC 13)', async () => {
  const { p, s } = await startedSprint([1]);
  const a = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 2 });
  const b = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 3 });
  const [ea, eb] = eventsOf(s.id);
  const base = sprintRow(s.id).baseline_at;
  const at = (ms) => new Date(Date.parse(base) + ms).toISOString();
  app.db.prepare('UPDATE sprint_scope_events SET created_at = ? WHERE id = ?').run(at(24 * HOUR - MINUTE), ea.id);
  app.db.prepare('UPDATE sprint_scope_events SET created_at = ? WHERE id = ?').run(at(24 * HOUR), eb.id);
  const sum = await scope(s.id);
  assert.deepEqual(sum.events.map((e) => [e.issue_id, e.in_grace]), [[a.id, true], [b.id, false]]);
  assert.deepEqual(sum.grace.added, { count: 1, hours: 2 });
  assert.deepEqual(sum.added, { count: 1, hours: 3 });
  assert.equal(sum.planned_hours, 3);
  assert.equal(sum.growth_percent, 100);
});

test('re-add: added, removed and added again after grace is 2 added and 1 removed, hours summed (edge cases, Decision 10)', async () => {
  const { p, s } = await startedSprint([10]);
  age(s.id);
  const x = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 4 });
  await patch(x.id, { sprint_id: null });
  await patch(x.id, { sprint_id: s.id });
  const sum = await scope(s.id);
  assert.deepEqual(sum.added, { count: 2, hours: 8 });
  assert.deepEqual(sum.removed, { count: 1, hours: 4 });
  assert.equal(sum.net_change_hours, 4);
  assert.equal(sum.current_total_hours, 14);
  assert.equal(sum.growth_percent, 40);
  assert.equal(sum.current_total_hours, await liveEstimate(p, s.id));
});

test('add then re-estimate after grace: added 4 h and +2 h; removed later at 6 h (edge cases)', async () => {
  const { p, s } = await startedSprint([]);
  age(s.id);
  const x = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 4 });
  await patch(x.id, { estimate_hours: 6 });
  let sum = await scope(s.id);
  assert.deepEqual([sum.added.hours, sum.estimate_change.hours, sum.current_total_hours], [4, 2, 6]);
  assert.equal(sum.growth_percent, null, 'planned 0: n/a');
  await patch(x.id, { sprint_id: null });
  sum = await scope(s.id);
  assert.equal(sum.removed.hours, 6);
  assert.equal(sum.current_total_hours, 0);
  // Estimate removed (6 h to none) is -6 h.
  const y = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 6 });
  await patch(y.id, { estimate_hours: null });
  sum = await scope(s.id);
  assert.equal(sum.estimate_change.hours, 2 - 6);
});

// ---------- reconciliation (AC 15) ----------

test('reconciliation: current_total equals the live estimate sum through adds, removes, re-adds, deletes, type changes and estimate edits across the boundary (AC 15)', async () => {
  const { p, s, items } = await startedSprint([4, 2, null, 1.5]);
  const [a, b, c, d] = items;
  const check = async (label) => {
    const sum = await scope(s.id);
    assert.equal(sum.current_total_hours, await liveEstimate(p, s.id), label);
    assert.equal(Math.round((sum.planned_hours + sum.net_change_hours) * 100), Math.round(sum.current_total_hours * 100), `${label}: planned + net`);
  };
  await check('at start');
  // In grace.
  const e = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 3 });
  await patch(a.id, { estimate_hours: 5 });
  await patch(b.id, { sprint_id: null });
  await patch(b.id, { sprint_id: s.id, estimate_hours: 2.25 });
  await check('in grace');
  age(s.id);
  // After grace.
  const f = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 6 });
  await patch(e.id, { sprint_id: null });
  await patch(e.id, { sprint_id: s.id, estimate_hours: 3.5 });
  assert.equal((await app.del(`/api/issues/${c.id}`)).status, 204);
  await patch(d.id, { type: EPIC_TYPE });
  await patch(d.id, { type: TYPES.find((t) => !t.isEpic).name, sprint_id: s.id, estimate_hours: 0.75 });
  const g = await createItem(app, p.id, { sprint_id: s.id });
  await patch(g.id, { estimate_hours: 2 });
  await patch(f.id, { estimate_hours: 4 });
  await patch(a.id, { estimate_hours: null });
  const planned = await newSprint(p.id, 'Next');
  await patch(b.id, { sprint_id: planned.id });
  const fromPlanned = await createItem(app, p.id, { sprint_id: planned.id, estimate_hours: 1.25 });
  await patch(fromPlanned.id, { sprint_id: s.id });
  const gone = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 9 });
  assert.equal((await app.del(`/api/issues/${gone.id}`)).status, 204);
  await patch(f.id, { status: terminalStatus() });
  await check('after grace');
  const sum = await scope(s.id);
  assert.ok(sum.events.some((x) => x.in_grace) && sum.events.some((x) => !x.in_grace), 'both sides of the boundary');
});

// ---------- completed sprint (AC 16) ----------

test('a completed sprint keeps its final numbers; later edits change nothing (AC 16, Decision 11)', async () => {
  const { p, s, items } = await startedSprint([4, 2]);
  age(s.id);
  const added = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 3 });
  await patch(items[0].id, { status: terminalStatus() });
  await patch(added.id, { status: terminalStatus() });
  const atCompletion = await scope(s.id);
  const live = await liveEstimate(p, s.id);
  assert.equal(atCompletion.current_total_hours, live);
  const res = await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' });
  assert.equal(res.status, 200);
  assert.equal(res.body.moved.count, 1, 'the unfinished item left with Complete');
  const final = await scope(s.id);
  assert.equal(final.state, finalSprintState());
  const strip = (x) => ({ ...x, state: null });
  assert.deepEqual(strip(final), strip(atCompletion), 'Complete is not a removal');
  assert.equal(final.current_total_hours, 9);
  // Afterwards: estimate edits on its items and moving the moved item change nothing.
  await patch(items[0].id, { estimate_hours: 40 });
  await patch(items[1].id, { estimate_hours: 40 });
  await patch(items[1].id, { sprint_id: null });
  const later = await scope(s.id);
  assert.deepEqual(later, final);
  assert.notEqual(later.current_total_hours, await liveEstimate(p, s.id), 'frozen, not the live sum');
});

// ---------- the badge flag (AC 18, 27) ----------

test('added_after_start and added_at follow the latest membership event outside grace (AC 18, 27)', async () => {
  const { p, s, items } = await startedSprint([2]);
  const planned = await newSprint(p.id, 'Next');
  const inPlanned = await createItem(app, p.id, { sprint_id: planned.id });
  const backlog = await createItem(app, p.id);
  const graceAdd = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 1 });
  const flicker = await createItem(app, p.id, { sprint_id: s.id });
  await patch(flicker.id, { sprint_id: null });
  await patch(flicker.id, { sprint_id: s.id }); // removed and re-added within grace
  age(s.id);
  const late = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 1 });
  const epic = await createItem(app, p.id, { type: EPIC_TYPE });

  const flags = async () => {
    const list = (await app.get(`/api/projects/${p.id}/issues`)).body;
    return Object.fromEntries(list.map((i) => [i.id, [i.added_after_start, i.added_at]]));
  };
  let f = await flags();
  const lateEvent = eventsOf(s.id).find((e) => e.issue_id === late.id);
  assert.deepEqual(f[late.id], [true, lateEvent.created_at]);
  for (const x of [items[0], inPlanned, backlog, graceAdd, flicker]) assert.deepEqual(f[x.id], [false, null], x.key);
  assert.deepEqual(f[epic.id], [false, null]);
  // The single item and the sprint-filtered list agree.
  const one = (await app.get(`/api/issues/${late.id}`)).body;
  assert.deepEqual([one.added_after_start, one.added_at], [true, lateEvent.created_at]);
  const sprintList = (await app.get(`/api/projects/${p.id}/issues?sprint=${s.id}`)).body;
  assert.equal(sprintList.find((i) => i.id === late.id).added_after_start, true);
  // Estimate changes do not affect it.
  await patch(late.id, { estimate_hours: 5 });
  await patch(items[0].id, { estimate_hours: 5 });
  f = await flags();
  assert.equal(f[late.id][0], true);
  assert.equal(f[items[0].id][0], false);
  // It disappears when the item leaves and returns on a later add (most recent add).
  await patch(late.id, { sprint_id: null });
  assert.deepEqual((await flags())[late.id], [false, null]);
  await patch(late.id, { sprint_id: planned.id });
  assert.deepEqual((await flags())[late.id], [false, null], 'a Planned sprint never flags');
  await patch(late.id, { sprint_id: s.id });
  const readd = eventsOf(s.id).filter((e) => e.issue_id === late.id && e.kind === SCOPE.added).pop();
  assert.notEqual(readd.id, lateEvent.id);
  assert.deepEqual((await flags())[late.id], [true, readd.created_at]);
  // A baseline item removed and re-added after grace is flagged too.
  await patch(items[0].id, { sprint_id: null });
  await patch(items[0].id, { sprint_id: s.id });
  assert.equal((await flags())[items[0].id][0], true);
  // Completed sprints keep the flag on their items.
  await patch(late.id, { status: terminalStatus() });
  assert.equal((await app.post(`/api/sprints/${s.id}/complete`, { disposition: 'backlog' })).status, 200);
  f = await flags();
  assert.equal(f[late.id][0], true, 'kept in the completed sprint');
  assert.deepEqual(f[items[0].id], [false, null], 'moved to the backlog by Complete');
});

// ---------- API states, permissions, archive (AC 17, 29) ----------

test('GET /api/sprints/:id/scope: Planned and untracked sprints, 404, 401 (AC 17)', async () => {
  const p = await createProject(app);
  const planned = await newSprint(p.id, 'Planned');
  const sum = await scope(planned.id);
  assert.equal(sum.tracked, false);
  assert.equal(sum.state, planned.state);
  for (const key of ['planned_hours', 'added', 'removed', 'estimate_change', 'net_change_hours', 'current_total_hours', 'growth_percent', 'baseline', 'grace', 'unestimated_added_count', 'baseline_at', 'grace_ends_at']) {
    assert.equal(sum[key], null, key);
  }
  assert.deepEqual(sum.events, []);
  assert.equal(sum.baseline_late, false);
  assert.equal((await app.get('/api/sprints/999999/scope')).status, 404);
  assert.equal((await app.get('/api/sprints/abc/scope')).status, 404);
  assert.equal((await app.raw('GET', `/api/sprints/${planned.id}/scope`)).status, 401);
  // There is no write endpoint for scope events.
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT']) {
    assert.equal((await app.request(method, `/api/sprints/${planned.id}/scope`, {})).status, 404, method);
  }
});

test('Viewers and archived projects read the scope and the flags (AC 17, 29)', async () => {
  const { p, s } = await startedSprint([1]);
  age(s.id);
  const late = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 2 });
  const own = await scope(s.id);
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  assert.deepEqual(await scope(s.id, viewer), own);
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  const res = await viewer.get(`/api/sprints/${s.id}/scope`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, own);
  assert.equal((await app.get(`/api/sprints/${s.id}/scope`)).status, 200);
  const item = (await viewer.get(`/api/issues/${late.id}`)).body;
  assert.equal(item.added_after_start, true);
  assert.equal((await viewer.get('/api/scope-event-kinds')).status, 200);
});
