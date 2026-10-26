// Data access for work items (table `issues`). All SQL for work items lives here.
// Validation (allowed statuses, types, archived guard) happens in the routes;
// these functions assume their input is already valid. The resolution rule
// (set the default on entering the terminal status, clear it on leaving) is
// applied here so the status and resolution are always written together.
// Every write records history (server/data/history.js) inside its own
// transaction; `actor` is { id, name } from the route (guards.actorFrom).
// Sprint membership (docs/specs/sprints-and-backlog.md): sprint_id is the
// item's sprint (null = the backlog; always null for epics) and sprint_rank
// its position in that container (null for epics). `rank` stays the position
// in a board column; the two never touch each other.
const { STATUSES, isTerminalStatus } = require('../statuses');
const { isEpicType, epicTypeNames } = require('../types');
const { activeSprintState } = require('../sprintStates');
const { defaultResolution } = require('../resolutions');
const history = require('./history');
const links = require('./links');
const attachments = require('./attachments');
const storage = require('./storage');

const RANK_STEP = 1000;

// reporter_id is set once on create and never updated; reporter_name comes
// from users (both null for work items created before the reporter existed).
const SELECT = `
  SELECT i.id, i.project_id, i.number, i.key, i.type, i.title, i.description, i.status, i.priority,
         i.assignee_id, i.epic_id, i.rank, i.resolution, i.reporter_id, r.name AS reporter_name,
         i.sprint_id, i.sprint_rank, i.created_at, i.updated_at`;
const FROM = 'FROM issues i LEFT JOIN users r ON r.id = i.reporter_id';

// `AND i.type NOT IN (<epic types>)` and its parameters.
function notEpicClause() {
  const names = epicTypeNames();
  return { sql: names.length ? ` AND i.type NOT IN (${names.map(() => '?').join(', ')})` : '', params: names };
}

// Each item carries comment_count (number of discussion messages) so the
// board needs no extra request per card. `sprint` (optional) narrows the list
// to one container and never returns epics: 'backlog' (no sprint), 'active'
// (the project's active sprint) or a sprint id. Without it every item of the
// project is returned, epics included.
function listIssues(db, projectId, sprint = null) {
  const where = ['i.project_id = ?'];
  const params = [projectId];
  let order = 'i.rank, i.id';
  if (sprint !== null) {
    if (sprint === 'backlog') {
      where.push('i.sprint_id IS NULL');
    } else if (sprint === 'active') {
      where.push('i.sprint_id = (SELECT s.id FROM sprints s WHERE s.project_id = i.project_id AND s.state = ?)');
      params.push(activeSprintState());
    } else {
      where.push('i.sprint_id = ?');
      params.push(sprint);
    }
    const ne = notEpicClause();
    where[where.length - 1] += ne.sql;
    params.push(...ne.params);
    order = 'i.sprint_rank, i.id';
  }
  return db
    .prepare(
      `${SELECT},
         (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) AS comment_count
       ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order}`
    )
    .all(...params);
}

// The non-epic items of a container (sprint id, or null for the backlog) in
// container order.
function listContainer(db, projectId, sprintId) {
  const ne = notEpicClause();
  return db
    .prepare(`${SELECT} ${FROM} WHERE i.project_id = ? AND i.sprint_id IS ?${ne.sql} ORDER BY i.sprint_rank, i.id`)
    .all(projectId, sprintId, ...ne.params);
}

function getIssue(db, id) {
  return db.prepare(`${SELECT} ${FROM} WHERE i.id = ?`).get(id);
}

function countChildren(db, epicId) {
  return db.prepare('SELECT COUNT(*) AS n FROM issues WHERE epic_id = ?').get(epicId).n;
}

// Position of a status in the display order; a status no longer in the list
// sorts after all known ones.
function statusOrder(status) {
  const i = STATUSES.indexOf(status);
  return i === -1 ? STATUSES.length : i;
}

// The children of an epic for the epic view, with the assignee's name,
// ordered by status display order then item number.
function listChildren(db, epicId) {
  const rows = db
    .prepare(
      `SELECT i.id, i.number, i.key, i.title, i.type, i.status, i.priority, i.assignee_id,
              a.name AS assignee_name
       FROM issues i LEFT JOIN users a ON a.id = i.assignee_id
       WHERE i.epic_id = ? ORDER BY i.number`
    )
    .all(epicId);
  return rows.sort((x, y) => statusOrder(x.status) - statusOrder(y.status) || x.number - y.number);
}

