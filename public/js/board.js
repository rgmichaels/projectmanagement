// Board page: columns from the status list, cards styled from the type list,
// swimlanes (assignee / epic / priority), drag-and-drop and the detail view
// with its Links section and Discussion and History tabs.
// Status, type, priority, resolution and link type names all come from the
// API; none are named here. The terminal status and the default resolution are the server's.
(() => {
  const GROUP_BY_STORAGE_KEY = 'pm.groupBy';
  const COMMENT_MAX_LENGTH = 2000;
  const RELATIVE_REFRESH_MS = 60 * 1000;
  const RANK_STEP = 1000;

  const projectId = new URLSearchParams(location.search).get('project');

  const state = {
    project: null,
    statuses: [],
    terminalStatus: null,
    resolutions: [],
    types: [],
    priorities: [],
    defaultPriority: null,
    users: [],
    historyFields: [], // [{ key, label, kind }] from the server, for the History filter
    linkOptions: [], // [{ link_type, direction, label }] from the server, for the Links form
    me: null, // the signed-in user { id, name, username }
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
    resolutionField: document.getElementById('resolution-field'),
    epicField: document.getElementById('epic-field'),
    epicLabel: document.getElementById('epic-label'),
    detailError: document.getElementById('detail-error'),
    saveBtn: document.getElementById('detail-save'),
    deleteBtn: document.getElementById('detail-delete'),
    closeBtn: document.getElementById('detail-close'),
    discussion: document.getElementById('discussion'),
    discussionHeading: document.getElementById('discussion-heading'),
    commentForm: document.getElementById('comment-form'),
    postingAs: document.getElementById('posting-as'),
    reporter: document.getElementById('reporter'),
    commentBody: document.getElementById('comment-body'),
    commentError: document.getElementById('comment-error'),
    commentPost: document.getElementById('comment-post'),
    thread: document.getElementById('thread'),
    threadEmpty: document.getElementById('thread-empty'),
    activityTabs: document.getElementById('activity-tabs'),
    tabDiscussion: document.getElementById('tab-discussion'),
    tabHistory: document.getElementById('tab-history'),
    history: document.getElementById('history'),
    historyField: document.getElementById('history-field'),
    historyNote: document.getElementById('history-note'),
    historyError: document.getElementById('history-error'),
    historyErrorText: document.getElementById('history-error-text'),
    historyRetry: document.getElementById('history-retry'),
    historyList: document.getElementById('history-list'),
    historyMore: document.getElementById('history-more'),
    links: document.getElementById('links'),
    linksEmpty: document.getElementById('links-empty'),
    linksList: document.getElementById('links-list'),
    linkForm: document.getElementById('link-form'),
    linkRelation: document.getElementById('link-relation'),
    linkTarget: document.getElementById('link-target'),
    linkAdd: document.getElementById('link-add'),
    linkError: document.getElementById('link-error'),
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
  const isTerminal = (status) => status === state.terminalStatus;
  const defaultResolution = () => {
    const r = state.resolutions.find((x) => x.isDefault) || state.resolutions[0];
    return r ? r.name : '';
  };

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
        resolutionLabel(item),
        commentChip(item.comment_count || 0),
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

  // Shown only in the terminal column, from the server's value.
  function resolutionLabel(item) {
    if (!isTerminal(item.status) || !item.resolution) return null;
    const r = state.resolutions.find((x) => x.name === item.resolution);
    const color = r && r.color;
    return el(
      'span',
      { class: 'resolution-label', style: color ? `--resolution-color: ${color}` : undefined, title: `Resolution: ${item.resolution}` },
      item.resolution
    );
  }

  function commentChip(n) {
    return el(
      'span',
      { class: 'comment-count', title: `${n} message${n === 1 ? '' : 's'}` },
      el('span', { class: 'comment-icon', 'aria-hidden': 'true' }, '\u{1F4AC}'),
      String(n)
    );
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
      // The server sets or clears the resolution; show its answer at once.
      Object.assign(item, await api.patch(`/api/issues/${item.id}`, patch));
      render();
      historySaved(item.id);
    } catch (err) {
      Object.assign(item, snapshot);
      render();
      showMessage(`Could not move ${item.key}: ${err.message}`);
      return;
    }
    // The move is saved; a failed refresh must not roll the card back.
    try {
      await reloadItems();
    } catch (err) {
      showMessage(`${item.key} was moved, but the board could not be refreshed: ${err.message}`);
    }
  }

  // ---------- detail view ----------

  let editing = null; // the item being edited, or null when creating

  function fillSelect(select, options, value) {
    select.replaceChildren(...options.map((o) => el('option', { value: o.value }, o.label)));
    select.value = value;
  }

  // The resolution control is shown only while the status field is the
  // terminal status. Entering it from another status selects the default.
  function syncResolutionField() {
    const f = els.form.elements;
    const show = Boolean(editing) && isTerminal(f.status.value);
    if (show && els.resolutionField.hidden) {
      const current = editing && isTerminal(editing.status) ? editing.resolution : null;
      const names = state.resolutions.map((r) => r.name);
      if (current && !names.includes(current)) names.push(current); // a value since removed from the list
      fillSelect(f.resolution, names.map((n) => ({ value: n, label: n })), current || defaultResolution());
    }
    els.resolutionField.hidden = !show;
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

    // Read-only; set by the server from whoever created the item.
    els.reporter.hidden = !(item && item.reporter_name);
    els.reporter.textContent = item && item.reporter_name ? `Reporter: ${item.reporter_name}` : '';

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
    els.resolutionField.hidden = true;
    syncResolutionField();
    syncEpicField();

    for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;
    els.historyField.disabled = false; // History stays usable when read-only
    els.saveBtn.hidden = ro;
    els.saveBtn.textContent = item ? 'Save' : 'Create';
    els.deleteBtn.hidden = ro || !item;
    els.activityTabs.hidden = !item;
    openLinks(item);
    openDiscussion(item);
    openHistory(item);
    selectTab('discussion'); // the default each time a dialog opens
    // A linked item re-points the dialog that is already open.
    if (!els.dialog.open) els.dialog.showModal();
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
    // Left out for other statuses: the server clears it.
    if (editing && isTerminal(values.status)) values.resolution = f.resolution.value;
    return values;
  }

  els.form.elements.type.addEventListener('change', syncEpicField);
  els.form.elements.status.addEventListener('change', syncResolutionField);

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
      if (editing) {
        await api.patch(`/api/issues/${editing.id}`, values);
        historySaved(editing.id);
      } else {
        await api.post(`/api/projects/${state.project.id}/issues`, values);
      }
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

  // ---------- discussion ----------
  // Messages on the open work item. Kept apart from the work item form: none
  // of these handlers submit, save or close it, and its Save never posts.

  const discussion = {
    issueId: null, // work item whose thread is shown, or null
    comments: [], // newest first
    editingId: null, // message in edit mode, or null
    editDraft: '',
    posting: false,
    timer: null,
    loadSeq: 0,
  };

  // Client-side copy of the server rule: trimmed, 1-2000 characters.
  function commentTextError(text) {
    if (text.length < 1) return 'Message is required.';
    if (text.length > COMMENT_MAX_LENGTH) {
      return `Message must be at most ${COMMENT_MAX_LENGTH} characters (currently ${text.length}).`;
    }
    return null;
  }

  // `2026-10-24 14:05 (2 hours ago)`; only the relative part is refreshed.
  function timeText(iso) {
    return el(
      'span',
      { class: 'message-time', title: iso },
      `${timeFormat.localDateTime(iso)} (`,
      el('span', { class: 'relative-time', 'data-time': iso }, timeFormat.relativeTime(iso)),
      ')'
    );
  }

  // One pass for the whole dialog: Discussion and History share this timer.
  function refreshRelativeTimes() {
    for (const span of els.dialog.querySelectorAll('.relative-time')) {
      span.textContent = timeFormat.relativeTime(span.dataset.time);
    }
  }

  function renderMessage(comment) {
    const ro = readOnly();
    // Edit and Delete only on the signed-in user's messages; the server
    // refuses the others' (403) as well.
    const own = !ro && Boolean(state.me) && comment.author_id === state.me.id;
    const head = el(
      'div',
      { class: 'message-head' },
      el('span', { class: 'message-author' }, comment.author_name),
      timeText(comment.created_at),
      comment.updated_at ? el('span', { class: 'message-edited' }, 'edited ', timeText(comment.updated_at)) : null
    );
    const li = el('li', { class: 'thread-item', 'data-id': comment.id }, head);

    if (own && discussion.editingId === comment.id) {
      const editor = el('textarea', { class: 'message-editor', rows: '3', 'aria-label': 'Edit message' });
      editor.value = discussion.editDraft;
      editor.addEventListener('input', () => { discussion.editDraft = editor.value; });
      const error = el('p', { class: 'error', role: 'alert' });
      const saveBtn = el('button', { type: 'button', class: 'primary' }, 'Save');
      const cancelBtn = el('button', { type: 'button' }, 'Cancel');
      saveBtn.addEventListener('click', () => saveEdit(comment, editor, error, saveBtn));
      cancelBtn.addEventListener('click', () => {
        discussion.editingId = null;
        renderThread();
      });
      li.append(editor, error, el('div', { class: 'actions message-actions' }, saveBtn, cancelBtn));
      return li;
    }

    li.append(el('div', { class: 'message-body' }, comment.body)); // textContent: never parsed as HTML
    if (own) {
      const editBtn = el('button', { type: 'button', class: 'link' }, 'Edit');
      const deleteBtn = el('button', { type: 'button', class: 'link danger' }, 'Delete');
      editBtn.addEventListener('click', () => {
        discussion.editingId = comment.id;
        discussion.editDraft = comment.body;
        renderThread();
        const editor = els.thread.querySelector('.message-editor');
        if (editor) editor.focus();
      });
      deleteBtn.addEventListener('click', () => deleteMessage(comment));
      li.append(el('div', { class: 'actions message-actions' }, editBtn, deleteBtn));
    }
    return li;
  }

  function renderThread() {
    const n = discussion.comments.length;
    els.discussionHeading.textContent = `Discussion (${n})`;
    els.threadEmpty.hidden = n > 0;
    els.thread.replaceChildren(...discussion.comments.map(renderMessage));
  }

  // Shows the section for an existing work item (not when creating) and
  // loads its thread.
  function openDiscussion(item) {
    discussion.issueId = item ? item.id : null;
    discussion.comments = [];
    discussion.editingId = null;
    els.discussion.hidden = !item;
    if (!item) return;

    els.commentForm.hidden = readOnly();
    els.commentBody.value = '';
    els.commentError.textContent = '';
    els.commentPost.disabled = false;
    discussion.posting = false;
    els.postingAs.textContent = `Posting as ${state.me.name}`;
    renderThread();
    loadThread(item.id);

    clearInterval(discussion.timer);
    discussion.timer = setInterval(refreshRelativeTimes, RELATIVE_REFRESH_MS);
  }

  async function loadThread(issueId) {
    const seq = ++discussion.loadSeq;
    try {
      const comments = await api.get(`/api/issues/${issueId}/comments`);
      if (seq !== discussion.loadSeq || discussion.issueId !== issueId) return; // a newer dialog is open
      discussion.comments = comments;
      renderThread();
    } catch (err) {
      if (discussion.issueId === issueId) els.commentError.textContent = `Could not load messages: ${err.message}`;
    }
  }

  // The card's count lives in the board's work item list; refresh it without
  // touching the open dialog's fields (reloadItems only re-renders the board).
  async function refreshCards() {
    try {
      await reloadItems();
    } catch (err) {
      showMessage(err.message);
    }
  }

  els.commentPost.addEventListener('click', async () => {
    if (discussion.posting || readOnly() || discussion.issueId === null) return;
    const issueId = discussion.issueId;
    const text = els.commentBody.value.trim();
    const problem = commentTextError(text);
    els.commentError.textContent = problem || '';
    if (problem) return;

    discussion.posting = true;
    els.commentPost.disabled = true;
    try {
      const created = await api.post(`/api/issues/${issueId}/comments`, { body: text });
      if (discussion.issueId === issueId) {
        discussion.comments.unshift(created);
        els.commentBody.value = '';
        renderThread();
        els.thread.scrollTop = 0;
      }
      await refreshCards();
    } catch (err) {
      if (discussion.issueId === issueId) els.commentError.textContent = `Could not post: ${err.message}`;
    } finally {
      discussion.posting = false;
      els.commentPost.disabled = false;
    }
  });

  async function saveEdit(comment, editor, error, saveBtn) {
    if (readOnly()) return;
    const text = editor.value.trim();
    const problem = commentTextError(text);
    error.textContent = problem || '';
    if (problem) return;
    if (text === comment.body) {
      // Unchanged: nothing to save and no "edited" marker.
      discussion.editingId = null;
      renderThread();
      return;
    }
    saveBtn.disabled = true;
    try {
      const updated = await api.patch(`/api/comments/${comment.id}`, { body: text });
      const idx = discussion.comments.findIndex((c) => c.id === comment.id);
      if (idx !== -1) discussion.comments[idx] = updated; // position unchanged
      if (discussion.editingId === comment.id) discussion.editingId = null;
      renderThread();
    } catch (err) {
      error.textContent = `Could not save: ${err.message}`;
      saveBtn.disabled = false;
    }
  }

  async function deleteMessage(comment) {
    if (readOnly()) return;
    if (!confirm('Delete this message? This cannot be undone.')) return;
    els.commentError.textContent = '';
    try {
      await api.del(`/api/comments/${comment.id}`);
      discussion.comments = discussion.comments.filter((c) => c.id !== comment.id);
      if (discussion.editingId === comment.id) discussion.editingId = null;
      renderThread();
      await refreshCards();
    } catch (err) {
      els.commentError.textContent = `Could not delete: ${err.message}`;
    }
  }

  // Covers Close, Save and Escape: stop the relative-time refresh and drop
  // any open message edit. The event is queued, so if another work item was
  // opened in the meantime the dialog is open again and its state is kept.
  els.dialog.addEventListener('close', () => {
    if (els.dialog.open) return;
    clearInterval(discussion.timer);
    discussion.timer = null;
    discussion.issueId = null;
    discussion.editingId = null;
    historyView.issueId = null;
    linksView.issueId = null;
  });

  // ---------- history ----------
  // The open work item's change history, newest first, loaded page by page
  // the first time the History tab is shown. Read-only, also on archived
  // projects. Labels and values come from the server; none are named here.

  const historyView = {
    issueId: null, // work item whose history is shown, or null
    events: [], // newest first
    hasMore: false,
    loaded: false, // the first page has been fetched for this dialog
    loading: false,
    loadSeq: 0, // ignores responses for an older dialog, filter or page
    field: '', // '' = all fields
    selected: false, // the History tab is the visible one
  };

  function selectTab(name) {
    const showHistory = name === 'history';
    historyView.selected = showHistory;
    els.tabDiscussion.setAttribute('aria-selected', String(!showHistory));
    els.tabHistory.setAttribute('aria-selected', String(showHistory));
    els.tabDiscussion.classList.toggle('active', !showHistory);
    els.tabHistory.classList.toggle('active', showHistory);
    const hasItem = discussion.issueId !== null;
    els.discussion.hidden = !hasItem || showHistory;
    els.history.hidden = !hasItem || !showHistory;
    if (showHistory && hasItem && !historyView.loaded && !historyView.loading) loadHistory(true);
  }

  els.tabDiscussion.addEventListener('click', () => selectTab('discussion'));
  els.tabHistory.addEventListener('click', () => selectTab('history'));
  // Arrow keys move between the two tabs (both are also in the Tab order).
  els.activityTabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const target = historyView.selected ? els.tabDiscussion : els.tabHistory;
    selectTab(target === els.tabHistory ? 'history' : 'discussion');
    target.focus();
  });

  function fillHistoryFilter() {
    els.historyField.replaceChildren(
      el('option', { value: '' }, 'All fields'),
      ...state.historyFields.map((f) => el('option', { value: f.key }, f.label))
    );
  }

  function renderHistoryEvent(event) {
    return el(
      'li',
      { class: 'history-item', 'data-id': event.id },
      el(
        'div',
        { class: 'message-head' },
        el('span', { class: 'message-author' }, event.actor_name), // text, never parsed as HTML
        timeText(event.created_at)
      ),
      el('ul', { class: 'history-changes' }, ...historyFormat.eventLines(event).map((line) => el('li', {}, line)))
    );
  }

  function renderHistory() {
    const v = historyView;
    els.historyList.replaceChildren(...v.events.map(renderHistoryEvent));
    let note = '';
    if (v.loading && v.events.length === 0) note = 'Loading...';
    else if (v.loaded && v.events.length === 0 && els.historyError.hidden) note = 'No history recorded yet.';
    els.historyNote.textContent = note;
    els.historyNote.hidden = !note;
    els.historyMore.hidden = !v.hasMore;
    els.historyMore.disabled = v.loading;
    els.historyMore.textContent = v.loading && v.events.length ? 'Loading...' : 'Show more';
  }

  // Resets the tab for a newly opened dialog; nothing is fetched until the
  // History tab is selected.
  function openHistory(item) {
    Object.assign(historyView, {
      issueId: item ? item.id : null,
      events: [],
      hasMore: false,
      loaded: false,
      loading: false,
      field: '',
    });
    historyView.loadSeq += 1;
    els.historyField.value = '';
    els.historyError.hidden = true;
    renderHistory();
  }

  // reset: fetch the first page (replacing the list); otherwise the page
  // after the oldest event shown.
  async function loadHistory(reset) {
    const v = historyView;
    const issueId = v.issueId;
    if (issueId === null) return;
    const seq = ++v.loadSeq;
    const params = new URLSearchParams();
    if (v.field) params.set('field', v.field);
    if (!reset && v.events.length) params.set('before', String(v.events[v.events.length - 1].id));
    if (reset) {
      v.events = [];
      v.hasMore = false;
    }
    v.loading = true;
    els.historyError.hidden = true;
    renderHistory();
    const query = params.toString();
    try {
      const page = await api.get(`/api/issues/${issueId}/history${query ? `?${query}` : ''}`);
      if (seq !== v.loadSeq || v.issueId !== issueId) return; // a newer dialog, filter or page
      v.events = reset ? page.events : v.events.concat(page.events);
      v.hasMore = page.has_more;
      v.loaded = true;
    } catch (err) {
      if (seq !== v.loadSeq || v.issueId !== issueId) return;
      els.historyErrorText.textContent = `Could not load history: ${err.message}`;
      els.historyError.hidden = false;
      els.historyRetry.onclick = () => loadHistory(reset);
    } finally {
      if (seq === v.loadSeq) v.loading = false;
    }
    if (seq === v.loadSeq) renderHistory();
  }

  // A save of `issueId` succeeded: if its history is on screen, fetch the
  // first page again; if it was loaded but hidden, fetch it when next shown.
  function historySaved(issueId) {
    if (historyView.issueId !== issueId || !historyView.loaded) return;
    if (historyView.selected) loadHistory(true);
    else historyView.loaded = false;
  }

  els.historyField.addEventListener('change', () => {
    historyView.field = els.historyField.value;
    loadHistory(true);
  });
  els.historyMore.addEventListener('click', () => {
    if (!historyView.loading) loadHistory(false);
  });

  // ---------- links ----------
  // Links of the open work item, grouped by how they read from it. Not part of
  // the work item form: these handlers never submit, save or close it.
  // Relationship labels come from the server; none are named here.

  const linksView = {
    issueId: null, // work item whose links are shown, or null
    links: [], // as GET /api/issues/:id/links returns them (already ordered)
    loadSeq: 0,
    busy: false, // an add or remove is in flight
  };

  // The relationship dropdown: one option per entry of GET /api/link-types,
  // valued by its index in state.linkOptions.
  function fillLinkRelation() {
    els.linkRelation.replaceChildren(
      el('option', { value: '' }, 'Relationship...'),
      ...state.linkOptions.map((o, i) => el('option', { value: String(i) }, o.label))
    );
  }

  // The other work items of this project, from the items the board loaded.
  function fillLinkTarget(item) {
    const others = state.items.filter((i) => i.id !== item.id).sort((a, b) => a.number - b.number);
    els.linkTarget.replaceChildren(
      el('option', { value: '' }, 'Work item...'),
      ...others.map((i) => el('option', { value: String(i.id) }, `${i.key} ${i.title}`))
    );
  }

  function syncLinkAdd() {
    els.linkAdd.disabled = linksView.busy || !els.linkRelation.value || !els.linkTarget.value;
  }

  function renderLinkRow(link) {
    const type = typeOf(link.other.type);
    const open = () => openLinked(link.other.id);
    const li = el(
      'li',
      { class: 'links-row', 'data-id': link.id },
      el(
        'span',
        {
          class: 'type-icon links-type',
          style: type && type.color ? `--type-color: ${type.color}` : undefined,
          title: (type && type.label) || link.other.type,
          'aria-hidden': 'true',
        },
        (type && type.icon) || '□'
      ),
      el('button', { type: 'button', class: 'link links-key', onclick: open }, link.other.key), // text, never parsed as HTML
      el('button', { type: 'button', class: 'link links-title', onclick: open }, link.other.title),
      el('span', { class: 'links-status' }, link.other.status)
    );
    if (!readOnly()) {
      li.append(el('button', { type: 'button', class: 'link danger', onclick: () => removeLink(link) }, 'Remove'));
    }
    return li;
  }

  function renderLinks() {
    const groups = new Map(); // label -> links, in the server's order
    for (const link of linksView.links) {
      if (!groups.has(link.label)) groups.set(link.label, []);
      groups.get(link.label).push(link);
    }
    els.linksEmpty.hidden = linksView.links.length > 0;
    els.linksList.replaceChildren(
      ...[...groups].map(([label, list]) =>
        el('div', { class: 'links-group' }, el('h4', {}, label), el('ul', {}, ...list.map(renderLinkRow)))
      )
    );
  }

  // Shows the section for an existing work item (not when creating) and
  // loads its links.
  function openLinks(item) {
    linksView.issueId = item ? item.id : null;
    linksView.links = [];
    linksView.busy = false;
    linksView.loadSeq += 1;
    els.links.hidden = !item;
    els.linkError.textContent = '';
    if (!item) return;
    els.linkForm.hidden = readOnly();
    fillLinkRelation();
    fillLinkTarget(item);
    syncLinkAdd();
    els.linksEmpty.hidden = true;
    els.linksList.replaceChildren();
    loadLinks(item.id);
  }

  async function loadLinks(issueId) {
    const seq = ++linksView.loadSeq;
    try {
      const list = await api.get(`/api/issues/${issueId}/links`);
      if (seq !== linksView.loadSeq || linksView.issueId !== issueId) return; // a newer dialog is open
      linksView.links = list;
      renderLinks();
    } catch (err) {
      if (linksView.issueId === issueId) els.linkError.textContent = `Could not load links: ${err.message}`;
    }
  }

  // Re-points the open dialog at a linked work item.
  async function openLinked(id) {
    let item = itemById(id);
    if (!item) {
      try {
        item = await api.get(`/api/issues/${id}`);
      } catch (err) {
        els.linkError.textContent = `Could not open the linked work item: ${err.message}`;
        return;
      }
    }
    openDetail(item);
  }

  els.linkRelation.addEventListener('change', syncLinkAdd);
  els.linkTarget.addEventListener('change', syncLinkAdd);

  els.linkAdd.addEventListener('click', async () => {
    const issueId = linksView.issueId;
    const option = state.linkOptions[Number(els.linkRelation.value)];
    if (linksView.busy || readOnly() || issueId === null || !els.linkRelation.value || !option || !els.linkTarget.value) return;
    els.linkError.textContent = '';
    linksView.busy = true;
    syncLinkAdd();
    try {
      await api.post(`/api/issues/${issueId}/links`, {
        link_type: option.link_type,
        direction: option.direction,
        target_id: Number(els.linkTarget.value),
      });
      if (linksView.issueId === issueId) {
        els.linkRelation.value = '';
        els.linkTarget.value = '';
        await loadLinks(issueId);
      }
      historySaved(issueId);
    } catch (err) {
      // The form keeps its values so the user can correct them.
      if (linksView.issueId === issueId) els.linkError.textContent = `Could not add link: ${err.message}`;
    } finally {
      linksView.busy = false;
      syncLinkAdd();
    }
  });

  async function removeLink(link) {
    const issueId = linksView.issueId;
    if (linksView.busy || readOnly() || issueId === null) return;
    els.linkError.textContent = '';
    linksView.busy = true;
    syncLinkAdd();
    try {
      await api.del(`/api/issues/${issueId}/links/${link.id}`);
      if (linksView.issueId === issueId) {
        linksView.links = linksView.links.filter((l) => l.id !== link.id);
        renderLinks();
      }
      historySaved(issueId);
    } catch (err) {
      if (linksView.issueId === issueId) els.linkError.textContent = `Could not remove link: ${err.message}`;
    } finally {
      linksView.busy = false;
      syncLinkAdd();
    }
  }

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
    try {
      state.me = await session.ready; // the header is filled before the board loads
    } catch (err) {
      showMessage(err.message);
      return;
    }
    if (!projectId) {
      showMessage('No project selected.');
      return;
    }
    try {
      const [project, statuses, terminal, resolutions, types, priorities, users, historyFields, linkOptions] = await Promise.all([
        api.get(`/api/projects/${encodeURIComponent(projectId)}`),
        api.get('/api/statuses'),
        api.get('/api/terminal-status'),
        api.get('/api/resolutions'),
        api.get('/api/types'),
        api.get('/api/priorities'),
        api.get('/api/users'),
        api.get('/api/history-fields'),
        api.get('/api/link-types'),
      ]);
      Object.assign(state, {
        project,
        statuses,
        terminalStatus: terminal.status,
        resolutions,
        types,
        priorities: priorities.priorities,
        defaultPriority: priorities.default,
        users,
        historyFields,
        linkOptions,
      });
      renderHeader();
      fillHistoryFilter();
      await reloadItems();
    } catch (err) {
      showMessage(err.message);
    }
  })();
})();
