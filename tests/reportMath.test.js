// The Report page's pure logic (public/js/reportMath.js;
// docs/specs/daily-report.md AC 3-5, 7-10, 12-20, 26, 29-32, 35). No
// browser. The time zone is fixed so "local" and the DST Mondays are known;
// Node re-reads TZ when it changes.
process.env.TZ = 'America/New_York';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../public/js/reportMath');
const { STATUSES, terminalStatus, startedStatus } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { PRIORITIES } = require('../server/priorities');
const { publicSprintStates } = require('../server/sprintStates');
const { defaultResolution } = require('../server/resolutions');

const TERMINAL = terminalStatus();
const STARTED = startedStatus();
const RANGES = M.statusRanges(STATUSES, STARTED, TERMINAL);
const EPIC = TYPES.find((t) => t.isEpic);
const PLAIN = TYPES.find((t) => !t.isEpic);
const SPRINT_STATES = publicSprintStates();
const ACTIVE = SPRINT_STATES.find((s) => s.active).name;
const PLANNED = SPRINT_STATES.find((s) => s.initial).name;
const [P1, P2] = PRIORITIES;

test('the Yesterday window: the day before; Monday covers Fri-Sun; Saturday and Sunday look back to Friday only (AC 5, 29, 30)', () => {
  const w = (first, last = first) => ({ first, last });
  assert.deepEqual(M.yesterdayWindow('2026-11-20'), w('2026-11-19'), 'Fri -> Thu');
  assert.deepEqual(M.yesterdayWindow('2026-11-17'), w('2026-11-16'), 'Tue -> Mon');
  assert.deepEqual(M.yesterdayWindow('2026-11-16'), w('2026-11-13', '2026-11-15'), 'Mon -> Fri..Sun');
  assert.deepEqual(M.yesterdayWindow('2026-11-15'), w('2026-11-13'), 'Sun -> Fri only');
  assert.deepEqual(M.yesterdayWindow('2026-11-14'), w('2026-11-13'), 'Sat -> Fri only');
  assert.deepEqual(M.yesterdayWindow('2026-03-02'), w('2026-02-27', '2026-03-01'), 'Mon across a month');
  assert.deepEqual(M.yesterdayWindow('2027-01-01'), w('2026-12-31'), 'across a year');
  assert.deepEqual(M.yesterdayWindow('2026-01-05'), w('2026-01-02', '2026-01-04'), 'Mon across a year');
});

test('window texts: one day, or a range with an en dash, even across a month (AC 5)', () => {
  assert.equal(M.windowText(M.yesterdayWindow('2026-11-20')), 'Thu Nov 19');
  assert.equal(M.windowText(M.yesterdayWindow('2026-11-14')), 'Fri Nov 13');
  assert.equal(M.windowText(M.yesterdayWindow('2026-11-16')), 'Fri Nov 13 – Sun Nov 15');
  assert.equal(M.windowText(M.yesterdayWindow('2026-11-02')), 'Fri Oct 30 – Sun Nov 1');
});

test('a Monday window as a UTC range, including the DST Mondays (AC 7, 32)', () => {
  const span = (r) => (Date.parse(r.to) - Date.parse(r.from)) / 3600000;
  const mon = (day) => {
    const w = M.yesterdayWindow(day);
    return M.localDayRange(w.first, w.last);
  };
  const plain = mon('2026-11-16');
  assert.equal(plain.from, new Date(2026, 10, 13).toISOString());
  assert.equal(plain.to, new Date(2026, 10, 16).toISOString());
  assert.equal(span(plain), 72);
  // Fall back on Sun Nov 1 2026: 73 hours, Fri Oct 30 00:00 to Mon Nov 2 00:00 local.
  const fall = mon('2026-11-02');
  assert.equal(span(fall), 73);
  assert.equal(fall.from, '2026-10-30T04:00:00.000Z');
  assert.equal(fall.to, '2026-11-02T05:00:00.000Z');
  // Spring forward on Sun Mar 14 2027: 71 hours.
  const spring = mon('2027-03-15');
  assert.equal(span(spring), 71);
  assert.equal(spring.from, '2027-03-12T05:00:00.000Z');
  assert.equal(spring.to, '2027-03-15T04:00:00.000Z');
  // All fit the endpoint's 76-hour cap.
  for (const r of [plain, fall, spring]) assert.ok(span(r) <= 76);
});

