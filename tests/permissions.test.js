// Permission groups (docs/specs/permission-groups.md AC 1-21).
// alex is the seeded Admin, blake a Member; casey is made a Viewer per test.
// Groups are changed through the data layer or PATCH /api/users/:id.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startServer, tempDbPath, createProject, createItem, uniqueKey } = require('./helpers');
const { openDb } = require('../server/db');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const { assertCan } = require('../server/routes/guards');
const { TYPES } = require('../server/types');
const { LINK_TYPES } = require('../server/linkTypes');
const { PROJECT_STATUSES } = require('../server/projectStatuses');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const USERNAME = { [ADMIN]: 'alex', [MEMBER]: 'blake', [VIEWER]: 'casey' };
const EPIC_TYPE = TYPES.find((t) => t.isEpic).name;
const DIRECTED = LINK_TYPES.find((t) => !t.symmetric);
const ARCHIVABLE = PROJECT_STATUSES.find((s) => s.archivable).name;
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('rest of a png')]);
const TEXT = Buffer.from('hello, world\n');

const denied = (group, permission) => `Your group (${group}) is not allowed to ${groups.actionOf(permission)}.`;

let app;
let ids; // user ids by username
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
});
test.after(async () => { await app.close(); });

const setGroup = (username, group) => usersData.setUserGroup(app.db, ids[username], group);

// Restores the seeded groups so each test starts from them.
function resetGroups() {
  for (const [username, id] of Object.entries(ids)) {
    usersData.setUserGroup(app.db, id, username === 'alex' ? ADMIN : MEMBER);
  }
}
test.beforeEach(resetGroups);

// Everything a write could change, to show a denied request changed nothing.
const TABLES = ['projects', 'issues', 'comments', 'issue_links', 'attachments', 'issue_history_events', 'issue_history_changes', 'users', 'sprints', 'sprint_events', 'sprint_event_changes'];
const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, app.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));

// ---------- groups.js (AC 1, 3) ----------

test('groups.js defines the groups, their permissions and the default (AC 1)', () => {
  assert.deepEqual(groups.groupNames(), ['Admin', 'Member', 'Viewer']);
  assert.deepEqual(groups.PERMISSIONS.map((p) => p.name), ['write', 'delete-item', 'manage-projects', 'manage-users']);
  assert.equal(groups.defaultGroup(), 'Member');
  assert.ok(groups.isValidGroup('Viewer'));
  for (const bad of ['viewer', '', 'Owner', null, undefined, 3]) assert.equal(groups.isValidGroup(bad), false, String(bad));
  assert.deepEqual(groups.permissionsOf('Admin'), ['write', 'delete-item', 'manage-projects', 'manage-users']);
  assert.deepEqual(groups.permissionsOf('Member'), ['write']);
  assert.deepEqual(groups.permissionsOf('Viewer'), []);
  assert.equal(groups.can('Member', 'delete-item'), false);
  assert.equal(groups.can('Unknown', 'write'), false, 'an unknown group may do nothing');
});

test('GET /api/groups lists the group names in order (AC 3)', async () => {
  const res = await app.get('/api/groups');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, groups.groupNames());
  assert.equal((await app.raw('GET', '/api/groups')).status, 401);
});

test('assertCan: 403 with the group in the message; the project argument is ignored (AC 4, 20)', () => {
  const viewer = { id: 1, group: VIEWER };
  assert.throws(() => assertCan(viewer, 'write'), (err) => err.status === 403 && err.message === 'Your group (Viewer) is not allowed to edit work items.');
  assert.throws(() => assertCan(viewer, 'write', { id: 1 }), (err) => err.status === 403);
  assert.doesNotThrow(() => assertCan({ id: 1, group: MEMBER }, 'write', { id: 1 }));
  assert.throws(() => assertCan({ id: 1, group: MEMBER }, 'delete-item'), /not allowed to delete work items/);
});

// ---------- route matrix (AC 6, 19, 21) ----------

