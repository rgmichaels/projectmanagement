// Data access for time entries (table `time_entries`,
// docs/specs/time-tracking.md). All time entry SQL lives here, apart from the
// per-item and per-sprint sums, which are subqueries of the work item and
// sprint lists (./issues, ./sprints) built from the fragments below.
// Validation (hours, date, note, epic refusal, ownership, archived guard)
// happens in the routes; these functions assume valid input. Logging, editing
// and deleting an entry each record a `time_entry` change in the work item's
// history in the same transaction (spec Decision 4, AC 31).
const history = require('./history');

// Stored minutes as API hours; exact for quarter hours.
const toHours = (minutes) => minutes / 60;

// Notes longer than this are shortened in history text.
const NOTE_EXCERPT = 60;
const excerpt = (note) => (note.length > NOTE_EXCERPT ? `${note.slice(0, NOTE_EXCERPT - 3)}...` : note);

// The history text of an entry: `1.5 h on 2026-10-28`, plus `: <note>` when
// it has one (shortened unless `fullNote`).
function entryText(row, fullNote = false) {
  const base = `${toHours(row.minutes)} h on ${row.work_date}`;
  return row.note ? `${base}: ${fullNote ? row.note : excerpt(row.note)}` : base;
}

const SELECT = `
  SELECT id, issue_id, user_id, user_name, minutes, work_date, note, created_at, updated_at
  FROM time_entries`;

// Sum of the minutes logged on the work item `i` (an alias in the caller's query).
const ITEM_MINUTES_SQL = '(SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t WHERE t.issue_id = i.id)';

// Sum of the minutes logged on the work items now in the sprint `s`.
const SPRINT_MINUTES_SQL =
  '(SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t JOIN issues ti ON ti.id = t.issue_id WHERE ti.sprint_id = s.id)';

// The entry as the API returns it: hours instead of minutes, `date` for the work date.
function present(row) {
  if (!row) return row;
  return {
    id: row.id,
    issue_id: row.issue_id,
    user_id: row.user_id,
    user_name: row.user_name,
    hours: toHours(row.minutes),
    date: row.work_date,
    note: row.note,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Newest work date first; ties by id descending.
function listForIssue(db, issueId) {
  return db.prepare(`${SELECT} WHERE issue_id = ? ORDER BY work_date DESC, id DESC`).all(issueId).map(present);
}

function totalMinutes(db, issueId) {
  return db.prepare('SELECT COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE issue_id = ?').get(issueId).m;
}

// The stored row (minutes, work_date), for ownership checks and edits.
function getEntry(db, id) {
  return db.prepare(`${SELECT} WHERE id = ?`).get(id);
}

// `user` is { id, name } of the signed-in user, who is also the history actor.
// Records "logged <text>" in the same transaction.
function createEntry(db, issueId, user, { minutes, work_date, note }) {
  return db.transaction(() => {
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO time_entries (issue_id, user_id, user_name, minutes, work_date, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(issueId, user.id, user.name, minutes, work_date, note, now, now);
    const row = getEntry(db, info.lastInsertRowid);
    history.recordTimeEntryChange(db, issueId, user, { newText: entryText(row), newId: row.id }, now);
    return present(row);
  })();
}

// Applies { minutes?, work_date?, note? }. When nothing differs, nothing is
// written (no history either) and updated_at stays, so an unchanged save
// shows no "edited" marker. Otherwise records the old and new text in the
// same transaction; when only the note changed past the excerpt, the full
// notes are recorded so the two texts differ.
function updateEntry(db, id, changes, actor) {
  return db.transaction(() => {
    const current = getEntry(db, id);
    const fields = ['minutes', 'work_date', 'note'].filter((f) => changes[f] !== undefined && changes[f] !== current[f]);
    if (fields.length === 0) return present(current);
    const now = new Date().toISOString();
    db.prepare(`UPDATE time_entries SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...fields.map((f) => changes[f]),
      now,
      id
    );
    const updated = getEntry(db, id);
    const full = entryText(current) === entryText(updated);
    history.recordTimeEntryChange(
      db,
      current.issue_id,
      actor,
      { oldText: entryText(current, full), newText: entryText(updated, full), oldId: id, newId: id },
      now
    );
    return present(updated);
  })();
}

// Deletes the entry and records "deleted time entry <text>" in the same transaction.
function deleteEntry(db, id, actor) {
  db.transaction(() => {
    const row = getEntry(db, id);
    if (!row) return;
    db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
    history.recordTimeEntryChange(db, row.issue_id, actor, { oldText: entryText(row), oldId: id });
  })();
}

// Used inside deleteIssue's transaction.
function deleteForIssue(db, issueId) {
  db.prepare('DELETE FROM time_entries WHERE issue_id = ?').run(issueId);
}

module.exports = {
  toHours,
  entryText,
  ITEM_MINUTES_SQL,
  SPRINT_MINUTES_SQL,
  present,
  listForIssue,
  totalMinutes,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  deleteForIssue,
};
