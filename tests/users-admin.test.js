// User admin, server side (docs/specs/user-admin.md AC 1-16, 22, 23).
// alex is the seeded Admin, blake, casey and dana Members. Each test that
// changes the seeded users puts them back (resetSeeded); users added by a
// test keep unique names so tests do not depend on each other.
const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { startServer, tempDbPath, createProject, createItem } = require('./helpers');
const { openDb } = require('../server/db');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const { deriveUsername, isValidUsername } = require('../server/usernames');

const [ADMIN, MEMBER, VIEWER] = groups.groupNames();
const USERNAME_RULE = 'Username may only contain letters, digits, ".", "_" and "-" (1 to 30 characters).';

let app;
let ids; // seeded user ids by username
test.before(async () => {
  app = await startServer();
  ids = Object.fromEntries((await app.get('/api/users')).body.map((u) => [u.username, u.id]));
});
test.after(async () => { await app.close(); });

function resetSeeded() {
  for (const [username, id] of Object.entries(ids)) {
    usersData.updateUser(app.db, id, { group: username === 'alex' ? ADMIN : MEMBER, active: true });
  }
}
test.beforeEach(resetSeeded);

const count = (table) => app.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const usersRows = () => app.db.prepare('SELECT * FROM users ORDER BY id').all();
const sessionsOf = (id) => app.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?').get(id).n;
const create = (body, client = app) => client.post('/api/users', body);

// ---------- usernames.js (AC 3, owner decision on open question 3) ----------

test('deriveUsername: first word, lower-cased, sanitized, unique with 2, 3, ... and always valid', () => {
  const taken = new Set(['alex']);
  assert.equal(deriveUsername('Eva Long', taken), 'eva');
  assert.equal(deriveUsername('Eva', taken), 'eva2');
  assert.equal(deriveUsername('EVA Third', taken), 'eva3');
  assert.equal(deriveUsername('Alex Smith', taken), 'alex2');
  assert.equal(deriveUsername('Émile Zola', taken), 'emile');
  assert.equal(deriveUsername("O'Brien", taken), 'obrien');
  assert.equal(deriveUsername('李 Wei', taken), 'user');
  assert.equal(deriveUsername('   ', taken), 'user2');
  assert.equal(deriveUsername('Jean-Luc.P_x!', taken), 'jean-luc.p_x');
  const long = 'a'.repeat(40);
  const first = deriveUsername(long, taken);
  const second = deriveUsername(long, taken);
  assert.equal(first, 'a'.repeat(30));
  assert.equal(second, `${'a'.repeat(29)}2`);
  for (const u of taken) assert.ok(isValidUsername(u), u);
});

// ---------- creating (AC 1-5) ----------

test('create with name only: derived username, default group, active; can sign in (AC 1, 3, 4)', async () => {
  const res = await create({ name: '  Eva Long  ' });
  assert.equal(res.status, 201);
  assert.deepEqual(Object.keys(res.body).sort(), ['active', 'group', 'id', 'name', 'username']);
  assert.deepEqual({ ...res.body, id: undefined }, { id: undefined, name: 'Eva Long', username: 'eva', group: groups.defaultGroup(), active: true });
  assert.equal(groups.defaultGroup(), MEMBER);
  const again = await create({ name: 'Eva', username: '   ' });
  assert.equal(again.status, 201);
  assert.equal(again.body.username, 'eva2', 'a blank username is derived too');

  assert.ok((await app.get('/api/users')).body.some((u) => u.id === res.body.id && u.active === true));
  assert.ok((await app.raw('GET', '/api/auth/users')).body.some((u) => u.id === res.body.id));
  const eva = await app.client();
  assert.equal((await eva.login('eva')).id, res.body.id);
  assert.equal((await eva.get('/api/auth/me')).body.group, MEMBER);
});

test('create with username and group: case kept, trimmed (AC 1, 3, 4)', async () => {
  const res = await create({ name: 'Frank Ocean', username: ' Frank.O_1-x ', group: VIEWER });
  assert.equal(res.status, 201);
  assert.equal(res.body.username, 'Frank.O_1-x');
  assert.equal(res.body.group, VIEWER);
  const frank = await app.client();
  assert.equal((await frank.login('frank.o_1-X')).id, res.body.id, 'sign-in is case-insensitive');
});

