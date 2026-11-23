// The Board's "Copy board" builder (public/js/boardCopy.js;
// docs/specs/copy-board-as-table.md AC 4-15, 18) and its wiring on the
// Board page (AC 1, 3, 9, 10, 16, 17). No browser: the lists come from the
// server modules, so no status, type or priority is named here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../public/js/boardCopy');
const { STATUSES } = require('../server/statuses');
const { TYPES } = require('../server/types');
const { PRIORITIES } = require('../server/priorities');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const TASK = TYPES.find((t) => !t.isEpic);
const OTHER = TYPES.filter((t) => !t.isEpic)[1] || TASK;
const USERS = [
  { id: 1, name: 'Ann Able' },
  { id: 2, name: 'Bo Baker' },
];
const S = STATUSES;
const N = S.length;

let nextId = 1;
function item(status, fields = {}) {
  const id = nextId++;
  return { id, key: `EFS-${id}`, title: `Item ${id}`, type: TASK.name, priority: PRIORITIES[1], assignee_id: null, status, rank: id * 1000, ...fields };
}

function input(overrides = {}) {
  return {
    project: { name: 'EFS Automation', key: 'EFS' },
    sprint: { name: 'Sprint 4' },
    now: new Date(2026, 10, 23, 9, 30), // local time
    groupByLabel: null,
    statuses: S,
    lanes: [],
    shown: 0,
    total: 0,
    filtersActive: false,
    typeLabel: (name) => (TYPES.find((t) => t.name === name) || {}).label || name,
    userName: (id) => (USERS.find((u) => u.id === id) || {}).name || null,
    ...overrides,
  };
}

// Group by None: one lane with every item (as computeLanes returns it).
function ungrouped() {
  const a = item(S[0], { assignee_id: 1 });
  const b = item(S[0]);
  const c = item(S[2], { assignee_id: 2, type: OTHER.name, priority: PRIORITIES[0] });
  const items = [a, b, c];
  return { items, model: C.buildModel(input({ lanes: [{ label: null, items }], shown: 3, total: 3 })) };
}

// Group by Assignee: lanes in screen order, the second empty (no filter).
function grouped(filtersActive = false) {
  const a = item(S[1], { assignee_id: 2 });
  const b = item(S[N - 1], { assignee_id: 2 });
  const c = item(S[1], { assignee_id: 2 });
  const d = item(S[0]);
  const lanes = [
    { label: 'Bo Baker', items: [a, b, c] },
    ...(filtersActive ? [] : [{ label: 'Ann Able', items: [] }]),
    { label: 'Unassigned', items: [d] },
  ];
  return { lanes, model: C.buildModel(input({ groupByLabel: 'Assignee', lanes, shown: 4, total: filtersActive ? 9 : 4, filtersActive })) };
}

const rows = (html) => html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
const cellsOf = (row) => row.match(/<t[hd]\b/g) || [];
// The status cells hold nested one-card-per-row tables (for mail clients).
// For structure checks, rename the nested tags so only the outer grid counts.
const flatHtml = (model) =>
  C.toHtml(model).replace(/<table border="0"[\s\S]*?<\/table>/g, (s) => s.replace(/<(\/?)(table|tr|td)\b/g, '<$1x-$2'));

// ---------- the model and the HTML table ----------

test('the header row has one cell per status in server order with its count (AC 4)', () => {
  const { model } = ungrouped();
  const html = flatHtml(model);
  assert.equal((html.match(/<table\b/g) || []).length, 1, 'one table');
  const header = rows(html)[0];
  const ths = header.match(/<th\b[^>]*>[\s\S]*?<\/th>/g);
  assert.equal(ths.length, N);
  const expected = S.map((s) => (s === S[0] ? 2 : s === S[2] ? 1 : 0));
  ths.forEach((th, i) => {
    assert.ok(th.includes(`>${C.escapeHtml(S[i])} <span`), S[i]);
    assert.ok(th.includes(`(${expected[i]})</span>`), `${S[i]} count`);
    assert.match(th, new RegExp(`width="${Math.floor(100 / N)}%"`));
  });
  assert.deepEqual(model.columns.map((c) => c.name), S);
});