// A fresh set of records for one case. Records the acting user must own (a
// comment and an attachment) are made by that user while in a writing group;
// the target group is set afterwards.
async function fixture(username, group) {
  const p = await createProject(app);
  const a = await createItem(app, p.id, { title: 'A' });
  const b = await createItem(app, p.id, { title: 'B' });
  const c = await createItem(app, p.id, { title: 'C' });
  const link = (await app.post(`/api/issues/${a.id}/links`, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  if (username !== 'alex') setGroup(username, MEMBER);
  const actor = await app.client(username);
  const comment = (await actor.post(`/api/issues/${a.id}/comments`, { body: 'mine' })).body;
  const attachment = (await actor.upload(a.id, 'notes.txt', TEXT, 'text/plain')).body;
  assert.ok(comment.id && attachment.id && link.id);
  // Sprints (docs/specs/sprints-and-backlog.md AC 47): an active and a
  // planned sprint in p, and a project with only a planned sprint to start.
  const active = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'Active one' })).body;
  await app.post(`/api/sprints/${active.id}/start`);
  const planned = (await app.post(`/api/projects/${p.id}/sprints`, { name: 'Planned one' })).body;
  const p2 = await createProject(app);
  const startable = (await app.post(`/api/projects/${p2.id}/sprints`, { name: 'Startable' })).body;
  setGroup(username, group);
  return { actor, p, a, b, c, link, comment, attachment, active, planned, startable };
}

// Every write route of AC 6: [method, route path as mounted, permission,
// expected success status, request(fixture)].
const MATRIX = [
  ['POST', '/api/projects', 'manage-projects', 201, (f) => f.actor.post('/api/projects', { name: 'New', key: uniqueKey() })],
  ['PATCH', '/api/projects/:id', 'manage-projects', 200, (f) => f.actor.patch(`/api/projects/${f.p.id}`, { name: 'Renamed' })],
  ['POST', '/api/projects/:id/issues', 'write', 201, (f) => f.actor.post(`/api/projects/${f.p.id}/issues`, { title: 'New item' })],
  ['PATCH', '/api/issues/:id', 'write', 200, (f) => f.actor.patch(`/api/issues/${f.a.id}`, { title: 'Changed' })],
  ['DELETE', '/api/issues/:id', 'delete-item', 204, (f) => f.actor.del(`/api/issues/${f.b.id}`)],
  ['POST', '/api/issues/:id/comments', 'write', 201, (f) => f.actor.post(`/api/issues/${f.a.id}/comments`, { body: 'hello' })],
  ['PATCH', '/api/comments/:id', 'write', 200, (f) => f.actor.patch(`/api/comments/${f.comment.id}`, { body: 'edited' })],
  ['DELETE', '/api/comments/:id', 'write', 204, (f) => f.actor.del(`/api/comments/${f.comment.id}`)],
  ['POST', '/api/issues/:id/links', 'write', 201, (f) => f.actor.post(`/api/issues/${f.a.id}/links`, { link_type: DIRECTED.name, direction: 'outward', target_id: f.c.id })],
  ['DELETE', '/api/issues/:id/links/:linkId', 'write', 204, (f) => f.actor.del(`/api/issues/${f.a.id}/links/${f.link.id}`)],
  ['POST', '/api/issues/:id/attachments', 'write', 201, (f) => f.actor.upload(f.a.id, 'more.txt', TEXT, 'text/plain')],
  ['DELETE', '/api/attachments/:id', 'write', 204, (f) => f.actor.del(`/api/attachments/${f.attachment.id}`)],
  ['PATCH', '/api/users/:id', 'manage-users', 200, (f) => f.actor.patch(`/api/users/${ids.dana}`, { group: VIEWER })],
  ['POST', '/api/projects/:id/sprints', 'write', 201, (f) => f.actor.post(`/api/projects/${f.p.id}/sprints`, { name: 'New sprint' })],
  ['PATCH', '/api/sprints/:id', 'write', 200, (f) => f.actor.patch(`/api/sprints/${f.planned.id}`, { goal: 'A goal' })],
  ['DELETE', '/api/sprints/:id', 'write', 204, (f) => f.actor.del(`/api/sprints/${f.planned.id}`)],
  ['POST', '/api/sprints/:id/start', 'write', 200, (f) => f.actor.post(`/api/sprints/${f.startable.id}/start`)],
  ['POST', '/api/sprints/:id/complete', 'write', 200, (f) => f.actor.post(`/api/sprints/${f.active.id}/complete`, { disposition: 'backlog' })],
];