test('create validation: 400 messages, 409 taken, nothing created (AC 2-4)', async () => {
  const cases = [
    [{}, 400, 'Name is required.'],
    [{ name: '' }, 400, 'Name is required.'],
    [{ name: '   ' }, 400, 'Name is required.'],
    [{ name: 42 }, 400, 'Name is required.'],
    [{ name: null }, 400, 'Name is required.'],
    [{ name: 'x'.repeat(101) }, 400, 'Name must be 100 characters or fewer.'],
    [{ name: 'Bad Chars', username: 'has space' }, 400, USERNAME_RULE],
    [{ name: 'Bad Chars', username: 'émile' }, 400, USERNAME_RULE],
    [{ name: 'Bad Chars', username: 'a@b' }, 400, USERNAME_RULE],
    [{ name: 'Bad Chars', username: 'x'.repeat(31) }, 400, USERNAME_RULE],
    [{ name: 'Bad Chars', username: 7 }, 400, USERNAME_RULE],
    [{ name: 'Bad Group', group: 'Owner' }, 400, 'Unknown group.'],
    [{ name: 'Bad Group', group: 'admin' }, 400, 'Unknown group.'],
    [{ name: 'Bad Group', group: '' }, 400, 'Unknown group.'],
    [{ name: 'Taken', username: 'ALEX' }, 409, 'That username is already taken.'],
    [{ name: 'Taken', username: ' blake ' }, 409, 'That username is already taken.'],
  ];
  const before = usersRows();
  for (const [body, status, error] of cases) {
    const res = await create(body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.deepEqual(res.body, { error }, JSON.stringify(body));
  }
  assert.deepEqual(usersRows(), before, 'nothing created');
  assert.equal((await create({ name: 'x'.repeat(100), username: 'hundred' })).status, 201, '100 characters is fine');
});

test('a taken username includes deactivated users (AC 3)', async () => {
  const gone = (await create({ name: 'Gone Away', username: 'gone' })).body;
  assert.equal((await app.patch(`/api/users/${gone.id}`, { active: false })).status, 200);
  assert.equal((await create({ name: 'Gone Again', username: 'GONE' })).status, 409);
  assert.equal((await create({ name: 'Gone Again' })).body.username, 'gone2', 'derived names skip it too');
});

test('a Member or Viewer cannot create or patch users: 403 first, nothing changes (AC 5)', async () => {
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  const before = usersRows();
  const sessionsBefore = count('sessions');
  for (const [username, group] of [['blake', MEMBER], ['casey', VIEWER]]) {
    const c = await app.client(username);
    const error = `Your group (${group}) is not allowed to manage users.`;
    for (const res of [
      await create({ name: 'Sneaky' }, c),
      await create({}, c), // invalid too: 403 comes before validation
      await c.patch(`/api/users/${ids.dana}`, { name: 'Renamed' }),
      await c.patch(`/api/users/${ids.dana}`, { active: false }),
      await c.patch(`/api/users/${ids.alex}`, { active: false }),
      await c.patch('/api/users/999999', {}),
    ]) {
      assert.equal(res.status, 403, username);
      assert.deepEqual(res.body, { error });
    }
  }
  assert.deepEqual(usersRows(), before);
  assert.equal(count('sessions'), sessionsBefore + 2, 'only the two sign-ins');
  assert.equal((await app.raw('POST', '/api/users', { name: 'Anon' })).status, 401);
});

// ---------- editing (AC 6-8) ----------

test('edit name and username; only present fields change (AC 6, 7)', async () => {
  const user = (await create({ name: 'Gina Old', username: 'gina' })).body;
  const gina = await app.client('gina');
  const res = await app.patch(`/api/users/${user.id}`, { name: '  Gina New  ' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ...user, name: 'Gina New' });
  const renamed = await app.patch(`/api/users/${user.id}`, { username: 'gina.new', ignored: 1 });
  assert.deepEqual(renamed.body, { ...user, name: 'Gina New', username: 'gina.new' });
  // The open session keeps working; the next sign-in uses the new username.
  assert.equal((await gina.get('/api/auth/me')).body.username, 'gina.new');
  assert.equal((await app.raw('POST', '/api/auth/login', { username: 'gina' })).status, 401);
  assert.equal((await (await app.client()).login('gina.new')).id, user.id);
  // A case-only change is allowed; another user's username is not.
  assert.equal((await app.patch(`/api/users/${user.id}`, { username: 'Gina.New' })).body.username, 'Gina.New');
  const taken = await app.patch(`/api/users/${user.id}`, { username: 'Dana' });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.error, 'That username is already taken.');
  // Name, username, group together.
  const all = await app.patch(`/api/users/${user.id}`, { name: 'G', username: 'g', group: VIEWER });
  assert.deepEqual(all.body, { id: user.id, name: 'G', username: 'g', group: VIEWER, active: true });
});

