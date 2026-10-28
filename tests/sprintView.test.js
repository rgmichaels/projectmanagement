// The Sprints page's pure logic (public/js/sprintView.js;
// docs/specs/sprints-screen.md AC 4-6, 17-20, 27). No browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../public/js/sprintView');
const { SPRINT_STATES } = require('../server/sprintStates');
const { STATUSES } = require('../server/statuses');
const { PRIORITIES } = require('../server/priorities');
const { TYPES } = require('../server/types');

// State names come from the server list, by flag.
const ACTIVE = SPRINT_STATES.find((s) => s.active).name;
const FINAL = SPRINT_STATES.find((s) => s.final).name;
const PLANNED = SPRINT_STATES.find((s) => !s.active && !s.final).name;
const sprint = (id, state) => ({ id, name: `Sprint ${id}`, state });

test('keyNumber takes the numeric part of a key', () => {
  assert.equal(view.keyNumber('PM-2'), 2);
  assert.equal(view.keyNumber('SFPM-104'), 104);
  assert.ok(view.keyNumber('weird') > 1e9, 'no number sorts last');
});

test('defaultSprint: the active sprint (AC 4)', () => {
  // Server order: active, planned by id, completed newest first.
  const sprints = [sprint(4, ACTIVE), sprint(5, PLANNED), sprint(6, PLANNED), sprint(3, FINAL), sprint(2, FINAL)];
  assert.deepEqual(view.defaultSprint(sprints, SPRINT_STATES), { sprint: sprints[0], fallback: null });
});

test('defaultSprint: no active sprint falls back to the first planned (lowest id) (AC 4)', () => {
  const sprints = [sprint(9, PLANNED), sprint(6, PLANNED), sprint(3, FINAL)];
  const chosen = view.defaultSprint(sprints, SPRINT_STATES);
  assert.equal(chosen.sprint.id, 6);
  assert.equal(chosen.fallback, 'planned');
});

test('defaultSprint: no active or planned sprint falls back to the latest completed (AC 4)', () => {
  const sprints = [sprint(3, FINAL), sprint(2, FINAL), sprint(1, FINAL)];
  const chosen = view.defaultSprint(sprints, SPRINT_STATES);
  assert.equal(chosen.sprint.id, 3, 'first completed in server order');
  assert.equal(chosen.fallback, 'completed');
});

test('defaultSprint: no sprints at all (AC 4)', () => {
  assert.deepEqual(view.defaultSprint([], SPRINT_STATES), { sprint: null, fallback: null });
});

test('defaultSprint uses the state flags, not state names', () => {
  const states = [{ name: 'p', initial: true }, { name: 'a', active: true }, { name: 'f', final: true }];
  assert.equal(view.defaultSprint([sprint(1, 'f'), sprint(2, 'a')], states).sprint.id, 2);
  assert.equal(view.defaultSprint([sprint(1, 'f'), sprint(2, 'p')], states).sprint.id, 2);
});

test('resolveSprintParam: valid, absent and bad ?sprint= values (AC 5, 6)', () => {
  const sprints = [sprint(4, ACTIVE), sprint(5, PLANNED)];
  assert.deepEqual(view.resolveSprintParam('5', sprints), { sprint: sprints[1], invalid: false });
  assert.deepEqual(view.resolveSprintParam(null, sprints), { sprint: null, invalid: false });
  // Not a positive integer, unknown, or another project's sprint (not in this list).
  for (const bad of ['', 'abc', '0', '-4', '4.0', '1e1', '99']) {
    assert.deepEqual(view.resolveSprintParam(bad, sprints), { sprint: null, invalid: true }, bad);
  }
});

