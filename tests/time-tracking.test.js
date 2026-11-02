// Time tracking and estimates (docs/specs/time-tracking.md AC 1-15, 31-40,
// 49, 50, 57). alex is the seeded Admin, blake and dana Members; casey is
// made a Viewer where needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const usersData = require('../server/data/users');
const groups = require('../server/groups');
const { TYPES } = require('../server/types');
const { PROJECT_STATUSES } = require('../server/projectStatuses');
const { terminalStatus } = require('../server/statuses');
const timeValidation = require('../server/timeValidation');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const OTHER_TYPE = TYPES.find((t) => !t.isEpic && !t.isDefault).name;
const ARCHIVABLE = PROJECT_STATUSES.find((s) => s.archivable).name;
const HOURS_MESSAGE = 'Hours must be a number greater than 0 and at most 24, in steps of 0.25.';
const ESTIMATE_MESSAGE = 'Estimate must be a number greater than 0 and at most 1000, in steps of 0.25, or empty.';

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

const pad = (n) => String(n).padStart(2, '0');
const dayOffset = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const TODAY = dayOffset(0);
const count = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const logTime = (client, issueId, body) => client.post(`/api/issues/${issueId}/time`, body);

async function sprintOf(projectId, name = 'Sprint') {
  const res = await app.post(`/api/projects/${projectId}/sprints`, { name });
  assert.equal(res.status, 201);
  return res.body;
}
const sprintRow = async (projectId, sprintId) =>
  (await app.get(`/api/projects/${projectId}/sprints`)).body.find((s) => s.id === sprintId);

// ---------- validation (AC 2-4, 35) ----------

test('hours: a table of accepted and rejected values (AC 2)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  for (const [hours, minutes] of [[1.5, 90], [0.25, 15], [24, 1440], [8, 480]]) {
    const res = await logTime(app, item.id, { hours, date: TODAY });
    assert.equal(res.status, 201, String(hours));
    assert.equal(res.body.hours, hours);
    assert.equal(app.db.prepare('SELECT minutes FROM time_entries WHERE id = ?').get(res.body.id).minutes, minutes);
  }
  const before = count('time_entries');
  for (const hours of [0, -1, 0.1, 25, 24.25, 'abc', '1.5', '2h', null, undefined, Number.NaN, true]) {
    const res = await logTime(app, item.id, { hours, date: TODAY });
    assert.equal(res.status, 400, String(hours));
    assert.equal(res.body.error, HOURS_MESSAGE);
  }
  assert.equal(count('time_entries'), before, 'nothing stored');
});

test('date: real, not in the future, defaults to today; past dates allowed (AC 3)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal((await logTime(app, item.id, { hours: 1 })).body.date, TODAY, 'defaults to today');
  assert.equal((await logTime(app, item.id, { hours: 1, date: dayOffset(-1) })).status, 201, 'yesterday');
  assert.equal((await logTime(app, item.id, { hours: 1, date: '2001-02-03' })).status, 201, 'long ago');
  for (const date of [dayOffset(1), '2026-02-30', '2026-13-01', '28-10-2026', '2026/10/01', 'today', '', 20261028, null]) {
    const res = await logTime(app, item.id, { hours: 1, date });
    assert.equal(res.status, 400, String(date));
  }
  // The pure rule with a fixed "today".
  assert.equal(timeValidation.checkWorkDate('2026-10-28', '2026-10-28'), '2026-10-28');
  assert.throws(() => timeValidation.checkWorkDate('2026-10-29', '2026-10-28'), /not in the future/);
});

test('note: optional, trimmed, empty is null, at most 500 characters, stored as text (AC 4)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal((await logTime(app, item.id, { hours: 1, note: '  pairing  ' })).body.note, 'pairing');
  assert.equal((await logTime(app, item.id, { hours: 1, note: '   ' })).body.note, null);
  assert.equal((await logTime(app, item.id, { hours: 1 })).body.note, null);
  assert.equal((await logTime(app, item.id, { hours: 1, note: 'x'.repeat(500) })).status, 201);
  const long = await logTime(app, item.id, { hours: 1, note: 'x'.repeat(501) });
  assert.equal(long.status, 400);
  assert.equal(long.body.error, 'Note must be at most 500 characters.');
  const hostile = '<img src=x onerror=alert(1)>';
  assert.equal((await logTime(app, item.id, { hours: 1, note: hostile })).body.note, hostile, 'kept literally');
});

