// The single list of work item fields that appear in history, in display
// order. Each entry is { key, column, label, kind }:
//   key    - the name stored in history and used by the `field` filter
//   column - the issues column it tracks (defaults to key)
//   label  - the text shown in the History tab
//   kind   - how a value is recorded:
//              text  : the value as is (empty -> null)
//              long  : only that it changed, no old or new text
//              user  : the id plus the user's display name
//              issue : the id plus `<key> <title>` of that work item
//              sprint-name: the id plus the sprint's name (a snapshot, so it
//                      survives the sprint's deletion)
//              link  : a link added or removed, as `<label> <other key>`
//                      from this item's point of view, plus the other id.
//                      It has no column (column: null): recordChanges skips
//                      it and server/data/links.js records it instead.
//              file  : an attachment added (new = its file name) or removed
//                      (old = its file name). No column either;
//                      server/data/attachments.js records it.
//   emptyText - optional: what the API shows for an empty (null) value of
//              the field; it is still stored as null (the backlog is a null
//              sprint and reads "Backlog").
// `rank` and `sprint_rank` are deliberately absent: reorders are bookkeeping,
// not history.
// To track a new editable column, add one entry here (tests/history.test.js
// fails if an updatable column other than rank is missing). Field names only;
// no status, type, priority or resolution value belongs here.
const { TYPES } = require('./types');

// The epic field is labelled after the epic type, as on the board.
const epicType = TYPES.find((t) => t.isEpic);

const HISTORY_FIELDS = [
  { key: 'type', label: 'Type', kind: 'text' },
  { key: 'title', label: 'Title', kind: 'text' },
  { key: 'description', label: 'Description', kind: 'long' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'priority', label: 'Priority', kind: 'text' },
  { key: 'assignee', column: 'assignee_id', label: 'Assignee', kind: 'user' },
  { key: 'epic', column: 'epic_id', label: epicType ? epicType.label || epicType.name : 'Parent', kind: 'issue' },
  { key: 'sprint', column: 'sprint_id', label: 'Sprint', kind: 'sprint-name', emptyText: 'Backlog' },
  { key: 'resolution', label: 'Resolution', kind: 'text' },
  { key: 'link', column: null, label: 'Link', kind: 'link' },
  { key: 'attachment', column: null, label: 'Attachment', kind: 'file' },
].map((f) => ({ column: f.key, ...f }));

function getField(key) {
  return HISTORY_FIELDS.find((f) => f.key === key);
}

// The field that records links.
function linkField() {
  return HISTORY_FIELDS.find((f) => f.kind === 'link');
}

// The field that records attachments.
function attachmentField() {
  return HISTORY_FIELDS.find((f) => f.kind === 'file');
}

function isHistoryField(key) {
  return Boolean(getField(key));
}

// The public shape for GET /api/history-fields.
function publicFields() {
  return HISTORY_FIELDS.map(({ key, label, kind }) => ({ key, label, kind }));
}

module.exports = { HISTORY_FIELDS, getField, isHistoryField, linkField, attachmentField, publicFields };