// Rows as GET /api/projects/:id/issues?sprint=<id> returns them (sprint order).
const orders = {
  types: ['t1', 't2', 't3'],
  priorities: ['p-high', 'p-mid', 'p-low'],
  statuses: ['s1', 's2', 's3'],
  epics: [{ id: 100, key: 'PM-10' }, { id: 101, key: 'PM-3' }],
  users: [{ id: 1, name: 'zoe' }, { id: 2, name: 'Adam' }, { id: 3, name: 'bea' }],
};
const rows = [
  { id: 1, key: 'PM-10', title: 'beta', type: 't2', priority: 'p-low', status: 's2', epic_id: 100, assignee_id: 1, sprint_rank: 1000 },
  { id: 2, key: 'PM-2', title: 'Alpha', type: 't1', priority: 'p-high', status: 's3', epic_id: null, assignee_id: null, sprint_rank: 2000 },
  { id: 3, key: 'PM-41', title: 'alpha', type: 't3', priority: 'p-mid', status: 's1', epic_id: 101, assignee_id: 2, sprint_rank: 3000 },
  { id: 4, key: 'PM-9', title: 'Gamma', type: 't1', priority: 'p-high', status: 's1', epic_id: null, assignee_id: 3, sprint_rank: 4000 },
  { id: 5, key: 'PM-7', title: 'delta', type: 't2', priority: 'p-mid', status: 's2', epic_id: 101, assignee_id: null, sprint_rank: 5000 },
];
const keys = (list) => list.map((r) => r.key);

test('sortRows: no column is sprint order, by sprint_rank (AC 17)', () => {
  const shuffled = [rows[3], rows[0], rows[4], rows[2], rows[1]];
  assert.deepEqual(keys(view.sortRows(shuffled, null, 'ascending', orders)), ['PM-10', 'PM-2', 'PM-41', 'PM-9', 'PM-7']);
  assert.deepEqual(keys(view.sortRows(shuffled, 'unknown', 'descending', orders)), ['PM-10', 'PM-2', 'PM-41', 'PM-9', 'PM-7']);
});

test('sortRows never mutates its input (AC 23)', () => {
  const copy = rows.map((r) => ({ ...r }));
  view.sortRows(rows, 'key', 'descending', orders);
  assert.deepEqual(rows, copy);
});

test('sortRows Key: numeric part, so PM-2 precedes PM-10 (AC 19)', () => {
  assert.deepEqual(keys(view.sortRows(rows, 'key', 'ascending', orders)), ['PM-2', 'PM-7', 'PM-9', 'PM-10', 'PM-41']);
  assert.deepEqual(keys(view.sortRows(rows, 'key', 'descending', orders)), ['PM-41', 'PM-10', 'PM-9', 'PM-7', 'PM-2']);
});

test('sortRows Title: case-insensitive; equal titles keep sprint order both ways (AC 19, 20)', () => {
  // "Alpha" (rank 2000) and "alpha" (rank 3000) tie.
  assert.deepEqual(keys(view.sortRows(rows, 'title', 'ascending', orders)), ['PM-2', 'PM-41', 'PM-10', 'PM-7', 'PM-9']);
  assert.deepEqual(keys(view.sortRows(rows, 'title', 'descending', orders)), ['PM-9', 'PM-7', 'PM-10', 'PM-2', 'PM-41']);
});

test('sortRows Type, Priority, Status: by the server list order, ties by sprint rank (AC 19, 20)', () => {
  assert.deepEqual(keys(view.sortRows(rows, 'type', 'ascending', orders)), ['PM-2', 'PM-9', 'PM-10', 'PM-7', 'PM-41']);
  assert.deepEqual(keys(view.sortRows(rows, 'type', 'descending', orders)), ['PM-41', 'PM-10', 'PM-7', 'PM-2', 'PM-9'], 'ties still ascending by rank');
  assert.deepEqual(keys(view.sortRows(rows, 'priority', 'ascending', orders)), ['PM-2', 'PM-9', 'PM-41', 'PM-7', 'PM-10'], 'highest first');
  assert.deepEqual(keys(view.sortRows(rows, 'priority', 'descending', orders)), ['PM-10', 'PM-41', 'PM-7', 'PM-2', 'PM-9']);
  assert.deepEqual(keys(view.sortRows(rows, 'status', 'ascending', orders)), ['PM-41', 'PM-9', 'PM-10', 'PM-7', 'PM-2'], 'pipeline order');
  assert.deepEqual(keys(view.sortRows(rows, 'status', 'descending', orders)), ['PM-2', 'PM-10', 'PM-7', 'PM-41', 'PM-9']);
});