test('the entry shape; the user is always the signed-in one (AC 1)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const blake = await app.client('blake');
  const res = await logTime(blake, item.id, { hours: 2, date: TODAY, note: 'n', user_id: ids.alex, user_name: 'Someone else' });
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['created_at', 'date', 'hours', 'id', 'issue_id', 'note', 'updated_at', 'user_id', 'user_name']);
  assert.equal(res.body.user_id, ids.blake);
  assert.equal(res.body.user_name, 'Blake Chen');
  assert.equal(res.body.issue_id, item.id);
  assert.equal(res.body.created_at, res.body.updated_at);
});

// ---------- epics (AC 5, 36) ----------

test('no time and no estimate on an epic (AC 5, 36)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: EPIC_TYPE });
  const res = await logTime(app, epic.id, { hours: 1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Time cannot be logged on an epic.');
  assert.equal(count('time_entries WHERE issue_id = ' + epic.id), 0);
  const created = await app.post(`/api/projects/${p.id}/issues`, { title: 'E', type: EPIC_TYPE, estimate_hours: 8 });
  assert.equal(created.status, 400);
  assert.equal(created.body.error, 'An epic cannot have an estimate.');
  const patched = await app.patch(`/api/issues/${epic.id}`, { estimate_hours: 8 });
  assert.equal(patched.status, 400);
  assert.equal(patched.body.error, 'An epic cannot have an estimate.');
  assert.equal((await app.patch(`/api/issues/${epic.id}`, { estimate_hours: null })).status, 200, 'clearing is a no-op');
  const got = (await app.get(`/api/issues/${epic.id}`)).body;
  assert.equal(got.estimate_hours, null);
  assert.equal(got.time_spent_hours, 0);
  assert.ok(!('remaining_hours' in got));
  // Making an item an epic in the same save as an estimate is refused too.
  const item = await createItem(app, p.id);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { type: EPIC_TYPE, estimate_hours: 3 })).status, 400);
});

test('changing an item to an epic clears its estimate as it clears the sprint, in history (AC 36)', async () => {
  const p = await createProject(app);
  const sprint = await sprintOf(p.id);
  const item = await createItem(app, p.id, { sprint_id: sprint.id, estimate_hours: 6 });
  await logTime(app, item.id, { hours: 2 });
  const res = await app.patch(`/api/issues/${item.id}`, { type: EPIC_TYPE });
  assert.equal(res.status, 200);
  assert.equal(res.body.sprint_id, null);
  assert.equal(res.body.estimate_hours, null);
  assert.equal(res.body.time_spent_hours, 0, 'an epic returns 0');
  assert.equal(app.db.prepare('SELECT estimate_minutes FROM issues WHERE id = ?').get(item.id).estimate_minutes, null);
  const history = (await app.get(`/api/issues/${item.id}/history`)).body.events[0];
  const change = history.changes.find((c) => c.field === 'estimate');
  assert.deepEqual([change.old, change.new, change.label], ['6', null, 'Estimate']);
  assert.ok(history.changes.some((c) => c.field === 'sprint'), 'in the same event as the sprint');
  const s = await sprintRow(p.id, sprint.id);
  assert.equal(s.time_spent_hours, 0, 'an epic never counts');
  assert.equal(s.estimate_hours, 0);
});

// ---------- edit and delete (AC 6, 32) ----------

