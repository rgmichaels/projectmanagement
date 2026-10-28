// "New project..." in the Project dropdown
// (docs/specs/new-project-from-dropdown.md; design
// docs/design/new-project-from-dropdown). Pure helpers from
// public/js/projectScope.js, source checks on the dialog, and the existing
// POST /api/projects behaviour the dialog relies on.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const scope = require('../public/js/projectScope');
const groups = require('../server/groups');
const usersData = require('../server/data/users');
const { PROJECT_STATUSES } = require('../server/projectStatuses');
const { startServer, uniqueKey } = require('./helpers');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('public/js/projectScope.js');

test('the entry is a sentinel that is never a project id (AC 3)', () => {
  assert.equal(scope.NEW_PROJECT_VALUE, '__new__');
  assert.equal(scope.isNewProjectValue('__new__'), true);
  for (const v of ['', '1', 'new', null, undefined]) assert.equal(scope.isNewProjectValue(v), false, String(v));
  assert.equal(scope.parseId(scope.NEW_PROJECT_VALUE), null);
  const projects = [{ id: 2 }, { id: 1 }];
  assert.deepEqual(scope.resolveProject(scope.NEW_PROJECT_VALUE, '1', projects), { source: 'invalid', id: null }, 'as ?project=');
  assert.deepEqual(scope.resolveProject(null, scope.NEW_PROJECT_VALUE, projects), { source: 'first', id: 2 }, 'as the remembered id');
});

test('success goes to the same page for the new id, other parameters dropped (AC 11)', () => {
  assert.equal(scope.pageUrl('/backlog.html', 7), '/backlog.html?project=7');
  assert.equal(scope.pageUrl('/sprints.html', 12), '/sprints.html?project=12');
});

const projects = [
  { id: 2, key: 'PM', name: 'Pipeline Tracker' },
  { id: 1, key: 'WEB', name: 'Website' },
  { id: 3, key: 'OLD', name: 'Old', archived: true },
];
const values = (opts) => opts.map((o) => o.value);

test('with manage-projects: projects first, then a disabled separator and the entry last (AC 1, 3)', () => {
  const opts = scope.selectOptions(projects, projects[0], true);
  assert.deepEqual(values(opts), ['2', '1', null, '__new__']);
  assert.deepEqual(opts.map((o) => o.label), ['PM - Pipeline Tracker', 'WEB - Website', '────────────', 'New project...']);
  assert.equal(opts[2].disabled, true, 'separator not selectable');
  assert.ok(!opts[3].disabled, 'entry is a normal option');
});

test('without manage-projects the options are exactly as before (AC 2)', () => {
  assert.deepEqual(values(scope.selectOptions(projects, projects[0], false)), ['2', '1']);
  assert.deepEqual(values(scope.selectOptions(projects, null, false)), ['', '2', '1']);
});

test('the archived-by-URL extra option stays before the separator (AC 3)', () => {
  assert.deepEqual(values(scope.selectOptions(projects, projects[2], true)), ['2', '1', '3', null, '__new__']);
  assert.equal(scope.selectOptions(projects, projects[2], true)[2].label, 'OLD - Old (archived)');
});

test('no current project: placeholder first, separator kept even with no projects (AC 14, 15, 16)', () => {
  const empty = scope.selectOptions([], null, true);
  assert.deepEqual(values(empty), ['', null, '__new__']);
  assert.equal(empty[0].label, 'Choose a project');
  assert.equal(empty[0].disabled, true);
  assert.deepEqual(values(scope.selectOptions(projects, null, true)), ['', '2', '1', null, '__new__']);
});