test('edit validation: 404, nothing to change, field messages (AC 6, 9)', async () => {
  assert.deepEqual((await app.patch('/api/users/999999', { name: 'x' })).body, { error: 'User not found.' });
  assert.equal((await app.patch('/api/users/999999', { name: 'x' })).status, 404);
  const before = usersRows();
  const cases = [
    [{}, 'Nothing to change.'],
    [{ id: 3, email: 'x' }, 'Nothing to change.'],
    [{ name: '' }, 'Name is required.'],
    [{ name: null }, 'Name is required.'],
    [{ name: 'x'.repeat(101) }, 'Name must be 100 characters or fewer.'],
    [{ username: '' }, USERNAME_RULE],
    [{ username: null }, USERNAME_RULE],
    [{ username: 'a b' }, USERNAME_RULE],
    [{ group: 'Nope' }, 'Unknown group.'],
    [{ active: 'false' }, 'Active must be true or false.'],
    [{ active: 0 }, 'Active must be true or false.'],
    [{ active: null }, 'Active must be true or false.'],
    [{ name: 'Valid', group: 'Nope' }, 'Unknown group.'],
  ];
  for (const [body, error] of cases) {
    const res = await app.patch(`/api/users/${ids.dana}`, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { error }, JSON.stringify(body));
  }
  assert.deepEqual(usersRows(), before, 'nothing changed');
});

test('a rename shows in live joins; stored snapshots are not rewritten (AC 7)', async () => {
  const user = (await create({ name: 'Hana Before', username: 'hana' })).body;
  const hana = await app.client('hana');
  const p = await createProject(app);
  const item = await createItem(hana, p.id, { assignee_id: user.id });
  await hana.post(`/api/issues/${item.id}/comments`, { body: 'hello' });
  await hana.post(`/api/issues/${item.id}/time`, { hours: 1 });
  await app.patch(`/api/users/${user.id}`, { name: 'Hana After' });
  assert.equal((await app.get(`/api/issues/${item.id}`)).body.reporter_name, 'Hana After');
  assert.equal((await app.get(`/api/issues/${item.id}/comments`)).body[0].author_name, 'Hana After');
  const time = (await app.get(`/api/issues/${item.id}/time`)).body;
  assert.match(JSON.stringify(time), /Hana Before/, 'time entry user_name is a snapshot');
  const history = (await app.get(`/api/issues/${item.id}/history`)).body;
  assert.ok(history.events.some((e) => e.actor_name === 'Hana Before'), 'history actor_name is a snapshot');
});

test('last Admin: demote 409, demote self allowed with another Admin (AC 8)', async () => {
  const res = await app.patch(`/api/users/${ids.alex}`, { group: MEMBER });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'There must be at least one Admin.' });
  assert.equal(usersData.getUser(app.db, ids.alex).group, ADMIN);
  usersData.setUserGroup(app.db, ids.blake, ADMIN);
  const self = await app.patch(`/api/users/${ids.alex}`, { group: MEMBER });
  assert.equal(self.status, 200);
  assert.equal(self.body.group, MEMBER);
});

// ---------- deactivating (AC 9-15) ----------