// Progress of an epic: total children, how many are in the terminal status
// (whatever their resolution) and a count for every status in display order,
// zero included.
function childSummary(db, epicId) {
  const counts = new Map(
    db
      .prepare('SELECT status, COUNT(*) AS n FROM issues WHERE epic_id = ? GROUP BY status')
      .all(epicId)
      .map((r) => [r.status, r.n])
  );
  let total = 0;
  let done = 0;
  for (const [status, n] of counts) {
    total += n;
    if (isTerminalStatus(status)) done += n;
  }
  const byStatus = STATUSES.map((status) => ({ status, count: counts.get(status) || 0 }));
  return { total, done, byStatus };
}

// Rank that places an item at the bottom of a status column.
function bottomRank(db, projectId, status) {
  const row = db
    .prepare('SELECT MAX(rank) AS r FROM issues WHERE project_id = ? AND status = ?')
    .get(projectId, status);
  return row.r === null ? RANK_STEP : row.r + RANK_STEP;
}

// sprint_rank that places an item at the bottom (or top) of a container: a
// sprint id, or null for the backlog.
function bottomSprintRank(db, projectId, sprintId) {
  const row = db
    .prepare('SELECT MAX(sprint_rank) AS r FROM issues WHERE project_id = ? AND sprint_id IS ?')
    .get(projectId, sprintId);
  return row.r === null ? RANK_STEP : row.r + RANK_STEP;
}

function topSprintRank(db, projectId, sprintId) {
  const row = db
    .prepare('SELECT MIN(sprint_rank) AS r FROM issues WHERE project_id = ? AND sprint_id IS ?')
    .get(projectId, sprintId);
  return row.r === null ? RANK_STEP : row.r;
}

// rebalanceIfNeeded for a container instead of a status column: if two
// items of the container share a sprint_rank, renumber the container in steps
// of RANK_STEP with the moved item first among equals.
function rebalanceSprintRank(db, projectId, sprintId, movedId) {
  const rows = db
    .prepare('SELECT id, sprint_rank FROM issues WHERE project_id = ? AND sprint_id IS ? AND sprint_rank IS NOT NULL ORDER BY sprint_rank, id')
    .all(projectId, sprintId);
  const ranks = new Set(rows.map((r) => r.sprint_rank));
  if (ranks.size === rows.length) return;
  rows.sort((a, b) => a.sprint_rank - b.sprint_rank || (a.id === movedId ? -1 : b.id === movedId ? 1 : a.id - b.id));
  const update = db.prepare('UPDATE issues SET sprint_rank = ? WHERE id = ?');
  rows.forEach((r, i) => update.run((i + 1) * RANK_STEP, r.id));
}

