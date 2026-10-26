// Project list page: list, create, edit (name, status, archived) in a dialog,
// archive/unarchive. Create, Edit and archive controls are shown only with the
// `manage-projects` permission (session.can); everyone can list and open.
(() => {
  const els = {
    showArchived: document.getElementById('show-archived'),
    openCreate: document.getElementById('open-create'),
    emptyCreate: document.getElementById('empty-create'),
    form: document.getElementById('create-form'),
    cancelCreate: document.getElementById('cancel-create'),
    createError: document.getElementById('create-error'),
    listError: document.getElementById('list-error'),
    empty: document.getElementById('empty-state'),
    table: document.getElementById('project-table'),
    tbody: document.querySelector('#project-table tbody'),
    editDialog: document.getElementById('edit-project'),
    editForm: document.getElementById('edit-form'),
    editKey: document.getElementById('edit-key'),
    editHint: document.getElementById('edit-archive-hint'),
    editError: document.getElementById('edit-error'),
    editCancel: document.getElementById('edit-cancel'),
  };

  let projectStatuses = [];
  const canManage = () => session.can('manage-projects');

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  }

  const isArchivable = (status) => projectStatuses.some((s) => s.name === status && s.archivable);

  function renderRow(project) {
    const actions = el('td', { class: 'row-actions' });
    if (canManage()) {
      // Name and status change in the Edit dialog; Archive/Unarchive stay as
      // one-click row actions.
      actions.append(el('button', { type: 'button', 'aria-label': `Edit ${project.name}`, onclick: () => openEdit(project) }, 'Edit'));
      if (project.archived) {
        actions.append(el('button', { type: 'button', onclick: () => updateProject(project.id, { archived: false }) }, 'Unarchive'));
      } else if (isArchivable(project.status)) {
        actions.append(el('button', { type: 'button', onclick: () => updateProject(project.id, { archived: true }) }, 'Archive'));
      }
    }
    const nameCell = el('td', {}, el('a', { href: `board.html?project=${project.id}` }, project.name));
    if (project.archived) nameCell.append(' ', el('span', { class: 'badge archived' }, 'Archived'));
    return el(
      'tr',
      { class: project.archived ? 'is-archived' : '' },
      nameCell,
      el('td', {}, project.key),
      el('td', {}, el('span', { class: 'badge' }, project.status)),
      actions
    );
  }

  async function load() {
    els.listError.textContent = '';
    try {
      const url = els.showArchived.checked ? '/api/projects?includeArchived=true' : '/api/projects';
      const projects = await api.get(url);
      els.tbody.replaceChildren(...projects.map(renderRow));
      els.table.hidden = projects.length === 0;
      els.empty.hidden = projects.length !== 0;
    } catch (err) {
      els.listError.textContent = err.message;
    }
  }

  async function updateProject(id, changes) {
    els.listError.textContent = '';
    try {
      await api.patch(`/api/projects/${id}`, changes);
    } catch (err) {
      els.listError.textContent = err.message;
    }
    await load();
  }

  function openForm() {
    if (!canManage()) return;
    els.form.hidden = false;
    els.createError.textContent = '';
    els.form.elements.name.focus();
  }

  function closeForm() {
    els.form.reset();
    els.form.hidden = true;
  }

  // ---------- Edit project dialog ----------
  // Name, status and archived in one PATCH. The archived box is enabled only
  // for an archivable status (from /api/project-statuses); picking another
  // status clears it, matching the server's auto-unarchive rule.
  let editing = null;

  function syncArchivedBox() {
    const f = els.editForm.elements;
    const allowed = isArchivable(f.status.value);
    f.archived.disabled = !allowed;
    if (!allowed) f.archived.checked = false;
    const names = projectStatuses.filter((s) => s.archivable).map((s) => s.name);
    els.editHint.textContent = allowed ? '' : `Only a project in ${names.join(' or ')} status can be archived.`;
    els.editHint.hidden = allowed;
  }

  function openEdit(project) {
    if (!canManage()) return;
    editing = project;
    const f = els.editForm.elements;
    f.status.replaceChildren(...projectStatuses.map((s) => el('option', { value: s.name }, s.name)));
    f.name.value = project.name;
    f.status.value = project.status;
    f.archived.checked = Boolean(project.archived);
    els.editKey.textContent = project.key;
    els.editError.textContent = '';
    syncArchivedBox();
    els.editDialog.showModal();
    f.name.focus();
  }

  function closeEdit() {
    editing = null;
    els.editDialog.close();
  }

  els.editForm.elements.status.addEventListener('change', syncArchivedBox);
  els.editCancel.addEventListener('click', closeEdit);
  els.editDialog.addEventListener('close', () => { editing = null; });

  els.editForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // stay open until the save succeeds
    if (!editing) return;
    const f = els.editForm.elements;
    els.editError.textContent = '';
    const name = f.name.value.trim();
    if (!name) {
      els.editError.textContent = 'Name is required. Enter a name and save again.';
      f.name.focus();
      return;
    }
    const submit = els.editForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api.patch(`/api/projects/${editing.id}`, {
        name,
        status: f.status.value,
        archived: f.archived.checked,
      });
      closeEdit();
      await load();
    } catch (err) {
      els.editError.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  els.form.elements.key.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.createError.textContent = '';
    const f = els.form.elements;
    try {
      await api.post('/api/projects', {
        name: f.name.value.trim(),
        key: f.key.value.trim(),
        status: f.status.value,
      });
      closeForm();
      await load();
    } catch (err) {
      els.createError.textContent = err.message;
    }
  });

  els.openCreate.addEventListener('click', openForm);
  els.emptyCreate.addEventListener('click', openForm);
  els.cancelCreate.addEventListener('click', closeForm);
  els.showArchived.addEventListener('change', load);

  (async () => {
    try {
      await session.ready; // the header is filled before the list loads
      els.openCreate.hidden = !canManage();
      els.emptyCreate.hidden = !canManage();
      projectStatuses = await api.get('/api/project-statuses');
    } catch (err) {
      els.listError.textContent = err.message;
      return;
    }
    const statusField = els.form.elements.status;
    for (const s of projectStatuses) {
      statusField.append(el('option', { value: s.name }, s.name));
    }
    const def = projectStatuses.find((s) => s.isDefault) || projectStatuses[0];
    statusField.value = def.name;
    // Keep the default selected after form.reset().
    statusField.querySelector(`option[value="${CSS.escape(def.name)}"]`).defaultSelected = true;
    await load();
  })();
})();
