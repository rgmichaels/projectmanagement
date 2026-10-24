// Discussion messages (docs/specs/ticket-discussion.md): create, list, edit,
// delete, comment_count, cascade on work item delete, archived read-only
// (AC 8-11, 13, 15, 19, 22-31).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');

let app;
let users;
test.before(async () => {
  app = await startServer();
  users = (await app.get('/api/users')).body;
});
test.after(async () => { await app.close(); });

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const thread = async (issueId) => (await app.get(`/api/issues/${issueId}/comments`)).body;
const post = (issueId, body, authorId = users[0].id) =>
  app.post(`/api/issues/${issueId}/comments`, { author_id: authorId, body });
const countRows = (issueId) =>
  app.db.prepare('SELECT COUNT(*) AS n FROM comments WHERE issue_id = ?').get(issueId).n;
const commentCount = async (projectId, issueId) =>
  (await app.get(`/api/projects/${projectId}/issues`)).body.find((i) => i.id === issueId).comment_count;

async function newItem(fields) {
  const p = await createProject(app);
  return { project: p, item: await createItem(app, p.id, fields) };
}

test('a valid message is created and listed back with author and UTC time (AC 8, 10, 16)', async () => {
  const { item } = await newItem();
  const res = await post(item.id, 'Hello there', users[1].id);
  assert.equal(res.status, 201);
  assert.equal(res.body.body, 'Hello there');
  assert.equal(res.body.author_id, users[1].id);
  assert.equal(res.body.author_name, users[1].name);
  assert.equal(res.body.issue_id, item.id);
  assert.match(res.body.created_at, ISO_UTC);
  assert.equal(res.body.updated_at, null);

  const list = await thread(item.id);
  assert.equal(list.length, 1);
  const [c] = list;
  for (const key of ['id', 'issue_id', 'author_id', 'author_name', 'body', 'created_at', 'updated_at']) {
    assert.ok(key in c, `listed comment has ${key}`);
  }
  assert.deepEqual(c, res.body);
});

test('body validation: empty, whitespace and 2001 chars rejected; 2000 accepted; trimmed (AC 9, 11)', async () => {
  const { item } = await newItem();
  for (const body of ['', '   ', '\n\t \n', 'x'.repeat(2001), undefined, null, 42]) {
    const res = await post(item.id, body);
    assert.equal(res.status, 400, `rejects ${JSON.stringify(body)}`);
    assert.ok(res.body.error);
  }
  assert.equal(countRows(item.id), 0, 'nothing created');

  assert.equal((await post(item.id, 'y'.repeat(2000))).status, 201);
  // 2000 characters after trimming is still valid.
  assert.equal((await post(item.id, `  ${'z'.repeat(2000)}  `)).status, 201);
  const trimmed = await post(item.id, '  \n line one\nline two \n ');
  assert.equal(trimmed.body.body, 'line one\nline two', 'outer whitespace trimmed, inner line break kept');
});

test('missing, non-integer and unknown author_id rejected; anyone may post as anyone (AC 8)', async () => {
  const { item } = await newItem();
  for (const author_id of [undefined, null, 'abc', '1', 1.5, 0, -1, 99999]) {
    const res = await app.post(`/api/issues/${item.id}/comments`, { author_id, body: 'hi' });
    assert.ok(res.status >= 400 && res.status < 500, `rejects author_id ${JSON.stringify(author_id)}`);
    assert.ok(res.body.error);
  }
  assert.equal(countRows(item.id), 0);
  for (const u of users) assert.equal((await post(item.id, 'hi', u.id)).status, 201);
});

