// Work item links (docs/specs/work-item-links.md): link types and options
// (AC 1-2), create/list/remove (AC 4-11), deleting work items (AC 12-13) and
// history (AC 14-19). The default client is signed in as users[0]. Link type
// names and labels are taken from server/linkTypes.js, never typed here.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const { LINK_TYPES, getLinkType, isValidLinkType, labelFor, linkOptions } = require('../server/linkTypes');
const { linkField } = require('../server/historyFields');
const { STATUSES } = require('../server/statuses');
const { TYPES } = require('../server/types');
const links = require('../server/data/links');
const { setUserGroup } = require('../server/data/users');
const { initialAdminGroup } = require('../server/groups');

let app;
let users;
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const me = () => users[0];
// The first non-symmetric type (blocks / is blocked by) and the symmetric one.
const DIRECTED = LINK_TYPES.find((t) => !t.symmetric);
const SYMMETRIC = LINK_TYPES.find((t) => t.symmetric);
const OTHER_DIRECTED = LINK_TYPES.filter((t) => !t.symmetric)[1];
const LINK = linkField().key;

const linksOf = async (id) => (await app.get(`/api/issues/${id}/links`)).body;
const addLink = (from, body, client = app) => client.post(`/api/issues/${from.id}/links`, body);
const rowCount = () => app.db.prepare('SELECT COUNT(*) AS n FROM issue_links').get().n;
const eventCount = (id) => app.db.prepare('SELECT COUNT(*) AS n FROM issue_history_events WHERE issue_id = ?').get(id).n;
const linkEvents = async (id) => (await app.get(`/api/issues/${id}/history?field=${LINK}`)).body.events;

async function threeItems() {
  const project = await createProject(app);
  const a = await createItem(app, project.id, { title: 'A' });
  const b = await createItem(app, project.id, { title: 'B' });
  const c = await createItem(app, project.id, { title: 'C' });
  return { project, a, b, c };
}

// Runs fn with console.error silenced (the app logs 500s).
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// ---------- link types (AC 1-2) ----------

test('the link type list: Blocks, Relates, Duplicates with their labels (AC 1)', () => {
  assert.deepEqual(LINK_TYPES.map((t) => t.name), ['Blocks', 'Relates', 'Duplicates']);
  assert.deepEqual(getLinkType('Blocks'), { name: 'Blocks', outward: 'blocks', inward: 'is blocked by' });
  assert.equal(getLinkType('Relates').symmetric, true);
  assert.equal(getLinkType('Relates').outward, 'relates to');
  assert.deepEqual(
    [getLinkType('Duplicates').outward, getLinkType('Duplicates').inward],
    ['duplicates', 'is duplicated by']
  );
  assert.ok(isValidLinkType('Blocks'));
  assert.ok(!isValidLinkType('blocks'));
  assert.ok(!isValidLinkType(undefined));
  assert.equal(getLinkType('Nope'), undefined);
  assert.equal(labelFor('Relates', 'inward'), 'relates to');
});

test('GET /api/link-types expands the list into options in display order (AC 2)', async () => {
  const res = await app.get('/api/link-types');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, linkOptions());
  assert.deepEqual(res.body, [
    { link_type: 'Blocks', direction: 'outward', label: 'blocks' },
    { link_type: 'Blocks', direction: 'inward', label: 'is blocked by' },
    { link_type: 'Relates', direction: 'outward', label: 'relates to' },
    { link_type: 'Duplicates', direction: 'outward', label: 'duplicates' },
    { link_type: 'Duplicates', direction: 'inward', label: 'is duplicated by' },
  ]);
});

// ---------- create and read (AC 4, 7, 8) ----------

test('an outward link is created and reads correctly from both ends (AC 4, 7, 8)', async () => {
  const { a, b } = await threeItems();
  const before = rowCount();
  const res = await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, {
    id: res.body.id,
    link_type: DIRECTED.name,
    direction: 'outward',
    label: DIRECTED.outward,
    other: { id: b.id, key: b.key, title: b.title, type: b.type, status: b.status },
  });
  assert.equal(rowCount(), before + 1, 'one row stored');
  const row = links.getLink(app.db, res.body.id);
  assert.equal(row.source_id, a.id);
  assert.equal(row.target_id, b.id);
  assert.equal(row.created_by_id, me().id);

  assert.deepEqual(await linksOf(a.id), [res.body]);
  const [fromB] = await linksOf(b.id);
  assert.equal(fromB.id, res.body.id);
  assert.equal(fromB.direction, 'inward');
  assert.equal(fromB.label, DIRECTED.inward);
  assert.deepEqual(fromB.other, { id: a.id, key: a.key, title: a.title, type: a.type, status: a.status });
});

