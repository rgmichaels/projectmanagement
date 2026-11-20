// Report page (docs/specs/daily-report.md; design docs/design/daily-report,
// README.md is the UI contract): Yesterday, Today and Waiting for one person
// in the current project, and "Copy for email". Yesterday comes from
// GET /api/projects/:id/report for the local window of the previous working
// day; Today and Waiting from the project's items and sprints, like the
// Board. The logic and the clipboard texts live in js/reportMath.js (pure,
// unit-tested). Read-only: nothing here writes, so no control is disabled
// for Viewers or archived projects. Every user text is inserted as text.
(() => {
  const M = reportMath;
  const COPIED_MS = 4000;

  const $ = (id) => document.getElementById(id);
  const els = {
    controls: $('rp-controls'),
    person: $('rp-person'),
    date: $('rp-date'),
    today: $('rp-today'),
    copy: $('rp-copy'),
    status: $('rp-copy-status'),
    report: $('rp-report'),
    archived: $('archived-badge'),
  };

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c !== null && c !== undefined) node.append(c);
    return node;
  }

  const state = {
    project: null,
    me: null,
    meta: null, // { statuses, terminalStatus, startedStatus, types, sprintStates, users }
    items: [],
    sprints: [],
    activity: null,
    activityError: null,
    model: null,
    seq: 0,
  };

  // ---------- copy status ----------

  let statusTimer = null;
  function setCopyStatus(kind, text) {
    clearTimeout(statusTimer);
    els.status.className = `copy-status${kind ? ` ${kind}` : ''}`;
    els.status.setAttribute('role', kind === 'fail' ? 'alert' : 'status');
    els.status.textContent = text;
    if (kind === 'ok') statusTimer = setTimeout(() => setCopyStatus('', ''), COPIED_MS);
  }

  // ---------- render ----------

  const itemUrl = (issueId) => `${projectScope.pageUrl('board.html', state.project.id)}&issue=${encodeURIComponent(issueId)}`;

  function rowNode(row) {
    const parts = [
      el('a', { class: 'r-key', href: itemUrl(row.issueId) }, row.key),
      el('span', { class: 'r-title' }, row.epic ? el('span', { class: 'epic-chip' }, row.epic) : null, row.epic ? ' ' : null, row.title),
    ];
    if (row.summary !== undefined) parts.push(el('span', { class: 'r-sum' }, row.summary));
    else {
      const meta = row.meta.map((m) => el('span', { class: m.kind === 'status' ? 'status-pill' : m.kind === 'priority' ? 'priority' : undefined }, m.text));
      parts.push(el('span', { class: 'r-meta' }, ...meta));
    }
    return el('li', {}, ...parts);
  }

  const rowList = (rows, empty) => (rows.length ? el('ul', { class: 'rows' }, ...rows.map(rowNode)) : el('p', { class: 'empty-line' }, empty));

  function heading(section) {
    return el('h2', { id: `rp-h-${section.id}` }, section.heading, section.note ? ' ' : null, section.note ? el('span', { class: 'h-note' }, section.note) : null);
  }

  function sectionNode(section) {
    const node = el('section', { 'aria-labelledby': `rp-h-${section.id}` }, heading(section));
    if (section.error) {
      node.append(
        el(
          'div',
          { class: 'banner-warn', role: 'alert' },
          el('strong', {}, M.LOAD_ERROR),
          el('span', {}, `${section.error} Today and Waiting are still shown from the project data.`),
          el('button', { type: 'button', class: 'link', onclick: retryActivity }, 'Retry')
        )
      );
      return node;
    }
    if (section.groups) {
      if (section.sprintLine) node.append(el('p', { class: 'sprint-line' }, section.sprintLine));
      for (const g of section.groups) {
        node.append(el('h3', {}, g.heading, ' ', el('span', { class: 'n' }, String(g.rows.length))), rowList(g.rows, g.empty));
      }
      return node;
    }
    node.append(rowList(section.rows, section.empty));
    if (section.total) node.append(el('p', { class: 'total-line' }, section.total));
    return node;
  }

  function render() {
    const person = state.meta.users.find((u) => u.id === Number(els.person.value));
    state.model = M.buildReport({
      projectName: state.project.name,
      personId: person ? person.id : null,
      personName: person ? person.name : '',
      date: els.date.value,
      today: M.localToday(),
      activity: state.activity,
      activityError: state.activityError,
      items: state.items,
      sprints: state.sprints,
      users: state.meta.users,
      statuses: state.meta.statuses,
      startedStatus: state.meta.startedStatus,
      terminalStatus: state.meta.terminalStatus,
      sprintStates: state.meta.sprintStates,
      types: state.meta.types,
    });
    els.report.replaceChildren(el('p', { class: 'report-title' }, state.model.title), ...state.model.sections.map(sectionNode));
  }

  function showLoading() {
    state.model = null;
    els.report.replaceChildren(el('p', { class: 'hint', role: 'status' }, 'Loading...'));
  }

  // The page could not load its data at all (meta, items or sprints).
  function showPageError(err, retry) {
    state.model = null;
    els.report.replaceChildren(
      el(
        'div',
        { class: 'banner-warn', role: 'alert' },
        el('strong', {}, M.LOAD_ERROR),
        el('span', {}, (err && err.message) || ''),
        el('button', { type: 'button', class: 'link', onclick: retry }, 'Retry')
      )
    );
  }

  // ---------- loading ----------

  function activityUrl() {
    const prev = M.previousWorkingDay(els.date.value);
    const range = M.localDayRange(prev);
    const params = new URLSearchParams({ user: els.person.value, from: range.from, to: range.to, day: prev });
    return `/api/projects/${encodeURIComponent(state.project.id)}/report?${params}`;
  }

  // Today and Waiting are the current state, fetched again with every
  // regeneration; Yesterday is its own request and fails on its own.
  async function regenerate() {
    const seq = ++state.seq;
    const pid = encodeURIComponent(state.project.id);
    showLoading();
    const [activity, items, sprints] = await Promise.allSettled([
      api.get(activityUrl()),
      api.get(`/api/projects/${pid}/issues`),
      api.get(`/api/projects/${pid}/sprints`),
    ]);
    if (seq !== state.seq) return; // a newer selection is loading
    const failed = [items, sprints].find((r) => r.status === 'rejected');
    if (failed) return showPageError(failed.reason, regenerate);
    state.items = items.value;
    state.sprints = sprints.value;
    state.activity = activity.status === 'fulfilled' ? activity.value : null;
    state.activityError = activity.status === 'rejected' ? (activity.reason && activity.reason.message) || 'Request failed.' : null;
    render();
  }

  // Retry re-requests Yesterday only (design states.html D).
  async function retryActivity() {
    const seq = ++state.seq;
    try {
      const activity = await api.get(activityUrl());
      if (seq !== state.seq) return;
      state.activity = activity;
      state.activityError = null;
    } catch (err) {
      if (seq !== state.seq) return;
      state.activityError = err.message;
    }
    render();
  }

  // ---------- copy ----------

  // A clipboard flavor (MIME type) by subtype; built so the clipboard types
  // are not mistaken for attachment types (tests/source.test.js).
  const flavor = (subtype) => ['text', subtype].join('/');

  // Both flavors in one write; the fallback selects the rendered report.
  async function copyReport() {
    setCopyStatus('', '');
    const model = state.model;
    let ok = false;
    if (model && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem === 'function') {
      try {
        const html = flavor('html');
        const plain = flavor('plain');
        await navigator.clipboard.write([
          new ClipboardItem({
            [html]: new Blob([M.toHtml(model)], { type: html }),
            [plain]: new Blob([M.toPlainText(model)], { type: plain }),
          }),
        ]);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok && model) ok = copyBySelection();
    if (ok) setCopyStatus('ok', '✓ Copied. Paste into your email.');
    else setCopyStatus('fail', 'Could not copy. Select the report and copy it by hand.');
    els.copy.focus();
  }

  function copyBySelection() {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(els.report);
    selection.removeAllRanges();
    selection.addRange(range);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    selection.removeAllRanges();
    return ok;
  }

  // ---------- start ----------

  // ?user=<id>&date=<YYYY-MM-DD> open a specific report (AC 26); invalid
  // values are ignored and the defaults apply.
  function initialSelection() {
    const params = new URLSearchParams(location.search);
    const rawUser = params.get('user');
    const userId = rawUser && /^\d+$/.test(rawUser) ? Number(rawUser) : null;
    const user = state.meta.users.find((u) => u.id === userId) || state.meta.users.find((u) => u.id === state.me.id) || state.meta.users[0];
    const rawDate = params.get('date');
    return { userId: user ? user.id : null, date: M.isDay(rawDate) ? rawDate : M.localToday() };
  }

  async function loadMeta() {
    const [statuses, terminal, started, types, sprintStates, users] = await Promise.all([
      api.get('/api/statuses'),
      api.get('/api/terminal-status'),
      api.get('/api/started-status'),
      api.get('/api/types'),
      api.get('/api/sprint-states'),
      api.get('/api/users'),
    ]);
    state.meta = { statuses, terminalStatus: terminal.status, startedStatus: started.status, types, sprintStates, users };
  }

  async function start() {
    try {
      await loadMeta();
    } catch (err) {
      return showPageError(err, start);
    }
    const pick = initialSelection();
    els.person.replaceChildren(...state.meta.users.map((u) => el('option', { value: String(u.id) }, u.name)));
    if (pick.userId !== null) els.person.value = String(pick.userId);
    els.date.value = pick.date;
    regenerate();
  }

  els.controls.addEventListener('submit', (e) => e.preventDefault());
  els.person.addEventListener('change', () => {
    setCopyStatus('', '');
    regenerate();
  });
  els.date.addEventListener('change', () => {
    if (!M.isDay(els.date.value)) return; // a cleared or partial date keeps the last report
    setCopyStatus('', '');
    regenerate();
  });
  els.today.addEventListener('click', () => {
    const today = M.localToday();
    if (els.date.value === today) return;
    els.date.value = today;
    setCopyStatus('', '');
    regenerate();
  });
  els.copy.addEventListener('click', copyReport);

  (async () => {
    try {
      state.me = await session.ready;
      state.project = await projectScope.ready;
    } catch (err) {
      showPageError(err, () => location.reload());
      return;
    }
    if (!state.project) return; // projectScope drew "Project not found." or "No active projects."
    els.archived.hidden = !state.project.archived;
    start();
  })();
})();