for (const [method, route, permission, okStatus, send] of MATRIX) {
  test(`${method} ${route} needs ${permission}, per group (AC 6, 19)`, async () => {
    for (const group of groups.groupNames()) {
      resetGroups();
      const f = await fixture(USERNAME[group], group);
      const before = snapshot();
      const res = await send(f);
      if (groups.can(group, permission)) {
        assert.equal(res.status, okStatus, `${group}: ${JSON.stringify(res.body)}`);
      } else {
        assert.equal(res.status, 403, group);
        assert.deepEqual(res.body, { error: denied(group, permission) }, group);
        assert.deepEqual(snapshot(), before, `${group}: nothing changed`);
      }
    }
  });
}

// The public auth routes: no group needed (sign-in itself).
const PUBLIC_WRITES = ['POST /api/auth/login', 'POST /api/auth/logout'];

// All routes of the app as "METHOD /path". Every router is mounted at /api.
function appRoutes() {
  const out = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const m of Object.keys(layer.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      } else if (layer.handle && Array.isArray(layer.handle.stack)) {
        walk(layer.handle.stack, '/api');
      }
    }
  };
  const { createApp } = require('../server/app');
  walk(createApp(app.db).router.stack, '');
  assert.ok(out.length > 20, 'found the routes');
  return out;
}

test('coverage guard: every non-GET route is in the matrix or the public auth list (AC 21)', () => {
  const writes = appRoutes().filter((r) => r.method !== 'GET').map((r) => `${r.method} ${r.path}`).sort();
  const known = [...MATRIX.map(([m, p]) => `${m} ${p}`), ...PUBLIC_WRITES].sort();
  assert.deepEqual(writes, known, 'a write route was added without a permission check in the matrix (or a matrix entry is stale)');
});

// ---------- order of checks (AC 5, 8) ----------

test('a Viewer gets 403, not 404 or 409, for unknown ids and archived projects (AC 5)', async () => {
  setGroup('casey', VIEWER);
  const viewer = await app.client('casey');
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  const before = snapshot();
  const cases = [
    [viewer.patch('/api/issues/999999', { title: 'x' }), 'write'],
    [viewer.del('/api/comments/999999'), 'write'],
    [viewer.post('/api/issues/999999/links', {}), 'write'],
    [viewer.del('/api/attachments/999999'), 'write'],
    [viewer.upload(999999, 'a.txt', TEXT, 'text/plain'), 'write'],
    [viewer.patch(`/api/issues/${item.id}`, { title: 'x' }), 'write'], // archived
    [viewer.post(`/api/projects/${p.id}/issues`, { title: '' }), 'write'], // archived and invalid
    [viewer.patch('/api/projects/999999', { name: 'x' }), 'manage-projects'],
    [viewer.patch('/api/users/999999', { group: 'nope' }), 'manage-users'],
  ];
  for (const [promise, permission] of cases) {
    const res = await promise;
    assert.equal(res.status, 403);
    assert.equal(res.body.error, denied(VIEWER, permission));
  }
  // A Member is told 403 for delete and project changes even on unknown ids.
  const member = await app.client('blake');
  assert.equal((await member.del('/api/issues/999999')).status, 403);
  assert.equal((await member.post('/api/projects', {})).status, 403);
  assert.deepEqual(snapshot(), before);
});

test('ownership still applies to Members and Admins; archived still gives 409 (AC 8)', async () => {
  const p = await createProject(app);
  const item = await createItem(app, p.id);
  const dana = await app.client('dana');
  const comment = (await dana.post(`/api/issues/${item.id}/comments`, { body: 'dana says' })).body;
  const attachment = (await dana.upload(item.id, 'd.txt', TEXT, 'text/plain')).body;
  const member = await app.client('blake');
  for (const client of [member, app]) {
    const edit = await client.patch(`/api/comments/${comment.id}`, { body: 'hijack' });
    assert.equal(edit.status, 403);
    assert.equal(edit.body.error, 'You can only change your own messages.');
    assert.equal((await client.del(`/api/comments/${comment.id}`)).body.error, 'You can only change your own messages.');
    const del = await client.del(`/api/attachments/${attachment.id}`);
    assert.equal(del.status, 403);
    assert.equal(del.body.error, 'You can only delete your own attachments.');
  }
  // Unknown ids for a writing group are still 404.
  assert.equal((await member.patch('/api/issues/999999', { title: 'x' })).status, 404);
  await app.patch(`/api/projects/${p.id}`, { status: ARCHIVABLE, archived: true });
  assert.equal((await member.patch(`/api/issues/${item.id}`, { title: 'x' })).status, 409);
  assert.equal((await member.post(`/api/issues/${item.id}/comments`, { body: 'x' })).status, 409);
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 409, 'Admin too');
});

