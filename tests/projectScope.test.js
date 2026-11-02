// The shared project scope helpers (public/js/projectScope.js;
// docs/specs/global-project-scope.md AC 3, 3a, 4, 8-10, 12, 14a).
const test = require('node:test');
const assert = require('node:assert/strict');
const scope = require('../public/js/projectScope');

test('project scope validates IDs without accepting malformed or unsafe values (AC 10)', () => {
  for (const value of ['', null, undefined, '0', '-1', '1.5', '1e2', ' 2', '2 ', '0x2', '9007199254740993', [], {}]) {
    assert.equal(scope.parseId(value), null, String(value));
  }
  assert.equal(scope.parseId('12'), 12);
});

test('parseProjectParam reads the raw ?project= value, or null when absent (AC 7)', () => {
  assert.equal(scope.parseProjectParam('?project=2&sprint=4'), '2');
  assert.equal(scope.parseProjectParam('?project=abc'), 'abc');
  assert.equal(scope.parseProjectParam('?project='), '');
  assert.equal(scope.parseProjectParam('?sprint=4'), null);
  assert.equal(scope.parseProjectParam(''), null);
});

test('resolveProject: a ?project= value wins, valid or not (AC 7, 10, 3a)', () => {
  const projects = [{ id: 2 }, { id: 1 }];
  assert.deepEqual(scope.resolveProject('1', '2', projects), { source: 'url', id: 1 });
  // Not in the live list (archived, or unknown): still the URL's; the page loads it.
  assert.deepEqual(scope.resolveProject('7', '2', projects), { source: 'url', id: 7 });
  for (const bad of ['', 'abc', '0', '-3', '1.5']) {
    assert.deepEqual(scope.resolveProject(bad, '2', projects), { source: 'invalid', id: null }, bad);
  }
});

test('resolveProject without ?project=: remembered live, then first live, then none (AC 9)', () => {
  const projects = [{ id: 2 }, { id: 1 }, { id: 3 }];
  assert.deepEqual(scope.resolveProject(null, '1', projects), { source: 'remembered', id: 1 });
  assert.deepEqual(scope.resolveProject(null, '999', projects), { source: 'first', id: 2 }, 'stale remembered id');
  assert.deepEqual(scope.resolveProject(null, 'garbage', projects), { source: 'first', id: 2 });
  assert.deepEqual(scope.resolveProject(null, null, projects), { source: 'first', id: 2 });
  // An archived remembered project is skipped (AC 20).
  assert.deepEqual(scope.resolveProject(null, '1', [{ id: 2 }, { id: 1, archived: true }]), { source: 'first', id: 2 });
  assert.deepEqual(scope.resolveProject(null, '1', [{ id: 1, archived: true }]), { source: 'none', id: null });
  assert.deepEqual(scope.resolveProject(null, null, []), { source: 'none', id: null });
});

test('option labels are KEY - name, with (archived) for an archived project (AC 3, 3a)', () => {
  assert.equal(scope.optionLabel({ key: 'SFPM', name: 'Platform Migration' }), 'SFPM - Platform Migration');
  assert.equal(scope.optionLabel({ key: 'PM', name: 'Planning', archived: true }), 'PM - Planning (archived)');
  assert.equal(scope.optionLabel({ key: 'X', name: '<b>bold</b>' }), 'X - <b>bold</b>', 'text, inserted with textContent');
});

test('pageUrl keeps the file and drops every other query parameter (AC 4, 12)', () => {
  assert.equal(scope.pageUrl('/sprints.html', 2), '/sprints.html?project=2');
  assert.equal(scope.pageUrl('board.html', '15'), 'board.html?project=15');
  assert.doesNotMatch(scope.pageUrl('/sprints.html', 2), /sprint=/);
});

test('detailDirty compares loaded and current dialog values and drafts (AC 14a)', () => {
  const loaded = { title: 'A', type: 'T', priority: 'P', assignee_id: null, epic_id: null, description: '', status: 'S' };
  assert.equal(scope.detailDirty(loaded, { ...loaded }), false, 'unchanged');
  assert.equal(scope.detailDirty(null, { ...loaded }), false, 'nothing loaded');
  for (const [field, value] of Object.entries({ title: 'B', type: 'U', priority: 'Q', assignee_id: 3, epic_id: 4, description: 'x', status: 'R' })) {
    assert.equal(scope.detailDirty(loaded, { ...loaded, [field]: value }), true, field);
  }
  // A field that appears or disappears (resolution with the terminal status).
  assert.equal(scope.detailDirty(loaded, { ...loaded, resolution: 'Fixed' }), true);
  assert.equal(scope.detailDirty({ ...loaded, sprint_id: null }, { ...loaded }), false, 'null and absent are the same');
  // Drafts.
  assert.equal(scope.detailDirty(loaded, { ...loaded }, { comment: '   ' }), false, 'blank comment');
  assert.equal(scope.detailDirty(loaded, { ...loaded }, { comment: 'hi' }), true, 'comment draft');
  assert.equal(scope.detailDirty(loaded, { ...loaded }, { edit: 'same', editOriginal: 'same' }), false);
  assert.equal(scope.detailDirty(loaded, { ...loaded }, { edit: 'changed', editOriginal: 'same' }), true, 'message edit');
});

test('the confirm wording is the design wording (AC 14, 14c)', () => {
  assert.equal(scope.SWITCH_CONFIRM.body, 'You have unsaved changes to this work item. Switch project and discard them?');
  assert.equal(scope.DISCARD_CONFIRM.title, 'Discard changes?');
  assert.equal(scope.DISCARD_CONFIRM.body, 'Your unsaved changes to this work item will be lost.');
});

test('shared storage tolerates inaccessible browser storage (AC 8)', () => {
  assert.equal(scope.STORAGE_KEY, 'pm.project');
  assert.equal(scope.storageGet('missing'), null);
  assert.doesNotThrow(() => scope.storageSet('missing', '2'));
  assert.doesNotThrow(() => scope.storageSet('missing', null));
});
