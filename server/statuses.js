// The single source of truth for work item statuses and board column order.
// Everything else (board columns, swimlanes, drop targets, forms, validation,
// the default status for new work items) is driven by this list.
// To add a status, insert it here in the desired column position and restart.
const STATUSES = ['To Do', 'In Progress', 'Done'];

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

module.exports = { STATUSES, isValidStatus, defaultStatus, terminalStatus, isTerminalStatus };
