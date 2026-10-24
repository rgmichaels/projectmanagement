// Board page: columns from the status list, cards styled from the type list,
// swimlanes (assignee / epic / priority), drag-and-drop and the detail view.
// Status, type and priority names all come from the API; none are named here.
(() => {
  const GROUP_BY_STORAGE_KEY = 'pm.groupBy';
  const RANK_STEP = 1000;

  const projectId = new URLSearchParams(location.search).get('project');

  const state = {
    project: null,
    statuses: [],
    types: [],
    priorities: [],
    defaultPriority: null,
    users: [],
    items: [],
    groupBy: localStorage.getItem(GROUP_BY_STORAGE_KEY) || 'none',
    collapsed: new Set(),
    dragId: null,
  };

  const els = {
    crumb: document.getElementById('crumb'),
    title: document.getElementById('project-title'),
    status: document.getElementById('project-status'),
    archivedBadge: document.getElementById('archived-badge'),
    groupBy: document.getElementById('group-by'),
    createBtn: document.getElementById('create-item'),
    message: document.getElementById('message'),
    board: document.getElementById('board'),
    dialog: document.getElementById('detail'),
    form: document.getElementById('detail-form'),
    detailTitle: document.getElementById('detail-title'),
    statusField: document.getElementById('status-field'),
    epicField: document.getElementById('epic-field'),
    epicLabel: document.getElementById('epic-label'),
    detailError: document.getElementById('detail-error'),
    saveBtn: document.getElementById('detail-save'),
    deleteBtn: document.getElementById('detail-delete'),
    closeBtn: document.getElementById('detail-close'),
  };

  // ---------- helpers ----------

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  const readOnly = () => Boolean(state.project && state.project.archived);
  const typeOf = (name) => state.types.find((t) => t.name === name);
  const isEpicItem = (item) => Boolean(typeOf(item.type) && typeOf(item.type).isEpic);
  const epicType = () => state.types.find((t) => t.isEpic);
  const epicLabel = () => (epicType() ? epicType().label : '');
  const userById = (id) => state.users.find((u) => u.id === id);
  const itemById = (id) => state.items.find((i) => i.id === id);
  const byRank = (a, b) => a.rank - b.rank || a.id - b.id;

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).slice(0, 2).join('');
  }

  let messageTimer = null;
  function showMessage(text) {
    els.message.textContent = text;
    els.message.hidden = false;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => { els.message.hidden = true; }, 6000);
  }

  // ---------- grouping ----------

  function groupOptions() {
    const opts = [
      { value: 'none', label: 'None' },
      { value: 'assignee', label: 'Assignee' },
    ];
    if (epicType()) opts.push({ value: 'epic', label: epicLabel() });
    opts.push({ value: 'priority', label: 'Priority' });
    return opts;
  }

  // The work item field a grouping edits on a cross-lane drop.
  const GROUP_FIELDS = { assignee: 'assignee_id', epic: 'epic_id', priority: 'priority' };

  function laneValueOf(item) {
    const field = GROUP_FIELDS[state.groupBy];
    return field ? item[field] ?? null : null;
  }

  // Lanes are computed client-side from the full work item list.
  function computeLanes() {
    const items = state.items;
    const lanes = [];
    if (state.groupBy === 'assignee') {
      const used = new Set(items.map((i) => i.assignee_id).filter((v) => v !== null));
      for (const u of state.users.filter((x) => used.has(x.id))) {
        lanes.push({ key: `u${u.id}`, label: u.name, value: u.id });
      }
      lanes.push({ key: 'none', label: 'Unassigned', value: null });
    } else if (state.groupBy === 'epic') {
      const used = new Set(items.map((i) => i.epic_id).filter((v) => v !== null));
      const epics = items.filter((i) => isEpicItem(i) && used.has(i.id)).sort((a, b) => a.number - b.number);
      for (const e of epics) {
        lanes.push({ key: `e${e.id}`, label: `${e.key} ${e.title}`, value: e.id });
      }
      lanes.push({ key: 'none', label: `No ${epicLabel().toLowerCase()}`, value: null });
    } else if (state.groupBy === 'priority') {
      for (const p of state.priorities) {
        if (items.some((i) => i.priority === p)) lanes.push({ key: `p${p}`, label: p, value: p });
      }
    } else {
      lanes.push({ key: 'all', label: null, value: null });
    }
    for (const lane of lanes) {
      lane.items = state.groupBy === 'none' ? items : items.filter((i) => laneValueOf(i) === lane.value);
    }
    return lanes;
  }

  // ---------- rendering ----------

  function gridStyle() {
    return `grid-template-columns: repeat(${state.statuses.length}, minmax(220px, 1fr))`;
  }

  function renderCard(item) {
    const type = typeOf(item.type);
    const hasStyle = type && type.color;
    const typeBadge = el(
      'span',
      {
        class: `type-badge${hasStyle ? '' : ' type-fallback'}`,
        style: hasStyle ? `--type-color: ${type.color}` : undefined,
        title: item.type,
      },
      el('span', { class: 'type-icon', 'aria-hidden': 'true' }, (type && type.icon) || '□'),
      ' ',
      (type && type.label) || item.type
    );
    const user = userById(item.assignee_id);
    const epic = item.epic_id ? itemById(item.epic_id) : null;
    const card = el(
      'div',
      {
        class: `card${hasStyle ? '' : ' card-fallback'}`,
        style: hasStyle ? `--type-color: ${type.color}` : undefined,
        'data-id': item.id,
        draggable: readOnly() ? 'false' : 'true',
        tabindex: '0',
      },
      el('div', { class: 'card-title' }, item.title),
      el(
        'div',
        { class: 'card-meta' },
        typeBadge,
        el('span', { class: 'card-key' }, item.key),
        epic ? el('span', { class: 'epic-chip', title: epic.title }, epic.key) : null,
        el('span', { class: 'priority', title: `Priority: ${item.priority}` }, item.priority),
        el(
          'span',
          { class: `avatar${user ? '' : ' unassigned'}`, title: user ? user.name : 'Unassigned' },
          user ? initials(user.name) : '?'
        )
      )
    );
    card.addEventListener('click', () => openDetail(item));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDetail(item); });
    if (!readOnly()) {
      card.addEventListener('dragstart', (e) => {
        state.dragId = item.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));
        requestAnimationFrame(() => card.classList.add('dragging'));
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        state.dragId = null;
        removeIndicator();
      });
    }
    return card;
  }

  function renderColumn(status, lane, laneIndex) {
    const cards = lane.items.filter((i) => i.status === status).sort(byRank);
    const column = el('div', { class: 'column', 'data-status': status, 'data-lane': laneIndex });
    column.append(...cards.map(renderCard));
    if (!readOnly()) {
      column.addEventListener('dragover', (e) => onDragOver(e, column));
      column.addEventListener('drop', (e) => onDrop(e, column, status, lane));
    }
    return column;
  }

  function render() {
    const lanes = computeLanes();
    const header = el('div', { class: 'board-header', style: gridStyle() });
    for (const status of state.statuses) {
      const count = state.items.filter((i) => i.status === status).length;
      header.append(
        el('div', { class: 'col-header' }, el('span', {}, status), el('span', { class: 'count' }, String(count)))
      );
    }
    const nodes = [header];
    lanes.forEach((lane, laneIndex) => {
      const laneNode = el('section', { class: 'lane', 'data-lane': laneIndex });
      const collapseKey = `${state.groupBy}:${lane.key}`;
      const collapsed = state.collapsed.has(collapseKey);
      if (lane.label !== null) {
        const headerBtn = el(
          'button',
          { type: 'button', class: 'lane-header', 'aria-expanded': String(!collapsed) },
          el('span', { class: 'caret' }, collapsed ? '▶' : '▼'),
          el('span', { class: 'lane-label' }, lane.label),
          el('span', { class: 'count' }, `${lane.items.length} work item${lane.items.length === 1 ? '' : 's'}`)
        );
        headerBtn.addEventListener('click', () => {
          if (state.collapsed.has(collapseKey)) state.collapsed.delete(collapseKey);
          else state.collapsed.add(collapseKey);
          render();
        });
        laneNode.append(headerBtn);
      }
      if (!collapsed) {
        const body = el('div', { class: 'lane-body', style: gridStyle() });
        for (const status of state.statuses) body.append(renderColumn(status, lane, laneIndex));
        laneNode.append(body);
      }
      nodes.push(laneNode);
    });
    els.board.replaceChildren(...nodes);
  }

  function renderHeader() {
    const p = state.project;
    document.title = `${p.key} board`;
    els.crumb.textContent = `/ ${p.name}`;
    els.title.textContent = `${p.name} (${p.key})`;
    els.status.textContent = p.status;
    els.archivedBadge.hidden = !p.archived;
    els.createBtn.hidden = readOnly();
    els.groupBy.replaceChildren(...groupOptions().map((o) => el('option', { value: o.value }, o.label)));
    if (!groupOptions().some((o) => o.value === state.groupBy)) state.groupBy = 'none';
    els.groupBy.value = state.groupBy;
  }

  // ---------- drag and drop ----------

  let indicator = null;
  function removeIndicator() {
    if (indicator) indicator.remove();
    indicator = null;
  }

  function onDragOver(e, column) {
    if (state.dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!indicator) indicator = el('div', { class: 'drop-indicator' });
    const cards = [...column.querySelectorAll('.card:not(.dragging)')];
    const before = cards.find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    if (before) {
      if (indicator.nextSibling !== before) column.insertBefore(indicator, before);
    } else if (column.lastChild !== indicator) {
      column.append(indicator);
    }
  }

  function onDrop(e, column, status, lane) {
    e.preventDefault();
    const id = state.dragId ?? Number(e.dataTransfer.getData('text/plain'));
    state.dragId = null; // dragend may not fire once the re-render detaches the card
    let next = indicator && indicator.parentNode === column ? indicator.nextElementSibling : null;
    while (next && !next.classList.contains('card')) next = next.nextElementSibling;
    removeIndicator();
    const item = itemById(id);
    if (!item) return;
    moveItem(item, status, lane, next ? Number(next.dataset.id) : null);
  }

  // Rank for placing `item` in `status` before `beforeId` (or at the end of
  // the lane). Ranks are per status column across the whole project, so the
  // neighbours are looked up in the full column, not just the lane.
  function computeRank(item, status, lane, beforeId) {
    const column = state.items.filter((i) => i.status === status && i.id !== item.id).sort(byRank);
    if (beforeId !== null) {
      const idx = column.findIndex((i) => i.id === beforeId);
      const target = column[idx];
      const prev = column[idx - 1];
      if (!prev) return target.rank - RANK_STEP;
      // No gap left: send the target's rank; the server renumbers the column
      // and places the moved item first among equal ranks.
      return target.rank - prev.rank >= 2 ? Math.floor((prev.rank + target.rank) / 2) : target.rank;
    }
    const laneCards = column.filter((i) => lane.items.includes(i));
    const last = laneCards[laneCards.length - 1] || column[column.length - 1];
    if (!last) return RANK_STEP;
    const after = column[column.indexOf(last) + 1];
    if (!after) return last.rank + RANK_STEP;
    return after.rank - last.rank >= 2 ? Math.floor((last.rank + after.rank) / 2) : after.rank;
  }

  async function moveItem(item, status, lane, beforeId) {
    if (beforeId === item.id) return;
    const patch = { status, rank: computeRank(item, status, lane, beforeId) };
    const field = GROUP_FIELDS[state.groupBy];
    if (field && laneValueOf(item) !== lane.value) {
      if (state.groupBy === 'epic' && isEpicItem(item) && lane.value !== null) {
        showMessage(`${item.key} (${epicLabel()}) cannot be placed in another ${epicLabel().toLowerCase()} lane.`);
        render();
        return;
      }
      patch[field] = lane.value;
    }
    // Optimistic update, rolled back if the save fails.
    const snapshot = { ...item };
    Object.assign(item, patch);
    render();
    try {
      await api.patch(`/api/issues/${item.id}`, patch);
      await reloadItems();
    } catch (err) {
      Object.assign(item, snapshot);
      render();
      showMessage(`Could not move ${item.key}: ${err.message}`);
    }
  }

  // ---------- detail view ----------

  let editing = null; // the item being edited, or null when creating

  function fillSelect(select, options, value) {
    select.replaceChildren(...options.map((o) => el('option', { value: o.value }, o.label)));
    select.value = value;
  }

  function syncEpicField() {
    const type = typeOf(els.form.elements.type.value);
    els.epicField.hidden = !epicType() || Boolean(type && type.isEpic);
  }

  function openDetail(item) {
    editing = item || null;
    const f = els.form.elements;
    const ro = readOnly();
    const defaultType = state.types.find((t) => t.isDefault) || state.types[0];

    els.detailTitle.textContent = item ? `${item.key}` : 'Create work item';
    els.detailError.textContent = '';
    els.epicLabel.textContent = epicLabel();

    f.title.value = item ? item.title : '';
    f.description.value = item ? item.description : '';
    fillSelect(f.type, state.types.map((t) => ({ value: t.name, label: t.label || t.name })), item ? item.type : defaultType.name);
    fillSelect(f.status, state.statuses.map((s) => ({ value: s, label: s })), item ? item.status : state.statuses[0]);
    fillSelect(f.priority, state.priorities.map((p) => ({ value: p, label: p })), item ? item.priority : state.defaultPriority);
    fillSelect(
      f.assignee_id,
      [{ value: '', label: 'Unassigned' }, ...state.users.map((u) => ({ value: String(u.id), label: u.name }))],
      item && item.assignee_id ? String(item.assignee_id) : ''
    );
    const epics = state.items.filter((i) => isEpicItem(i) && (!item || i.id !== item.id));
    fillSelect(
      f.epic_id,
      [{ value: '', label: 'None' }, ...epics.map((e) => ({ value: String(e.id), label: `${e.key} ${e.title}` }))],
      item && item.epic_id ? String(item.epic_id) : ''
    );
    els.statusField.hidden = !item;
    syncEpicField();

    for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;
    els.saveBtn.hidden = ro;
    els.saveBtn.textContent = item ? 'Save' : 'Create';
    els.deleteBtn.hidden = ro || !item;
    els.dialog.showModal();
  }

  function formValues() {
    const f = els.form.elements;
    const type = typeOf(f.type.value);
    const values = {
      title: f.title.value.trim(),
      type: f.type.value,
      priority: f.priority.value,
      assignee_id: f.assignee_id.value ? Number(f.assignee_id.value) : null,
      epic_id: type && type.isEpic ? null : f.epic_id.value ? Number(f.epic_id.value) : null,
      description: f.description.value,
    };
    if (editing) values.status = f.status.value;
    return values;
  }

  els.form.elements.type.addEventListener('change', syncEpicField);

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (readOnly()) return;
    els.detailError.textContent = '';
    const values = formValues();
    if (!values.title) {
      els.detailError.textContent = 'Title is required.';
      return;
    }
    try {
      if (editing) await api.patch(`/api/issues/${editing.id}`, values);
      else await api.post(`/api/projects/${state.project.id}/issues`, values);
      els.dialog.close();
      await reloadItems();
    } catch (err) {
      els.detailError.textContent = err.message;
    }
  });

  els.deleteBtn.addEventListener('click', async () => {
    if (!editing || readOnly()) return;
    if (!confirm(`Delete ${editing.key}? This cannot be undone.`)) return;
    try {
      await api.del(`/api/issues/${editing.id}`);
      els.dialog.close();
      await reloadItems();
    } catch (err) {
      els.detailError.textContent = err.message;
    }
  });

  els.closeBtn.addEventListener('click', () => els.dialog.close());

  // ---------- loading ----------

  async function reloadItems() {
    state.items = await api.get(`/api/projects/${state.project.id}/issues`);
    render();
  }

  els.groupBy.addEventListener('change', () => {
    state.groupBy = els.groupBy.value;
    localStorage.setItem(GROUP_BY_STORAGE_KEY, state.groupBy);
    render();
  });

  els.createBtn.addEventListener('click', () => openDetail(null));

  (async () => {
    if (!projectId) {
      showMessage('No project selected.');
      return;
    }
    try {
      const [project, statuses, types, priorities, users] = await Promise.all([
        api.get(`/api/projects/${encodeURIComponent(projectId)}`),
        api.get('/api/statuses'),
        api.get('/api/types'),
        api.get('/api/priorities'),
        api.get('/api/users'),
      ]);
      Object.assign(state, {
        project,
        statuses,
        types,
        priorities: priorities.priorities,
        defaultPriority: priorities.default,
        users,
      });
      renderHeader();
      await reloadItems();
    } catch (err) {
      showMessage(err.message);
    }
  })();
})();
