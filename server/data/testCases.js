const { lifecycles, outcomes } = require('../testCaseMetadata');
const check = require('../testCaseValidation');
const history = require('./history');
const users = require('./users');
const initialLifecycle = () => lifecycles.find((x) => x.initial).name;
const archivedLifecycle = () => lifecycles.find((x) => x.archived).name;
const initialOutcome = () => outcomes.find((x) => x.initial).name;

function getCase(db, id) {
  const row = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(id);
  if (!row) check.fail('Test case not found.', 404);
  row.creator_name = users.getUser(db, row.created_by_id).name;
  row.steps = db.prepare('SELECT action, expected_result FROM test_case_steps WHERE test_case_id = ? ORDER BY position').all(id);
  return row;
}
function writable(db, projectId) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!p) check.fail('Project not found.', 404);
  if (p.archived) check.fail('This project is archived; its test cases are read-only.', 409);
  return p;
}
function active(c) {
  if (c.lifecycle === archivedLifecycle()) check.fail('Restore this archived test case first.', 409);
}
function saveSteps(db, id, steps) {
  db.prepare('DELETE FROM test_case_steps WHERE test_case_id = ?').run(id);
  const insert = db.prepare('INSERT INTO test_case_steps (test_case_id, position, action, expected_result) VALUES (?, ?, ?, ?)');
  steps.forEach((s, i) => insert.run(id, i, s.action, s.expected_result));
}
function createCase(db, projectId, input, actor) {
  return db.transaction(() => {
    const p = writable(db, projectId);
    const data = check.definition(input);
    // No permanent deletion: MAX is monotonic and allocation is transactional.
    const n = db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM test_cases WHERE project_id = ?').get(projectId).n;
    const now = new Date().toISOString();
    const id = db.prepare(`INSERT INTO test_cases (project_id, number, key, title, preconditions, lifecycle, created_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(projectId, n, `${p.key}-TC-${n}`, data.title, data.preconditions, initialLifecycle(), actor.id, now, now).lastInsertRowid;
    saveSteps(db, id, data.steps);
    return getCase(db, id);
  })();
}
function updateCase(db, id, input) {
  return db.transaction(() => {
    const old = getCase(db, id);
    writable(db, old.project_id);
    const data = check.definition(input, true);
    if (old.revision !== data.revision) check.fail('This case changed. Reload and review the latest revision before saving.', 409);
    if (data.steps) active(old);
    const next = { title: old.title, preconditions: old.preconditions, steps: old.steps, lifecycle: old.lifecycle, ...data };
    if (['title', 'preconditions', 'lifecycle'].every((f) => old[f] === next[f]) && JSON.stringify(old.steps) === JSON.stringify(next.steps)) return old;
    db.prepare('UPDATE test_cases SET title = ?, preconditions = ?, lifecycle = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
      .run(next.title, next.preconditions, next.lifecycle, new Date().toISOString(), id);
    if (data.steps) saveSteps(db, id, data.steps);
    return getCase(db, id);
  })();
}
function paginated(rows, limit, cursorField) {
  const items = rows.slice(0, limit);
  const has_more = rows.length > limit;
  return { items, has_more, next_cursor: has_more ? items[items.length - 1][cursorField] : null };
}
function listCases(db, projectId, query) {
  const { limit, cursor } = check.page(query);
  const lifecycle = query.lifecycle === undefined ? initialLifecycle() : query.lifecycle;
  if (lifecycle !== 'all' && !lifecycles.some((x) => x.name === lifecycle)) check.fail('Unknown lifecycle.');
  const search = check.text(query.search, 'Search', 200).toLowerCase();
  const where = ['c.project_id = ?'];
  const args = [projectId];
  if (lifecycle !== 'all') { where.push('c.lifecycle = ?'); args.push(lifecycle); }
  if (search) {
    where.push(`(instr(lower(c.key || ' ' || c.title || ' ' || c.preconditions), ?) > 0 OR EXISTS
      (SELECT 1 FROM test_case_steps s WHERE s.test_case_id = c.id AND instr(lower(s.action || ' ' || s.expected_result), ?) > 0))`);
    args.push(search, search);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM test_cases c WHERE ${where.join(' AND ')}`).get(...args).n;
  if (cursor !== null) { where.push('c.number > ?'); args.push(cursor); }
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM issue_test_cases l WHERE l.test_case_id = c.id AND l.active = 1) AS linked_ticket_count
    FROM test_cases c WHERE ${where.join(' AND ')} ORDER BY c.number LIMIT ?`).all(...args, limit + 1);
  return { ...paginated(rows, limit, 'number'), total };
}
function caseDetail(db, id) {
  const c = getCase(db, id);
  c.linked_tickets = db.prepare(`SELECT i.id, i.key, i.title, l.active, l.linked_at, l.removed_at FROM issue_test_cases l
    JOIN issues i ON i.id = l.issue_id WHERE l.test_case_id = ? ORDER BY l.active DESC, i.id`).all(id);
  return c;
}
function issueFor(db, id) {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  if (!issue) check.fail('Work item not found.', 404);
  return issue;
}
function linkFor(db, issueId, caseId, requireActive = false) {
  const row = db.prepare('SELECT * FROM issue_test_cases WHERE issue_id = ? AND test_case_id = ?').get(issueId, caseId);
  if (!row || (requireActive && !row.active)) check.fail('Test case link not found.', 404);
  return row;
}
function recordLink(db, issueId, c, actor, added) {
  history.recordTestCaseChange(db, issueId, actor, added ? { newText: `${c.key} ${c.title}`, newId: c.id } : { oldText: `${c.key} ${c.title}`, oldId: c.id });
}
function addCases(db, issueId, input, actor) {
  return db.transaction(() => {
    const issue = issueFor(db, issueId);
    writable(db, issue.project_id);
    check.object(input, ['test_case_ids', 'new_case']);
    if (('test_case_ids' in input) === ('new_case' in input)) check.fail('Provide test_case_ids or new_case, exclusively.');
    let cases;
    if ('new_case' in input) cases = [createCase(db, issue.project_id, input.new_case, actor)];
    else {
      if (!Array.isArray(input.test_case_ids) || !input.test_case_ids.length || input.test_case_ids.length > 200) check.fail('Select 1–200 test cases.');
      const ids = input.test_case_ids.map((id) => check.integer(id));
      if (new Set(ids).size !== ids.length) check.fail('Duplicate test case selection.', 409);
      cases = ids.map((id) => getCase(db, id));
    }
    const result = [];
    for (const c of cases) {
      if (c.project_id !== issue.project_id) check.fail('Test cases must be within one project.');
      active(c);
      const existing = db.prepare('SELECT * FROM issue_test_cases WHERE issue_id = ? AND test_case_id = ?').get(issueId, c.id);
      if (existing && existing.active) check.fail('This test case is already linked.', 409);
      const now = new Date().toISOString();
      if (existing) db.prepare('UPDATE issue_test_cases SET active = 1, linked_by_id = ?, linked_at = ?, removed_by_id = NULL, removed_at = NULL WHERE id = ?').run(actor.id, now, existing.id);
      else db.prepare('INSERT INTO issue_test_cases (issue_id, test_case_id, linked_by_id, linked_at) VALUES (?, ?, ?, ?)').run(issueId, c.id, actor.id, now);
      recordLink(db, issueId, c, actor, true);
      result.push({ test_case_id: c.id, reactivated: Boolean(existing) });
    }
    return result;
  })();
}
function removeCase(db, issueId, caseId, actor) {
  db.transaction(() => {
    writable(db, issueFor(db, issueId).project_id);
    const link = linkFor(db, issueId, caseId, true);
    const c = getCase(db, caseId);
    db.prepare('UPDATE issue_test_cases SET active = 0, removed_by_id = ?, removed_at = ? WHERE id = ?').run(actor.id, new Date().toISOString(), link.id);
    recordLink(db, issueId, c, actor, false);
  })();
}
function executionRow(row) {
  if (!row) return null;
  const { definition_snapshot_json, ...rest } = row;
  return { ...rest, definition_snapshot: JSON.parse(definition_snapshot_json) };
}
function listIssueCases(db, issueId) {
  const rows = db.prepare(`SELECT c.*, l.id AS link_id FROM issue_test_cases l JOIN test_cases c ON c.id = l.test_case_id
    WHERE l.issue_id = ? AND l.active = 1 ORDER BY c.number`).all(issueId);
  const summary = { total: rows.length, by_outcome: Object.fromEntries(outcomes.map((x) => [x.name, 0])), needs_retest: 0 };
  const items = rows.map((c) => {
    const latest = executionRow(db.prepare('SELECT * FROM test_case_executions WHERE issue_test_case_id = ? ORDER BY id DESC LIMIT 1').get(c.link_id));
    const needs_retest = Boolean(latest && latest.case_revision !== c.revision);
    summary.by_outcome[latest ? latest.outcome : initialOutcome()] += 1;
    if (needs_retest) summary.needs_retest += 1;
    return { ...c, latest_execution: latest, needs_retest };
  });
  return { items, summary };
}
function recordExecution(db, issueId, caseId, input, actor) {
  return db.transaction(() => {
    writable(db, issueFor(db, issueId).project_id);
    const link = linkFor(db, issueId, caseId, true);
    const c = getCase(db, caseId);
    active(c);
    const data = check.execution(input);
    if (data.case_revision !== c.revision) check.fail('This case changed. Reload and review the latest definition before recording a result.', 409);
    const snapshot = { key: c.key, title: c.title, preconditions: c.preconditions, steps: c.steps, revision: c.revision };
    const id = db.prepare(`INSERT INTO test_case_executions (issue_test_case_id, outcome, notes, tested_by_id, tester_name, created_at, case_revision, definition_snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(link.id, data.outcome, data.notes, actor.id, actor.name, new Date().toISOString(), c.revision, JSON.stringify(snapshot)).lastInsertRowid;
    return executionRow(db.prepare('SELECT * FROM test_case_executions WHERE id = ?').get(id));
  })();
}
function listExecutions(db, issueId, caseId, query) {
  const link = linkFor(db, issueId, caseId);
  const { limit, cursor } = check.page(query);
  const rows = db.prepare(`SELECT * FROM test_case_executions WHERE issue_test_case_id = ? ${cursor === null ? '' : 'AND id < ?'} ORDER BY id DESC LIMIT ?`)
    .all(link.id, ...(cursor === null ? [] : [cursor]), limit + 1).map(executionRow);
  return paginated(rows, limit, 'id');
}
function deleteForIssue(db, issueId) {
  db.prepare('DELETE FROM test_case_executions WHERE issue_test_case_id IN (SELECT id FROM issue_test_cases WHERE issue_id = ?)').run(issueId);
  db.prepare('DELETE FROM issue_test_cases WHERE issue_id = ?').run(issueId);
}
module.exports = { getCase, caseDetail, listCases, createCase, updateCase, addCases, removeCase, listIssueCases, recordExecution, listExecutions, deleteForIssue };
