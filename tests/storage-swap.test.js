// Storage is swappable (docs/specs/attachments-and-pasted-images.md AC 4, 18):
// server/data/storage.js is replaced by an in-memory fake with the same four
// functions before the app loads, and the upload, download and delete flows
// still work. Nothing outside the module depends on the disk layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

// ---------- the fake ----------
const files = new Map(); // key -> Buffer
let failRemove = false;
const fake = {
  async put(source) {
    const chunks = [];
    for await (const c of Buffer.isBuffer(source) ? [source] : source) chunks.push(c);
    const key = crypto.randomBytes(8).toString('hex');
    const bytes = Buffer.concat(chunks);
    files.set(key, bytes);
    return { key, size: bytes.length };
  },
  open(key) {
    if (!files.has(key)) throw Object.assign(new Error('Attachment not found.'), { status: 404 });
    return Readable.from([files.get(key)]);
  },
  async remove(key) {
    if (failRemove) throw new Error('backend unavailable');
    files.delete(key);
  },
  exists: (key) => files.has(key),
};

// Swap the module in before anything requires it.
const storagePath = require.resolve('../server/data/storage');
require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: fake };

const { startServer, createProject, createItem } = require('./helpers');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('fake-backed png')]);

test('the swapped-in module is the one the app uses', () => {
  assert.equal(require('../server/data/storage'), fake);
});

test('upload, list, download, preview and delete work against the fake (AC 4)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const up = await app.upload(item.id, 'shot.png', PNG, 'image/png');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(files.size, 1);
  const [key] = files.keys();
  assert.ok(files.get(key).equals(PNG));

  assert.equal((await app.get(`/api/issues/${item.id}/attachments`)).body.length, 1);
  for (const kind of ['download', 'preview']) {
    const res = await fetch(`${app.base}/api/attachments/${up.body.id}/${kind}`, { headers: { Cookie: app.cookie } });
    assert.equal(res.status, 200, kind);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG), kind);
  }

  assert.equal((await app.del(`/api/attachments/${up.body.id}`)).status, 204);
  assert.equal(files.size, 0);
});

test('limits are enforced on the stream, not by the backend (AC 4, 6)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  assert.equal((await app.upload(item.id, 'bad.png', Buffer.from('not png'))).status, 415);
  assert.equal((await app.upload(item.id, 'empty.txt', Buffer.alloc(0))).status, 400);
  assert.equal(files.size, 0);
});

test('deleting a work item removes its files from the fake (AC 4, 21)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  await app.upload(item.id, 'a.txt', Buffer.from('a'));
  await app.upload(item.id, 'b.txt', Buffer.from('b'));
  assert.equal(files.size, 2);
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  assert.equal(files.size, 0);
});

test('a failing remove is logged; the delete still succeeds (AC 18, 21)', async (t) => {
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
  const item = await createItem(app, (await createProject(app)).id);
  const a = (await app.upload(item.id, 'a.txt', Buffer.from('a'))).body;
  const b = (await app.upload(item.id, 'b.txt', Buffer.from('b'))).body;
  failRemove = true;
  try {
    assert.equal((await app.del(`/api/attachments/${a.id}`)).status, 204);
    assert.equal((await app.get(`/api/attachments/${a.id}/download`)).status, 404, 'the row is gone');
    assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
    assert.equal((await app.get(`/api/attachments/${b.id}/download`)).status, 404);
  } finally {
    failRemove = false;
  }
  assert.equal(errors.length, 2);
  assert.ok(errors.every((e) => /Could not remove attachment file/.test(e)));
  files.clear();
});