test('Group by None: one body row of status cells and no lane row (AC 5)', () => {
  const html = flatHtml(ungrouped().model);
  const all = rows(html);
  assert.equal(all.length, 2, 'header and one body row');
  assert.doesNotMatch(html, /colspan=/);
  assert.equal(cellsOf(all[1]).length, N);
  assert.doesNotMatch(html, /Grouped by/);
  assert.equal(C.toPlainText(ungrouped().model).split('\n')[0], 'Board: EFS Automation (EFS), Sprint 4, Mon Nov 23 2026');
});

test('grouped: a full-width heading row per lane, in screen order, then its status row (AC 6)', () => {
  const { model } = grouped();
  const html = flatHtml(model);
  const all = rows(html);
  assert.equal(all.length, 1 + 3 * 2);
  const heads = all.filter((r) => r.includes('colspan='));
  assert.equal(heads.length, 3);
  for (const h of heads) {
    assert.match(h, new RegExp(`colspan="${N}"`));
    assert.match(h, /bgcolor="#154973"/);
  }
  assert.match(heads[0], />Bo Baker <span style="font-weight:normal;">- 3 work items<\/span>/);
  assert.match(heads[1], />Ann Able <span style="font-weight:normal;">- 0 work items<\/span>/);
  assert.match(heads[2], />Unassigned <span style="font-weight:normal;">- 1 work item<\/span>/);
  // Each heading row is followed by its status row.
  for (let i = 1; i < all.length; i += 2) {
    assert.ok(all[i].includes('colspan='), `row ${i} is a lane heading`);
    assert.equal(cellsOf(all[i + 1]).length, N);
  }
  assert.match(html, />Grouped by Assignee</);
});

test('cards sit in their status cell in the given order, with key, title and meta (AC 7)', () => {
  const { lanes, model } = grouped();
  const [a, b, c] = lanes[0].items;
  const html = flatHtml(model);
  const laneRow = rows(html)[2];
  const tds = laneRow.match(/<td\b[^>]*>[\s\S]*?<\/td>/g);
  const ready = tds[1];
  assert.ok(ready.indexOf(`<b>${a.key}</b> ${a.title}`) < ready.indexOf(`<b>${c.key}</b> ${c.title}`), 'order kept');
  assert.ok(tds[N - 1].includes(`<b>${b.key}</b>`));
  assert.ok(ready.includes(`>${TASK.label}, ${PRIORITIES[1]}, Bo Baker</div>`));
  const unassigned = rows(html)[6];
  assert.ok(unassigned.includes(`${TASK.label}, ${PRIORITIES[1]}, Unassigned`));
  // Type uses the server's label, priority and assignee follow.
  const { model: m2 } = ungrouped();
  assert.deepEqual(m2.lanes[0].cells[2][0].meta, `${OTHER.label}, ${PRIORITIES[0]}, Bo Baker`);
  // Nothing else from the on-screen card.
  assert.doesNotMatch(html, /Added|💬|Completed/);
});

test('empty cells hold &nbsp; and every row has a cell per status (AC 8)', () => {
  for (const { model } of [ungrouped(), grouped(), grouped(true)]) {
    const html = flatHtml(model);
    for (const row of rows(html)) {
      if (row.includes('colspan=')) assert.equal(cellsOf(row).length, 1);
      else assert.equal(cellsOf(row).length, N);
    }
    assert.match(html, /<td valign="top" bgcolor="#f8fafa" style="[^"]+">&nbsp;<\/td>/);
  }
});

