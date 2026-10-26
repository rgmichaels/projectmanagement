// Backlog page (docs/specs/sprints-and-backlog.md AC 28-38, 45; design:
// docs/design/sprints-and-backlog option A). Top to bottom: the active
// sprint, planned sprints, the Backlog, then the read-only Epics, Completed
// sprints and Sprint history sections. Rows reorder and move between
// containers by drag and drop (one PATCH of sprint_id and sprint_rank);
// quick-create rows add items at the bottom of a container; sprints are
// created, edited, started, completed and deleted from their headers.
// js/board.js loads the lists and items, runs the work item dialog and calls
// backlogPage.init(ctx) and backlogPage.render(). Sprint states and event
// labels come from the server; nothing here names a state, kind, status or
// type. Everything is inserted as text (ctx.el), never parsed as HTML.
const backlogPage = (() => {
  const RANK_STEP = 1000;
  const TITLE_MAX = 200;
  const HISTORY_PAGE = 50;

  let ctx = null;
  const view = {
    collapsed: new Set(), // container keys whose body is collapsed (this page view only)
    open: new Set(), // <details> keys the user opened: epics, done-sprints, history, c<id>
    dragId: null,
    focusQuick: null, // quick-create row to focus after the next render
    kinds: [], // sprint event kinds from the server
    history: { events: [], hasMore: false, loaded: false, loading: false, error: '' },
    historySeq: 0,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    root: $('backlog'),
    createSprint: $('create-sprint'),
    readonlyNotice: $('readonly-notice'),
    overdue: $('overdue-banner'),
    sprintDialog: $('sprint-dialog'),
    sprintForm: $('sprint-form'),
    sprintHeading: $('sprint-dialog-heading'),
    sprintName: $('sprint-name'),
    sprintEnd: $('sprint-end'),
    sprintNameError: $('sprint-name-error'),
    sprintEndError: $('sprint-end-error'),
    sprintFormError: $('sprint-form-error'),
    sprintSave: $('sprint-save'),
    sprintCancel: $('sprint-cancel'),
    deleteDialog: $('sprint-delete-dialog'),
    deleteHeading: $('sprint-delete-heading'),
    deleteText: $('sprint-delete-text'),
    deleteError: $('sprint-delete-error'),
    deleteCancel: $('sprint-delete-cancel'),
    deleteConfirm: $('sprint-delete-confirm'),
    completeDialog: $('sprint-complete-dialog'),
    completeHeading: $('sprint-complete-heading'),
    completeSummary: $('complete-summary'),
    completeChoices: $('complete-choices'),
    completeLegend: $('complete-legend'),
    completeNextChoice: $('complete-next-choice'),
    completeNext: $('complete-next'),
    completeNextSelect: $('complete-next-select'),
    completeNextHint: $('complete-next-hint'),
    completeNewName: $('complete-new-name'),
    completeNewHint: $('complete-new-hint'),
    completeAllDone: $('complete-all-done'),
    completeFootnote: $('complete-footnote'),
    completeError: $('complete-error'),
    completeCancel: $('complete-cancel'),
    completeConfirm: $('complete-confirm'),
  };

  // ---------- data helpers ----------

  const s = () => ctx.state;
  const projectId = () => s().project.id;
  const keyOf = (sprintId) => (sprintId === null ? 'backlog' : `s${sprintId}`);
  const bySprintRank = (a, b) => (a.sprint_rank ?? 0) - (b.sprint_rank ?? 0) || a.id - b.id;
  const itemsIn = (sprintId) =>
    s().items.filter((i) => !ctx.isEpicItem(i) && (i.sprint_id ?? null) === sprintId).sort(bySprintRank);
  const plannedSprints = () => s().sprints.filter((x) => !ctx.isActiveSprint(x) && !ctx.isFinalSprint(x));
  const completedSprints = () => s().sprints.filter(ctx.isFinalSprint);
  const kindLabel = (key) => (view.kinds.find((k) => k.key === key) || { label: key }).label;
  const initialStateName = () => ctx.stateWith('initial');

  // ---------- rendering ----------

  function typeBadge(item) {
    const type = ctx.typeOf(item.type);
    const color = type && type.color;
    return ctx.el(
      'span',
      { class: `type-badge${color ? '' : ' type-fallback'}`, style: color ? `--type-color: ${color}` : undefined, title: item.type },
      (type && type.label) || item.type
    );
  }

  function avatar(item) {
    const user = ctx.userById(item.assignee_id);
    return ctx.el(
      'span',
      { class: `avatar${user ? '' : ' unassigned'}`, title: user ? user.name : 'Unassigned' },
      user ? ctx.initials(user.name) : '?'
    );
  }

  // One row (AC 32). `writable`: a handle and draggable (not in a completed
  // sprint, not for Viewers or archived projects).
  function renderRow(item, writable) {
    const el = ctx.el;
    const epic = item.epic_id ? ctx.itemById(item.epic_id) : null;
    const done = ctx.isTerminal(item.status);
    const li = el(
      'li',
      { class: 'brow', 'data-id': item.id, draggable: writable ? 'true' : undefined },
      writable ? el('span', { class: 'brow-handle', 'aria-hidden': 'true' }, '⋮⋮') : null,
      typeBadge(item),
      el('span', { class: 'card-key' }, item.key),
      el('button', { type: 'button', class: 'brow-title' }, item.title),
      epic ? ctx.epicChip(epic) : null,
      el('span', { class: 'priority', title: `Priority: ${item.priority}` }, item.priority),
      el('span', { class: `status-pill${done ? ' is-done' : ''}`, title: `Status: ${item.status}` }, item.status),
      avatar(item)
    );
    // The title button is the keyboard target; a click anywhere else on the
    // row opens the item too (the epic chip opens its epic instead).
    li.addEventListener('click', (e) => {
      if (e.target.closest('.epic-chip')) return;
      ctx.openDetail(item);
    });
    if (writable) {
      li.addEventListener('dragstart', (e) => {
        view.dragId = item.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));
        requestAnimationFrame(() => li.classList.add('dragging'));
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        view.dragId = null;
        clearDragMarks();
      });
    }
    return li;
  }

  // The list of a container. `sprintId` null is the backlog; `writable`
  // false makes it read-only (completed sprint, Viewer, archived).
  function renderList(sprintId, label, emptyText, writable) {
    const el = ctx.el;
    const items = itemsIn(sprintId);
    const ul = el('ul', { class: 'brows', 'aria-label': `${label} work items`, 'data-sprint': sprintId === null ? '' : String(sprintId) });
    if (items.length) ul.append(...items.map((i) => renderRow(i, writable)));
    else ul.append(el('li', { class: 'brows-empty' }, emptyText));
    if (writable) {
      ul.addEventListener('dragover', (e) => onDragOver(e, ul));
      ul.addEventListener('dragleave', (e) => {
        if (!ul.contains(e.relatedTarget)) {
          ul.classList.remove('drop-target');
          removeIndicator(ul);
        }
      });
      ul.addEventListener('drop', (e) => onDrop(e, ul, sprintId));
    }
    return ul;
  }

  // Quick create (AC 34): a title and Create at the bottom of a container.
  function renderQuick(sprintId, label) {
    const el = ctx.el;
    const key = keyOf(sprintId);
    const id = `quick-${key}`;
    const input = el('input', { id, maxlength: String(TITLE_MAX), placeholder: 'What needs to be done?', autocomplete: 'off', 'data-key': key });
    const error = el('p', { class: 'error', role: 'alert', id: `${id}-error` });
    const form = el(
      'form',
      { class: 'quick', novalidate: true },
      el('label', { class: 'visually-hidden', for: id }, `Title for a new work item in ${sprintId === null ? 'the Backlog' : label}`),
      input,
      el('button', { type: 'submit', class: 'navy' }, 'Create'),
      error
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      quickCreate(sprintId, input, error);
    });
    return form;
  }

  function sprintMeta(sprint) {
    const el = ctx.el;
    const dates = sprintUtil.datesText(sprint);
    return [
      dates ? el('span', { class: 'sprint-meta' }, dates) : null,
      el('span', { class: 'sprint-meta' }, `${sprintUtil.count(sprint.item_count, 'item')} · ${sprint.done_count} done`),
    ];
  }

  function stateBadge(sprint) {
    const cls = ctx.isActiveSprint(sprint) ? ' state-active' : ctx.isFinalSprint(sprint) ? ' state-completed' : '';
    return ctx.el('span', { class: `badge${cls}` }, sprint.state);
  }

  function overdueBadge(sprint) {
    if (!sprintUtil.isOverdue(sprint, ctx.stateWith('active'))) return null;
    return ctx.el('span', { class: 'badge overdue' }, `⚠ Overdue · ended ${sprintUtil.agoText(sprint.end_date)}`);
  }

  function goalLine(sprint) {
    if (!sprint.goal) return null;
    return ctx.el('p', { class: 'sprint-goal' }, ctx.el('strong', {}, 'Goal:'), ` ${sprint.goal}`);
  }

  // Header actions (AC 35); none for Viewers and archived projects.
  function sprintActions(sprint) {
    const el = ctx.el;
    if (ctx.readOnly()) return null;
    const box = el('span', { class: 'sprint-actions' });
    if (ctx.isActiveSprint(sprint)) {
      box.append(
        el('button', { type: 'button', class: 'primary', onclick: () => openComplete(sprint) }, 'Complete sprint'),
        el('button', { type: 'button', onclick: () => openSprintForm(sprint) }, 'Edit')
      );
    } else {
      const active = ctx.activeSprint();
      if (active) box.append(el('span', { class: 'hint' }, `Complete ${active.name} first.`));
      box.append(
        el('button', { type: 'button', class: 'navy', disabled: Boolean(active), onclick: () => startSprint(sprint) }, 'Start sprint'),
        el('button', { type: 'button', onclick: () => openSprintForm(sprint) }, 'Edit'),
        el('button', { type: 'button', class: 'danger', onclick: () => openDelete(sprint) }, 'Delete')
      );
    }
    return box;
  }

  // The collapse toggle of a section (this page view only).
  function toggle(key, name, body) {
    const collapsed = view.collapsed.has(key);
    const btn = ctx.el(
      'button',
      { type: 'button', class: 'sprint-toggle', 'aria-expanded': String(!collapsed), 'aria-label': `${collapsed ? 'Expand' : 'Collapse'} ${name}` },
      collapsed ? '▸' : '▾'
    );
    btn.addEventListener('click', () => {
      const nowCollapsed = !view.collapsed.has(key);
      if (nowCollapsed) view.collapsed.add(key);
      else view.collapsed.delete(key);
      body.hidden = nowCollapsed;
      btn.setAttribute('aria-expanded', String(!nowCollapsed));
      btn.setAttribute('aria-label', `${nowCollapsed ? 'Expand' : 'Collapse'} ${name}`);
      btn.textContent = nowCollapsed ? '▸' : '▾';
    });
    return btn;
  }

  // The active sprint or a planned one (AC 32).
  function renderOpenSprint(sprint) {
    const el = ctx.el;
    const key = keyOf(sprint.id);
    const headingId = `sprint-${sprint.id}-name`;
    const writable = !ctx.readOnly();
    const empty = writable ? 'No work items. Drag work items here from the Backlog, or type a title below.' : 'No work items.';
    const body = el(
      'div',
      { class: 'sprint-body', hidden: view.collapsed.has(key) },
      goalLine(sprint),
      renderList(sprint.id, sprint.name, empty, writable),
      writable ? renderQuick(sprint.id, sprint.name) : null
    );
    return el(
      'section',
      { class: `sprint${ctx.isActiveSprint(sprint) ? ' is-active' : ''}`, 'aria-labelledby': headingId, 'data-key': key },
      el(
        'div',
        { class: 'sprint-head' },
        toggle(key, sprint.name, body),
        el('h2', { class: 'sprint-name', id: headingId }, sprint.name),
        stateBadge(sprint),
        overdueBadge(sprint),
        ...sprintMeta(sprint),
        sprintActions(sprint)
      ),
      body
    );
  }

  function renderBacklogSection() {
    const el = ctx.el;
    const key = keyOf(null);
    const writable = !ctx.readOnly();
    const n = itemsIn(null).length;
    const empty = writable ? 'The backlog is empty. Type a title below to add the first work item.' : 'The backlog is empty.';
    const body = el(
      'div',
      { class: 'sprint-body', hidden: view.collapsed.has(key) },
      renderList(null, 'Backlog', empty, writable),
      writable ? renderQuick(null, 'Backlog') : null
    );
    return el(
      'section',
      { class: 'sprint', 'aria-labelledby': 'backlog-name', 'data-key': key },
      el(
        'div',
        { class: 'sprint-head' },
        toggle(key, 'Backlog', body),
        el('h2', { class: 'sprint-name', id: 'backlog-name' }, 'Backlog'),
        el('span', { class: 'sprint-meta' }, sprintUtil.count(n, 'item'))
      ),
      body
    );
  }

  // A collapsed <details> section whose open state survives re-renders.
  function details(key, title, meta, extraClass, ...content) {
    const el = ctx.el;
    const node = el(
      'details',
      { class: `sprint${extraClass ? ` ${extraClass}` : ''}`, open: view.open.has(key), 'data-key': key },
      el('summary', { class: 'sprint-head' }, ...title, ...meta),
      ...content
    );
    node.addEventListener('toggle', () => {
      if (node.open) view.open.add(key);
      else view.open.delete(key);
    });
    return node;
  }

  // Epics (AC 31): read-only rows, "n of m children done" from every child.
  function renderEpics() {
    const el = ctx.el;
    const epics = s().items.filter(ctx.isEpicItem).sort((a, b) => a.number - b.number);
    const rows = epics.map((epic) => {
      const children = s().items.filter((i) => i.epic_id === epic.id);
      const done = children.filter((i) => ctx.isTerminal(i.status)).length;
      const li = el(
        'li',
        { class: 'brow', 'data-id': epic.id },
        typeBadge(epic),
        el('span', { class: 'card-key' }, epic.key),
        el('button', { type: 'button', class: 'brow-title' }, epic.title),
        el('span', { class: 'sprint-meta' }, `${done} of ${children.length} children done`)
      );
      li.addEventListener('click', () => ctx.openDetail(epic)); // opens on the Children tab
      return li;
    });
    return details(
      'epics',
      [el('h2', { class: 'sprint-name' }, 'Epics')],
      [el('span', { class: 'sprint-meta' }, String(epics.length))],
      '',
      rows.length ? el('ul', { class: 'brows', 'aria-label': 'Epics' }, ...rows) : el('p', { class: 'brows-empty' }, 'No epics.'),
      el('p', { class: 'hint sprint-foot' }, 'Epics are not part of a sprint. Create one from the board.')
    );
  }

  // Completed sprints (AC 30): each expandable to its items, read-only.
  function renderCompleted() {
    const el = ctx.el;
    const list = completedSprints();
    const inner = list.map((sprint) =>
      details(
        `c${sprint.id}`,
        [el('h2', { class: 'sprint-name' }, sprint.name), stateBadge(sprint)],
        sprintMeta(sprint),
        'is-completed',
        goalLine(sprint),
        renderList(sprint.id, sprint.name, 'No work items.', false)
      )
    );
    return details(
      'done-sprints',
      [el('h2', { class: 'sprint-name' }, 'Completed sprints')],
      [el('span', { class: 'sprint-meta' }, String(list.length))],
      '',
      ...(inner.length ? inner : [el('p', { class: 'brows-empty' }, 'No completed sprints yet.')])
    );
  }

  // Sprint history (AC 45): newest first, Show more, empty, error with Retry.
  function renderHistory() {
    const el = ctx.el;
    const h = view.history;
    let meta = 'Loading...';
    if (h.error && !h.loaded) meta = 'unavailable';
    else if (h.loaded) meta = `${h.events.length}${h.hasMore ? '+' : ''} event${h.events.length === 1 && !h.hasMore ? '' : 's'}`;
    const content = [];
    if (h.events.length) {
      content.push(el('ul', { class: 'hist-list', 'aria-label': 'Sprint history' }, ...h.events.map(renderEvent)));
    } else if (h.loaded) {
      content.push(el('p', { class: 'brows-empty' }, 'No sprint activity yet.'));
    } else if (h.loading) {
      content.push(el('p', { class: 'hist-loading', role: 'status' }, 'Loading...'));
    }
    if (h.error) {
      content.push(
        el(
          'div',
          { class: 'banner-warn hist-error', role: 'alert' },
          el('strong', {}, 'Could not load sprint history.'),
          el('span', {}, h.error),
          el('button', { type: 'button', class: 'spacer', onclick: () => loadHistory(!h.loaded) }, 'Retry')
        )
      );
    }
    if (h.hasMore) {
      content.push(
        el(
          'div',
          { class: 'hist-more' },
          el('button', { type: 'button', disabled: h.loading, onclick: () => loadHistory(false) }, h.loading ? 'Loading...' : 'Show more')
        )
      );
    }
    return details('history', [el('h2', { class: 'sprint-name' }, 'Sprint history')], [el('span', { class: 'sprint-meta' }, meta)], '', ...content);
  }

  function renderEvent(event) {
    const el = ctx.el;
    const parts = sprintUtil.historyParts(event, kindLabel(event.kind)).map((p) => (p.strong !== undefined ? el('strong', {}, p.strong) : p.text));
    return el(
      'li',
      { class: 'hist-item', 'data-id': event.id },
      el('span', { class: 'badge' }, kindLabel(event.kind)),
      el('span', { class: 'hist-text' }, ...parts),
      el('time', { class: 'hist-time', datetime: event.created_at, title: event.created_at }, timeFormat.localDateTime(event.created_at)),
      event.changes && event.changes.length
        ? el('ul', { class: 'hist-changes' }, ...event.changes.map((c) => el('li', {}, sprintUtil.changeLine(c))))
        : null
    );
  }

  // The page notices: read-only reason and the overdue banner.
  function renderNotices() {
    const el = ctx.el;
    const p = s().project;
    let text = '';
    if (p.archived) text = 'This project is archived; its work items are read-only.';
    else if (ctx.readOnly()) text = `You can view the backlog but not change it (your group is ${s().me ? s().me.group : 'read-only'}).`;
    els.readonlyNotice.textContent = text;
    els.readonlyNotice.hidden = !text;
    els.createSprint.hidden = ctx.readOnly();
    const active = ctx.activeSprint();
    const overdue = sprintUtil.isOverdue(active, ctx.stateWith('active'));
    els.overdue.hidden = !overdue;
    els.overdue.replaceChildren(
      ...(overdue
        ? [
            el('strong', {}, '⚠ Overdue'),
            el('span', {}, `${active.name} ended on ${active.end_date} (${sprintUtil.agoText(active.end_date)}). Complete it when the work is finished.`),
          ]
        : [])
    );
  }

  // Re-draws the whole page from ctx.state, keeping quick-create drafts,
  // focus and errors.
  function render() {
    if (!ctx || !s().project) return;
    const el = ctx.el;
    const drafts = new Map([...els.root.querySelectorAll('.quick input')].map((i) => [i.dataset.key, i.value]));
    const focusedKey = document.activeElement && document.activeElement.closest && document.activeElement.closest('.quick')
      ? document.activeElement.closest('.quick').querySelector('input').dataset.key
      : null;
    renderNotices();
    const nodes = [];
    const active = ctx.activeSprint();
    if (s().sprints.length === 0) {
      nodes.push(
        el(
          'div',
          { class: 'empty' },
          el('p', {}, el('strong', {}, 'No sprints yet.')),
          el('p', {}, 'Create a sprint to plan work, or add work items to the Backlog below and plan them later.'),
          ctx.readOnly() ? null : el('button', { type: 'button', class: 'primary', onclick: () => openSprintForm(null) }, 'Create sprint')
        )
      );
    }
    if (active) nodes.push(renderOpenSprint(active));
    for (const sprint of plannedSprints()) nodes.push(renderOpenSprint(sprint));
    nodes.push(renderBacklogSection(), renderEpics(), renderCompleted(), renderHistory());
    els.root.replaceChildren(...nodes);
    for (const input of els.root.querySelectorAll('.quick input')) {
      if (drafts.has(input.dataset.key)) input.value = drafts.get(input.dataset.key);
    }
    const refocus = view.focusQuick || focusedKey;
    view.focusQuick = null;
    if (refocus) {
      const input = els.root.querySelector(`.quick input[data-key="${refocus}"]`);
      if (input) input.focus();
    }
  }

  // ---------- drag and drop (AC 33) ----------

  let indicator = null;
  function removeIndicator(ul) {
    if (indicator && (!ul || indicator.parentNode === ul)) {
      indicator.remove();
      indicator = null;
    }
  }
  function clearDragMarks() {
    removeIndicator();
    for (const ul of els.root.querySelectorAll('.brows.drop-target')) ul.classList.remove('drop-target');
  }

  function onDragOver(e, ul) {
    if (view.dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    for (const other of els.root.querySelectorAll('.brows.drop-target')) if (other !== ul) other.classList.remove('drop-target');
    ul.classList.add('drop-target');
    if (!indicator) indicator = ctx.el('li', { class: 'drop-indicator', 'aria-hidden': 'true' });
    const rows = [...ul.querySelectorAll('.brow:not(.dragging)')];
    const before = rows.find((r) => {
      const box = r.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    if (before) {
      if (indicator.nextSibling !== before) ul.insertBefore(indicator, before);
    } else if (ul.lastChild !== indicator) {
      ul.append(indicator);
    }
  }

  function onDrop(e, ul, sprintId) {
    e.preventDefault();
    const id = view.dragId ?? Number(e.dataTransfer.getData('text/plain'));
    view.dragId = null;
    let next = indicator && indicator.parentNode === ul ? indicator.nextElementSibling : null;
    while (next && !next.classList.contains('brow')) next = next.nextElementSibling;
    clearDragMarks();
    const item = ctx.itemById(id);
    if (!item || ctx.isEpicItem(item)) return;
    moveItem(item, sprintId, next ? Number(next.dataset.id) : null);
  }

  // sprint_rank for placing `item` in a container before `beforeId` (or at
  // the end). With no gap left, the rank of the item it goes before: the
  // server renumbers the container with the moved item first among equals.
  function rankFor(list, beforeId) {
    if (beforeId !== null) {
      const idx = list.findIndex((i) => i.id === beforeId);
      const target = list[idx];
      const prev = list[idx - 1];
      if (!prev) return target.sprint_rank - RANK_STEP;
      return target.sprint_rank - prev.sprint_rank >= 2 ? Math.floor((prev.sprint_rank + target.sprint_rank) / 2) : target.sprint_rank;
    }
    const last = list[list.length - 1];
    return last ? last.sprint_rank + RANK_STEP : RANK_STEP;
  }

  async function moveItem(item, sprintId, beforeId) {
    if (beforeId === item.id) return;
    const from = item.sprint_id ?? null;
    const full = itemsIn(sprintId);
    const others = full.filter((i) => i.id !== item.id);
    if (from === sprintId) {
      const oldIndex = full.findIndex((i) => i.id === item.id);
      const newIndex = beforeId === null ? others.length : others.findIndex((i) => i.id === beforeId);
      if (oldIndex === newIndex) return; // dropped where it was
    }
    const patch = { sprint_id: sprintId, sprint_rank: rankFor(others, beforeId) };
    const snapshot = { ...item };
    Object.assign(item, patch); // optimistic, rolled back on failure
    render();
    try {
      Object.assign(item, await api.patch(`/api/issues/${item.id}`, patch));
      ctx.historySaved(item.id);
    } catch (err) {
      Object.assign(item, snapshot);
      render();
      ctx.showMessage(`Could not move ${item.key}: ${err.message}`);
      return;
    }
    try {
      await ctx.reloadItems();
    } catch (err) {
      ctx.showMessage(`${item.key} was moved, but the page could not be refreshed: ${err.message}`);
    }
  }

  // ---------- quick create (AC 34) ----------

  function setQuickError(input, error, text) {
    error.textContent = text;
    if (text) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  async function quickCreate(sprintId, input, error) {
    if (ctx.readOnly() || input.dataset.busy) return;
    const title = input.value.replace(/[\r\n]+/g, ' ').trim();
    if (!title) {
      setQuickError(input, error, 'Title is required.');
      input.focus();
      return;
    }
    if (title.length > TITLE_MAX) {
      setQuickError(input, error, `Title must be at most ${TITLE_MAX} characters.`);
      input.focus();
      return;
    }
    setQuickError(input, error, '');
    input.dataset.busy = '1';
    try {
      await api.post(`/api/projects/${projectId()}/issues`, { title, sprint_id: sprintId });
      input.value = '';
      view.focusQuick = keyOf(sprintId);
      await ctx.reloadItems();
    } catch (err) {
      setQuickError(input, error, err.message);
      input.focus();
    } finally {
      delete input.dataset.busy;
    }
  }

  // ---------- sprint actions ----------

  async function afterSprintChange() {
    await ctx.reloadItems();
    await loadHistory(true);
  }

  async function startSprint(sprint) {
    try {
      await api.post(`/api/sprints/${sprint.id}/start`);
      await afterSprintChange();
    } catch (err) {
      ctx.showMessage(`Could not start ${sprint.name}: ${err.message}`);
    }
  }

  // ----- create / edit dialog (AC 8, 9, 35) -----

  let editingSprint = null;

  function setFieldError(input, errorEl, text) {
    errorEl.textContent = text;
    if (text) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', errorEl.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  }

  async function openSprintForm(sprint) {
    if (ctx.readOnly()) return;
    editingSprint = sprint;
    const f = els.sprintForm.elements;
    els.sprintHeading.textContent = sprint ? `Edit ${sprint.name}` : 'Create sprint';
    els.sprintSave.textContent = sprint ? 'Save' : 'Create sprint';
    f.name.value = sprint ? sprint.name : '';
    f.goal.value = sprint ? sprint.goal : '';
    f.start_date.value = sprint && sprint.start_date ? sprint.start_date : '';
    f.end_date.value = sprint && sprint.end_date ? sprint.end_date : '';
    setFieldError(els.sprintName, els.sprintNameError, '');
    setFieldError(els.sprintEnd, els.sprintEndError, '');
    els.sprintFormError.textContent = '';
    els.sprintSave.disabled = false;
    els.sprintDialog.showModal();
    els.sprintName.focus();
    if (!sprint) {
      try {
        const { name } = await api.get(`/api/projects/${projectId()}/sprints/next-name`);
        if (editingSprint === null && !f.name.value) f.name.value = name;
      } catch {
        // the name stays empty; the user types one
      }
    }
  }

  els.sprintCancel.addEventListener('click', () => els.sprintDialog.close());

  els.sprintForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = els.sprintForm.elements;
    const values = {
      name: f.name.value.trim(),
      goal: f.goal.value.trim(),
      start_date: f.start_date.value || null,
      end_date: f.end_date.value || null,
    };
    let firstInvalid = null;
    setFieldError(els.sprintName, els.sprintNameError, values.name ? '' : 'Name is required.');
    if (!values.name) firstInvalid = els.sprintName;
    const badDates = values.start_date && values.end_date && values.end_date < values.start_date;
    setFieldError(els.sprintEnd, els.sprintEndError, badDates ? 'End date must not be before the start date.' : '');
    if (badDates && !firstInvalid) firstInvalid = els.sprintEnd;
    if (firstInvalid) {
      els.sprintFormError.textContent = 'Fix the fields marked above.';
      firstInvalid.focus();
      return;
    }
    els.sprintFormError.textContent = '';
    els.sprintSave.disabled = true;
    try {
      if (editingSprint) await api.patch(`/api/sprints/${editingSprint.id}`, values);
      else await api.post(`/api/projects/${projectId()}/sprints`, values);
      els.sprintDialog.close();
      await afterSprintChange();
    } catch (err) {
      els.sprintFormError.textContent = err.message;
    } finally {
      els.sprintSave.disabled = false;
    }
  });

  // ----- delete (AC 10, 35) -----

  let deleting = null;

  function openDelete(sprint) {
    if (ctx.readOnly()) return;
    deleting = sprint;
    els.deleteHeading.textContent = `Delete ${sprint.name}?`;
    const n = sprint.item_count;
    els.deleteText.textContent = n
      ? `Its ${sprintUtil.count(n, 'work item')} will return to the bottom of the backlog. This cannot be undone.`
      : 'It has no work items. This cannot be undone.';
    els.deleteError.textContent = '';
    els.deleteConfirm.disabled = false;
    els.deleteDialog.showModal();
    els.deleteCancel.focus();
  }

  els.deleteCancel.addEventListener('click', () => els.deleteDialog.close());
  els.deleteConfirm.addEventListener('click', async () => {
    if (!deleting) return;
    els.deleteConfirm.disabled = true;
    try {
      await api.del(`/api/sprints/${deleting.id}`);
      els.deleteDialog.close();
      await afterSprintChange();
    } catch (err) {
      els.deleteError.textContent = err.message;
    } finally {
      els.deleteConfirm.disabled = false;
    }
  });

  // ----- complete (AC 12, 36) -----

  let completing = null;
  const dispositionRadios = () => [...els.completeChoices.querySelectorAll('input[type="radio"]')];
  const chosenDisposition = () => {
    const r = dispositionRadios().find((x) => x.checked);
    return r ? r.value : null;
  };

  function syncComplete() {
    const choice = chosenDisposition();
    const unfinished = completing ? completing.item_count - completing.done_count : 0;
    els.completeNextSelect.disabled = choice !== 'next-sprint';
    els.completeNewName.disabled = choice !== 'new-sprint';
    for (const r of dispositionRadios()) r.closest('.choice').classList.toggle('is-disabled', r.disabled);
    let ready = unfinished === 0 || Boolean(choice);
    if (choice === 'new-sprint' && !els.completeNewName.value.trim()) ready = false;
    els.completeConfirm.disabled = !ready;
  }

  async function openComplete(sprint) {
    if (ctx.readOnly()) return;
    completing = sprint;
    const done = sprint.done_count;
    const unfinished = sprint.item_count - done;
    els.completeHeading.textContent = `Complete ${sprint.name}`;
    els.completeSummary.replaceChildren(
      ctx.el('strong', {}, sprint.name),
      `: ${sprintUtil.count(done, 'item')} done, ${unfinished} unfinished.`
    );
    els.completeChoices.hidden = unfinished === 0;
    els.completeAllDone.hidden = unfinished !== 0;
    els.completeFootnote.hidden = unfinished === 0;
    els.completeFootnote.textContent = `Done items stay in ${sprint.name} as a record.`;
    els.completeLegend.textContent = `What should happen to the ${unfinished === 1 ? 'unfinished item' : `${unfinished} unfinished items`}? Choose one.`;
    for (const r of dispositionRadios()) r.checked = false;
    const planned = plannedSprints();
    els.completeNextSelect.replaceChildren(...planned.map((p) => ctx.el('option', { value: String(p.id) }, `${p.name} (${p.state})`)));
    els.completeNext.disabled = planned.length === 0;
    els.completeNextSelect.hidden = planned.length === 0;
    els.completeNextHint.hidden = planned.length > 0;
    els.completeNewHint.textContent = `The new sprint is ${initialStateName()}. You can edit its name now.`;
    els.completeNewName.value = '';
    els.completeError.textContent = '';
    syncComplete();
    els.completeDialog.showModal();
    els.completeCancel.focus();
    try {
      const { name } = await api.get(`/api/projects/${projectId()}/sprints/next-name`);
      if (completing === sprint && !els.completeNewName.value) {
        els.completeNewName.value = name;
        syncComplete();
      }
    } catch {
      // the user types a name
    }
  }

  els.completeChoices.addEventListener('change', syncComplete);
  els.completeNewName.addEventListener('input', syncComplete);
  els.completeCancel.addEventListener('click', () => els.completeDialog.close());
  els.completeConfirm.addEventListener('click', async () => {
    if (!completing) return;
    const unfinished = completing.item_count - completing.done_count;
    const disposition = unfinished === 0 ? 'backlog' : chosenDisposition();
    if (!disposition) return;
    const body = { disposition };
    if (disposition === 'next-sprint') body.next_sprint_id = Number(els.completeNextSelect.value);
    if (disposition === 'new-sprint') body.new_sprint_name = els.completeNewName.value.trim();
    els.completeConfirm.disabled = true;
    els.completeError.textContent = '';
    try {
      await api.post(`/api/sprints/${completing.id}/complete`, body);
      els.completeDialog.close();
      await afterSprintChange();
    } catch (err) {
      els.completeError.textContent = `Could not complete the sprint: ${err.message} Nothing was changed.`;
      syncComplete();
    }
  });

  // ---------- sprint history (AC 45) ----------

  // reset: the first page (replacing the list); otherwise the next older page.
  async function loadHistory(reset) {
    const h = view.history;
    const seq = ++view.historySeq;
    const params = new URLSearchParams({ limit: String(HISTORY_PAGE) });
    if (!reset && h.events.length) params.set('before', String(h.events[h.events.length - 1].id));
    h.loading = true;
    h.error = '';
    render();
    try {
      const page = await api.get(`/api/projects/${projectId()}/sprint-history?${params}`);
      if (seq !== view.historySeq) return;
      h.events = reset ? page.events : h.events.concat(page.events);
      h.hasMore = page.has_more;
      h.loaded = true;
    } catch (err) {
      if (seq !== view.historySeq) return;
      h.error = err.message;
    } finally {
      if (seq === view.historySeq) h.loading = false;
    }
    if (seq === view.historySeq) render();
  }

  // ---------- start ----------

  function init(context) {
    ctx = context;
    els.createSprint.addEventListener('click', () => openSprintForm(null));
    api
      .get('/api/sprint-event-kinds')
      .then((meta) => {
        view.kinds = meta.kinds;
        render();
      })
      .catch(() => {}); // labels fall back to the stored kind
    loadHistory(true);
  }

  return { init, render };
})();
