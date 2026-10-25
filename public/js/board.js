// Board page: columns from the status list, cards styled from the type list,
// swimlanes (assignee / epic / priority), drag-and-drop and the detail view
// with its Epic (for epic types), Links and Attachments sections and
// Discussion and History tabs.
// Comments and the description are shown through js/richText.js (plain text
// plus pasted-image tokens); pasting an image uploads it as an attachment.
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
    attachmentTypes: { types: [], max_bytes: 0, max_per_item: 0 }, // GET /api/attachment-types
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
    description: document.getElementById('description-input'),
    descriptionEdit: document.getElementById('description-edit'),
    descriptionView: document.getElementById('description-view'),
    descriptionNote: document.getElementById('description-note'),
    descriptionImages: document.getElementById('description-images'),
    descriptionThumbs: document.getElementById('description-thumbs'),
    commentNote: document.getElementById('comment-note'),
    attachments: document.getElementById('attachments'),
    attachmentsHeading: document.getElementById('attachments-heading'),
    attachmentsNote: document.getElementById('attachments-note'),
    attachmentsEmpty: document.getElementById('attachments-empty'),
    attachmentControls: document.getElementById('attachment-controls'),
    attachmentAdd: document.getElementById('attachment-add'),
    attachmentInput: document.getElementById('attachment-input'),
    attachmentError: document.getElementById('attachment-error'),
    attachmentList: document.getElementById('attachment-list'),
    epicOpen: document.getElementById('epic-open'),
    epicView: document.getElementById('epic-view'),
    epicViewHeading: document.getElementById('epic-view-heading'),
    epicViewError: document.getElementById('epic-view-error'),
    epicProgressBar: document.getElementById('epic-progress-bar'),
    epicProgressFill: document.getElementById('epic-progress-fill'),
    epicProgressText: document.getElementById('epic-progress-text'),
    epicCounts: document.getElementById('epic-counts'),
    epicEmpty: document.getElementById('epic-empty'),
    epicChildren: document.getElementById('epic-children'),
    epicActions: document.getElementById('epic-actions'),
    epicAddTarget: document.getElementById('epic-add-target'),
    epicAdd: document.getElementById('epic-add'),
    epicCreateChild: document.getElementById('epic-create-child'),
    epicAddError: document.getElementById('epic-add-error'),
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
        epic ? epicChip(epic) : null,
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

  // Opens the epic's dialog. A click or Enter here is not a click on the card.
  function epicChip(epic) {
    const open = (e) => {
      e.stopPropagation();
      openLinked(epic.id);
    };
    return el(
      'span',
      {
        class: 'epic-chip',
        title: `Open ${epic.key} ${epic.title}`,
        role: 'button',
        tabindex: '0',
        draggable: 'false',
        onclick: open,
        onkeydown: (e) => { if (e.key === 'Enter') open(e); },
      },
      epic.key // text, never parsed as HTML
    );
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

  // A link to the saved epic of the open item, beside the dropdown.
  function syncEpicOpen(item) {
    const epic = item && item.epic_id ? itemById(item.epic_id) : null;
    els.epicOpen.hidden = !epic;
    els.epicOpen.textContent = epic ? `${epic.key} ${epic.title}` : ''; // text, never parsed as HTML
    els.epicOpen.onclick = epic ? () => openLinked(epic.id, els.detailError) : null;
  }

  function openDetail(item) {
    editing = item || null;
    epicView.returnTo = null; // set again by Create child
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
    syncEpicOpen(item);

    for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;
    els.historyField.disabled = false; // History stays usable when read-only
    els.saveBtn.hidden = ro;
    els.saveBtn.textContent = item ? 'Save' : 'Create';
    els.deleteBtn.hidden = ro || !item;
    els.activityTabs.hidden = !item;
    // Attachments first: the description and the thread render image tokens
    // against this item's attachment list.
    openAttachments(item);
    openDescription(item);
    openEpicView(item);
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
    if (readOnly() || pasteUploads.description > 0) return; // Save waits for a pasted image
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
        // Created from an epic's Create child: go back to that epic.
        const epic = epicView.returnTo !== null && (await reloadThenFind(epicView.returnTo));
        if (epic) {
          openDetail(epic);
          return;
        }
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
      const note = el('p', { class: 'paste-note', role: 'status', hidden: true });
      const saveBtn = el('button', { type: 'button', class: 'primary' }, 'Save');
      // Pasting an image here works as in the new-message box; Save waits for it.
      let editUploads = 0;
      editor.addEventListener('paste', (e) =>
        pasteImage(e, editor, note, (busy) => {
          editUploads += busy ? 1 : -1;
          saveBtn.disabled = editUploads > 0;
        })
      );
      const cancelBtn = el('button', { type: 'button' }, 'Cancel');
      saveBtn.addEventListener('click', () => saveEdit(comment, editor, error, saveBtn));
      cancelBtn.addEventListener('click', () => {
        discussion.editingId = null;
        renderThread();
      });
      li.append(editor, note, error, el('div', { class: 'actions message-actions' }, saveBtn, cancelBtn));
      return li;
    }

    // Text nodes plus image tokens as <img> (js/richText.js): never parsed as HTML.
    li.append(el('div', { class: 'message-body rich-text', 'data-comment-id': comment.id }, ...richNodes(comment.body)));
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
    els.commentNote.hidden = true;
    pasteUploads.comment = 0;
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
    if (discussion.posting || pasteUploads.comment > 0 || readOnly() || discussion.issueId === null) return;
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
      els.commentPost.disabled = pasteUploads.comment > 0;
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
    attachmentsView.issueId = null;
    epicView.issueId = null;
    epicView.returnTo = null;
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

  // ---------- epic view ----------
  // For an epic-type work item: progress, a count per status and the
  // children (GET /api/issues/:id/children). Add and Remove set the child's
  // epic through the usual PATCH (so its History records the change); Create
  // child opens the create form with this epic chosen. Not part of the work
  // item form: these handlers never submit it. Status and type names come
  // from the server; none are named here.

  const epicView = {
    issueId: null, // epic whose children are shown, or null
    data: null, // { items, summary } from the server
    loadSeq: 0,
    busy: false, // an add or remove is in flight
    returnTo: null, // epic to reopen after Create child saves
  };

  // Work items of this project that can be added: not an epic type and not
  // already a child of this epic. Items in another epic show its key.
  function fillEpicAddTarget() {
    const epicId = epicView.issueId;
    const candidates = state.items
      .filter((i) => !isEpicItem(i) && i.epic_id !== epicId)
      .sort((a, b) => a.number - b.number);
    const label = (i) => {
      const current = i.epic_id ? itemById(i.epic_id) : null;
      return current ? `${i.key} ${i.title} (${current.key})` : `${i.key} ${i.title}`;
    };
    const previous = els.epicAddTarget.value;
    els.epicAddTarget.replaceChildren(
      el('option', { value: '' }, 'Work item...'),
      ...candidates.map((i) => el('option', { value: String(i.id) }, label(i)))
    );
    // Keep the choice across a refresh while it is still a candidate.
    if (candidates.some((i) => String(i.id) === previous)) els.epicAddTarget.value = previous;
    syncEpicAdd();
  }

  function syncEpicAdd() {
    els.epicAdd.disabled = epicView.busy || !els.epicAddTarget.value;
  }

  function renderEpicChild(child) {
    const type = typeOf(child.type);
    const open = () => openLinked(child.id, els.epicViewError);
    const li = el(
      'li',
      { class: 'epic-child', 'data-id': child.id },
      el(
        'span',
        {
          class: 'type-icon epic-child-type',
          style: type && type.color ? `--type-color: ${type.color}` : undefined,
          title: (type && type.label) || child.type,
          'aria-hidden': 'true',
        },
        (type && type.icon) || '□'
      ),
      el('button', { type: 'button', class: 'link epic-child-key', onclick: open }, child.key), // text, never parsed as HTML
      el('button', { type: 'button', class: 'link epic-child-title', onclick: open }, child.title),
      el('span', { class: 'epic-child-status' }, child.status),
      el('span', { class: 'epic-child-assignee' }, child.assignee_name || 'Unassigned'),
      el('span', { class: 'priority epic-child-priority', title: `Priority: ${child.priority}` }, child.priority)
    );
    if (!readOnly()) {
      li.append(el('button', { type: 'button', class: 'link danger', onclick: () => removeEpicChild(child) }, 'Remove'));
    }
    return li;
  }

  function renderEpicView() {
    const data = epicView.data || { items: [], summary: { total: 0, done: 0, byStatus: [] } };
    const { total, done, byStatus } = data.summary;
    const percent = total ? Math.round((done / total) * 100) : 0;
    els.epicProgressFill.style.width = `${percent}%`;
    els.epicProgressBar.setAttribute('aria-valuemax', String(total));
    els.epicProgressBar.setAttribute('aria-valuenow', String(done));
    els.epicProgressText.textContent = `${done} of ${total} done`;
    els.epicCounts.replaceChildren(
      ...byStatus.map((s) =>
        el('li', { class: `epic-count${s.count ? '' : ' zero'}` }, el('span', {}, s.status), ' ', el('strong', {}, String(s.count)))
      )
    );
    els.epicEmpty.hidden = !epicView.data || data.items.length > 0;
    els.epicChildren.replaceChildren(...data.items.map(renderEpicChild));
  }

  // Shows the section when `item` is a saved epic-type work item and loads
  // its children; hides it otherwise.
  function openEpicView(item) {
    const show = Boolean(item) && isEpicItem(item);
    epicView.issueId = show ? item.id : null;
    epicView.data = null;
    epicView.busy = false;
    epicView.loadSeq += 1;
    els.epicView.hidden = !show;
    els.epicViewError.textContent = '';
    els.epicAddError.textContent = '';
    if (!show) return;
    const type = typeOf(item.type);
    const label = (type && type.label) || item.type;
    els.epicViewHeading.textContent = label;
    els.epicEmpty.textContent = `No items in this ${label.toLowerCase()} yet.`;
    els.epicActions.hidden = readOnly();
    els.epicAddTarget.value = '';
    fillEpicAddTarget();
    renderEpicView();
    loadEpicChildren(item.id);
  }

  async function loadEpicChildren(epicId) {
    const seq = ++epicView.loadSeq;
    try {
      const data = await api.get(`/api/issues/${epicId}/children`);
      if (seq !== epicView.loadSeq || epicView.issueId !== epicId) return; // a newer dialog is open
      epicView.data = data;
      els.epicViewError.textContent = '';
      renderEpicView();
    } catch (err) {
      if (seq === epicView.loadSeq && epicView.issueId === epicId) {
        els.epicViewError.textContent = `Could not load the ${els.epicViewHeading.textContent.toLowerCase()}'s items: ${err.message}`;
      }
    }
  }

  // Reloads the board's items (cards and swimlanes) and returns the item
  // with `id`, or null if it is gone or the reload failed.
  async function reloadThenFind(id) {
    try {
      await reloadItems();
    } catch (err) {
      showMessage(err.message);
      return null;
    }
    return itemById(id) || null;
  }

  // Sets a child's epic (null removes it), then refreshes the board and the
  // section without closing the dialog.
  async function setChildEpic(childId, epicIdOrNull, epicId) {
    await api.patch(`/api/issues/${childId}`, { epic_id: epicIdOrNull });
    historySaved(childId);
    await refreshCards();
    if (epicView.issueId !== epicId) return;
    fillEpicAddTarget();
    await loadEpicChildren(epicId);
  }

  els.epicAddTarget.addEventListener('change', syncEpicAdd);

  els.epicAdd.addEventListener('click', async () => {
    const epicId = epicView.issueId;
    if (epicView.busy || readOnly() || epicId === null || !els.epicAddTarget.value) return;
    els.epicAddError.textContent = '';
    epicView.busy = true;
    syncEpicAdd();
    try {
      await setChildEpic(Number(els.epicAddTarget.value), epicId, epicId);
      if (epicView.issueId === epicId) {
        els.epicAddTarget.value = '';
      }
    } catch (err) {
      // The form keeps its values so the user can try again.
      if (epicView.issueId === epicId) els.epicAddError.textContent = `Could not add: ${err.message}`;
    } finally {
      epicView.busy = false;
      syncEpicAdd();
    }
  });

  // No confirmation: the child is only taken out of the epic, not deleted.
  async function removeEpicChild(child) {
    const epicId = epicView.issueId;
    if (epicView.busy || readOnly() || epicId === null) return;
    els.epicAddError.textContent = '';
    epicView.busy = true;
    syncEpicAdd();
    try {
      await setChildEpic(child.id, null, epicId);
    } catch (err) {
      if (epicView.issueId === epicId) els.epicAddError.textContent = `Could not remove ${child.key}: ${err.message}`;
    } finally {
      epicView.busy = false;
      syncEpicAdd();
    }
  }

  // The create form, re-pointed in the same dialog, with this epic chosen and
  // the normal default type. After Create the dialog returns to the epic.
  els.epicCreateChild.addEventListener('click', () => {
    const epicId = epicView.issueId;
    if (readOnly() || epicId === null) return;
    openDetail(null);
    els.form.elements.epic_id.value = String(epicId);
    syncEpicField();
    epicView.returnTo = epicId;
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

  // Re-points the open dialog (or opens it) at a linked work item. A failure
  // is shown in `errorEl` (the Links error by default), or as a page message
  // when the dialog is closed.
  async function openLinked(id, errorEl = els.linkError) {
    let item = itemById(id);
    if (!item) {
      try {
        item = await api.get(`/api/issues/${id}`);
      } catch (err) {
        const text = `Could not open the linked work item: ${err.message}`;
        if (els.dialog.open) errorEl.textContent = text;
        else showMessage(text);
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

  // ---------- attachments ----------
  // Files attached to the open work item, newest first, and the pasted-image
  // flow that shares their upload. Not part of the work item form: these
  // handlers never submit, save or close it. Allowed types and limits are the
  // server's (GET /api/attachment-types); file names are always text.

  const attachmentsView = {
    issueId: null, // saved work item whose attachments are shown, or null
    list: [], // newest first, as GET /api/issues/:id/attachments returns them
    pending: [], // [{ id, name }] uploads in flight, shown as "Uploading..."
    loaded: false,
    loadSeq: 0,
    lookups: new Map(), // id -> attachment of any item, or null when gone (for image tokens)
  };
  let pendingSeq = 0;

  // `2.3 MB`
  function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const canAttach = () => attachmentsView.issueId !== null && !readOnly();

  // What an image token with this id becomes (see richText.segments): an
  // image only for an inline attachment of the open item; `[image removed]`
  // once the server says the id is gone; otherwise the raw token text (another
  // item's attachment, or not looked up yet).
  function resolveToken(id) {
    const v = attachmentsView;
    const own = v.list.find((a) => a.id === id);
    if (own) return own.inline ? 'image' : 'raw';
    if (!v.loaded) return 'raw';
    if (!v.lookups.has(id)) {
      lookupAttachment(id);
      return 'raw';
    }
    const found = v.lookups.get(id);
    if (found === null) return 'removed';
    return found && found.issue_id === v.issueId && found.inline ? 'image' : 'raw';
  }

  // An id referenced by a token but not in this item's list: ask the server
  // whether it still exists (and where), then re-render the text.
  async function lookupAttachment(id) {
    const v = attachmentsView;
    const issueId = v.issueId;
    v.lookups.set(id, undefined); // in flight
    let found;
    try {
      found = await api.get(`/api/attachments/${id}`);
    } catch (err) {
      found = err.status === 404 ? null : undefined; // other errors: keep the raw text
    }
    if (v.issueId !== issueId) return;
    v.lookups.set(id, found);
    refreshRichText();
  }

  const richNodes = (text) => richText.render(document, text, resolveToken);

  // Re-renders the description read view, comment bodies (in place, so an
  // open message edit keeps its cursor) and the description image strip.
  function refreshRichText() {
    renderDescriptionView();
    for (const body of els.thread.querySelectorAll('.message-body[data-comment-id]')) {
      const comment = discussion.comments.find((c) => c.id === Number(body.dataset.commentId));
      if (comment) body.replaceChildren(...richNodes(comment.body));
    }
    renderDescriptionImages();
  }

  function renderAttachmentRow(a) {
    const own = !readOnly() && Boolean(state.me) && a.uploader_id === state.me.id;
    const preview = richText.previewUrl(a.id);
    return el(
      'li',
      { class: 'attachment-row', 'data-id': a.id },
      a.inline
        ? el(
            'a',
            { href: preview, target: '_blank', rel: 'noopener', class: 'attachment-thumb-link', title: 'Open the full image' },
            el('img', { src: preview, alt: '', class: 'attachment-thumb', loading: 'lazy' })
          )
        : null,
      el(
        'div',
        { class: 'attachment-info' },
        el('span', { class: 'attachment-name' }, a.filename), // text, never parsed as HTML
        el(
          'span',
          { class: 'attachment-meta' },
          `${humanSize(a.size_bytes)} · `,
          el('span', {}, a.uploader_name),
          ' · ',
          el('span', { class: 'relative-time', 'data-time': a.created_at, title: a.created_at }, timeFormat.relativeTime(a.created_at))
        )
      ),
      el('a', { href: `/api/attachments/${a.id}/download`, class: 'attachment-download', download: true }, 'Download'),
      own ? el('button', { type: 'button', class: 'link danger', onclick: () => deleteAttachment(a) }, 'Delete') : null
    );
  }

  function renderAttachments() {
    const v = attachmentsView;
    els.attachmentsHeading.textContent = `Attachments (${v.list.length})`;
    els.attachmentsEmpty.hidden = v.issueId === null || !v.loaded || v.list.length > 0 || v.pending.length > 0;
    els.attachmentList.replaceChildren(
      ...v.pending.map((p) =>
        el(
          'li',
          { class: 'attachment-row pending' },
          el('div', { class: 'attachment-info' }, el('span', { class: 'attachment-name' }, p.name), el('span', { class: 'attachment-meta' }, 'Uploading...'))
        )
      ),
      ...v.list.map(renderAttachmentRow)
    );
    refreshRichText();
  }

  // Shows the section; for a new work item (no id yet) only "Save the work
  // item first." with no upload control.
  function openAttachments(item) {
    Object.assign(attachmentsView, { issueId: item ? item.id : null, list: [], pending: [], loaded: false, lookups: new Map() });
    attachmentsView.loadSeq += 1;
    els.attachments.hidden = false;
    els.attachmentsNote.hidden = Boolean(item);
    els.attachmentControls.hidden = !item || readOnly();
    els.attachmentError.textContent = '';
    els.attachmentInput.value = '';
    els.attachmentInput.accept = state.attachmentTypes.types.map((t) => `.${t.extension}`).join(',');
    renderAttachments();
    if (item) loadAttachments(item.id);
  }

  async function loadAttachments(issueId) {
    const seq = ++attachmentsView.loadSeq;
    try {
      const list = await api.get(`/api/issues/${issueId}/attachments`);
      if (seq !== attachmentsView.loadSeq || attachmentsView.issueId !== issueId) return; // a newer dialog is open
      attachmentsView.list = list;
      attachmentsView.loaded = true;
      renderAttachments();
    } catch (err) {
      if (attachmentsView.issueId === issueId) els.attachmentError.textContent = `Could not load attachments: ${err.message}`;
    }
  }

  // Uploads one file (or pasted image) to `issueId` and adds it to the list.
  // Rejects with the server's message (too large, type not allowed, ...).
  async function uploadAttachment(issueId, file, filename) {
    const created = await api.upload(`/api/issues/${issueId}/attachments`, file, filename);
    if (attachmentsView.issueId === issueId) {
      attachmentsView.list.unshift(created);
      renderAttachments();
    }
    historySaved(issueId);
    return created;
  }

  // Uploads the chosen or dropped files one after another; a rejected file
  // shows the server's message and the others still upload.
  async function addFiles(fileList) {
    const issueId = attachmentsView.issueId;
    const files = [...fileList];
    if (!canAttach() || files.length === 0) return;
    els.attachmentError.textContent = '';
    const queue = files.map((file) => ({ id: ++pendingSeq, name: file.name, file }));
    attachmentsView.pending.push(...queue);
    renderAttachments();
    const problems = [];
    for (const p of queue) {
      try {
        await uploadAttachment(issueId, p.file, p.file.name);
      } catch (err) {
        problems.push(`${p.name}: ${err.message}`);
      } finally {
        attachmentsView.pending = attachmentsView.pending.filter((x) => x.id !== p.id);
        if (attachmentsView.issueId === issueId) renderAttachments();
      }
    }
    if (attachmentsView.issueId === issueId) els.attachmentError.textContent = problems.join('\n');
  }

  async function deleteAttachment(a) {
    const issueId = attachmentsView.issueId;
    if (!canAttach()) return;
    if (!confirm(`Delete the attachment "${a.filename}"? This cannot be undone.`)) return;
    els.attachmentError.textContent = '';
    try {
      await api.del(`/api/attachments/${a.id}`);
      if (attachmentsView.issueId === issueId) {
        attachmentsView.list = attachmentsView.list.filter((x) => x.id !== a.id);
        attachmentsView.lookups.set(a.id, null); // its tokens now read [image removed]
        renderAttachments();
      }
      historySaved(issueId);
    } catch (err) {
      if (attachmentsView.issueId === issueId) els.attachmentError.textContent = `Could not delete: ${err.message}`;
    }
  }

  els.attachmentAdd.addEventListener('click', () => els.attachmentInput.click());
  els.attachmentInput.addEventListener('change', () => {
    const files = [...els.attachmentInput.files];
    els.attachmentInput.value = ''; // the same file can be chosen again
    addFiles(files);
  });

  // Drag-and-drop of files onto the section (not onto the text boxes).
  const draggingFiles = (e) => Boolean(e.dataTransfer) && [...e.dataTransfer.types].includes('Files');
  els.attachments.addEventListener('dragover', (e) => {
    if (!canAttach() || !draggingFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    els.attachments.classList.add('drop-target');
  });
  els.attachments.addEventListener('dragleave', (e) => {
    if (!els.attachments.contains(e.relatedTarget)) els.attachments.classList.remove('drop-target');
  });
  els.attachments.addEventListener('drop', (e) => {
    els.attachments.classList.remove('drop-target');
    if (!canAttach() || !draggingFiles(e)) return;
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  });

  // ----- pasted images -----

  // Uploads in flight per text box, which keep its Post or Save disabled.
  const pasteUploads = { comment: 0, description: 0 };

  // The first image file on the clipboard of a paste event, or null.
  function clipboardImage(e) {
    const items = e.clipboardData ? [...e.clipboardData.items] : [];
    const item = items.find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    return item ? item.getAsFile() : null;
  }

  // `pasted-image-20261025-141503.<ext>`, the extension taken from the
  // server's type list for the clipboard's MIME type.
  function pastedImageName(file) {
    const known = state.attachmentTypes.types.find((t) => t.mime === file.type);
    const ext = known ? known.extension : file.type.split('/')[1].replace(/[^a-z0-9]/gi, '');
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `pasted-image-${stamp}.${ext}`;
  }

  const showNote = (note, text) => {
    note.textContent = text;
    note.hidden = !text;
  };

  // Paste handler for a text box. Plain text pastes as usual. An image is
  // uploaded as an attachment of the open work item and its token is
  // inserted where the cursor was; on failure nothing is inserted and the
  // server's message is shown. setBusy(true/false) brackets the upload.
  async function pasteImage(e, textarea, note, setBusy) {
    const file = clipboardImage(e);
    if (!file) return;
    e.preventDefault(); // the default paste would add nothing useful
    if (attachmentsView.issueId === null) {
      showNote(note, 'Save the work item first.');
      return;
    }
    if (readOnly()) return;
    const issueId = attachmentsView.issueId;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBusy(true);
    showNote(note, 'Uploading image...');
    try {
      const created = await uploadAttachment(issueId, file, pastedImageName(file));
      if (attachmentsView.issueId !== issueId || !textarea.isConnected) return;
      const token = `![image](attachment:${created.id})`;
      const text = textarea.value;
      textarea.value = text.slice(0, start) + token + text.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + token.length;
      textarea.dispatchEvent(new Event('input')); // keeps drafts and the image strip in step
      showNote(note, '');
    } catch (err) {
      if (attachmentsView.issueId === issueId) showNote(note, `Could not upload image: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  els.commentBody.addEventListener('paste', (e) =>
    pasteImage(e, els.commentBody, els.commentNote, (busy) => {
      pasteUploads.comment += busy ? 1 : -1;
      els.commentPost.disabled = discussion.posting || pasteUploads.comment > 0;
    })
  );
  els.description.addEventListener('paste', (e) =>
    pasteImage(e, els.description, els.descriptionNote, (busy) => {
      pasteUploads.description += busy ? 1 : -1;
      els.saveBtn.disabled = pasteUploads.description > 0;
    })
  );

  // ----- description: read view and edit view -----

  // A saved item opens on the read view (Edit switches to the textarea); a
  // new item opens on the textarea; an archived project shows the read view only.
  function openDescription(item) {
    pasteUploads.description = 0;
    els.saveBtn.disabled = false;
    showNote(els.descriptionNote, '');
    setDescriptionEditing(!item);
  }

  function setDescriptionEditing(editingText) {
    els.descriptionView.hidden = editingText;
    els.descriptionEdit.hidden = editingText || readOnly();
    els.description.hidden = !editingText;
    if (editingText) renderDescriptionImages();
    else renderDescriptionView();
    if (!editingText) els.descriptionImages.hidden = true;
  }

  function renderDescriptionView() {
    if (els.descriptionView.hidden) return;
    const text = editing ? editing.description : '';
    if (text) {
      els.descriptionView.classList.remove('empty-text');
      els.descriptionView.replaceChildren(...richNodes(text));
    } else {
      els.descriptionView.classList.add('empty-text');
      els.descriptionView.textContent = readOnly() ? 'No description.' : 'No description. Click Edit to add one.';
    }
  }

  // Thumbnails of the images whose tokens are in the textarea, so the author
  // sees that a paste worked.
  function renderDescriptionImages() {
    if (els.description.hidden) return;
    const ids = richText.tokenIds(els.description.value).filter((id) => resolveToken(id) === 'image');
    els.descriptionImages.hidden = ids.length === 0;
    els.descriptionThumbs.replaceChildren(
      ...ids.map((id) =>
        el(
          'a',
          { href: richText.previewUrl(id), target: '_blank', rel: 'noopener', class: 'attachment-thumb-link' },
          el('img', { src: richText.previewUrl(id), alt: '', class: 'attachment-thumb' })
        )
      )
    );
  }

  els.descriptionEdit.addEventListener('click', () => {
    if (readOnly()) return;
    setDescriptionEditing(true);
    els.description.focus();
  });
  els.description.addEventListener('input', renderDescriptionImages);

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
      const [project, statuses, terminal, resolutions, types, priorities, users, historyFields, linkOptions, attachmentTypes] = await Promise.all([
        api.get(`/api/projects/${encodeURIComponent(projectId)}`),
        api.get('/api/statuses'),
        api.get('/api/terminal-status'),
        api.get('/api/resolutions'),
        api.get('/api/types'),
        api.get('/api/priorities'),
        api.get('/api/users'),
        api.get('/api/history-fields'),
        api.get('/api/link-types'),
        api.get('/api/attachment-types'),
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
        attachmentTypes,
      });
      renderHeader();
      fillHistoryFilter();
      await reloadItems();
    } catch (err) {
      showMessage(err.message);
    }
  })();
})();