test('filters: only the given lanes and cards, header counts from them, the Filtered line (AC 9, 10)', () => {
  const { model } = grouped(true);
  const html = C.toHtml(model);
  assert.equal(rows(html).filter((r) => r.includes('colspan=')).length, 2, 'empty lane not copied');
  assert.doesNotMatch(html, /Ann Able/);
  assert.match(html, /<p style="[^"]+">Filtered: showing 4 of 9 work items<\/p>/);
  assert.equal(model.columns.reduce((n, c) => n + c.count, 0), 4);
  assert.equal(model.columns[1].count, 2);
  // No filter: no Filtered line.
  assert.doesNotMatch(C.toHtml(grouped().model), /Filtered:/);
  assert.doesNotMatch(C.toPlainText(grouped().model), /Filtered:/);
  // The builder has no notion of a collapsed lane: every lane given is copied with its cards.
  assert.doesNotMatch(read('public/js/boardCopy.js'), /collapsed/i);
});

test('the heading names project, key, sprint and date, and the grouping (AC 11)', () => {
  const { model } = grouped(true);
  assert.equal(model.title, 'Board: EFS Automation (EFS), Sprint 4, Mon Nov 23 2026');
  assert.deepEqual(model.lines, ['Grouped by Assignee', 'Filtered: showing 4 of 9 work items']);
  const html = C.toHtml(model);
  assert.match(html, /<h1 style="[^"]+">Board: EFS Automation \(EFS\), Sprint 4, Mon Nov 23 2026<\/h1>/);
});