test('the local day as a UTC range; local today (AC 2, 7)', () => {
  const r = M.localDayRange('2026-11-19');
  assert.equal(r.from, new Date(2026, 10, 19).toISOString());
  assert.equal(r.to, new Date(2026, 10, 20).toISOString());
  const span = Date.parse(r.to) - Date.parse(r.from);
  assert.ok(span >= 23 * 3600000 && span <= 25 * 3600000);
  assert.equal(M.localToday(new Date(2026, 10, 20, 23, 59)), '2026-11-20');
  assert.equal(M.localToday(new Date(2026, 0, 2, 0, 0)), '2026-01-02');
});

test('date texts and the YYYY-MM-DD check (AC 3, 5, 18, 26)', () => {
  assert.equal(M.shortDay('2026-11-19'), 'Thu Nov 19');
  assert.equal(M.longDay('2026-11-20'), 'Fri Nov 20 2026');
  assert.equal(M.monthDay('2026-11-27'), 'Nov 27');
  assert.ok(M.isDay('2026-11-20'));
  assert.ok(M.isDay('2028-02-29'));
  for (const bad of ['2026-02-29', '2026-13-01', '2026-11-5', 'today', '', null, undefined, '2026-11-20T00:00']) {
    assert.ok(!M.isDay(bad), String(bad));
  }
});

test('durations read 0h, 45m, 2h, 1h 30m (AC 8, 10)', () => {
  assert.equal(M.duration(0), '0h');
  assert.equal(M.duration(45), '45m');
  assert.equal(M.duration(120), '2h');
  assert.equal(M.duration(90), '1h 30m');
  assert.equal(M.duration(225), '3h 45m');
  assert.equal(M.hoursToMinutes(1.5), 90);
});

test('the activity summary: net status change with resolution, created, comments, time (AC 8)', () => {
  const base = { status_changes: [], resolution: null, created: false, comments: 0, minutes: 0 };
  assert.equal(
    M.activitySummary({ ...base, status_changes: [{ from: STATUSES[1], to: TERMINAL }], resolution: defaultResolution(), minutes: 120 }, TERMINAL),
    `${STATUSES[1]} -> ${TERMINAL} (${defaultResolution()}); logged 2h`
  );
  // Several changes: first old value to last new value.
  assert.equal(
    M.activitySummary({ ...base, status_changes: [{ from: STATUSES[0], to: STATUSES[1] }, { from: STATUSES[1], to: TERMINAL }], resolution: defaultResolution() }, TERMINAL),
    `${STATUSES[0]} -> ${TERMINAL} (${defaultResolution()})`
  );
  // A round trip is omitted when something else is there.
  const trip = [{ from: STATUSES[1], to: STARTED }, { from: STARTED, to: STATUSES[1] }];
  assert.equal(M.activitySummary({ ...base, status_changes: trip, comments: 1 }, TERMINAL), 'commented');
  assert.equal(M.activitySummary({ ...base, status_changes: trip, minutes: 60 }, TERMINAL), 'logged 1h');
  assert.equal(M.activitySummary({ ...base, status_changes: trip, created: true }, TERMINAL), 'created');
  // Alone, it shows the path taken (D1, AC 35).
  assert.equal(M.activitySummary({ ...base, status_changes: trip }, TERMINAL), `${STATUSES[1]} -> ${STARTED} -> ${STATUSES[1]}`);
  assert.equal(
    M.activitySummary({ ...base, status_changes: [...trip, ...trip] }, TERMINAL),
    `${STATUSES[1]} -> ${STARTED} -> ${STATUSES[1]} -> ${STARTED} -> ${STATUSES[1]}`
  );
  assert.equal(M.activitySummary(base, TERMINAL), '');
  // Order: status, created, commented xN, logged.
  assert.equal(
    M.activitySummary({ ...base, status_changes: [{ from: STATUSES[0], to: STARTED }], created: true, comments: 2, minutes: 90 }, TERMINAL),
    `${STATUSES[0]} -> ${STARTED}; created; commented x2; logged 1h 30m`
  );
  // No resolution unless the final status is terminal.
  assert.equal(M.activitySummary({ ...base, status_changes: [{ from: TERMINAL, to: STARTED }], resolution: 'stale' }, TERMINAL), `${TERMINAL} -> ${STARTED}`);
});

