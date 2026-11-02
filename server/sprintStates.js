// The single source of truth for sprint states (docs/specs/sprints-and-backlog.md),
// in display order. Each entry is { name, initial?, active?, final? }:
//   initial - the state of a new sprint (exactly one)
//   active  - the running sprint; at most one per project (a unique index in
//             server/db.js enforces it); its items are the board
//   final   - a finished sprint; read-only, its items stay as a record
// No other file in server/ or public/js/ names a state: they ask these
// helpers, and the client reads GET /api/sprint-states. To rename a state,
// edit it here and restart. There is no CHECK constraint on sprints.state.
const SPRINT_STATES = [
  { name: 'Planned', initial: true },
  { name: 'Active', active: true },
  { name: 'Completed', final: true },
];

const flagged = (flag) => {
  const s = SPRINT_STATES.find((x) => x[flag]);
  return s ? s.name : null;
};

function isValidSprintState(name) {
  return SPRINT_STATES.some((s) => s.name === name);
}

function initialSprintState() {
  return flagged('initial');
}

function activeSprintState() {
  return flagged('active');
}

function finalSprintState() {
  return flagged('final');
}

// Position in the list (unknown states sort last).
function sprintStateOrder(name) {
  const i = SPRINT_STATES.findIndex((s) => s.name === name);
  return i === -1 ? SPRINT_STATES.length : i;
}

// The public shape for GET /api/sprint-states.
function publicSprintStates() {
  return SPRINT_STATES.map((s) => ({ name: s.name, initial: Boolean(s.initial), active: Boolean(s.active), final: Boolean(s.final) }));
}

module.exports = {
  SPRINT_STATES,
  isValidSprintState,
  initialSprintState,
  activeSprintState,
  finalSprintState,
  sprintStateOrder,
  publicSprintStates,
};
