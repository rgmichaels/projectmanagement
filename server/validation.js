// Request validation for projects and work items. Allowed values come from the
// single-source lists; nothing here names a specific status or type.
const { isValidStatus } = require('./statuses');
const { isValidType, isEpicType } = require('./types');
const { isValidPriority } = require('./priorities');
const { isValidProjectStatus } = require('./projectStatuses');
const users = require('./data/users');
const issues = require('./data/issues');

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const KEY_PATTERN = /^[A-Z]{2,10}$/;

function checkProjectName(name) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 80) {
    throw new ValidationError('Name is required and must be 1-80 characters.');
  }
  return name.trim();
}

function checkProjectKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new ValidationError('Key must be 2-10 uppercase letters (A-Z).');
  }
  return key;
}

function checkProjectStatus(status) {
  if (!isValidProjectStatus(status)) {
    throw new ValidationError(`Unknown project status: ${status}`);
  }
  return status;
}

function toIdOrNull(value, label) {
  if (value === null || value === '' ) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`Invalid ${label}.`);
  return n;
}

// Validates work item fields for create (existing = undefined) or update.
// Returns the cleaned set of changes.
function checkIssueFields(db, project, body, existing) {
  const out = {};
  const creating = !existing;

  if (creating || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.trim().length > 200) {
      throw new ValidationError('Title is required and must be 1-200 characters.');
    }
    out.title = body.title.trim();
  }
  if (body.type !== undefined) {
    if (!isValidType(body.type)) throw new ValidationError(`Unknown work item type: ${body.type}`);
    out.type = body.type;
  }
  // A status is validated on create too (AC 30), but a new item always
  // starts in the first status (AC 14), so it is only applied on update.
  if (body.status !== undefined) {
    if (!isValidStatus(body.status)) throw new ValidationError(`Unknown status: ${body.status}`);
    if (!creating) out.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!isValidPriority(body.priority)) throw new ValidationError(`Unknown priority: ${body.priority}`);
    out.priority = body.priority;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      throw new ValidationError('Description must be text.');
    }
    out.description = body.description || '';
  }
  if (body.assignee_id !== undefined) {
    const id = toIdOrNull(body.assignee_id, 'assignee');
    if (id !== null && !users.getUser(db, id)) throw new ValidationError('Unknown assignee.');
    out.assignee_id = id;
  }
  if (body.epic_id !== undefined) {
    const id = toIdOrNull(body.epic_id, 'epic');
    if (id !== null) {
      const epic = issues.getIssue(db, id);
      if (!epic || epic.project_id !== project.id || !isEpicType(epic.type)) {
        throw new ValidationError('Epic must be an epic in the same project.');
      }
      if (existing && epic.id === existing.id) throw new ValidationError('A work item cannot be its own epic.');
    }
    out.epic_id = id;
  }
  if (body.rank !== undefined && !creating) {
    if (!Number.isInteger(body.rank)) throw new ValidationError('Rank must be an integer.');
    out.rank = body.rank;
  }

  const finalType = out.type ?? existing?.type;
  const finalEpic = out.epic_id !== undefined ? out.epic_id : existing?.epic_id ?? null;
  if (finalType && isEpicType(finalType) && finalEpic !== null) {
    throw new ValidationError('An epic cannot have an epic.');
  }
  return out;
}

module.exports = {
  ValidationError,
  checkProjectName,
  checkProjectKey,
  checkProjectStatus,
  checkIssueFields,
};
