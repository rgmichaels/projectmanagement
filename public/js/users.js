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
    select.value = user.group;
    let saved = user.group;
    select.addEventListener('change', async () => {
      const wanted = select.value;
      els.error.textContent = '';
      status.textContent = 'Saving...';
      select.disabled = true;
      try {
        const updated = await api.patch(`/api/users/${user.id}`, { group: wanted });
        saved = updated.group;
        select.value = saved;
        status.textContent = `Saved: ${saved}`;
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
      const [users, groupList] = await Promise.all([api.get('/api/users'), api.get('/api/groups')]);
      groups = groupList;
      els.tbody.replaceChildren(...users.map(renderRow));
      els.table.hidden = false;
    } catch (err) {
      els.error.textContent = err.message;
    }
  })();
})();
