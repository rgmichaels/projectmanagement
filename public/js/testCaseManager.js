(() => {
  const { node, button } = testCaseUI;
  const params = new URLSearchParams(location.search);
  let projectId = null; // set from projectScope.ready
  const root = document.getElementById('tc-library');
  const error = document.getElementById('tc-error');
  const search = document.getElementById('tc-search');
  const lifecycle = document.getElementById('tc-lifecycle');
  const more = document.getElementById('tc-more');
  let project;
  let meta;
  let cursor = null;
  let generation = 0;
  let totalShown = 0;
  const readonly = () => !session.can('write', projectId) || project.archived;
  async function openCase(id) {
    const next = new URL(location.href);
    next.searchParams.set('case', id);
    history.replaceState(null, '', next);
    await testCaseUI.detail({ project: projectId, caseId: id, readonly: readonly(), onSaved: () => load(true) });
    next.searchParams.delete('case'); history.replaceState(null, '', next);
  }
  async function load(reset) {
    const token = ++generation;
    error.textContent = '';
    if (reset) { cursor = null; totalShown = 0; root.textContent = 'Loading…'; }
    more.disabled = true;
    try {
      const query = new URLSearchParams({ search: search.value, lifecycle: lifecycle.value });
      if (cursor) query.set('cursor', cursor);
      const page = await api.get(`/api/projects/${projectId}/test-cases?${query}`);
      if (token !== generation) return;
      if (reset) root.replaceChildren();
      if (!page.items.length && reset) root.textContent = search.value ? 'No matching test cases.' : 'No test cases in this view. Create a case to start your library.';
      for (const c of page.items) {
        root.append(node('article', { class: 'tc-card' },
          button(`${c.key} · ${c.title}`, () => openCase(c.id), 'link tc-case-title'),
          node('p', { class: 'hint' }, `${testCaseUI.lifecycle(meta, c)?.label || c.lifecycle} · ${c.linked_ticket_count} linked tickets · Updated ${testCaseUI.formatTime(c.updated_at)}`)));
      }
      totalShown += page.items.length;
      document.getElementById('tc-count').textContent = `Showing ${totalShown} of ${page.total}`;
      cursor = page.next_cursor;
      more.hidden = !page.has_more;
    } catch (e) { if (token === generation) { error.textContent = e.message; if (reset) root.textContent = 'Unable to load cases. Use Search to retry.'; } }
    finally { if (token === generation) more.disabled = false; }
  }
  document.getElementById('tc-search-form').addEventListener('submit', (e) => { e.preventDefault(); load(true); });
  lifecycle.addEventListener('change', () => load(true));
  more.addEventListener('click', () => load(false));
  document.getElementById('tc-create').addEventListener('click', () => testCaseUI.editor({ project: projectId, onSaved: async (c) => { await load(true); await openCase(c.id); } }));
  async function init() {
    try {
      await session.ready;
      const scopedProject = await projectScope.ready;
      if (!scopedProject) { root.textContent = ''; return; }
      projectId = String(scopedProject.id);
      if (!projectId || !/^\d+$/.test(projectId)) throw new Error('Choose a project from Projects first.');
      [project, meta] = await Promise.all([api.get(`/api/projects/${projectId}`), testCaseUI.metadata()]);
      document.title = `${project.key} test cases`;
      document.getElementById('project-title').textContent = `${project.name} · Test Cases`;
      document.getElementById('archived-badge').hidden = !project.archived;
      document.getElementById('tc-create').hidden = readonly();
      lifecycle.replaceChildren(...meta.lifecycles.map((x) => node('option', { value: x.name }, x.label)), node('option', { value: 'all' }, 'All'));
      await load(true);
      if (params.has('case')) {
        if (!/^\d+$/.test(params.get('case'))) throw new Error('Invalid test case id.');
        await openCase(params.get('case'));
      }
    } catch (e) { error.textContent = e.message; root.textContent = ''; }
  }
  init();
})();
