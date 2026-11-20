// The daily report endpoint (docs/specs/daily-report.md AC 6-8, 11, 22-25,
// and Amendment 1 AC 33, 34):
// GET /api/projects/:id/report. Runs against its own temporary database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const { STATUSES, terminalStatus, startedStatus } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { defaultResolution } = require('../server/resolutions');

const [, , VIEWER] = groups.groupNames();
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const DAY = '2025-01-15'; // a past work date, so time entries are accepted
const HOUR = 3600000;

let app;
let ids; // user ids by username
let blake;
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
  blake = await app.client('blake');
});
test.after(async () => { await app.close(); });

// A window around now (history and comments are stamped with the real clock).
function windowNow() {
  const now = Date.now();
  return { from: new Date(now - HOUR).toISOString(), to: new Date(now + HOUR).toISOString() };
}

// `day` (the original one-day form) unless from_day/to_day are given.
const reportUrl = (projectId, { user = ids.alex, from, to, day = DAY, from_day, to_day } = {}) => {
  const params = new URLSearchParams({ user: String(user), from, to });
  if (from_day !== undefined || to_day !== undefined) {
    params.set('from_day', from_day);
    params.set('to_day', to_day);
  } else {
    params.set('day', day);
  }
  return `/api/projects/${projectId}/report?${params}`;
};

test('Yesterday: status changes, created, comments and time by the person, one line per item by number (AC 6, 8, 22, 25)', async () => {
  const w = windowNow();
  const p = await createProject(app);
  const a = await createItem(app, p.id, { title: 'Alpha' }); // created by alex
  await app.patch(`/api/issues/${a.id}`, { status: STATUSES[1] });
  await app.patch(`/api/issues/${a.id}`, { status: startedStatus() });
  await app.post(`/api/issues/${a.id}/comments`, { body: 'one' });
  await app.post(`/api/issues/${a.id}/comments`, { body: 'two' });
  await app.post(`/api/issues/${a.id}/time`, { hours: 1.5, date: DAY });

  const b = await createItem(blake, p.id, { title: 'Beta' }); // blake's item
  await app.patch(`/api/issues/${b.id}`, { status: terminalStatus() }); // alex completes it
  await app.post(`/api/issues/${b.id}/time`, { hours: 0.75, date: DAY });
  await app.post(`/api/issues/${b.id}/time`, { hours: 1, date: '2025-01-14' }); // another day: not counted

  const res = await app.get(reportUrl(p.id, w));
  assert.equal(res.status, 200);
  assert.equal(res.body.total_minutes, 90 + 45);
  assert.deepEqual(res.body.items, [
    {
      issue_id: a.id,
      key: a.key,
      title: 'Alpha',
      type: a.type,
      status_changes: [
        { from: STATUSES[0], to: STATUSES[1] },
        { from: STATUSES[1], to: startedStatus() },
      ],
      resolution: null,
      created: true,
      comments: 2,
      minutes: 90,
    },
    {
      issue_id: b.id,
      key: b.key,
      title: 'Beta',
      type: b.type,
      status_changes: [{ from: STATUSES[0], to: terminalStatus() }],
      resolution: defaultResolution(),
      created: false,
      comments: 0,
      minutes: 45,
    },
  ]);
});

