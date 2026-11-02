// Shared project scope (docs/specs/global-project-scope.md; design
// docs/design/sprints-and-project-scope, topbar option A). The URL's
// ?project=<id> is the source of truth for a page view; the last live project
// is remembered per browser under one localStorage key. On a project-scoped
// page this file builds the "Project" dropdown in the top bar (with a
// "New project..." entry and its create dialog for users who may create
// projects; docs/specs/new-project-from-dropdown.md), points the
// sub-navigation at the current project, draws the "No active projects." and
// "Project not found." states, and owns the one confirm helper the work item
// dialog shares (js/board.js sets `guard`). Pure helpers load from node:test.
// Only this file reads ?project= and the storage key.
const projectScope = (() => {
  const STORAGE_KEY = 'pm.project';
  // localStorage may be missing or throw (private mode, blocked storage);
  // the app then works with the URL alone.
  const storageGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const storageSet = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* Storage is optional. */ } };

  // A positive safe integer written as plain digits, or null.
  const parseId = (value) => typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

  // The raw ?project= value of a query string, or null when it is absent.
  function parseProjectParam(search) {
    const params = new URLSearchParams(search || '');
    return params.has('project') ? params.get('project') : null;
  }

  // Which project a page shows (Scope AC 9, 10). `urlRaw` is the raw
  // ?project= value (null when absent), `remembered` the stored id text and
  // `projects` the live list of GET /api/projects in server order.
  // { source: 'url', id } - the URL names a well-formed id (the page still
  //   loads it; a 404 is "Project not found."; archived ones open read-only);
  // { source: 'invalid' } - the URL value is not a positive integer;
  // { source: 'remembered' | 'first', id } - no ?project=;
  // { source: 'none' } - no ?project= and no live project.
  function resolveProject(urlRaw, remembered, projects) {
    if (urlRaw !== null && urlRaw !== undefined) {
      const id = parseId(urlRaw);
      return id ? { source: 'url', id } : { source: 'invalid', id: null };
    }
    const live = (projects || []).filter((p) => !p.archived);
    const rememberedId = parseId(remembered);
    const kept = live.find((p) => p.id === rememberedId);
    if (kept) return { source: 'remembered', id: kept.id };
    if (live.length) return { source: 'first', id: live[0].id };
    return { source: 'none', id: null };
  }

  const optionLabel = (p) => `${p.key} - ${p.name}${p.archived ? ' (archived)' : ''}`;

  // The "New project..." entry (docs/specs/new-project-from-dropdown.md;
  // design docs/design/new-project-from-dropdown). Its value is a sentinel
  // that parseId rejects, so it is never a project id, never stored.
  const NEW_PROJECT_VALUE = '__new__';
  const isNewProjectValue = (value) => value === NEW_PROJECT_VALUE;

  // The dropdown's options in order, pure: the placeholder when there is no
  // current project, the live projects in server order, an archived current
  // project as the extra last one (Scope AC 3a), then, only for a user who
  // may create projects, a disabled separator and the entry (New AC 1-3).
  function selectOptions(projects, current, canCreate) {
    const options = [];
    if (!current) options.push({ value: '', label: 'Choose a project', disabled: true, hidden: true });
    const choices = (projects || []).filter((p) => !p.archived);
    if (current && !choices.some((p) => p.id === current.id)) choices.push(current);
    for (const p of choices) options.push({ value: String(p.id), label: optionLabel(p) });
    if (canCreate) {
      options.push({ value: null, label: '────────────', disabled: true });
      options.push({ value: NEW_PROJECT_VALUE, label: 'New project...' });
    }
    return options;
  }
  // The same page for another project; every other query parameter is dropped.
  const pageUrl = (file, id) => `${file}?project=${encodeURIComponent(id)}`;

  // The work item dialog's dirty check (Scope AC 14a), pure: `loaded` and
  // `current` are the saved-item field values when the dialog was filled and
  // now; `drafts` holds an unposted comment and an open message edit.
  function detailDirty(loaded, current, drafts = {}) {
    if (!loaded || !current) return false;
    const same = (a, b) => (a === undefined ? null : a) === (b === undefined ? null : b);
    const keys = new Set([...Object.keys(loaded), ...Object.keys(current)]);
    for (const k of keys) if (!same(loaded[k], current[k])) return true;
    if (typeof drafts.comment === 'string' && drafts.comment.trim()) return true;
    if (typeof drafts.edit === 'string' && drafts.edit !== drafts.editOriginal) return true;
    return false;
  }

  // The two confirms (design states.html X3, X4; wording from the design).
  const SWITCH_CONFIRM = {
    title: 'Switch project?',
    body: 'You have unsaved changes to this work item. Switch project and discard them?',
    ok: 'Discard and switch',
  };
  const DISCARD_CONFIRM = {
    title: 'Discard changes?',
    body: 'Your unsaved changes to this work item will be lost.',
    ok: 'Discard changes',
  };

  const result = {
    STORAGE_KEY,
    storageGet,
    storageSet,
    parseId,
    parseProjectParam,
    resolveProject,
    optionLabel,
    NEW_PROJECT_VALUE,
    isNewProjectValue,
    selectOptions,
    pageUrl,
    detailDirty,
    SWITCH_CONFIRM,
    DISCARD_CONFIRM,
    // Set by js/board.js on pages with the work item dialog.
    guard: { isDirty: () => false, discard: () => {} },
  };
  if (typeof document === 'undefined') return result;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  // The one confirm helper (Scope AC 14, 14c-14f): an app dialog over
  // whatever is open, Cancel focused, Escape is Cancel. Resolves true for OK.
  let confirmSeq = 0;
  function confirmDialog({ title, body, ok }) {
    const n = ++confirmSeq;
    const cancelBtn = el('button', { type: 'button' }, 'Cancel');
    const okBtn = el('button', { type: 'button', class: 'danger' }, ok);
    const dialog = el(
      'dialog',
      { class: 'app-dialog', 'aria-labelledby': `confirm-${n}-heading`, 'aria-describedby': `confirm-${n}-body` },
      el('div', { class: 'band' }, el('h2', { id: `confirm-${n}-heading` }, title)),
      el('div', { class: 'dialog-body' }, el('p', { id: `confirm-${n}-body` }, body)),
      el('div', { class: 'dialog-foot' }, cancelBtn, okBtn)
    );
    if (typeof dialog.showModal !== 'function') return Promise.resolve(window.confirm(`${title} ${body}`));
    return new Promise((resolve) => {
      cancelBtn.addEventListener('click', () => dialog.close('cancel'));
      okBtn.addEventListener('click', () => dialog.close('ok'));
      // Escape is this dialog's Cancel and never reaches a dialog below it
      // (Chromium can otherwise treat both as one close request).
      dialog.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        dialog.close('cancel');
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(dialog.returnValue === 'ok');
      });
      document.body.append(dialog);
      dialog.showModal();
      cancelBtn.focus();
    });
  }
  result.confirmDialog = confirmDialog;

  const main = () => document.querySelector('main');
  const hide = (node) => { node.style.display = 'none'; };

  // "No active projects." (no dropdown, nothing else) or "Project not found."
  // (the page title stays); neither has the sub-navigation (design T6, T7).
  function showState(text, kind) {
    const page = main();
    if (!page) return;
    for (const child of page.children) {
      if (kind === 'not-found' && child.classList.contains('toolbar')) {
        for (const part of child.children) if (part.tagName !== 'H1') hide(part);
      } else {
        hide(child);
      }
    }
    const line = el('p', { style: 'margin:0 0 8px' }, el('strong', {}, text));
    if (kind === 'not-found') line.setAttribute('role', 'alert');
    page.append(
      el('div', { class: 'empty', id: 'project-scope-state', role: kind === 'not-found' ? undefined : 'status' }, line, el('a', { href: '/' }, 'Go to the Projects page'))
    );
  }

  // The list request failed: the page keeps working (Scope AC 6).
  function showListError(text) {
    const page = main();
    if (!page) return;
    const box = el('div', { class: 'message', id: 'project-scope-message', role: 'alert' }, text);
    const nav = page.querySelector('.subnav');
    const toolbar = page.querySelector('.toolbar');
    const anchor = toolbar || nav;
    if (anchor) anchor.after(box);
    else page.prepend(box);
  }

  // Sub-navigation links carry the current project (Scope AC 13).
  function pointNav(id) {
    for (const link of document.querySelectorAll('.subnav a')) {
      const file = (link.getAttribute('href') || '').split('?')[0];
      if (file) link.href = pageUrl(file, id);
    }
  }

  const canCreate = () => session.can('manage-projects');

  // "Create project" (New AC 5-9, 20): the Projects list create form's
  // fields in the app dialog shell, built here because the project pages do
  // not load projects.js. Resolves to the created project, or null when it
  // closes without creating. While the request runs, Create reads
  // "Creating...", and Cancel and Escape do nothing (owner decision), so a
  // project is never created behind a closed dialog.
  let createSeq = 0;
  async function createProjectDialog() {
    const n = ++createSeq;
    let statuses = [];
    let loadError = '';
    try {
      statuses = await api.get('/api/project-statuses');
    } catch (err) {
      loadError = err.message; // the server then uses its default status
    }
    const name = el('input', { name: 'name', maxlength: '80', required: true });
    const key = el('input', { name: 'key', maxlength: '10', placeholder: 'PROJ', required: true, autocomplete: 'off' });
    const status = el('select', { name: 'status' }, ...statuses.map((s) => el('option', { value: s.name }, s.name)));
    const def = statuses.find((s) => s.isDefault) || statuses[0];
    if (def) status.value = def.name;
    const error = el('p', { class: 'error', role: 'alert' }, loadError);
    const cancelBtn = el('button', { type: 'button' }, 'Cancel');
    const createBtn = el('button', { type: 'submit', class: 'primary' }, 'Create');
    const form = el(
      'form',
      { novalidate: true },
      el('div', { class: 'band' }, el('h2', { id: `create-project-${n}-heading` }, 'Create project')),
      el('div', { class: 'dialog-body' }, el('label', {}, 'Name ', name), el('label', {}, 'Key ', key), el('label', {}, 'Status ', status)),
      el('div', { class: 'dialog-foot' }, error, cancelBtn, createBtn)
    );
    const dialog = el('dialog', { class: 'app-dialog', 'aria-labelledby': `create-project-${n}-heading` }, form);
    if (typeof dialog.showModal !== 'function') return null;
    key.addEventListener('input', () => { key.value = key.value.toUpperCase(); });
    return new Promise((resolve) => {
      let busy = false;
      let created = null;
      const setBusy = (on) => {
        busy = on;
        createBtn.disabled = on;
        cancelBtn.disabled = on;
        createBtn.textContent = on ? 'Creating...' : 'Create';
        if (on) dialog.setAttribute('aria-busy', 'true');
        else dialog.removeAttribute('aria-busy');
      };
      cancelBtn.addEventListener('click', () => { if (!busy) dialog.close(); });
      dialog.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
      dialog.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !busy) return;
        e.preventDefault();
        e.stopPropagation();
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); // stay open until the create succeeds
        if (busy) return;
        error.textContent = '';
        setBusy(true);
        try {
          created = await api.post('/api/projects', { name: name.value.trim(), key: key.value.trim(), status: status.value || undefined });
        } catch (err) {
          error.textContent = err.message; // the server's text, as returned
          setBusy(false);
          return;
        }
        busy = false;
        dialog.close();
      });
      dialog.addEventListener('close', () => {
        dialog.remove();
        resolve(created);
      });
      document.body.append(dialog);
      dialog.showModal();
      name.focus();
    });
  }

  function buildSelect(projects, current) {
    const select = el('select', { id: 'project-select', class: 'project-select' });
    for (const o of selectOptions(projects, current, canCreate())) {
      select.append(el('option', { value: o.value, disabled: o.disabled, hidden: o.hidden }, o.label));
    }
    const currentValue = current ? String(current.id) : '';
    select.value = currentValue;
    const revert = () => {
      select.value = currentValue;
      select.focus();
    };
    // Unsaved work item edits ask first (Scope AC 14; New AC 17).
    async function mayLeave() {
      if (result.guard.isDirty()) {
        const ok = await confirmDialog(SWITCH_CONFIRM);
        if (!ok) return false;
        result.guard.discard();
      }
      return true;
    }
    select.addEventListener('change', async () => {
      const next = select.value;
      if (isNewProjectValue(next)) {
        const created = (await mayLeave()) ? await createProjectDialog() : null;
        if (!created) return revert();
        storageSet(STORAGE_KEY, String(created.id));
        location.assign(pageUrl(location.pathname, created.id));
        return;
      }
      const id = parseId(next);
      if (!id || next === currentValue) return;
      if (!(await mayLeave())) return revert();
      storageSet(STORAGE_KEY, next); // only live projects can be picked
      location.assign(pageUrl(location.pathname, id));
    });
    const box = el('div', { class: 'project-scope' }, el('label', { for: 'project-select' }, 'Project'), select);
    const brand = document.querySelector('.topbar .brand');
    if (brand) brand.after(box);
    return select;
  }

  // Resolves to the current project ({ id, key, name, archived, ... }) or to
  // null when the page has no project to show (its state is already drawn).
  result.ready = (async () => {
    await session.ready;
    const urlRaw = parseProjectParam(location.search);
    let projects = [];
    let listError = null;
    try {
      projects = await api.get('/api/projects');
    } catch (err) {
      listError = err;
    }
    const choice = resolveProject(urlRaw, storageGet(STORAGE_KEY), projects);
    let current = null;
    // With no current project the dropdown is still built when it has
    // something to offer: projects, or "New project..." (New AC 14-16).
    const placeholderSelect = () => {
      if (projects.length || canCreate()) buildSelect(projects, null);
    };
    if (choice.source === 'invalid') {
      placeholderSelect();
      showState('Project not found.', 'not-found');
      return null;
    }
    if (choice.source === 'none') {
      placeholderSelect();
      if (listError) showState(`Could not load the project list: ${listError.message}`, 'not-found');
      else showState('No active projects.', 'none');
      return null;
    }
    if (choice.source === 'url') {
      try {
        current = await api.get(`/api/projects/${choice.id}`);
      } catch (err) {
        placeholderSelect();
        if (err.status === 404) showState('Project not found.', 'not-found');
        else showState(err.message, 'not-found');
        return null;
      }
    } else {
      current = projects.find((p) => p.id === choice.id);
      const params = new URLSearchParams(location.search);
      params.set('project', String(current.id));
      history.replaceState(history.state, '', `${location.pathname}?${params}${location.hash}`);
    }
    // Only a live project is remembered (AC 8); an archived one never is.
    if (!current.archived) storageSet(STORAGE_KEY, String(current.id));
    buildSelect(projects, current);
    if (listError) showListError('Could not load the project list. Showing the current project only.');
    pointNav(current.id);
    return current;
  })().catch((err) => {
    showState(err.message, 'not-found');
    return null;
  });
  return result;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = projectScope;