test('status ranges come from the server order: waiting before the started status, active up to the terminal one (AC 12, 16)', () => {
  const start = STATUSES.indexOf(STARTED);
  assert.deepEqual(RANGES.waiting, STATUSES.slice(0, start));
  assert.deepEqual(RANGES.active, STATUSES.slice(start, STATUSES.length - 1));
  assert.ok(!RANGES.active.includes(TERMINAL));
  // An added status between the started and terminal ones is active.
  const more = [...STATUSES.slice(0, -1), 'In Review', TERMINAL];
  assert.ok(M.statusRanges(more, STARTED, TERMINAL).active.includes('In Review'));
});

// ---------- the report model ----------

let nextId = 1;
const item = (fields) => {
  const id = nextId++;
  return { id, number: id, key: `EFS-${id}`, title: `Item ${id}`, type: PLAIN.name, status: STATUSES[0], priority: P1, assignee_id: null, rank: id * 1000, sprint_id: null, sprint_rank: null, remaining_hours: null, ...fields };
};
const USERS = [{ id: 1, name: 'Robert Michaels' }, { id: 2, name: 'Dana Lee' }];

function sample() {
  nextId = 1;
  const active = RANGES.active;
  const items = [
    item({ status: active[1], assignee_id: 1, rank: 500, remaining_hours: 1.5 }), // EFS-1
    item({ status: active[0], assignee_id: 1, rank: 2000, remaining_hours: 4 }), // EFS-2
    item({ status: active[0], assignee_id: 1, rank: 1000 }), // EFS-3
    item({ status: active[0], assignee_id: 2 }), // EFS-4: someone else
    item({ status: TERMINAL, assignee_id: 1 }), // EFS-5: done
    item({ status: active[0], assignee_id: 1, type: EPIC.name }), // EFS-6: an epic in Today
    item({ status: RANGES.waiting[1], sprint_id: 10, sprint_rank: 2000, assignee_id: 1, priority: P2 }), // EFS-7
    item({ status: RANGES.waiting[0], sprint_id: 10, sprint_rank: 1000 }), // EFS-8
    item({ status: RANGES.waiting[0], sprint_id: 11, sprint_rank: 500, assignee_id: 2 }), // EFS-9: planned sprint
    item({ status: RANGES.waiting[0], sprint_id: null, sprint_rank: 100, assignee_id: 99 }), // EFS-10: backlog, unknown user
    item({ status: RANGES.waiting[0], type: EPIC.name }), // EFS-11: epics never wait
  ];
  const sprints = [
    { id: 10, name: 'Sprint 4', state: ACTIVE, end_date: '2026-11-27', item_count: 13, done_count: 6 },
    { id: 11, name: 'Sprint 5', state: PLANNED, end_date: null, item_count: 1, done_count: 0 },
  ];
  const activity = {
    items: [
      { issue_id: 2, key: 'EFS-2', title: 'Item 2', type: PLAIN.name, status_changes: [{ from: RANGES.waiting[1], to: STARTED }], resolution: null, created: false, comments: 2, minutes: 60 },
      { issue_id: 6, key: 'EFS-6', title: 'Item 6', type: EPIC.name, status_changes: [], resolution: null, created: true, comments: 0, minutes: 0 },
    ],
    total_minutes: 60,
  };
  return {
    projectName: 'EFS Automation',
    personId: 1,
    personName: 'Robert Michaels',
    date: '2026-11-20',
    today: '2026-11-20',
    activity,
    activityError: null,
    items,
    sprints,
    users: USERS,
    statuses: STATUSES,
    startedStatus: STARTED,
    terminalStatus: TERMINAL,
    sprintStates: SPRINT_STATES,
    types: TYPES,
  };
}