// Moves one item to a container (sprint id or null) at `sprintRank`, as part
// of a bulk move (sprint delete or complete) inside the caller's transaction,
// and records the sprint change in its history. Status, resolution, epic and
// assignee are untouched.
function moveToContainer(db, id, sprintId, sprintRank, actor, when) {
  const before = getIssue(db, id);
  db.prepare('UPDATE issues SET sprint_id = ?, sprint_rank = ?, updated_at = ? WHERE id = ?').run(sprintId, sprintRank, when, id);
  history.recordChanges(db, id, actor, before, getIssue(db, id), when);
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
// is the signed-in user, supplied by the route. Writes the `created` event.
function createIssue(db, project, fields, actor) {
  return db.transaction(() => {
    const { next_issue_number: number } = db
      .prepare('SELECT next_issue_number FROM projects WHERE id = ?')
      .get(project.id);
    const now = new Date().toISOString();
    // Epics are in no container; anything else goes to the bottom of its
    // sprint, or of the backlog when no sprint is given.
    const epic = isEpicType(fields.type);
    const sprintId = epic ? null : fields.sprint_id ?? null;
    const sprintRank = epic ? null : bottomSprintRank(db, project.id, sprintId);
    const info = db
      .prepare(
        `INSERT INTO issues (project_id, number, key, type, title, description, status, priority,
           assignee_id, epic_id, rank, resolution, reporter_id, sprint_id, sprint_rank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        sprintId,
        sprintRank,
        now,
        now
      );
    db.prepare('UPDATE projects SET next_issue_number = ? WHERE id = ?').run(number + 1, project.id);
    history.recordCreated(db, info.lastInsertRowid, actor, now);
    return getIssue(db, info.lastInsertRowid);
  })();
}

const UPDATABLE = ['type', 'title', 'description', 'status', 'priority', 'assignee_id', 'epic_id', 'rank', 'resolution', 'sprint_id', 'sprint_rank'];

// Clears the epic of every child of `epicId`, recording an epic change on each.
function releaseChildren(db, epicId, actor, when) {
  const children = db.prepare(`${SELECT} ${FROM} WHERE i.epic_id = ?`).all(epicId);
  for (const child of children) {
    history.recordChanges(db, child.id, actor, child, { ...child, epic_id: null }, when);
  }
  db.prepare('UPDATE issues SET epic_id = NULL WHERE epic_id = ?').run(epicId);
}

// Applies a partial update atomically and records what actually changed
// (the automatic resolution included) as one history event.
// options.clearChildren: also clear epic_id on items pointing at this one
// (used when an epic-type item changes to a non-epic type).
function updateIssue(db, id, changes, actor, options = {}) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const current = getIssue(db, id);
    const next = { ...changes };
    const statusChanged = next.status !== undefined && next.status !== current.status;
    if (statusChanged && next.rank === undefined) {
      next.rank = bottomRank(db, current.project_id, next.status);
    }
    next.resolution = resolutionFor(next.status ?? current.status, next.resolution, current.resolution, statusChanged);
    // Sprint membership: an epic is in no container; a non-epic item that
    // changes container, or has no position yet (it was an epic), goes to the
    // bottom of its container unless a position is given.
    const epicAfter = isEpicType(next.type ?? current.type);
    const sprintAfter = epicAfter ? null : next.sprint_id !== undefined ? next.sprint_id : current.sprint_id;
    if (epicAfter) {
      next.sprint_id = null;
      next.sprint_rank = null;
    } else if (next.sprint_rank === undefined && (sprintAfter !== current.sprint_id || current.sprint_rank === null)) {
      next.sprint_rank = bottomSprintRank(db, current.project_id, sprintAfter);
    }
    const sets = [];
    const params = [];
    for (const field of UPDATABLE) {
      if (next[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(next[field]);
      }
    }
    sets.push('updated_at = ?');
    params.push(now);
    db.prepare(`UPDATE issues SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    history.recordChanges(db, id, actor, current, getIssue(db, id), now);
    if (options.clearChildren) releaseChildren(db, id, actor, now);
    if (changes.rank !== undefined) {
      rebalanceIfNeeded(db, current.project_id, next.status ?? current.status, id);
    }
    if (!epicAfter && changes.sprint_rank !== undefined) {
      rebalanceSprintRank(db, current.project_id, sprintAfter, id);
    }
    return getIssue(db, id);
  })();
}

// Deletes a work item with its discussion messages, links, attachments and
// history. Children of a deleted epic keep existing (with their own messages)
// with no epic, and each gets an epic change in its history; each former link
// partner gets a link removal in its history. Messages, links, attachments
// and history are deleted explicitly rather than relying on the foreign-key
// cascade alone. The rows go in one transaction (done when this returns);
// the attachment files are removed after it commits, best effort: a file
// that cannot be removed is logged and does not stop the others. The
// returned promise settles once every removal has been tried.
function deleteIssue(db, id, actor) {
  const keys = db.transaction(() => {
    const now = new Date().toISOString();
    releaseChildren(db, id, actor, now);
    links.deleteLinksFor(db, id, actor, now);
    const removed = attachments.deleteAttachmentsFor(db, id);
    history.deleteHistory(db, id);
    db.prepare('DELETE FROM comments WHERE issue_id = ?').run(id);
    db.prepare('DELETE FROM issues WHERE id = ?').run(id);
    return removed;
  })();
  return Promise.all(
    keys.map((key) =>
      Promise.resolve()
        .then(() => storage.remove(key))
        .catch((err) => console.error(`Could not remove attachment file ${key}: ${err.message}`))
    )
  ).then(() => undefined);
}

module.exports = {
  RANK_STEP,
  UPDATABLE,
  listIssues,
  listContainer,
  getIssue,
  bottomSprintRank,
  topSprintRank,
  rebalanceSprintRank,
  moveToContainer,
  countChildren,
  listChildren,
  childSummary,
  createIssue,
  updateIssue,
  deleteIssue,
};