test('dropdown wiring: entry branches before parseId, dirty confirm first, cancel reverts (AC 10, 11, 17, 18)', () => {
  assert.match(source, /const canCreate = \(\) => session\.can\('manage-projects'\);/);
  assert.match(source, /selectOptions\(projects, current, canCreate\(\)\)/);
  assert.match(source, /if \(isNewProjectValue\(next\)\) \{\s*const created = \(await mayLeave\(\)\) \? await createProjectDialog\(\) : null;\s*if \(!created\) return revert\(\);\s*storageSet\(STORAGE_KEY, String\(created\.id\)\);\s*location\.assign\(pageUrl\(location\.pathname, created\.id\)\);/);
  assert.match(source, /const revert = \(\) => \{\s*select\.value = currentValue;\s*select\.focus\(\);/);
  // A switch stores only a parsed project id.
  assert.match(source, /const id = parseId\(next\);\s*if \(!id \|\| next === currentValue\) return;/);
});

test('the select is built in the no-project states for a user who may create (AC 14, 15, 16)', () => {
  assert.match(source, /if \(projects\.length \|\| canCreate\(\)\) buildSelect\(projects, null\);/);
  const none = source.slice(source.indexOf("if (choice.source === 'none')"));
  assert.match(none, /^if \(choice\.source === 'none'\) \{\s*placeholderSelect\(\);/);
  assert.equal((source.match(/placeholderSelect\(\);/g) || []).length, 3, 'invalid, none, and a failed project load');
});

test('the dialog: app-dialog shell, list-form fields, existing endpoints, text only (AC 5-9, 20)', () => {
  assert.match(source, /el\('dialog', \{ class: 'app-dialog', 'aria-labelledby': `create-project-\$\{n\}-heading` \}, form\)/);
  assert.match(source, /'Create project'/);
  assert.match(source, /el\('input', \{ name: 'name', maxlength: '80', required: true \}\)/);
  assert.match(source, /el\('input', \{ name: 'key', maxlength: '10', placeholder: 'PROJ', required: true, autocomplete: 'off' \}\)/);
  assert.match(source, /key\.value = key\.value\.toUpperCase\(\)/);
  assert.match(source, /api\.get\('\/api\/project-statuses'\)/);
  assert.match(source, /statuses\.find\(\(s\) => s\.isDefault\)/);
  assert.match(source, /api\.post\('\/api\/projects', \{ name: name\.value\.trim\(\), key: key\.value\.trim\(\), status: status\.value \|\| undefined \}\)/);
  assert.match(source, /error\.textContent = err\.message;/);
  assert.match(source, /el\('p', \{ class: 'error', role: 'alert' \}/);
  assert.match(source, /name\.focus\(\);/);
  // In flight: Create disabled as "Creating...", Cancel disabled, Escape ignored (owner decision).
  assert.match(source, /createBtn\.disabled = on;\s*cancelBtn\.disabled = on;\s*createBtn\.textContent = on \? 'Creating\.\.\.' : 'Create';/);
  assert.match(source, /dialog\.addEventListener\('cancel', \(e\) => \{ if \(busy\) e\.preventDefault\(\); \}\);/);
  assert.match(source, /if \(busy\) return;/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('pages without the dropdown are unchanged (AC 19)', () => {
  for (const file of ['public/index.html', 'public/users.html', 'public/login.html']) {
    assert.doesNotMatch(read(file), /projectScope\.js|New project\.\.\./, file);
  }
  assert.match(read('public/index.html'), /<form id="create-form" class="panel" hidden novalidate>/);
});

test('narrow dialogs use 14px side padding (design README)', () => {
  assert.match(read('public/css/app.css'), /@media \(max-width: 600px\) \{ dialog\.app-dialog \.band, dialog\.app-dialog \.dialog-body, dialog\.app-dialog \.dialog-foot \{ padding-left: 14px; padding-right: 14px; \} \}/);
});

// ---------- the server behaviour the dialog relies on (AC 8, 11, 13, 20) ----------

test('POST /api/projects: created in the chosen status, server messages, Viewer 403', async () => {
  const app = await startServer();
  try {
    const def = PROJECT_STATUSES.find((s) => s.isDefault).name;
    const key = uniqueKey();
    const created = await app.post('/api/projects', { name: 'From the dropdown', key, status: def });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, def);
    assert.equal(created.body.archived, false, 'a live project, so it is listed and selectable');
    const live = (await app.get('/api/projects')).body;
    assert.ok(live.some((p) => p.id === created.body.id));
    for (const s of PROJECT_STATUSES) {
      const res = await app.post('/api/projects', { name: `In ${s.name}`, key: uniqueKey(), status: s.name });
      assert.equal(res.status, 201, s.name);
      assert.equal(res.body.status, s.name);
    }
    // The new project starts empty.
    assert.deepEqual((await app.get(`/api/projects/${created.body.id}/issues`)).body, []);

    assert.equal((await app.post('/api/projects', { name: '', key: uniqueKey(), status: def })).body.error, 'Name is required and must be 1-80 characters.');
    assert.equal((await app.post('/api/projects', { name: 'X', key: 'W3B', status: def })).body.error, 'Key must be 2-10 uppercase letters (A-Z).');
    const dup = await app.post('/api/projects', { name: 'Copy', key, status: def });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, `Key ${key} is already used by another project.`);

    const users = (await app.get('/api/users')).body;
    const casey = users.find((u) => u.username === 'casey');
    usersData.setUserGroup(app.db, casey.id, groups.groupNames()[2]);
    const viewer = await app.client('casey');
    assert.equal((await viewer.get('/api/auth/me')).body.permissions.includes('manage-projects'), false, 'no entry for a Viewer');
    const before = app.db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
    const denied = await viewer.post('/api/projects', { name: 'Nope', key: uniqueKey(), status: def });
    assert.equal(denied.status, 403);
    assert.ok(denied.body.error, 'a message for the dialog');
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM projects').get().n, before);
  } finally {
    await app.close();
  }
});