test('heading and three sections in order (AC 3, 4)', () => {
  const model = M.buildReport(sample());
  assert.equal(model.title, 'Daily report: EFS Automation, Robert Michaels, Fri Nov 20 2026');
  assert.deepEqual(model.sections.map((s) => s.heading), ['Yesterday', 'Today', 'Waiting']);
});

test('Yesterday: lines, day note, epics labelled, total; empty text and 0h (AC 5, 8-11)', () => {
  const y = M.buildReport(sample()).sections[0];
  assert.equal(y.note, '(Thu Nov 19)');
  assert.deepEqual(y.rows.map((r) => [r.key, r.epic, r.summary]), [
    ['EFS-2', null, `${RANGES.waiting[1]} -> ${STARTED}; commented x2; logged 1h`],
    ['EFS-6', EPIC.label, 'created'],
  ]);
  assert.equal(y.total, 'Total time logged: 1h');
  const empty = M.buildReport({ ...sample(), date: '2026-11-14', activity: { items: [], total_minutes: 0 } }).sections[0];
  assert.equal(empty.note, '(Fri Nov 13)');
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.empty, 'No recorded activity on Fri Nov 13.');
  assert.equal(empty.total, 'Total time logged: 0h');
  // A Monday names the Fri-Sun range (AC 5, 9, 29, 31).
  const monday = M.buildReport({ ...sample(), date: '2026-11-16', activity: { items: [], total_minutes: 0 } }).sections[0];
  assert.equal(monday.note, '(Fri Nov 13 – Sun Nov 15)');
  assert.equal(monday.empty, 'No recorded activity Fri Nov 13 – Sun Nov 15.');
  // Tuesday, Saturday and Sunday name one day (AC 30).
  assert.equal(M.buildReport({ ...sample(), date: '2026-11-17' }).sections[0].note, '(Mon Nov 16)');
  assert.equal(M.buildReport({ ...sample(), date: '2026-11-15' }).sections[0].note, '(Fri Nov 13)');
});

test('Today: the person\'s active items in Board order, with remaining; empty text; note when not today (AC 12-15)', () => {
  const t = M.buildReport(sample()).sections[1];
  assert.deepEqual(t.rows.map((r) => r.key), ['EFS-3', 'EFS-2', 'EFS-6', 'EFS-1'], 'status column, then rank');
  assert.deepEqual(t.rows[1].meta.map((m) => m.text), [RANGES.active[0], P1, 'remaining 4h']);
  assert.deepEqual(t.rows[0].meta.map((m) => m.text), [RANGES.active[0], P1], 'no estimate, no remaining');
  assert.equal(t.rows[2].epic, EPIC.label);
  assert.equal(t.rows[3].meta[2].text, 'remaining 1h 30m');
  assert.equal(t.note, '');
  const other = M.buildReport({ ...sample(), date: '2026-11-16' }).sections;
  assert.equal(other[1].note, '(current status as of now)');
  assert.equal(other[2].note, '(current status as of now)');
  const none = M.buildReport({ ...sample(), personId: 3 }).sections[1];
  assert.deepEqual(none.rows, []);
  assert.equal(none.empty, 'Nothing in progress.');
});