test('other people, other edits, other projects and deleted items never appear (AC 6, 24)', async () => {
  const w = windowNow();
  const p = await createProject(app);
  const other = await createProject(app);
  const theirs = await createItem(blake, p.id, { title: 'Blake only' });
  await blake.patch(`/api/issues/${theirs.id}`, { status: STATUSES[1] });
  await blake.post(`/api/issues/${theirs.id}/comments`, { body: 'hi' });
  await blake.post(`/api/issues/${theirs.id}/time`, { hours: 2, date: DAY });
  // alex only renames and reassigns it: not activity on its own.
  await app.patch(`/api/issues/${theirs.id}`, { title: 'Renamed', assignee_id: ids.alex });
  // alex works in another project.
  const elsewhere = await createItem(app, other.id);
  await app.post(`/api/issues/${elsewhere.id}/time`, { hours: 1, date: DAY });
  // alex works on an item that is then deleted.
  const gone = await createItem(app, p.id);
  await app.post(`/api/issues/${gone.id}/comments`, { body: 'soon gone' });
  await app.post(`/api/issues/${gone.id}/time`, { hours: 1, date: DAY });
  assert.equal((await app.del(`/api/issues/${gone.id}`)).status, 204);

  const mine = await app.get(reportUrl(p.id, w));
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body, { items: [], total_minutes: 0 });

  const blakes = (await app.get(reportUrl(p.id, { ...w, user: ids.blake }))).body;
  assert.deepEqual(blakes.items.map((i) => [i.key, i.created, i.comments, i.minutes, i.status_changes.length]), [[theirs.key, true, 1, 120, 1]]);
  assert.equal(blakes.total_minutes, 120);
});

test('a change that ends where it started is still returned; epics are included with their type (AC 8, 11)', async () => {
  const w = windowNow();
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { title: 'Big', type: EPIC_TYPE });
  await app.patch(`/api/issues/${epic.id}`, { status: STATUSES[1] });
  await app.patch(`/api/issues/${epic.id}`, { status: STATUSES[0] });
  const body = (await app.get(reportUrl(p.id, w))).body;
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].type, EPIC_TYPE);
  assert.deepEqual(body.items[0].status_changes, [
    { from: STATUSES[0], to: STATUSES[1] },
    { from: STATUSES[1], to: STATUSES[0] },
  ]);
});

test('window edges: from is included, to is excluded; time entries match the day as text (AC 7, 22)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const c1 = (await app.post(`/api/issues/${item.id}/comments`, { body: 'at from' })).body;
  const c2 = (await app.post(`/api/issues/${item.id}/comments`, { body: 'at to' })).body;
  const from = '2025-01-15T05:00:00.000Z';
  const to = '2025-01-16T05:00:00.000Z';
  app.db.prepare('UPDATE comments SET created_at = ? WHERE id = ?').run(from, c1.id);
  app.db.prepare('UPDATE comments SET created_at = ? WHERE id = ?').run(to, c2.id);
  // The created event is outside this window (it happened now).
  let body = (await app.get(reportUrl(p.id, { from, to }))).body;
  assert.deepEqual(body.items.map((i) => [i.issue_id, i.comments, i.created]), [[item.id, 1, false]]);
  // Offsets are accepted and mean the same instants.
  body = (await app.get(reportUrl(p.id, { from: '2025-01-15T00:00:00-05:00', to: '2025-01-16T00:00:00-05:00' }))).body;
  assert.equal(body.items[0].comments, 1);
  // One millisecond later the first comment drops out and the second comes in.
  body = (await app.get(reportUrl(p.id, { from: '2025-01-15T05:00:00.001Z', to: '2025-01-16T05:00:00.001Z' }))).body;
  assert.equal(body.items[0].comments, 1);
  body = (await app.get(reportUrl(p.id, { from: '2025-01-16T05:00:00.001Z', to: '2025-01-17T05:00:00.000Z' }))).body;
  assert.deepEqual(body.items, []);

  // The time entry's work date, not its created_at, decides.
  await app.post(`/api/issues/${item.id}/time`, { hours: 0.25, date: '2025-01-15' });
  body = (await app.get(reportUrl(p.id, { from: '2024-06-01T00:00:00.000Z', to: '2024-06-02T00:00:00.000Z', day: '2025-01-15' }))).body;
  assert.deepEqual(body.items.map((i) => [i.issue_id, i.minutes, i.comments]), [[item.id, 15, 0]]);
  assert.equal(body.total_minutes, 15);
});