test('the HTML is email-safe: inline styles only, no class, style block, image, script, link, flex, grid or var (AC 12)', () => {
  for (const { model } of [ungrouped(), grouped(), grouped(true)]) {
    const html = C.toHtml(model);
    for (const bad of [/class=/, /<style/i, /<img/i, /<script/i, /<a /i, /display:\s*flex/, /display:\s*grid/, /var\(/]) {
      assert.doesNotMatch(html, bad, String(bad));
    }
    // Every element but <b>, <tr> and </...> carries an inline style.
    for (const tag of html.match(/<(?!\/)[a-z0-9]+\b[^>]*>/gi)) {
      if (/^<(b|tr)>$/.test(tag)) continue;
      assert.match(tag, /\sstyle="[^"]+"/, tag);
    }
    assert.match(html, /^<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#000000;">/);
    assert.match(html, /<table border="1" cellpadding="0" cellspacing="0" width="100%" bordercolor="#8d9499" style="/);
  }
});

test('status cells and cards wrap long unbroken words instead of overflowing (design: long titles wrap)', () => {
  for (const { model } of [ungrouped(), grouped()]) {
    const html = C.toHtml(model);
    const cells = html.match(/<td valign="top"[^>]*>/g);
    assert.ok(cells && cells.length);
    for (const td of cells) assert.match(td, /overflow-wrap:break-word/, td);
    const cards = html.match(/<td bgcolor="#ffffff" style="[^"]*">/g);
    assert.ok(cards && cards.length);
    for (const card of cards) assert.match(card, /overflow-wrap:break-word/, card);
  }
});

test('cards are separate bordered table cells with a spacer row between them, not styled divs', () => {
  const html = C.toHtml(ungrouped().model);
  assert.doesNotMatch(html, /<div style="[^"]*margin:0 0 6px/);
  for (const td of html.match(/<td bgcolor="#ffffff" style="[^"]*">/g)) assert.match(td, /border:1px solid #8d9499/, td);
  const stacks = html.match(/<table border="0"[^>]*>.*?<\/table>/gs) || [];
  assert.ok(stacks.length);
  const multi = stacks.find((s) => (s.match(/bgcolor="#ffffff"/g) || []).length > 1);
  assert.ok(multi, 'a cell with more than one card');
  const cardCount = (multi.match(/bgcolor="#ffffff"/g) || []).length;
  assert.equal((multi.match(/height="10"/g) || []).length, cardCount - 1);
});

test('user text is escaped in the HTML and literal in the plain text (AC 13)', () => {
  const hostile = '<b>x</b> & "y" \'z\'';
  const name = "O'Brien <script>alert(1)</script>";
  const x = item(S[1], { title: hostile, assignee_id: 9 });
  const model = C.buildModel(
    input({
      project: { name: 'P <i>&', key: 'K"' },
      sprint: { name: "S'1>" },
      groupByLabel: 'Assignee',
      lanes: [{ label: name, items: [x] }],
      shown: 1,
      total: 1,
      userName: (id) => (id === 9 ? name : null),
    })
  );
  const html = C.toHtml(model);
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot; &#39;z&#39;'));
  assert.ok(html.includes('O&#39;Brien &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Board: P &lt;i&gt;&amp; (K&quot;), S&#39;1&gt;'));
  for (const raw of [hostile, name, '<b>x', '<script', '<i>', "S'1"]) assert.ok(!html.includes(raw), raw);
  assert.equal(C.escapeHtml('&lt;'), '&amp;lt;', 'already escaped text is escaped again');
  const text = C.toPlainText(model);
  assert.ok(text.includes(`- ${x.key} ${hostile} (${TASK.label}, ${PRIORITIES[1]}, ${name})`));
  assert.ok(text.includes(`${name} (1 work item)`));
});

test('the plain text: heading lines, lane lines, Status (count) per status in order, card lines, None (AC 14)', () => {
  const { lanes, model } = grouped();
  const [a, b, c] = lanes[0].items;
  const d = lanes[2].items[0];
  const meta = (name) => `${TASK.label}, ${PRIORITIES[1]}, ${name}`;
  const laneBlock = (label, count, byStatus) => [
    '',
    `${label} (${count})`,
    ...S.flatMap((s) => {
      const cards = byStatus[s] || [];
      return [`${s} (${cards.length})`, ...(cards.length ? cards : ['None'])];
    }),
  ];
  const expected = [
    'Board: EFS Automation (EFS), Sprint 4, Mon Nov 23 2026',
    'Grouped by Assignee',
    ...laneBlock('Bo Baker', '3 work items', {
      [S[1]]: [`- ${a.key} ${a.title} (${meta('Bo Baker')})`, `- ${c.key} ${c.title} (${meta('Bo Baker')})`],
      [S[N - 1]]: [`- ${b.key} ${b.title} (${meta('Bo Baker')})`],
    }),
    ...laneBlock('Ann Able', '0 work items', {}),
    ...laneBlock('Unassigned', '1 work item', { [S[0]]: [`- ${d.key} ${d.title} (${meta('Unassigned')})`] }),
  ];
  assert.deepEqual(C.toPlainText(model).split('\n'), expected);
  // Not grouped: no lane line, the status lines follow the heading.
  const { model: m2 } = ungrouped();
  const lines = C.toPlainText(m2).split('\n');
  assert.equal(lines[1], '');
  assert.equal(lines[2], `${S[0]} (2)`);
  assert.equal(lines.filter((l) => / \(\d+\)$/.test(l)).length, N);
});

test('filters that match nothing: heading, header row with 0 counts and the sentence (AC 15)', () => {
  for (const [groupByLabel, lanes] of [['Priority', []], [null, [{ label: null, items: [] }]]]) {
    const model = C.buildModel(input({ groupByLabel, lanes, shown: 0, total: 11, filtersActive: true }));
    const html = C.toHtml(model);
    const all = rows(html);
    assert.equal(all.length, 1, 'header row only');
    assert.equal((all[0].match(/\(0\)<\/span>/g) || []).length, N);
    assert.match(html, /<\/table>\n<p style="[^"]+">No work items match the current filters\.<\/p>/);
    assert.match(html, /Filtered: showing 0 of 11 work items/);
    const text = C.toPlainText(model).split('\n');
    assert.deepEqual(text.slice(-2), ['', 'No work items match the current filters.']);
    assert.ok(text.includes('Filtered: showing 0 of 11 work items'));
  }
  // An empty sprint without filters is not "no matches": the empty row is drawn.
  const html = C.toHtml(C.buildModel(input({ lanes: [{ label: null, items: [] }] })));
  assert.doesNotMatch(html, /No work items match/);
  assert.equal(rows(html).length, 2);
});

test('boardCopy is pure: no DOM, storage or network, and names no status, type or priority (AC 18)', () => {
  const src = read('public/js/boardCopy.js');
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|localStorage|fetch\(|\bapi\.|navigator/);
  const names = new Set([...STATUSES, ...TYPES.flatMap((t) => [t.name, t.label]), ...PRIORITIES]);
  for (const name of names) assert.ok(!new RegExp(`['"\`]${name}['"\`]`).test(src), name);
  assert.match(src, /module\.exports = boardCopy/);
});

// ---------- the Board page wiring ----------

test('the Copy board button sits after Group by and before Create, with its status line (AC 1, 3, 19)', () => {
  const html = read('public/board.html');
  const wrap = '<div class="copy-board" id="copy-board-wrap">';
  assert.ok(html.indexOf('id="group-by"') < html.indexOf(wrap));
  assert.ok(html.indexOf(wrap) < html.indexOf('id="create-item"'));
  assert.match(html, /<button type="button" id="copy-board" class="navy">Copy board<\/button>/);
  assert.match(html, /<p id="copy-board-status" class="copy-status" role="status"><\/p>/);
  assert.doesNotMatch(html.slice(html.indexOf(wrap), html.indexOf('id="create-item"')), /disabled|hidden/, 'not disabled or hidden by default');
  assert.match(html, /js\/reportMath\.js[\s\S]*js\/boardCopy\.js[\s\S]*js\/board\.js/);
  const css = read('public/css/app.css');
  assert.match(css, /\.copy-board \{ display:inline-flex;/);
  assert.match(css, /\.copy-board \.copy-status \{ flex-basis:auto; min-height:0; \}/);
  assert.match(css, /\.copy-board button\.navy:hover \{ background:var\(--teal\); border-color:var\(--teal\); \}/);
});

test('board.js copies the drawn lanes, on the Board only, without writing anything (AC 1, 2, 9, 10, 16, 17)', () => {
  const js = read('public/js/board.js');
  const start = js.indexOf('// ---------- copy board ----------');
  assert.ok(start !== -1, 'board.js has a copy board section');
  const section = js.slice(start, js.indexOf('// ----------', start + 10));
  assert.match(section, /computeLanes\(visible\)/);
  assert.match(section, /const visible = visibleItems\(\);/);
  assert.match(section, /now: new Date\(\),/, 'the heading date is the local today');
  assert.doesNotMatch(section, /state\.collapsed/, 'collapsed lanes are copied expanded');
  assert.doesNotMatch(section, /api\.|fetch\(|storageSet|state\.(filters|groupBy)\s*=|\.disabled\s*=/, 'no write, no view change, never disabled');
  assert.doesNotMatch(section, /readOnly\(\)|session\.can\(/, 'shown to Viewers and on archived projects');
  assert.match(section, /navigator\.clipboard\.write\(/);
  assert.match(section, /new ClipboardItem\(/);
  assert.match(section, /flavor\('html'\)/);
  assert.match(section, /flavor\('plain'\)/);
  assert.match(section, /document\.execCommand\('copy'\)/);
  assert.match(section, /'aria-hidden': 'true', style: 'position:absolute;left:-9999px;top:0'/);
  assert.match(section, /holder\.remove\(\)/);
  assert.match(section, /'✓ Copied\. Paste into your email\.'/);
  assert.match(section, /'Could not copy\. Select the board and copy it by hand\.'/);
  assert.match(section, /els\.copyBoard\.focus\(\)/);
  assert.match(section, /if \(onBoard\) els\.copyBoard\.addEventListener\('click', copyBoard\)/);
  // Hidden with Group by in render(), which returns early off the Board.
  const render = js.slice(js.indexOf('function render()'), js.indexOf('function renderNoSprint()'));
  assert.match(render, /els\.groupBy\.closest\('label'\)\.hidden = !active;\s*syncCopyBoard\(active\);/);
  assert.ok(render.indexOf('if (!onBoard)') < render.indexOf('syncCopyBoard('));
  assert.match(section, /els\.copyBoardWrap\.hidden = !active;/);
});
