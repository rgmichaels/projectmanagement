// Resolve project scope from the resource in the URL, never from client hints.
const { permissionsOf } = require('./groups');

function assignments(db, userId) {
  return db.prepare('SELECT project_id, group_name FROM project_permissions WHERE user_id = ?').all(userId);
}

function scopePermissions(db) {
  return (req, res, next) => {
    const match = req.path.match(/^\/(projects|issues|comments|attachments|sprints|test-cases|time)\/(\d+)(?:\/|$)/i);
    if (!req.user || !match) return next();
    const resource = match[1].toLowerCase();
    const id = Number(match[2]);
    let projectId;
    if (resource === 'projects') projectId = id;
    else if (['issues', 'sprints', 'test-cases'].includes(resource)) {
      const table = { issues: 'issues', sprints: 'sprints', 'test-cases': 'test_cases' }[resource];
      projectId = db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).get(id)?.project_id;
    } else {
      const table = { comments: 'comments', attachments: 'attachments', time: 'time_entries' }[resource];
      projectId = db.prepare(`SELECT i.project_id FROM ${table} r JOIN issues i ON i.id = r.issue_id WHERE r.id = ?`).get(id)?.project_id;
    }
    if (projectId) {
      const row = db.prepare('SELECT group_name FROM project_permissions WHERE project_id = ? AND user_id = ?').get(projectId, req.user.id);
      if (row) req.user = { ...req.user, group: row.group_name, permissions: permissionsOf(row.group_name) };
    }
    next();
  };
}

module.exports = { assignments, scopePermissions };
