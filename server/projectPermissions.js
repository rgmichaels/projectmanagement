// Resolve project scope from the resource in the URL, never from client hints.
// SQL lives in server/data/projectPermissions.js.
const data = require('./data/projectPermissions');
const { permissionsOf } = require('./groups');

function assignments(db, userId) {
  return data.listForUser(db, userId);
}

function scopePermissions(db) {
  return (req, res, next) => {
    const match = req.path.match(/^\/(projects|issues|comments|attachments|sprints|test-cases|time)\/(\d+)(?:\/|$)/i);
    if (!req.user || !match) return next();
    const projectId = data.projectIdOf(db, match[1].toLowerCase(), Number(match[2]));
    if (projectId) {
      const group = data.getGroup(db, projectId, req.user.id);
      if (group) req.user = { ...req.user, group, permissions: permissionsOf(group) };
    }
    next();
  };
}

module.exports = { assignments, scopePermissions };
