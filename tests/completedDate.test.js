// The completed-date texts (public/js/completedDate.js;
// docs/specs/completed-date-on-cards.md AC 13-14). No browser. The time zone
// is fixed so "local" is known; Node re-reads TZ when it changes.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/completedDate');

const NOW = new Date('2026-11-20T17:00:00Z');

test('month and day in the current year; the year added otherwise (AC 13)', () => {
  assert.equal(C.dateText('2026-11-20T15:42:00Z', NOW), 'Nov 20');
  assert.equal(C.dateText('2026-01-05T15:00:00Z', NOW), 'Jan 5');
  assert.equal(C.dateText('2025-11-20T15:00:00Z', NOW), 'Nov 20, 2025');
  assert.equal(C.dateText('2027-02-01T15:00:00Z', NOW), 'Feb 1, 2027');
  assert.equal(C.cardText('2026-11-20T15:42:00Z', NOW), '✓ Completed Nov 20');
  assert.equal(C.cardText('2025-11-20T15:42:00Z', NOW), '✓ Completed Nov 20, 2025');
});

test('the local day is shown: 23:30 local is that day, not the UTC day (AC 13)', () => {
  // 2026-11-21 04:30 UTC is 2026-11-20 23:30 in New York.
  assert.equal(C.dateText('2026-11-21T04:30:00Z', NOW), 'Nov 20');
  // The year rule uses the local year too: 2026-01-01 03:00 UTC is still 2025 locally.
  assert.equal(C.dateText('2026-01-01T03:00:00Z', NOW), 'Dec 31, 2025');
});

test('tooltip: full local date with year, 12-hour time and the completer (AC 14)', () => {
  assert.equal(C.tooltip('2026-11-20T20:42:00Z', 'Dana Lee'), 'Completed Nov 20, 2026 at 3:42 PM by Dana Lee');
  assert.equal(C.tooltip('2026-11-20T16:10:00Z', null), 'Completed Nov 20, 2026 at 11:10 AM');
  assert.equal(C.tooltip('2026-11-21T04:30:00Z', 'X'), 'Completed Nov 20, 2026 at 11:30 PM by X');
  assert.equal(C.tooltip('2026-11-20T05:05:00Z', ''), 'Completed Nov 20, 2026 at 12:05 AM');
  assert.equal(C.tooltip('2026-11-20T17:00:00Z', 'Y'), 'Completed Nov 20, 2026 at 12:00 PM by Y');
});

test('no date, no text: never "Invalid Date" (design rules)', () => {
  for (const v of [null, undefined, '', 'not a date']) {
    assert.equal(C.dateText(v, NOW), null);
    assert.equal(C.cardText(v, NOW), null);
    assert.equal(C.tooltip(v, 'Z'), null);
  }
});

test('the dialog Completed field shows on the Board and Backlog only, never on Sprints or Timeline (AC 19, 22)', () => {
  assert.equal(C.showInDialog('board'), true);
  assert.equal(C.showInDialog('backlog'), true);
  assert.equal(C.showInDialog('sprints'), false);
  assert.equal(C.showInDialog('timeline'), false);
  assert.equal(C.showInDialog('report'), false);

  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8');
  // The dialog markup is shared by every page (Sprints AC 14), so the field
  // is hidden by default everywhere and only board.js can show it, gated by
  // page.
  for (const page of ['board', 'backlog', 'sprints', 'timeline']) {
    const html = read(`${page}.html`);
    const at = html.indexOf('<script src="js/completedDate.js">');
    assert.ok(at > -1 && at < html.indexOf('<script src="js/board.js">'), page);
    assert.match(html, /<div id="completed-field" class="completed-field" hidden>/, `${page}: hidden by default`);
    assert.match(html, /<input type="text" id="completed-input" class="ro" readonly>/, page);
    assert.doesNotMatch(html, /id="completed-input"[^>]*\bname=/, `${page}: never submitted`);
  }
  for (const page of ['sprints', 'timeline']) assert.match(read(`${page}.html`), new RegExp(`<body data-page="${page}">`));
  const board = read('js/board.js');
  const sync = board.slice(board.indexOf('function syncCompletedField'), board.indexOf('function syncEpicField'));
  assert.match(sync, /completedDate\.showInDialog\(page\) && /, 'gated by page');
  assert.equal((board.match(/completedField\.hidden = /g) || []).length, 1, 'only syncCompletedField shows it');
});
