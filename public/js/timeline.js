// Timeline page (docs/specs/gantt-chart.md; design docs/design/gantt-chart,
// README.md is the UI contract): epics, sprints and work items as bars on a
// date axis with Day / Week / Month zoom, a Today marker, drag to move or
// resize, and an Unscheduled list whose rows can be dropped onto the chart.
// js/board.js loads the lists and items, runs the work item dialog and calls
// timelinePage.init(ctx) and timelinePage.render(). The arithmetic lives in
// js/timelineMath.js (pure, unit-tested). Hand-rolled HTML/CSS, no library
// (AC 8). Every title is inserted as text, never parsed as HTML. Nothing here
// names a status, type or sprint state: status colours follow the server's
// status order and terminal status, sprint colours the state flags.
// Editing (drag, resize, drop) follows the dialog: anyone who may edit work
// items in this project on a live project (ctx.readOnly()); the server checks
// every PATCH anyway.
const timelinePage = (() => {
  const M = timelineMath;
  const ZOOM_STORAGE_KEY = 'pm.timelineZoom';
  const LABEL_W = 260; // the sticky label column (CSS --label-w)
  const SHORT_BAR = 110; // narrower bars put their label outside (design)
  const ZOOM_NAMES = { day: 'Day', week: 'Week', month: 'Month' };

  let ctx = null;
  let zoom = M.parseZoom(projectScope.storageGet(ZOOM_STORAGE_KEY));
  const collapsed = new Set(); // group keys; all expanded at first (AC 9)
  let centreOn = null; // a date to centre after the next render (first draw, zoom change)
  let revertId = null; // the bar that failed to save (red outline until the next action)
  let saving = false;
  let dropItem = null; // the Unscheduled item being dragged
  let view = null; // { range, chart, track width } of the last render

  const $ = (id) => document.getElementById(id);
  const els = {
    zoom: $('tl-zoom'),
    readonly: $('tl-readonly'),
    message: $('timeline-message'),
    legend: $('tl-legend'),
    chartBox: $('tl-chart-box'),
    unsched: $('tl-unsched'),
  };

  const el = (...args) => ctx.el(...args);
  const px = (n) => `${Math.round(n)}px`;

  // ---------- message area ----------

  function clearMessage() {
    els.message.replaceChildren();
  }

  // A failed save (AC 22): the bar is already back; say why.
  function showSaveError(text, after) {
    els.message.replaceChildren(
      el(
        'div',
        { class: 'banner-warn' },
        el('strong', {}, 'Could not save.'),
        el('span', {}, `${text}${after ? ` ${after}` : ''}`),
        el('button', { type: 'button', class: 'link spacer', onclick: dismiss }, 'Dismiss')
      )
    );
  }

  function dismiss() {
    clearMessage();
    clearRevert();
  }

  function clearRevert() {
    if (revertId === null) return;
    revertId = null;
    for (const bar of document.querySelectorAll('.bar.is-reverting')) bar.classList.remove('is-reverting');
  }

  // The page could not load (design states.html 7).
  function loadFailed(err) {
    els.chartBox.replaceChildren();
    els.message.replaceChildren(
      el(
        'div',
        { class: 'banner-warn' },
        el('strong', {}, 'Could not load the timeline.'),
        el('span', {}, (err && err.message) || ''),
        el('button', { type: 'button', class: 'link spacer', onclick: () => location.reload() }, 'Retry')
      )
    );
  }

  // ---------- init ----------

  function syncZoomButtons() {
    for (const b of els.zoom.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.zoom === zoom));
  }

  function init(context) {
    ctx = context;
    centreOn = M.localToday();
    syncZoomButtons();
    for (const b of els.zoom.querySelectorAll('button')) {
      b.addEventListener('click', () => setZoom(b.dataset.zoom));
    }
    const p = ctx.state.project;
    let text = '';
    if (p && p.archived) text = 'This project is archived. You can read the timeline but not change it.';
    else if (ctx.readOnly()) text = 'You can view the timeline but not change it.';
    els.readonly.textContent = text;
    els.readonly.hidden = !text;
    renderLegend();
  }

  // Keeps today in view when it is visible, else the current scroll centre (AC 14).
  function setZoom(next) {
    const z = M.parseZoom(next);
    if (z === zoom) return;
    const today = M.localToday();
    let centre = today;
    if (view && view.chart.isConnected) {
      const c = view.chart;
      const left = M.xToDate(c.scrollLeft, view.range.start, zoom);
      const right = M.xToDate(c.scrollLeft + c.clientWidth - LABEL_W, view.range.start, zoom);
      if (!(today >= left && today <= right)) centre = M.xToDate(c.scrollLeft + (c.clientWidth - LABEL_W) / 2, view.range.start, zoom);
    }
    zoom = z;
    projectScope.storageSet(ZOOM_STORAGE_KEY, z);
    centreOn = centre;
    clearRevert();
    syncZoomButtons();
    render();
  }

  // The legend (design): one swatch per status in server order, then the
  // epic bar, the rollup bar and Today. Words with every colour.
  function renderLegend() {
    const { statuses, terminalStatus } = ctx.state;
    const sw = (cls) => el('span', { class: `sw ${cls}`, 'aria-hidden': 'true' });
    const items = statuses.map((s) => {
      const cat = M.statusCategory(s, statuses, terminalStatus);
      return el('li', {}, sw(`lg-${cat}`), cat === 'done' ? `✓ ${s} (muted)` : s);
    });
    const epic = ctx.epicLabel();
    if (epic) {
      items.push(el('li', {}, sw('lg-epic'), epic));
      items.push(el('li', {}, sw('lg-rollup'), `${epic} rollup (read-only)`));
    }
    items.push(el('li', {}, el('span', { class: 'lg-today', 'aria-hidden': 'true' }), 'Today'));
    els.legend.replaceChildren(...items);
  }

  // ---------- render ----------

  const typeDot = (item) => {
    const type = ctx.typeOf(item.type);
    return el('span', { class: 'type-dot', style: type && type.color ? `--tc: ${type.color}` : undefined, 'aria-hidden': 'true' });
  };
  const epicTag = () => el('span', { class: 'epic-tag' }, ctx.epicLabel());

  function render() {
    if (!ctx) return;
    const ro = ctx.readOnly();
    const items = ctx.state.items;
    const grouped = M.buildGroups(items, ctx.isEpicItem);
    renderUnscheduled(grouped.unscheduled, ro);
    if (!items.length) {
      view = null;
      els.chartBox.replaceChildren(
        el(
          'div',
          { class: 'empty' },
          el('p', { style: 'margin:0 0 4px;font-weight:700' }, 'No work items yet.'),
          el('p', { class: 'hint', style: 'margin:0' }, 'Create work items on the Board or Backlog; they appear here once they have dates.')
        )
      );
      return;
    }
    const old = view && view.chart.isConnected ? view.chart : null;
    const keep = old ? { left: old.scrollLeft, top: old.scrollTop } : null;
    const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focusKey : null;

    const today = M.localToday();
    const range = M.visibleRange(M.pageDates(items, ctx.state.sprints), today, zoom);
    const width = range.days * M.pxPerDay(zoom);
    const chart = el('div', {
      class: `tl${ro ? ' is-readonly' : ''}`,
      id: 'chart',
      role: 'region',
      'aria-label': `Timeline chart, ${ZOOM_NAMES[zoom].toLowerCase()} zoom`,
      tabindex: '0',
    });
    view = { range, chart, width };
    const cols = M.columns(range, zoom);
    const todayX = M.dateToX(today, range.start, zoom) + M.pxPerDay(zoom) / 2;

    const axis = el('div', { class: 'tl-axis', style: `width:${px(width)}` });
    for (const c of cols) {
      axis.append(
        el(
          'div',
          { class: `ax${zoom === 'month' ? ' month-cell' : ''}${c.weekend ? ' is-weekend' : ''}`, style: `left:${px(c.x)};width:${px(c.width)}` },
          c.t1 ? el('span', { class: zoom === 'month' ? undefined : 't1' }, c.t1) : null,
          c.t2 ? el('span', { class: 't2' }, c.t2) : null
        )
      );
    }
    axis.append(el('span', { class: 'tl-flag', style: `left:${px(todayX)}` }, 'Today'));
    const head = el('div', { class: 'tl-head' }, el('div', { class: 'tl-corner' }, 'Epic / work item'), axis);

    const grid = el('div', { class: 'tl-grid', style: `width:${px(width)}` });
    for (const c of cols) {
      if (c.weekend) grid.append(el('i', { class: 'we', style: `left:${px(c.x)};width:${px(c.width)}` }));
      else grid.append(el('i', { style: `left:${px(c.x)}` }));
    }
    const body = el('div', { class: 'tl-body' }, grid, el('div', { class: 'tl-today', style: `left:${px(LABEL_W + todayX)}` }));
    for (const row of sprintRows(range, width)) body.append(row);
    for (const g of grouped.groups) for (const row of epicRows(g, range, width, ro)) body.append(row);
    if (grouped.noEpic.children.length) for (const row of noEpicRows(grouped.noEpic, range, width, ro)) body.append(row);

    chart.append(el('div', { class: 'tl-inner', style: `width:${px(LABEL_W + width)}` }, head, body));
    if (!ro) wireDrop(chart, body);
    els.chartBox.replaceChildren(chart);

    if (centreOn) {
      chart.scrollLeft = M.scrollFor(M.dateToX(centreOn, range.start, zoom), chart.clientWidth, LABEL_W);
      if (keep) chart.scrollTop = keep.top;
      centreOn = null;
    } else if (keep) {
      chart.scrollLeft = keep.left;
      chart.scrollTop = keep.top;
    }
    if (focusKey) {
      const again = chart.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function row(cls, label, track) {
    return el('div', { class: `tl-row ${cls}` }, label, track);
  }
  const trackOf = (width, ...children) => el('div', { class: 'tl-track', style: `width:${px(width)}` }, ...children);

  // A group's collapse toggle (design: aria-expanded, "Collapse PM-1").
  function toggle(key, name) {
    const open = !collapsed.has(key);
    return el(
      'button',
      {
        type: 'button',
        class: 'tl-toggle',
        'aria-expanded': String(open),
        'aria-label': `${open ? 'Collapse' : 'Expand'} ${name}`,
        'data-focus-key': `toggle:${key}`,
        onclick: () => {
          if (collapsed.has(key)) collapsed.delete(key);
          else collapsed.add(key);
          render();
        },
      },
      open ? '▾' : '▸'
    );
  }

  // Sprints group (AC 12): one read-only bar per dated sprint, coloured by
  // state flag, and a note naming the sprints without both dates.
  function sprintRows(range, width) {
    const sprints = ctx.state.sprints || [];
    if (!sprints.length) return [];
    const dated = sprints.filter((s) => s.start_date && s.end_date && s.start_date <= s.end_date).sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : a.id - b.id));
    const undated = sprints.filter((s) => !dated.includes(s));
    const rows = [
      row(
        'group sprint-group',
        el('div', { class: 'tl-label' }, toggle('sprints', 'Sprints'), el('span', { class: 'ttl' }, 'Sprints'), el('span', { class: 'n tl-count' }, String(dated.length))),
        trackOf(width)
      ),
    ];
    if (collapsed.has('sprints')) return rows;
    for (const s of dated) {
      const active = ctx.isActiveSprint(s);
      const final = ctx.isFinalSprint(s);
      const cls = active ? 'sp-active' : final ? 'sp-completed' : 'sp-planned';
      const badge = active ? ' state-active' : final ? ' state-completed' : ' state-planned';
      const dates = M.rangeText({ start: s.start_date, due: s.end_date });
      const box = M.barBox({ start: s.start_date, due: s.end_date }, range.start, zoom);
      rows.push(
        row(
          'tl-sprint',
          el('div', { class: 'tl-label' }, el('span', { class: 'ttl', title: s.name }, s.name), el('span', { class: `badge${badge}`, style: 'margin-left:auto' }, s.state)),
          trackOf(
            width,
            el(
              'div',
              {
                class: `bar sprint-bar-t ${cls}${box.width < SHORT_BAR ? ' is-short' : ''}`,
                style: `left:${px(box.left)};width:${px(box.width)}`,
                title: `${s.name} (${s.state}, ${dates})`,
                role: 'img',
                'aria-label': `${s.name}, ${s.state}, ${dates}`,
              },
              el('span', { class: 'bar-text' }, `${s.name} · ${s.state}`)
            )
          )
        )
      );
    }
    if (undated.length) {
      rows.push(
        el(
          'div',
          { class: 'tl-row tl-note-row tl-sprint' },
          el('div', { class: 'tl-label tl-note-label' }, el('span', { class: 'hint' }, `Sprints without dates: ${undated.map((s) => s.name).join(', ')}`))
        )
      );
    }
    return rows;
  }

  // An epic's group (AC 9, 10): header with its own bar or the rollup of
  // its scheduled children, then the children unless collapsed.
  function epicRows(g, range, width, ro) {
    const { epic } = g;
    const key = `epic:${epic.id}`;
    let bar = null;
    if (g.own) bar = itemBar(epic, g.own, range, ro, true);
    else if (g.rollup) bar = rollupBar(`${epic.key} ${epic.title}`, g.rollup, range, () => ctx.openDetail(epic));
    const rows = [
      row(
        'group',
        el(
          'div',
          { class: 'tl-label' },
          toggle(key, epic.key),
          epicTag(),
          el('span', { class: 'keychip' }, epic.key),
          el('button', { type: 'button', class: 'title-btn', title: epic.title, 'data-focus-key': `title:${epic.id}`, onclick: () => ctx.openDetail(epic) }, epic.title),
          el('span', { class: 'n tl-count' }, String(g.children.length))
        ),
        trackOf(width, bar)
      ),
    ];
    if (!collapsed.has(key)) for (const child of g.children) rows.push(itemRow(child, range, width, ro));
    return rows;
  }

  function noEpicRows(group, range, width, ro) {
    const key = 'no-epic';
    const rows = [
      row(
        'group',
        el('div', { class: 'tl-label' }, toggle(key, 'No epic'), el('span', { class: 'ttl' }, 'No epic'), el('span', { class: 'n tl-count' }, String(group.children.length))),
        trackOf(width, group.rollup ? rollupBar('No epic', group.rollup, range, null) : null)
      ),
    ];
    if (!collapsed.has(key)) for (const child of group.children) rows.push(itemRow(child, range, width, ro));
    return rows;
  }

  function itemRow(item, range, width, ro) {
    return row(
      'item',
      el(
        'div',
        { class: 'tl-label' },
        typeDot(item),
        el('span', { class: 'keychip' }, item.key),
        el('button', { type: 'button', class: 'title-btn', title: item.title, 'data-focus-key': `title:${item.id}`, onclick: () => ctx.openDetail(item) }, item.title)
      ),
      trackOf(width, itemBar(item, M.span(item), range, ro, false))
    );
  }

  // Lays a bar out for span `s` (left, width, short label).
  function place(bar, s, range) {
    const box = M.barBox(s, range.start, zoom);
    bar.style.left = px(box.left);
    bar.style.width = px(box.width);
    bar.classList.toggle('is-short', box.width < SHORT_BAR);
    bar.classList.toggle('one-day', s.start === s.due);
    return box;
  }

  // A rollup bar (AC 10): read-only, never draggable. An epic's opens the
  // epic (owner decision); the "No epic" one is only a picture.
  function rollupBar(name, s, range, onOpen) {
    const dates = M.rangeText(s);
    const attrs = {
      class: 'bar rollup',
      title: `${name} (rollup) (${dates})`,
      'aria-label': `${name} (rollup), rollup of scheduled work items, ${dates}`,
    };
    const bar = onOpen
      ? el('button', { type: 'button', ...attrs, onclick: onOpen }, el('span', { class: 'bar-text' }, `${name} (rollup)`))
      : el('div', { role: 'img', ...attrs }, el('span', { class: 'bar-text' }, `${name} (rollup)`));
    place(bar, s, range);
    return bar;
  }

  // A work item's or an epic's own-date bar (AC 11, 20-23, 25-27).
  function itemBar(item, s, range, ro, isEpic) {
    const cat = M.statusCategory(item.status, ctx.state.statuses, ctx.state.terminalStatus);
    const text = `${item.key} ${item.title}`;
    const dates = M.rangeText(s);
    const bar = el(
      'button',
      {
        type: 'button',
        class: `bar ${isEpic ? 'epic' : `s-${cat}`}${revertId === item.id ? ' is-reverting' : ''}`,
        title: `${text} (${item.status}, ${dates})`,
        'aria-label': `${text}, ${item.status}, ${dates}`,
        'data-focus-key': `bar:${item.id}`,
      },
      el('span', { class: 'bar-text' }, text)
    );
    place(bar, s, range);
    let dragged = false;
    bar.addEventListener('click', () => {
      if (dragged) {
        dragged = false; // a click after a drag does not open (AC 27)
        return;
      }
      ctx.openDetail(item);
    });
    if (ro) return bar;
    bar.append(el('span', { class: 'h l', 'aria-hidden': 'true' }), el('span', { class: 'h r', 'aria-hidden': 'true' }));
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || saving) return;
      dragged = false;
      startDrag(e, bar, item, range, () => { dragged = true; });
    });
    return bar;
  }

  // ---------- drag to move and resize (AC 20-23, 27) ----------

  function startDrag(e, bar, item, range, markDragged) {
    const edge = e.target.closest('.h.l') ? 'left' : e.target.closest('.h.r') ? 'right' : null;
    const track = bar.parentElement;
    const origin = M.span(item);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moving = false;
    let next = null;
    let ghost = null;
    let tip = null;
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      /* older browsers: the window listeners below still see the moves */
    }
    e.preventDefault(); // no text selection while dragging

    const onMove = (ev) => {
      const dx = ev.clientX - x0;
      if (!moving && M.isClick(dx, ev.clientY - y0)) return;
      if (!moving) {
        moving = true;
        clearRevert();
        bar.classList.add('is-dragging');
        const box = M.barBox(origin, range.start, zoom);
        ghost = el('div', { class: 'bar-origin', style: `left:${px(box.left)};width:${px(box.width)}`, 'aria-hidden': 'true' });
        tip = el('div', { class: 'tl-tip', 'aria-hidden': 'true' });
        track.append(ghost, tip);
      }
      const delta = M.snapDays(dx, zoom);
      next = edge ? M.resizeDates(item, edge, delta) : M.moveDates(item, delta);
      const s = M.span(next);
      const box = place(bar, s, range);
      tip.textContent = edge ? M.resizeTip(item.key, edge, s) : M.moveTip(item.key, s);
      tip.style.left = px(box.left);
      tip.style.top = '-26px';
    };
    const finish = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!moving) return; // a click: the click event opens the dialog
      markDragged();
      bar.classList.remove('is-dragging');
      if (ghost) ghost.remove();
      if (tip) tip.remove();
      if (ev.type === 'pointercancel' || !next) {
        place(bar, origin, range);
        return;
      }
      save(item, M.changedDates(item, next), () => place(bar, origin, range), 'The bar was returned to its original dates.');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  // PATCH only the changed dates (AC 22). Success keeps the new place and
  // refreshes History; failure puts the bar back with a red outline and
  // says why in the message area. Never silent.
  async function save(item, changes, undo, after) {
    if (!Object.keys(changes).length) {
      undo();
      return;
    }
    saving = true;
    try {
      const updated = await api.patch(`/api/issues/${item.id}`, changes);
      Object.assign(item, updated); // keeps list-only fields such as comment_count
      clearMessage();
      ctx.historySaved(item.id);
    } catch (err) {
      undo();
      revertId = item.id;
      showSaveError(`${item.key}: ${err.message || 'Network error.'}`, after);
    } finally {
      saving = false;
    }
    render();
  }

  // ---------- Unscheduled list and drop (AC 13, 24, 25) ----------

  function renderUnscheduled(list, ro) {
    const rows = list.map((item) => {
      const epic = ctx.isEpicItem(item);
      const button = el(
        'button',
        {
          type: 'button',
          class: `un-row${ro ? ' is-ro' : ''}`,
          title: `${item.key} ${item.title}`,
          draggable: ro ? undefined : 'true',
          onclick: () => ctx.openDetail(item),
        },
        ro ? null : el('span', { class: 'grip', 'aria-hidden': 'true' }, '⋮⋮'),
        epic ? epicTag() : typeDot(item),
        el('span', { class: 'keychip' }, item.key),
        el('span', { class: 'ttl' }, item.title)
      );
      if (!ro) {
        button.addEventListener('dragstart', (e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          dropItem = item;
          clearRevert();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.key);
          button.classList.add('is-dragging');
          if (view) view.chart.classList.add('is-drop-target');
        });
        button.addEventListener('dragend', () => {
          dropItem = null;
          button.classList.remove('is-dragging');
          clearDropHint();
        });
      }
      return el('li', {}, button);
    });
    els.unsched.replaceChildren(
      el('div', { class: 'unsched-head' }, el('h2', { id: 'un-h' }, 'Unscheduled'), el('span', { class: 'n', 'aria-label': `${list.length} unscheduled` }, String(list.length))),
      el('p', { class: 'hint' }, ro ? 'Read-only. Click a row to open it.' : 'Drag a row onto the chart to schedule it for 7 days, or click it to set dates.'),
      list.length ? el('ul', {}, ...rows) : el('p', { class: 'un-empty', role: 'status' }, 'Nothing unscheduled.')
    );
  }

  let dropHint = null; // { col, tip }
  function clearDropHint() {
    if (dropHint) {
      dropHint.col.remove();
      dropHint.tip.remove();
      dropHint = null;
    }
    if (view) view.chart.classList.remove('is-drop-target');
  }

  // The day under the pointer, or null over the label column.
  function dayAt(chart, clientX) {
    const inner = chart.querySelector('.tl-inner');
    const x = clientX - inner.getBoundingClientRect().left - LABEL_W;
    if (x < 0 || x >= view.width) return null;
    return M.xToDate(x, view.range.start, zoom);
  }

  function wireDrop(chart, body) {
    chart.addEventListener('dragover', (e) => {
      if (!dropItem) return;
      const day = dayAt(chart, e.clientX);
      if (!day) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      chart.classList.add('is-drop-target');
      if (!dropHint) {
        dropHint = { col: el('div', { class: 'tl-dropcol', 'aria-hidden': 'true' }), tip: el('div', { class: 'tl-tip', 'aria-hidden': 'true' }) };
        body.append(dropHint.col, dropHint.tip);
      }
      const left = LABEL_W + M.dateToX(day, view.range.start, zoom);
      dropHint.col.style.left = px(left);
      dropHint.col.style.width = px(M.DROP_DAYS * M.pxPerDay(zoom));
      dropHint.tip.textContent = M.dropTip(dropItem.key, day);
      dropHint.tip.style.left = px(left);
      dropHint.tip.style.top = px(Math.max(0, e.clientY - body.getBoundingClientRect().top - 34));
    });
    chart.addEventListener('dragleave', (e) => {
      if (!chart.contains(e.relatedTarget)) clearDropHint();
    });
    chart.addEventListener('drop', (e) => {
      if (!dropItem) return;
      e.preventDefault();
      const item = dropItem;
      const day = dayAt(chart, e.clientX);
      dropItem = null;
      clearDropHint();
      if (!day) return;
      // Only the dates change; the epic stays as it is (AC 24).
      save(item, M.dropDates(day), () => {}, 'It stays in Unscheduled.');
    });
  }

  return { init, render, loadFailed };
})();
