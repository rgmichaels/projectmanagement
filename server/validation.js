// Request validation for projects, work items and discussion messages. Allowed values come from the
// single-source lists; nothing here names a specific status or type.
const { isValidStatus, defaultStatus, isTerminalStatus, terminalStatus } = require('./statuses');
const { isValidResolution } = require('./resolutions');
const { isValidType, isEpicType } = require('./types');
const { isValidPriority } = require('./priorities');
const { isValidProjectStatus } = require('./projectStatuses');
const { initialSprintState, finalSprintState } = require('./sprintStates');
const users = require('./data/users');
const issues = require('./data/issues');
const sprints = require('./data/sprints');

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

  // A resolution is only valid on an item that is (or is being moved to) the
  // terminal status, and an item there must keep one. Omitting it lets the
  // data-access layer set the default or clear it.
  if (body.resolution !== undefined) {
    const finalStatus = creating ? defaultStatus() : out.status ?? existing.status;
    if (body.resolution === null) {
      if (isTerminalStatus(finalStatus)) {
        throw new ValidationError(`A work item in ${terminalStatus()} must have a resolution.`);
      }
    } else {
      if (!isValidResolution(body.resolution)) throw new ValidationError(`Unknown resolution: ${body.resolution}`);
      if (!isTerminalStatus(finalStatus)) {
        throw new ValidationError(`A resolution can only be set on a work item in ${terminalStatus()}.`);
      }
      out.resolution = body.resolution;
    }
  }

  const finalType = out.type ?? existing?.type;
  const finalEpic = out.epic_id !== undefined ? out.epic_id : existing?.epic_id ?? null;
  if (finalType && isEpicType(finalType) && finalEpic !== null) {
    throw new ValidationError('An epic cannot have an epic.');
  }
  Object.assign(out, checkSprintMembership(db, project, body, existing, finalType));
  return out;
}

const EPIC_SPRINT = 'Epics cannot be added to a sprint.';
const COMPLETED_SPRINT = 'Completed sprints are read-only; this work item cannot move in or out of one.';

// sprint_id and sprint_rank of a work item (docs/specs/sprints-and-backlog.md
// AC 18-22): the sprint must be of the same project (400) and not completed
// (409); an item in a completed sprint cannot leave it (409); an epic is in
// no sprint (400). Changing an item in a completed sprint to an epic type is
// refused (409), since that would take it out of the sprint.
function checkSprintMembership(db, project, body, existing, finalType) {
  const out = {};
  const epic = Boolean(finalType) && isEpicType(finalType);
  const current = existing && existing.sprint_id ? sprints.getSprint(db, existing.sprint_id) : null;
  const inCompleted = Boolean(current) && current.state === finalSprintState();
  if (body.sprint_id !== undefined) {
    const id = body.sprint_id === null ? null : toIdOrNull(body.sprint_id, 'sprint');
    if (id !== null && epic) throw new ValidationError(EPIC_SPRINT);
    if (id !== null) {
      const sprint = sprints.getSprint(db, id);
      if (!sprint || sprint.project_id !== project.id) throw new ValidationError('Sprint must be a sprint of the same project.');
      if (sprint.state === finalSprintState() && (!existing || existing.sprint_id !== id)) {
        throw new ValidationError(COMPLETED_SPRINT, 409);
      }
    }
    if (inCompleted && id !== existing.sprint_id) throw new ValidationError(COMPLETED_SPRINT, 409);
    if (!epic) out.sprint_id = id; // null on an epic is accepted as a no-op
  }
  if (body.sprint_rank !== undefined) {
    if (epic) throw new ValidationError(EPIC_SPRINT);
    if (!Number.isInteger(body.sprint_rank)) throw new ValidationError('Sprint rank must be an integer.');
    if (!existing) throw new ValidationError('Sprint rank cannot be set on create; new work items go to the bottom.');
    if (inCompleted) throw new ValidationError(COMPLETED_SPRINT, 409);
    out.sprint_rank = body.sprint_rank;
  }
  if (existing && inCompleted && epic && !isEpicType(existing.type)) {
    throw new ValidationError(COMPLETED_SPRINT, 409);
  }
  return out;
}

const SPRINT_NAME_MAX = 80;
const SPRINT_GOAL_MAX = 500;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function checkSprintName(name) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > SPRINT_NAME_MAX) {
    throw new ValidationError(`Name is required and must be 1-${SPRINT_NAME_MAX} characters.`);
  }
  return name.trim();
}