test('sortRows Epic: by the epic key number; no epic last in both directions (AC 19)', () => {
  // PM-41 and PM-7 have epic PM-3, PM-10 has PM-10; PM-2 and PM-9 none.
  assert.deepEqual(keys(view.sortRows(rows, 'epic', 'ascending', orders)), ['PM-41', 'PM-7', 'PM-10', 'PM-2', 'PM-9']);
  assert.deepEqual(keys(view.sortRows(rows, 'epic', 'descending', orders)), ['PM-10', 'PM-41', 'PM-7', 'PM-2', 'PM-9']);
});

test('sortRows Assignee: case-insensitive name; Unassigned last in both directions (AC 19)', () => {
  assert.deepEqual(keys(view.sortRows(rows, 'assignee', 'ascending', orders)), ['PM-41', 'PM-9', 'PM-10', 'PM-2', 'PM-7']);
  assert.deepEqual(keys(view.sortRows(rows, 'assignee', 'descending', orders)), ['PM-10', 'PM-9', 'PM-41', 'PM-2', 'PM-7']);
});

test('sortRows: equal sprint_rank breaks by key number (AC 20)', () => {
  const same = [
    { id: 1, key: 'PM-12', title: 'x', sprint_rank: 1000 },
    { id: 2, key: 'PM-3', title: 'x', sprint_rank: 1000 },
    { id: 3, key: 'PM-1', title: 'x', sprint_rank: 500 },
  ];
  assert.deepEqual(keys(view.sortRows(same, null, 'ascending', orders)), ['PM-1', 'PM-3', 'PM-12']);
  assert.deepEqual(keys(view.sortRows(same, 'title', 'descending', orders)), ['PM-1', 'PM-3', 'PM-12']);
});

test('sortRows works with the real server lists, in their order (AC 19, 26)', () => {
  const real = {
    types: TYPES.map((t) => t.name),
    priorities: PRIORITIES,
    statuses: STATUSES,
  };
  const items = [
    { key: 'A-1', priority: PRIORITIES[PRIORITIES.length - 1], status: STATUSES[STATUSES.length - 1], type: real.types[1], sprint_rank: 1 },
    { key: 'A-2', priority: PRIORITIES[0], status: STATUSES[0], type: real.types[0], sprint_rank: 2 },
  ];
  assert.deepEqual(keys(view.sortRows(items, 'priority', 'ascending', real)), ['A-2', 'A-1']);
  assert.deepEqual(keys(view.sortRows(items, 'status', 'ascending', real)), ['A-2', 'A-1']);
  assert.deepEqual(keys(view.sortRows(items, 'type', 'ascending', real)), ['A-2', 'A-1']);
});

test('the table has the seven spec columns in order, then Estimate and Logged (AC 9, 16; time tracking AC 55)', () => {
  assert.deepEqual(view.COLUMNS, ['key', 'title', 'type', 'epic', 'priority', 'status', 'assignee', 'estimate', 'logged']);
});

test('Estimate and Logged sort numerically; unestimated items last both ways (time tracking AC 55)', () => {
  const rows = [
    { key: 'PM-1', sprint_rank: 1000, estimate_hours: 8, time_spent_hours: 6.5 },
    { key: 'PM-2', sprint_rank: 2000, estimate_hours: null, time_spent_hours: 0 },
    { key: 'PM-3', sprint_rank: 3000, estimate_hours: 3.25, time_spent_hours: 4 },
    { key: 'PM-4', sprint_rank: 4000, estimate_hours: 16, time_spent_hours: 0.5 },
  ];
  const keys = (list) => list.map((r) => r.key);
  assert.deepEqual(keys(view.sortRows(rows, 'estimate', 'ascending')), ['PM-3', 'PM-1', 'PM-4', 'PM-2']);
  assert.deepEqual(keys(view.sortRows(rows, 'estimate', 'descending')), ['PM-4', 'PM-1', 'PM-3', 'PM-2']);
  assert.deepEqual(keys(view.sortRows(rows, 'logged', 'ascending')), ['PM-2', 'PM-4', 'PM-3', 'PM-1']);
  assert.deepEqual(keys(view.sortRows(rows, 'logged', 'descending')), ['PM-1', 'PM-3', 'PM-4', 'PM-2']);
});
