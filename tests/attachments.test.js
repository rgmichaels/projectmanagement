// Attachments API (docs/specs/attachments-and-pasted-images.md AC 6-22, 39-41).
// Bytes go to the scratch FILES_DIR set by tests/helpers.js; presence of a
// stored file is checked through server/data/storage.js only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, createProject, createItem } = require('./helpers');
const storage = require('../server/data/storage');
const { attachmentField } = require('../server/historyFields');
const { PROJECT_STATUSES, isArchivableStatus } = require('../server/projectStatuses');
const { ATTACHMENT_TYPES, MAX_FILE_BYTES, MAX_ATTACHMENTS_PER_ITEM } = require('../server/attachmentTypes');

let app;
test.before(async () => { app = await startServer(); });
test.after(async () => { await app.close(); });

const FIELD = attachmentField().key;

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('rest of a png')]);
const JPEG = Buffer.concat([Buffer.from('ffd8ffe0', 'hex'), Buffer.from('jpeg body')]);
const GIF = Buffer.from('GIF89a and some pixels');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 data')]);
const TEXT = Buffer.from('hello, world\n');

const keyOf = (id) => app.db.prepare('SELECT storage_key FROM attachments WHERE id = ?').get(id).storage_key;
const rowCount = (issueId) => app.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE issue_id = ?').get(issueId).n;
const eventCount = (issueId) => app.db.prepare('SELECT COUNT(*) AS n FROM issue_history_events WHERE issue_id = ?').get(issueId).n;
const allKeys = () => app.db.prepare('SELECT storage_key FROM attachments').all().map((r) => r.storage_key);

async function newItem() {
  const project = await createProject(app);
  const item = await createItem(app, project.id);
  return { project, item };
}

async function upload(item, filename, bytes, client = app, type) {
  return client.upload(item.id, filename, bytes, type);
}

async function archive(project) {
  const status = PROJECT_STATUSES.map((s) => s.name).find(isArchivableStatus);
  assert.equal((await app.patch(`/api/projects/${project.id}`, { status })).status, 200);
  assert.equal((await app.patch(`/api/projects/${project.id}`, { archived: true })).status, 200);
}

// ---------- upload, list, download, preview (AC 12-15, 19) ----------

test('upload returns 201 with the attachment; the uploader is the signed-in user (AC 12)', async () => {
  const { item } = await newItem();
  const res = await app.request('POST', `/api/issues/${item.id}/attachments`, TEXT, {
    'Content-Type': 'text/plain',
    'X-Filename': encodeURIComponent('notes.txt'),
    'X-Uploader-Id': '999',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body).sort(), [
    'created_at', 'filename', 'id', 'inline', 'issue_id', 'mime_type', 'size_bytes', 'uploader_id', 'uploader_name',
  ]);
  assert.equal(res.body.issue_id, item.id);
  assert.equal(res.body.filename, 'notes.txt');
  assert.equal(res.body.mime_type, 'text/plain');
  assert.equal(res.body.size_bytes, TEXT.length);
  assert.equal(res.body.inline, false);
  const alex = app.db.prepare("SELECT id, name FROM users WHERE username = 'alex'").get();
  assert.equal(res.body.uploader_id, alex.id);
  assert.equal(res.body.uploader_name, alex.name);
  assert.ok(!Number.isNaN(Date.parse(res.body.created_at)));
  assert.ok(storage.exists(keyOf(res.body.id)));
});

test('unknown work item 404; signed out 401 (AC 12)', async () => {
  const res = await app.upload(999999, 'a.txt', TEXT);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Work item not found.');
  const { item } = await newItem();
  const anon = await app.raw('POST', `/api/issues/${item.id}/attachments`, TEXT, { 'X-Filename': 'a.txt', 'Content-Type': 'text/plain' });
  assert.equal(anon.status, 401);
  assert.equal(rowCount(item.id), 0);
  for (const url of [`/api/issues/${item.id}/attachments`, '/api/attachments/1/download', '/api/attachments/1/preview', '/api/attachment-types']) {
    assert.equal((await app.raw('GET', url)).status, 401, url);
  }
  assert.equal((await app.raw('DELETE', '/api/attachments/1')).status, 401);
});

test('a missing file name is refused (AC 12)', async () => {
  const { item } = await newItem();
  const res = await app.request('POST', `/api/issues/${item.id}/attachments`, TEXT, { 'Content-Type': 'text/plain' });
  assert.equal(res.status, 400);
  assert.equal(rowCount(item.id), 0);
});

test('list is newest first and includes every upload (AC 13)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'a.txt', TEXT)).body;
  const b = (await upload(item, 'b.png', PNG, app, 'image/png')).body;
  const res = await app.get(`/api/issues/${item.id}/attachments`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((x) => x.id), [b.id, a.id]);
  assert.equal(res.body[0].inline, true);
  assert.ok(!('storage_key' in res.body[0]), 'the storage key is never exposed');
  assert.equal((await app.get('/api/issues/999999/attachments')).status, 404);
});

