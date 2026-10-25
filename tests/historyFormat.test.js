// History tab text (docs/specs/ticket-history.md AC 21).
const test = require('node:test');
const assert = require('node:assert/strict');
const { changeLine, eventLines } = require('../public/js/historyFormat');

const change = (fields) => ({ field: 'f', label: 'Status', kind: 'text', old: null, new: null, old_id: null, new_id: null, ...fields });

test('a change reads "changed <Label> from <old> to <new>" (AC 21)', () => {
  assert.equal(changeLine(change({ old: 'To Do', new: 'In Progress' })), 'changed Status from To Do to In Progress');
});

test('null or empty values read "None" (AC 21)', () => {
  assert.equal(changeLine(change({ label: 'Assignee', kind: 'user', old: null, new: 'Alex Morgan' })), 'changed Assignee from None to Alex Morgan');
  assert.equal(changeLine(change({ label: 'Epic', kind: 'issue', old: 'PX-1 Parent', new: null })), 'changed Epic from PX-1 Parent to None');
  assert.equal(changeLine(change({ old: '', new: undefined })), 'changed Status from None to None');
});

test('a long field reads "changed <Label>" with no values (AC 21)', () => {
  assert.equal(changeLine(change({ label: 'Description', kind: 'long', old: 'ignored', new: 'ignored' })), 'changed Description');
});

test('event lines: one per change, or "created this work item" (AC 1, 21)', () => {
  assert.deepEqual(eventLines({ kind: 'created', changes: [] }), ['created this work item']);
  const e = {
    kind: 'changed',
    changes: [change({ old: 'A', new: 'B' }), change({ label: 'Resolution', old: null, new: 'X' })],
  };
  assert.deepEqual(eventLines(e), ['changed Status from A to B', 'changed Resolution from None to X']);
});

test('markup in values stays literal text (AC 22)', () => {
  assert.equal(changeLine(change({ label: 'Title', old: '<b>x</b>', new: '<i>y</i>' })), 'changed Title from <b>x</b> to <i>y</i>');
});

test('a link change reads like any other field (links AC 16)', () => {
  assert.equal(changeLine(change({ label: 'Link', kind: 'link', old: null, new: 'blocks PM-2' })), 'changed Link from None to blocks PM-2');
  assert.equal(changeLine(change({ label: 'Link', kind: 'link', old: 'blocks PM-2', new: null })), 'changed Link from blocks PM-2 to None');
});

test('an attachment change reads "added/removed attachment <name>" (attachments AC 39, 40)', () => {
  assert.equal(changeLine(change({ label: 'Attachment', kind: 'file', old: null, new: 'spec.pdf' })), 'added attachment spec.pdf');
  assert.equal(changeLine(change({ label: 'Attachment', kind: 'file', old: 'spec.pdf', new: null })), 'removed attachment spec.pdf');
  assert.equal(changeLine(change({ label: 'Attachment', kind: 'file', new: '<img src=x>.png' })), 'added attachment <img src=x>.png');
});