test('deactivate: sessions gone, hidden from lists and login; reactivate reverses (AC 10, 12)', async () => {
  const user = (await create({ name: 'Ivy Gone', username: 'ivy' })).body;
  const ivy1 = await app.client('ivy');
  const ivy2 = await app.client('ivy');
  assert.equal(sessionsOf(user.id), 2);

  const off = await app.patch(`/api/users/${user.id}`, { active: false });
  assert.equal(off.status, 200);
  assert.deepEqual(off.body, { ...user, active: false });
  assert.equal(sessionsOf(user.id), 0, 'all sessions deleted');
  for (const c of [ivy1, ivy2]) {
    const res = await c.get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Sign in required.' });
  }
  assert.ok(!(await app.raw('GET', '/api/auth/users')).body.some((u) => u.id === user.id), 'not in the sign-in list');
  assert.ok(!(await app.get('/api/users')).body.some((u) => u.id === user.id), 'not in the default list');
  const login = await app.raw('POST', '/api/auth/login', { username: 'ivy' });
  assert.equal(login.status, 401);
  assert.deepEqual(login.body, { error: 'Unknown username.' });
  assert.equal(login.setCookies.length, 0);
  // Admins see it with ?include=inactive; every user object has `active`.
  const all = (await app.get('/api/users?include=inactive')).body;
  assert.deepEqual(all.find((u) => u.id === user.id), { ...user, active: false });
  assert.ok(all.every((u) => typeof u.active === 'boolean'));
  const names = all.map((u) => u.name);
  assert.deepEqual(names, [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), 'name order');
  // Without manage-users the flag is ignored.
  const blake = await app.client('blake');
  assert.ok(!(await blake.get('/api/users?include=inactive')).body.some((u) => u.id === user.id));

  const on = await app.patch(`/api/users/${user.id}`, { active: true });
  assert.deepEqual(on.body, { ...user, active: true });
  assert.ok((await app.raw('GET', '/api/auth/users')).body.some((u) => u.id === user.id));
  assert.ok((await app.get('/api/users')).body.some((u) => u.id === user.id));
  assert.equal((await ivy1.get('/api/auth/me')).status, 401, 'old sessions are not restored');
  assert.equal((await (await app.client()).login('ivy')).id, user.id);
});

test('a session row of an inactive user counts as absent (AC 10)', async () => {
  const user = (await create({ name: 'Jay Direct', username: 'jay' })).body;
  const jay = await app.client('jay');
  usersData.setUserActive(app.db, user.id, false); // bypasses the route: sessions remain
  assert.equal(sessionsOf(user.id), 1);
  assert.equal((await jay.get('/api/users')).status, 401);
  assert.equal(sessionsOf(user.id), 0, 'stale session removed');
});

test('repeat deactivate / reactivate is 200 and changes nothing (AC 14)', async () => {
  const user = (await create({ name: 'Kim Twice', username: 'kim' })).body;
  const before = usersRows();
  assert.deepEqual((await app.patch(`/api/users/${user.id}`, { active: true })).body, user);
  assert.deepEqual(usersRows(), before);
  await app.patch(`/api/users/${user.id}`, { active: false });
  const off = usersRows();
  const again = await app.patch(`/api/users/${user.id}`, { active: false });
  assert.equal(again.status, 200);
  assert.equal(again.body.active, false);
  assert.deepEqual(usersRows(), off);
});

test('work survives deactivation; the assignee stays (AC 11, 13)', async () => {
  const user = (await create({ name: 'Lee Leaver', username: 'lee' })).body;
  const lee = await app.client('lee');
  const p = await createProject(app);
  const item = await createItem(lee, p.id, { assignee_id: user.id, title: 'Lee item' });
  const other = await createItem(app, p.id, { title: 'Other' });
  await lee.post(`/api/issues/${item.id}/comments`, { body: 'lee note' });
  await lee.post(`/api/issues/${item.id}/time`, { hours: 2 });
  await lee.post(`/api/issues/${item.id}/links`, { link_type: require('../server/linkTypes').LINK_TYPES[0].name, direction: 'outward', target_id: other.id });
  const tables = ['issues', 'comments', 'time_entries', 'issue_links', 'issue_history_events', 'issue_history_changes'];
  const snap = () => Object.fromEntries(tables.map((t) => [t, app.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const before = snap();
  const apiBefore = {
    item: (await app.get(`/api/issues/${item.id}`)).body,
    comments: (await app.get(`/api/issues/${item.id}/comments`)).body,
    time: (await app.get(`/api/issues/${item.id}/time`)).body,
    history: (await app.get(`/api/issues/${item.id}/history`)).body,
  };

  assert.equal((await app.patch(`/api/users/${user.id}`, { active: false })).status, 200);
  assert.deepEqual(snap(), before, 'no row changed');
  assert.deepEqual((await app.get(`/api/issues/${item.id}`)).body, apiBefore.item);
  assert.equal(apiBefore.item.assignee_id, user.id);
  assert.equal(apiBefore.item.reporter_name, 'Lee Leaver');
  assert.deepEqual((await app.get(`/api/issues/${item.id}/comments`)).body, apiBefore.comments);
  assert.equal(apiBefore.comments[0].author_name, 'Lee Leaver');
  assert.deepEqual((await app.get(`/api/issues/${item.id}/time`)).body, apiBefore.time);
  assert.deepEqual((await app.get(`/api/issues/${item.id}/history`)).body, apiBefore.history);

  // Newly assigning the inactive user: 400 on update and create.
  for (const res of [
    await app.patch(`/api/issues/${other.id}`, { assignee_id: user.id }),
    await app.post(`/api/projects/${p.id}/issues`, { title: 'New', assignee_id: user.id }),
  ]) {
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'That user is deactivated.' });
  }
  assert.equal((await app.get(`/api/issues/${other.id}`)).body.assignee_id, null);
  // Re-saving the item with the unchanged assignee works; unassigning too.
  const resave = await app.patch(`/api/issues/${item.id}`, { title: 'Lee item edited', assignee_id: user.id });
  assert.equal(resave.status, 200);
  assert.equal(resave.body.assignee_id, user.id);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { assignee_id: null })).body.assignee_id, null);
  assert.equal((await app.patch(`/api/issues/${item.id}`, { assignee_id: user.id })).status, 400, 'once unassigned, not again');
});