test('only the author edits or deletes an entry; Admin included gets 403 (AC 6)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const dana = await app.client('dana');
  const entry = (await logTime(dana, item.id, { hours: 1, date: dayOffset(-2), note: 'mine' })).body;
  for (const other of [await app.client('blake'), app]) {
    const edit = await other.patch(`/api/time/${entry.id}`, { hours: 3 });
    assert.equal(edit.status, 403);
    assert.equal(edit.body.error, 'You can only change your own time entries.');
    assert.equal((await other.del(`/api/time/${entry.id}`)).status, 403);
  }
  const edited = await dana.patch(`/api/time/${entry.id}`, { hours: 1.75, date: dayOffset(-1), note: ' fixed ', user_id: ids.alex, issue_id: 999 });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.hours, 1.75);
  assert.equal(edited.body.date, dayOffset(-1));
  assert.equal(edited.body.note, 'fixed');
  assert.equal(edited.body.user_id, ids.dana, 'user cannot change');
  assert.equal(edited.body.issue_id, item.id, 'item cannot change');
  assert.notEqual(edited.body.updated_at, edited.body.created_at, 'edited marker');
  // Same validation as create.
  assert.equal((await dana.patch(`/api/time/${entry.id}`, { hours: 0.1 })).body.error, HOURS_MESSAGE);
  assert.equal((await dana.patch(`/api/time/${entry.id}`, { date: dayOffset(1) })).status, 400);
  // A no-op save keeps updated_at.
  const same = await dana.patch(`/api/time/${entry.id}`, { hours: 1.75, note: 'fixed' });
  assert.equal(same.status, 200);
  assert.equal(same.body.updated_at, edited.body.updated_at);
  assert.equal((await dana.del(`/api/time/${entry.id}`)).status, 204);
  assert.equal((await dana.del(`/api/time/${entry.id}`)).status, 404);
  assert.equal((await dana.patch('/api/time/abc', { hours: 1 })).status, 404);
});

test('an unedited entry has updated_at equal to created_at (AC 32)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const e = (await logTime(app, item.id, { hours: 1 })).body;
  const unchanged = (await app.patch(`/api/time/${e.id}`, {})).body;
  assert.equal(unchanged.updated_at, unchanged.created_at);
});

// ---------- permissions, archived, completed sprint (AC 7-9) ----------

test('Viewer 403 with the log-time wording, Member 201; nothing changes (AC 7)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const mine = (await logTime(await app.client('casey'), item.id, { hours: 1 })).body;
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  const before = count('time_entries');
  const message = `Your group (${VIEWER}) is not allowed to log time.`;
  for (const res of [
    await logTime(viewer, item.id, { hours: 1 }),
    await viewer.patch(`/api/time/${mine.id}`, { hours: 2 }),
    await viewer.del(`/api/time/${mine.id}`),
    await logTime(viewer, 999999, { hours: 'bad' }), // 403 before 404 and 400
    await viewer.del('/api/time/999999'),
  ]) {
    assert.equal(res.status, 403);
    assert.equal(res.body.error, message);
  }
  assert.equal(count('time_entries'), before);
  assert.equal((await viewer.get(`/api/issues/${item.id}/time`)).status, 200, 'reads work');
  assert.equal((await logTime(await app.client('blake'), item.id, { hours: 1 })).status, 201, 'Member');
  assert.equal((await app.raw('GET', `/api/issues/${item.id}/time`)).status, 401, 'signed out');
  assert.equal((await app.raw('POST', `/api/issues/${item.id}/time`, { hours: 1 })).status, 401);
});

test('order of checks: 404, then ownership 403, then archived 409, then 400 (AC 7, 8)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const dana = await app.client('dana');
  const entry = (await logTime(dana, item.id, { hours: 1 })).body;
  assert.equal((await logTime(app, 999999, { hours: 'bad' })).status, 404);
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  const before = count('time_entries');
  assert.equal((await app.patch(`/api/time/${entry.id}`, { hours: 'bad' })).status, 403, 'not the author before archived');
  for (const res of [
    await logTime(dana, item.id, { hours: 'bad' }),
    await dana.patch(`/api/time/${entry.id}`, { hours: 'bad' }),
    await dana.del(`/api/time/${entry.id}`),
  ]) {
    assert.equal(res.status, 409);
  }
  assert.equal(count('time_entries'), before);
  const read = await dana.get(`/api/issues/${item.id}/time`);
  assert.equal(read.status, 200);
  assert.equal(read.body.entries.length, 1);
});