// ---------- reads (AC 7) ----------

test('every GET route answers 200 for a Viewer, downloads and history included (AC 7)', async () => {
  const p = await createProject(app);
  const epic = await createItem(app, p.id, { type: EPIC_TYPE, title: 'Epic' });
  const item = await createItem(app, p.id, { epic_id: epic.id });
  await app.post(`/api/issues/${item.id}/comments`, { body: 'hi' });
  const image = (await app.upload(item.id, 'shot.png', PNG, 'image/png')).body;
  setGroup('casey', VIEWER);
  const viewer = await app.client('casey');
  const urls = {
    '/api/auth/users': '/api/auth/users',
    '/api/auth/me': '/api/auth/me',
    '/api/users': '/api/users',
    '/api/groups': '/api/groups',
    '/api/statuses': '/api/statuses',
    '/api/terminal-status': '/api/terminal-status',
    '/api/resolutions': '/api/resolutions',
    '/api/types': '/api/types',
    '/api/priorities': '/api/priorities',
    '/api/project-statuses': '/api/project-statuses',
    '/api/history-fields': '/api/history-fields',
    '/api/link-types': '/api/link-types',
    '/api/attachment-types': '/api/attachment-types',
    '/api/projects': '/api/projects',
    '/api/projects/:id': `/api/projects/${p.id}`,
    '/api/projects/:id/issues': `/api/projects/${p.id}/issues`,
    '/api/issues/:id': `/api/issues/${item.id}`,
    '/api/issues/:id/children': `/api/issues/${epic.id}/children`,
    '/api/issues/:id/comments': `/api/issues/${item.id}/comments`,
    '/api/issues/:id/history': `/api/issues/${item.id}/history`,
    '/api/issues/:id/links': `/api/issues/${item.id}/links`,
    '/api/issues/:id/attachments': `/api/issues/${item.id}/attachments`,
    '/api/attachments/:id': `/api/attachments/${image.id}`,
    '/api/attachments/:id/download': `/api/attachments/${image.id}/download`,
    '/api/attachments/:id/preview': `/api/attachments/${image.id}/preview`,
    '/api/sprint-states': '/api/sprint-states',
    '/api/sprint-event-kinds': '/api/sprint-event-kinds',
    '/api/projects/:id/sprints': `/api/projects/${p.id}/sprints`,
    '/api/projects/:id/sprints/next-name': `/api/projects/${p.id}/sprints/next-name`,
    '/api/projects/:id/sprint-history': `/api/projects/${p.id}/sprint-history`,
  };
  const gets = appRoutes().filter((r) => r.method === 'GET').map((r) => r.path);
  assert.deepEqual(gets.filter((path) => !urls[path]), [], 'every GET route has a URL here');
  for (const path of gets) {
    const res = await viewer.get(urls[path]);
    assert.equal(res.status, 200, path);
  }
  assert.equal((await viewer.get(`/api/issues/${item.id}/history`)).body.events.length > 0, true);
});

// ---------- users and groups (AC 9-11, 14) ----------

test('GET /api/users has group; the public sign-in list does not (AC 10)', async () => {
  setGroup('casey', VIEWER);
  const list = (await (await app.client('casey')).get('/api/users')).body;
  assert.deepEqual(
    Object.fromEntries(list.map((u) => [u.username, u.group])),
    { alex: ADMIN, blake: MEMBER, casey: VIEWER, dana: MEMBER }
  );
  const login = (await app.raw('GET', '/api/auth/users')).body;
  assert.ok(login.length === 4);
  for (const u of login) assert.deepEqual(Object.keys(u).sort(), ['id', 'name', 'username']);
});