test('guards: self-deactivate 409 first, last active Admin 409, inactive Admin not counted (AC 14)', async () => {
  const self = await app.patch(`/api/users/${ids.alex}`, { active: false });
  assert.equal(self.status, 409);
  assert.deepEqual(self.body, { error: 'You cannot deactivate yourself.' });

  // A second, inactive Admin does not count.
  usersData.setUserGroup(app.db, ids.blake, ADMIN);
  usersData.setUserActive(app.db, ids.blake, false);
  assert.equal(usersData.countAdmins(app.db), 1);
  const demote = await app.patch(`/api/users/${ids.alex}`, { group: VIEWER });
  assert.equal(demote.status, 409);
  assert.deepEqual(demote.body, { error: 'There must be at least one Admin.' });

  // blake active Admin: blake signs in and tries to deactivate alex while
  // alex would be the last; then the other way round.
  usersData.setUserActive(app.db, ids.blake, true);
  const blake = await app.client('blake');
  assert.equal((await blake.patch(`/api/users/${ids.alex}`, { active: false })).status, 200, 'another active Admin remains');
  const last = await blake.patch(`/api/users/${ids.blake}`, { active: false });
  assert.equal(last.status, 409);
  assert.equal(last.body.error, 'You cannot deactivate yourself.', 'checked first');
  // Moving the only active Admin out of the group is refused while alex is inactive.
  assert.equal((await blake.patch(`/api/users/${ids.blake}`, { group: MEMBER })).status, 409);
  // Group plus deactivate in one body on the last Admin: still 409.
  usersData.setUserGroup(app.db, ids.dana, ADMIN);
  const dana = await app.client('dana');
  usersData.setUserGroup(app.db, ids.dana, MEMBER); // dana is a Member again; her session is still Admin-less
  assert.equal((await dana.patch(`/api/users/${ids.blake}`, { active: false })).status, 403);
  assert.equal(usersData.getUser(app.db, ids.blake).active, true);
});

test('deactivating the last active Admin by another manager is refused (AC 14)', async () => {
  // Make a second manager group so a non-Admin manager can try.
  groups.GROUPS.push({ name: 'Keeper', permissions: ['manage-users'] });
  try {
    usersData.setUserGroup(app.db, ids.dana, 'Keeper');
    const dana = await app.client('dana');
    usersData.setUserGroup(app.db, ids.dana, MEMBER);
    // Only alex manages now; dana's session lost the permission.
    assert.equal((await dana.patch(`/api/users/${ids.alex}`, { active: false })).status, 403);
    usersData.setUserGroup(app.db, ids.dana, 'Keeper');
    assert.equal((await dana.patch(`/api/users/${ids.alex}`, { active: false })).status, 200, 'dana (Keeper) still manages');
    const res = await dana.patch(`/api/users/${ids.alex}`, { active: true });
    assert.equal(res.status, 200);
    // Now try to deactivate alex when dana is no longer a manager-group member
    // but still active: impossible through the API (dana would lose permission),
    // so check the rule directly with the message wording of two groups.
    usersData.setUserActive(app.db, ids.alex, false);
    const lastKeeper = await dana.patch(`/api/users/${ids.dana}`, { group: MEMBER });
    assert.equal(lastKeeper.status, 409);
    assert.equal(lastKeeper.body.error, 'There must be at least one Admin or Keeper.');
  } finally {
    groups.GROUPS.pop();
    resetSeeded();
  }
});

