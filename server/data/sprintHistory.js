// Data access for the sprint audit log (tables `sprint_events` and
// `sprint_event_changes`, docs/specs/sprints-and-backlog.md AC 41-46). All
// sprint event SQL lives here. Callers pass the same `db` from inside the
// transaction of the write the event describes, so the event commits or rolls
// back with it. Append-only: nothing here edits or deletes an event, and
// deleting a sprint leaves its events (sprint_id is a plain integer and
// sprint_name a snapshot). Kinds and tracked fields come from
// server/sprintEvents.js.
const { SPRINT_HISTORY_FIELDS, getSprintField } = require('../sprintEvents');
const { UNKNOWN_ACTOR } = require('./history');

const normalizeActor = (actor) => (actor && actor.name ? { id: actor.id ?? null, name: actor.name } : UNKNOWN_ACTOR);

// Empty values ('' or undefined) are stored as null, other values as text.
const clean = (v) => (v === undefined || v === null || v === '' ? null : String(v));

// Writes one event about `sprint` ({ id, project_id, name } as it is now).
// details (all optional): disposition, done_count, item_count,
// target_sprint_id, target_sprint_name. changes: [{ field, old, new }].
function recordSprintEvent(db, actor, sprint, kind, details = {}, changes = [], when = null) {
  const who = normalizeActor(actor);
  const eventId = db
    .prepare(
      `INSERT INTO sprint_events (project_id, sprint_id, sprint_name, kind, actor_id, actor_name, created_at,
         disposition, done_count, item_count, target_sprint_id, target_sprint_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      sprint.project_id,
      sprint.id,
      sprint.name,
      kind,
      who.id,
      who.name,
      when || new Date().toISOString(),
      details.disposition ?? null,
      details.done_count ?? null,
      details.item_count ?? null,
      details.target_sprint_id ?? null,
      details.target_sprint_name ?? null
    ).lastInsertRowid;
  const insert = db.prepare('INSERT INTO sprint_event_changes (event_id, field, old_value, new_value) VALUES (?, ?, ?, ?)');
  for (const c of changes) insert.run(eventId, c.field, clean(c.old), clean(c.new));
  return eventId;
}

// The tracked fields whose value differs between two sprint rows, in
// display order, as [{ field, old, new }] (empty values as null).
function diffSprint(before, after) {
  return SPRINT_HISTORY_FIELDS.filter((f) => clean(before[f.column]) !== clean(after[f.column])).map((f) => ({
    field: f.key,
    old: clean(before[f.column]),
    new: clean(after[f.column]),
  }));
}

// Newest first (by id); `before` returns only older events. Returns
// { events, has_more }. Each event carries its changes with the field label
// (a field no longer in the list keeps its stored key as the label).
function listSprintHistory(db, projectId, { limit = 50, before = null } = {}) {
  const where = ['project_id = ?'];
  const params = [projectId];
  if (before !== null) {
    where.push('id < ?');
    params.push(before);
  }
  const rows = db
    .prepare(
      `SELECT id, kind, sprint_id, sprint_name, actor_id, actor_name, created_at, disposition, done_count,
              item_count, target_sprint_id, target_sprint_name
       FROM sprint_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`
    )
    .all(...params, limit + 1);
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map((e) => ({ ...e, changes: [] }));
  if (events.length) {
    const byId = new Map(events.map((e) => [e.id, e]));
    const changes = db
      .prepare(
        `SELECT event_id, field, old_value, new_value FROM sprint_event_changes
         WHERE event_id IN (${events.map(() => '?').join(', ')}) ORDER BY id`
      )
      .all(...events.map((e) => e.id));
    for (const c of changes) {
      const field = getSprintField(c.field);
      byId.get(c.event_id).changes.push({ field: c.field, label: field ? field.label : c.field, old: c.old_value, new: c.new_value });
    }
  }
  return { events, has_more: hasMore };
}

module.exports = { recordSprintEvent, diffSprint, listSprintHistory };
