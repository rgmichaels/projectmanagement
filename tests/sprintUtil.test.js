// The shared client sprint helpers (public/js/sprints.js): the one overdue
// rule (docs/specs/sprints-and-backlog.md Decision 19, AC 26, 32), date and
// history text (AC 45).
const test = require('node:test');
const assert = require('node:assert/strict');
const sprintUtil = require('../public/js/sprints');

const ACTIVE = 'Running';
const sprint = (fields) => ({ state: ACTIVE, end_date: '2026-10-23', ...fields });

test('overdue: the active sprint after its end date, by the local calendar date (Decision 19)', () => {
  assert.equal(sprintUtil.isOverdue(sprint(), ACTIVE, '2026-10-24'), true);
  assert.equal(sprintUtil.isOverdue(sprint(), ACTIVE, '2026-10-23'), false, 'the end date itself is not overdue');
  assert.equal(sprintUtil.isOverdue(sprint(), ACTIVE, '2026-10-01'), false);
  assert.equal(sprintUtil.isOverdue(sprint({ end_date: null }), ACTIVE, '2030-01-01'), false, 'no end date');
  assert.equal(sprintUtil.isOverdue(sprint({ state: 'Other' }), ACTIVE, '2030-01-01'), false, 'only the active sprint');
  assert.equal(sprintUtil.isOverdue(null, ACTIVE, '2030-01-01'), false);
  // The local date, not UTC: 23:30 local on the 23rd is still the 23rd.
  assert.equal(sprintUtil.localToday(new Date(2026, 9, 23, 23, 30)), '2026-10-23');
  assert.equal(sprintUtil.localToday(new Date(2026, 0, 5)), '2026-01-05');
});

test('days ago and dates text', () => {
  assert.equal(sprintUtil.agoText('2026-10-23', '2026-10-26'), '3 days ago');
  assert.equal(sprintUtil.agoText('2026-10-25', '2026-10-26'), 'yesterday');
  assert.equal(sprintUtil.agoText('2026-02-27', '2026-03-02'), '3 days ago', 'across a month end');
  assert.equal(sprintUtil.daysBetween('2026-03-28', '2026-03-30'), 2, 'across a DST change');
  assert.equal(sprintUtil.datesText({ start_date: '2026-10-12', end_date: '2026-10-23' }), '2026-10-12 to 2026-10-23');
  assert.equal(sprintUtil.datesText({ start_date: '2026-10-12', end_date: null }), 'from 2026-10-12');
  assert.equal(sprintUtil.datesText({ start_date: null, end_date: '2026-10-23' }), 'until 2026-10-23');
  assert.equal(sprintUtil.datesText({ start_date: null, end_date: null }), '');
  assert.equal(sprintUtil.count(1, 'item'), '1 item');
  assert.equal(sprintUtil.count(0, 'item'), '0 items');
});

test('history sentences come from the event data and the kind label (AC 45)', () => {
  const text = (event, label) => sprintUtil.historyParts(event, label).map((p) => p.text ?? `[${p.strong}]`).join('');
  const base = { actor_name: 'Dana Reyes', sprint_name: 'Sprint 3', item_count: null, disposition: null };
  assert.equal(text(base, 'Created'), 'Dana Reyes created [Sprint 3]');
  assert.equal(
    text({ ...base, disposition: 'next-sprint', done_count: 5, item_count: 2, target_sprint_name: 'Sprint 4' }, 'Completed'),
    'Dana Reyes completed [Sprint 3]: 5 done, 2 unfinished moved to Sprint 4'
  );
  assert.equal(
    text({ ...base, disposition: 'new-sprint', done_count: 2, item_count: 1, target_sprint_name: 'Sprint 1' }, 'Completed'),
    'Dana Reyes completed [Sprint 3]: 2 done, 1 unfinished moved to new sprint Sprint 1'
  );
  assert.equal(text({ ...base, disposition: 'backlog', done_count: 4, item_count: 3 }, 'Completed'), 'Dana Reyes completed [Sprint 3]: 4 done, 3 unfinished moved to the Backlog');
  assert.equal(text({ ...base, disposition: 'backlog', done_count: 7, item_count: 0 }, 'Completed'), 'Dana Reyes completed [Sprint 3]: 7 done, none unfinished');
  assert.equal(text({ ...base, item_count: 1 }, 'Deleted'), 'Dana Reyes deleted [Sprint 3]: 1 item returned to the Backlog');
  assert.equal(text({ ...base, actor_name: '<b>x</b>' }, 'Started'), '<b>x</b> started [Sprint 3]', 'text, never markup');
  assert.equal(sprintUtil.changeLine({ label: 'End date', old: null, new: '2026-10-23' }), 'End date: none to 2026-10-23');
});
