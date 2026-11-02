// Scope-change extensibility (docs/specs/sprint-scope-change.md AC 5, 30).
// Each node:test file runs in its own process, so adding an entry to the
// list here, before the app is created, is equivalent to editing
// server/scopeEvents.js and restarting the server with no other change.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SCOPE_EVENT_KINDS } = require('../server/scopeEvents');

SCOPE_EVENT_KINDS.push({ key: 'split', label: 'Split', effect: 'delta', membership: false });

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

test('an added kind appears in GET /api/scope-event-kinds, last, with its label (AC 30)', async () => {
  const res = await app.get('/api/scope-event-kinds');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body[res.body.length - 1], { key: 'split', label: 'Split', effect: 'delta' });
  assert.equal(res.body.length, SCOPE_EVENT_KINDS.length);
});

test('a stored event of the added kind is listed and summed by its effect (AC 30)', async () => {
  const p = await createProject(app);
  const s = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'S' })).body;
  const item = await createItem(app, p.id, { sprint_id: s.id, estimate_hours: 2 });
  await app.post(`/api/sprints/${s.id}/start`);
  // Stored after the grace period, as the code for the new kind would.
  const late = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
  app.db
    .prepare(
      `INSERT INTO sprint_scope_events (project_id, sprint_id, issue_id, issue_key, issue_title, kind, actor_id, actor_name, created_at, estimate_minutes, old_estimate_minutes)
       VALUES (?, ?, ?, ?, ?, 'split', NULL, 'Someone', ?, 60, 120)`
    )
    .run(p.id, s.id, item.id, item.key, item.title, late);
  const sum = (await app.get(`/api/sprints/${s.id}/scope`)).body;
  assert.deepEqual(sum.events.map((e) => [e.kind, e.in_grace]), [['split', false]]);
  assert.equal(sum.net_change_hours, -1);
  assert.equal(sum.current_total_hours, 1);
});
