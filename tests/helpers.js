// Test helpers: run the app on a random port against a temporary database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-poc-test-'));
  return path.join(dir, 'app.db');
}

// Starts a server. Pass an existing dbPath to simulate a restart.
async function startServer(dbPath = tempDbPath()) {
  const db = openDb(dbPath);
  const server = await new Promise((resolve) => {
    const s = createApp(db).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    base,
    db,
    dbPath,
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}

let keyCounter = 0;
// Generates a unique valid project key (letters only).
function uniqueKey() {
  keyCounter += 1;
  let n = keyCounter;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `P${s}`.padEnd(2, 'X');
}

async function createProject(app, fields = {}) {
  const res = await app.post('/api/projects', { name: 'Test project', key: uniqueKey(), ...fields });
  if (res.status !== 201) throw new Error(`createProject failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createItem(app, projectId, fields = {}) {
  const res = await app.post(`/api/projects/${projectId}/issues`, { title: 'Work item', ...fields });
  if (res.status !== 201) throw new Error(`createItem failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = { startServer, tempDbPath, createProject, createItem, uniqueKey };
