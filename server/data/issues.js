// Data access for work items (table `issues`). All SQL for work items lives here.
// Validation (allowed statuses, types, archived guard) happens in the routes;
// these functions assume their input is already valid. The resolution rule
// (set the default on entering the terminal status, clear it on leaving) is
// applied here so the status and resolution are always written together.
const { isTerminalStatus } = require('../statuses');
const { defaultResolution } = require('../resolutions');

const RANK_STEP = 1000;

// reporter_id is set once on create and never updated; reporter_name comes
// from users (both null for work items created before the reporter existed).
const SELECT = `
  SELECT i.id, i.project_id, i.number, i.key, i.type, i.title, i.description, i.status, i.priority,
         i.assignee_id, i.epic_id, i.rank, i.resolution, i.reporter_id, r.name AS reporter_name,
         i.created_at, i.updated_at`;
const FROM = 'FROM issues i LEFT JOIN users r ON r.id = i.reporter_id';

// Each item carries comment_count (number of discussion messages) so the
// board needs no extra request per card.
function listIssues(db, projectId) {
  return db
    .prepare(
      `${SELECT},
         (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) AS comment_count
       ${FROM} WHERE i.project_id = ? ORDER BY i.rank, i.id`
    )
    .all(projectId);
}

function getIssue(db, id) {
  return db.prepare(`${SELECT} ${FROM} WHERE i.id = ?`).get(id);
}

function countChildren(db, epicId) {
  return db.prepare('SELECT COUNT(*) AS n FROM issues WHERE epic_id = ?').get(epicId).n;
}

// Rank that places an item at the bottom of a status column.
function bottomRank(db, projectId, status) {
  const row = db
    .prepare('SELECT MAX(rank) AS r FROM issues WHERE project_id = ? AND status = ?')
    .get(projectId, status);
  return row.r === null ? RANK_STEP : row.r + RANK_STEP;
}

// If the moved item now shares a rank with another item in its column,
// renumber the column in steps of RANK_STEP. The moved item goes before the
// other items with the same rank, so a client with no gap left can send the
// rank of the card it was dropped in front of.
function rebalanceIfNeeded(db, projectId, status, movedId) {
  const rows = db
    .prepare('SELECT id, rank FROM issues WHERE project_id = ? AND status = ? ORDER BY rank, id')
    .all(projectId, status);
  const ranks = new Set(rows.map((r) => r.rank));
  if (ranks.size === rows.length) return;
  rows.sort((a, b) => a.rank - b.rank || (a.id === movedId ? -1 : b.id === movedId ? 1 : a.id - b.id));
  const update = db.prepare('UPDATE issues SET rank = ? WHERE id = ?');
  rows.forEach((r, i) => update.run((i + 1) * RANK_STEP, r.id));
}

// The resolution a work item should have after a write. Outside the terminal
// status it is always null. In it: the supplied value if any, otherwise the
// current one, falling back to the default on entering the status (or if a
// terminal item somehow has none).
function resolutionFor(status, supplied, current, entering) {
  if (!isTerminalStatus(status)) return null;
  if (supplied) return supplied;
  if (entering || !current) return defaultResolution();
  return current;
}

// Creates a work item, allocating the next per-project number. Numbers are
// never reused because next_issue_number only ever increases. fields.reporter_id
// is the signed-in user, supplied by the route.
function createIssue(db, project, fields) {
  return db.transaction(() => {
    const { next_issue_number: number } = db
      .prepare('SELECT next_issue_number FROM projects WHERE id = ?')
      .get(project.id);
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO issues (project_id, number, key, type, title, description, status, priority,
           assignee_id, epic_id, rank, resolution, reporter_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        project.id,
        number,
        `${project.key}-${number}`,
        fields.type,
        fields.title,
        fields.description || '',
        fields.status,
        fields.priority,
        fields.assignee_id ?? null,
        fields.epic_id ?? null,
        bottomRank(db, project.id, fields.status),
        resolutionFor(fields.status, fields.resolution, null, true),
        fields.reporter_id ?? null,
        now,
        now
      );
    db.prepare('UPDATE projects SET next_issue_number = ? WHERE id = ?').run(number + 1, project.id);
    return getIssue(db, info.lastInsertRowid);
  })();
}

const UPDATABLE = ['type', 'title', 'description', 'status', 'priority', 'assignee_id', 'epic_id', 'rank', 'resolution'];

// Applies a partial update atomically.
// options.clearChildren: also clear epic_id on items pointing at this one
// (used when an epic-type item changes to a non-epic type).
function updateIssue(db, id, changes, options = {}) {
  return db.transaction(() => {
    const current = getIssue(db, id);
    const next = { ...changes };
    const statusChanged = next.status !== undefined && next.status !== current.status;
    if (statusChanged && next.rank === undefined) {
      next.rank = bottomRank(db, current.project_id, next.status);
    }
    next.resolution = resolutionFor(next.status ?? current.status, next.resolution, current.resolution, statusChanged);
    const sets = [];
    const params = [];
    for (const field of UPDATABLE) {
      if (next[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(next[field]);
      }
    }
    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    db.prepare(`UPDATE issues SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    if (options.clearChildren) {
      db.prepare('UPDATE issues SET epic_id = NULL WHERE epic_id = ?').run(id);
    }
    if (changes.rank !== undefined) {
      rebalanceIfNeeded(db, current.project_id, next.status ?? current.status, id);
    }
    return getIssue(db, id);
  })();
}

// Deletes a work item and its discussion messages. Children of a deleted epic
// keep existing (with their own messages) with no epic. Messages are deleted
// explicitly rather than relying on the foreign-key cascade alone.
function deleteIssue(db, id) {
  db.transaction(() => {
    db.prepare('UPDATE issues SET epic_id = NULL WHERE epic_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE issue_id = ?').run(id);
    db.prepare('DELETE FROM issues WHERE id = ?').run(id);
  })();
}

module.exports = {
  RANK_STEP,
  listIssues,
  getIssue,
  countChildren,
  createIssue,
  updateIssue,
  deleteIssue,
};
