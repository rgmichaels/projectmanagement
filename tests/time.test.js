// Discussion timestamp formatting (docs/specs/ticket-discussion.md AC 16, 17).
const test = require('node:test');
const assert = require('node:assert/strict');
const { relativeTime, localDateTime, timestamp, hours, sprintFigure, sprintFigureParts, itemBalance } = require('../public/js/time');

const NOW = Date.parse('2026-10-24T12:00:00.000Z');
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;
const ago = (ms) => new Date(NOW - ms).toISOString();

test('relative time at each boundary, with singular forms (AC 17)', () => {
  const cases = [
    [0, 'just now'],
    [59 * S, 'just now'],
    [60 * S, '1 minute ago'],
    [119 * S, '1 minute ago'],
    [2 * M, '2 minutes ago'],
    [59 * M + 59 * S, '59 minutes ago'],
    [H, '1 hour ago'],
    [2 * H, '2 hours ago'],
    [23 * H + 59 * M, '23 hours ago'],
    [D, '1 day ago'],
    [2 * D, '2 days ago'],
    [29 * D + 23 * H, '29 days ago'],
    [30 * D, '1 month ago'],
    [59 * D, '1 month ago'],
    [60 * D, '2 months ago'],
    [364 * D, '12 months ago'],
    [365 * D, '1 year ago'],
    [729 * D, '1 year ago'],
    [730 * D, '2 years ago'],
  ];
  for (const [ms, expected] of cases) {
    assert.equal(relativeTime(ago(ms), NOW), expected, `${ms} ms ago`);
  }
});

test('a timestamp slightly in the future reads "just now" (AC 17)', () => {
  assert.equal(relativeTime(new Date(NOW + 5 * S).toISOString(), NOW), 'just now');
  assert.equal(relativeTime(new Date(NOW + 2 * H).toISOString(), NOW), 'just now');
});

test('local part is YYYY-MM-DD HH:mm in local time, 24-hour (AC 16)', () => {
  const d = new Date(2026, 9, 4, 15, 7, 30); // local time
  assert.equal(localDateTime(d.toISOString()), '2026-10-04 15:07');
  const midnight = new Date(2026, 0, 1, 0, 5);
  assert.equal(localDateTime(midnight.toISOString()), '2026-01-01 00:05');
  const iso = new Date(NOW - 2 * H - 3 * M).toISOString();
  assert.match(timestamp(iso, NOW), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(2 hours ago\)$/);
  assert.equal(timestamp(iso, NOW).slice(0, 16), localDateTime(iso), 'same instant every render');
});

// ---------- time tracking (docs/specs/time-tracking.md AC 21, 45, 53) ----------

test('timeFormat.hours: up to two decimals, no trailing zeros (time tracking AC 21)', () => {
  const cases = [[1.5, '1.5 h'], [37, '37 h'], [0.25, '0.25 h'], [0, '0 h'], [12.75, '12.75 h'], [37.5, '37.5 h'], [1000, '1000 h'], [2.0, '2 h'], [1 / 3, '0.33 h'], [-0, '0 h']];
  for (const [value, expected] of cases) assert.equal(hours(value), expected, String(value));
});

test('timeFormat.sprintFigure: logged, estimated, over and the unestimated note (time tracking AC 53)', () => {
  assert.equal(sprintFigure(12, 20), '12 h logged / 20 h est.');
  assert.equal(sprintFigure(0, 0), '0 h logged');
  assert.equal(sprintFigure(37.5, 0), '37.5 h logged');
  assert.equal(sprintFigure(24, 20), '24 h logged / 20 h est. (over)');
  assert.equal(sprintFigure(20, 20), '20 h logged / 20 h est.', 'equal is not over');
  assert.equal(sprintFigure(12, 20, 3), '12 h logged / 20 h est. (3 not estimated)');
  assert.equal(sprintFigure(24, 20, 2), '24 h logged / 20 h est. (over) (2 not estimated)');
  assert.equal(sprintFigure(5, 0, 4), '5 h logged', 'no note when nothing is estimated');
  assert.deepEqual(sprintFigureParts(24, 20), { main: '24 h logged / 20 h est.', note: ' (over)', over: true });
  assert.deepEqual(sprintFigureParts(1.5, 40, 0), { main: '1.5 h logged / 40 h est.', note: '', over: false });
});

test('timeFormat.itemBalance: remaining, equal and over (time tracking AC 45)', () => {
  assert.deepEqual(itemBalance(8, 6.5), { over: false, text: '1.5 h remaining', percent: 81 });
  assert.deepEqual(itemBalance(8, 8), { over: false, text: '0 h remaining', percent: 100 });
  assert.deepEqual(itemBalance(4, 6.5), { over: true, text: '2.5 h over', percent: 163 });
  assert.equal(itemBalance(null, 3), null);
});
