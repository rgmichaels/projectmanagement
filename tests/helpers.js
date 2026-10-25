// Test helpers: run the app on a random port against a temporary database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Attachment bytes go to a scratch directory, never the real data/files/.
// Set before the server modules load; a test file may set its own first.
if (!process.env.FILES_DIR) {
  process.env.FILES_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-poc-files-')), 'files');
}

const { openDb } = require('../server/db');
const { createApp } = require('../server/app');

function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-poc-test-'));
  return path.join(dir, 'app.db');
}

// The first seeded user; the default client is signed in as them.
const DEFAULT_USERNAME = 'alex';

// One HTTP call. Bodies are parsed as JSON when the response is JSON and
// returned as text otherwise; redirects are not followed.
// A Buffer body is sent as is (an upload; set Content-Type in headers).
async function send(base, method, url, body, headers = {}) {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(base + url, {
    method,
    redirect: 'manual',
    headers: body === undefined || raw ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  return {
    status: res.status,
    headers: res.headers,
    setCookies: res.headers.getSetCookie(),
    body: text ? (isJson ? JSON.parse(text) : text) : null,
  };
}

// A client with its own cookie jar (the pm_session cookie only), like one
// browser. Signed out until login() is called.
function makeClient(base) {
  let cookie = null; // "pm_session=<token>" or null
  async function request(method, url, body, headers = {}) {
    const res = await send(base, method, url, body, cookie ? { ...headers, Cookie: cookie } : headers);
    for (const c of res.setCookies) {
      const [pair, ...attrs] = c.split(';');
      const [name, value] = pair.split('=');
      if (name.trim() !== 'pm_session') continue;
      const cleared = !value || attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      cookie = cleared ? null : `pm_session=${value}`;
    }
    return res;
  }
  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),
    // Uploads `bytes` (a Buffer) as an attachment of work item `issueId`.
    upload: (issueId, filename, bytes, contentType = 'application/octet-stream') =>
      request('POST', `/api/issues/${issueId}/attachments`, bytes, {
        'Content-Type': contentType,
        'X-Filename': encodeURIComponent(filename),
      }),
    // Sends any method with this client's cookie.
    request,
    async login(username) {
      const res = await request('POST', '/api/auth/login', { username });
      if (res.status !== 200) throw new Error(`login ${username} failed: ${JSON.stringify(res.body)}`);
      return res.body;
    },
    logout: () => request('POST', '/api/auth/logout'),
    get cookie() { return cookie; },
    set cookie(value) { cookie = value; },
  };
}

// Starts a server. Pass an existing dbPath to simulate a restart. The
// returned app is a client signed in as `alex`; app.client() makes another,
// independent one (signed in when given a username) and app.raw sends a
// request with no cookie at all.
async function startServer(dbPath = tempDbPath()) {
  const db = openDb(dbPath);
  const server = await new Promise((resolve) => {
    const s = createApp(db).listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function client(username) {
    const c = makeClient(base);
    if (username) await c.login(username);
    return c;
  }

  const app = makeClient(base);
  await app.login(DEFAULT_USERNAME);
  return Object.assign(app, {
    base,
    db,
    dbPath,
    client,
    raw: (method, url, body, headers) => send(base, method, url, body, headers),
    async close() {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  });
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

module.exports = { startServer, tempDbPath, createProject, createItem, uniqueKey, DEFAULT_USERNAME };
