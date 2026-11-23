// Board page: columns from the status list, cards styled from the type list,
// swimlanes (assignee / epic / priority), drag-and-drop and the detail view
// (docs/specs/task-dialog-redesign.md): a band with the key and title, a
// status track, properties and description, then one tab bar for Children
// (epic types only), Discussion, History, Links and Attachments.
// Comments and the description are shown through js/richText.js (plain text
// plus pasted-image tokens); pasting an image uploads it as an attachment.
// Status, type, priority, resolution and link type names all come from the
// API; none are named here. The terminal status and the default resolution are the server's.
// What the signed-in user may change comes from their group's permission
// names (session.can); the board never looks at a group name.
// Search and filters (js/filters.js) narrow what is drawn; state.items stays
// the full list, so lanes and drag ranks are computed from every item.
// Sprints (docs/specs/sprints-and-backlog.md): the board draws only the
// active sprint's non-epic items (boardItems), with the sprint bar and the
// overdue banner above it; with no active sprint it shows an empty state.
// Sprint states come from GET /api/sprint-states; none are named here.
// The same script runs the work item dialog on the Backlog page
// (backlog.html, body data-page="backlog"), where js/backlog.js draws the
// page and this file hands it what it needs (backlogPage.init), and on the
// Sprints page (sprints.html, data-page="sprints"; js/sprintView.js,
// sprintsPage.init). The current project comes from js/projectScope.js.
// Time tracking (docs/specs/time-tracking.md): the Estimate field in the
// dialog's properties, the Time tab and the sprint figure on the sprint bar;
// js/backlog.js and js/sprintView.js draw the same figure through
// sprintFigure. The texts come from js/time.js (timeFormat).
// Timeline (docs/specs/gantt-chart.md): the dialog's Start date and Due date
// fields (AC 6), and the Timeline page (timeline.html, data-page="timeline";
// js/timeline.js, timelinePage.init).
// Copy board (docs/specs/copy-board-as-table.md): the Board page only; the
// table and plain text are built by js/boardCopy.js from the lanes drawn.
(() => {
  const GROUP_BY_STORAGE_KEY = 'pm.groupBy';
  const FILTERS_STORAGE_PREFIX = 'pm.filters.';
  const NOTICE_MS = 8000;
  const COMMENT_MAX_LENGTH = 2000;
  const RELATIVE_REFRESH_MS = 60 * 1000;
  const RANK_STEP = 1000;

  let projectId = null; // set from projectScope.ready
  const page = document.body.dataset.page || 'board'; // board, backlog, sprints or timeline
  const onBoard = page === 'board';

  // localStorage may be missing or throw (private mode, blocked storage);
  // the board works without it.
  const { storageGet, storageSet } = projectScope;

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
    me: null, // the signed-in user { id, name, username, group, permissions }
    items: [],
    sprints: [], // GET /api/projects/:id/sprints (with counts)
    sprintStates: [], // GET /api/sprint-states: [{ name, initial, active, final }]
    groupBy: storageGet(GROUP_BY_STORAGE_KEY) || 'none',
    filters: boardFilters.emptyFilters(), // search text and dropdowns, per project
    collapsed: new Set(),
    dragId: null,
  };

  const els = {
    title: document.getElementById('project-title'),
    status: document.getElementById('project-status'),
    archivedBadge: document.getElementById('archived-badge'),
    groupBy: document.getElementById('group-by'),
    copyBoardWrap: document.getElementById('copy-board-wrap'),
    copyBoard: document.getElementById('copy-board'),
    copyBoardStatus: document.getElementById('copy-board-status'),
    createBtn: document.getElementById('create-item'),
    message: document.getElementById('message'),
    board: document.getElementById('board'),
    dialog: document.getElementById('detail'),
    form: document.getElementById('detail-form'),
    detailHeading: document.getElementById('detail-heading'),
    keychip: document.getElementById('detail-keychip'),
    newLabel: document.getElementById('detail-new-label'),
    closeX: document.getElementById('detail-x'),
    titleInput: document.getElementById('title-input'),
    titleError: document.getElementById('title-error'),
    banner: document.getElementById('detail-banner'),
    statusField: document.getElementById('status-field'),
    statusSteps: document.getElementById('status-steps'),
    resolutionField: document.getElementById('resolution-field'),
    completedField: document.getElementById('completed-field'),
    completedInput: document.getElementById('completed-input'),
    epicField: document.getElementById('epic-field'),
    epicLabel: document.getElementById('epic-label'),
    detailError: document.getElementById('detail-error'),
    saveBtn: document.getElementById('detail-save'),
    deleteBtn: document.getElementById('detail-delete'),
    closeBtn: document.getElementById('detail-close'),
    discussion: document.getElementById('discussion'),
    commentForm: document.getElementById('comment-form'),
    postingAs: document.getElementById('posting-as'),
    reporter: document.getElementById('reporter'),
    commentBody: document.getElementById('comment-body'),
    commentError: document.getElementById('comment-error'),
    commentPost: document.getElementById('comment-post'),
    thread: document.getElementById('thread'),
    threadEmpty: document.getElementById('thread-empty'),
    activityTabs: document.getElementById('activity-tabs'),
    tabChildren: document.getElementById('tab-children'),
    tabDiscussion: document.getElementById('tab-discussion'),
    tabHistory: document.getElementById('tab-history'),
    tabLinks: document.getElementById('tab-links'),
    tabTime: document.getElementById('tab-time'),
    tabAttachments: document.getElementById('tab-attachments'),
    counts: {
      children: document.getElementById('count-children'),
      discussion: document.getElementById('count-discussion'),
      history: document.getElementById('count-history'),
      links: document.getElementById('count-links'),
      time: document.getElementById('count-time'),
      attachments: document.getElementById('count-attachments'),
    },
    estimateField: document.getElementById('estimate-field'),
    estimateEdit: document.getElementById('estimate-edit'),
    estimateInput: document.getElementById('estimate-input'),
    estimateRo: document.getElementById('estimate-ro'),
    estimateError: document.getElementById('estimate-error'),
    time: document.getElementById('time'),
    timeSum: document.getElementById('time-sum'),
    timeForm: document.getElementById('time-form'),
    timeHours: document.getElementById('time-hours'),
    timeDate: document.getElementById('time-date'),
    timeNote: document.getElementById('time-note'),
    timeLog: document.getElementById('time-log'),
    timeError: document.getElementById('time-error'),
    timeListHint: document.getElementById('time-list-hint'),
    timeLoading: document.getElementById('time-loading'),
    timeLoadError: document.getElementById('time-load-error'),
    timeLoadErrorText: document.getElementById('time-load-error-text'),
    timeRetry: document.getElementById('time-retry'),
    timeEmpty: document.getElementById('time-empty'),
    timeList: document.getElementById('time-list'),
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
    epicSummary: document.getElementById('epic-summary'),
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
    filterText: document.getElementById('filter-text'),
    filterSelects: {
      assignee: document.getElementById('filter-assignee'),
      type: document.getElementById('filter-type'),
      priority: document.getElementById('filter-priority'),
      status: document.getElementById('filter-status'),
      resolution: document.getElementById('filter-resolution'),
    },
    filterResolutionField: document.getElementById('filter-resolution-field'),
    filterClear: document.getElementById('filter-clear'),
    filterCount: document.getElementById('filter-count'),
    filterNotice: document.getElementById('filter-notice'),
    filterNoticeText: document.getElementById('filter-notice-text'),
    filterNoticeDismiss: document.getElementById('filter-notice-dismiss'),
    sprintBar: document.getElementById('sprint-bar'),
    overdueBanner: document.getElementById('overdue-banner'),
    filterBar: document.getElementById('filter-bar'),
    backlogNotice: document.getElementById('backlog-notice'),
    backlogNoticeText: document.getElementById('backlog-notice-text'),
    backlogNoticeLink: document.getElementById('backlog-notice-link'),
    backlogNoticeDismiss: document.getElementById('backlog-notice-dismiss'),
    sprintField: document.getElementById('sprint-field'),
    sprintSelect: document.getElementById('sprint-select'),
    sprintNa: document.getElementById('sprint-na'),
    sprintNote: document.getElementById('sprint-note'),
    sprintWhere: document.getElementById('sprint-where'),
    sprintAdded: document.getElementById('sprint-added'),
    startDate: document.getElementById('start-date-input'),
    dueDate: document.getElementById('due-date-input'),
    datesHint: document.getElementById('dates-hint'),
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

  // Nothing on the board can be changed when the project is archived or the
  // user's group lacks `write` (a Viewer): no create, drag, edit, comment,
  // link or attach controls. Reading everything still works. The user's
  // group in this project applies when they have one (project permissions).
  const readOnly = () => Boolean(state.project && state.project.archived) || !session.can('write', projectId);
  const canDeleteItems = () => session.can('delete-item', projectId);
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

  // A dot in the type's colour (dialog rows); the type name is its label.
  function typeDot(type, name) {
    return el('span', {
      class: 'type-dot',
      style: type && type.color ? `--tc: ${type.color}` : undefined,
      role: 'img',
      'aria-label': (type && type.label) || name,
      title: (type && type.label) || name,
    });
  }

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).slice(0, 2).join('');
  }

  // ----- sprints -----
  // State names come from the server's list, by flag.
  const stateWith = (flag) => {
    const s = state.sprintStates.find((x) => x[flag]);
    return s ? s.name : null;
  };
  const isActiveSprint = (sprint) => Boolean(sprint) && sprint.state === stateWith('active');
  const isFinalSprint = (sprint) => Boolean(sprint) && sprint.state === stateWith('final');
  const activeSprint = () => state.sprints.find(isActiveSprint) || null;
  const sprintById = (id) => state.sprints.find((s) => s.id === id) || null;
  const backlogUrl = () => projectScope.pageUrl('backlog.html', projectId);

  // The "Added after start" badge (docs/specs/sprint-scope-change.md AC 26;
  // design badges.html) for an item the server flags (added_after_start),
  // else null. `short`: the Board card form, "Added" with the full text as
  // its tooltip and hidden accessible name.
  const ADDED_LATE = 'Added after start';
  const ADDED_LATE_SHORT = 'Added';
  function addedBadge(item, { short = false } = {}) {
    if (!item || !item.added_after_start) return null;
    if (!short) return el('span', { class: 'badge added-late' }, ADDED_LATE);
    return el(
      'span',
      { class: 'badge added-late short', title: ADDED_LATE },
      el('span', { 'aria-hidden': 'true' }, ADDED_LATE_SHORT),
      el('span', { class: 'visually-hidden' }, ADDED_LATE)
    );
  }

  // The board's items: the active sprint's non-epic items (none without an
  // active sprint). Epics are never cards (AC 24).
  function boardItems() {
    const active = activeSprint();
    if (!active) return [];
    return state.items.filter((i) => i.sprint_id === active.id && !isEpicItem(i));
  }

  // The sprint figure tag (time-tracking AC 16, 19, 20, 53): `12 h logged /
  // 20 h est.` from the sprint's server totals. `note` adds `(n not
  // estimated)` (Sprints and Backlog pages, not the Board bar); `live` makes
  // it a polite status (the Backlog, where estimates change in place).
  function sprintFigure(sprint, { note = false, live = false } = {}) {
    const parts = timeFormat.sprintFigureParts(sprint.time_spent_hours, sprint.estimate_hours, note ? sprint.unestimated_count : 0);
    return el(
      'span',
      { class: `sprint-fig${parts.over ? ' is-over' : ''}`, role: live ? 'status' : undefined },
      parts.main,
      parts.note ? el('span', { class: 'fig-note' }, parts.note) : null
    );
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

  // Lanes are computed client-side from every item on the board (the active
  // sprint), so an item that is filtered out still keeps its lane; each lane
  // then holds only the `visible` items. An epic gets a lane only when one of
  // its children is on the board (AC 29); the epic itself comes from the full
  // list. While a search or filter is active, empty lanes are hidden.
  function computeLanes(visible) {
    const items = boardItems();
    const lanes = [];
    if (state.groupBy === 'assignee') {
      const used = new Set(items.map((i) => i.assignee_id).filter((v) => v !== null));
      for (const u of state.users.filter((x) => used.has(x.id))) {
        lanes.push({ key: `u${u.id}`, label: u.name, value: u.id });
      }
      lanes.push({ key: 'none', label: 'Unassigned', value: null });
    } else if (state.groupBy === 'epic') {
      const used = new Set(items.map((i) => i.epic_id).filter((v) => v !== null));
      const epics = state.items.filter((i) => isEpicItem(i) && used.has(i.id)).sort((a, b) => a.number - b.number);
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
      lane.items = state.groupBy === 'none' ? visible : visible.filter((i) => laneValueOf(i) === lane.value);
    }
    if (state.groupBy !== 'none' && boardFilters.isActive(state.filters)) {
      return lanes.filter((lane) => lane.items.length > 0);
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
        addedBadge(item, { short: true }),
        epic ? epicChip(epic) : null,
        el('span', { class: 'priority', title: `Priority: ${item.priority}` }, item.priority),
        doneRow(item),
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

  // Completed date (docs/specs/completed-date-on-cards.md AC 12-14): the
  // server's completed_at as `✓ Completed Nov 20`, full time and completer in
  // the title. Null outside the terminal status or without a date. No
  // handlers, so drag and click go to the card.
  function completedLabel(item) {
    if (!isTerminal(item.status)) return null;
    const text = completedDate.cardText(item.completed_at);
    if (!text) return null;
    return el('span', { class: 'completed', title: completedDate.tooltip(item.completed_at, item.completed_by) }, text);
  }

  // The card's last meta row (design: .card-done, terminal cards only): the
  // resolution label and the completed line.
  function doneRow(item) {
    const parts = [resolutionLabel(item), completedLabel(item)].filter(Boolean);
    return parts.length ? el('span', { class: 'card-done' }, ...parts) : null;
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
    if (!onBoard) {
      if (page === 'backlog' && typeof backlogPage !== 'undefined') backlogPage.render();
      if (page === 'sprints' && typeof sprintsPage !== 'undefined') sprintsPage.render();
      if (page === 'timeline' && typeof timelinePage !== 'undefined') timelinePage.render();
      return;
    }
    renderSprintBar();
    const active = activeSprint();
    els.filterBar.hidden = !active;
    els.groupBy.closest('label').hidden = !active;
    syncCopyBoard(active);
    if (!active) {
      els.board.replaceChildren(renderNoSprint());
      return;
    }
    const visible = visibleItems();
    renderFilterCount(visible.length);
    const lanes = computeLanes(visible);
    const header = el('div', { class: 'board-header', style: gridStyle() });
    for (const status of state.statuses) {
      const count = visible.filter((i) => i.status === status).length;
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
        // An epic lane's title also opens the Epic View (AC 29), as the
        // epic chip does; a separate button, since buttons cannot nest.
        const laneEpic = state.groupBy === 'epic' && lane.value !== null ? itemById(lane.value) : null;
        laneNode.append(
          laneEpic
            ? el(
                'div',
                { class: 'lane-head-row' },
                headerBtn,
                el('button', { type: 'button', class: 'link lane-epic-open', onclick: () => openLinked(laneEpic.id) }, `Open ${laneEpic.key}`)
              )
            : headerBtn
        );
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

  // No active sprint (AC 25): the columns are not drawn.
  function renderNoSprint() {
    return el(
      'div',
      { class: 'empty' },
      el('p', {}, el('strong', {}, 'No active sprint.')),
      el('p', {}, 'The board shows the work in the active sprint. Start a sprint on the Backlog page.'),
      readOnly() ? null : el('p', {}, 'Work items you create now go to the Backlog.'),
      el('a', { href: backlogUrl() }, 'Go to the Backlog')
    );
  }

  // The active sprint's bar and, when it is overdue, the warning banner
  // (AC 26, Decision 19). Text only; the state word comes from the server.
  function renderSprintBar() {
    const active = activeSprint();
    els.sprintBar.hidden = !active;
    const overdue = sprintUtil.isOverdue(active, stateWith('active'));
    els.overdueBanner.hidden = !overdue;
    if (!active) {
      els.sprintBar.replaceChildren();
      els.overdueBanner.replaceChildren();
      return;
    }
    const dates = sprintUtil.datesText(active);
    const parts = [
      el('h2', { class: 'sprint-name' }, active.name),
      sprintFigure(active),
      el('span', { class: 'badge state-active' }, active.state),
      dates ? el('span', { class: 'sprint-meta' }, dates) : null,
      overdue ? el('span', { class: 'badge overdue' }, '\u26A0 Overdue') : null,
      el('a', { href: backlogUrl() }, 'Open Backlog'),
      active.goal ? el('p', { class: 'sprint-goal' }, el('strong', {}, 'Goal:'), ` ${active.goal}`) : null,
    ];
    els.sprintBar.replaceChildren(...parts.filter(Boolean));
    els.overdueBanner.replaceChildren(
      ...(overdue
        ? [
            el('strong', {}, '\u26A0 Overdue'),
            el('span', {}, `This sprint ended on ${active.end_date} (${sprintUtil.agoText(active.end_date)}).`),
            el('a', { class: 'spacer', href: backlogUrl() }, 'Complete it on the Backlog page'),
          ]
        : [])
    );
  }

  function renderHeader() {
    const p = state.project;
    document.title = `${p.key} ${page}`;
    // The Sprints page keeps its own "Sprints" heading and has no status badge.
    if (els.title && page !== 'sprints') els.title.textContent = `${p.name} (${p.key})`;
    if (els.status) els.status.textContent = p.status;
    els.archivedBadge.hidden = !p.archived;
    // The sub-navigation links carry the project (js/projectScope.js).
    if (!onBoard) return;
    els.backlogNoticeLink.href = backlogUrl();
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
  // neighbours are looked up in the full column, not just the lane, and
  // including cards hidden by search and filters (`lane.items` holds only the
  // visible ones, so "end of the lane" is just after the last visible card).
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
    // Epics are never cards (AC 24), so no epic can be dropped into a lane.
    if (field && laneValueOf(item) !== lane.value) patch[field] = lane.value;
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
  // The work item dialog: a dark band (key chip, epic link, Close, title), the
  // status track, properties and description, then one tab bar for Children
  // (epic types only), Discussion, History, Links and Attachments. Only the
  // band, track, properties and description are part of Save.

  let editing = null; // the item being edited, or null when creating

  const TITLE_REQUIRED = 'Title is required. Enter a title and save again.';

  function fillSelect(select, options, value) {
    select.replaceChildren(...options.map((o) => el('option', { value: o.value }, o.label)));
    select.value = value;
  }

  // ----- status track -----
  // One radio per server status, in board order (name="status"). Nothing is
  // saved until Save, as with the select it replaces.

  const statusRadios = () => [...els.statusSteps.querySelectorAll('input[type="radio"]')];
  function selectedStatus() {
    const radio = statusRadios().find((r) => r.checked);
    return radio ? radio.value : '';
  }

  function fillStatusTrack(value) {
    els.statusSteps.replaceChildren(
      ...state.statuses.map((s) =>
        el('label', { class: 'step', title: s }, el('input', { type: 'radio', name: 'status', value: s }), el('span', {}, s))
      )
    );
    for (const radio of statusRadios()) radio.checked = radio.value === value;
    syncTrack();
  }

  // Steps before the selected one read as finished, the selected one as current.
  function syncTrack() {
    const radios = statusRadios();
    const current = radios.findIndex((r) => r.checked);
    radios.forEach((radio, i) => {
      const step = radio.closest('.step');
      step.classList.toggle('past', i < current);
      step.classList.toggle('now', i === current);
    });
    els.statusSteps.classList.toggle('locked', readOnly());
  }

  // The resolution control is shown only while the selected status is the
  // terminal status. Entering it from another status selects the default.
  function syncResolutionField() {
    const f = els.form.elements;
    const show = Boolean(editing) && isTerminal(selectedStatus());
    if (show && els.resolutionField.hidden) {
      const current = editing && isTerminal(editing.status) ? editing.resolution : null;
      const names = state.resolutions.map((r) => r.name);
      if (current && !names.includes(current)) names.push(current); // a value since removed from the list
      fillSelect(f.resolution, names.map((n) => ({ value: n, label: n })), current || defaultResolution());
    }
    els.resolutionField.hidden = !show;
  }

  // The dialog's read-only Completed field (AC 19): from the saved item, not
  // the unsaved status choice; hidden for a new item. Shown on the Board and
  // Backlog only (AC 22): always hidden on Sprints and Timeline.
  function syncCompletedField(item) {
    if (!els.completedField) return;
    const shown = completedDate.showInDialog(page) && item && isTerminal(item.status);
    const text = shown ? completedDate.dateText(item.completed_at) : null;
    els.completedField.hidden = !text;
    els.completedInput.value = text || '';
    if (text) els.completedInput.title = completedDate.tooltip(item.completed_at, item.completed_by);
    else els.completedInput.removeAttribute('title');
  }

  function syncEpicField() {
    const type = typeOf(els.form.elements.type.value);
    els.epicField.hidden = !epicType() || Boolean(type && type.isEpic);
    syncSprintField();
    syncEstimateField();
  }

  // ----- sprint field (AC 37) -----
  // Backlog plus every open sprint as "<name> (<state>)". An item in a
  // completed sprint shows it, disabled, with a note. For an epic type the
  // select gives way to fixed text, also as soon as Type is switched to one.
  // A saved item's sprint saves at once (PATCH); a new item sends it on Create.

  const openSprints = () => state.sprints.filter((s) => !isFinalSprint(s));
  let sprintSaving = false;

  function fillSprintField(item) {
    const current = item && item.sprint_id ? sprintById(item.sprint_id) : null;
    const option = (s) => ({ value: String(s.id), label: `${s.name} (${s.state})` });
    if (isFinalSprint(current)) {
      fillSelect(els.sprintSelect, [option(current)], String(current.id));
    } else {
      const active = activeSprint();
      const value = item ? (item.sprint_id ? String(item.sprint_id) : '') : active ? String(active.id) : '';
      fillSelect(els.sprintSelect, [{ value: '', label: 'Backlog' }, ...openSprints().map(option)], value);
    }
    els.sprintSelect.dataset.saved = els.sprintSelect.value;
    syncSprintField();
  }

  function syncSprintField() {
    const type = typeOf(els.form.elements.type.value);
    const epic = Boolean(type && type.isEpic);
    const current = editing && editing.sprint_id ? sprintById(editing.sprint_id) : null;
    const completed = isFinalSprint(current);
    els.sprintSelect.hidden = epic;
    els.sprintNa.hidden = !epic;
    els.sprintNote.hidden = epic || !completed;
    els.sprintSelect.disabled = readOnly() || completed || sprintSaving;
    // Where a new item goes (AC 27, Decision 17).
    let where = '';
    if (!editing) {
      const chosen = sprintById(Number(els.sprintSelect.value));
      if (epic) where = 'Epics are not part of a sprint.';
      else if (chosen) where = `This work item will be created in ${chosen.name}.`;
      else if (!activeSprint()) where = 'No sprint is active. This work item will be created in the Backlog.';
      else where = 'This work item will be created in the Backlog.';
    }
    els.sprintWhere.textContent = where;
    els.sprintWhere.hidden = !where;
    // "Added after start" under the Sprint field (scope change AC 28), for
    // the saved sprint of the open item only.
    const flagged = Boolean(editing && !epic && editing.added_after_start && els.sprintSelect.value === String(editing.sprint_id || ''));
    if (flagged) {
      els.sprintAdded.replaceChildren(addedBadge(editing), ' ', el('span', { class: 'visually-hidden' }, '.'), scopeFormat.addedHint(editing.added_at));
    } else {
      els.sprintAdded.replaceChildren();
    }
    els.sprintAdded.hidden = !flagged;
  }

  els.sprintSelect.addEventListener('change', async () => {
    syncSprintField();
    if (!editing || readOnly()) return;
    const item = editing;
    const previous = els.sprintSelect.dataset.saved;
    const sprintId = els.sprintSelect.value ? Number(els.sprintSelect.value) : null;
    els.detailError.textContent = '';
    sprintSaving = true;
    syncSprintField();
    try {
      const saved = await api.patch(`/api/issues/${item.id}`, { sprint_id: sprintId });
      Object.assign(item, saved);
      if (editing === item) els.sprintSelect.dataset.saved = els.sprintSelect.value;
      historySaved(item.id);
      await refreshCards();
    } catch (err) {
      if (editing === item) {
        els.sprintSelect.value = previous;
        els.detailError.textContent = `Could not change the sprint: ${err.message}`;
      }
    } finally {
      sprintSaving = false;
      if (editing === item) syncSprintField();
    }
  });

  // ----- estimate field (time-tracking AC 41-44, 48) -----
  // An item field like the others: dirty-tracked and saved with Save (a new
  // item sends it on Create). Read-only text ("8 h" or "Not estimated") for
  // Viewers and archived projects; removed for an epic type, and emptied when
  // Type is switched to one so switching back shows it empty.

  const ESTIMATE_INVALID = 'Estimate must be a number greater than 0 and at most 1000, in steps of 0.25, or empty.';

  function syncEstimateField() {
    const type = typeOf(els.form.elements.type.value);
    const epic = Boolean(type && type.isEpic);
    const ro = readOnly();
    els.estimateField.hidden = epic;
    els.estimateEdit.hidden = ro;
    els.estimateRo.hidden = !ro;
    const value = editing ? editing.estimate_hours : null;
    const none = value === null || value === undefined;
    els.estimateRo.textContent = none ? 'Not estimated' : timeFormat.hours(value);
    els.estimateRo.classList.toggle('none', none);
  }

  // The estimate as sent: hours, or null when the input is empty.
  function estimateValue() {
    const raw = els.estimateInput.value;
    return raw === '' ? null : Number(raw);
  }

  function setEstimateError(text) {
    els.estimateError.textContent = text;
    els.estimateError.hidden = !text;
    if (text) {
      els.estimateInput.setAttribute('aria-invalid', 'true');
      els.estimateInput.setAttribute('aria-describedby', 'estimate-error');
    } else {
      els.estimateInput.removeAttribute('aria-invalid');
      els.estimateInput.removeAttribute('aria-describedby');
    }
  }
  els.estimateInput.addEventListener('input', () => setEstimateError(''));

  // ----- start and due dates (gantt-chart AC 6) -----
  // Item fields like the others: dirty-tracked, saved with Save, disabled
  // when read-only. A server date error shows in the dialog's error area and
  // marks the input(s) it is about.

  function setDateInvalid(message) {
    const both = /earlier than start date/i.test(message || '');
    const marks = [
      [els.startDate, both || /^start date/i.test(message || '')],
      [els.dueDate, both || /^due date/i.test(message || '')],
    ];
    for (const [input, bad] of marks) {
      if (bad) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'detail-error');
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
    return marks.some(([, bad]) => bad);
  }
  els.startDate.addEventListener('input', () => setDateInvalid(''));
  els.dueDate.addEventListener('input', () => setDateInvalid(''));

  // ----- band -----

  // The key chip (type name and key, with a dot in the type's colour) or, for
  // a new item, "Create work item". The hidden heading names the dialog.
  function syncBand(item) {
    els.keychip.hidden = !item;
    els.newLabel.hidden = Boolean(item);
    els.detailHeading.textContent = item ? item.key : 'Create work item';
    if (!item) return;
    const type = typeOf(item.type);
    els.keychip.textContent = `${(type && type.label) || item.type} ${item.key}`; // text, never parsed as HTML
    if (type && type.color) els.keychip.style.setProperty('--tc', type.color);
    else els.keychip.style.removeProperty('--tc');
  }

  // The open item's epic as a link in the band; it opens the epic here.
  function syncEpicOpen(item) {
    const epic = item && item.epic_id && !isEpicItem(item) ? itemById(item.epic_id) : null;
    els.epicOpen.hidden = !epic;
    els.epicOpen.textContent = epic ? `${epic.key} ${epic.title}` : ''; // text, never parsed as HTML
    els.epicOpen.title = epic ? `Open ${epic.key} ${epic.title}` : '';
    els.epicOpen.onclick = epic ? () => openLinked(epic.id, els.detailError) : null;
  }

  // Why nothing can be changed; the archived text wins over view-only.
  function syncBanner() {
    let text = '';
    if (state.project && state.project.archived) text = 'This project is archived. You can read this work item but not change it.';
    else if (readOnly()) text = 'You have view-only access. You can read this work item but not change it.';
    els.banner.textContent = text;
    els.banner.hidden = !text;
  }

  function setTitleError(text) {
    els.titleError.textContent = text;
    els.titleError.hidden = !text;
    els.titleInput.classList.toggle('bad', Boolean(text));
    if (text) {
      els.titleInput.setAttribute('aria-invalid', 'true');
      els.titleInput.setAttribute('aria-describedby', 'title-error');
    } else {
      els.titleInput.removeAttribute('aria-invalid');
      els.titleInput.removeAttribute('aria-describedby');
    }
  }

  // The title grows with its text (it is a textarea so long titles wrap).
  // CSS field-sizing does it where supported; otherwise size it here.
  const cssGrows = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('field-sizing', 'content');
  function growTitle() {
    if (cssGrows) return;
    const t = els.titleInput;
    t.style.height = 'auto';
    if (t.scrollHeight) t.style.height = `${t.scrollHeight + t.offsetHeight - t.clientHeight}px`;
  }
  window.addEventListener('resize', () => { if (els.dialog.open) growTitle(); });

  // The title never holds a line break: Enter saves, and pasted or dropped
  // line breaks become spaces.
  els.titleInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    els.form.requestSubmit();
  });
  els.titleInput.addEventListener('paste', (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!/[\r\n]/.test(text)) return;
    e.preventDefault();
    const t = els.titleInput;
    const room = t.maxLength - (t.value.length - (t.selectionEnd - t.selectionStart));
    t.setRangeText(text.replace(/\r\n|[\r\n]/g, ' ').slice(0, Math.max(0, room)), t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new Event('input'));
  });
  els.titleInput.addEventListener('input', () => {
    const t = els.titleInput;
    if (/[\r\n]/.test(t.value)) {
      const pos = t.selectionStart;
      t.value = t.value.replace(/[\r\n]/g, ' ');
      t.selectionStart = t.selectionEnd = pos;
    }
    growTitle();
  });

  // ----- unsaved edits (docs/specs/global-project-scope.md AC 14-14f) -----
  // The dialog is dirty when a saved-item field differs from the values it
  // was filled with, or a comment draft or message edit is not posted. X,
  // Close, Escape and re-pointing ask "Discard changes?" first; the project
  // dropdown asks "Switch project?". One confirm helper (projectScope).
  // beforeunload is registered only while the dialog is dirty.
  let detailBaseline = null; // formValues() when the dialog was filled, or null
  function isDetailDirty() {
    if (!els.dialog.open || detailBaseline === null) return false;
    const editingComment = discussion.comments.find((c) => c.id === discussion.editingId);
    return projectScope.detailDirty(detailBaseline, formValues(), {
      comment: els.commentBody.value,
      edit: editingComment ? discussion.editDraft : undefined,
      editOriginal: editingComment ? editingComment.body : undefined,
    });
  }
  function onBeforeUnload(e) {
    if (!isDetailDirty()) return;
    e.preventDefault();
    e.returnValue = ''; // the browser shows its own wording
  }
  let unloadGuarded = false;
  function syncUnloadGuard() {
    const dirty = isDetailDirty();
    if (dirty && !unloadGuarded) window.addEventListener('beforeunload', onBeforeUnload);
    if (!dirty && unloadGuarded) window.removeEventListener('beforeunload', onBeforeUnload);
    unloadGuarded = dirty;
  }
  function discardDetailEdits() {
    detailBaseline = null;
    syncUnloadGuard();
  }
  els.dialog.addEventListener('input', syncUnloadGuard);
  els.dialog.addEventListener('change', syncUnloadGuard);
  projectScope.guard.isDirty = isDetailDirty;
  projectScope.guard.discard = discardDetailEdits;

  // True when the dialog may lose its edits: not dirty, or the user chose
  // "Discard changes". On Cancel focus goes back to `returnFocus`.
  async function confirmDiscard(returnFocus) {
    if (!isDetailDirty()) return true;
    const ok = await projectScope.confirmDialog(projectScope.DISCARD_CONFIRM);
    if (ok) {
      discardDetailEdits();
      return true;
    }
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
    return false;
  }

  // Opens the dialog, or re-points the open one at another item (asking
  // first when the open one is dirty). Resolves whether it did.
  async function openDetail(item) {
    if (isDetailDirty() && !(await confirmDiscard(document.activeElement))) return false;
    fillDetail(item);
    return true;
  }

  function fillDetail(item) {
    editing = item || null;
    epicView.returnTo = null; // set again by Create child
    const f = els.form.elements;
    const ro = readOnly();
    const defaultType = state.types.find((t) => t.isDefault) || state.types[0];

    syncBand(item);
    syncBanner();
    setTitleError('');
    els.detailError.textContent = '';
    els.epicLabel.textContent = epicLabel();

    // Read-only; set by the server from whoever created the item.
    els.reporter.hidden = !(item && item.reporter_name);
    els.reporter.textContent = item && item.reporter_name ? `Reporter: ${item.reporter_name}` : '';

    f.title.value = item ? item.title : '';
    f.description.value = item ? item.description : '';
    fillSelect(f.type, state.types.map((t) => ({ value: t.name, label: t.label || t.name })), item ? item.type : defaultType.name);
    fillStatusTrack(item ? item.status : state.statuses[0]);
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
    els.estimateInput.value = item && item.estimate_hours !== null && item.estimate_hours !== undefined ? String(item.estimate_hours) : '';
    setEstimateError('');
    els.startDate.value = item && item.start_date ? item.start_date : '';
    els.dueDate.value = item && item.due_date ? item.due_date : '';
    setDateInvalid('');
    els.datesHint.hidden = ro;
    els.resolutionField.hidden = true;
    syncResolutionField();
    syncCompletedField(item);
    sprintSaving = false;
    fillSprintField(item);
    syncEpicField();
    syncEpicOpen(item);

    for (const field of els.form.querySelectorAll('input, select, textarea')) field.disabled = ro;
    syncSprintField(); // also disabled for an item in a completed sprint
    els.historyField.disabled = false; // History stays usable when read-only
    if (els.completedInput) els.completedInput.disabled = false; // readonly, still focusable
    els.saveBtn.hidden = ro;
    els.saveBtn.textContent = item ? 'Save' : 'Create';
    els.deleteBtn.hidden = ro || !item || !canDeleteItems();
    els.activityTabs.hidden = !item;
    els.tabChildren.hidden = !(item && isEpicItem(item));
    els.tabTime.hidden = !(item && !isEpicItem(item)); // no Time tab for an epic (time-tracking AC 26)
    // Attachments first: the description and the thread render image tokens
    // against this item's attachment list.
    openAttachments(item);
    openDescription(item);
    openEpicView(item);
    openLinks(item);
    openDiscussion(item);
    openHistory(item);
    openTime(item);
    ticketTests.open(item ? { project: state.project.id, issueId: item.id, readonly: ro } : null);
    // The default each time a dialog opens or is re-pointed; not remembered.
    selectTab(item && isEpicItem(item) ? 'children' : 'discussion');
    // A linked item re-points the dialog that is already open.
    if (!els.dialog.open) els.dialog.showModal();
    resetDetailBaseline();
    growTitle();
    (els.titleInput.disabled ? els.closeX : els.titleInput).focus();
  }

  // The values the dialog now holds count as the loaded ones (not dirty).
  function resetDetailBaseline() {
    detailBaseline = formValues();
    syncUnloadGuard();
  }

  function formValues() {
    const f = els.form.elements;
    const type = typeOf(f.type.value);
    const values = {
      title: f.title.value.replace(/[\r\n]+/g, ' ').trim(),
      type: f.type.value,
      priority: f.priority.value,
      assignee_id: f.assignee_id.value ? Number(f.assignee_id.value) : null,
      epic_id: type && type.isEpic ? null : f.epic_id.value ? Number(f.epic_id.value) : null,
      description: f.description.value,
      start_date: f.start_date.value || null,
      due_date: f.due_date.value || null,
    };
    // A new item's sprint goes with Create; a saved item's saves on change.
    if (!editing && !(type && type.isEpic)) values.sprint_id = f.sprint_id.value ? Number(f.sprint_id.value) : null;
    // The estimate is not sent for an epic type (the server clears it on a change to one).
    if (!(type && type.isEpic)) values.estimate_hours = estimateValue();
    if (editing) values.status = selectedStatus();
    // Left out for other statuses: the server clears it.
    if (editing && isTerminal(values.status)) values.resolution = f.resolution.value;
    return values;
  }

  els.form.elements.type.addEventListener('change', () => {
    const type = typeOf(els.form.elements.type.value);
    if (type && type.isEpic) {
      els.estimateInput.value = '';
      setEstimateError('');
    }
    syncEpicField();
    syncTimeTab();
  });

  // The Time tab follows the Type select of a saved item, like the Estimate
  // field: switching to an epic type hides it at once (so no time is logged
  // to the still-saved task), switching back shows it (time-tracking AC 26, 43).
  function syncTimeTab() {
    if (!editing) return;
    const type = typeOf(els.form.elements.type.value);
    els.tabTime.hidden = Boolean(type && type.isEpic);
    // Moves off a hidden selected Time tab, and re-applies panel visibility.
    selectTab(els.tabTime.hidden && selectedTab === 'time' ? 'discussion' : selectedTab);
  }
  els.statusSteps.addEventListener('change', () => {
    syncTrack();
    syncResolutionField();
  });

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (readOnly() || pasteUploads.description > 0) return; // Save waits for a pasted image
    els.detailError.textContent = '';
    setTitleError('');
    setEstimateError('');
    setDateInvalid('');
    const values = formValues();
    if (!values.title) {
      setTitleError(TITLE_REQUIRED);
      els.titleInput.focus();
      return;
    }
    // Text the number input cannot read would otherwise be sent as empty.
    if (!els.estimateField.hidden && els.estimateInput.validity.badInput) {
      setEstimateError(ESTIMATE_INVALID);
      els.estimateInput.focus();
      return;
    }
    let created = null;
    try {
      if (editing) {
        await api.patch(`/api/issues/${editing.id}`, values);
        historySaved(editing.id);
      } else {
        created = await api.post(`/api/projects/${state.project.id}/issues`, values);
        detailBaseline = null;
        // Created from an epic's Create child: go back to that epic.
        const epic = epicView.returnTo !== null && (await reloadThenFind(epicView.returnTo));
        if (epic) {
          noticeIfHidden(created) || noticeIfOffBoard(created);
          openDetail(epic);
          return;
        }
      }
      els.dialog.close();
      await reloadItems();
      if (created) noticeIfOffBoard(created) || noticeIfHidden(created);
    } catch (err) {
      // Estimate messages show under the field (time-tracking AC 41).
      if (/estimate/i.test(err.message) && !els.estimateField.hidden) {
        setEstimateError(err.message);
        els.estimateInput.focus();
      } else {
        els.detailError.textContent = err.message;
        setDateInvalid(err.message);
      }
    }
  });

  els.deleteBtn.addEventListener('click', async () => {
    if (!editing || readOnly() || !canDeleteItems()) return;
    if (!confirm(`Delete ${editing.key}? Its test case links and execution history will also be deleted. Library cases are kept. This cannot be undone.`)) return;
    try {
      await api.del(`/api/issues/${editing.id}`);
      els.dialog.close();
      await reloadItems();
    } catch (err) {
      els.detailError.textContent = err.message;
    }
  });

  // X, Close and Escape (AC 14c-14e): with unsaved edits the dialog stays
  // open until "Discard changes"; Cancel keeps everything and puts focus back
  // on the control used (the title for Escape). Save and Delete are not
  // close actions.
  async function closeDetail(returnFocus) {
    if (!(await confirmDiscard(returnFocus))) return;
    discardDetailEdits();
    els.dialog.close();
  }
  els.closeBtn.addEventListener('click', () => closeDetail(els.closeBtn));
  els.closeX.addEventListener('click', () => closeDetail(els.closeX));
  els.dialog.addEventListener('cancel', (e) => {
    if (!isDetailDirty()) return; // closes as usual
    e.preventDefault();
    closeDetail(els.titleInput.disabled ? els.closeX : els.titleInput);
  });
  // Chromium may not let `cancel` be prevented (no recent user activation),
  // so a dirty dialog also stops Escape before it becomes a cancel.
  els.dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.isComposing || !isDetailDirty()) return;
    e.preventDefault();
    closeDetail(els.titleInput.disabled ? els.closeX : els.titleInput);
  });

  // ----- tabs -----
  const ticketTests = testCaseUI.ticketPanel({
    root: document.getElementById('ticket-test-cases'),
    count: document.getElementById('count-test-cases'),
    onChange: () => { if (editing) historySaved(editing.id); },
  });
  // One tab bar for a saved item; a new item has none. Only one panel shows
  // at a time; History loads the first time it is shown.

  const tabList = () => [
    { name: 'children', tab: els.tabChildren, panel: els.epicView },
    { name: 'discussion', tab: els.tabDiscussion, panel: els.discussion },
    { name: 'history', tab: els.tabHistory, panel: els.history },
    { name: 'links', tab: els.tabLinks, panel: els.links },
    { name: 'time', tab: els.tabTime, panel: els.time },
    { name: 'test-cases', tab: document.getElementById('tab-test-cases'), panel: document.getElementById('ticket-test-cases') },
    { name: 'attachments', tab: els.tabAttachments, panel: els.attachments },
  ];
  let selectedTab = 'discussion';

  function selectTab(name) {
    selectedTab = name;
    const hasItem = editing !== null;
    for (const t of tabList()) {
      const on = t.name === name;
      t.tab.setAttribute('aria-selected', String(on));
      t.tab.classList.toggle('active', on);
      t.tab.tabIndex = on ? 0 : -1;
      if (hasItem) t.panel.hidden = !on || t.tab.hidden;
    }
    historyView.selected = hasItem && name === 'history';
    if (historyView.selected && historyView.issueId !== null && !historyView.loaded && !historyView.loading) loadHistory(true);
    // The tab bar scrolls sideways when it does not fit (design
    // time-tracking): keep the selected tab in view.
    const current = tabList().find((t) => t.name === name);
    if (hasItem && els.dialog.open && current && !current.tab.hidden && current.tab.scrollIntoView) {
      current.tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  for (const t of tabList()) t.tab.addEventListener('click', () => selectTab(t.name));
  // Left and Right Arrow (and Home and End) move between the visible tabs.
  els.activityTabs.addEventListener('keydown', (e) => {
    const shown = tabList().filter((t) => !t.tab.hidden);
    const i = shown.findIndex((t) => t.name === selectedTab);
    let next = null;
    if (e.key === 'ArrowRight') next = shown[(i + 1) % shown.length];
    else if (e.key === 'ArrowLeft') next = shown[(i - 1 + shown.length) % shown.length];
    else if (e.key === 'Home') next = shown[0];
    else if (e.key === 'End') next = shown[shown.length - 1];
    if (!next) return;
    e.preventDefault();
    selectTab(next.name);
    next.tab.focus();
  });

  // Count pill on a tab; null hides it (not loaded yet).
  function setCount(name, value) {
    const pill = els.counts[name];
    pill.textContent = value === null ? '' : String(value);
    pill.hidden = value === null;
  }

  // An error that appears in a tab's panel opens that tab, whichever code
  // set it (load, add, remove, upload, post). Clearing an error never
  // switches back. History errors stay on History.
  const ERROR_TABS = [
    [els.linkError, 'links'],
    [els.attachmentError, 'attachments'],
    [els.epicViewError, 'children'],
    [els.epicAddError, 'children'],
    [els.commentError, 'discussion'],
  ];
  for (const [errorEl, name] of ERROR_TABS) {
    new MutationObserver(() => showTabFor(errorEl, name)).observe(errorEl, { childList: true, characterData: true, subtree: true });
  }
  function showTabFor(errorEl, name) {
    const target = tabList().find((t) => t.name === name);
    if (!errorEl.textContent || editing === null || !els.dialog.open || target.tab.hidden || selectedTab === name) return;
    selectTab(name);
  }

  // ---------- discussion ----------
  // Messages on the open work item. Kept apart from the work item form: none
  // of these handlers submit, save or close it, and its Save never posts.

  const discussion = {
    issueId: null, // work item whose thread is shown, or null
    comments: [], // newest first
    editingId: null, // message in edit mode, or null
    editDraft: '',
    loaded: false, // the thread has been fetched for this dialog
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
    setCount('discussion', discussion.loaded ? n : null);
    els.threadEmpty.hidden = n > 0;
    els.thread.replaceChildren(...discussion.comments.map(renderMessage));
  }

  // Shows the section for an existing work item (not when creating) and
  // loads its thread.
  function openDiscussion(item) {
    discussion.issueId = item ? item.id : null;
    discussion.comments = [];
    discussion.loaded = false;
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
      discussion.loaded = true;
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
    discardDetailEdits(); // nothing is open, so nothing is unsaved
    clearInterval(discussion.timer);
    discussion.timer = null;
    discussion.issueId = null;
    ticketTests.close();
    discussion.editingId = null;
    historyView.issueId = null;
    timeView.issueId = null;
    timeView.editingId = null;
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
    selected: false, // the History tab is the visible one (set by selectTab)
  };

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
    // No count until the first page is in; "+" while more can be shown.
    if (v.loaded && !v.loading) setCount('history', `${v.events.length}${v.hasMore ? '+' : ''}`);
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
    setCount('history', null);
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

  // ---------- time ----------
  // The Time tab (docs/specs/time-tracking.md AC 22-29, 45-47; design
  // time-tracking option A): the summary (Estimate, Logged, Balance and a
  // progress bar), the Log time form and the entries, newest work date first.
  // Entries are saved by their own buttons straight to the server, never
  // through Save, so they never make the dialog unsaved. Only the signed-in
  // user's own entries have Edit and Delete. Hidden for epic types.

  const timeView = {
    issueId: null, // work item whose time is shown, or null
    estimate: null, // the saved estimate in hours, or null
    total: 0, // hours logged
    entries: [],
    loaded: false,
    loading: false,
    error: '',
    editingId: null, // entry in inline edit, or null
    busy: false, // a log, edit or delete is in flight
    loadSeq: 0,
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  // Today in the browser's time zone, as the date input wants it.
  function todayText() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // Badge: hours logged, none at 0 (never the estimate).
  function syncTimeCount() {
    setCount('time', timeView.total > 0 ? String(Math.round(timeView.total * 100) / 100) : null);
  }

  function renderTimeSummary() {
    const est = timeView.estimate;
    const logged = timeView.total;
    const balance = timeFormat.itemBalance(est, logged);
    const cell = (label, dd) => el('div', {}, el('dt', {}, label), dd);
    const parts = [
      el(
        'dl',
        {},
        cell('Estimate', est === null ? el('dd', { class: 'none' }, 'No estimate') : el('dd', {}, timeFormat.hours(est))),
        cell('Logged', el('dd', {}, balance ? timeFormat.hours(logged) : `${timeFormat.hours(logged)} logged`)),
        balance
          ? cell(
              'Balance',
              balance.over
                ? el('dd', { class: 'bal-over' }, el('span', { 'aria-hidden': 'true' }, '▲ '), balance.text)
                : el('dd', {}, balance.text)
            )
          : null
      ),
    ];
    if (balance) {
      const shown = Math.min(100, balance.percent);
      parts.push(
        el(
          'div',
          { class: `time-bar${balance.over ? ' is-over' : ''}` },
          el(
            'div',
            { class: 'progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(shown), 'aria-label': 'Logged against estimate' },
            el('div', { class: 'progress-fill', style: `width: ${shown}%` })
          ),
          el('span', { class: 'time-bar-text' }, `${balance.percent}% of estimate logged${balance.over ? ' (over)' : ''}`)
        )
      );
    }
    els.timeSum.className = `time-sum${balance && balance.over ? ' is-over' : ''}`;
    els.timeSum.replaceChildren(...parts);
    syncTimeCount();
  }

  // The message of a failed log or edit, with aria-invalid on the field at fault.
  function setTimeError(errorEl, fields, text) {
    errorEl.textContent = text;
    errorEl.hidden = !text;
    const fault = /^Hours/.test(text) ? fields.hours : /^Date/.test(text) ? fields.date : /^Note/.test(text) ? fields.note : null;
    for (const input of [fields.hours, fields.date, fields.note]) {
      if (text && input === fault) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', errorEl.id);
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
  }
  const logFields = { hours: els.timeHours, date: els.timeDate, note: els.timeNote };

  // The body of a log or an edit: hours as a number (the server explains a
  // bad one), the date (today when empty) and the note.
  function timeBody(hoursInput, dateInput, noteInput) {
    const raw = hoursInput.value;
    const body = { hours: raw === '' || hoursInput.validity.badInput ? null : Number(raw), note: noteInput.value };
    if (dateInput.value) body.date = dateInput.value;
    return body;
  }

  function renderTimeEntry(entry) {
    const own = !readOnly() && Boolean(state.me) && entry.user_id === state.me.id;
    if (own && timeView.editingId === entry.id) return renderTimeEdit(entry);
    const edited = entry.updated_at && entry.updated_at !== entry.created_at;
    const li = el(
      'li',
      { class: 'time-item', 'data-id': entry.id },
      el(
        'div',
        { class: 'time-main' },
        el('span', { class: 'time-who' }, entry.user_name), // text, never parsed as HTML
        el('span', { class: 'time-hours' }, timeFormat.hours(entry.hours)),
        el('span', { class: 'time-date' }, entry.date),
        el('span', { class: 'time-when' }, 'logged ', timeText(entry.created_at)),
        edited ? el('span', { class: 'time-edited' }, 'edited ', timeText(entry.updated_at)) : null
      )
    );
    if (own) {
      const editBtn = el('button', { type: 'button', class: 'link' }, 'Edit');
      const deleteBtn = el('button', { type: 'button', class: 'link danger' }, 'Delete');
      editBtn.addEventListener('click', () => {
        timeView.editingId = entry.id;
        renderTimeList();
        const first = els.timeList.querySelector('.is-editing input');
        if (first) first.focus();
      });
      deleteBtn.addEventListener('click', () => deleteTimeEntry(entry));
      li.append(el('div', { class: 'time-actions' }, editBtn, deleteBtn));
    }
    if (entry.note) li.append(el('p', { class: 'time-note' }, entry.note));
    return li;
  }

  // The inline edit of an own entry: Hours, Date, Note, Save and Cancel.
  function renderTimeEdit(entry) {
    const id = `time-edit-${entry.id}`;
    const hours = el('input', { type: 'number', id: `${id}-h`, step: '0.25', min: '0.25', max: '24', value: String(entry.hours) });
    const date = el('input', { type: 'date', id: `${id}-d`, max: todayText(), value: entry.date });
    const note = el('input', { type: 'text', id: `${id}-n`, maxlength: '500', value: entry.note || '' });
    const error = el('p', { class: 'error', id: `${id}-e`, role: 'alert', hidden: true });
    const saveBtn = el('button', { type: 'button', class: 'navy' }, 'Save');
    const cancelBtn = el('button', { type: 'button' }, 'Cancel');
    const fields = { hours, date, note };
    const cancel = () => {
      timeView.editingId = null;
      renderTimeList();
    };
    saveBtn.addEventListener('click', () => saveTimeEdit(entry, fields, error, saveBtn));
    cancelBtn.addEventListener('click', cancel);
    const form = el(
      'div',
      { class: 'time-form', role: 'group', 'aria-label': 'Edit time entry' },
      el('label', { for: hours.id }, 'Hours', hours),
      el('label', { for: date.id }, 'Date', date),
      el('label', { class: 'note-field', for: note.id }, 'Note', note),
      el('div', { class: 'time-edit-actions' }, saveBtn, cancelBtn),
      error
    );
    // Enter saves the entry (not the work item); Escape cancels the edit only.
    form.addEventListener('keydown', (e) => {
      if (e.isComposing || e.target.tagName !== 'INPUT') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });
    return el('li', { class: 'time-item is-editing', 'data-id': entry.id }, form);
  }

  function renderTimeList() {
    const v = timeView;
    const n = v.entries.length;
    els.timeLoading.hidden = !(v.loading && !v.loaded);
    els.timeLoadError.hidden = !v.error;
    els.timeLoadErrorText.textContent = v.error;
    els.timeEmpty.hidden = !(v.loaded && n === 0);
    els.timeListHint.textContent = v.loaded && n ? `${n} entr${n === 1 ? 'y' : 'ies'}, ${timeFormat.hours(v.total)}` : '';
    els.timeList.replaceChildren(...v.entries.map(renderTimeEntry));
  }

  // Shows the tab for a saved non-epic item: the summary at once from the
  // item's own figures, then the entries.
  function openTime(item) {
    const show = Boolean(item) && !isEpicItem(item);
    Object.assign(timeView, {
      issueId: show ? item.id : null,
      estimate: show && item.estimate_hours !== undefined ? item.estimate_hours : null,
      total: show ? item.time_spent_hours || 0 : 0,
      entries: [],
      loaded: false,
      loading: false,
      error: '',
      editingId: null,
      busy: false,
    });
    timeView.loadSeq += 1;
    if (!show) {
      els.time.hidden = true;
      setCount('time', null);
      return;
    }
    const today = todayText();
    els.timeForm.hidden = readOnly(); // Viewers and archived projects read only
    els.timeHours.value = '';
    els.timeNote.value = '';
    els.timeDate.max = today;
    els.timeDate.value = today;
    els.timeLog.disabled = false;
    setTimeError(els.timeError, logFields, '');
    renderTimeSummary();
    loadTime(item.id);
  }

  async function loadTime(issueId) {
    const v = timeView;
    const seq = ++v.loadSeq;
    v.loading = true;
    v.error = '';
    renderTimeList();
    try {
      const data = await api.get(`/api/issues/${issueId}/time`);
      if (seq !== v.loadSeq || v.issueId !== issueId) return; // a newer dialog is open
      v.entries = data.entries;
      v.total = data.total_hours;
      v.loaded = true;
      renderTimeSummary();
    } catch (err) {
      if (seq !== v.loadSeq || v.issueId !== issueId) return;
      v.error = err.message;
    } finally {
      if (seq === v.loadSeq) {
        v.loading = false;
        renderTimeList();
      }
    }
  }
  els.timeRetry.addEventListener('click', () => {
    if (timeView.issueId !== null) loadTime(timeView.issueId);
  });

  // After a log, edit or delete: the list and totals of this dialog, then the
  // item's figures on the page (cards, Backlog, sprint figures; AC 17, 29)
  // and its History tab, which records the change (AC 31).
  async function timeChanged(issueId) {
    historySaved(issueId);
    await loadTime(issueId);
    if (editing && editing.id === issueId) editing.time_spent_hours = timeView.total;
    await refreshCards();
  }

  els.timeLog.addEventListener('click', async () => {
    const issueId = timeView.issueId;
    if (issueId === null || readOnly() || timeView.busy) return;
    setTimeError(els.timeError, logFields, '');
    timeView.busy = true;
    els.timeLog.disabled = true;
    try {
      await api.post(`/api/issues/${issueId}/time`, timeBody(els.timeHours, els.timeDate, els.timeNote));
      if (timeView.issueId === issueId) {
        els.timeHours.value = '';
        els.timeNote.value = '';
      }
      await timeChanged(issueId);
    } catch (err) {
      if (timeView.issueId === issueId) setTimeError(els.timeError, logFields, err.message);
    } finally {
      timeView.busy = false;
      els.timeLog.disabled = false;
    }
  });
  // Enter in the Log time fields logs time; it never submits the work item.
  els.timeForm.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    els.timeLog.click();
  });
  for (const input of [els.timeHours, els.timeDate, els.timeNote]) {
    input.addEventListener('input', () => {
      if (!els.timeError.hidden) setTimeError(els.timeError, logFields, '');
    });
  }

  async function saveTimeEdit(entry, fields, error, saveBtn) {
    if (readOnly() || timeView.busy) return;
    const issueId = timeView.issueId;
    setTimeError(error, fields, '');
    timeView.busy = true;
    saveBtn.disabled = true;
    try {
      const body = timeBody(fields.hours, fields.date, fields.note);
      if (!body.date) body.date = entry.date;
      await api.patch(`/api/time/${entry.id}`, body);
      if (timeView.editingId === entry.id) timeView.editingId = null;
      await timeChanged(issueId);
    } catch (err) {
      setTimeError(error, fields, err.message);
      saveBtn.disabled = false;
    } finally {
      timeView.busy = false;
    }
  }

  async function deleteTimeEntry(entry) {
    if (readOnly() || timeView.busy) return;
    if (!confirm('Delete this time entry? This cannot be undone.')) return;
    const issueId = timeView.issueId;
    timeView.busy = true;
    setTimeError(els.timeError, logFields, '');
    try {
      await api.del(`/api/time/${entry.id}`);
      await timeChanged(issueId);
    } catch (err) {
      if (timeView.issueId === issueId) setTimeError(els.timeError, logFields, `Could not delete: ${err.message}`);
    } finally {
      timeView.busy = false;
    }
  }

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
      typeDot(type, child.type),
      el('button', { type: 'button', class: 'link epic-child-key', onclick: open }, child.key), // text, never parsed as HTML
      el('button', { type: 'button', class: 'link epic-child-title', onclick: open }, child.title),
      el('span', { class: 'epic-child-status' }, `${child.status} · ${child.assignee_name || 'Unassigned'}`),
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
    // The dark summary panel only once there is something to summarise.
    els.epicSummary.hidden = !epicView.data || total === 0;
    els.epicEmpty.hidden = !epicView.data || data.items.length > 0;
    els.epicChildren.replaceChildren(...data.items.map(renderEpicChild));
    setCount('children', epicView.data ? data.items.length : null);
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
    els.epicEmpty.textContent = 'No child work items yet. Add an existing item or create a new one.';
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
  els.epicCreateChild.addEventListener('click', async () => {
    const epicId = epicView.issueId;
    if (readOnly() || epicId === null) return;
    if (!(await openDetail(null))) return;
    els.form.elements.epic_id.value = String(epicId);
    syncEpicField();
    epicView.returnTo = epicId;
    resetDetailBaseline(); // the preset epic is a default, not an edit
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
      typeDot(type, link.other.type),
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
    setCount('links', linksView.links.length);
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
    setCount('links', null);
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
    setCount('attachments', v.issueId !== null && v.loaded ? v.list.length : null);
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
    // A saved item's attachments are a tab panel (selectTab shows it); a new
    // item shows this as a plain section below the description.
    els.attachments.hidden = false;
    if (item) {
      els.attachments.setAttribute('role', 'tabpanel');
      els.attachments.setAttribute('aria-labelledby', 'tab-attachments');
    } else {
      els.attachments.removeAttribute('role');
      els.attachments.removeAttribute('aria-labelledby');
    }
    els.attachmentsHeading.hidden = Boolean(item);
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
    if (!editingText) renderDescriptionView();
    renderDescriptionImages();
  }

  function renderDescriptionView() {
    if (els.descriptionView.hidden) return;
    const text = editing ? editing.description : '';
    if (text) {
      els.descriptionView.classList.remove('empty-text');
      els.descriptionView.replaceChildren(...richNodes(text));
    } else {
      els.descriptionView.classList.add('empty-text');
      els.descriptionView.textContent = readOnly() ? 'No description.' : 'No description. Select Edit to add one.';
    }
  }

  // Thumbnails of the images whose tokens are in the description: under the
  // read view from the saved text, and while editing from the textarea (so
  // the author sees that a paste worked).
  function renderDescriptionImages() {
    const text = els.description.hidden ? (editing ? editing.description : '') : els.description.value;
    const ids = richText.tokenIds(text || '').filter((id) => resolveToken(id) === 'image');
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

  // ---------- filters ----------
  // Search text and single-select dropdowns, applied client-side to the items
  // already loaded (js/filters.js). Saved per project in the browser. Read
  // only: they work the same for every group and on archived projects.

  const filterStorageKey = () => `${FILTERS_STORAGE_PREFIX}${state.project.id}`;
  const visibleItems = () => boardItems().filter((i) => boardFilters.matches(i, state.filters));

  // The current lists, for dropping stale saved values.
  function filterMeta() {
    return {
      users: state.users.map((u) => u.id),
      types: state.types.map((t) => t.name),
      priorities: state.priorities,
      statuses: state.statuses,
      resolutions: state.resolutions.map((r) => r.name),
    };
  }

  // Options come from the loaded lists, in their order; "Any" is first.
  function fillFilterControls() {
    const any = () => el('option', { value: boardFilters.ANY }, 'Any');
    const options = {
      assignee: [
        { value: boardFilters.UNASSIGNED, label: 'Unassigned' },
        ...state.users.map((u) => ({ value: String(u.id), label: u.name })),
      ],
      type: state.types.map((t) => ({ value: t.name, label: t.label || t.name })),
      priority: state.priorities.map((p) => ({ value: p, label: p })),
      status: state.statuses.map((s) => ({ value: s, label: s })),
      resolution: state.resolutions.map((r) => ({ value: r.name, label: r.name })),
    };
    for (const [field, select] of Object.entries(els.filterSelects)) {
      select.replaceChildren(any(), ...options[field].map((o) => el('option', { value: o.value }, o.label)));
    }
    // Only "Any" would be left: hide the dropdown instead (AC 13).
    els.filterResolutionField.hidden = state.resolutions.length === 0;
    let saved = null;
    try {
      saved = JSON.parse(storageGet(filterStorageKey()));
    } catch {
      saved = null; // malformed: start from "Any"
    }
    state.filters = boardFilters.sanitize(saved, filterMeta());
    syncFilterControls();
  }

  function syncFilterControls() {
    els.filterText.value = state.filters.text;
    for (const [field, select] of Object.entries(els.filterSelects)) select.value = state.filters[field];
    els.filterClear.disabled = !boardFilters.isActive(state.filters);
  }

  // Counts the board's items only: the active sprint, no epics (AC 24).
  function renderFilterCount(shown) {
    els.filterCount.textContent = `Showing ${shown} of ${boardItems().length}`;
  }

  function filtersChanged() {
    hideFilterNotice();
    els.filterClear.disabled = !boardFilters.isActive(state.filters);
    storageSet(filterStorageKey(), boardFilters.isActive(state.filters) ? JSON.stringify(state.filters) : null);
    render();
  }

  let noticeTimer = null;
  function hideFilterNotice() {
    clearTimeout(noticeTimer);
    els.filterNotice.hidden = true;
  }

  // A newly created item on the board that the active filters hide gets a
  // notice; the filters stay as they are (AC 21). Returns whether it did.
  function noticeIfHidden(created) {
    const item = itemById(created.id) || created;
    if (!onBoard || !boardItems().includes(item) || boardFilters.matches(item, state.filters)) return false;
    els.filterNoticeText.textContent = `Created ${item.key}, hidden by the current filters.`;
    els.filterNotice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(hideFilterNotice, NOTICE_MS);
    return true;
  }

  if (onBoard) {
    els.filterText.addEventListener('input', () => {
      state.filters.text = els.filterText.value;
      filtersChanged();
    });
    // There is no form here, but keep Enter from doing anything (AC 14).
    els.filterText.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    for (const [field, select] of Object.entries(els.filterSelects)) {
      select.addEventListener('change', () => {
        state.filters[field] = select.value;
        filtersChanged();
      });
    }
    els.filterClear.addEventListener('click', () => {
      state.filters = boardFilters.emptyFilters();
      syncFilterControls();
      filtersChanged(); // also removes the saved entry
    });
    els.filterNoticeDismiss.addEventListener('click', hideFilterNotice);
  }

  // ---------- copy board ----------
  // "Copy board" (docs/specs/copy-board-as-table.md; design
  // docs/design/copy-board-as-table): copies what is drawn, the lanes of
  // computeLanes(visibleItems()) with collapsed lanes expanded, as one
  // clipboard item with an HTML table and plain text (js/boardCopy.js). A
  // read action: shown to Viewers and on archived projects. Changes no data
  // and no view state. Board page only.

  const COPIED_MS = 4000;
  // A clipboard flavor (MIME type) by subtype; built so the clipboard types
  // are not mistaken for attachment types (tests/source.test.js).
  const flavor = (subtype) => ['text', subtype].join('/');
  let copyTimer = null;
  let copyViewKey = null; // sprint, grouping and filters the status line belongs to

  function setCopyStatus(kind, text) {
    clearTimeout(copyTimer);
    els.copyBoardStatus.className = `copy-status${kind ? ` ${kind}` : ''}`;
    els.copyBoardStatus.setAttribute('role', kind === 'fail' ? 'alert' : 'status');
    els.copyBoardStatus.textContent = text;
    if (kind === 'ok') copyTimer = setTimeout(() => setCopyStatus('', ''), COPIED_MS);
  }

  // Called from render(): the button shows with Group by when the board is
  // drawn; the status line is cleared when hidden or when the sprint,
  // grouping or filters change.
  function syncCopyBoard(active) {
    els.copyBoardWrap.hidden = !active;
    const key = JSON.stringify([active ? active.id : null, state.groupBy, state.filters]);
    if (!active || key !== copyViewKey) {
      if (els.copyBoardStatus.textContent) setCopyStatus('', '');
    }
    copyViewKey = key;
  }

  function copyBoardModel() {
    const visible = visibleItems();
    const option = groupOptions().find((o) => o.value === state.groupBy);
    return boardCopy.buildModel({
      project: state.project,
      sprint: activeSprint(),
      now: new Date(),
      groupByLabel: state.groupBy !== 'none' && option ? option.label : null,
      statuses: state.statuses,
      // Copies, sorted as the columns draw them; the lanes are not changed.
      lanes: computeLanes(visible).map((lane) => ({ label: lane.label, items: [...lane.items].sort(byRank) })),
      shown: visible.length,
      total: boardItems().length,
      filtersActive: boardFilters.isActive(state.filters),
      typeLabel: (name) => (typeOf(name) && typeOf(name).label) || name,
      userName: (id) => (userById(id) ? userById(id).name : null),
    });
  }

  // Both flavors in one write; the fallback selects an off-screen copy of the
  // same table, never the live board.
  async function copyBoard() {
    setCopyStatus('', '');
    let ok = false;
    let html = '';
    try {
      const model = copyBoardModel();
      html = boardCopy.toHtml(model);
      if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem === 'function') {
        const htmlType = flavor('html');
        const plainType = flavor('plain');
        await navigator.clipboard.write([
          new ClipboardItem({
            [htmlType]: new Blob([html], { type: htmlType }),
            [plainType]: new Blob([boardCopy.toPlainText(model)], { type: plainType }),
          }),
        ]);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok && html) ok = copyBySelection(html);
    if (ok) setCopyStatus('ok', '✓ Copied. Paste into your email.');
    else setCopyStatus('fail', 'Could not copy. Select the board and copy it by hand.');
    els.copyBoard.focus();
  }

  // The table is parsed by DOMParser (inert: no script runs) and placed
  // off-screen; the user's selection is restored afterwards.
  function copyBySelection(html) {
    const selection = window.getSelection();
    if (!selection) return false;
    const saved = [];
    for (let i = 0; i < selection.rangeCount; i += 1) saved.push(selection.getRangeAt(i));
    const parsed = new DOMParser().parseFromString(html, flavor('html'));
    const holder = el('div', { 'aria-hidden': 'true', style: 'position:absolute;left:-9999px;top:0' });
    holder.append(...Array.from(parsed.body.childNodes, (node) => document.importNode(node, true)));
    document.body.append(holder);
    let ok = false;
    try {
      const range = document.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    selection.removeAllRanges();
    for (const r of saved) selection.addRange(r);
    holder.remove();
    return ok;
  }

  if (onBoard) els.copyBoard.addEventListener('click', copyBoard);

  // ---------- sprint notices ----------
  // A work item created from the board that is not on it (no active sprint,
  // or created into another container) gets a notice with the Backlog link
  // (AC 27). Returns whether it did.

  function noticeIfOffBoard(created) {
    if (!onBoard) return false;
    const item = itemById(created.id) || created;
    if (isEpicItem(item) || boardItems().includes(item)) return false;
    const sprint = item.sprint_id ? sprintById(item.sprint_id) : null;
    const where = sprint ? sprint.name : 'the Backlog';
    const why = activeSprint() ? 'it is not in the active sprint' : 'no sprint is active';
    els.backlogNoticeText.textContent = `${item.key} was created in ${where}. It is not on the board because ${why}.`;
    els.backlogNotice.hidden = false;
    return true;
  }

  if (onBoard) els.backlogNoticeDismiss.addEventListener('click', () => { els.backlogNotice.hidden = true; });

  // ---------- backlog and sprints pages ----------
  // What js/backlog.js and js/sprintView.js need from this file: the shared
  // state, the dialog and the helpers. Everything they draw is text (el),
  // never parsed HTML. reloadItems re-fetches and calls their render().

  function backlogContext() {
    return {
      state,
      el,
      readOnly,
      typeOf,
      isEpicItem,
      epicLabel,
      isTerminal,
      userById,
      itemById,
      initials,
      epicChip,
      stateWith,
      isActiveSprint,
      isFinalSprint,
      activeSprint,
      sprintById,
      showMessage,
      reloadItems,
      openDetail,
      historySaved,
      sprintFigure,
      addedBadge,
    };
  }

  // ---------- loading ----------

  // render() applies the active search and filters to the fresh items. The
  // sprints come with them so the board, the Backlog page and the dialog's
  // Sprint field agree.
  async function reloadItems() {
    const [items, sprints] = await Promise.all([
      api.get(`/api/projects/${state.project.id}/issues`),
      api.get(`/api/projects/${state.project.id}/sprints`),
    ]);
    state.items = items;
    state.sprints = sprints;
    render();
  }

  if (onBoard) {
    els.groupBy.addEventListener('change', () => {
      state.groupBy = els.groupBy.value;
      storageSet(GROUP_BY_STORAGE_KEY, state.groupBy);
      render();
    });
    els.createBtn.addEventListener('click', () => openDetail(null));
  }

  (async () => {
    try {
      state.me = await session.ready; // the header is filled before the board loads
      // The project of this page view (URL, else remembered, else first live);
      // null when projectScope has drawn "No active projects." or "Project
      // not found." instead.
      const scopedProject = await projectScope.ready;
      if (!scopedProject) return;
      projectId = String(scopedProject.id);
    } catch (err) {
      showMessage(err.message);
      return;
    }
    try {
      const [project, statuses, terminal, resolutions, types, priorities, users, historyFields, linkOptions, attachmentTypes, sprintStates] = await Promise.all([
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
        api.get('/api/sprint-states'),
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
        sprintStates,
      });
      renderHeader();
      fillHistoryFilter();
      if (onBoard) fillFilterControls();
      else if (page === 'backlog') backlogPage.init(backlogContext());
      else if (page === 'sprints') sprintsPage.init(backlogContext());
      else if (page === 'timeline') timelinePage.init(backlogContext());
      await reloadItems();
      const linkedIssue = new URLSearchParams(location.search).get('issue');
      if (linkedIssue) {
        const item = state.items.find((i) => i.id === Number(linkedIssue));
        if (!item) showMessage('Work item not found in this project.');
        else openDetail(item);
      }
    } catch (err) {
      if (page === 'timeline' && typeof timelinePage !== 'undefined') timelinePage.loadFailed(err);
      else showMessage(err.message);
    }
  })();
})();