test('download streams the bytes with attachment disposition and nosniff (AC 14)', async () => {
  const { item } = await newItem();
  const name = 'Résumé (final) 100%.txt';
  const a = (await upload(item, name, TEXT)).body;
  assert.equal(a.filename, name);
  const res = await fetch(`${app.base}/api/attachments/${a.id}/download`, { headers: { Cookie: app.cookie } });
  assert.equal(res.status, 200);
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), TEXT.toString());
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const disposition = res.headers.get('content-disposition');
  assert.match(disposition, /^attachment; filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(disposition.split("''")[1]), name);
  const missing = await app.get('/api/attachments/999999/download');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'Attachment not found.');
  assert.equal((await app.get('/api/attachments/abc/download')).status, 404);
});

test('preview: inline for images, 415 otherwise (AC 15)', async () => {
  const { item } = await newItem();
  const img = (await upload(item, 'shot.png', PNG, app, 'image/png')).body;
  const doc = (await upload(item, 'spec.pdf', Buffer.from('%PDF-1.4 ...'), app, 'application/pdf')).body;
  const res = await fetch(`${app.base}/api/attachments/${img.id}/preview`, { headers: { Cookie: app.cookie } });
  assert.equal(res.status, 200);
  assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG));
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('content-disposition'), /^inline; filename\*=UTF-8''shot\.png$/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await app.get(`/api/attachments/${doc.id}/preview`)).status, 415);
  assert.equal((await app.get('/api/attachments/999999/preview')).status, 404);
});

test('the stored MIME type comes from the type list, not the request (AC 7, 14)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'page.txt', Buffer.from('<script>alert(1)</script>'), app, 'text/html')).body;
  assert.equal(a.mime_type, 'text/plain');
});

test('any signed-in user can upload to, list and download from any work item (AC 19)', async () => {
  const { item } = await newItem();
  const blake = await app.client('blake');
  const a = await upload(item, 'from-blake.txt', TEXT, blake);
  assert.equal(a.status, 201);
  assert.equal(a.body.uploader_name, app.db.prepare("SELECT name FROM users WHERE username = 'blake'").get().name);
  assert.equal((await app.get(`/api/attachments/${a.body.id}/download`)).status, 200);
  assert.equal((await blake.get(`/api/issues/${item.id}/attachments`)).body.length, 1);
});

test('a path-like file name is only a display name (AC 2)', async () => {
  const { item } = await newItem();
  const res = await upload(item, '../../etc/passwd.txt', TEXT);
  assert.equal(res.status, 201);
  assert.equal(res.body.filename, '....etcpasswd.txt');
  const key = keyOf(res.body.id);
  assert.match(key, /^[0-9a-f]{32}$/, 'random key, no user input, no extension');
  const back = (name) => upload(item, name, TEXT);
  assert.equal((await back('..\\..\\win.ini.txt')).body.filename, '....win.ini.txt');
  assert.equal((await back('tab\there\u0000.txt')).body.filename, 'tabhere.txt');
  const long = `${'x'.repeat(300)}.txt`;
  const cut = (await back(long)).body.filename;
  assert.equal(cut.length, 200);
  assert.ok(cut.endsWith('.txt'));
});

test('GET /api/attachment-types returns the list and limits (AC 11)', async () => {
  const res = await app.get('/api/attachment-types');
  assert.equal(res.status, 200);
  assert.equal(res.body.max_bytes, MAX_FILE_BYTES);
  assert.equal(res.body.max_bytes, 10485760);
  assert.equal(res.body.max_per_item, 25);
  assert.deepEqual(res.body.types, ATTACHMENT_TYPES.map(({ extension, mime, inline }) => ({ extension, mime, inline })));
  const exts = res.body.types.map((t) => t.extension);
  for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md', 'csv', 'log', 'docx', 'xlsx', 'pptx', 'zip']) {
    assert.ok(exts.includes(e), e);
  }
  for (const e of ['svg', 'html', 'htm', 'js', 'exe']) assert.ok(!exts.includes(e), e);
  assert.deepEqual(res.body.types.filter((t) => t.inline).map((t) => t.extension), ['png', 'jpg', 'jpeg', 'gif', 'webp']);
});

// ---------- limits and types (AC 6-10, 41) ----------

