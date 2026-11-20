// The Timeline page's pure logic (public/js/timelineMath.js;
// docs/specs/gantt-chart.md AC 9-17, 20-24, 27). No browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/js/timelineMath');
const { STATUSES, terminalStatus } = require('../server/statuses');

test('calendar-day arithmetic on YYYY-MM-DD, across months, years and leap days', () => {
  assert.equal(M.addDays('2026-11-05', 1), '2026-11-06');
  assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(M.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(M.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(M.daysBetween('2026-11-02', '2026-11-20'), 18);
  assert.equal(M.daysBetween('2026-03-28', '2026-03-30'), 2, 'no DST drift');
  assert.equal(M.fromDay(M.toDay('2026-11-05')), '2026-11-05');
  assert.equal(M.addMonths('2026-01-31', 1), '2026-02-28', 'clamped to the month end');
  assert.equal(M.addMonths('2026-11-05', -1), '2026-10-05');
  assert.equal(M.addMonths('2026-01-15', -1), '2025-12-15');
  assert.equal(M.addMonths('2026-11-05', 3), '2027-02-05');
  assert.equal(M.localToday(new Date(2026, 10, 5, 23, 59)), '2026-11-05', 'local date');
});

test('week and month starts; weekends (AC 14, 17)', () => {
  assert.equal(M.startOfWeek('2026-11-05'), '2026-11-02', 'Thursday -> Monday');
  assert.equal(M.startOfWeek('2026-11-02'), '2026-11-02');
  assert.equal(M.startOfWeek('2026-11-08'), '2026-11-02', 'Sunday belongs to the week before');
  assert.equal(M.startOfMonth('2026-11-05'), '2026-11-01');
  assert.equal(M.endOfMonth('2026-02-05'), '2026-02-28');
  assert.equal(M.endOfMonth('2028-02-05'), '2028-02-29');
  assert.ok(M.isWeekend('2026-11-07') && M.isWeekend('2026-11-08'));
  assert.ok(!M.isWeekend('2026-11-06') && !M.isWeekend('2026-11-09'));
});

test('zoom scales: Day 36px, Week 12px, Month 4px per day; stored zoom falls back to Week (AC 14)', () => {
  assert.equal(M.pxPerDay('day'), 36);
  assert.equal(M.pxPerDay('week'), 12);
  assert.equal(M.pxPerDay('month'), 4);
  assert.equal(M.parseZoom('month'), 'month');
  assert.equal(M.parseZoom(null), 'week');
  assert.equal(M.parseZoom('year'), 'week');
  assert.equal(M.parseZoom('__proto__'), 'week');
});

test('visible range: no dates is today -1 month to today +3 months (AC 15)', () => {
  const r = M.visibleRange([], '2026-11-05', 'day');
  assert.deepEqual(r, { start: '2026-10-05', end: '2027-02-05', days: M.daysBetween('2026-10-05', '2027-02-05') + 1 });
});

test('visible range: one month around the dates, always today and three months forward (AC 15)', () => {
  const today = '2026-11-05';
  // Dates well in the past: still reaches today + 3 months.
  let r = M.visibleRange(['2026-06-10', '2026-07-01', null, ''], today, 'day');
  assert.equal(r.start, '2026-05-10');
  assert.equal(r.end, '2027-02-05');
  // Dates far in the future: one month after the latest, and starts before today.
  r = M.visibleRange(['2027-06-01', '2027-08-20'], today, 'day');
  assert.equal(r.start, '2026-10-05');
  assert.equal(r.end, '2027-09-20');
  assert.ok(r.start <= today && r.end >= M.addMonths(today, 3));
});

test('visible range is widened to whole weeks (Monday) and whole months (AC 14, 15)', () => {
  const w = M.visibleRange([], '2026-11-05', 'week');
  assert.equal(w.start, '2026-10-05'); // Oct 5 2026 is a Monday
  assert.equal(M.startOfWeek(w.start), w.start);
  assert.equal(w.end, '2027-02-07'); // Sunday after Feb 5
  assert.equal(w.days % 7, 0);
  // A mid-week start is pulled back to its Monday: May 3 2026 (Sunday) -> Apr 27.
  assert.equal(M.visibleRange(['2026-06-03'], '2026-11-05', 'week').start, '2026-04-27');
  const m = M.visibleRange([], '2026-11-05', 'month');
  assert.equal(m.start, '2026-10-01');
  assert.equal(m.end, '2027-02-28');
});

test('date to pixel and back, and bar boxes inclusive of the due date (AC 11, 14)', () => {
  const start = '2026-08-31';
  assert.equal(M.dateToX('2026-08-31', start, 'week'), 0);
  assert.equal(M.dateToX('2026-11-05', start, 'week'), 66 * 12);
  assert.equal(M.dateToX('2026-09-01', start, 'day'), 36);
  assert.equal(M.dateToX('2026-09-10', start, 'month'), 40);
  assert.equal(M.xToDate(0, start, 'day'), '2026-08-31');
  assert.equal(M.xToDate(35, start, 'day'), '2026-08-31', 'inside the first day');
  assert.equal(M.xToDate(36, start, 'day'), '2026-09-01');
  assert.equal(M.xToDate(M.dateToX('2026-11-05', start, 'month'), start, 'month'), '2026-11-05');
  assert.deepEqual(M.barBox({ start: '2026-10-26', due: '2026-11-13' }, start, 'week'), { left: 56 * 12, width: 19 * 12 });
  assert.deepEqual(M.barBox({ start: '2026-12-04', due: '2026-12-04' }, start, 'day'), { left: 95 * 36, width: 36 }, 'one-day bar');
});

test('span: start to due; one date gives a one-day span; none is unscheduled (AC 11, 13)', () => {
  assert.deepEqual(M.span({ start_date: '2026-11-02', due_date: '2026-11-20' }), { start: '2026-11-02', due: '2026-11-20' });
  assert.deepEqual(M.span({ start_date: null, due_date: '2026-12-04' }), { start: '2026-12-04', due: '2026-12-04' });
  assert.deepEqual(M.span({ start_date: '2026-12-04', due_date: null }), { start: '2026-12-04', due: '2026-12-04' });
  assert.equal(M.span({ start_date: null, due_date: null }), null);
  assert.equal(M.isScheduled({}), false);
});

test('snap: a drag becomes whole days at every zoom; under 3px is a click (AC 20, 21, 27)', () => {
  assert.equal(M.snapDays(0, 'day'), 0);
  assert.equal(M.snapDays(17, 'day'), 0);
  assert.equal(M.snapDays(19, 'day'), 1);
  assert.equal(M.snapDays(-40, 'day'), -1);
  assert.equal(M.snapDays(30, 'week'), 3, '2.5 days rounds to 3');
  assert.equal(M.snapDays(-25, 'week'), -2);
  assert.equal(M.snapDays(10, 'month'), 3, '2.5 days at 4px');
  assert.equal(M.snapDays(1, 'month'), 0);
  assert.ok(Number.isInteger(M.snapDays(123.4, 'week')));
  assert.ok(M.isClick(0, 0) && M.isClick(2, 2) && M.isClick(-2.9, 0));
  assert.ok(!M.isClick(3, 0) && !M.isClick(0, -3));
});

test('move shifts both dates, or the one date an item has (AC 20)', () => {
  assert.deepEqual(M.moveDates({ start_date: '2026-11-02', due_date: '2026-11-20' }, 3), { start_date: '2026-11-05', due_date: '2026-11-23' });
  assert.deepEqual(M.moveDates({ start_date: '2026-11-02', due_date: '2026-11-20' }, -5), { start_date: '2026-10-28', due_date: '2026-11-15' });
  assert.deepEqual(M.moveDates({ start_date: null, due_date: '2026-12-04' }, 2), { start_date: null, due_date: '2026-12-06' });
  assert.deepEqual(M.moveDates({ start_date: '2026-12-04', due_date: null }, -1), { start_date: '2026-12-03', due_date: null });
});

test('resize changes one edge; the edges cannot cross (AC 21)', () => {
  const item = { start_date: '2026-11-16', due_date: '2026-11-27' };
  assert.deepEqual(M.resizeDates(item, 'right', 7), { start_date: '2026-11-16', due_date: '2026-12-04' });
  assert.deepEqual(M.resizeDates(item, 'left', -2), { start_date: '2026-11-14', due_date: '2026-11-27' });
  assert.deepEqual(M.resizeDates(item, 'left', 50), { start_date: '2026-11-27', due_date: '2026-11-27' }, 'min one day');
  assert.deepEqual(M.resizeDates(item, 'right', -50), { start_date: '2026-11-16', due_date: '2026-11-16' }, 'min one day');
  // A one-date item gains the other edge's date.
  assert.deepEqual(M.resizeDates({ start_date: null, due_date: '2026-12-04' }, 'left', -3), { start_date: '2026-12-01', due_date: '2026-12-04' });
  assert.deepEqual(M.resizeDates({ start_date: '2026-12-04', due_date: null }, 'right', 2), { start_date: '2026-12-04', due_date: '2026-12-06' });
});

test('only the changed date fields go into the PATCH (AC 22)', () => {
  const item = { start_date: '2026-11-16', due_date: '2026-11-27' };
  assert.deepEqual(M.changedDates(item, M.resizeDates(item, 'right', 2)), { due_date: '2026-11-29' });
  assert.deepEqual(M.changedDates(item, M.moveDates(item, 1)), { start_date: '2026-11-17', due_date: '2026-11-28' });
  assert.deepEqual(M.changedDates(item, M.moveDates(item, 0)), {});
  assert.deepEqual(M.changedDates({ start_date: null, due_date: '2026-12-04' }, M.moveDates({ start_date: null, due_date: '2026-12-04' }, 1)), { due_date: '2026-12-05' });
});

test('a dropped Unscheduled item gets the day dropped on plus 6 days (AC 24)', () => {
  assert.deepEqual(M.dropDates('2026-11-16'), { start_date: '2026-11-16', due_date: '2026-11-22' });
  assert.deepEqual(M.dropDates('2026-12-28'), { start_date: '2026-12-28', due_date: '2027-01-03' });
  assert.equal(M.dropTip('PM-40', '2026-11-16'), 'PM-40 · Nov 16 – Nov 22 (7 days)');
});

test('axis columns per zoom (AC 14, 17)', () => {
  const week = M.columns(M.visibleRange([], '2026-11-05', 'week'), 'week');
  assert.ok(week.every((c) => c.width === 84 && M.startOfWeek(c.date) === c.date));
  assert.deepEqual([week[0].t1, week[0].t2], ['Oct 2026', 'Oct 5']);
  const nov2 = week.find((c) => c.date === '2026-11-02');
  assert.deepEqual([nov2.t1, nov2.t2], ['Nov 2026', 'Nov 2'], 'month over its first Monday');
  assert.equal(week.find((c) => c.date === '2026-11-09').t1, null);

  const dayRange = { start: '2026-11-01', end: '2026-11-08', days: 8 };
  const days = M.columns(dayRange, 'day');
  assert.equal(days.length, 8);
  assert.deepEqual([days[4].t1, days[4].t2, days[4].x, days[4].width], [null, 'Th 5', 4 * 36, 36]);
  assert.equal(days[0].t1, 'Nov 2026');
  assert.deepEqual(days.filter((c) => c.weekend).map((c) => c.date), ['2026-11-01', '2026-11-07', '2026-11-08']);

  const months = M.columns(M.visibleRange([], '2026-11-05', 'month'), 'month');
  assert.deepEqual(months.map((c) => c.t1), ['Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
  assert.deepEqual(months.map((c) => c.width), [31 * 4, 30 * 4, 31 * 4, 31 * 4, 28 * 4]);
  assert.ok(months.every((c) => !c.weekend), 'weekend shading is Day only');
});

test('texts: range, drag tooltips (design README)', () => {
  assert.equal(M.rangeText({ start: '2026-10-26', due: '2026-11-13' }), 'Oct 26 to Nov 13');
  assert.equal(M.rangeText({ start: '2026-12-04', due: '2026-12-04' }), 'Dec 4 (one day)');
  assert.equal(M.moveTip('PM-12', { start: '2026-11-02', due: '2026-11-20' }), 'PM-12 · Start Nov 2 – Due Nov 20 (19 days)');
  assert.equal(M.resizeTip('PM-13', 'right', { start: '2026-11-16', due: '2026-12-04' }), 'PM-13 · Due Dec 4 (Start Nov 16 unchanged)');
  assert.equal(M.resizeTip('PM-13', 'left', { start: '2026-11-14', due: '2026-12-04' }), 'PM-13 · Start Nov 14 (Due Dec 4 unchanged)');
});

test('status category: first status, terminal status, anything else (AC 11)', () => {
  const terminal = terminalStatus();
  assert.equal(M.statusCategory(STATUSES[0], STATUSES, terminal), 'todo');
  assert.equal(M.statusCategory(terminal, STATUSES, terminal), 'done');
  for (const s of STATUSES.slice(1).filter((x) => x !== terminal)) assert.equal(M.statusCategory(s, STATUSES, terminal), 'prog');
});

test('groups: epics with their scheduled children, own or rollup span; No epic; Unscheduled (AC 9, 10, 13)', () => {
  const isEpic = (i) => i.epic === true;
  const items = [
    { id: 1, key: 'PM-1', epic: true, start_date: '2026-10-12', due_date: '2026-12-04' },
    { id: 2, key: 'PM-2', epic: true },
    { id: 3, key: 'PM-3', epic: true },
    { id: 11, key: 'PM-11', epic_id: 1, start_date: '2026-11-10', due_date: '2026-11-12' },
    { id: 12, key: 'PM-12', epic_id: 1, start_date: '2026-10-26', due_date: '2026-11-13' },
    { id: 13, key: 'PM-13', epic_id: 1 },
    { id: 21, key: 'PM-21', epic_id: 2, start_date: '2026-11-02', due_date: '2026-11-06' },
    { id: 22, key: 'PM-22', epic_id: 2, due_date: '2026-12-11' },
    { id: 31, key: 'PM-31', start_date: '2026-11-03', due_date: '2026-11-05' },
    { id: 32, key: 'PM-32', epic_id: 999, start_date: '2026-11-09' },
    { id: 40, key: 'PM-40' },
  ];
  const g = M.buildGroups(items, isEpic);
  assert.deepEqual(g.groups.map((x) => x.epic.key), ['PM-1', 'PM-2', 'PM-3']);
  const [one, two, three] = g.groups;
  assert.deepEqual(one.children.map((c) => c.key), ['PM-12', 'PM-11'], 'scheduled children by start');
  assert.deepEqual(one.own, { start: '2026-10-12', due: '2026-12-04' });
  assert.equal(one.rollup, null, 'own dates win over the rollup');
  assert.equal(two.own, null);
  assert.deepEqual(two.rollup, { start: '2026-11-02', due: '2026-12-11' }, 'earliest start to latest due');
  assert.deepEqual([three.children, three.own, three.rollup], [[], null, null], 'no bar at all');
  assert.deepEqual(g.noEpic.children.map((c) => c.key), ['PM-31', 'PM-32'], 'no epic, or an epic not in the list');
  assert.deepEqual(g.noEpic.rollup, { start: '2026-11-03', due: '2026-11-09' });
  assert.deepEqual(g.unscheduled.map((i) => i.key), ['PM-3', 'PM-13', 'PM-40'], 'undated items, and undated epics without a rollup');
  assert.deepEqual(M.buildGroups([], isEpic), { groups: [], noEpic: { children: [], rollup: null }, unscheduled: [] });
});

test('page dates and scroll centring (AC 15, 16)', () => {
  const dates = M.pageDates(
    [{ start_date: '2026-11-02', due_date: null }, { start_date: null, due_date: '2026-12-04' }],
    [{ start_date: '2026-10-05', end_date: '2026-10-18' }, { start_date: '2026-11-23', end_date: null }]
  );
  assert.deepEqual(dates.sort(), ['2026-10-05', '2026-10-18', '2026-11-02', '2026-12-04']);
  assert.equal(M.scrollFor(1000, 760, 260), 750);
  assert.equal(M.scrollFor(100, 760, 260), 0, 'never negative');
});
