// Migration of an existing database to sprint scope-change tracking
// (docs/specs/sprint-scope-change.md AC 2, 4, 15, 21, 24, Decision 7). The
// "pre-feature" database is a current one with the scope tables and the
// sprints.baseline_* columns removed, filled through plain SQL: one project
// with a Completed, an Active and a Planned sprint.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tempDbPath, startServer } = require('./helpers');
const { openDb } = require('../server/db');
const { TYPES } = require('../server/types');
const { STATUSES } = require('../server/statuses');
const { defaultResolution } = require('../server/resolutions');
const { activeSprintState, finalSprintState, initialSprintState } = require('../server/sprintStates');
const { SCOPE } = require('../server/scopeEvents');
const { GRACE_PERIOD_MS } = require('../server/scopePolicy');

const EPIC = TYPES.find((t) => t.isEpic).name;
const TASK = TYPES.find((t) => !t.isEpic).name;
const OLD = '2026-01-01T00:00:00.000Z';
const STARTED = '2026-01-05T09:00:00.000Z';

function preFeatureDb() {
  const dbPath = tempDbPath();
  openDb(dbPath).close();
  const db = new Database(dbPath);
  db.exec(`
    DROP TABLE sprint_scope_events;
    DROP TABLE sprint_baseline_items;
    ALTER TABLE sprints DROP COLUMN baseline_item_count;
    ALTER TABLE sprints DROP COLUMN baseline_minutes;
    ALTER TABLE sprints DROP COLUMN baseline_at;
  `);
  db.prepare("INSERT INTO projects (id, name, key, status, archived, next_issue_number, created_at) VALUES (1, 'Live', 'LIVE', ?, 0, 10, ?)").run(STATUSES[0], OLD);
  const sprint = db.prepare('INSERT INTO sprints (id, project_id, name, goal, state, created_at, started_at, completed_at) VALUES (?, 1, ?, \'\', ?, ?, ?, ?)');
  sprint.run(1, 'Sprint 1', finalSprintState(), OLD, OLD, STARTED);
  sprint.run(2, 'Sprint 2', activeSprintState(), OLD, STARTED, null);
  sprint.run(3, 'Sprint 3', initialSprintState(), OLD, null, null);
  const item = db.prepare(
    `INSERT INTO issues (project_id, number, key, type, title, status, priority, rank, sprint_id, sprint_rank, estimate_minutes, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, 'Medium', ?, ?, ?, ?, ?, ?)`
  );
  item.run(1, 'LIVE-1', TASK, 'done long ago', STATUSES[STATUSES.length - 1], 1000, 1, 1000, 120, OLD, OLD);
  db.prepare('UPDATE issues SET resolution = ? WHERE id = 1').run(defaultResolution()); // terminal items carry one
  item.run(2, 'LIVE-2', TASK, 'running a', STATUSES[0], 2000, 2, 1000, 240, OLD, OLD);
  item.run(3, 'LIVE-3', TASK, 'running b', STATUSES[0], 3000, 2, 2000, null, OLD, OLD);
  item.run(4, 'LIVE-4', TASK, 'running c', STATUSES[0], 4000, 2, 3000, 90, OLD, OLD);
  item.run(5, 'LIVE-5', TASK, 'planned', STATUSES[0], 5000, 3, 1000, 60, OLD, OLD);
  item.run(6, 'LIVE-6', EPIC, 'an epic', STATUSES[0], 6000, null, null, null, OLD, OLD);
  db.close();
  return dbPath;
}

const sprintsOf = (db) => db.prepare('SELECT * FROM sprints ORDER BY id').all();

test('the Active sprint is baselined from its current state at migration time; others untouched (AC 4)', () => {
  const dbPath = preFeatureDb();
  const raw = new Database(dbPath);
  const itemsBefore = raw.prepare('SELECT * FROM issues ORDER BY id').all();
  const sprintEventsBefore = raw.prepare('SELECT COUNT(*) AS n FROM sprint_events').get().n;
  raw.close();

  const from = new Date().toISOString();
  const db = openDb(dbPath);
  const to = new Date().toISOString();
  const [completed, active, planned] = sprintsOf(db);
  assert.deepEqual([active.baseline_item_count, active.baseline_minutes], [3, 330]);
  assert.ok(active.baseline_at >= from && active.baseline_at <= to, 'baseline_at is the migration time');
  assert.equal(active.started_at, STARTED, 'started_at unchanged');
  const baseline = db.prepare('SELECT issue_id, issue_key, estimate_minutes FROM sprint_baseline_items WHERE sprint_id = 2 ORDER BY issue_id').all();
  assert.deepEqual(baseline, [
    { issue_id: 2, issue_key: 'LIVE-2', estimate_minutes: 240 },
    { issue_id: 3, issue_key: 'LIVE-3', estimate_minutes: null },
    { issue_id: 4, issue_key: 'LIVE-4', estimate_minutes: 90 },
  ]);
  for (const s of [completed, planned]) {
    assert.deepEqual([s.baseline_item_count, s.baseline_minutes, s.baseline_at], [null, null, null], s.name);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_baseline_items WHERE sprint_id <> 2').get().n, 0);
  assert.deepEqual(db.prepare('SELECT * FROM issues ORDER BY id').all(), itemsBefore, 'item data (updated_at included) unchanged');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_scope_events').get().n, 0, 'no scope events backfilled');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_events').get().n, sprintEventsBefore, 'no sprint events');
  db.close();
});

