// Attachment storage on disk (docs/specs/attachments-and-pasted-images.md
// AC 1-3, 6, 18, 21). The only test that looks at the files directory
// itself; it uses a scratch FILES_DIR, never the real data/files/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-poc-storage-'));
const FILES = path.join(scratch, 'files');
process.env.FILES_DIR = FILES; // before the server modules load

const storage = require('../server/data/storage');
const { startServer, createProject, createItem } = require('./helpers');
const { MAX_FILE_BYTES } = require('../server/attachmentTypes');

const root = path.join(__dirname, '..');
const listFiles = () => fs.readdirSync(FILES).sort();
// Every file under the scratch area (to prove nothing lands outside FILES).
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

const readAll = async (stream) => {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
};

// ---------- the module (AC 1, 2) ----------

test('exports exactly put, open, remove and exists (AC 1)', () => {
  assert.deepEqual(Object.keys(storage).sort(), ['exists', 'open', 'put', 'remove']);
});

test('the directory exists from start-up (AC 3)', () => {
  assert.ok(fs.statSync(FILES).isDirectory());
});

test('put a buffer or a stream; open reads it back; remove deletes it (AC 1, 2)', async () => {
  const a = await storage.put(Buffer.from('buffer bytes'));
  assert.match(a.key, /^[0-9a-f]{32}$/);
  assert.equal(a.size, 12);
  assert.ok(fs.existsSync(path.join(FILES, a.key)), 'stored at <root>/<key>');
  assert.equal((await readAll(storage.open(a.key))).toString(), 'buffer bytes');

  const b = await storage.put(Readable.from([Buffer.from('str'), Buffer.from('eam')]));
  assert.equal(b.size, 6);
  assert.notEqual(a.key, b.key);
  assert.equal(storage.exists(b.key), true);

  await storage.remove(a.key);
  assert.equal(storage.exists(a.key), false);
  await storage.remove(a.key); // already gone: no error
  assert.throws(() => storage.open(a.key), (err) => err.status === 404);
  assert.ok(!listFiles().some((f) => f.startsWith('.tmp-')), 'no temporary files left');
});

test('keys that are not storage keys never reach the file system (AC 2)', async () => {
  for (const bad of ['../app.db', '..', '', 'abc', `${'a'.repeat(32)}/../x`, null, undefined, 42]) {
    assert.equal(storage.exists(bad), false, String(bad));
    assert.throws(() => storage.open(bad), (err) => err.status === 404);
    await storage.remove(bad); // no error, nothing removed
  }
  const outside = path.join(scratch, 'outside.txt');
  fs.writeFileSync(outside, 'keep me');
  await storage.remove('../outside.txt');
  assert.ok(fs.existsSync(outside));
});

test('a stream that fails part-way leaves no file (AC 6)', async () => {
  const before = listFiles();
  const failing = new Readable({
    read() {
      this.push(Buffer.alloc(1024));
      this.destroy(new Error('limit passed'));
    },
  });
  await assert.rejects(storage.put(failing), /limit passed/);
  assert.deepEqual(listFiles(), before);
});

// ---------- through the API (AC 2, 6, 18, 21) ----------

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('png')]);
const keyOf = (id) => app.db.prepare('SELECT storage_key FROM attachments WHERE id = ?').get(id).storage_key;

test('an oversized upload leaves no file on disk (AC 6)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const before = listFiles();
  // No Content-Length up front (a stream body), so the limit is hit while streaming.
  const body = Readable.from((function* chunks() {
    for (let i = 0; i < 11; i += 1) yield Buffer.alloc(1024 * 1024, 0x61);
  })());
  const res = await fetch(`${app.base}/api/issues/${item.id}/attachments`, {
    method: 'POST',
    headers: { Cookie: app.cookie, 'Content-Type': 'text/plain', 'X-Filename': 'big.txt' },
    body,
    duplex: 'half',
  }).catch((err) => ({ status: 'network error', err }));
  // The server may close the connection before the client finishes sending;
  // either way nothing may be stored.
  if (res.status !== 'network error') assert.equal(res.status, 413);
  assert.deepEqual(listFiles(), before);
  assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE issue_id = ?').get(item.id).n, 0);
  // The fixed-length case answers 413 before writing anything.
  const fixed = await app.upload(item.id, 'big.txt', Buffer.alloc(MAX_FILE_BYTES + 1));
  assert.equal(fixed.status, 413);
  assert.deepEqual(listFiles(), before);
});

test('rejected types, signatures and empty files leave no file on disk (AC 7, 8, 10)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const before = listFiles();
  assert.equal((await app.upload(item.id, 'x.svg', Buffer.from('<svg/>'))).status, 415);
  assert.equal((await app.upload(item.id, 'x.png', Buffer.from('not a png at all'))).status, 415);
  assert.equal((await app.upload(item.id, 'x.txt', Buffer.alloc(0))).status, 400);
  assert.deepEqual(listFiles(), before);
});

test('a traversal file name writes only inside the files directory (AC 2)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const before = new Set(walk(scratch));
  const res = await app.upload(item.id, '../../etc/passwd.txt', Buffer.from('x'));
  assert.equal(res.status, 201);
  const added = walk(scratch).filter((f) => !before.has(f));
  assert.deepEqual(added, [path.join(FILES, keyOf(res.body.id))]);
});

test('a failed database insert removes the stored file (AC 18)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const before = listFiles();
  app.db.exec("CREATE TEMP TRIGGER fail_attach BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT, 'insert failed'); END");
  try {
    const res = await app.upload(item.id, 'p.png', PNG);
    assert.equal(res.status, 500);
  } finally {
    app.db.exec('DROP TRIGGER fail_attach');
  }
  assert.deepEqual(listFiles(), before);
});

test('deleting a work item removes its files from disk (AC 21)', async () => {
  const item = await createItem(app, (await createProject(app)).id);
  const keys = [];
  for (let i = 0; i < 3; i += 1) keys.push(keyOf((await app.upload(item.id, `f${i}.png`, PNG)).body.id));
  keys.forEach((k) => assert.ok(listFiles().includes(k)));
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  const left = listFiles();
  keys.forEach((k) => assert.ok(!left.includes(k), k));
});

// ---------- git (AC 3) ----------

test('data/files/ is git-ignored and server/data/ is not (AC 3)', (t) => {
  const ignored = (p) => {
    try {
      execFileSync('git', ['check-ignore', '-q', p], { cwd: root, stdio: 'ignore' });
      return true;
    } catch (err) {
      if (err.code === 'ENOENT' || err.status === 128) return null; // no git, or not a repository
      return false;
    }
  };
  const files = ignored('data/files/x');
  if (files === null) return t.skip('git is not available');
  assert.equal(files, true, 'data/files/x is ignored');
  assert.equal(ignored('server/data/storage.js'), false, 'server/data/storage.js is tracked');
  assert.equal(ignored('server/data/attachments.js'), false, 'server/data/attachments.js is tracked');
});