test('a Monday window: from_day..to_day counts time on Fri, Sat and Sun only; edges at Fri 00:00 and Mon 00:00 (AC 7, 22, 29, 33)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const other = await createItem(app, p.id);
  // Time entries dated Thu Nov 12 to Mon Nov 16 2026: 1h to 5h.
  const days = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'];
  for (const [i, date] of days.entries()) {
    const res = await app.post(`/api/issues/${item.id}/time`, { hours: i + 1, date });
    assert.equal(res.status, 201, date);
  }
  await app.post(`/api/issues/${other.id}/time`, { hours: 0.5, date: '2026-11-14' });
  // Fri Nov 13 00:00 to Mon Nov 16 00:00 in New York (EST, UTC-5): 72 hours.
  const from = '2026-11-13T05:00:00.000Z';
  const to = '2026-11-16T05:00:00.000Z';
  const stamps = {
    beforeFri: '2026-11-13T04:59:59.999Z', // Thu 23:59:59.999: out
    atFri: from, // Fri 00:00: in
    sunday: '2026-11-15T18:00:00.000Z', // Sun afternoon: in
    beforeMon: '2026-11-16T04:59:59.999Z', // Sun 23:59:59.999: in
    atMon: to, // Mon 00:00: out
  };
  for (const at of Object.values(stamps)) {
    const c = (await app.post(`/api/issues/${item.id}/comments`, { body: at })).body;
    app.db.prepare('UPDATE comments SET created_at = ? WHERE id = ?').run(at, c.id);
  }
  const res = await app.get(reportUrl(p.id, { from, to, from_day: '2026-11-13', to_day: '2026-11-15' }));
  assert.equal(res.status, 200);
  // The created events are outside this window (they happened now).
  assert.deepEqual(res.body.items.map((i) => [i.issue_id, i.comments, i.minutes, i.created]), [
    [item.id, 3, (2 + 3 + 4) * 60, false],
    [other.id, 0, 30, false],
  ]);
  assert.equal(res.body.total_minutes, (2 + 3 + 4) * 60 + 30);

  // A 73-hour window (the Monday after a fall-back) is accepted too (AC 32).
  const fall = await app.get(reportUrl(p.id, { from: '2026-10-30T04:00:00.000Z', to: '2026-11-02T05:00:00.000Z', from_day: '2026-10-30', to_day: '2026-11-01' }));
  assert.equal(fall.status, 200);

  // The original one-day form still works and matches from_day = to_day = day.
  const oneDay = { from: '2026-11-14T05:00:00.000Z', to: '2026-11-15T05:00:00.000Z' };
  const old = await app.get(reportUrl(p.id, { ...oneDay, day: '2026-11-14' }));
  const pair = await app.get(reportUrl(p.id, { ...oneDay, from_day: '2026-11-14', to_day: '2026-11-14' }));
  assert.equal(old.status, 200);
  assert.deepEqual(old.body, pair.body);
  assert.equal(old.body.total_minutes, 3 * 60 + 30);
});

