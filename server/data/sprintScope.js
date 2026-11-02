// Data access for sprint scope-change tracking (tables `sprint_scope_events`
// and `sprint_baseline_items`, the baseline_* columns of `sprints`;
// docs/specs/sprint-scope-change.md). All scope SQL lives here.
//   captureBaseline    - the items and total estimate of a sprint at an
//                        instant (Start, or the one-time migration)
//   recordScopeChange  - derives added / removed / estimate_changed events
//                        from a work item's row before and after a write
//   scopeSummary       - the totals and the log for GET /api/sprints/:id/scope
//   membershipFlags    - added_after_start / added_at for work item lists
// Callers pass the `db` of their own transaction, so events commit or roll
// back with the write they describe. Events are append-only: nothing here
// edits or deletes one, and issue_id, sprint_id, project_id and actor_id are
// plain integers, so rows outlive the item and the user. Only Active sprints
// record events (Decision 9). The grace rule is applied when reading, through
// server/scopePolicy.js; kinds come from server/scopeEvents.js; epics are
// found through server/types.js; state names through server/sprintStates.js.
const { isEpicType, epicTypeNames } = require('../types');
const { activeSprintState } = require('../sprintStates');
const { SCOPE, getScopeKind, membershipKinds } = require('../scopeEvents');
const { isInGrace, graceEndsAt } = require('../scopePolicy');
const { UNKNOWN_ACTOR } = require('./history');
const { toHours } = require('./timeEntries');

const normalizeActor = (actor) => (actor && actor.name ? { id: actor.id ?? null, name: actor.name } : UNKNOWN_ACTOR);
const minutesOf = (v) => (v === null || v === undefined ? null : v);
const hoursOrNull = (m) => (m === null || m === undefined ? null : toHours(m));

// The baseline columns of a sprint (null for each when it is not tracked).
function baselineOf(db, sprintId) {
  return db.prepare('SELECT baseline_item_count, baseline_minutes, baseline_at FROM sprints WHERE id = ?').get(sprintId) || null;
}

// Stores the baseline of `sprint` ({ id }) as of `at` (ISO string): one
// sprint_baseline_items row per non-epic item now in it, the item count and
// total minutes (null estimates as 0) on the sprint, and baseline_at = at.
function captureBaseline(db, sprint, at) {
  const epics = epicTypeNames();
  const notEpic = epics.length ? ` AND type NOT IN (${epics.map(() => '?').join(', ')})` : '';
  const items = db
    .prepare(`SELECT id, key, estimate_minutes FROM issues WHERE sprint_id = ?${notEpic} ORDER BY sprint_rank, id`)
    .all(sprint.id, ...epics);
  const insert = db.prepare('INSERT INTO sprint_baseline_items (sprint_id, issue_id, issue_key, estimate_minutes) VALUES (?, ?, ?, ?)');
  let minutes = 0;
  for (const item of items) {
    insert.run(sprint.id, item.id, item.key, item.estimate_minutes);
    minutes += item.estimate_minutes || 0;
  }
  db.prepare('UPDATE sprints SET baseline_item_count = ?, baseline_minutes = ?, baseline_at = ? WHERE id = ?').run(
    items.length,
    minutes,
    at,
    sprint.id
  );
}

// The Active sprints whose baseline was never captured (the one-time
// migration of docs/specs/sprint-scope-change.md AC 4).
function activeSprintsWithoutBaseline(db) {
  return db.prepare('SELECT id FROM sprints WHERE state = ? AND baseline_at IS NULL ORDER BY id').all(activeSprintState());
}

// The sprint an item row belongs to for scope purposes: its sprint_id, or
// null for no row, an epic or the backlog.
const sprintOfRow = (row) => (row && !isEpicType(row.type) && row.sprint_id ? row.sprint_id : null);

function isActiveSprintId(db, sprintId) {
  if (!sprintId) return false;
  const row = db.prepare('SELECT state FROM sprints WHERE id = ?').get(sprintId);
  return Boolean(row) && row.state === activeSprintState();
}

