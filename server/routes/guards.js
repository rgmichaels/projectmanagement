// Shared route guards: permission groups, loading records by id, the
// archived read-only rule and ownership. Write routes check, in this order:
// group (403, assertCan, before any record is loaded), record exists (404),
// ownership (403), archived (409), then field validation (400).
const projects = require('../data/projects');
const issues = require('../data/issues');
const comments = require('../data/comments');
const links = require('../data/links');
const attachments = require('../data/attachments');
const { UNKNOWN_ACTOR } = require('../data/history');
const { ValidationError } = require('../validation');
const { can, actionOf } = require('../groups');

// The signed-in user's group must have `permission` (server/groups.js).
// `project` is accepted for later per-project membership and ignored for now:
// a project_members role would be consulted here, and only here.
// eslint-disable-next-line no-unused-vars
function assertCan(user, permission, project) {
  if (!user || !can(user.group, permission)) {
    const group = user && user.group ? user.group : 'none';
    throw new ValidationError(`Your group (${group}) is not allowed to ${actionOf(permission)}.`, 403);
  }
}

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

// A link that involves the work item `issueId` (as its source or target).
function loadLink(db, rawId, issueId) {
  const id = parseId(rawId);
  const link = id && links.getLink(db, id);
  if (!link || (link.source_id !== issueId && link.target_id !== issueId)) {
    throw new ValidationError('Link not found.', 404);
  }
  return link;
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

function loadAttachment(db, rawId) {
  const id = parseId(rawId);
  const attachment = id && attachments.getAttachment(db, id);
  if (!attachment) throw new ValidationError('Attachment not found.', 404);
  return attachment;
}

// Only an attachment's uploader may delete it (Admins included).
function assertOwnsAttachment(user, attachment) {
  if (attachment.uploader_id !== user.id) {
    throw new ValidationError('You can only delete your own attachments.', 403);
  }
}

// Who is acting, for history: always the signed-in user (never the request
// body), or the Unknown actor when there is none.
function actorFrom(req) {
  return req.user ? { id: req.user.id, name: req.user.name } : UNKNOWN_ACTOR;
}

module.exports = {
  assertCan,
  loadProject,
  loadIssue,
  loadComment,
  loadLink,
  loadAttachment,
  assertWritable,
  assertOwnsComment,
  assertOwnsAttachment,
  actorFrom,
};