test('validation: 400 with { error } for bad user, instants, range and day; 404 for an unknown project (AC 23)', async () => {
  const p = await createProject(app);
  const w = windowNow();
  const good = { from: w.from, to: w.to, user: ids.alex, day: DAY };
  const url = (overrides) => {
    const q = { ...good, ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
    return `/api/projects/${p.id}/report?${params}`;
  };
  const bad = [
    { user: undefined },
    { user: '0' },
    { user: '-1' },
    { user: '1.5' },
    { user: 'abc' },
    { user: '999999' },
    { from: undefined },
    { from: 'yesterday' },
    { from: '2025-01-15' },
    { to: '2025-13-40T00:00:00Z' },
    { from: w.to, to: w.from },
    { from: w.from, to: w.from },
    { from: '2025-01-01T00:00:00.000Z', to: '2025-01-04T04:00:00.001Z' }, // over 76 hours
    { day: undefined }, // none of day, from_day, to_day
    { day: '2025-02-30' },
    { day: '15/01/2025' },
    { day: '' },
    // from_day / to_day (Amendment 1, AC 34)
    { from_day: '2025-01-13' }, // day together with from_day
    { to_day: '2025-01-15' }, // day together with to_day
    { from_day: '2025-01-13', to_day: '2025-01-15' }, // day together with both
    { day: undefined, from_day: '2025-01-13' }, // only one of the pair
    { day: undefined, to_day: '2025-01-15' },
    { day: undefined, from_day: '2025-01-15', to_day: '2025-01-14' }, // from_day after to_day
    { day: undefined, from_day: '2025-01-13', to_day: '2025-01-16' }, // more than 2 days after
    { day: undefined, from_day: '2026-02-28', to_day: '2026-02-30' }, // invalid date
    { day: undefined, from_day: '2026-02-30', to_day: '2026-03-01' },
    { day: undefined, from_day: '13/01/2025', to_day: '2025-01-15' },
  ];
  for (const overrides of bad) {
    const res = await app.get(url(overrides));
    assert.equal(res.status, 400, JSON.stringify(overrides));
    assert.equal(typeof res.body.error, 'string', JSON.stringify(overrides));
  }
  // Exactly 76 hours is allowed (three days, plus an hour of DST and slack);
  // so are one, two and three days given as from_day/to_day.
  assert.equal((await app.get(url({ from: '2025-01-01T00:00:00.000Z', to: '2025-01-04T04:00:00.000Z' }))).status, 200);
  for (const to_day of ['2025-01-13', '2025-01-14', '2025-01-15']) {
    assert.equal((await app.get(url({ day: undefined, from_day: '2025-01-13', to_day }))).status, 200, to_day);
  }
  const res404 = await app.get(`/api/projects/999999/report?user=${ids.alex}&from=${encodeURIComponent(w.from)}&to=${encodeURIComponent(w.to)}&day=${DAY}`);
  assert.equal(res404.status, 404);
  assert.deepEqual(res404.body, { error: 'Project not found.' });
});

test('read-only and open to every group, archived projects included; nothing is written (AC 23)', async () => {
  const w = windowNow();
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  await app.post(`/api/issues/${item.id}/comments`, { body: 'x' });
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  try {
    const casey = await app.client('casey');
    const count = () => ['issue_history_events', 'issue_history_changes', 'comments', 'time_entries', 'issues']
      .map((t) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n);
    const before = count();
    const res = await casey.get(reportUrl(p.id, w));
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 1);
    // The from_day/to_day form too (Amendment 1, AC 34).
    const pair = await casey.get(reportUrl(p.id, { ...w, from_day: '2025-01-13', to_day: '2025-01-15' }));
    assert.equal(pair.status, 200);
    assert.equal(pair.body.items.length, 1);
    assert.deepEqual(count(), before, 'no writes, no history');

    // Archive the project (through the data layer, whatever its status rules).
    app.db.prepare('UPDATE projects SET archived = 1 WHERE id = ?').run(p.id);
    const archived = await casey.get(reportUrl(p.id, w));
    assert.equal(archived.status, 200);
    assert.equal(archived.body.items.length, 1);
  } finally {
    usersData.setUserGroup(app.db, ids.casey, groups.defaultGroup());
  }
});

test('signed out is 401 like every API route', async () => {
  const p = await createProject(app);
  const w = windowNow();
  const res = await app.raw('GET', reportUrl(p.id, w));
  assert.equal(res.status, 401);
});

test('GET /api/started-status names the first status of active work, from server/statuses.js (AC 12, 16)', async () => {
  const res = await app.get('/api/started-status');
  assert.deepEqual(res.body, { status: startedStatus() });
  const i = STATUSES.indexOf(startedStatus());
  assert.ok(i > 0 && i < STATUSES.indexOf(terminalStatus()));
});