test('time can be logged, edited and deleted on an item in a completed sprint (AC 9)', async () => {
  const p = await createProject(app);
  const sprint = await sprintOf(p.id);
  const item = await createItem(app, p.id, { sprint_id: sprint.id, estimate_hours: 2 });
  await app.patch(`/api/issues/${item.id}`, { status: terminalStatus() });
  await app.post(`/api/sprints/${sprint.id}/start`);
  assert.equal((await app.post(`/api/sprints/${sprint.id}/complete`, { disposition: 'backlog' })).status, 200);
  const e = await logTime(app, item.id, { hours: 1.25 });
  assert.equal(e.status, 201);
  assert.equal((await app.patch(`/api/time/${e.body.id}`, { hours: 2 })).status, 200);
  assert.equal((await sprintRow(p.id, sprint.id)).time_spent_hours, 2);
  assert.equal((await app.del(`/api/time/${e.body.id}`)).status, 204);
  // The estimate stays editable there too (AC 37).
  const est = await app.patch(`/api/issues/${item.id}`, { estimate_hours: 3 });
  assert.equal(est.status, 200);
  assert.equal(est.body.estimate_hours, 3);
});

// ---------- reading and per-item totals (AC 10, 11) ----------

test('GET time: newest work date first, ties by id; exact quarter-hour total (AC 10)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const empty = await app.get(`/api/issues/${item.id}/time`);
  assert.deepEqual(empty.body, { entries: [], total_hours: 0 });
  const a = (await logTime(app, item.id, { hours: 0.25, date: dayOffset(-3) })).body;
  const b = (await logTime(app, item.id, { hours: 1.5, date: dayOffset(-1) })).body;
  const c = (await logTime(app, item.id, { hours: 0.75, date: dayOffset(-1) })).body;
  const d = (await logTime(app, item.id, { hours: 2.25, date: dayOffset(-2) })).body;
  const res = await app.get(`/api/issues/${item.id}/time`);
  assert.deepEqual(res.body.entries.map((e) => e.id), [c.id, b.id, d.id, a.id]);
  assert.equal(res.body.total_hours, 4.75);
  const missing = await app.get('/api/issues/999999/time');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'Work item not found.');
});

test('time_spent_hours on the item list and the single item, 0 when none (AC 11)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const other = await createItem(app, p.id);
  const epic = await createItem(app, p.id, { type: EPIC_TYPE });
  assert.equal(item.time_spent_hours, 0);
  await logTime(app, item.id, { hours: 0.25 });
  await logTime(app, item.id, { hours: 0.5 });
  await logTime(await app.client('blake'), item.id, { hours: 3 });
  const list = (await app.get(`/api/projects/${p.id}/issues`)).body;
  const byId = Object.fromEntries(list.map((i) => [i.id, i]));
  assert.equal(byId[item.id].time_spent_hours, 3.75);
  assert.equal(byId[other.id].time_spent_hours, 0);
  assert.equal(byId[epic.id].time_spent_hours, 0);
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.time_spent_hours, 3.75);
  for (const i of list) assert.ok(!('estimate_minutes' in i) && !('time_spent_minutes' in i), 'minutes stay internal');
});

test('deleting a work item deletes its time entries (AC 12)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const entry = (await logTime(app, item.id, { hours: 1 })).body;
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE id = ?').get(entry.id).n, 0);
});

// ---------- sprint rollup (AC 13-15, 39, 40) ----------

