// Data access for per-project group assignments (table `project_permissions`,
// docs/specs/project-permissions.md). All SQL for assignments, and for
// finding the project a URL resource belongs to, lives here. A user with no
// row for a project uses their account group there. Inputs are validated by
// the routes.

// The assignments of one user: [{ project_id, group_name }].
function listForUser(db, userId) {
  return db.prepare('SELECT project_id, group_name FROM project_permissions WHERE user_id = ?').all(userId);
}

// The assignments in one project: [{ user_id, group_name }].
function listForProject(db, projectId) {
  return db.prepare('SELECT user_id, group_name FROM project_permissions WHERE project_id = ?').all(projectId);
}

// The group assigned to a user in a project, or null for the account default.
function getGroup(db, projectId, userId) {
  const row = db.prepare('SELECT group_name FROM project_permissions WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return row ? row.group_name : null;
}

function setGroup(db, projectId, userId, group) {
  db.prepare(
    'INSERT INTO project_permissions (project_id, user_id, group_name) VALUES (?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET group_name = excluded.group_name'
  ).run(projectId, userId, group);
}

// Back to the account default.
function clearGroup(db, projectId, userId) {
  db.prepare('DELETE FROM project_permissions WHERE project_id = ? AND user_id = ?').run(projectId, userId);
}

// The tables of URL resources that carry project_id themselves, and of those
// that belong to a work item (issue_id).
const PROJECT_TABLES = { issues: 'issues', sprints: 'sprints', 'test-cases': 'test_cases' };
const ITEM_TABLES = { comments: 'comments', attachments: 'attachments', time: 'time_entries' };

// The project of the resource `/api/<resource>/<id>` from its database
// relationships, or undefined when it is not a scoped resource or not found.
function projectIdOf(db, resource, id) {
  if (resource === 'projects') return id;
  if (PROJECT_TABLES[resource]) {
    return db.prepare(`SELECT project_id FROM ${PROJECT_TABLES[resource]} WHERE id = ?`).get(id)?.project_id;
  }
  if (ITEM_TABLES[resource]) {
    return db
      .prepare(`SELECT i.project_id FROM ${ITEM_TABLES[resource]} r JOIN issues i ON i.id = r.issue_id WHERE r.id = ?`)
      .get(id)?.project_id;
  }
  return undefined;
}

module.exports = { listForUser, listForProject, getGroup, setGroup, clearGroup, projectIdOf };
