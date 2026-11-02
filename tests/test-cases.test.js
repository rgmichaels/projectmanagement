const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const { openDb } = require('../server/db');
const { lifecycles, outcomes } = require('../server/testCaseMetadata');
const { GROUPS } = require('../server/groups');
const { PROJECT_STATUSES } = require('../server/projectStatuses');
const data = require('../server/data/testCases');
let app;
before(async () => { app = await startServer(); });
after(async () => { await app.close(); });
const definition = (extra = {}) => ({ title: 'Verify sign in', preconditions: 'A test account exists', steps: [{ action: 'Enter username', expected_result: 'Account opens' }], ...extra });
const url = (issue, c) => `/api/issues/${issue.id}/test-cases${c ? `/${c.id}` : ''}`;
const active = lifecycles.find((x) => x.initial).name;
const archived = lifecycles.find((x) => x.archived).name;
const outcome = outcomes.find((x) => !x.initial).name;
const actor = () => app.db.prepare('SELECT id, name FROM users ORDER BY id LIMIT 1').get();
async function fixture() {
  const p = await createProject(app);
  const issue = await createItem(app, p.id);
  const created = await app.post(`/api/projects/${p.id}/test-cases`, definition());
  assert.equal(created.status, 201);
  return { p, issue, c: created.body };
}
async function link(issue, c, client = app) { return client.post(url(issue), { test_case_ids: [c.id] }); }
async function run(issue, c, value = outcome, extra = {}) { return app.post(`${url(issue, c)}/executions`, { outcome: value, notes: 'Verified manually', case_revision: c.revision, ...extra }); }
const count = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

test('library definitions have stable keys, ordered steps, creator metadata, and survive restart', async () => {
  const { p, c } = await fixture();
  assert.equal(c.key, `${p.key}-TC-1`);
  assert.equal(c.lifecycle, active);
  assert.equal(c.revision, 1);
  assert.deepEqual(c.steps, definition().steps);
  assert.match(c.created_at, /Z$/);
  const extra = await app.post(`/api/projects/${p.id}/test-cases`, definition({ title: 'Second' }));
  assert.equal(extra.body.key, `${p.key}-TC-2`);
  const again = openDb(app.dbPath);
  assert.deepEqual(data.getCase(again, c.id).steps, c.steps);
  assert.equal(data.getCase(again, c.id).revision, 1);
  again.close();
});

test('definition validation rejects bad fields and preserves atomic state; boundaries and HTML are supported', async () => {
  const { p, c } = await fixture();
  const beforeCount = count('test_cases');
  const invalid = [definition({ title: ' ' }), definition({ title: 'x'.repeat(201) }), definition({ steps: [] }), definition({ steps: Array(101).fill(definition().steps[0]) }), definition({ preconditions: null }), definition({ actor_id: 99 }), definition({ steps: [{ action: 'x', expected_result: ' ' }] }), definition({ steps: [{ action: 'x', expected_result: 'y', extra: true }] })];
  for (const body of invalid) assert.equal((await app.post(`/api/projects/${p.id}/test-cases`, body)).status, 400);
  assert.equal(count('test_cases'), beforeCount);
  const text = '<script>alert(1)</script>';
  const valid = await app.post(`/api/projects/${p.id}/test-cases`, definition({ title: ` ${'x'.repeat(200)} `, preconditions: text, steps: [{ action: 'a'.repeat(4000), expected_result: 'e'.repeat(4000) }] }));
  assert.equal(valid.status, 201);
  assert.equal(valid.body.preconditions, text);
  assert.equal(valid.body.title.length, 200);
  const badEdit = await app.patch(`/api/test-cases/${c.id}`, { ...definition({ steps: [] }), revision: 1 });
  assert.equal(badEdit.status, 400);
  assert.equal((await app.get(`/api/test-cases/${c.id}`)).body.revision, 1);
});

test('no-op saves preserve timestamps; concurrent edits use revisions and reject stale writes', async () => {
  const { c } = await fixture();
  const same = await app.patch(`/api/test-cases/${c.id}`, { ...definition(), revision: 1 });
  assert.equal(same.status, 200);
  assert.equal(same.body.updated_at, c.updated_at);
  assert.equal(same.body.revision, 1);
  const edits = await Promise.all(['First edit', 'Second edit'].map((title) => app.patch(`/api/test-cases/${c.id}`, { ...definition({ title }), revision: 1 })));
  assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await app.get(`/api/test-cases/${c.id}`)).body.revision, 2);
});