test('Waiting: whole project, no epics, split by the active sprint, by sprint rank, with assignees and sprint line (AC 16-18)', () => {
  const w = M.buildReport(sample()).sections[2];
  assert.equal(w.sprintLine, 'Sprint 4: 6 of 13 complete, ends Nov 27');
  assert.deepEqual(w.groups.map((g) => g.heading), ['In the active sprint', 'Backlog and other sprints']);
  assert.deepEqual(w.groups[0].rows.map((r) => r.key), ['EFS-8', 'EFS-7']);
  assert.deepEqual(w.groups[1].rows.map((r) => r.key), ['EFS-10', 'EFS-9']);
  assert.deepEqual(w.groups[0].rows[1].meta.map((m) => m.text), [RANGES.waiting[1], P2, 'Robert Michaels']);
  assert.equal(w.groups[0].rows[0].meta[2].text, 'Unassigned');
  assert.equal(w.groups[1].rows[0].meta[2].text, 'Unknown user');
  // No active sprint: the first sub-list says so and there is no sprint line.
  const noSprint = M.buildReport({ ...sample(), sprints: [] }).sections[2];
  assert.equal(noSprint.sprintLine, null);
  assert.deepEqual(noSprint.groups[0].rows, []);
  assert.equal(noSprint.groups[0].empty, 'No active sprint.');
  assert.equal(noSprint.groups[1].rows.length, 4);
  // Empty sub-lists say "None."
  const nothing = M.buildReport({ ...sample(), items: [] }).sections[2];
  assert.deepEqual(nothing.groups.map((g) => g.empty), ['None.', 'None.']);
});

test('sprint line variants: no end date, no items (AC 18)', () => {
  assert.equal(M.sprintLine({ name: 'Sprint 4', end_date: null, item_count: 3, done_count: 1 }), 'Sprint 4: 1 of 3 complete, no end date');
  assert.equal(M.sprintLine({ name: 'Sprint 4', end_date: '2026-11-27', item_count: 0, done_count: 0 }), 'Sprint 4: no items, ends Nov 27');
});

// ---------- clipboard flavors ----------

test('plain text: headings as lines, - bullets, -> arrows, totals (AC 19, 20)', () => {
  const text = M.toPlainText(M.buildReport(sample()));
  assert.equal(
    text,
    [
      'Daily report: EFS Automation, Robert Michaels, Fri Nov 20 2026',
      '',
      'Yesterday (Thu Nov 19)',
      `- EFS-2 Item 2: ${RANGES.waiting[1]} -> ${STARTED}; commented x2; logged 1h`,
      `- EFS-6 [${EPIC.label}] Item 6: created`,
      'Total time logged: 1h',
      '',
      'Today',
      `- EFS-3 Item 3 - ${RANGES.active[0]}, ${P1}`,
      `- EFS-2 Item 2 - ${RANGES.active[0]}, ${P1}, remaining 4h`,
      `- EFS-6 [${EPIC.label}] Item 6 - ${RANGES.active[0]}, ${P1}`,
      `- EFS-1 Item 1 - ${RANGES.active[1]}, ${P1}, remaining 1h 30m`,
      '',
      'Waiting',
      'Sprint 4: 6 of 13 complete, ends Nov 27',
      'In the active sprint',
      `- EFS-8 Item 8 - ${RANGES.waiting[0]}, ${P1}, Unassigned`,
      `- EFS-7 Item 7 - ${RANGES.waiting[1]}, ${P2}, Robert Michaels`,
      'Backlog and other sprints',
      `- EFS-10 Item 10 - ${RANGES.waiting[0]}, ${P1}, Unknown user`,
      `- EFS-9 Item 9 - ${RANGES.waiting[0]}, ${P1}, Dana Lee`,
    ].join('\n')
  );
  const empty = M.toPlainText(M.buildReport({ ...sample(), date: '2026-11-14', activity: { items: [], total_minutes: 0 }, items: [], sprints: [] }));
  assert.match(empty, /Yesterday \(Fri Nov 13\)\nNo recorded activity on Fri Nov 13\.\nTotal time logged: 0h/);
  assert.match(empty, /Today \(current status as of now\)\nNothing in progress\./);
  assert.match(empty, /In the active sprint\nNo active sprint\.\nBacklog and other sprints\nNone\./);
});

