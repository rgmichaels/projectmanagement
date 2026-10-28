// Shared library editor and ticket panel. All supplied content is rendered as text.
const testCaseUI = (() => {
  let metaPromise;
  const metadata = () => metaPromise || (metaPromise = api.get('/api/test-case-metadata').catch((e) => { metaPromise = null; throw e; }));
  const node = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) n.addEventListener(key.slice(2), value);
      else if (key === 'class') n.className = value;
      else if (key in n) n[key] = value;
      else n.setAttribute(key, value);
    }
    n.append(...children);
    return n;
  };
  const button = (label, fn, cls = '') => node('button', { type: 'button', class: cls, onclick: fn }, label);
  const label = (caption, input) => {
    input.setAttribute('aria-label', caption);
    return node('label', {}, caption, input);
  };
  const formatTime = (value) => value ? new Date(value).toLocaleString() : '';
  const caseUrl = (project, id) => `test-cases.html?project=${encodeURIComponent(project)}&case=${encodeURIComponent(id)}`;
  const lifecycle = (meta, c) => meta.lifecycles.find((x) => x.name === c.lifecycle);
  const isArchived = (meta, c) => Boolean(lifecycle(meta, c)?.archived);
  const outcomeLabel = (meta, value) => meta.outcomes.find((x) => x.name === value)?.label || value;
  const initialOutcome = (meta) => meta.outcomes.find((x) => x.initial).name;

  function modal(title) {
    const headingId = `tc-heading-${++modal.serial}`;
    const heading = node('h2', { id: headingId }, title);
    const body = node('div', { class: 'tc-modal-body' });
    const error = node('p', { class: 'error', role: 'alert' });
    const actions = node('div', { class: 'tc-actions' });
    const dialog = node('dialog', { class: 'app-dialog tc-dialog', 'aria-labelledby': headingId }, node('div', { class: 'band' }, heading), body, error, actions);
    let dirty = false;
    let busy = false;
    const previous = document.activeElement;
    const beforeUnload = (e) => { if (dirty || busy) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    const close = () => {
      if (busy) return;
      if (dirty && !confirm('Discard changes?')) return;
      dialog.close();
    };
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dialog.addEventListener('input', () => { dirty = true; });
    const closed = new Promise((resolve) => dialog.addEventListener('close', () => {
      window.removeEventListener('beforeunload', beforeUnload);
      dialog.remove();
      if (previous?.isConnected) previous.focus();
      resolve();
    }, { once: true }));
    actions.append(button('Close', close));
    document.body.append(dialog);
    dialog.showModal();
    return {
      dialog, body, error, actions, heading, closed,
      dirty: () => { dirty = true; },
      clean: () => { dirty = false; },
      finish: () => { dirty = false; busy = false; dialog.close(); },
      busy: (value) => { busy = value; for (const b of dialog.querySelectorAll('button, input, select, textarea')) b.disabled = value || b.dataset.readonly === 'true'; },
    };
  }
  modal.serial = 0;

  function definitionView(c) {
    const steps = c.steps.map((s) => node('li', {},
      node('div', { class: 'tc-step-content' },
        node('div', {}, node('strong', {}, 'Action'), node('p', {}, s.action)),
        node('div', {}, node('strong', {}, 'Expected result'), node('p', {}, s.expected_result)))));
    return node('div', { class: 'tc-definition' },
      node('h3', {}, 'Preconditions'),
      node('p', { class: 'tc-preconditions' }, c.preconditions || 'No preconditions.'),
      node('h3', {}, `Steps (${c.steps.length})`),
      node('ol', { class: 'tc-steps' }, ...steps));
  }

  function linkedTickets(c, project) {
    const sections = [];
    for (const active of [true, false]) {
      const links = (c.linked_tickets || []).filter((x) => Boolean(x.active) === active);
      if (!links.length) continue;
      sections.push(node('section', { class: 'tc-linked-tickets' },
        node('h3', {}, active ? 'Linked tickets' : 'Previous links'),
        ...links.map((ticket) => node('div', { class: 'tc-actions' },
          node('a', { href: `backlog.html?project=${project}&issue=${ticket.id}` }, `${ticket.key} ${ticket.title}`),
          button('Execution history', () => history(project, ticket.id, c.id, `${ticket.key} · ${c.key}`))))));
    }
    return sections;
  }

  async function detail({ project, caseId, readonly = false, onSaved = () => {} }) {
    const m = modal('Test case');
    m.dialog.classList.add('tc-detail-dialog');
    async function render() {
      m.body.textContent = 'Loading…';
      m.error.textContent = '';
      try {
        const [meta, c] = await Promise.all([metadata(), api.get(`/api/test-cases/${caseId}`)]);
        if (!m.dialog.open) return;
        if (c.project_id !== Number(project)) throw new Error('This test case belongs to another project.');
        m.heading.textContent = c.title;
        m.body.replaceChildren(
          node('div', { class: 'tc-detail-meta' },
            node('span', { class: 'tc-detail-key' }, c.key),
            node('span', { class: 'badge' }, lifecycle(meta, c)?.label || c.lifecycle),
            node('span', { class: 'hint' }, `Revision ${c.revision}`)),
          definitionView(c),
          node('dl', { class: 'tc-audit' },
            node('div', {}, node('dt', {}, 'Created by'), node('dd', {}, c.creator_name)),
            node('div', {}, node('dt', {}, 'Created'), node('dd', {}, formatTime(c.created_at))),
            node('div', {}, node('dt', {}, 'Last updated'), node('dd', {}, formatTime(c.updated_at)))),
          ...linkedTickets(c, project));
        if (!c.linked_tickets?.some((t) => t.active)) m.body.append(node('p', { class: 'hint' }, 'No tickets linked to this case.'));
        // Keep the original Close button and replace actions after a refresh.
        while (m.actions.children.length > 1) m.actions.lastElementChild.remove();
        if (!readonly && !isArchived(meta, c)) {
          m.actions.append(button('Edit', () => editor({
            project, caseId,
            onSaved: async (saved) => {
              await render();
              if (m.dialog.open) m.actions.querySelector('.primary')?.focus();
              await onSaved(saved);
            },
          }), 'primary'));
        }
        if (!readonly && isArchived(meta, c)) {
          m.actions.append(button('Restore', async () => {
            m.busy(true);
            try {
              const saved = await api.patch(`/api/test-cases/${caseId}`, { lifecycle: meta.lifecycles.find((x) => x.initial).name, revision: c.revision });
              await render(); await onSaved(saved);
            } catch (e) { m.error.textContent = e.message; }
            finally { m.busy(false); }
          }));
        }
      } catch (e) { if (m.dialog.open) { m.body.textContent = ''; m.error.textContent = e.message; } }
    }
    await render();
    return m.closed;
  }

  async function editor({ project, caseId = null, issueId = null, readonly = false, onSaved = () => {} }) {
    const m = modal(caseId ? 'Test case' : 'Create test case');
    m.body.textContent = 'Loading…';
    let c;
    let meta;
    try {
      [meta, c] = await Promise.all([metadata(), caseId ? api.get(`/api/test-cases/${caseId}`) : Promise.resolve(null)]);
      if (!m.dialog.open) return;
      if (c && c.project_id !== Number(project)) throw new Error('This test case belongs to another project.');
      const locked = readonly || Boolean(c && isArchived(meta, c));
      m.heading.textContent = c ? `${c.key} · ${lifecycle(meta, c)?.label || c.lifecycle}` : 'Create test case';
      const title = node('input', { type: 'text', maxLength: 200, required: true, value: c?.title || '' });
      const preconditions = node('textarea', { rows: 3, maxLength: 10000, value: c?.preconditions || '' });
      const steps = node('div', { class: 'tc-step-editor' });
      function stepRow(step = { action: '', expected_result: '' }) {
        const action = node('textarea', { rows: 2, maxLength: 4000, required: true, value: step.action });
        const expected = node('textarea', { rows: 2, maxLength: 4000, required: true, value: step.expected_result });
        const row = node('fieldset', { class: 'tc-step-row' }, node('legend', {}, 'Step'), label('Action', action), label('Expected result', expected));
        const reorder = (direction) => {
          const other = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
          if (!other) return;
          if (direction < 0) steps.insertBefore(row, other); else steps.insertBefore(other, row);
          m.dirty(); renumber();
        };
        if (!locked) row.append(node('div', { class: 'tc-actions' }, button('Move up', () => reorder(-1)), button('Move down', () => reorder(1)), button('Remove step', () => { row.remove(); m.dirty(); renumber(); })));
        steps.append(row);
        return row;
      }
      function renumber() { [...steps.children].forEach((r, i) => { r.querySelector('legend').textContent = `Step ${i + 1}`; }); }
      (c?.steps || [{ action: '', expected_result: '' }]).forEach(stepRow);
      renumber();
      m.body.replaceChildren(label('Title', title), label('Preconditions', preconditions), steps);
      if (!locked) m.body.append(button('Add step', () => {
        if (steps.children.length >= 100) { m.error.textContent = 'A case can have up to 100 steps.'; return; }
        stepRow(); renumber(); m.dirty();
      }));
      if (c) {
        m.body.append(node('p', { class: 'hint' }, `Revision ${c.revision} · Created by ${c.creator_name} · ${formatTime(c.created_at)} · Updated ${formatTime(c.updated_at)}`));
        m.body.append(...linkedTickets(c, project));
      }
      if (locked) for (const input of m.body.querySelectorAll('input, textarea')) { input.disabled = true; input.dataset.readonly = 'true'; }
      if (!locked) {
        m.actions.append(button(c ? 'Save' : issueId ? 'Create and add to ticket' : 'Create', async () => {
          const inputs = [...m.body.querySelectorAll('input, textarea')];
          if (!inputs.every((i) => i.reportValidity())) return;
          if (!steps.children.length) { m.error.textContent = 'Provide at least one step.'; return; }
          const data = { title: title.value, preconditions: preconditions.value, steps: [...steps.children].map((r) => {
            const [a, e] = r.querySelectorAll('textarea'); return { action: a.value, expected_result: e.value };
          }) };
          m.error.textContent = ''; m.busy(true);
          try {
            let saved;
            if (c) saved = await api.patch(`/api/test-cases/${c.id}`, { ...data, revision: c.revision });
            else if (issueId) {
              const links = await api.post(`/api/issues/${issueId}/test-cases`, { new_case: data });
              saved = { id: links[0].test_case_id };
            } else saved = await api.post(`/api/projects/${project}/test-cases`, data);
            m.finish(); await onSaved(saved);
          } catch (e) { m.error.textContent = e.message; m.busy(false); }
        }, 'primary'));
      }
      if (c && !readonly) {
        const target = meta.lifecycles.find((x) => Boolean(x.archived) !== isArchived(meta, c));
        m.actions.append(button(isArchived(meta, c) ? 'Restore' : 'Archive', async () => {
          if (!confirm(`${isArchived(meta, c) ? 'Restore' : 'Archive'} ${c.key}? Unsaved definition edits will be discarded. Existing links and results are kept.`)) return;
          m.busy(true);
          try {
            const saved = await api.patch(`/api/test-cases/${c.id}`, { lifecycle: target.name, revision: c.revision });
            m.finish(); await onSaved(saved);
          } catch (e) { m.error.textContent = e.message; m.busy(false); }
        }));
      }
      if (!locked) title.focus();
    } catch (e) { if (m.dialog.open) { m.body.textContent = ''; m.error.textContent = e.message; } }
    return m.closed;
  }

  async function history(project, issueId, caseId, title) {
    const m = modal(`Execution history · ${title}`);
    let cursor = null;
    const list = node('div');
    const more = button('Show more', load);
    m.body.append(list, more);
    async function load() {
      more.disabled = true; m.error.textContent = '';
      try {
        const [meta, page] = await Promise.all([metadata(), api.get(`/api/issues/${issueId}/test-cases/${caseId}/executions${cursor ? `?cursor=${cursor}` : ''}`)]);
        if (!m.dialog.open) return;
        if (!page.items.length && !cursor) list.textContent = 'No executions yet.';
        for (const r of page.items) {
          const snapshot = r.definition_snapshot;
          list.append(node('article', { class: 'tc-result' },
            node('h3', {}, outcomeLabel(meta, r.outcome)),
            node('p', { class: 'hint' }, `${r.tester_name} · ${formatTime(r.created_at)} · Revision ${r.case_revision}`),
            node('p', { class: 'tc-text' }, r.notes || 'No notes.'),
            node('details', {}, node('summary', {}, `Definition tested: ${snapshot.key} ${snapshot.title}`), definitionView(snapshot))));
        }
        cursor = page.next_cursor; more.hidden = !page.has_more;
      } catch (e) { m.error.textContent = e.message; }
      finally { more.disabled = false; }
    }
    await load();
    return m.closed;
  }

  async function runner(project, issueId, caseId, onSaved) {
    const m = modal('Record test result');
    m.body.textContent = 'Loading…';
    try {
      const [meta, c] = await Promise.all([metadata(), api.get(`/api/test-cases/${caseId}`)]);
      if (!m.dialog.open) return;
      if (isArchived(meta, c)) throw new Error('Restore this archived test case first.');
      m.heading.textContent = `${c.key} · ${c.title}`;
      const select = node('select', {}, ...meta.outcomes.map((x) => node('option', { value: x.name }, x.label)));
      const notes = node('textarea', { rows: 4, maxLength: 10000 });
      m.body.replaceChildren(node('p', { class: 'hint' }, `Testing revision ${c.revision}`), definitionView(c), label('Outcome', select), label('Notes', notes));
      m.actions.append(button('Record result', async () => {
        m.busy(true); m.error.textContent = '';
        try {
          await api.post(`/api/issues/${issueId}/test-cases/${caseId}/executions`, { outcome: select.value, notes: notes.value, case_revision: c.revision });
          m.finish(); await onSaved();
        } catch (e) { m.error.textContent = e.message; m.busy(false); }
      }, 'primary'));
    } catch (e) { m.body.textContent = ''; m.error.textContent = e.message; }
    return m.closed;
  }

  async function picker(project, issueId, linkedIds, onSaved) {
    const m = modal('Add existing test cases');
    const search = node('input', { type: 'search', maxLength: 200, placeholder: 'Key, title or steps' });
    const list = node('div', { class: 'tc-picker' });
    const selected = new Set();
    let seq = 0;
    let cursor = null;
    const more = button('Show more', () => load(false));
    const find = button('Search', () => load(true));
    m.body.replaceChildren(label('Search', search), find, list, more);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); load(true); } });
    async function load(reset) {
      const token = ++seq;
      if (reset) { cursor = null; list.replaceChildren(); }
      more.disabled = true; m.error.textContent = '';
      try {
        const params = new URLSearchParams({ search: search.value });
        if (cursor) params.set('cursor', cursor);
        const page = await api.get(`/api/projects/${project}/test-cases?${params}`);
        if (seq !== token || !m.dialog.open) return;
        if (!page.items.length && reset) list.textContent = 'No matching active cases.';
        for (const c of page.items) {
          const input = node('input', { type: 'checkbox', value: c.id, checked: selected.has(c.id), disabled: linkedIds.has(c.id) });
          input.dataset.readonly = String(linkedIds.has(c.id));
          input.addEventListener('change', () => { if (input.checked) selected.add(c.id); else selected.delete(c.id); });
          list.append(label(`${c.key} · ${c.title}${linkedIds.has(c.id) ? ' (already linked)' : ''}`, input));
        }
        cursor = page.next_cursor; more.hidden = !page.has_more;
      } catch (e) { m.error.textContent = e.message; }
      finally { if (seq === token) more.disabled = false; }
    }
    m.actions.append(button('Add selected', async () => {
      if (!selected.size) { m.error.textContent = 'Select at least one test case.'; return; }
      m.busy(true); m.error.textContent = '';
      try {
        const added = await api.post(`/api/issues/${issueId}/test-cases`, { test_case_ids: [...selected] });
        m.finish(); await onSaved(added.some((x) => x.reactivated));
      } catch (e) { m.error.textContent = e.message; m.busy(false); }
    }, 'primary'));
    await load(true);
    return m.closed;
  }

  function ticketPanel({ root, count, onChange = () => {} }) {
    let context = null;
    let generation = 0;
    let rows = [];
    let busy = false;
    let notice = '';
    async function refresh() {
      const ctx = context;
      if (!ctx) return;
      const token = ++generation;
      root.textContent = 'Loading test cases…';
      try {
        const [meta, data] = await Promise.all([metadata(), api.get(`/api/issues/${ctx.issueId}/test-cases`)]);
        if (generation !== token || context !== ctx) return;
        rows = data.items;
        count.textContent = String(rows.length); count.hidden = false;
        const changed = async (retained = false) => {
          if (context !== ctx) return;
          notice = retained === true ? 'Previous results retained.' : '';
          await refresh(); onChange();
        };
        const controls = node('div', { class: 'tc-actions' });
        if (!ctx.readonly) controls.append(
          button('Add existing', () => picker(ctx.project, ctx.issueId, new Set(rows.map((c) => c.id)), changed)),
          button('Create test case', () => editor({ project: ctx.project, issueId: ctx.issueId, onSaved: changed })));
        const summary = node('p', { class: 'hint' }, `${data.summary.total} cases · ${meta.outcomes.map((o) => `${o.label}: ${data.summary.by_outcome[o.name]}`).join(' · ')} · Needs retest: ${data.summary.needs_retest}`);
        const error = node('p', { class: 'error', role: 'alert' });
        root.replaceChildren(controls, summary, node('p', { role: 'status' }, notice), error);
        if (!rows.length) root.append(node('p', {}, 'No test cases added to this ticket.'));
        for (const c of rows) {
          const result = c.latest_execution;
          const actions = node('div', { class: 'tc-actions' },
            button('Open case', () => detail({ project: ctx.project, caseId: c.id, readonly: ctx.readonly, onSaved: changed })),
            button('Execution history', () => history(ctx.project, ctx.issueId, c.id, c.key)));
          if (!ctx.readonly) {
            if (!isArchived(meta, c)) actions.append(button('Record result', () => runner(ctx.project, ctx.issueId, c.id, changed)));
            actions.append(button('Remove', async () => {
              if (busy || !confirm(`Remove ${c.key} from this ticket? The library case and previous results are kept.`)) return;
              busy = true; actions.querySelectorAll('button').forEach((b) => { b.disabled = true; });
              try { await api.del(`/api/issues/${ctx.issueId}/test-cases/${c.id}`); await changed(); }
              catch (e) { error.textContent = e.message; actions.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
              finally { busy = false; }
            }));
          }
          root.append(node('article', { class: 'tc-card' },
            node('h3', {}, `${c.key} · ${c.title}`),
            node('p', { class: 'hint' }, `${lifecycle(meta, c)?.label || c.lifecycle} · ${outcomeLabel(meta, result ? result.outcome : initialOutcome(meta))}${result ? ` · ${result.tester_name} · ${formatTime(result.created_at)}` : ''}`),
            ...(c.needs_retest ? [node('p', { class: 'tc-stale' }, 'Case changed since this result. Retest needed.')] : []), actions));
        }
      } catch (e) {
        if (generation === token && context === ctx) root.replaceChildren(node('p', { class: 'error', role: 'alert' }, e.message), button('Retry', refresh));
      }
    }
    return {
      open(ctx) {
        context = ctx; generation += 1; notice = ''; count.hidden = true; root.replaceChildren();
        root.hidden = Boolean(ctx);
        if (ctx) {
          root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', 'tab-test-cases'); refresh();
        } else {
          root.removeAttribute('role'); root.removeAttribute('aria-labelledby');
          root.append(node('p', { class: 'hint' }, 'Save this ticket before adding test cases.'));
        }
      },
      close() { context = null; generation += 1; },
    };
  }
  return { node, button, metadata, detail, editor, ticketPanel, caseUrl, formatTime, lifecycle };
})();
