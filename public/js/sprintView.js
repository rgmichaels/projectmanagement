// Sprints page (docs/specs/sprints-screen.md; design
// docs/design/sprints-and-project-scope, Sprints option A): a sprint
// dropdown (every sprint of the project, completed included), the sprint's
// summary in the panel header, and a read-only, sortable table of its work
// items. js/board.js loads the lists and items, runs the work item dialog and
// calls sprintsPage.init(ctx) and sprintsPage.render().
// The pure part (`sprintView`: defaultSprint, resolveSprintParam, sortRows)
// loads in the browser and from node:test. No sprint state, status, type or
// priority is named here: states come from GET /api/sprint-states, the sort
// orders from GET /api/types, /api/priorities and /api/statuses. Everything is
// inserted as text, never parsed as HTML.
// Time tracking (docs/specs/time-tracking.md AC 19, 55): the summary line
// carries the sprint figure, and the table ends with Estimate and Logged.
const sprintView = (() => {
  // The number at the end of a key: PM-10 -> 10 (so PM-2 sorts before PM-10).
  function keyNumber(key) {
    const m = /(\d+)\s*$/.exec(String(key === undefined || key === null ? '' : key));
    return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
  }

  const stateName = (states, flag) => {
    const s = (states || []).find((x) => x[flag]);
    return s ? s.name : null;
  };

  // The sprint shown without ?sprint= (AC 4, Decision 1): the Active one;
  // else the first Planned (lowest id, the next to start); else the most
  // recently completed (first final one in the server's order). `fallback`
  // says why: null, 'planned' or 'completed'. No sprints: sprint null.
  function defaultSprint(sprints, states) {
    const list = sprints || [];
    const active = stateName(states, 'active');
    const final = stateName(states, 'final');
    const current = list.find((s) => s.state === active);
    if (current) return { sprint: current, fallback: null };
    const planned = list.filter((s) => s.state !== active && s.state !== final).sort((a, b) => a.id - b.id);
    if (planned.length) return { sprint: planned[0], fallback: 'planned' };
    const completed = list.find((s) => s.state === final);
    if (completed) return { sprint: completed, fallback: 'completed' };
    return { sprint: null, fallback: null };
  }

  // The raw ?sprint= value against this project's sprints (AC 5, 6).
  // { sprint } when it names one of them; { sprint: null, invalid: true }
  // when it is present but not a positive integer or not this project's;
  // { sprint: null, invalid: false } when it is absent.
  function resolveSprintParam(raw, sprints) {
    if (raw === null || raw === undefined) return { sprint: null, invalid: false };
    const text = String(raw);
    const id = /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : 0;
    const sprint = id > 0 ? (sprints || []).find((s) => s.id === id) : null;
    return sprint ? { sprint, invalid: false } : { sprint: null, invalid: true };
  }

  const COLUMNS = ['key', 'title', 'type', 'epic', 'priority', 'status', 'assignee', 'estimate', 'logged'];

  // How each column compares (AC 19). `value` null means "no value": such
  // rows sort last in both directions (no epic, Unassigned).
  function columnRule(column, orders) {
    const indexIn = (list) => {
      const names = list || [];
      return (name) => {
        const i = names.indexOf(name);
        return i === -1 ? names.length : i;
      };
    };
    const byNumber = (a, b) => a - b;
    const byText = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    if (column === 'key') return { value: (r) => keyNumber(r.key), compare: byNumber };
    if (column === 'title') return { value: (r) => r.title || '', compare: byText };
    if (column === 'type') {
      const at = indexIn(orders.types);
      return { value: (r) => at(r.type), compare: byNumber };
    }
    if (column === 'priority') {
      const at = indexIn(orders.priorities);
      return { value: (r) => at(r.priority), compare: byNumber };
    }
    if (column === 'status') {
      const at = indexIn(orders.statuses);
      return { value: (r) => at(r.status), compare: byNumber };
    }
    if (column === 'epic') {
      const keys = new Map((orders.epics || []).map((e) => [e.id, e.key]));
      return { value: (r) => (r.epic_id && keys.has(r.epic_id) ? keyNumber(keys.get(r.epic_id)) : null), compare: byNumber };
    }
    if (column === 'assignee') {
      const names = new Map((orders.users || []).map((u) => [u.id, u.name]));
      return { value: (r) => (r.assignee_id && names.has(r.assignee_id) ? names.get(r.assignee_id) : null), compare: byText };
    }
    // Unestimated items sort last, like Unassigned (time-tracking design).
    if (column === 'estimate') return { value: (r) => (typeof r.estimate_hours === 'number' ? r.estimate_hours : null), compare: byNumber };
    if (column === 'logged') return { value: (r) => r.time_spent_hours || 0, compare: byNumber };
    return null;
  }

  // The table's rows in display order (AC 17-20, 23). `column` null (or
  // unknown) is the sprint's own order. `direction` 'ascending' or
  // 'descending'. `orders`: { types, priorities, statuses } (names in server
  // order) and { epics: [{ id, key }], users: [{ id, name }] }. Ties always
  // break by sprint_rank ascending, then by key number. Never mutates `rows`.
  function sortRows(rows, column, direction, orders = {}) {
    const rank = (r) => (typeof r.sprint_rank === 'number' ? r.sprint_rank : Number.MAX_SAFE_INTEGER);
    const tie = (a, b) => rank(a) - rank(b) || keyNumber(a.key) - keyNumber(b.key);
    const rule = column ? columnRule(column, orders) : null;
    const sign = direction === 'descending' ? -1 : 1;
    return [...(rows || [])].sort((a, b) => {
      if (rule) {
        const va = rule.value(a);
        const vb = rule.value(b);
        if ((va === null) !== (vb === null)) return va === null ? 1 : -1;
        if (va !== null) {
          const c = rule.compare(va, vb);
          if (c) return sign * c;
        }
      }
      return tie(a, b);
    });
  }

  return { keyNumber, defaultSprint, resolveSprintParam, sortRows, COLUMNS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = sprintView;

// ---------- the page (browser only) ----------
const sprintsPage = typeof document === 'undefined' ? null : (() => {
  const LOADING = 'Loading...';
  const FALLBACK_NOTES = {
    planned: 'No sprint is active; showing the next planned sprint.',
    completed: 'No sprint is active and none is planned; showing the most recently completed sprint.',
  };
  const ARROWS = { none: '↕', ascending: '▲', descending: '▼' };

  let ctx = null;
  const view = {
    started: false,
    sprintId: null, // the selected sprint
    fallback: null, // why it was chosen without ?sprint= (note under the dropdown)
    sort: { column: null, direction: 'ascending' }, // null column: sprint order
    rows: null, // the selected sprint's items, or null before the first load
    error: null,
    loadSeq: 0,
    focusColumn: null, // the sort button to focus after a redraw
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    panel: $('sprint-panel'),
    head: $('sprint-head'),
    pick: $('sprint-pick'),
    pickBox: $('sprint-pick-box'),
    why: $('sprint-why'),
    goal: $('sprint-goal'),
    body: $('sprint-body'),
    notice: $('sprint-notice'),
    sortStatus: $('sort-status'),
    manage: $('manage-link'),
  };

  const s = () => ctx.state;
  const sprintById = (id) => s().sprints.find((x) => x.id === id) || null;
  const selected = () => sprintById(view.sprintId);

  // Column headings; the epic one is the server's epic type label.
  function columns() {
    const epic = ctx.epicLabel();
    return [
      { key: 'key', label: 'Key' },
      { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' },
      { key: 'epic', label: epic },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'assignee', label: 'Assignee' },
      { key: 'estimate', label: 'Estimate', num: true },
      { key: 'logged', label: 'Logged', num: true },
    ];
  }
  const columnLabel = (key) => (columns().find((c) => c.key === key) || { label: key }).label;

  function orders() {
    return {
      types: s().types.map((t) => t.name),
      priorities: s().priorities,
      statuses: s().statuses,
      epics: s().items.filter(ctx.isEpicItem).map((e) => ({ id: e.id, key: e.key })),
      users: s().users.map((u) => ({ id: u.id, name: u.name })),
    };
  }

  // ---------- URL ----------

  function sprintUrl(id) {
    const url = new URL(location.href);
    url.searchParams.set('sprint', String(id));
    return url;
  }

  // Picks the sprint from ?sprint=, else the default (AC 4-6), and writes it
  // into the URL with replaceState.
  function chooseFromUrl() {
    const raw = new URLSearchParams(location.search).get('sprint');
    const asked = sprintView.resolveSprintParam(raw, s().sprints);
    view.fallback = null;
    if (asked.sprint) {
      view.sprintId = asked.sprint.id;
      setNotice('');
      return;
    }
    const chosen = sprintView.defaultSprint(s().sprints, s().sprintStates);
    view.sprintId = chosen.sprint ? chosen.sprint.id : null;
    view.fallback = chosen.fallback;
    setNotice(asked.invalid && chosen.sprint ? `Sprint not found; showing ${chosen.sprint.name} instead.` : '');
    if (chosen.sprint) {
      history.replaceState(history.state, '', sprintUrl(chosen.sprint.id));
    } else if (raw !== null) {
      // No sprints at all: a stale ?sprint= names nothing here.
      const url = new URL(location.href);
      url.searchParams.delete('sprint');
      history.replaceState(history.state, '', url);
    }
  }

  function setNotice(text) {
    els.notice.textContent = text;
    els.notice.hidden = !text;
  }

  // ---------- drawing ----------

  function fillPick() {
    const el = ctx.el;
    const sprints = s().sprints;
    if (!sprints.length) {
      els.pick.replaceChildren(el('option', { value: '' }, 'No sprints'));
      els.pick.disabled = true;
      return;
    }
    els.pick.replaceChildren(...sprints.map((x) => el('option', { value: String(x.id) }, `${x.name} (${x.state})`)));
    els.pick.disabled = false;
    els.pick.value = String(view.sprintId);
  }

  // State badge, dates, counts and the overdue badge after the dropdown (AC 8).
  function drawHead() {
    const el = ctx.el;
    const sprint = selected();
    while (els.pickBox.nextSibling) els.pickBox.nextSibling.remove();
    els.panel.className = `sprint${sprint && ctx.isActiveSprint(sprint) ? ' is-active' : ''}${sprint && ctx.isFinalSprint(sprint) ? ' is-completed' : ''}`;
    els.why.textContent = view.fallback ? FALLBACK_NOTES[view.fallback] : '';
    els.why.hidden = !view.fallback;
    els.goal.replaceChildren();
    els.goal.hidden = true;
    if (!sprint) return;
    const stateClass = ctx.isActiveSprint(sprint) ? ' state-active' : ctx.isFinalSprint(sprint) ? ' state-completed' : '';
    const dates = sprintUtil.datesText(sprint);
    const overdue = sprintUtil.isOverdue(sprint, ctx.stateWith('active'));
    els.pickBox.after(
      ...[
        el('span', { class: `badge${stateClass}` }, sprint.state),
        dates ? el('span', { class: 'sprint-meta' }, dates) : null,
        el('span', { class: 'sprint-meta' }, `${sprintUtil.count(sprint.item_count || 0, 'item')}, ${sprint.done_count || 0} done`),
        ctx.sprintFigure(sprint, { note: true }),
        overdue ? el('span', { class: 'badge overdue' }, `⚠ Overdue · ended ${sprintUtil.agoText(sprint.end_date)}`) : null,
      ].filter(Boolean)
    );
    if (sprint.goal) {
      els.goal.replaceChildren(el('strong', {}, 'Goal:'), ` ${sprint.goal}`);
      els.goal.hidden = false;
    }
  }

  function sortLine() {
    const el = ctx.el;
    const { column, direction } = view.sort;
    if (!column) return el('div', { class: 'sort-line' }, el('span', {}, 'Sprint order'));
    const reset = el('button', { type: 'button', class: 'link' }, 'Reset sort');
    reset.addEventListener('click', () => {
      view.sort = { column: null, direction: 'ascending' };
      view.focusColumn = 'key';
      els.sortStatus.textContent = 'Sprint order.';
      drawBody();
    });
    return el('div', { class: 'sort-line' }, el('span', {}, 'Sorted by ', el('strong', {}, columnLabel(column)), `, ${direction}`), reset);
  }

  function headerCell(column) {
    const el = ctx.el;
    const sorted = view.sort.column === column.key;
    const dir = sorted ? view.sort.direction : 'none';
    const button = el(
      'button',
      { type: 'button', class: 'sort', 'data-column': column.key },
      column.label,
      el('span', { class: 'arrow', 'aria-hidden': 'true' }, ARROWS[dir]),
      sorted ? el('span', { class: 'visually-hidden' }, ` sorted ${dir}`) : null
    );
    button.addEventListener('click', () => sortBy(column.key));
    const th = el('th', { scope: 'col', 'aria-sort': dir }, button);
    if (column.num) th.className = 'num'; // Estimate and Logged are right-aligned
    return th;
  }

  // One click sorts ascending, the next descending, and so on (AC 18, 21).
  function sortBy(column) {
    const same = view.sort.column === column;
    view.sort = { column, direction: same && view.sort.direction === 'ascending' ? 'descending' : 'ascending' };
    view.focusColumn = column;
    els.sortStatus.textContent = `Sorted by ${columnLabel(column)}, ${view.sort.direction}.`;
    drawBody();
  }

  function typeBadge(item) {
    const type = ctx.typeOf(item.type);
    const color = type && type.color;
    return ctx.el(
      'span',
      { class: `type-badge${color ? '' : ' type-fallback'}`, style: color ? `--type-color: ${color}` : undefined, title: item.type },
      (type && type.label) || item.type
    );
  }

  function epicCell(item) {
    const el = ctx.el;
    const epic = item.epic_id ? ctx.itemById(item.epic_id) : null;
    const label = ctx.epicLabel();
    if (!epic) {
      return [el('span', { class: 'cell-none', 'aria-hidden': 'true' }, '-'), el('span', { class: 'visually-hidden' }, `No ${label.toLowerCase()}`)];
    }
    const chip = el('button', { type: 'button', class: 'epic-chip', title: epic.title, 'aria-label': `${label} ${epic.key}: ${epic.title}` }, epic.key);
    chip.addEventListener('click', () => ctx.openDetail(epic));
    return [chip];
  }

  function assigneeCell(item) {
    const el = ctx.el;
    const user = ctx.userById(item.assignee_id);
    if (!user) {
      return el('span', { class: 'assignee' }, el('span', { class: 'avatar unassigned', 'aria-hidden': 'true' }, '?'), el('span', { class: 'cell-none' }, 'Unassigned'));
    }
    return el('span', { class: 'assignee' }, el('span', { class: 'avatar', 'aria-hidden': 'true' }, ctx.initials(user.name)), user.name);
  }

  // Hours, or a dash with hidden text when there is no estimate.
  function estimateCell(item) {
    const el = ctx.el;
    if (typeof item.estimate_hours !== 'number') {
      return [el('span', { class: 'cell-none', 'aria-hidden': 'true' }, '-'), el('span', { class: 'visually-hidden' }, 'Not estimated')];
    }
    return [timeFormat.hours(item.estimate_hours)];
  }

  function row(item) {
    const el = ctx.el;
    const open = () => ctx.openDetail(item);
    const done = ctx.isTerminal(item.status);
    return el(
      'tr',
      { 'data-id': item.id },
      el('td', { class: 'c-key' }, el('button', { type: 'button', class: 'key-btn', onclick: open }, item.key)),
      el('td', { class: 'c-title' }, el('button', { type: 'button', class: 'title-btn', onclick: open }, item.title)),
      el('td', { class: 'c-nowrap' }, typeBadge(item)),
      el('td', { class: 'c-nowrap' }, ...epicCell(item)),
      el('td', { class: 'c-nowrap' }, el('span', { class: 'priority' }, item.priority)),
      el('td', { class: 'c-nowrap' }, el('span', { class: `status-pill${done ? ' is-done' : ''}` }, item.status)),
      el('td', {}, assigneeCell(item)),
      el('td', { class: 'num' }, ...estimateCell(item)),
      el('td', { class: 'num' }, timeFormat.hours(item.time_spent_hours || 0))
    );
  }

  // The panel body below the header: loading, error, empty or the table.
  function drawBody() {
    const el = ctx.el;
    const sprint = selected();
    if (!sprint) {
      els.body.replaceChildren(
        el(
          'div',
          { class: 'empty sprints-empty' },
          el('p', {}, 'This project has no sprints yet.'),
          el('a', { href: projectScope.pageUrl('backlog.html', s().project.id) }, 'Go to the Backlog to create one')
        )
      );
      return;
    }
    if (view.error) {
      const retry = el('button', { type: 'button', class: 'spacer' }, 'Retry');
      // Retry re-fetches the sprints and the items (render() then reloads the rows).
      retry.addEventListener('click', () => {
        view.error = null;
        view.rows = null;
        drawBody();
        ctx.reloadItems().catch((err) => {
          view.error = err;
          drawBody();
        });
      });
      els.body.replaceChildren(
        el('div', { class: 'banner-warn sprint-load-error', role: 'alert' }, el('strong', {}, 'Could not load work items.'), el('span', {}, view.error.message), retry)
      );
      return;
    }
    if (view.rows === null) {
      els.body.replaceChildren(el('p', { class: 'hist-loading', role: 'status' }, LOADING));
      return;
    }
    // Epics never belong to a sprint (AC 10); drop any defensively.
    const rows = view.rows.filter((i) => !ctx.isEpicItem(i));
    if (!rows.length) {
      els.body.replaceChildren(el('p', { class: 'brows-empty' }, 'No work items in this sprint.'));
      return;
    }
    const sorted = sprintView.sortRows(rows, view.sort.column, view.sort.direction, orders());
    const table = el(
      'table',
      { class: 'sprint-table with-time', 'aria-label': `Work items in ${sprint.name}` },
      el('thead', {}, el('tr', {}, ...columns().map(headerCell))),
      el('tbody', {}, ...sorted.map(row))
    );
    els.body.replaceChildren(sortLine(), el('div', { class: 'table-wrap' }, table));
    if (view.focusColumn) {
      const button = table.querySelector(`button.sort[data-column="${view.focusColumn}"]`);
      view.focusColumn = null;
      if (button) button.focus();
    }
  }

  // Fetches the selected sprint's items (AC 9). `quiet` keeps the current
  // table on screen while it refreshes (after a dialog save).
  async function loadRows(quiet) {
    const sprint = selected();
    const seq = ++view.loadSeq;
    if (!sprint) {
      view.rows = [];
      drawBody();
      return;
    }
    if (!quiet) {
      view.rows = null;
      view.error = null;
      drawBody();
    }
    try {
      const rows = await api.get(`/api/projects/${s().project.id}/issues?sprint=${sprint.id}`);
      if (seq !== view.loadSeq) return; // another sprint was picked meanwhile
      view.rows = rows;
      view.error = null;
    } catch (err) {
      if (seq !== view.loadSeq) return;
      view.error = err;
    }
    drawBody();
  }

  // A different sprint: the sort goes back to sprint order (AC 22).
  function showSprint(id) {
    view.sprintId = id;
    view.sort = { column: null, direction: 'ascending' };
    els.sortStatus.textContent = '';
    fillPick();
    drawHead();
    loadRows(false);
  }

  function init(context) {
    ctx = context;
    els.manage.href = projectScope.pageUrl('backlog.html', s().project.id);
    els.pick.addEventListener('change', () => {
      const id = Number(els.pick.value);
      if (!sprintById(id)) return;
      view.fallback = null;
      setNotice('');
      history.pushState(history.state, '', sprintUrl(id)); // Back returns to the previous sprint
      showSprint(id);
    });
    window.addEventListener('popstate', () => {
      if (!view.started) return;
      chooseFromUrl();
      showSprint(view.sprintId);
    });
  }

  // Called by board.js after every (re)load of the sprints and items. The
  // first call picks the sprint; later ones keep the sprint and the sort.
  function render() {
    if (!ctx || !s().project) return;
    if (!view.started) {
      view.started = true;
      chooseFromUrl();
      fillPick();
      drawHead();
      loadRows(false);
      return;
    }
    const quiet = Boolean(selected());
    if (!quiet) chooseFromUrl(); // the sprint is gone: fall back (AC 4)
    fillPick();
    drawHead();
    loadRows(quiet);
  }

  return { init, render };
})();