test('HTML: one wrapper, inline styles only, bold keys, no links, classes, style blocks or images (AC 19, 20)', () => {
  const html = M.toHtml(M.buildReport(sample()));
  assert.match(html, /^<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;[^"]*">/);
  assert.match(html, /<\/div>$/);
  assert.match(html, /<h1 style="[^"]+">Daily report: EFS Automation, Robert Michaels, Fri Nov 20 2026<\/h1>/);
  assert.match(html, /<h2 style="[^"]*color:#0b5d66;[^"]*">Yesterday \(Thu Nov 19\)<\/h2>/);
  assert.match(html, /<li style="[^"]+"><b>EFS-2<\/b> Item 2: [^<]+ -&gt; [^<]+; commented x2; logged 1h<\/li>/);
  assert.match(html, /<p style="[^"]+"><b>Total time logged: 1h<\/b><\/p>/);
  assert.match(html, /<p style="[^"]*color:#154973;[^"]*">In the active sprint<\/p>/);
  assert.doesNotMatch(html, /<a\b|class=|<style|<img|<script|href=/);
  assert.equal((html.match(/<h2 /g) || []).length, 3);
  // Every element carries an inline style except <b>.
  for (const tag of html.match(/<(?!\/)(?!b>)[a-z0-9]+[^>]*>/g)) assert.match(tag, / style="/, tag);
});

test('HTML escapes every user text; the plain text keeps it literal (AC 20)', () => {
  const hostile = '<img src=x onerror=alert(1)> & <b>bold</b> "q" \'s\'';
  const input = sample();
  input.projectName = '<script>alert(1)</script> Project';
  input.personName = 'A & B';
  input.items = input.items.map((i) => ({ ...i, title: hostile }));
  input.activity.items[0].title = hostile;
  input.sprints[0].name = '<i>Sprint</i>';
  input.users = [{ id: 1, name: '<u>Rob</u>' }];
  const model = M.buildReport({ ...input, personName: 'A & B' });
  const html = M.toHtml(model);
  assert.doesNotMatch(html, /<script|<img|<i>|<u>|<b>bold/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Project, A &amp; B,/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &lt;b&gt;bold&lt;\/b&gt; &quot;q&quot; &#39;s&#39;/);
  assert.match(html, /&lt;i&gt;Sprint&lt;\/i&gt;: 6 of 13/);
  assert.match(html, /&lt;u&gt;Rob&lt;\/u&gt;/);
  const text = M.toPlainText(model);
  assert.ok(text.includes(hostile));
  assert.ok(text.startsWith('Daily report: <script>alert(1)</script> Project, A & B,'));
});

test('a failed Yesterday request shows the load error and no total; the rest still renders (design states D)', () => {
  const model = M.buildReport({ ...sample(), activity: null, activityError: 'Network error.' });
  assert.equal(model.sections[0].error, 'Network error.');
  assert.equal(model.sections[0].total, null);
  assert.ok(model.sections[1].rows.length > 0);
  assert.match(M.toPlainText(model), /Yesterday \(Thu Nov 19\)\nCould not load the report\.\n\nToday/);
});

test('an empty Monday window names the range in both copy flavors (AC 19, 31)', () => {
  const model = M.buildReport({ ...sample(), date: '2026-11-16', activity: { items: [], total_minutes: 0 } });
  const text = M.toPlainText(model);
  assert.ok(text.includes('\nYesterday (Fri Nov 13 – Sun Nov 15)\nNo recorded activity Fri Nov 13 – Sun Nov 15.\nTotal time logged: 0h\n'), text);
  const html = M.toHtml(model);
  assert.match(html, /<h2 style="[^"]+">Yesterday \(Fri Nov 13 – Sun Nov 15\)<\/h2>\n<p style="[^"]+">No recorded activity Fri Nov 13 – Sun Nov 15\.<\/p>/);
});

test('a lone round trip shows its path; no line ever ends in a colon (D1, AC 8, 35)', () => {
  const trip = { status_changes: [{ from: 'Ready', to: 'In Progress' }, { from: 'In Progress', to: 'Ready' }], resolution: null, created: false, comments: 0, minutes: 0 };
  const input = sample();
  input.activity = {
    items: [
      { issue_id: 3, key: 'EFS-3', title: 'Round trip', type: PLAIN.name, ...trip },
      // An empty summary however it arises: key and title only.
      { issue_id: 4, key: 'EFS-4', title: 'Nothing', type: PLAIN.name, ...trip, status_changes: [] },
    ],
    total_minutes: 0,
  };
  const model = M.buildReport(input);
  assert.deepEqual(model.sections[0].rows.map((r) => r.summary), ['Ready -> In Progress -> Ready', '']);
  const text = M.toPlainText(model);
  assert.ok(text.includes('\n- EFS-3 Round trip: Ready -> In Progress -> Ready\n'), text);
  assert.ok(text.includes('\n- EFS-4 Nothing\n'), text);
  for (const line of text.split('\n')) assert.doesNotMatch(line, /:\s*$/, line);
  const html = M.toHtml(model);
  assert.match(html, /<li style="[^"]+"><b>EFS-3<\/b> Round trip: Ready -&gt; In Progress -&gt; Ready<\/li>/);
  assert.match(html, /<li style="[^"]+"><b>EFS-4<\/b> Nothing<\/li>/);
  assert.doesNotMatch(html, /:\s*<\/li>/);
  // The on-screen render skips an empty summary (report.js).
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/js/report.js'), 'utf8');
  assert.match(js, /if \(row\.summary\) parts\.push\(el\('span', \{ class: 'r-sum' \}/);
});

// ---------- the page (static) ----------

test('the Report page: sub-nav after Timeline and before Test Cases on every project page; controls and report markup (AC 1, 2, 28)', () => {
  const root = path.join(__dirname, '..');
  const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
  const page = read('public/report.html');
  for (const f of ['public/board.html', 'public/backlog.html', 'public/sprints.html', 'public/timeline.html', 'public/test-cases.html', 'public/report.html']) {
    const html = read(f);
    const nav = html.slice(html.indexOf('<nav class="subnav"'), html.indexOf('</nav>'));
    const ids = (nav.match(/id="nav-[a-z-]+"/g) || []).map((m) => m.slice(4, -1));
    assert.deepEqual(ids.slice(ids.indexOf('nav-timeline'), ids.indexOf('nav-timeline') + 3), ['nav-timeline', 'nav-report', 'nav-test-cases'], f);
    const current = f === 'public/report.html';
    assert.match(nav, current ? /<a id="nav-report" href="report\.html" aria-current="page">Report<\/a>/ : /<a id="nav-report" href="report\.html">Report<\/a>/, f);
  }
  assert.match(page, /<label for="rp-person">Person<select id="rp-person"><\/select><\/label>/);
  assert.match(page, /<label for="rp-date">Date<input type="date" id="rp-date"><\/label>/);
  assert.match(page, /<button type="button" id="rp-today">Today<\/button>/);
  assert.match(page, /<button type="button" id="rp-copy" class="navy push">Copy for email<\/button>/);
  assert.match(page, /<p class="copy-status" id="rp-copy-status" role="status"><\/p>/);
  assert.match(page, /<article class="panel report" id="rp-report"/);
  assert.match(page, /js\/session\.js[\s\S]*js\/projectScope\.js[\s\S]*js\/reportMath\.js[\s\S]*js\/report\.js/);
  assert.doesNotMatch(page, /<script[^>]+src="https?:/, 'no CDN script');
  const js = read('public/js/report.js');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, 'text only');
  assert.doesNotMatch(js, /api\.(post|patch|del|upload)\(/, 'read-only page');
  assert.match(js, /localDayRange\(win\.first, win\.last\)/, 'the whole window is requested (AC 7, 22)');
  assert.match(js, /from_day: win\.first, to_day: win\.last/, 'with its first and last days (AC 22)');
  assert.match(js, /navigator\.clipboard\.write\(/);
  assert.match(js, /new ClipboardItem\(/);
  assert.match(js, /document\.execCommand\('copy'\)/);
  assert.doesNotMatch(js, /\.disabled\s*=/, 'controls are never disabled');
  const css = read('public/css/app.css');
  for (const rule of ['.report-controls {', '.copy-status.ok {', '.report-title {', '.rows li {', '.total-line {', '.empty-line {', '.sprint-line {']) {
    assert.ok(css.includes(rule), rule);
  }
});