test('the migration is idempotent and writes nothing on a fresh database (AC 2, 4)', () => {
  const dbPath = preFeatureDb();
  const first = openDb(dbPath);
  const sprints = sprintsOf(first);
  const rows = first.prepare('SELECT COUNT(*) AS n FROM sprint_baseline_items').get().n;
  first.close();
  const again = openDb(dbPath);
  assert.deepEqual(sprintsOf(again), sprints, 'same baseline_at, count and minutes');
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM sprint_baseline_items').get().n, rows);
  const columns = again.prepare('PRAGMA table_info(sprints)').all().filter((c) => c.name.startsWith('baseline_'));
  assert.deepEqual(columns.map((c) => [c.name, c.type, c.notnull]), [
    ['baseline_item_count', 'INTEGER', 0],
    ['baseline_minutes', 'INTEGER', 0],
    ['baseline_at', 'TEXT', 0],
  ]);
  const index = again.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_sprint_scope_events_sprint'").get();
  assert.match(index.sql, /sprint_scope_events\s*\(\s*sprint_id\s*,\s*id\s*\)/);
  const fks = again.prepare('PRAGMA foreign_key_list(sprint_scope_events)').all();
  assert.deepEqual(fks, [], 'no foreign keys on the event log');
  again.close();

  const fresh = openDb(tempDbPath());
  assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM sprints').get().n, 0);
  assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM sprint_baseline_items').get().n, 0);
  fresh.close();
});

test('the migrated sprint: tracked, baseline_late, grace from the capture time, reconciles; never "not tracked" (AC 15, 17, 24)', async () => {
  const dbPath = preFeatureDb();
  const app = await startServer(dbPath);
  try {
    const active = app.db.prepare('SELECT * FROM sprints WHERE id = 2').get();
    let sum = (await app.get('/api/sprints/2/scope')).body;
    assert.equal(sum.tracked, true);
    assert.equal(sum.baseline_late, true);
    assert.equal(sum.started_at, STARTED);
    assert.equal(sum.baseline_at, active.baseline_at);
    assert.equal(sum.grace_ends_at, new Date(Date.parse(active.baseline_at) + GRACE_PERIOD_MS).toISOString(), 'measured from the capture, not started_at');
    assert.deepEqual(sum.baseline, { item_count: 3, hours: 5.5 });
    assert.equal(sum.current_total_hours, 5.5);
    // Right after migration: in grace, although started_at is long past.
    const added = (await app.post('/api/projects/1/issues', { title: 'new', sprint_id: 2, estimate_hours: 2 })).body;
    await app.patch('/api/issues/2', { estimate_hours: 5 });
    sum = (await app.get('/api/sprints/2/scope')).body;
    assert.deepEqual(sum.events.map((e) => [e.kind, e.in_grace]), [[SCOPE.added, true], [SCOPE.estimate_changed, true]]);
    assert.equal(sum.planned_hours, 8.5);
    const flagged = (await app.get('/api/projects/1/issues')).body;
    assert.ok(flagged.every((i) => i.added_after_start === false), 'items from before migration and grace adds are not badged');
    // After its grace period: changes count and badge.
    const ms = GRACE_PERIOD_MS + 60 * 60 * 1000;
    const back = (iso) => new Date(Date.parse(iso) - ms).toISOString();
    app.db.prepare('UPDATE sprints SET baseline_at = ? WHERE id = 2').run(back(active.baseline_at));
    for (const e of app.db.prepare('SELECT id, created_at FROM sprint_scope_events').all()) {
      app.db.prepare('UPDATE sprint_scope_events SET created_at = ? WHERE id = ?').run(back(e.created_at), e.id);
    }
    await app.patch('/api/issues/3', { sprint_id: null });
    const late = (await app.post('/api/projects/1/issues', { title: 'late', sprint_id: 2, estimate_hours: 1 })).body;
    sum = (await app.get('/api/sprints/2/scope')).body;
    assert.deepEqual([sum.added.count, sum.removed.count], [1, 1]);
    const live = (await app.get('/api/projects/1/sprints')).body.find((s) => s.id === 2).estimate_hours;
    assert.equal(sum.current_total_hours, live, 'reconciles from the baseline on');
    assert.equal((await app.get(`/api/issues/${late.id}`)).body.added_after_start, true);
    assert.equal((await app.get(`/api/issues/${added.id}`)).body.added_after_start, false);
    // Completed before the feature: not tracked. Planned: not tracked yet.
    for (const id of [1, 3]) {
      const other = (await app.get(`/api/sprints/${id}/scope`)).body;
      assert.equal(other.tracked, false, `sprint ${id}`);
      assert.deepEqual(other.events, []);
    }
  } finally {
    await app.close();
  }
});