test('sprint rollup: logged and estimated hours follow the items between sprints (AC 13, 14, 39, 40)', async () => {
  const p = await createProject(app);
  const s1 = await sprintOf(p.id, 'One');
  const s2 = await sprintOf(p.id, 'Two');
  const empty = await sprintRow(p.id, s1.id);
  assert.equal(empty.time_spent_hours, 0);
  assert.equal(empty.estimate_hours, 0);
  assert.equal(empty.unestimated_count, 0);
  const a = await createItem(app, p.id, { sprint_id: s1.id, estimate_hours: 8 });
  const b = await createItem(app, p.id, { sprint_id: s1.id, estimate_hours: 4.25 });
  const c = await createItem(app, p.id, { sprint_id: s1.id }); // unestimated
  const done = await createItem(app, p.id, { sprint_id: s1.id, estimate_hours: 1, type: OTHER_TYPE });
  await app.patch(`/api/issues/${done.id}`, { status: terminalStatus() });
  await createItem(app, p.id, { type: EPIC_TYPE }); // never in a sprint
  await logTime(app, a.id, { hours: 1.5 });
  await logTime(await app.client('dana'), a.id, { hours: 0.25, date: dayOffset(-30) });
  await logTime(app, c.id, { hours: 2 });
  await logTime(app, done.id, { hours: 0.75 });
  let one = await sprintRow(p.id, s1.id);
  assert.equal(one.time_spent_hours, 4.5, 'every entry on items in the sprint, done items included');
  assert.equal(one.estimate_hours, 13.25);
  assert.equal(one.unestimated_count, 1);
  // Move a to sprint two: its hours and estimate go with it.
  await app.patch(`/api/issues/${a.id}`, { sprint_id: s2.id });
  one = await sprintRow(p.id, s1.id);
  const two = await sprintRow(p.id, s2.id);
  assert.deepEqual([one.time_spent_hours, one.estimate_hours, one.unestimated_count], [2.75, 5.25, 1]);
  assert.deepEqual([two.time_spent_hours, two.estimate_hours, two.unestimated_count], [1.75, 8, 0]);
  // To the backlog, a new estimate, and a deletion.
  await app.patch(`/api/issues/${b.id}`, { sprint_id: null });
  await app.patch(`/api/issues/${c.id}`, { estimate_hours: 0.5 });
  one = await sprintRow(p.id, s1.id);
  assert.deepEqual([one.time_spent_hours, one.estimate_hours, one.unestimated_count], [2.75, 1.5, 0]);
  await app.del(`/api/issues/${c.id}`);
  one = await sprintRow(p.id, s1.id);
  assert.deepEqual([one.time_spent_hours, one.estimate_hours], [0.75, 1]);
  // Nothing is stored on the sprint.
  const columns = app.db.prepare('PRAGMA table_info(sprints)').all().map((col) => col.name);
  assert.ok(!columns.some((col) => /time|estimate/.test(col)));
});

test('completing a sprint moves unfinished items with their hours and estimates (AC 40, Decision 1)', async () => {
  const p = await createProject(app);
  const s1 = await sprintOf(p.id, 'One');
  const open = await createItem(app, p.id, { sprint_id: s1.id, estimate_hours: 5 });
  const done = await createItem(app, p.id, { sprint_id: s1.id, estimate_hours: 2 });
  await app.patch(`/api/issues/${done.id}`, { status: terminalStatus() });
  await logTime(app, open.id, { hours: 3 });
  await logTime(app, done.id, { hours: 1 });
  await app.post(`/api/sprints/${s1.id}/start`);
  const res = await app.post(`/api/sprints/${s1.id}/complete`, { disposition: 'new-sprint' });
  assert.equal(res.body.sprint.time_spent_hours, 1);
  assert.equal(res.body.sprint.estimate_hours, 2);
  assert.equal(res.body.created_sprint.time_spent_hours, 3);
  assert.equal(res.body.created_sprint.estimate_hours, 5);
});

// ---------- estimate on the item (AC 34, 35, 37, 38) ----------