test('search covers steps literally, lifecycle filters precede cursor pagination, project scope is enforced', async () => {
  const { p, c } = await fixture();
  await app.patch(`/api/test-cases/${c.id}`, { lifecycle: archived, revision: 1 });
  for (let i = 0; i < 4; i += 1) await app.post(`/api/projects/${p.id}/test-cases`, definition({ title: `Case ${i}`, steps: [{ action: `Find special_% ${i}`, expected_result: 'Found' }] }));
  let cursor = null;
  const ids = [];
  do {
    const res = await app.get(`/api/projects/${p.id}/test-cases?search=special_%25&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 4);
    ids.push(...res.body.items.map((x) => x.id)); cursor = res.body.next_cursor;
  } while (cursor);
  assert.equal(ids.length, 4); assert.equal(new Set(ids).size, 4);
  const all = await app.get(`/api/projects/${p.id}/test-cases?lifecycle=all`);
  assert.equal(all.body.total, 5);
  for (const q of ['limit=0', 'limit=201', 'cursor=abc', 'lifecycle=unknown']) assert.equal((await app.get(`/api/projects/${p.id}/test-cases?${q}`)).status, 400);
});

test('case linking is reusable, same-project, duplicate-safe, batch atomic, with attributed ticket history', async () => {
  const { p, issue, c } = await fixture();
  const other = await createItem(app, p.id);
  assert.equal((await link(issue, c)).status, 201);
  assert.equal((await link(other, c)).status, 201);
  assert.equal((await link(issue, c)).status, 409);
  const foreign = await fixture();
  assert.equal((await link(issue, foreign.c)).status, 400);
  const fresh = (await app.post(`/api/projects/${p.id}/test-cases`, definition())).body;
  const n = count('issue_test_cases');
  const h = count('issue_history_events');
  assert.equal((await app.post(url(issue), { test_case_ids: [fresh.id, c.id] })).status, 409);
  assert.equal(count('issue_test_cases'), n);
  assert.equal(count('issue_history_events'), h);
  assert.equal((await app.post(url(issue), { test_case_ids: [fresh.id, fresh.id] })).status, 409);
  const history = await app.get(`/api/issues/${issue.id}/history?field=test_case`);
  assert.equal(history.body.events.length, 1);
  assert.equal(history.body.events[0].actor_id, actor().id);
  assert.equal(history.body.events[0].changes[0].new, `${c.key} ${c.title}`);
  assert.equal((await app.get(`/api/test-cases/${c.id}`)).body.linked_tickets.length, 2);
});

test('create-from-ticket is atomic, concurrent duplicate adds produce only one link and event', async () => {
  const { issue, p, c } = await fixture();
  let n = count('test_cases');
  assert.equal((await app.post(url(issue), { new_case: definition({ steps: [] }) })).status, 400);
  assert.equal(count('test_cases'), n);
  const created = await app.post(url(issue), { new_case: definition() });
  assert.equal(created.status, 201);
  assert.equal(count('test_cases'), n + 1);
  assert.equal((await app.get(`/api/test-cases/${created.body[0].test_case_id}`)).body.project_id, p.id);
  const pair = await Promise.all([link(issue, c), link(issue, c)]);
  assert.deepEqual(pair.map((x) => x.status).sort(), [201, 409]);
  // Simulate a failure while the link history is being written.
  app.db.exec(`CREATE TRIGGER fail_test_link BEFORE INSERT ON issue_history_changes WHEN NEW.field = 'test_case' BEGIN SELECT RAISE(ABORT, 'test rollback'); END`);
  n = count('test_cases');
  try {
    assert.throws(() => data.addCases(app.db, issue.id, { new_case: definition() }, actor()), /test rollback/);
    assert.equal(count('test_cases'), n);
  } finally { app.db.exec('DROP TRIGGER fail_test_link'); }
});

test('executions are independent per ticket, immutable snapshots, revision-aware, and page without repeats', async () => {
  const { p, issue, c } = await fixture();
  const other = await createItem(app, p.id);
  await link(issue, c); await link(other, c);
  let summary = (await app.get(url(issue))).body.summary;
  assert.equal(summary.by_outcome[outcomes.find((x) => x.initial).name], 1);
  const executionIds = [];
  for (const value of outcomes) {
    const result = await run(issue, c, value.name);
    assert.equal(result.status, 201);
    assert.equal(result.body.tester_name, actor().name);
    assert.deepEqual(result.body.definition_snapshot.steps, c.steps);
    executionIds.push(result.body.id);
  }
  assert.equal((await app.get(url(other))).body.items[0].latest_execution, null);
  const edit = await app.patch(`/api/test-cases/${c.id}`, { ...definition({ steps: [{ action: 'New action', expected_result: 'New result' }] }), revision: 1 });
  assert.equal(edit.status, 200);
  const stale = await run(issue, c);
  assert.equal(stale.status, 409);
  const state = (await app.get(url(issue))).body;
  assert.equal(state.summary.needs_retest, 1);
  assert.equal(state.items[0].needs_retest, true);
  assert.deepEqual(state.items[0].latest_execution.definition_snapshot.steps, c.steps);
  let cursor = null;
  const visited = [];
  do {
    const page = await app.get(`${url(issue, c)}/executions?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    visited.push(...page.body.items.map((r) => r.id)); cursor = page.body.next_cursor;
  } while (cursor);
  assert.deepEqual(visited, executionIds.reverse());
  assert.equal((await app.patch(`${url(issue, c)}/executions`, { notes: 'overwrite' })).status, 404);
  assert.equal((await app.del(`${url(issue, c)}/executions`)).status, 404);
  await run(issue, edit.body);
  summary = (await app.get(url(issue))).body.summary;
  assert.equal(summary.needs_retest, 0);
});

test('unlink retains execution evidence; reactivation restores it without changing other tickets', async () => {
  const { p, issue, c } = await fixture();
  const other = await createItem(app, p.id);
  await link(issue, c); await link(other, c); await run(issue, c);
  assert.equal((await app.del(url(issue, c))).status, 204);
  assert.equal((await app.get(url(issue))).body.items.length, 0);
  assert.equal((await app.get(`${url(issue, c)}/executions`)).body.items.length, 1);
  assert.equal((await app.get(`/api/test-cases/${c.id}`)).body.linked_tickets.find((t) => t.id === issue.id).active, 0);
  assert.equal((await run(issue, c)).status, 404);
  const relink = await link(issue, c);
  assert.equal(relink.body[0].reactivated, true);
  assert.ok((await app.get(url(issue))).body.items[0].latest_execution);
  assert.equal((await app.get(url(other))).body.items.length, 1);
});

test('case archive preserves reads, blocks edits/linking/execution, allows unlink, and restore is revision checked', async () => {
  const { p, issue, c } = await fixture();
  await link(issue, c); await run(issue, c);
  const saved = await app.patch(`/api/test-cases/${c.id}`, { lifecycle: archived, revision: c.revision });
  assert.equal(saved.status, 200);
  assert.equal((await app.patch(`/api/test-cases/${c.id}`, { ...definition(), revision: saved.body.revision })).status, 409);
  assert.equal((await run(issue, saved.body)).status, 409);
  const other = await createItem(app, p.id);
  assert.equal((await link(other, c)).status, 409);
  assert.equal((await app.get(`${url(issue, c)}/executions`)).status, 200);
  assert.equal((await app.del(url(issue, c))).status, 204);
  assert.equal((await app.patch(`/api/test-cases/${c.id}`, { lifecycle: active, revision: 1 })).status, 409);
  const restored = await app.patch(`/api/test-cases/${c.id}`, { lifecycle: active, revision: saved.body.revision });
  assert.equal(restored.status, 200);
  assert.equal((await link(other, c)).status, 201);
});

test('every mutation enforces authentication, current permissions and project archive; reads remain available', async () => {
  const { p, issue, c } = await fixture();
  await link(issue, c);
  const operations = [
    ['POST', `/api/projects/${p.id}/test-cases`, definition()],
    ['PATCH', `/api/test-cases/${c.id}`, { ...definition(), revision: 1 }],
    ['PATCH', `/api/test-cases/${c.id}`, { lifecycle: archived, revision: 1 }],
    ['POST', url(issue), { new_case: definition() }],
    ['POST', url(issue), { test_case_ids: [c.id] }],
    ['DELETE', url(issue, c)],
    ['POST', `${url(issue, c)}/executions`, { outcome, case_revision: 1 }],
  ];
  const viewerGroup = GROUPS.find((g) => !g.permissions.length).name;
  const memberGroup = GROUPS.find((g) => g.permissions.includes('write') && !g.permissions.includes('manage-users')).name;
  const user = app.db.prepare("SELECT id FROM users WHERE username = 'blake'").get();
  const client = await app.client('blake');
  app.db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(viewerGroup, user.id);
  const n = count('test_cases');
  try {
    for (const [method, path, body] of operations) {
      assert.equal((await app.raw(method, path, body)).status, 401);
      assert.equal((await client.request(method, path, body)).status, 403);
    }
    assert.equal((await client.get(url(issue))).status, 200);
    app.db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(memberGroup, user.id);
    assert.equal((await client.post(`/api/projects/${p.id}/test-cases`, definition())).status, 201);
    const archivedProject = await app.patch(`/api/projects/${p.id}`, { status: PROJECT_STATUSES.find((x) => x.archivable).name, archived: true });
    assert.equal(archivedProject.status, 200);
    for (const [method, path, body] of operations) assert.equal((await app.request(method, path, body)).status, 409);
    for (const path of [`/api/projects/${p.id}/test-cases`, `/api/test-cases/${c.id}`, url(issue), `${url(issue, c)}/executions`]) assert.equal((await client.get(path)).status, 200);
    assert.equal(count('test_cases'), n + 1);
  } finally { app.db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(memberGroup, user.id); }
});

test('deletion explicitly cleans links and results even without FK cascade, preserving shared cases and other evidence', async () => {
  const { p, issue, c } = await fixture();
  const other = await createItem(app, p.id);
  await link(issue, c); await link(other, c); await run(issue, c); await run(other, c);
  app.db.pragma('foreign_keys = OFF');
  try {
    assert.equal((await app.del(`/api/issues/${issue.id}`)).status, 204);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM issue_test_cases WHERE issue_id = ?').get(issue.id).n, 0);
    const orphan = app.db.prepare('SELECT COUNT(*) AS n FROM test_case_executions e LEFT JOIN issue_test_cases l ON l.id = e.issue_test_case_id WHERE l.id IS NULL').get().n;
    assert.equal(orphan, 0);
    assert.equal((await app.get(`/api/test-cases/${c.id}`)).status, 200);
    assert.equal((await app.get(`${url(other, c)}/executions`)).body.items.length, 1);
  } finally { app.db.pragma('foreign_keys = ON'); }
});

test('strict IDs, request shapes, and execution validation return 4xx with no writes', async () => {
  const { issue, c } = await fixture();
  await link(issue, c);
  for (const id of ['abc', '-1', '0', '1.5', '999999999999999999999']) assert.equal((await app.get(`/api/test-cases/${id}`)).status, 400);
  assert.equal((await app.get('/api/test-cases/999999')).status, 404);
  for (const body of [null, {}, { test_case_ids: [] }, { test_case_ids: [c.id], new_case: definition() }, { test_case_ids: [c.id], actor_id: 2 }]) assert.equal((await app.post(url(issue), body)).status, 400);
  const n = count('test_case_executions');
  for (const extra of [{ outcome: 'unknown' }, { case_revision: 0 }, { notes: 'x'.repeat(10001) }, { tested_by_id: 2 }]) assert.equal((await run(issue, c, outcome, extra)).status, 400);
  assert.equal(count('test_case_executions'), n);
});

test('a failed ticket deletion rolls back test evidence and relationships together', async () => {
  const { issue, c } = await fixture();
  await link(issue, c); await run(issue, c);
  app.db.exec(`CREATE TRIGGER fail_test_ticket_delete BEFORE DELETE ON issues BEGIN SELECT RAISE(ABORT, 'delete rollback'); END`);
  try {
    assert.throws(() => require('../server/data/issues').deleteIssue(app.db, issue.id, actor()), /delete rollback/);
    assert.equal((await app.get(url(issue))).body.items.length, 1);
    assert.equal((await app.get(`${url(issue, c)}/executions`)).body.items.length, 1);
    assert.equal((await app.get(`/api/issues/${issue.id}`)).status, 200);
  } finally { app.db.exec('DROP TRIGGER fail_test_ticket_delete'); }
});

test('additional metadata outcomes work without schema, summary or route changes', async () => {
  const extra = { name: 'review-needed', label: 'Review needed' };
  outcomes.push(extra);
  try {
    const { issue, c } = await fixture();
    await link(issue, c);
    assert.equal((await run(issue, c, extra.name)).status, 201);
    assert.equal((await app.get(url(issue))).body.summary.by_outcome[extra.name], 1);
    assert.ok((await app.get('/api/test-case-metadata')).body.outcomes.some((o) => o.name === extra.name));
  } finally { outcomes.pop(); }
});
