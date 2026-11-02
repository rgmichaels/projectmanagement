// Users page: every user with their group; an Admin changes a group from the
// dropdown and it is saved at once. Group names come from GET /api/groups;
// none are named here. Without the manage-users permission the page shows an
// error line instead of the table (the server refuses changes with 403).
(() => {
  const els = {
    error: document.getElementById('users-error'),
    table: document.getElementById('users-table'),
    tbody: document.querySelector('#users-table tbody'),
  };

  let groups = [];
  const projectSelect = document.getElementById('users-project');
  const addButton = document.getElementById('open-add-user');
  const addForm = document.getElementById('add-user-form');
  const addError = document.getElementById('add-user-error');
  const addStatus = document.getElementById('add-user-status');
  const cancelAdd = document.getElementById('cancel-add-user');

  async function refreshUsers() {
    const list = await api.get(`/api/users${projectSelect.value ? `?project=${encodeURIComponent(projectSelect.value)}` : ''}`);
    els.tbody.replaceChildren(...list.map(renderRow));
    els.table.hidden = false;
  }

  function closeAdd() {
    addForm.reset();
    addForm.hidden = true;
    addError.textContent = '';
    addButton.focus();
  }

  addButton.addEventListener('click', () => {
    addForm.hidden = false;
    addStatus.textContent = '';
    addForm.elements.name.focus();
  });
  cancelAdd.addEventListener('click', closeAdd);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (addForm.dataset.saving === 'true' || !session.can('manage-users')) return;
    const body = { name: addForm.elements.name.value.trim(), username: addForm.elements.username.value.trim() };
    if (addForm.elements.group.value) body.group = addForm.elements.group.value;
    addError.textContent = '';
    addStatus.textContent = '';
    addForm.dataset.saving = 'true';
    const controls = [...addForm.querySelectorAll('input, select, button')];
    controls.forEach((control) => { control.disabled = true; });
    addButton.disabled = true;
    projectSelect.disabled = true;
    try {
      const user = await api.post('/api/users', body);
      closeAdd();
      addStatus.textContent = `Added ${user.name}. They can sign in as ${user.username}.`;
      try { await refreshUsers(); }
      catch (err) { els.error.textContent = `User added, but the list could not refresh: ${err.message}. Reload the page to see them.`; }
    } catch (err) {
      addError.textContent = err.message;
    } finally {
      addForm.dataset.saving = 'false';
      controls.forEach((control) => { control.disabled = false; });
      addButton.disabled = false;
      projectSelect.disabled = false;
      if (addForm.hidden) addButton.focus();
    }
  });

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) node.append(c);
    return node;
  }

  function renderRow(user) {
    const status = el('span', { class: 'save-status', role: 'status' });
    const select = el('select', { 'aria-label': `Group of ${user.name}` });
    const names = groups.includes(user.group) ? groups : [...groups, user.group]; // a group since removed from the list
    for (const name of names) select.append(el('option', { value: name }, name));
    if (projectSelect.value) select.prepend(el('option', { value: '' }, `Use account default (${user.defaultGroup})`));
    select.value = user.inherited ? '' : user.group;
    let saved = select.value;
    const projectId = projectSelect.value;
    if (projectId) status.textContent = user.inherited ? `Inherited: ${user.group}` : `Project group: ${user.group}`;
    select.addEventListener('change', async () => {
      const wanted = select.value;
      els.error.textContent = '';
      status.textContent = 'Saving...';
      select.disabled = true;
      try {
        const updated = await api.patch(`/api/users/${user.id}`, { group: projectId ? wanted || null : wanted, ...(projectId ? { project_id: Number(projectId) } : {}) });
        saved = updated.inherited ? '' : updated.group;
        select.value = saved;
        status.textContent = `Saved: ${updated.group}${updated.inherited ? ' (account default)' : ''}`;
      } catch (err) {
        // For example the last-Admin 409, or a 403 if this user lost the
        // permission in another browser: show it and put the old value back.
        select.value = saved;
        status.textContent = '';
        els.error.textContent = `Could not change ${user.name}'s group: ${err.message}`;
      } finally {
        select.disabled = false;
      }
    });
    return el('tr', { 'data-id': String(user.id) }, el('td', {}, user.name), el('td', {}, user.username), el('td', {}, select), el('td', {}, status));
  }

  (async () => {
    let me;
    try {
      me = await session.ready; // the header is filled before the list loads
    } catch (err) {
      els.error.textContent = err.message;
      return;
    }
    if (!session.can('manage-users')) {
      els.error.textContent = `Your group (${me.group}) is not allowed to manage users.`;
      return;
    }
    try {
      const [users, groupList, projects, matrix] = await Promise.all([api.get('/api/users'), api.get('/api/groups'), api.get('/api/projects?includeArchived=true'), api.get('/api/groups/permissions')]);
      groups = groupList;
      addForm.elements.group.replaceChildren(el('option', { value: '' }, 'Use default group'), ...groups.map((group) => el('option', { value: group }, group)));
      addButton.hidden = false;
      for (const p of projects) projectSelect.append(el('option', { value: String(p.id) }, `${p.key} — ${p.name}${p.archived ? ' (archived)' : ''}`));
      const permissionTable = document.getElementById('permissions-table');
      permissionTable.querySelector('thead').append(el('tr', {}, el('th', {}, 'Permission'), ...matrix.groups.map((g) => el('th', {}, g.name))));
      for (const p of matrix.permissions) permissionTable.querySelector('tbody').append(el('tr', {}, el('th', {}, p.label), ...matrix.groups.map((g) => el('td', {}, g.permissions.includes(p.name) ? 'Yes' : 'No'))));
      projectSelect.addEventListener('change', async () => {
        projectSelect.disabled = true;
        els.table.hidden = true;
        els.error.textContent = '';
        try {
          await refreshUsers();
        } catch (err) { els.error.textContent = err.message; }
        finally { projectSelect.disabled = false; }
      });
      els.tbody.replaceChildren(...users.map(renderRow));
      els.table.hidden = false;
    } catch (err) {
      els.error.textContent = err.message;
    }
  })();
})();