test('unknown work item returns 404; non-numeric ids return 4xx with the error shape (AC 31)', async () => {
  const get = await app.get('/api/issues/999999/comments');
  assert.equal(get.status, 404);
  assert.ok(get.body.error);
  assert.equal((await post(999999, 'hi')).status, 404);
  for (const res of [
    await app.get('/api/issues/abc/comments'),
    await app.post('/api/issues/abc/comments', { author_id: users[0].id, body: 'hi' }),
    await app.patch('/api/comments/abc', { body: 'hi' }),
    await app.del('/api/comments/abc'),
  ]) {
    assert.ok(res.status >= 400 && res.status < 500);
    assert.equal(typeof res.body.error, 'string');
  }
});

test('newest first, same-second ties by descending id, edit keeps position (AC 15)', async () => {
  const { item } = await newItem();
  const a = (await post(item.id, 'first')).body;
  const b = (await post(item.id, 'second')).body;
  const c = (await post(item.id, 'third')).body;
  assert.deepEqual((await thread(item.id)).map((x) => x.id), [c.id, b.id, a.id]);

  // Force a tie on created_at: the higher id comes first.
  app.db.prepare('UPDATE comments SET created_at = ? WHERE id IN (?, ?, ?)').run('2026-01-01T00:00:00.000Z', a.id, b.id, c.id);
  assert.deepEqual((await thread(item.id)).map((x) => x.id), [c.id, b.id, a.id]);

  const { item: other } = await newItem();
  const older = (await post(other.id, 'older')).body;
  await new Promise((r) => setTimeout(r, 5));
  const newer = (await post(other.id, 'newer')).body;
  assert.equal((await app.patch(`/api/comments/${older.id}`, { body: 'older, edited' })).status, 200);
  assert.deepEqual((await thread(other.id)).map((x) => x.id), [newer.id, older.id]);
});

test('markup is stored and returned verbatim (AC 19)', async () => {
  const { item } = await newItem();
  const body = '<script>alert(1)</script> <b>x</b> & "q"';
  assert.equal((await post(item.id, body)).body.body, body);
  assert.equal((await thread(item.id))[0].body, body);
});

test('posting on a Done item works and leaves the item unchanged (AC 13)', async () => {
  const statuses = (await app.get('/api/statuses')).body;
  const last = statuses[statuses.length - 1];
  const { item } = await newItem({ priority: 'High', assignee_id: users[0].id, description: 'd' });
  const moved = (await app.patch(`/api/issues/${item.id}`, { status: last })).body;
  assert.equal(moved.status, last);
  assert.equal((await post(item.id, 'closing note')).status, 201);
  assert.deepEqual((await app.get(`/api/issues/${item.id}`)).body, moved);
});

test('edit: changes body and updated_at only; invalid and same-text edits; unknown id (AC 22-24)', async () => {
  const { item } = await newItem();
  const original = (await post(item.id, 'draft text', users[2].id)).body;

  for (const body of ['', '   ', 'x'.repeat(2001), undefined]) {
    const res = await app.patch(`/api/comments/${original.id}`, { body });
    assert.equal(res.status, 400);
  }
  assert.deepEqual((await thread(item.id))[0], original, 'unchanged after invalid edits');

  const same = await app.patch(`/api/comments/${original.id}`, { body: '  draft text \n' });
  assert.equal(same.status, 200);
  assert.equal(same.body.updated_at, null, 'same text after trim: no edit recorded');

  const res = await app.patch(`/api/comments/${original.id}`, { body: '  final text ', author_id: users[0].id, issue_id: 1 });
  assert.equal(res.status, 200);
  assert.equal(res.body.body, 'final text');
  assert.match(res.body.updated_at, ISO_UTC);
  assert.ok(res.body.updated_at >= original.created_at);
  assert.equal(res.body.author_id, original.author_id);
  assert.equal(res.body.issue_id, original.issue_id);
  assert.equal(res.body.created_at, original.created_at);
  assert.deepEqual((await thread(item.id))[0], res.body, 'edit persists');

  // Re-sending the stored text leaves updated_at as it was.
  const again = await app.patch(`/api/comments/${original.id}`, { body: 'final text' });
  assert.equal(again.body.updated_at, res.body.updated_at);

  assert.equal((await app.patch('/api/comments/999999', { body: 'x' })).status, 404);
});

