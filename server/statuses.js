// The single source of truth for work item statuses and board column order.
// Everything else (board columns, swimlanes, drop targets, forms, validation,
// the default status for new work items) is driven by this list.
// To add a status, insert it here in the desired column position and restart.
const STATUSES = ['Planning', 'Ready', 'In Progress', 'Internal Testing', 'UAT', 'Go Live', 'Complete'];

function isValidStatus(name) {
  return STATUSES.includes(name);
}

function defaultStatus() {
  return STATUSES[0];
}

// The terminal status is the last entry. Only work items in it carry a
// resolution (see server/resolutions.js).
function terminalStatus() {
  return STATUSES[STATUSES.length - 1];
}

function isTerminalStatus(name) {
  return name === terminalStatus();
}

// The first status of active work (docs/specs/daily-report.md AC 12, 16):
// the statuses before it are "not started" and those from it up to the
// terminal status are "in progress". To move the boundary, change it here.
const STARTED_STATUS = 'In Progress';

function startedStatus() {
  return STARTED_STATUS;
}

module.exports = { STATUSES, isValidStatus, defaultStatus, terminalStatus, isTerminalStatus, startedStatus };
