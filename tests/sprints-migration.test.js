// Migration of an existing database to sprints (docs/specs/sprints-and-backlog.md
// AC 4-6, 46, Decision 10). The "legacy" database is a current one with the
// sprint columns removed (as before this spec), filled through plain SQL.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { tempDbPath, startServer } = require('./helpers');
const { openDb } = require('../server/db');
const { TYPES } = require('../server/types');
const { STATUSES } = require('../server/statuses');
const { activeSprintState, finalSprintState } = require('../server/sprintStates');

const EPIC = TYPES.find((t) => t.isEpic).name;
const TASK = TYPES.find((t) => !t.isEpic).name;
const OLD = '2026-01-01T00:00:00.000Z';

// A database as it was before this spec: no sprint tables, no sprint columns.
function legacyDb() {
  const dbPath = tempDbPath();
  openDb(dbPath).close();
  const db = new Database(dbPath);
  db.exec(`
    DROP INDEX IF EXISTS idx_issues_sprint;
    DROP INDEX IF EXISTS idx_sprints_one_active;
    ALTER TABLE issues DROP COLUMN sprint_id;
    ALTER TABLE issues DROP COLUMN sprint_rank;
    DROP TABLE sprint_event_changes;
    DROP TABLE sprint_events;
    DROP TABLE sprints;
  `);
  const project = db.prepare('INSERT INTO projects (name, key, status, archived, next_issue_number, created_at) VALUES (?, ?, ?, ?, 10, ?)');
  project.run('Live', 'LIVE', 'In Progress', 0, OLD); // 1: items and an epic
  project.run('Gone', 'GONE', 'Completed', 1, OLD); // 2: archived with items
  project.run('Epics only', 'EPIC', 'Planning', 0, OLD); // 3: only an epic
  project.run('Empty', 'NONE', 'Planning', 0, OLD); // 4: nothing
  const item = db.prepare(
    `INSERT INTO issues (project_id, number, key, type, title, status, priority, epic_id, rank, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Medium', ?, ?, ?, ?)`
  );
  item.run(1, 1, 'LIVE-1', EPIC, 'Epic', STATUSES[0], null, 500, OLD, OLD);
  item.run(1, 2, 'LIVE-2', TASK, 'b', STATUSES[1], 1, 3000, OLD, OLD);
  item.run(1, 3, 'LIVE-3', TASK, 'a', STATUSES[0], null, 1000, OLD, OLD);
  item.run(1, 4, 'LIVE-4', TASK, 'c', STATUSES[1], null, 2000, OLD, OLD);
  item.run(1, 5, 'LIVE-5', 'Retired type', 'd', STATUSES[2], null, 2000, OLD, OLD);
  item.run(2, 1, 'GONE-1', TASK, 'g', STATUSES[0], null, 1000, OLD, OLD);
  item.run(3, 1, 'EPIC-1', EPIC, 'only', STATUSES[0], null, 1000, OLD, OLD);
  db.close();
  return dbPath;
}

test('the migration puts each project\'s non-epic items in one Sprint 1 (AC 4)', () => {
  const dbPath = legacyDb();
  const before = new Database(dbPath);
  const itemsBefore = before.prepare('SELECT * FROM issues ORDER BY id').all();
  before.close();

  const db = openDb(dbPath);
  const sprints = db.prepare('SELECT * FROM sprints ORDER BY project_id').all();
  assert.deepEqual(sprints.map((s) => [s.project_id, s.name, s.state]), [
    [1, 'Sprint 1', activeSprintState()],
    [2, 'Sprint 1', finalSprintState()],
  ]);
  const [live, gone] = sprints;
  assert.ok(live.started_at);
  assert.equal(live.completed_at, null);
  assert.ok(gone.started_at && gone.completed_at, 'archived: started and completed at the migration time');
  assert.equal(live.goal, '');
  assert.equal(live.start_date, null);

  const rows = db.prepare('SELECT key, sprint_id, sprint_rank FROM issues ORDER BY project_id, sprint_rank, id').all();
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  // Rank order (ties by id): LIVE-3 (1000), LIVE-4 (2000), LIVE-5 (2000), LIVE-2 (3000).
  const liveOrder = rows.filter((r) => r.sprint_id === live.id).map((r) => [r.key, r.sprint_rank]);
  assert.deepEqual(liveOrder, [['LIVE-3', 1000], ['LIVE-4', 2000], ['LIVE-5', 3000], ['LIVE-2', 4000]]);
  assert.deepEqual([byKey['GONE-1'].sprint_id, byKey['GONE-1'].sprint_rank], [gone.id, 1000]);
  for (const key of ['LIVE-1', 'EPIC-1']) assert.deepEqual([byKey[key].sprint_id, byKey[key].sprint_rank], [null, null], key);

  // Nothing else changes: no updated_at, no history, no sprint events.
  const after = db.prepare('SELECT * FROM issues ORDER BY id').all();
  assert.deepEqual(after.map(({ sprint_id, sprint_rank, ...rest }) => rest), itemsBefore);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM issue_history_events').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprint_events').get().n, 0, 'no backfilled events (AC 46)');
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'idx_sprints_one_active'").get());
  db.close();
});

test('the migration runs once: reopening creates no extra sprints (AC 5)', () => {
  const dbPath = legacyDb();
  openDb(dbPath).close();
  const db = openDb(dbPath);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sprints').get().n, 2);
  db.close();
  const again = openDb(dbPath);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM sprints').get().n, 2);
  again.close();
});

test('after migration the board shows the same non-epic items in the same order; history is empty (AC 6, 46)', async () => {
  const dbPath = legacyDb();
  const legacy = new Database(dbPath);
  const boardBefore = legacy
    .prepare('SELECT key, status FROM issues WHERE project_id = 1 AND type <> ? ORDER BY rank, id')
    .all(EPIC);
  legacy.close();
  const app = await startServer(dbPath);
  try {
    const active = (await app.get('/api/projects/1/issues?sprint=active')).body;
    // The board draws per status column in rank order: same as before per column.
    for (const status of STATUSES) {
      assert.deepEqual(
        active.filter((i) => i.status === status).sort((a, b) => a.rank - b.rank || a.id - b.id).map((i) => i.key),
        boardBefore.filter((i) => i.status === status).map((i) => i.key),
        status
      );
    }
    assert.ok(!active.some((i) => i.type === EPIC), 'epics are not cards');
    const all = (await app.get('/api/projects/1/issues')).body;
    assert.ok(all.some((i) => i.type === EPIC), 'epics still listed for swimlanes and pickers');
    assert.deepEqual((await app.get('/api/projects/1/sprint-history')).body.events, []);
    assert.deepEqual((await app.get('/api/projects/1/issues?sprint=backlog')).body, [], 'the backlog starts empty');
    assert.deepEqual((await app.get('/api/projects/3/sprints')).body, [], 'only epics: no sprint');
    assert.deepEqual((await app.get('/api/projects/4/sprints')).body, []);
  } finally {
    await app.close();
  }
});
