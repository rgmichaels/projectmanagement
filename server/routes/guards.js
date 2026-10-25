// Shared route guards: loading records by id, the archived read-only rule and
// ownership. Permission checks (later) belong here too, next to these.
const projects = require('../data/projects');
const issues = require('../data/issues');
const comments = require('../data/comments');
const { ValidationError } = require('../validation');

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function loadProject(db, rawId) {
  const id = parseId(rawId);
  const project = id && projects.getProject(db, id);
  if (!project) throw new ValidationError('Project not found.', 404);
  return project;
}

function loadIssue(db, rawId) {
  const id = parseId(rawId);
  const issue = id && issues.getIssue(db, id);
  if (!issue) throw new ValidationError('Work item not found.', 404);
  return issue;
}

function loadComment(db, rawId) {
  const id = parseId(rawId);
  const comment = id && comments.getComment(db, id);
  if (!comment) throw new ValidationError('Message not found.', 404);
  return comment;
}

// Work items of an archived project are read-only.
function assertWritable(project) {
  if (project.archived) {
    throw new ValidationError('This project is archived; its work items are read-only.', 409);
  }
}

// Only a message's author may edit or delete it.
function assertOwnsComment(user, comment) {
  if (comment.author_id !== user.id) {
    throw new ValidationError('You can only change your own messages.', 403);
  }
}

module.exports = { loadProject, loadIssue, loadComment, assertWritable, assertOwnsComment };
