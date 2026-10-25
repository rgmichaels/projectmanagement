// Board search and filters (docs/specs/search-and-filters.md AC 1-7, 17).
// Values come from the server lists, so nothing here depends on their names.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ANY, UNASSIGNED, emptyFilters, isActive, matches, sanitize } = require('../public/js/filters');
const { STATUSES } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { PRIORITIES } = require('../server/priorities');
const { RESOLUTIONS } = require('../server/resolutions');

const [s0, s1] = STATUSES;
const [t0, t1] = TYPES.map((t) => t.name);
const [p0, p1] = PRIORITIES;
const [r0, r1] = RESOLUTIONS.map((r) => r.name);

const items = [
  { id: 1, key: 'PM-1', title: 'Fix login bug', description: 'Users cannot sign in', assignee_id: 1, type: t0, priority: p0, status: s0, resolution: null },
  { id: 2, key: 'PM-2', title: 'Write docs', description: '', assignee_id: null, type: t1, priority: p1, status: s1, resolution: null },
  { id: 3, key: 'PM-3', title: 'Regex chars .* ( [', description: null, assignee_id: 2, type: t0, priority: p1, status: s0, resolution: r0 },
  { id: 4, key: 'PM-12', title: 'Layout', assignee_id: 1, type: t1, priority: p0, status: s1, resolution: r1 }, // no description field
];
const ids = (f) => items.filter((i) => matches(i, f)).map((i) => i.id);
const withF = (patch) => ({ ...emptyFilters(), ...patch });

test('no search text and every filter on Any shows all items (AC 1)', () => {
  assert.deepEqual(ids(emptyFilters()), [1, 2, 3, 4]);
  assert.deepEqual(ids(undefined), [1, 2, 3, 4]);
  assert.equal(isActive(emptyFilters()), false);
  for (const v of Object.values(emptyFilters())) assert.equal(v, ANY);
});

test('text matches key, title and description, ignoring case and outer spaces (AC 2)', () => {
  for (const text of ['pm-1', 'PM-1', 'Pm-1']) assert.deepEqual(ids(withF({ text })), [1, 4], text); // PM-12 contains PM-1
  assert.deepEqual(ids(withF({ text: 'LOGIN' })), [1]);
  assert.deepEqual(ids(withF({ text: 'cannot SIGN' })), [1], 'description');
  assert.deepEqual(ids(withF({ text: '  write docs  ' })), [2], 'trimmed');
  assert.deepEqual(ids(withF({ text: 'layout' })), [4], 'missing description still matches on title');
  assert.deepEqual(ids(withF({ text: 'pm-3' })), [3], 'null description still matches on key');
  assert.deepEqual(ids(withF({ text: '   ' })), [1, 2, 3, 4], 'blank text is no constraint');
  assert.equal(isActive(withF({ text: '   ' })), false);
});

test('each dropdown alone shows only items with exactly that value (AC 3)', () => {
  assert.deepEqual(ids(withF({ type: t0 })), [1, 3]);
  assert.deepEqual(ids(withF({ priority: p1 })), [2, 3]);
  assert.deepEqual(ids(withF({ status: s1 })), [2, 4]);
  assert.deepEqual(ids(withF({ resolution: r0 })), [3]);
  assert.deepEqual(ids(withF({ assignee: '1' })), [1, 4]);
  assert.deepEqual(ids(withF({ assignee: '2' })), [3]);
});

test('Unassigned shows only items with no assignee and is not a user id (AC 4)', () => {
  assert.deepEqual(ids(withF({ assignee: UNASSIGNED })), [2]);
  assert.ok(Number.isNaN(Number(UNASSIGNED)), 'the sentinel can never equal a numeric user id');
});

test('criteria combine with AND; a no-match combination is empty (AC 5)', () => {
  assert.deepEqual(ids(withF({ type: t0, priority: p1 })), [3]);
  assert.deepEqual(ids(withF({ text: 'pm', assignee: '1', status: s1 })), [4]);
  assert.deepEqual(ids(withF({ assignee: UNASSIGNED, type: t0 })), []);
  assert.deepEqual(ids(withF({ text: 'no such text anywhere' })), []);
});

test('text is matched literally, not as a pattern (AC 6)', () => {
  assert.deepEqual(ids(withF({ text: '.*' })), [3]);
  assert.deepEqual(ids(withF({ text: '(' })), [3]);
  assert.deepEqual(ids(withF({ text: '[' })), [3]);
  assert.deepEqual(ids(withF({ text: '\\' })), []);
  assert.deepEqual(ids(withF({ text: '<img src=x onerror=alert(1)>' })), []);
});

test('isActive is true for any search text or dropdown', () => {
  assert.equal(isActive(withF({ text: 'x' })), true);
  for (const f of ['assignee', 'type', 'priority', 'status', 'resolution']) assert.equal(isActive(withF({ [f]: 'v' })), true, f);
  assert.equal(isActive(null), false);
});

test('sanitize keeps valid saved values and turns stale or malformed ones into Any (AC 17)', () => {
  const meta = { users: [1, 2], types: [t0, t1], priorities: PRIORITIES, statuses: STATUSES, resolutions: [r0, r1] };
  const good = { text: 'login', assignee: '2', type: t1, priority: p0, status: s1, resolution: r1 };
  assert.deepEqual(sanitize(good, meta), good);
  assert.equal(sanitize({ assignee: UNASSIGNED }, meta).assignee, UNASSIGNED);
  const stale = sanitize({ text: 5, assignee: '99', type: 'Gone', priority: 3, status: {}, resolution: 'Old', extra: 'x' }, meta);
  assert.deepEqual(stale, emptyFilters());
  for (const bad of [null, undefined, 'string', 42, [], [1, 2]]) assert.deepEqual(sanitize(bad, meta), emptyFilters());
  assert.deepEqual(sanitize(good, undefined), { ...emptyFilters(), text: 'login' }, 'no lists: only the text survives');
  assert.equal(sanitize({ text: 'x'.repeat(1000) }, meta).text.length, 200);
  // A fresh object each time: callers may mutate it.
  assert.notEqual(emptyFilters(), emptyFilters());
});