// A real calendar date as YYYY-MM-DD, or null for null, '' or omitted.
function checkDate(value, label) {
  if (value === null || value === '') return null;
  const m = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new ValidationError(`${label} must be a date as YYYY-MM-DD.`);
  }
  return value;
}

// Name, goal and dates of a sprint for create (existing = undefined) or edit.
// The state is never set here (start and complete do that).
function checkSprintFields(body, existing) {
  const out = {};
  if (body.state !== undefined) throw new ValidationError('The state cannot be changed here; start or complete the sprint instead.');
  if (!existing || body.name !== undefined) out.name = checkSprintName(body.name);
  if (body.goal !== undefined) {
    if (body.goal !== null && typeof body.goal !== 'string') throw new ValidationError('Goal must be text.');
    const goal = (body.goal || '').trim();
    if (goal.length > SPRINT_GOAL_MAX) throw new ValidationError(`Goal must be at most ${SPRINT_GOAL_MAX} characters.`);
    out.goal = goal;
  }
  if (body.start_date !== undefined) out.start_date = checkDate(body.start_date, 'Start date');
  if (body.end_date !== undefined) out.end_date = checkDate(body.end_date, 'End date');
  const start = out.start_date !== undefined ? out.start_date : existing?.start_date ?? null;
  const end = out.end_date !== undefined ? out.end_date : existing?.end_date ?? null;
  if (start && end && end < start) throw new ValidationError('End date must not be before the start date.');
  return out;
}

const DISPOSITIONS = ['backlog', 'next-sprint', 'new-sprint'];

// The body of POST /api/sprints/:id/complete for `sprint`.
// Returns { disposition, nextSprint, newSprintName }.
function checkCompletion(db, sprint, body) {
  const disposition = body.disposition;
  if (!DISPOSITIONS.includes(disposition)) {
    throw new ValidationError(`disposition must be one of: ${DISPOSITIONS.join(', ')}.`);
  }
  const out = { disposition, nextSprint: null, newSprintName: null };
  if (disposition === 'next-sprint') {
    const id = toIdOrNull(body.next_sprint_id ?? '', 'next sprint');
    const next = id === null ? null : sprints.getSprint(db, id);
    if (!next || next.project_id !== sprint.project_id || next.state !== initialSprintState()) {
      throw new ValidationError('next_sprint_id must be a planned sprint of the same project.');
    }
    out.nextSprint = next;
  }
  if (disposition === 'new-sprint' && body.new_sprint_name !== undefined && body.new_sprint_name !== null) {
    if (typeof body.new_sprint_name !== 'string') throw new ValidationError('new_sprint_name must be text.');
    if (body.new_sprint_name.trim() !== '') out.newSprintName = checkSprintName(body.new_sprint_name);
  }
  return out;
}

const COMMENT_MAX_LENGTH = 2000;

// A discussion message: plain text, trimmed (inner line breaks kept), 1-2000 chars.
function checkCommentBody(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (text.length < 1 || text.length > COMMENT_MAX_LENGTH) {
    throw new ValidationError(`Message is required and must be 1-${COMMENT_MAX_LENGTH} characters.`);
  }
  return text;
}

const FILENAME_MAX_LENGTH = 200;

// An attachment's display name from the URL-encoded X-Filename header: path
// separators and control characters removed, trimmed, at most 200 characters
// (the end, with the extension, is kept when it is shortened). It is only
// ever shown and stored, never used as a path.
function checkFilename(raw) {
  let name;
  try {
    name = typeof raw === 'string' ? decodeURIComponent(raw) : '';
  } catch {
    throw new ValidationError('The file name is not valid.');
  }
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[/\\\u0000-\u001f\u007f]/g, '').trim();
  if (!name) throw new ValidationError('A file name is required (X-Filename header).');
  const chars = [...name];
  if (chars.length > FILENAME_MAX_LENGTH) name = chars.slice(-FILENAME_MAX_LENGTH).join('');
  return name;
}

module.exports = {
  ValidationError,
  COMMENT_MAX_LENGTH,
  FILENAME_MAX_LENGTH,
  checkFilename,
  checkCommentBody,
  checkProjectName,
  checkProjectKey,
  checkProjectStatus,
  checkIssueFields,
  checkSprintFields,
  checkCompletion,
};