test('estimate: a table of accepted and rejected values; null and empty clear; omitted keeps (AC 34, 35)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  assert.equal(item.estimate_hours, null, 'never 0 as a stand-in');
  assert.equal(item.remaining_hours, null);
  for (const [value, expected] of [[8, 8], [0.25, 0.25], [1000, 1000], [12.75, 12.75], [null, null], [5, 5], ['', null]]) {
    const res = await app.patch(`/api/issues/${item.id}`, { estimate_hours: value });
    assert.equal(res.status, 200, JSON.stringify(value));
    assert.equal(res.body.estimate_hours, expected, JSON.stringify(value));
  }
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: 6 });
  for (const value of [0, -1, 0.1, 1000.25, 'abc', '8', '8h', true, {}]) {
    const res = await app.patch(`/api/issues/${item.id}`, { estimate_hours: value });
    assert.equal(res.status, 400, JSON.stringify(value));
    assert.equal(res.body.error, ESTIMATE_MESSAGE);
  }
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.estimate_hours, 6, 'nothing changed');
  assert.equal((await app.patch(`/api/issues/${item.id}`, { title: 'Renamed' })).body.estimate_hours, 6, 'omitted leaves it');
  assert.equal(app.db.prepare('SELECT estimate_minutes FROM issues WHERE id = ?').get(item.id).estimate_minutes, 360, 'stored as minutes');
  // On create.
  assert.equal((await createItem(app, p.id, { estimate_hours: 2.5 })).estimate_hours, 2.5);
  assert.equal((await createItem(app, p.id, { estimate_hours: '' })).estimate_hours, null);
  assert.equal((await app.post(`/api/projects/${p.id}/issues`, { title: 'x', estimate_hours: 0 })).status, 400);
});

test('remaining_hours: under, equal and over; null without an estimate (AC 38)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id, { estimate_hours: 4 });
  assert.equal(item.remaining_hours, 4);
  await logTime(app, item.id, { hours: 2.5 });
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.remaining_hours, 1.5, 'under');
  await logTime(app, item.id, { hours: 1.5 });
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.remaining_hours, 0, 'equal');
  await logTime(app, item.id, { hours: 2.25 });
  const over = (await app.get(`/api/issues/${item.id}`)).body;
  assert.equal(over.remaining_hours, -2.25, 'over is negative');
  assert.equal(over.time_spent_hours, 6.25);
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: null });
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.remaining_hours, null);
});

test('estimate permissions: Viewer 403, Member 200, archived 409 (AC 37)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const viewer = await app.client('casey');
  const denied = await viewer.patch(`/api/issues/${item.id}`, { estimate_hours: 3 });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, `Your group (${VIEWER}) is not allowed to ${groups.actionOf('write')}.`);
  const member = await app.client('blake');
  const ok = await member.patch(`/api/issues/${item.id}`, { estimate_hours: 3 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.estimate_hours, 3);
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  assert.equal((await member.patch(`/api/issues/${item.id}`, { estimate_hours: 4 })).status, 409);
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.estimate_hours, 3);
});

// ---------- history (AC 31, 49, 50) ----------

test('estimate history: one change with hours text; no-op and creation write none (AC 49, 50)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id, { estimate_hours: 8 });
  const events = async () => (await app.get(`/api/issues/${item.id}/history`)).body.events;
  let list = await events();
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'created');
  assert.deepEqual(list[0].changes, [], 'creation writes no field change');
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: 12 });
  list = await events();
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].changes.map((c) => [c.field, c.label, c.old, c.new]), [['estimate', 'Estimate', '8', '12']]);
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: 12 });
  assert.equal((await events()).length, 2, 'same value writes nothing');
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: 0.25 });
  await app.patch(`/api/issues/${item.id}`, { estimate_hours: null });
  list = await events();
  assert.deepEqual(list[1].changes.map((c) => [c.old, c.new]), [['12', '0.25']]);
  assert.deepEqual(list[0].changes.map((c) => [c.old, c.new]), [['0.25', null]], 'clearing records old and null');
  const filtered = await app.get(`/api/issues/${item.id}/history?field=estimate`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.events.length, 3);
  const fields = (await app.get('/api/history-fields')).body;
  assert.deepEqual(fields.find((f) => f.key === 'estimate'), { key: 'estimate', label: 'Estimate', kind: 'text' });
});

const timeChanges = async (issueId) =>
  (await app.get(`/api/issues/${issueId}/history?field=time_entry`)).body.events.map((e) => ({
    actor: e.actor_name,
    changes: e.changes.map((c) => [c.field, c.label, c.kind, c.old, c.new, c.old_id, c.new_id]),
  }));

