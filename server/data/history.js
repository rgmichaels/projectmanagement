// Data access for work item history (tables `issue_history_events` and
// `issue_history_changes`). All history SQL lives here, and this is the only
// place that decides what is recorded: recordChanges compares the fields in
// server/historyFields.js and nothing else (so `rank` is never recorded).
// Callers pass the same `db` from inside their own transaction, so an event
// commits or rolls back with the write it describes. History is append-only:
// rows go away only with their work item (deleteHistory).
const { HISTORY_FIELDS, getField, linkField } = require('../historyFields');
const users = require('./users');

// The actor when no signed-in user is known (entries written before login).
const UNKNOWN_ACTOR = Object.freeze({ id: null, name: 'Unknown' });

const normalizeActor = (actor) => (actor && actor.name ? { id: actor.id ?? null, name: actor.name } : UNKNOWN_ACTOR);

// Empty values ('' or undefined) are stored as null, never as text like "None".
const empty = (v) => v === undefined || v === null || v === '';
const clean = (v) => (empty(v) ? null : v);

// The display text of a value of `field`, as it is now.
function snapshot(db, field, value) {
  if (empty(value)) return { text: null, id: null };
  switch (field.kind) {
    case 'long':
      return { text: null, id: null };
    case 'user': {
      const u = users.getUser(db, value);
      return { text: u ? u.name : null, id: value };
    }
    case 'issue': {
      const i = db.prepare('SELECT key, title FROM issues WHERE id = ?').get(value);
      return { text: i ? `${i.key} ${i.title}` : null, id: value };
    }
    default:
      return { text: String(value), id: null };
  }
}

function insertEvent(db, issueId, kind, actor, when) {
  const who = normalizeActor(actor);
  return db
    .prepare('INSERT INTO issue_history_events (issue_id, kind, actor_id, actor_name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(issueId, kind, who.id, who.name, when || new Date().toISOString()).lastInsertRowid;
}

// One `created` event, with no field changes.
function recordCreated(db, issueId, actor, when) {
  return insertEvent(db, issueId, 'created', actor, when);
}

// Compares `before` and `after` (work item rows) over the history fields and
// writes one `changed` event with a row per field whose value differs.
// Fields with no column (links) are not compared; recordLinkChange writes them.
// Writes nothing, and returns null, when nothing changed.
function recordChanges(db, issueId, actor, before, after, when) {
  const changed = HISTORY_FIELDS.filter((f) => f.column && clean(before[f.column]) !== clean(after[f.column]));
  if (changed.length === 0) return null;
  const eventId = insertEvent(db, issueId, 'changed', actor, when);
  const insert = db.prepare(
    'INSERT INTO issue_history_changes (event_id, field, old_value, new_value, old_id, new_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const f of changed) {
    const oldValue = snapshot(db, f, before[f.column]);
    const newValue = snapshot(db, f, after[f.column]);
    insert.run(eventId, f.key, oldValue.text, newValue.text, oldValue.id, newValue.id);
  }
  return eventId;
}

// One `changed` event with a single link change on `issueId`: oldText/oldId
// for a removed link, newText/newId for an added one (the text is
// `<label> <other key>` from this item's point of view).
function recordLinkChange(db, issueId, actor, { oldText = null, newText = null, oldId = null, newId = null }, when) {
  const eventId = insertEvent(db, issueId, 'changed', actor, when);
  db.prepare(
    'INSERT INTO issue_history_changes (event_id, field, old_value, new_value, old_id, new_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(eventId, linkField().key, clean(oldText), clean(newText), oldId, newId);
  return eventId;
}

// The change as the API returns it. A field no longer in the list keeps its
// stored key as the label and is shown as plain text.
function toChange(row) {
  const field = getField(row.field) || { key: row.field, label: row.field, kind: 'text' };
  const long = field.kind === 'long';
  return {
    field: field.key,
    label: field.label,
    kind: field.kind,
    old: long ? null : row.old_value,
    new: long ? null : row.new_value,
    old_id: row.old_id,
    new_id: row.new_id,
  };
}

// Newest first (by id). `before` returns only older events; `field` keeps
// only events with a change to that field (and only those changes), which
// leaves out `created` events. Returns { events, has_more }.
function listHistory(db, issueId, { limit = 50, before = null, field = null } = {}) {
  const where = ['e.issue_id = ?'];
  const params = [issueId];
  if (before !== null) {
    where.push('e.id < ?');
    params.push(before);
  }
  if (field !== null) {
    where.push('EXISTS (SELECT 1 FROM issue_history_changes c WHERE c.event_id = e.id AND c.field = ?)');
    params.push(field);
  }
  const rows = db
    .prepare(
      `SELECT e.id, e.kind, e.actor_id, e.actor_name, e.created_at
       FROM issue_history_events e WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT ?`
    )
    .all(...params, limit + 1);
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map((e) => ({ ...e, changes: [] }));
  if (events.length) {
    const byId = new Map(events.map((e) => [e.id, e]));
    const placeholders = events.map(() => '?').join(', ');
    const changes = db
      .prepare(
        `SELECT event_id, field, old_value, new_value, old_id, new_id FROM issue_history_changes
         WHERE event_id IN (${placeholders})${field !== null ? ' AND field = ?' : ''} ORDER BY id`
      )
      .all(...events.map((e) => e.id), ...(field !== null ? [field] : []));
    for (const c of changes) byId.get(c.event_id).changes.push(toChange(c));
  }
  return { events, has_more: hasMore };
}

// Removes every event and change of a work item (used when it is deleted).
function deleteHistory(db, issueId) {
  db.prepare(
    'DELETE FROM issue_history_changes WHERE event_id IN (SELECT id FROM issue_history_events WHERE issue_id = ?)'
  ).run(issueId);
  db.prepare('DELETE FROM issue_history_events WHERE issue_id = ?').run(issueId);
}

module.exports = { UNKNOWN_ACTOR, recordCreated, recordChanges, recordLinkChange, listHistory, deleteHistory };