test('/api/auth/me returns group and permissions (AC 14)', async () => {
  assert.deepEqual((await app.get('/api/auth/me')).body, {
    id: ids.alex, name: 'Alex Morgan', username: 'alex', group: ADMIN,
    permissions: ['write', 'delete-item', 'manage-projects', 'manage-users'],
  });
  const blake = await app.client('blake');
  assert.deepEqual((await blake.get('/api/auth/me')).body.permissions, ['write']);
  setGroup('casey', VIEWER);
  const casey = (await (await app.client('casey')).get('/api/auth/me')).body;
  assert.equal(casey.group, VIEWER);
  assert.deepEqual(casey.permissions, []);
});

test('PATCH /api/users/:id by an Admin changes the group; validation (AC 9)', async () => {
  const res = await app.patch(`/api/users/${ids.dana}`, { group: VIEWER, name: 'Renamed', username: 'x', id: 99 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: ids.dana, name: 'Dana Patel', username: 'dana', group: VIEWER });
  assert.equal((await app.get('/api/users')).body.find((u) => u.id === ids.dana).group, VIEWER);
  assert.deepEqual((await app.patch('/api/users/999999', { group: MEMBER })).body, { error: 'User not found.' });
  assert.equal((await app.patch('/api/users/abc', { group: MEMBER })).status, 404);
  for (const body of [{}, { group: 'Owner' }, { group: 'viewer' }, { group: null }, { group: 1 }]) {
    const bad = await app.patch(`/api/users/${ids.dana}`, body);
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.equal(bad.body.error, 'Unknown group.');
  }
});

test('PATCH /api/users/:id by a Member or Viewer is 403 (AC 6, 9)', async () => {
  setGroup('casey', VIEWER);
  for (const username of ['blake', 'casey']) {
    const c = await app.client(username);
    const res = await c.patch(`/api/users/${ids[username]}`, { group: ADMIN });
    assert.equal(res.status, 403);
  }
  assert.equal(usersData.getUser(app.db, ids.blake).group, MEMBER, 'no self-promotion');
});

test('the last Admin cannot be demoted; with a second Admin it works (AC 9)', async () => {
  const res = await app.patch(`/api/users/${ids.alex}`, { group: MEMBER });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'There must be at least one Admin.');
  assert.equal(usersData.getUser(app.db, ids.alex).group, ADMIN);
  // Setting the last Admin to Admin again is fine.
  assert.equal((await app.patch(`/api/users/${ids.alex}`, { group: ADMIN })).status, 200);
  assert.equal((await app.patch(`/api/users/${ids.blake}`, { group: ADMIN })).status, 200);
  const self = await app.patch(`/api/users/${ids.alex}`, { group: VIEWER });
  assert.equal(self.status, 200);
  assert.equal(self.body.group, VIEWER);
  // alex's own open session lost the permission at once.
  assert.equal((await app.patch(`/api/users/${ids.alex}`, { group: ADMIN })).status, 403);
  const blake = await app.client('blake');
  assert.equal((await blake.patch(`/api/users/${ids.blake}`, { group: MEMBER })).status, 409, 'blake is now the last Admin');
});

test('a group change applies to an already-open session and touches no data (AC 11)', async () => {
  const p = await createProject(app);
  const casey = await app.client('casey');
  const item = (await casey.post(`/api/projects/${p.id}/issues`, { title: 'by casey', assignee_id: ids.casey })).body;
  const comment = (await casey.post(`/api/issues/${item.id}/comments`, { body: 'casey note' })).body;
  const historyBefore = (await app.get(`/api/issues/${item.id}/history`)).body;

  assert.equal((await app.patch(`/api/users/${ids.casey}`, { group: VIEWER })).status, 200);
  const denial = await casey.patch(`/api/issues/${item.id}`, { title: 'blocked' });
  assert.equal(denial.status, 403);
  assert.equal(denial.body.error, 'Your group (Viewer) is not allowed to edit work items.');
  assert.equal((await casey.get('/api/auth/me')).body.group, VIEWER, 'same session, no sign-in');
  assert.equal((await casey.patch(`/api/comments/${comment.id}`, { body: 'edit' })).status, 403);
  // Their comment, assignment, reporter and history are unchanged.
  const comments = (await app.get(`/api/issues/${item.id}/comments`)).body;
  assert.deepEqual(comments.map((c) => [c.author_name, c.body]), [['Casey Rivera', 'casey note']]);
  const now = (await app.get(`/api/issues/${item.id}`)).body;
  assert.equal(now.assignee_id, ids.casey);
  assert.equal(now.reporter_name, 'Casey Rivera');
  assert.deepEqual((await app.get(`/api/issues/${item.id}/history`)).body, historyBefore, 'no history for a group change');

  assert.equal((await app.patch(`/api/users/${ids.casey}`, { group: MEMBER })).status, 200);
  assert.equal((await casey.patch(`/api/issues/${item.id}`, { title: 'allowed again' })).status, 200);
});

