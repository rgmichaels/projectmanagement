// The single source of truth for the sprint audit log
// (docs/specs/sprints-and-backlog.md AC 41-44): the event kinds, in display
// order, and the sprint fields an `edited` event tracks, the way
// server/historyFields.js lists the work item fields.
//   SPRINT_EVENT_KINDS    - { key, label }; key is stored in sprint_events.kind
//   SPRINT_HISTORY_FIELDS - { key, column, label }; key is stored in
//                           sprint_event_changes.field
// Code refers to a kind through EVENT (EVENT.created, ...), never by a string,
// and the client reads GET /api/sprint-event-kinds. To add a kind or a
// tracked field, add an entry here and restart.
const SPRINT_EVENT_KINDS = [
  { key: 'created', label: 'Created' },
  { key: 'edited', label: 'Edited' },
  { key: 'started', label: 'Started' },
  { key: 'completed', label: 'Completed' },
  { key: 'deleted', label: 'Deleted' },
];

const SPRINT_HISTORY_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'goal', label: 'Goal' },
  { key: 'start_date', label: 'Start date' },
  { key: 'end_date', label: 'End date' },
].map((f) => ({ column: f.key, ...f }));

// Kind keys by name, for the code that records events.
const EVENT = Object.freeze(Object.fromEntries(SPRINT_EVENT_KINDS.map((k) => [k.key, k.key])));

function isSprintEventKind(key) {
  return SPRINT_EVENT_KINDS.some((k) => k.key === key);
}

function getSprintField(key) {
  return SPRINT_HISTORY_FIELDS.find((f) => f.key === key);
}

// The public shape for GET /api/sprint-event-kinds.
function publicSprintEventKinds() {
  return {
    kinds: SPRINT_EVENT_KINDS.map(({ key, label }) => ({ key, label })),
    fields: SPRINT_HISTORY_FIELDS.map(({ key, label }) => ({ key, label })),
  };
}

module.exports = {
  SPRINT_EVENT_KINDS,
  SPRINT_HISTORY_FIELDS,
  EVENT,
  isSprintEventKind,
  getSprintField,
  publicSprintEventKinds,
};
