// Backlog bulk move client helpers (public/js/bulkMove.js;
// docs/specs/backlog-bulk-move.md AC 12, 15, 21-24): run order, the
// sequential best-effort loop, abort rules and the result text.
const test = require('node:test');
const assert = require('node:assert/strict');
const bulk = require('../public/js/bulkMove');

const item = (id, rank, key = `P-${id}`) => ({ id, key, sprint_rank: rank });
const httpError = (status, message) => Object.assign(new Error(message), { status });

// A fake PATCH: records the call order and checks that calls never overlap.
function fakePatch(outcomes = {}) {
  const calls = [];
  let inFlight = 0;
  let overlapped = false;
  const patch = async (it) => {
    inFlight++;
    if (inFlight > 1) overlapped = true;
    calls.push(it.id);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    const outcome = outcomes[it.id];
    if (outcome) throw outcome;
    return { ...it, sprint_id: 7 };
  };
  return { patch, calls, overlapped: () => overlapped };
}

test('items go in Backlog order (sprint_rank, then id), not tick order (AC 15, 21)', () => {
  const ticked = [item(3, 2000), item(1, 3000), item(2, 1000), item(5, 2000), item(4, null)];
  assert.deepEqual(bulk.order(ticked).map((i) => i.id), [4, 2, 3, 5, 1]);
  assert.deepEqual(ticked.map((i) => i.id), [3, 1, 2, 5, 4], 'the input is not reordered');
});

test('one PATCH at a time, in Backlog order; a full success moves every item (AC 11, 21)', async () => {
  const f = fakePatch();
  const result = await bulk.run([item(3, 30), item(1, 10), item(2, 20)], { patch: f.patch });
  assert.deepEqual(f.calls, [1, 2, 3]);
  assert.equal(f.overlapped(), false, 'sequential, never parallel');
  assert.deepEqual(result.moved.map((m) => m.item.id), [1, 2, 3]);
  assert.equal(result.moved[0].saved.sprint_id, 7);
  assert.deepEqual([result.total, result.failed.length, result.notAttempted.length], [3, 0, 0]);
});

test('a 404, 400 or network error fails that item only; the run goes on (AC 22)', async () => {
  const f = fakePatch({ 2: httpError(404, 'Work item not found.'), 3: new Error('Failed to fetch'), 4: httpError(400, 'Epics cannot be added to a sprint.') });
  let asked = 0;
  const result = await bulk.run([1, 2, 3, 4, 5].map((id) => item(id, id)), {
    patch: f.patch,
    targetGone: async () => { asked++; return false; },
  });
  assert.deepEqual(f.calls, [1, 2, 3, 4, 5]);
  assert.deepEqual(result.moved.map((m) => m.item.id), [1, 5]);
  assert.deepEqual(result.failed.map((x) => [x.item.id, x.message]), [[2, 'Work item not found.'], [3, 'Failed to fetch'], [4, 'Epics cannot be added to a sprint.']]);
  assert.deepEqual(result.notAttempted, []);
  assert.equal(asked, 1, 'only a 400 asks whether the target is gone');
});

test('a 401, 403 or 409 stops the run; the rest is not attempted, the message kept once (AC 20, 23)', async () => {
  for (const status of [401, 403, 409]) {
    const f = fakePatch({ 3: httpError(status, 'This project is archived; its work items are read-only.') });
    const result = await bulk.run([1, 2, 3, 4, 5].map((id) => item(id, id)), { patch: f.patch });
    assert.deepEqual(f.calls, [1, 2, 3], `status ${status}: nothing sent after the stop`);
    assert.deepEqual(result.moved.map((m) => m.item.id), [1, 2]);
    assert.deepEqual(result.notAttempted.map((i) => i.id), [3, 4, 5]);
    assert.equal(result.stopMessage, 'This project is archived; its work items are read-only.');
    assert.equal(bulk.isAbortStatus(status), true);
  }
  for (const status of [400, 404, 500, undefined]) assert.equal(bulk.isAbortStatus(status), false, String(status));
});