test('an inward link makes the target the source (AC 4)', async () => {
  const { a, b } = await threeItems();
  const res = await addLink(a, { link_type: DIRECTED.name, direction: 'inward', target_id: b.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.direction, 'inward');
  assert.equal(res.body.label, DIRECTED.inward);
  assert.equal(res.body.other.id, b.id);
  const row = links.getLink(app.db, res.body.id);
  assert.deepEqual([row.source_id, row.target_id], [b.id, a.id]);
  const [fromB] = await linksOf(b.id);
  assert.equal(fromB.direction, 'outward');
  assert.equal(fromB.label, DIRECTED.outward);
});

test('a symmetric link needs no direction, reads the same from both ends, stores the lower id first (AC 4, 8)', async () => {
  const { a, b } = await threeItems();
  const res = await addLink(b, { link_type: SYMMETRIC.name, target_id: a.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.direction, 'outward');
  assert.equal(res.body.label, SYMMETRIC.outward);
  assert.equal(res.body.other.id, a.id);
  const row = links.getLink(app.db, res.body.id);
  assert.deepEqual([row.source_id, row.target_id], [a.id, b.id]);
  const [fromA] = await linksOf(a.id);
  assert.equal(fromA.direction, 'outward');
  assert.equal(fromA.label, SYMMETRIC.outward);
  assert.equal(fromA.other.id, b.id);
});

test('links are ordered by type display order, then direction, then other key (AC 8)', async () => {
  const project = await createProject(app);
  const items = [];
  for (let n = 0; n < 11; n += 1) items.push(await createItem(app, project.id, { title: `I${n}` }));
  const [x, ...rest] = items;
  const last = LINK_TYPES[LINK_TYPES.length - 1];
  // Created out of order on purpose.
  await addLink(x, { link_type: last.name, direction: 'outward', target_id: rest[0].id });
  await addLink(x, { link_type: DIRECTED.name, direction: 'inward', target_id: rest[1].id });
  await addLink(x, { link_type: DIRECTED.name, direction: 'outward', target_id: rest[9].id }); // key ...-11
  await addLink(x, { link_type: DIRECTED.name, direction: 'outward', target_id: rest[2].id }); // key ...-4
  await addLink(x, { link_type: SYMMETRIC.name, target_id: rest[3].id });
  const list = await linksOf(x.id);
  assert.deepEqual(
    list.map((l) => [l.link_type, l.direction, l.other.id]),
    [
      [DIRECTED.name, 'outward', rest[2].id],
      [DIRECTED.name, 'outward', rest[9].id],
      [DIRECTED.name, 'inward', rest[1].id],
      [SYMMETRIC.name, 'outward', rest[3].id],
      [last.name, 'outward', rest[0].id],
    ]
  );
});

test('the same pair may be linked with different types; cycles are allowed (AC 6, Decision 3)', async () => {
  const { a, b } = await threeItems();
  assert.equal((await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).status, 201);
  assert.equal((await addLink(a, { link_type: SYMMETRIC.name, target_id: b.id })).status, 201);
  assert.equal((await addLink(b, { link_type: DIRECTED.name, direction: 'outward', target_id: a.id })).status, 201);
  assert.equal((await linksOf(a.id)).length, 3);
});

test('GET links: unknown id 404, item with no links []', async () => {
  const { a } = await threeItems();
  assert.deepEqual(await linksOf(a.id), []);
  for (const id of [999999, 'abc']) {
    const res = await app.get(`/api/issues/${id}/links`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Work item not found.');
  }
});

// ---------- validation (AC 5, 6, 18) ----------

test('every validation case returns its status and writes nothing (AC 5, 18)', async () => {
  const { a, b } = await threeItems();
  const other = await createProject(app);
  const elsewhere = await createItem(app, other.id);
  const ok = { link_type: DIRECTED.name, direction: 'outward', target_id: b.id };
  const cases = [
    [a, { ...ok, link_type: undefined }, 400],
    [a, { ...ok, link_type: 'Nope' }, 400],
    [a, { ...ok, link_type: DIRECTED.outward }, 400],
    [a, { ...ok, link_type: 7 }, 400],
    [a, { ...ok, direction: undefined }, 400],
    [a, { ...ok, direction: 'sideways' }, 400],
    [a, { ...ok, target_id: undefined }, 400],
    [a, { ...ok, target_id: 'x' }, 400],
    [a, { ...ok, target_id: 1.5 }, 400],
    [a, { ...ok, target_id: null }, 400],
    [a, { ...ok, target_id: 999999 }, 404, 'Work item not found.'],
    [{ id: 999999 }, ok, 404, 'Work item not found.'],
    [a, { ...ok, target_id: a.id }, 400, 'A work item cannot be linked to itself.'],
    [a, { ...ok, target_id: elsewhere.id }, 400, 'Links must be within one project.'],
  ];
  const rows = rowCount();
  const events = [a, b, elsewhere].map((i) => eventCount(i.id));
  for (const [from, body, status, message] of cases) {
    const res = await addLink(from, body);
    assert.equal(res.status, status, JSON.stringify(body));
    assert.ok(res.body.error, 'has an error message');
    if (message) assert.equal(res.body.error, message);
  }
  assert.equal(rowCount(), rows);
  assert.deepEqual([a, b, elsewhere].map((i) => eventCount(i.id)), events, 'no history written');
});

test('duplicates are rejected with 409, including a reversed symmetric pair (AC 6, 18)', async () => {
  const { a, b } = await threeItems();
  await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  await addLink(a, { link_type: SYMMETRIC.name, target_id: b.id });
  const rows = rowCount();
  const events = [eventCount(a.id), eventCount(b.id)];
  const dupes = [
    [a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id }],
    [b, { link_type: DIRECTED.name, direction: 'inward', target_id: a.id }], // same row seen from b
    [a, { link_type: SYMMETRIC.name, target_id: b.id }],
    [b, { link_type: SYMMETRIC.name, target_id: a.id }],
    [b, { link_type: SYMMETRIC.name, direction: 'inward', target_id: a.id }],
  ];
  for (const [from, body] of dupes) {
    const res = await addLink(from, body);
    assert.equal(res.status, 409, JSON.stringify(body));
    assert.ok(res.body.error);
  }
  assert.equal(rowCount(), rows);
  assert.deepEqual([eventCount(a.id), eventCount(b.id)], events);
});

test('a database error during an add rolls back the row and both events (AC 18)', async () => {
  const { a, b } = await threeItems();
  const rows = rowCount();
  const events = [eventCount(a.id), eventCount(b.id)];
  // Fail the second history insert by making the history table refuse it.
  app.db.exec(`CREATE TEMP TRIGGER fail_link_history BEFORE INSERT ON issue_history_events
    WHEN NEW.issue_id = ${b.id} BEGIN SELECT RAISE(ABORT, 'boom'); END`);
  try {
    const res = await quietly(() => addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id }));
    assert.equal(res.status, 500);
  } finally {
    app.db.exec('DROP TRIGGER fail_link_history');
  }
  assert.equal(rowCount(), rows);
  assert.deepEqual([eventCount(a.id), eventCount(b.id)], events);
});

