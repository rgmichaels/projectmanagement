// Data access for users. All SQL for users lives here.

function listUsers(db) {
  return db.prepare('SELECT id, name FROM users ORDER BY name').all();
}

function getUser(db, id) {
  return db.prepare('SELECT id, name FROM users WHERE id = ?').get(id);
}

module.exports = { listUsers, getUser };