test('an Admin deleting a work item is the actor on partner events (AC 19)', async () => {
  const p = await createProject(app);
  const a = await createItem(app, p.id);
  const b = await createItem(app, p.id);
  await app.post(`/api/issues/${a.id}/links`, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  setGroup('dana', ADMIN);
  const dana = await app.client('dana');
  assert.equal((await dana.del(`/api/issues/${a.id}`)).status, 204);
  const [latest] = (await app.get(`/api/issues/${b.id}/history`)).body.events;
  assert.equal(latest.actor_name, 'Dana Patel');
  assert.equal(latest.actor_id, ids.dana);
});

// ---------- seed and migration (AC 12, 13) ----------

test('a fresh database seeds alex as Admin and the rest as Member (AC 12)', () => {
  const db = openDb(tempDbPath());
  const rows = db.prepare('SELECT username, group_name FROM users ORDER BY id').all();
  db.close();
  assert.deepEqual(rows, [
    { username: 'alex', group_name: ADMIN },
    { username: 'blake', group_name: MEMBER },
    { username: 'casey', group_name: MEMBER },
    { username: 'dana', group_name: MEMBER },
  ]);
});

test('an old database gains group_name: lowest id Admin, others Member, idempotent, data intact (AC 12, 13)', () => {
  // Build a current database, then drop group_name to get the pre-groups shape.
  const dbPath = tempDbPath();
  const seeded = openDb(dbPath);
  seeded.close();
  const old = new Database(dbPath);
  old.exec('ALTER TABLE users DROP COLUMN group_name');
  old.exec("DELETE FROM users WHERE username = 'alex'"); // the oldest is now blake
  old.prepare("INSERT INTO users (name, username) VALUES ('Erin Old', 'erin')").run();
  const now = '2026-01-01T00:00:00.000Z';
  old.prepare("INSERT INTO projects (name, key, created_at) VALUES ('Old', 'OLD', ?)").run(now);
  old.prepare(
    "INSERT INTO issues (project_id, number, key, type, title, status, priority, rank, created_at, updated_at) VALUES (1, 1, 'OLD-1', 'Task', 'Legacy', 'Planning', 'Medium', 1000, ?, ?)"
  ).run(now, now);
  old.prepare("INSERT INTO comments (issue_id, author_id, body, created_at) VALUES (1, 3, 'old note', ?)").run(now);
  const issuesBefore = old.prepare('SELECT * FROM issues').all();
  const commentsBefore = old.prepare('SELECT * FROM comments').all();
  old.close();

  const db = openDb(dbPath);
  const rows = db.prepare('SELECT id, username, group_name FROM users ORDER BY id').all();
  assert.deepEqual(rows.map((r) => [r.username, r.group_name]), [
    ['blake', ADMIN], ['casey', MEMBER], ['dana', MEMBER], ['erin', MEMBER],
  ]);
  assert.equal(rows.filter((r) => r.group_name === ADMIN).length, 1);
  assert.deepEqual(db.prepare('SELECT * FROM issues').all(), issuesBefore);
  assert.deepEqual(db.prepare('SELECT * FROM comments').all(), commentsBefore);
  // Groups changed after the upgrade survive a restart (the backfill runs once).
  db.prepare("UPDATE users SET group_name = ? WHERE username = 'casey'").run(VIEWER);
  db.close();
  const again = openDb(dbPath);
  assert.deepEqual(
    again.prepare('SELECT username, group_name FROM users ORDER BY id').all().map((r) => r.group_name),
    [ADMIN, VIEWER, MEMBER, MEMBER]
  );
  const { sql } = again.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get();
  again.close();
  assert.match(sql, /group_name TEXT NOT NULL DEFAULT 'Member'/);
  assert.doesNotMatch(sql, /CHECK/i);
});