test('a file over 10 MB is refused with 413 and stores nothing (AC 6, 41)', async () => {
  const { item } = await newItem();
  const keys = allKeys();
  const events = eventCount(item.id);
  const res = await upload(item, 'big.txt', Buffer.alloc(MAX_FILE_BYTES + 1, 0x61));
  assert.equal(res.status, 413);
  assert.equal(res.body.error, 'File is too large (max 10 MB).');
  assert.equal(rowCount(item.id), 0);
  assert.deepEqual(allKeys(), keys);
  assert.equal(eventCount(item.id), events, 'no history');
  // The server still works on the next request.
  assert.equal((await upload(item, 'ok.txt', TEXT)).status, 201);
});

test('a file of exactly 10 MB is accepted (AC 6)', async () => {
  const { item } = await newItem();
  const res = await upload(item, 'max.txt', Buffer.alloc(MAX_FILE_BYTES, 0x61));
  assert.equal(res.status, 201);
  assert.equal(res.body.size_bytes, MAX_FILE_BYTES);
});

test('disallowed types return 415 and store nothing (AC 7)', async () => {
  const { item } = await newItem();
  for (const name of ['logo.svg', 'page.html', 'page.htm', 'app.js', 'setup.exe', 'run.sh', 'noextension', 'archive.tar.gz']) {
    const res = await upload(item, name, TEXT);
    assert.equal(res.status, 415, name);
    assert.equal(res.body.error, 'That file type is not allowed.');
  }
  assert.equal(rowCount(item.id), 0);
  // Extensions are case-insensitive.
  assert.equal((await upload(item, 'SHOT.PNG', PNG)).status, 201);
});

test('an image whose bytes do not match its type returns 415 (AC 8)', async () => {
  const { item } = await newItem();
  const events = eventCount(item.id);
  for (const [name, bytes] of [['fake.png', TEXT], ['fake.jpg', PNG], ['fake.gif', JPEG], ['fake.webp', Buffer.from('RIFF0000WAVEfmt ')], ['tiny.png', Buffer.from([0x89])]]) {
    const res = await upload(item, name, bytes);
    assert.equal(res.status, 415, name);
    assert.equal(res.body.error, 'That file type is not allowed.');
  }
  assert.equal(rowCount(item.id), 0);
  assert.equal(eventCount(item.id), events);
  for (const [name, bytes] of [['a.png', PNG], ['a.jpg', JPEG], ['a.jpeg', JPEG], ['a.gif', GIF], ['a.webp', WEBP], ['b.gif', Buffer.from('GIF87a....')]]) {
    const res = await upload(item, name, bytes);
    assert.equal(res.status, 201, name);
    assert.equal(res.body.inline, true);
  }
});

test('a zero-byte upload returns 400 (AC 10)', async () => {
  const { item } = await newItem();
  for (const name of ['empty.txt', 'empty.png']) {
    const res = await upload(item, name, Buffer.alloc(0));
    assert.equal(res.status, 400, name);
    assert.equal(res.body.error, 'File is empty.');
  }
  assert.equal(rowCount(item.id), 0);
});

test('the 26th attachment returns 409 (AC 9)', async () => {
  const { item } = await newItem();
  for (let i = 0; i < MAX_ATTACHMENTS_PER_ITEM; i += 1) {
    assert.equal((await upload(item, `f${i}.txt`, TEXT)).status, 201);
  }
  const res = await upload(item, 'one-too-many.txt', TEXT);
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'This work item already has 25 attachments.');
  assert.equal(rowCount(item.id), 25);
  // Concurrent uploads past the limit are refused too.
  const { item: other } = await newItem();
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => upload(other, `c${i}.txt`, TEXT)));
  assert.equal(results.filter((r) => r.status === 201).length, 25);
  assert.ok(results.every((r) => r.status === 201 || r.status === 409));
  assert.equal(rowCount(other.id), 25);
});

// ---------- delete and permissions (AC 16, 17, 20) ----------

test('the uploader deletes: 204, row and file gone (AC 16)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'gone.txt', TEXT)).body;
  const key = keyOf(a.id);
  assert.equal((await app.del(`/api/attachments/${a.id}`)).status, 204);
  assert.equal(rowCount(item.id), 0);
  assert.equal(storage.exists(key), false);
  assert.equal((await app.get(`/api/attachments/${a.id}/download`)).status, 404);
  assert.equal((await app.del(`/api/attachments/${a.id}`)).status, 404);
  assert.equal((await app.del('/api/attachments/999999')).status, 404);
});

