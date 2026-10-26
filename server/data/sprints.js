// Data access for sprints (table `sprints`, docs/specs/sprints-and-backlog.md).
// All sprint SQL lives here (work item rows go through ./issues). Routes
// validate first; these functions assume valid input. Every write runs in one
// transaction with its sprint event (./sprintHistory) and, for bulk moves,
// one history event per moved work item, so a failure changes nothing.
// State names come from server/sprintStates.js, event kinds from
// server/sprintEvents.js; epics are found through server/types.js.
const { isTerminalStatus, terminalStatus } = require('../statuses');
const { epicTypeNames } = require('../types');
const {
  initialSprintState,
  activeSprintState,
  finalSprintState,
  sprintStateOrder,
} = require('../sprintStates');
const { EVENT } = require('../sprintEvents');
const issues = require('./issues');
const sprintHistory = require('./sprintHistory');

const COLUMNS = 'id, project_id, name, goal, start_date, end_date, state, created_at, started_at, completed_at';
const NAME_PATTERN = /^Sprint (\d+)$/;

// item_count and done_count of a sprint: its non-epic items, and those in
// the terminal status (whatever their resolution).
function countsSql() {
  const epics = epicTypeNames();
  const notEpic = epics.length ? ` AND i.type NOT IN (${epics.map(() => '?').join(', ')})` : '';
  return {
    sql: `(SELECT COUNT(*) FROM issues i WHERE i.sprint_id = s.id${notEpic}) AS item_count,
          (SELECT COUNT(*) FROM issues i WHERE i.sprint_id = s.id AND i.status = ?${notEpic}) AS done_count`,
    params: [...epics, terminalStatus(), ...epics],
  };
}

// Active first, then the other states in list order; planned (and any other
// open state) by id, the final state newest completed_at first.
function compareSprints(a, b) {
  const rank = (s) => (s.state === activeSprintState() ? -1 : sprintStateOrder(s.state));
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.state === finalSprintState()) {
    return String(b.completed_at || '').localeCompare(String(a.completed_at || '')) || b.id - a.id;
  }
  return a.id - b.id;
}

function listSprints(db, projectId) {
  const c = countsSql();
  return db
    .prepare(`SELECT ${COLUMNS.split(', ').map((x) => `s.${x}`).join(', ')}, ${c.sql} FROM sprints s WHERE s.project_id = ?`)
    .all(...c.params, projectId)
    .sort(compareSprints);
}

function getSprint(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM sprints WHERE id = ?`).get(id);
}

// The sprint with its counts, as the list returns it.
function getSprintWithCounts(db, id) {
  const c = countsSql();
  return db
    .prepare(`SELECT ${COLUMNS.split(', ').map((x) => `s.${x}`).join(', ')}, ${c.sql} FROM sprints s WHERE s.id = ?`)
    .get(...c.params, id);
}

function getActiveSprint(db, projectId) {
  return db.prepare(`SELECT ${COLUMNS} FROM sprints WHERE project_id = ? AND state = ?`).get(projectId, activeSprintState());
}

// `Sprint <n>` with n one more than the largest n among the project's sprint
// names of that form, or 1 when there is none.
function nextName(db, projectId) {
  const names = db.prepare('SELECT name FROM sprints WHERE project_id = ?').all(projectId).map((r) => r.name);
  let max = 0;
  for (const name of names) {
    const m = NAME_PATTERN.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Sprint ${max + 1}`;
}

function insertSprint(db, projectId, fields, now) {
  return db
    .prepare(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(projectId, fields.name, fields.goal || '', fields.start_date ?? null, fields.end_date ?? null, initialSprintState(), now)
    .lastInsertRowid;
}

// A new sprint in the initial state, with its created event (EVENT.created).
function createSprint(db, project, fields, actor) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const id = insertSprint(db, project.id, fields, now);
    const sprint = getSprint(db, id);
    sprintHistory.recordSprintEvent(db, actor, sprint, EVENT.created, {}, [], now);
    return getSprintWithCounts(db, id);
  })();
}

