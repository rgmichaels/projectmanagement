// Data access for projects. All SQL for projects lives here.

const COLUMNS = 'id, name, key, status, archived, next_issue_number, created_at';

function toProject(row) {
  if (!row) return row;
  return { ...row, archived: row.archived === 1 };
}

function listProjects(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  return db
    .prepare(`SELECT ${COLUMNS} FROM projects ${where} ORDER BY name, id`)
    .all()
    .map(toProject);
}

function getProject(db, id) {
  return toProject(db.prepare(`SELECT ${COLUMNS} FROM projects WHERE id = ?`).get(id));
}

function getProjectByKey(db, key) {
  return toProject(db.prepare(`SELECT ${COLUMNS} FROM projects WHERE key = ?`).get(key));
}

function createProject(db, { name, key, status }) {
  const info = db
    .prepare('INSERT INTO projects (name, key, status, archived, next_issue_number, created_at) VALUES (?, ?, ?, 0, 1, ?)')
    .run(name, key, status, new Date().toISOString());
  return getProject(db, info.lastInsertRowid);
}

// Updates name, status and/or archived in a single statement. The caller
// (route) decides the final archived value, including auto-unarchive.
function updateProject(db, id, { name, status, archived }) {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push('name = ?'); params.push(name); }
  if (status !== undefined) { sets.push('status = ?'); params.push(status); }
  if (archived !== undefined) { sets.push('archived = ?'); params.push(archived ? 1 : 0); }
  if (sets.length) {
    db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  }
  return getProject(db, id);
}

module.exports = { listProjects, getProject, getProjectByKey, createProject, updateProject };