test('only the uploader may delete; others get 403 and the file stays (AC 20)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'mine.txt', TEXT)).body;
  const blake = await app.client('blake');
  const res = await blake.del(`/api/attachments/${a.id}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'You can only delete your own attachments.');
  assert.equal(rowCount(item.id), 1);
  assert.ok(storage.exists(keyOf(a.id)));
});

test('archived project: upload and delete 409, reads still work; order 404, 403, 409 (AC 17, 27)', async () => {
  const { project, item } = await newItem();
  const a = (await upload(item, 'kept.png', PNG)).body;
  await archive(project);
  const up = await upload(item, 'late.txt', TEXT);
  assert.equal(up.status, 409);
  assert.equal(up.body.error, 'This project is archived; its work items are read-only.');
  const del = await app.del(`/api/attachments/${a.id}`);
  assert.equal(del.status, 409);
  assert.equal(del.body.error, 'This project is archived; its work items are read-only.');
  const blake = await app.client('blake');
  assert.equal((await blake.del(`/api/attachments/${a.id}`)).status, 403, '403 before 409');
  assert.equal((await app.del('/api/attachments/999999')).status, 404);
  assert.equal(rowCount(item.id), 1);
  assert.equal((await app.get(`/api/issues/${item.id}/attachments`)).body.length, 1);
  assert.equal((await app.get(`/api/attachments/${a.id}/download`)).status, 200);
  assert.equal((await app.get(`/api/attachments/${a.id}/preview`)).status, 200);
});

// ---------- deleting a work item (AC 21, 22, 41) ----------

test('deleting a work item removes its attachment rows and files (AC 21, 41)', async () => {
  const { project, item } = await newItem();
  const keep = await createItem(app, project.id);
  const ids = [];
  for (const [n, b] of [['a.txt', TEXT], ['b.png', PNG], ['c.gif', GIF]]) ids.push((await upload(item, n, b)).body.id);
  const other = (await upload(keep, 'other.txt', TEXT)).body;
  const keys = ids.map(keyOf);
  keys.forEach((k) => assert.ok(storage.exists(k)));
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  keys.forEach((k) => assert.equal(storage.exists(k), false, k));
  for (const id of ids) assert.equal((await app.get(`/api/attachments/${id}/download`)).status, 404);
  assert.equal(rowCount(item.id), 0);
  assert.equal(eventCount(item.id), 0, 'no attachment history remains');
  // Another item's attachment is untouched.
  assert.ok(storage.exists(keyOf(other.id)));
});

test('deleting a work item with no attachments behaves as before (AC 22)', async () => {
  const { item } = await newItem();
  assert.equal((await app.del(`/api/issues/${item.id}`)).status, 204);
  assert.equal((await app.get(`/api/issues/${item.id}`)).status, 404);
});

// ---------- history (AC 39-42) ----------

test('adding and removing write attachment history with the actor (AC 39, 40, 42)', async () => {
  const { item } = await newItem();
  const blake = await app.client('blake');
  const blakeName = app.db.prepare("SELECT name FROM users WHERE username = 'blake'").get().name;
  const a = (await upload(item, 'report.pdf', Buffer.from('%PDF'), blake)).body;
  let [latest] = (await app.get(`/api/issues/${item.id}/history`)).body.events;
  assert.equal(latest.actor_name, blakeName);
  assert.deepEqual(latest.changes, [
    { field: FIELD, label: attachmentField().label, kind: 'file', old: null, new: 'report.pdf', old_id: null, new_id: null },
  ]);
  assert.equal((await blake.del(`/api/attachments/${a.id}`)).status, 204);
  [latest] = (await app.get(`/api/issues/${item.id}/history`)).body.events;
  assert.equal(latest.actor_name, blakeName);
  assert.deepEqual(latest.changes.map((c) => [c.field, c.old, c.new]), [[FIELD, 'report.pdf', null]]);
  // The field filter works for attachments.
  const filtered = (await app.get(`/api/issues/${item.id}/history?field=${FIELD}`)).body.events;
  assert.equal(filtered.length, 2);
  assert.ok((await app.get('/api/history-fields')).body.some((f) => f.key === FIELD));
});

test('the attachment row and its history commit together (AC 39)', async () => {
  const { item } = await newItem();
  app.db.exec(`CREATE TEMP TRIGGER fail_history BEFORE INSERT ON issue_history_events
    WHEN NEW.issue_id = ${item.id} BEGIN SELECT RAISE(ABORT, 'history failed'); END`);
  try {
    const keys = allKeys();
    const res = await upload(item, 'x.txt', TEXT);
    assert.equal(res.status, 500);
    assert.equal(rowCount(item.id), 0);
    assert.deepEqual(allKeys(), keys);
  } finally {
    app.db.exec('DROP TRIGGER fail_history');
  }
});

test('a rejected delete writes no history (AC 41)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'y.txt', TEXT)).body;
  const events = eventCount(item.id);
  const blake = await app.client('blake');
  assert.equal((await blake.del(`/api/attachments/${a.id}`)).status, 403);
  assert.equal(eventCount(item.id), events);
});

test('one attachment\'s details (used for image tokens)', async () => {
  const { item } = await newItem();
  const a = (await upload(item, 'p.png', PNG)).body;
  const res = await app.get(`/api/attachments/${a.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, a);
  assert.equal((await app.get('/api/attachments/999999')).status, 404);
});