// Name, goal and dates. One edited event (EVENT.edited) with a change per changed field;
// none when nothing changed.
function updateSprint(db, sprint, changes, actor) {
  return db.transaction(() => {
    const sets = [];
    const params = [];
    for (const field of ['name', 'goal', 'start_date', 'end_date']) {
      if (changes[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(changes[field]);
      }
    }
    if (sets.length) db.prepare(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`).run(...params, sprint.id);
    const after = getSprint(db, sprint.id);
    const diff = sprintHistory.diffSprint(sprint, after);
    if (diff.length) sprintHistory.recordSprintEvent(db, actor, after, EVENT.edited, {}, diff);
    return getSprintWithCounts(db, sprint.id);
  })();
}

// Deletes a sprint in the initial state. Its items go to the bottom of the
// backlog in their order, each with a sprint change in its history; the
// deleted event (EVENT.deleted) keeps the name and the number of items returned.
function deleteSprint(db, sprint, actor) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const items = issues.listContainer(db, sprint.project_id, sprint.id);
    let rank = issues.bottomSprintRank(db, sprint.project_id, null);
    for (const item of items) {
      issues.moveToContainer(db, item.id, null, rank, actor, now);
      rank += issues.RANK_STEP;
    }
    sprintHistory.recordSprintEvent(db, actor, sprint, EVENT.deleted, { item_count: items.length }, [], now);
    db.prepare('DELETE FROM sprints WHERE id = ?').run(sprint.id);
    return { item_count: items.length };
  })();
}

// Initial -> active. The caller checks that no other sprint is active; the
// unique index refuses a second one anyway.
function startSprint(db, sprint, actor) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare('UPDATE sprints SET state = ?, started_at = ? WHERE id = ?').run(activeSprintState(), now, sprint.id);
    sprintHistory.recordSprintEvent(db, actor, getSprint(db, sprint.id), EVENT.started, {}, [], now);
    return getSprintWithCounts(db, sprint.id);
  })();
}

// Active -> final, moving every unfinished non-epic item (not in the
// terminal status) in one transaction:
//   backlog     - to the top of the backlog, relative order kept
//   next-sprint - to the bottom of `nextSprint`, relative order kept
//   new-sprint  - to a new sprint (initial state, named `newSprintName`),
//                 which gets its own created event
// Items in the terminal status stay in the completed sprint.
// Returns { sprint, moved: { count, to }, created_sprint? }.
function completeSprint(db, sprint, { disposition, nextSprint = null, newSprintName = null }, actor) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const items = issues.listContainer(db, sprint.project_id, sprint.id);
    const unfinished = items.filter((i) => !isTerminalStatus(i.status));
    const doneCount = items.length - unfinished.length;
    db.prepare('UPDATE sprints SET state = ?, completed_at = ? WHERE id = ?').run(finalSprintState(), now, sprint.id);

    let target = null; // null = the backlog
    let created = null;
    if (disposition === 'new-sprint') {
      const id = insertSprint(db, sprint.project_id, { name: newSprintName || nextName(db, sprint.project_id) }, now);
      created = getSprint(db, id);
      sprintHistory.recordSprintEvent(db, actor, created, EVENT.created, {}, [], now);
      target = created;
    } else if (disposition === 'next-sprint') {
      target = nextSprint;
    }

    const targetId = target ? target.id : null;
    let rank = target
      ? issues.bottomSprintRank(db, sprint.project_id, targetId)
      : issues.topSprintRank(db, sprint.project_id, null) - unfinished.length * issues.RANK_STEP;
    for (const item of unfinished) {
      issues.moveToContainer(db, item.id, targetId, rank, actor, now);
      rank += issues.RANK_STEP;
    }

    const completed = getSprint(db, sprint.id);
    sprintHistory.recordSprintEvent(
      db,
      actor,
      completed,
      EVENT.completed,
      {
        disposition,
        done_count: doneCount,
        item_count: unfinished.length,
        target_sprint_id: targetId,
        target_sprint_name: target ? target.name : null,
      },
      [],
      now
    );
    const result = { sprint: getSprintWithCounts(db, sprint.id), moved: { count: unfinished.length, to: targetId } };
    if (created) result.created_sprint = getSprintWithCounts(db, created.id);
    return result;
  })();
}

module.exports = {
  listSprints,
  getSprint,
  getSprintWithCounts,
  getActiveSprint,
  nextName,
  createSprint,
  updateSprint,
  deleteSprint,
  startSprint,
  completeSprint,
};