test('logging, editing and deleting a time entry each write one history event (AC 31)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const blake = await app.client('blake');
  const blakeName = (await app.get('/api/users')).body.find((u) => u.username === 'blake').name;
  const yesterday = dayOffset(-1);
  const e = (await logTime(blake, item.id, { hours: 1.5, date: TODAY, note: 'fix login' })).body;
  let list = await timeChanges(item.id);
  assert.deepEqual(list, [
    { actor: blakeName, changes: [['time_entry', 'Time entry', 'time-entry', null, `1.5 h on ${TODAY}: fix login`, null, e.id]] },
  ]);
  await blake.patch(`/api/time/${e.id}`, { hours: 2, date: yesterday, note: '' });
  list = await timeChanges(item.id);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].changes, [
    ['time_entry', 'Time entry', 'time-entry', `1.5 h on ${TODAY}: fix login`, `2 h on ${yesterday}`, e.id, e.id],
  ]);
  await blake.patch(`/api/time/${e.id}`, { hours: 2, date: yesterday });
  assert.equal((await timeChanges(item.id)).length, 2, 'a PATCH that changes nothing writes nothing');
  await blake.del(`/api/time/${e.id}`);
  list = await timeChanges(item.id);
  assert.equal(list.length, 3);
  assert.deepEqual(list[0], {
    actor: blakeName,
    changes: [['time_entry', 'Time entry', 'time-entry', `2 h on ${yesterday}`, null, e.id, null]],
  });
  // Unfiltered, the events sit in the item's history with everything else.
  const all = (await app.get(`/api/issues/${item.id}/history`)).body.events;
  assert.deepEqual(all.map((ev) => ev.kind), ['changed', 'changed', 'changed', 'created']);
  const fields = (await app.get('/api/history-fields')).body;
  assert.deepEqual(fields.find((f) => f.key === 'time_entry'), { key: 'time_entry', label: 'Time entry', kind: 'time-entry' });
});

test('time entry history: long notes are shortened; a note-only edit still differs (AC 31)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const long = 'a'.repeat(100);
  const e = (await logTime(app, item.id, { hours: 1, note: long })).body;
  let [latest] = await timeChanges(item.id);
  assert.equal(latest.changes[0][4], `1 h on ${TODAY}: ${'a'.repeat(57)}...`);
  await app.patch(`/api/time/${e.id}`, { note: `${long}b` });
  [latest] = await timeChanges(item.id);
  assert.equal(latest.changes[0][3], `1 h on ${TODAY}: ${long}`, 'full notes when the excerpts match');
  assert.equal(latest.changes[0][4], `1 h on ${TODAY}: ${long}b`);
});

test('rejected time writes record nothing; a failing record rolls the entry back (AC 31)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const dana = await app.client('dana');
  const entry = (await logTime(dana, item.id, { hours: 1 })).body;
  const before = count('issue_history_events');
  assert.equal((await logTime(dana, item.id, { hours: 0 })).status, 400);
  assert.equal((await dana.patch(`/api/time/${entry.id}`, { hours: 25 })).status, 400);
  assert.equal((await app.patch(`/api/time/${entry.id}`, { hours: 2 })).status, 403, 'not the author');
  assert.equal((await app.del(`/api/time/${entry.id}`)).status, 403);
  assert.equal(count('issue_history_events'), before);

  const history = require('../server/data/history');
  const original = history.recordTimeEntryChange;
  history.recordTimeEntryChange = () => { throw new Error('boom'); };
  const entries = count('time_entries');
  try {
    assert.equal((await logTime(dana, item.id, { hours: 3 })).status, 500);
    assert.equal((await dana.patch(`/api/time/${entry.id}`, { hours: 4 })).status, 500);
    assert.equal((await dana.del(`/api/time/${entry.id}`)).status, 500);
  } finally {
    history.recordTimeEntryChange = original;
  }
  assert.equal(count('time_entries'), entries, 'no entry added or deleted');
  assert.equal((await dana.get(`/api/issues/${item.id}/time`)).body.entries[0].hours, 1, 'edit rolled back');
  assert.equal(count('issue_history_events'), before);

  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  const archived = count('issue_history_events');
  assert.equal((await logTime(dana, item.id, { hours: 1 })).status, 409);
  assert.equal((await dana.del(`/api/time/${entry.id}`)).status, 409);
  assert.equal(count('issue_history_events'), archived, 'archived 409 writes nothing');
});
