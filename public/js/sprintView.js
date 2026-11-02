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
// Scope change (docs/specs/sprint-scope-change.md AC 20-27; design option
// A): the Scope change panel between the goal and the table, from
// GET /api/sprints/:id/scope, re-read whenever the table is; its texts come
// from js/scope.js, and titles carry the "Added after start" badge
// (ctx.addedBadge).
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
    scope: null, // the selected sprint's scope summary, or null before it loads
    scopeError: null,
    scopeSeq: 0,
    scopeKinds: null, // GET /api/scope-event-kinds, loaded once
    scopeLogOpen: false, // the log's open state survives a refresh (design)
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    panel: $('sprint-panel'),
    head: $('sprint-head'),
    pick: $('sprint-pick'),
    pickBox: $('sprint-pick-box'),
    why: $('sprint-why'),
    goal: $('sprint-goal'),
    scope: $('sprint-scope'),
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
      el('td', { class: 'c-title' }, el('button', { type: 'button', class: 'title-btn', onclick: open }, item.title), ctx.addedBadge(item)),
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

  // ---------- scope change (docs/specs/sprint-scope-change.md AC 20-25) ----------

  const SCOPE_TEXT = {
    loading: 'Loading scope change...',
    planned: 'Scope is tracked from the moment the sprint starts.',
    untracked: 'Scope change was not tracked for this sprint.',
    failed: 'Could not load scope change.',
    hint: 'Hours are work item estimates. Read-only.',
    lateHelp: 'The sprint was already running when tracking began.',
    empty: 'No scope changes yet.',
    grace: 'adjusted in first 24h',
    noEstimate: 'no estimate',
  };

  // A kind from GET /api/scope-event-kinds (an unknown one shows its key).
  const kindOf = (key) => (view.scopeKinds || []).find((k) => k.key === key) || { key, label: key, effect: null };

  const scopeMessage = (text) => ctx.el('p', { class: 'scope-msg', role: 'status' }, text);

  function tile(label, value, sub, extra = '') {
    const el = ctx.el;
    const growth = extra.includes('is-growth');
    return el(
      'li',
      { class: `tile${extra}` },
      el('span', { class: 'tile-label' }, label),
      el('span', { class: `tile-val${growth ? ' growth-word' : ''}` }, value),
      el('span', { class: 'tile-sub' }, sub)
    );
  }

  // One log row: kind, key, title and tags; hours; actor and time. Titles
  // and names are text.
  function logItem(event) {
    const el = ctx.el;
    const kind = kindOf(event.kind);
    const noEstimate = kind.effect === 'add' && (event.hours === null || event.hours === undefined);
    return el(
      'li',
      { class: 'log-item' },
      el(
        'span',
        { class: 'log-what' },
        el('span', { class: 'log-kind' }, kind.label),
        ' ',
        el('span', { class: 'card-key' }, event.issue_key),
        ` ${event.issue_title}`,
        event.in_grace ? el('span', { class: 'grace-tag' }, SCOPE_TEXT.grace) : null,
        noEstimate ? el('span', { class: 'grace-tag' }, SCOPE_TEXT.noEstimate) : null
      ),
      el('span', { class: 'log-hours' }, scopeFormat.eventHours(event, kind.effect)),
      el('span', { class: 'log-meta' }, `${event.actor_name} · `, el('time', { datetime: event.created_at }, timeFormat.localDateTime(event.created_at)))
    );
  }

  // The panel of a tracked sprint (design option A, frames 1-7).
  function scopePanel(sprint, sum) {
    const el = ctx.el;
    const final = ctx.isFinalSprint(sprint);
    const headingId = `scope-h-${sprint.id}`;
    const up = typeof sum.growth_percent === 'number' && sum.growth_percent > 0;
    const L = scopeFormat.TILE_LABELS;
    const tiles = el(
      'ul',
      { class: 'tiles' },
      tile(L.planned, timeFormat.hours(sum.planned_hours), 'plan after the first 24h'),
      tile(L.added, scopeFormat.plus(sum.added.hours), scopeFormat.count(sum.added.count, 'item')),
      tile(L.removed, scopeFormat.minus(sum.removed.hours), scopeFormat.count(sum.removed.count, 'item')),
      tile(L.estimate, scopeFormat.signed(sum.estimate_change.hours), scopeFormat.count(sum.estimate_change.count, 'change')),
      tile(final ? L.final : L.current, timeFormat.hours(sum.current_total_hours), final ? 'frozen at completion' : 'planned + net change', ' is-total'),
      tile(L.growth, scopeFormat.growthText(sum.growth_percent), `net ${scopeFormat.signed(sum.net_change_hours)}`, ` is-growth${up ? ' is-up' : ''}`)
    );
    const baselineLine = el('li', {}, el('strong', {}, 'Baseline:'), ` ${scopeFormat.baselineText(sum.baseline)}`);
    if (sum.baseline_late) {
      baselineLine.append(
        el('span', { class: 'late-note', title: SCOPE_TEXT.lateHelp }, `Baseline captured on ${scopeFormat.localDate(sum.baseline_at)}`),
        el('span', { class: 'hint' }, SCOPE_TEXT.lateHelp)
      );
    }
    const lines = el('ul', { class: 'scope-lines' }, baselineLine);
    if (scopeFormat.hasGrace(sum)) {
      lines.append(el('li', {}, el('strong', {}, 'Adjusted in first 24h:'), ` ${scopeFormat.graceText(sum.grace)} `, el('span', { class: 'hint' }, '(not counted as scope change)')));
    }
    if (final && sprint.completed_at) {
      lines.append(el('li', {}, el('strong', {}, `Sprint completed ${scopeFormat.localDate(sprint.completed_at)}.`), ' These numbers are final.'));
    }
    const unestimated = sum.unestimated_added_count || 0;
    const note = unestimated > 0 ? el('p', { class: 'scope-note' }, scopeFormat.unestimatedText(unestimated)) : null;
    const log = el(
      'details',
      { class: 'scope-log', open: view.scopeLogOpen },
      el('summary', {}, `Scope change log (${sum.events.length})`),
      sum.events.length ? el('ol', { class: 'log-list' }, ...sum.events.map(logItem)) : el('p', { class: 'log-empty' }, SCOPE_TEXT.empty)
    );
    log.addEventListener('toggle', () => { view.scopeLogOpen = log.open; });
    return el(
      'section',
      { class: 'scope', 'aria-labelledby': headingId },
      el('div', { class: 'scope-head' }, el('h3', { id: headingId }, final ? 'Final scope change' : 'Scope change'), el('span', { class: 'hint' }, SCOPE_TEXT.hint)),
      tiles,
      el('p', { class: 'scope-eq' }, scopeFormat.equation(sum, final)),
      lines,
      note,
      log
    );
  }

  // Loading, error with Retry, Planned, not tracked, or the panel (AC 24).
  // A sprint that is not final and not tracked is one that has not started.
  function drawScope() {
    const el = ctx.el;
    const sprint = selected();
    if (!sprint) {
      els.scope.replaceChildren();
      return;
    }
    if (view.scopeError) {
      const retry = el('button', { type: 'button' }, 'Retry');
      retry.addEventListener('click', () => loadScope(false)); // the scope request only
      els.scope.replaceChildren(
        el(
          'div',
          { class: 'scope-err' },
          el('div', { class: 'banner-warn', role: 'alert' }, el('strong', {}, SCOPE_TEXT.failed), el('span', {}, view.scopeError.message || ''), el('span', { class: 'spacer' }), retry)
        )
      );
      return;
    }
    const sum = view.scope;
    if (!sum) {
      els.scope.replaceChildren(scopeMessage(SCOPE_TEXT.loading));
      return;
    }
    if (!sum.tracked) {
      els.scope.replaceChildren(scopeMessage(ctx.isFinalSprint(sprint) ? SCOPE_TEXT.untracked : SCOPE_TEXT.planned));
      return;
    }
    els.scope.replaceChildren(scopePanel(sprint, sum));
  }

  // Fetches the selected sprint's scope (and the kinds, once). `quiet`
  // keeps the current panel on screen while it refreshes (AC 25).
  async function loadScope(quiet) {
    const sprint = selected();
    const seq = ++view.scopeSeq;
    if (!sprint) {
      view.scope = null;
      drawScope();
      return;
    }
    if (!quiet || view.scopeError) {
      view.scope = null;
      view.scopeError = null;
      drawScope();
    }
    try {
      const [kinds, sum] = await Promise.all([
        view.scopeKinds ? Promise.resolve(view.scopeKinds) : api.get('/api/scope-event-kinds'),
        api.get(`/api/sprints/${sprint.id}/scope`),
      ]);
      if (seq !== view.scopeSeq) return; // another sprint was picked meanwhile
      view.scopeKinds = kinds;
      view.scope = sum;
      view.scopeError = null;
    } catch (err) {
      if (seq !== view.scopeSeq) return;
      view.scopeError = err;
    }
    drawScope();
  }

  // A different sprint: the sort goes back to sprint order (AC 22).
  function showSprint(id) {
    view.sprintId = id;
    view.sort = { column: null, direction: 'ascending' };
    els.sortStatus.textContent = '';
    view.scopeLogOpen = false; // a different sprint's log starts closed
    fillPick();
    drawHead();
    loadScope(false);
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
      loadScope(false);
      loadRows(false);
      return;
    }
    const quiet = Boolean(selected());
    if (!quiet) chooseFromUrl(); // the sprint is gone: fall back (AC 4)
    fillPick();
    drawHead();
    loadScope(quiet); // after a dialog save: the panel updates with the table (AC 25)
    loadRows(quiet);
  }

  return { init, render };
})();
