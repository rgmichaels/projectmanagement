// Project list page: list, create, change status, archive/unarchive.
// Create, status and archive controls are shown only with the
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

  function statusSelect(project) {
    const select = el('select', { 'aria-label': `Status of ${project.name}` });
    for (const s of projectStatuses) {
      const opt = el('option', { value: s.name }, s.name);
      if (s.name === project.status) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => updateProject(project.id, { status: select.value }));
    return select;
  }

  function renderRow(project) {
    const actions = el('td', { class: 'row-actions' });
    if (!canManage()) {
      // Read-only row: the status as text, no archive controls.
    } else if (project.archived) {
      actions.append(el('button', { type: 'button', onclick: () => updateProject(project.id, { archived: false }) }, 'Unarchive'));
    } else if (isArchivable(project.status)) {
      actions.append(el('button', { type: 'button', onclick: () => updateProject(project.id, { archived: true }) }, 'Archive'));
    }
    const nameCell = el('td', {}, el('a', { href: `board.html?project=${project.id}` }, project.name));
    if (project.archived) nameCell.append(' ', el('span', { class: 'badge archived' }, 'Archived'));
    return el(
      'tr',
      { class: project.archived ? 'is-archived' : '' },
      nameCell,
      el('td', {}, project.key),
      el('td', {}, canManage() ? statusSelect(project) : project.status),
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