test('an inactive user can change group; it counts for nothing until reactivated (AC 15)', async () => {
  const user = (await create({ name: 'Max Later', username: 'max' })).body;
  await app.patch(`/api/users/${user.id}`, { active: false });
  const res = await app.patch(`/api/users/${user.id}`, { group: ADMIN });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ...user, group: ADMIN, active: false });
  assert.equal(usersData.countAdmins(app.db), 1, 'still only alex');
  // Moving an inactive Admin out of the group is not a last-Admin case.
  assert.equal((await app.patch(`/api/users/${user.id}`, { group: VIEWER })).status, 200);
  await app.patch(`/api/users/${user.id}`, { group: ADMIN });
  assert.equal((await app.patch(`/api/users/${user.id}`, { active: true })).body.group, ADMIN);
  assert.equal(usersData.countAdmins(app.db), 2);
  // Now alex may step down and even be deactivated by max.
  const max = await app.client('max');
  assert.equal((await max.patch(`/api/users/${ids.alex}`, { active: false })).status, 200);
  assert.equal((await max.patch(`/api/users/${user.id}`, { active: false })).status, 409);
  await max.patch(`/api/users/${ids.alex}`, { active: true });
  await app.patch(`/api/users/${user.id}`, { active: false });
});

// ---------- permission matrix (AC 16) ----------

test('GET /api/groups/permissions: the matrix in groups.js order; signed in only (AC 16)', async () => {
  const res = await app.get('/api/groups/permissions');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    permissions: [
      { name: 'write', label: 'Create and edit work items, comment, link and attach files' },
      { name: 'delete-item', label: 'Delete work items' },
      { name: 'manage-projects', label: 'Create, edit and archive projects' },
      { name: 'manage-users', label: 'Manage users and groups' },
    ],
    groups: [
      { name: ADMIN, permissions: ['write', 'delete-item', 'manage-projects', 'manage-users'] },
      { name: MEMBER, permissions: ['write'] },
      { name: VIEWER, permissions: [] },
    ],
  });
  for (const p of groups.PERMISSIONS) assert.ok(p.label, `${p.name} has a label`);
  const viewer = await app.client('casey');
  usersData.setUserGroup(app.db, ids.casey, VIEWER);
  assert.equal((await viewer.get('/api/groups/permissions')).status, 200);
  assert.equal((await app.raw('GET', '/api/groups/permissions')).status, 401);
  assert.deepEqual((await app.get('/api/groups')).body, groups.groupNames(), 'GET /api/groups unchanged');
});

test('the matrix follows groups.js: an added group appears with its permissions (AC 16, 17)', async () => {
  groups.GROUPS.splice(2, 0, { name: 'Triager', permissions: ['delete-item', 'write'] });
  try {
    const { body } = await app.get('/api/groups/permissions');
    assert.deepEqual(body.groups.map((g) => g.name), [ADMIN, MEMBER, 'Triager', VIEWER]);
    assert.deepEqual(body.groups[2].permissions, ['write', 'delete-item'], 'in PERMISSIONS order');
  } finally {
    groups.GROUPS.splice(2, 1);
  }
});

// ---------- migration (AC 22) ----------

test('a fresh database has users.active and seeds every user active (AC 22)', () => {
  const db = openDb(tempDbPath());
  const rows = db.prepare('SELECT username, active FROM users ORDER BY id').all();
  const column = db.prepare('PRAGMA table_info(users)').all().find((c) => c.name === 'active');
  db.close();
  assert.deepEqual(rows.map((r) => r.active), [1, 1, 1, 1]);
  assert.equal(column.notnull, 1);
  assert.equal(column.dflt_value, '1');
});

test('an old database gains users.active: everyone active, idempotent, data intact (AC 22)', () => {
  const dbPath = tempDbPath();
  openDb(dbPath).close();
  const old = new Database(dbPath);
  old.exec('ALTER TABLE users DROP COLUMN active');
  old.prepare("INSERT INTO users (name, username) VALUES ('Old Timer', 'old')").run();
  const before = old.prepare('SELECT * FROM users ORDER BY id').all();
  old.close();

  const db = openDb(dbPath);
  const after = db.prepare('SELECT * FROM users ORDER BY id').all();
  assert.deepEqual(after.map(({ active, ...rest }) => rest), before);
  assert.ok(after.every((u) => u.active === 1));
  db.prepare("UPDATE users SET active = 0 WHERE username = 'old'").run();
  db.close();
  const again = openDb(dbPath);
  assert.equal(again.prepare("SELECT active FROM users WHERE username = 'old'").get().active, 0, 'reopening keeps changes');
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM users').get().n, before.length, 'no seed users added');
  again.close();
});