test('a target sprint completed or deleted meanwhile: nothing moved, run stopped (AC 24)', async () => {
  // Completed: the server answers 409 on the first item.
  let f = fakePatch({ 1: httpError(409, 'Completed sprints are read-only.') });
  let result = await bulk.run([item(1, 1), item(2, 2)], { patch: f.patch });
  assert.deepEqual([result.moved.length, result.notAttempted.length, f.calls.length], [0, 2, 1]);
  // Deleted: a 400, and the sprint list no longer has the target.
  f = fakePatch({ 1: httpError(400, 'Sprint must be a sprint of the same project.'), 2: httpError(400, 'x') });
  result = await bulk.run([item(1, 1), item(2, 2)], { patch: f.patch, targetGone: async () => true });
  assert.deepEqual([result.moved.length, result.notAttempted.length, f.calls.length], [0, 2, 1]);
  assert.equal(result.stopMessage, 'Sprint must be a sprint of the same project.');
  // If the check itself fails, the 400 counts as that item's failure.
  f = fakePatch({ 1: httpError(400, 'Bad') });
  result = await bulk.run([item(1, 1), item(2, 2)], { patch: f.patch, targetGone: async () => { throw new Error('offline'); } });
  assert.deepEqual([result.moved.length, result.failed.length, result.notAttempted.length], [1, 1, 0]);
});

test('success text, singular and plural; names stay as given text (AC 12, 27)', () => {
  const ok = (n) => ({ total: n, moved: Array.from({ length: n }, (_, i) => ({ item: item(i, i) })), failed: [], notAttempted: [], stopMessage: '' });
  assert.deepEqual(bulk.summary(ok(12), 'Sprint 5'), { kind: 'success', label: '', lead: 'Moved 12 work items to Sprint 5.', failures: [], more: 0, hint: '' });
  assert.equal(bulk.summary(ok(1), 'Sprint 4').lead, 'Moved 1 work item to Sprint 4.');
  assert.equal(bulk.summary(ok(2), '<b>x</b>').lead, 'Moved 2 work items to <b>x</b>.');
});

test('partial failure: bold label, failed keys as a list, first 5 then "and K more" (AC 22, owner decision)', () => {
  const failed = (n) => Array.from({ length: n }, (_, i) => ({ item: item(100 + i, i), message: 'Work item not found.' }));
  const r = { total: 12, moved: [1, 2, 3, 4].map((id) => ({ item: item(id, id) })), failed: failed(8), notAttempted: [], stopMessage: '' };
  const s = bulk.summary(r, 'Sprint 5');
  assert.equal(s.kind, 'partial');
  assert.equal(s.label, 'Partly moved.');
  assert.equal(s.lead, 'Moved 4 of 12 work items to Sprint 5. Could not move:');
  assert.equal(s.failures.length, bulk.FAIL_LIST_MAX);
  assert.deepEqual(s.failures[0], { key: 'P-100', message: 'Work item not found.' });
  assert.equal(s.more, 3);
  assert.equal(s.hint, 'The items that could not be moved are still ticked. Press Move to try again.');
  const short = bulk.summary({ ...r, total: 6, failed: failed(2) }, 'Sprint 5');
  assert.deepEqual([short.failures.length, short.more], [2, 0]);
  const none = bulk.summary({ total: 1, moved: [], failed: failed(1), notAttempted: [], stopMessage: '' }, 'Sprint 5');
  assert.equal(none.lead, 'Moved 0 of 1 work item to Sprint 5. Could not move:');
  assert.equal(none.label, 'Not moved.');
});

test('stopped run: "Stopped." label, counts and the server message once (AC 23, 24)', () => {
  const r = {
    total: 10,
    moved: [1, 2, 3, 4].map((id) => ({ item: item(id, id) })),
    failed: [],
    notAttempted: [5, 6, 7, 8, 9, 10].map((id) => item(id, id)),
    stopMessage: 'This project is archived; its work items are read-only.',
  };
  const s = bulk.summary(r, 'Sprint 5');
  assert.equal(s.kind, 'stopped');
  assert.equal(s.label, 'Stopped.');
  assert.equal(s.lead, 'Moved 4 of 10 work items to Sprint 5. 6 not attempted. This project is archived; its work items are read-only.');
  assert.equal(s.hint, 'The 6 work items that were not moved are still ticked.');
  const one = bulk.summary({ total: 1, moved: [], failed: [], notAttempted: [item(1, 1)], stopMessage: 'Gone.' }, 'S');
  assert.equal(one.lead, 'Moved 0 of 1 work item to S. 1 not attempted. Gone.');
  assert.equal(one.hint, 'The 1 work item that was not moved is still ticked.');
});