function insertEvent(db, who, row, sprintId, kind, estimate, oldEstimate, when) {
  db.prepare(
    `INSERT INTO sprint_scope_events (project_id, sprint_id, issue_id, issue_key, issue_title, kind, actor_id, actor_name,
       created_at, estimate_minutes, old_estimate_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(row.project_id, sprintId, row.id, row.key, row.title, kind, who.id, who.name, when, minutesOf(estimate), minutesOf(oldEstimate));
}

// Records the scope events one write of a work item implies (AC 6-10).
// `before` is the stored row before the write (null on create) and `after`
// the row after it (null on delete); both carry sprint_id, type and
// estimate_minutes. Only an Active sprint, before or after, records:
//   - same sprint, estimate differs        -> one estimate_changed
//   - leaves an Active sprint              -> removed, old estimate
//   - enters an Active sprint              -> added, new estimate
// A move between two sprints records on the Active side only; one save
// never writes both an estimate change and a membership event.
function recordScopeChange(db, actor, before, after, when = new Date().toISOString()) {
  const from = sprintOfRow(before);
  const to = sprintOfRow(after);
  const who = normalizeActor(actor);
  if (from && from === to) {
    if (!isActiveSprintId(db, from)) return;
    const oldEstimate = minutesOf(before.estimate_minutes);
    const newEstimate = minutesOf(after.estimate_minutes);
    if (oldEstimate !== newEstimate) insertEvent(db, who, after, from, SCOPE.estimate_changed, newEstimate, oldEstimate, when);
    return;
  }
  if (from && isActiveSprintId(db, from)) insertEvent(db, who, after || before, from, SCOPE.removed, before.estimate_minutes, null, when);
  if (to && isActiveSprintId(db, to)) insertEvent(db, who, after, to, SCOPE.added, after.estimate_minutes, null, when);
}

// How an event of `kind` moves the total, in minutes.
function deltaOf(event) {
  const kind = getScopeKind(event.kind);
  const est = event.estimate_minutes || 0;
  if (!kind) return 0;
  if (kind.effect === 'add') return est;
  if (kind.effect === 'remove') return -est;
  if (kind.effect === 'delta') return est - (event.old_estimate_minutes || 0);
  return 0;
}

// { added, removed, estimate_change } each { count, minutes } (removed as a
// positive amount), and the net minutes, over `events`.
function tally(events) {
  const t = { added: { count: 0, minutes: 0 }, removed: { count: 0, minutes: 0 }, estimate_change: { count: 0, minutes: 0 }, net: 0 };
  for (const e of events) {
    if (e.kind === SCOPE.added) {
      t.added.count += 1;
      t.added.minutes += e.estimate_minutes || 0;
    } else if (e.kind === SCOPE.removed) {
      t.removed.count += 1;
      t.removed.minutes += e.estimate_minutes || 0;
    } else if (e.kind === SCOPE.estimate_changed) {
      t.estimate_change.count += 1;
      t.estimate_change.minutes += deltaOf(e);
    }
    t.net += deltaOf(e);
  }
  return t;
}

const asHours = (part) => ({ count: part.count, hours: toHours(part.minutes) });

// The scope-change report of `sprint` (a sprints row: id, state,
// started_at) for GET /api/sprints/:id/scope (AC 13-17). Untracked (no
// baseline: Planned, or Completed before this feature): tracked false,
// totals null, no events.
function scopeSummary(db, sprint) {
  const base = baselineOf(db, sprint.id) || {};
  const tracked = Boolean(base.baseline_at);
  const head = {
    tracked,
    state: sprint.state,
    started_at: sprint.started_at || null,
    baseline_at: base.baseline_at || null,
    baseline_late: tracked && base.baseline_at !== sprint.started_at,
    grace_ends_at: tracked ? graceEndsAt({ baseline_at: base.baseline_at }) : null,
  };
  if (!tracked) {
    return {
      ...head,
      baseline: null,
      grace: null,
      planned_hours: null,
      added: null,
      removed: null,
      estimate_change: null,
      net_change_hours: null,
      current_total_hours: null,
      growth_percent: null,
      unestimated_added_count: null,
      events: [],
    };
  }
  const rows = db
    .prepare(
      `SELECT id, kind, issue_id, issue_key, issue_title, actor_name, created_at, estimate_minutes, old_estimate_minutes
       FROM sprint_scope_events WHERE sprint_id = ? ORDER BY id`
    )
    .all(sprint.id);
  const policySprint = { baseline_at: base.baseline_at };
  const events = rows.map((r) => ({ ...r, in_grace: isInGrace(r, policySprint) }));
  const grace = tally(events.filter((e) => e.in_grace));
  const counted = tally(events.filter((e) => !e.in_grace));
  const planned = (base.baseline_minutes || 0) + grace.net; // Decision 8
  const current = planned + counted.net;
  return {
    ...head,
    baseline: { item_count: base.baseline_item_count || 0, hours: toHours(base.baseline_minutes || 0) },
    grace: { added: asHours(grace.added), removed: asHours(grace.removed), estimate_change: asHours(grace.estimate_change) },
    planned_hours: toHours(planned),
    added: asHours(counted.added),
    removed: asHours(counted.removed),
    estimate_change: asHours(counted.estimate_change),
    net_change_hours: toHours(counted.net),
    current_total_hours: toHours(current),
    growth_percent: planned === 0 ? null : Math.round((counted.net / planned) * 1000) / 10,
    unestimated_added_count: events.filter((e) => !e.in_grace && e.kind === SCOPE.added && e.estimate_minutes === null).length,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      issue_id: e.issue_id,
      issue_key: e.issue_key,
      issue_title: e.issue_title,
      actor_name: e.actor_name,
      created_at: e.created_at,
      hours: hoursOrNull(e.estimate_minutes),
      old_hours: hoursOrNull(e.old_estimate_minutes),
      in_grace: e.in_grace,
    })),
  };
}

// The "Added after start" flag (AC 18) for work item rows ({ id, type,
// sprint_id }), in one query: a Map of item id -> { added_after_start,
// added_at }. An item is flagged when it is in a tracked sprint and its
// latest membership event in that sprint is an add outside the grace
// period; added_at is that event's time (the most recent add), else null.
// `scope` narrows the lookup: { projectId } or { issueId }.
function membershipFlags(db, rows, scope) {
  const flags = new Map();
  for (const r of rows) flags.set(r.id, { added_after_start: false, added_at: null });
  const candidates = rows.filter((r) => sprintOfRow(r));
  if (!candidates.length) return flags;
  const kinds = membershipKinds();
  if (!kinds.length) return flags;
  const where = scope.issueId !== undefined ? 'issue_id = ?' : 'project_id = ?';
  const latest = db
    .prepare(
      `SELECT e.issue_id, e.sprint_id, e.kind, e.created_at, s.baseline_at
       FROM sprint_scope_events e JOIN sprints s ON s.id = e.sprint_id
       WHERE e.id IN (SELECT MAX(id) FROM sprint_scope_events
                      WHERE ${where} AND kind IN (${kinds.map(() => '?').join(', ')})
                      GROUP BY issue_id, sprint_id)`
    )
    .all(scope.issueId !== undefined ? scope.issueId : scope.projectId, ...kinds);
  const byPair = new Map(latest.map((e) => [`${e.issue_id}:${e.sprint_id}`, e]));
  for (const r of candidates) {
    const e = byPair.get(`${r.id}:${r.sprint_id}`);
    if (!e || !e.baseline_at || e.kind !== SCOPE.added || isInGrace(e, { baseline_at: e.baseline_at })) continue;
    flags.set(r.id, { added_after_start: true, added_at: e.created_at });
  }
  return flags;
}

module.exports = {
  captureBaseline,
  activeSprintsWithoutBaseline,
  recordScopeChange,
  scopeSummary,
  membershipFlags,
};