test('delete removes the message; unknown id returns 404 (AC 25, 26)', async () => {
  const { item } = await newItem();
  const keep = (await post(item.id, 'keep')).body;
  const gone = (await post(item.id, 'gone')).body;
  const res = await app.del(`/api/comments/${gone.id}`);
  assert.ok(res.status >= 200 && res.status < 300);
  assert.deepEqual((await thread(item.id)).map((c) => c.id), [keep.id]);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM comments WHERE id = ?').get(gone.id).n, 0);
  assert.equal((await app.del(`/api/comments/${gone.id}`)).status, 404);
  assert.equal((await app.del('/api/comments/999999')).status, 404);
});

test('comment_count on the board list: 0, after add, after delete, unchanged by edit (AC 27)', async () => {
  const { project, item } = await newItem();
  const empty = await createItem(app, project.id);
  const list = (await app.get(`/api/projects/${project.id}/issues`)).body;
  assert.ok(list.every((i) => i.comment_count === 0));

  const a = (await post(item.id, 'a')).body;
  await post(item.id, 'b');
  assert.equal(await commentCount(project.id, item.id), 2);
  assert.equal(await commentCount(project.id, empty.id), 0);

  await app.patch(`/api/comments/${a.id}`, { body: 'a edited' });
  assert.equal(await commentCount(project.id, item.id), 2);

  await app.del(`/api/comments/${a.id}`);
  assert.equal(await commentCount(project.id, item.id), 1);
});

test('deleting a work item removes its messages; deleting an epic keeps children\'s messages (AC 30)', async () => {
  const { project, item } = await newItem();
  await post(item.id, 'one');
  await post(item.id, 'two');
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  assert.equal(countRows(item.id), 0, 'no orphan rows');

  const types = (await app.get('/api/types')).body;
  const epicType = types.find((t) => t.isEpic).name;
  const epic = await createItem(app, project.id, { type: epicType });
  const child = await createItem(app, project.id, { epic_id: epic.id });
  await post(epic.id, 'epic note');
  const childMsg = (await post(child.id, 'child note')).body;
  assert.equal((await app.del(`/api/issues/${epic.id}`)).status, 204);
  assert.equal(countRows(epic.id), 0);
  assert.deepEqual(await thread(child.id), [childMsg]);
});

test('the explicit delete holds even with the foreign-key pragma off (AC 30)', async () => {
  const { item } = await newItem();
  await post(item.id, 'one');
  app.db.pragma('foreign_keys = OFF');
  try {
    assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
    assert.equal(countRows(item.id), 0);
  } finally {
    app.db.pragma('foreign_keys = ON');
  }
});

test('archived project: writes rejected with 409, data unchanged, GET works; unarchive restores (AC 28, 29)', async () => {
  const p = await createProject(app, { status: 'Completed' });
  const item = await createItem(app, p.id);
  const msg = (await post(item.id, 'before archive')).body;
  assert.equal((await app.patch(`/api/projects/${p.id}`, { archived: true })).status, 200);

  const before = await thread(item.id);
  assert.deepEqual(before, [msg], 'archiving does not alter messages');
  for (const res of [
    await post(item.id, 'after archive'),
    await app.patch(`/api/comments/${msg.id}`, { body: 'changed' }),
    await app.del(`/api/comments/${msg.id}`),
  ]) {
    assert.equal(res.status, 409);
    assert.match(res.body.error, /archived/);
  }
  const get = await app.get(`/api/issues/${item.id}/comments`);
  assert.equal(get.status, 200);
  assert.deepEqual(get.body, before, 'data unchanged');

  assert.equal((await app.patch(`/api/projects/${p.id}`, { archived: false })).status, 200);
  assert.deepEqual(await thread(item.id), before, 'unarchiving does not alter messages');
  assert.equal((await post(item.id, 'after unarchive')).status, 201);
});