// ---------- remove (AC 9, 15, 18) ----------

test('a link is removed from either end and disappears from both (AC 9)', async () => {
  const { a, b, c } = await threeItems();
  const ab = (await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  const ac = (await addLink(a, { link_type: SYMMETRIC.name, target_id: c.id })).body;

  let res = await app.del(`/api/issues/${a.id}/links/${ab.id}`); // from the source
  assert.equal(res.status, 204);
  assert.deepEqual((await linksOf(b.id)), []);
  assert.deepEqual((await linksOf(a.id)).map((l) => l.id), [ac.id]);

  res = await app.del(`/api/issues/${c.id}/links/${ac.id}`); // from the target
  assert.equal(res.status, 204);
  assert.deepEqual(await linksOf(a.id), []);
  assert.deepEqual(await linksOf(c.id), []);
  assert.equal(links.getLink(app.db, ac.id), undefined);
});

test('removing a missing link, or one not involving the item, returns 404 (AC 9)', async () => {
  const { a, b, c } = await threeItems();
  const ab = (await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  for (const [id, linkId] of [[c.id, ab.id], [a.id, 999999], [a.id, 'x']]) {
    const res = await app.del(`/api/issues/${id}/links/${linkId}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Link not found.');
  }
  assert.equal((await app.del(`/api/issues/999999/links/${ab.id}`)).status, 404);
  assert.equal((await linksOf(a.id)).length, 1, 'still there');
});

// ---------- archived, signed out, actor (AC 10, 11) ----------

test('archived project: writes 409 and change nothing, reads 200 (AC 10)', async () => {
  const { project, a, b, c } = await threeItems();
  const ab = (await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  assert.equal((await app.patch(`/api/projects/${project.id}`, { status: 'Completed' })).status, 200);
  const res = await app.patch(`/api/projects/${project.id}`, { archived: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.archived, true);

  const rows = rowCount();
  const events = [eventCount(a.id), eventCount(b.id)];
  assert.equal((await addLink(a, { link_type: SYMMETRIC.name, target_id: c.id })).status, 409);
  assert.equal((await app.del(`/api/issues/${a.id}/links/${ab.id}`)).status, 409);
  assert.equal(rowCount(), rows);
  assert.deepEqual([eventCount(a.id), eventCount(b.id)], events);

  const read = await app.get(`/api/issues/${b.id}/links`);
  assert.equal(read.status, 200);
  assert.equal(read.body.length, 1);
});

test('signed-out requests get 401 on every links endpoint (AC 11)', async () => {
  const { a, b } = await threeItems();
  const ab = (await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  const rows = rowCount();
  const calls = [
    ['GET', '/api/link-types'],
    ['GET', `/api/issues/${a.id}/links`],
    ['POST', `/api/issues/${a.id}/links`, { link_type: SYMMETRIC.name, target_id: b.id }],
    ['DELETE', `/api/issues/${a.id}/links/${ab.id}`],
  ];
  for (const [method, url, body] of calls) {
    const res = await app.raw(method, url, body);
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  assert.equal(rowCount(), rows);
});

test('the creator and actor come from the signed-in user; body ids are ignored (AC 11, 14)', async () => {
  const { a, b } = await threeItems();
  const other = users[1];
  const client = await app.client(other.username);
  const res = await addLink(
    a,
    { link_type: DIRECTED.name, direction: 'outward', target_id: b.id, created_by_id: users[2].id, actor_id: users[2].id },
    client
  );
  assert.equal(res.status, 201);
  assert.equal(links.getLink(app.db, res.body.id).created_by_id, other.id);
  for (const id of [a.id, b.id]) {
    const [e] = await linkEvents(id);
    assert.equal(e.actor_id, other.id);
    assert.equal(e.actor_name, other.name);
  }
});

// ---------- history (AC 14-19) ----------

test('adding a link writes a mirrored event on both items (AC 14)', async () => {
  const { a, b } = await threeItems();
  const res = await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  const [ea] = (await app.get(`/api/issues/${a.id}/history`)).body.events;
  const [eb] = (await app.get(`/api/issues/${b.id}/history`)).body.events;
  for (const e of [ea, eb]) {
    assert.equal(e.kind, 'changed');
    assert.equal(e.actor_id, me().id);
    assert.equal(e.actor_name, me().name);
    assert.equal(e.changes.length, 1);
  }
  assert.equal(ea.created_at, eb.created_at);
  assert.deepEqual(ea.changes[0], {
    field: LINK, label: linkField().label, kind: linkField().kind, old: null, new: `${DIRECTED.outward} ${b.key}`, old_id: null, new_id: b.id,
  });
  assert.deepEqual(eb.changes[0], {
    field: LINK, label: linkField().label, kind: linkField().kind, old: null, new: `${DIRECTED.inward} ${a.key}`, old_id: null, new_id: a.id,
  });
  assert.equal(linkField().label, 'Link');
  assert.equal(linkField().kind, 'link');
  assert.ok(res.body.id);
});

test('removing a link writes the mirror event on both items (AC 15)', async () => {
  const { a, b } = await threeItems();
  const ab = (await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id })).body;
  const client = await app.client(users[1].username);
  assert.equal((await client.del(`/api/issues/${b.id}/links/${ab.id}`)).status, 204);
  const [ea] = await linkEvents(a.id);
  const [eb] = await linkEvents(b.id);
  for (const e of [ea, eb]) assert.equal(e.actor_id, users[1].id);
  assert.deepEqual([ea.changes[0].old, ea.changes[0].new, ea.changes[0].old_id, ea.changes[0].new_id], [`${DIRECTED.outward} ${b.key}`, null, b.id, null]);
  assert.deepEqual([eb.changes[0].old, eb.changes[0].new, eb.changes[0].old_id, eb.changes[0].new_id], [`${DIRECTED.inward} ${a.key}`, null, a.id, null]);
});

test('symmetric links read the same label in both history events', async () => {
  const { a, b } = await threeItems();
  await addLink(b, { link_type: SYMMETRIC.name, target_id: a.id });
  assert.equal((await linkEvents(a.id))[0].changes[0].new, `${SYMMETRIC.outward} ${b.key}`);
  assert.equal((await linkEvents(b.id))[0].changes[0].new, `${SYMMETRIC.outward} ${a.key}`);
});

test('field=link returns only link events; history-fields lists Link (AC 16)', async () => {
  const { a, b } = await threeItems();
  await app.patch(`/api/issues/${a.id}`, { title: 'Renamed' });
  await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  const all = (await app.get(`/api/issues/${a.id}/history`)).body.events;
  assert.equal(all.length, 3); // created, title, link
  const only = await linkEvents(a.id);
  assert.equal(only.length, 1);
  assert.ok(only.every((e) => e.changes.every((c) => c.field === LINK)));
  const fields = (await app.get('/api/history-fields')).body;
  assert.ok(fields.some((f) => f.key === LINK && f.label === 'Link' && f.kind === 'link'));
});

test('a PATCH writes no link events, and other field changes leave links alone (AC 13, 19)', async () => {
  const { project, a, b } = await threeItems();
  await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id });
  const epicType = TYPES.find((t) => t.isEpic).name;
  const epic = await createItem(app, project.id, { type: epicType });
  const otherType = TYPES.find((t) => !t.isEpic && t.name !== a.type).name;
  const before = await linksOf(a.id);
  for (const patch of [{ status: STATUSES[1] }, { type: otherType }, { epic_id: epic.id }, { title: 'x', priority: a.priority }]) {
    assert.equal((await app.patch(`/api/issues/${a.id}`, patch)).status, 200, JSON.stringify(patch));
  }
  assert.equal((await linkEvents(a.id)).length, 1, 'only the add');
  const after = await linksOf(a.id);
  assert.deepEqual(after.map((l) => [l.id, l.link_type, l.direction, l.other.id]), before.map((l) => [l.id, l.link_type, l.direction, l.other.id]));
  assert.equal(after[0].other.id, b.id);
});

// ---------- deleting work items (AC 12, 17) ----------

test('deleting a work item removes its links and writes partner events (AC 12, 17)', async () => {
  const { a, b, c } = await threeItems();
  await addLink(a, { link_type: DIRECTED.name, direction: 'outward', target_id: b.id }); // a source
  await addLink(c, { link_type: OTHER_DIRECTED.name, direction: 'outward', target_id: a.id }); // a target
  await addLink(b, { link_type: SYMMETRIC.name, target_id: c.id }); // unrelated to a
  const client = await app.client(users[2].username);
  // Deleting needs delete-item (permission groups): make this user an Admin.
  setUserGroup(app.db, users[2].id, initialAdminGroup());

  assert.equal((await client.del(`/api/issues/${a.id}`)).status, 204);
  const refs = app.db.prepare('SELECT COUNT(*) AS n FROM issue_links WHERE source_id = ? OR target_id = ?').get(a.id, a.id).n;
  assert.equal(refs, 0);
  assert.equal(eventCount(a.id), 0, 'the deleted item history is gone');

  // Partners are still there, keep their other links, and lose the deleted one.
  assert.equal((await app.get(`/api/issues/${b.id}`)).status, 200);
  assert.equal((await app.get(`/api/issues/${c.id}`)).status, 200);
  assert.deepEqual((await linksOf(b.id)).map((l) => l.other.id), [c.id]);
  assert.deepEqual((await linksOf(c.id)).map((l) => l.other.id), [b.id]);

  const [eb] = await linkEvents(b.id);
  assert.equal(eb.actor_id, users[2].id);
  assert.deepEqual([eb.changes[0].old, eb.changes[0].new, eb.changes[0].old_id], [`${DIRECTED.inward} ${a.key}`, null, a.id]);
  const [ec] = await linkEvents(c.id);
  assert.equal(ec.actor_id, users[2].id);
  assert.deepEqual([ec.changes[0].old, ec.changes[0].new, ec.changes[0].old_id], [`${OTHER_DIRECTED.outward} ${a.key}`, null, a.id]);
});
