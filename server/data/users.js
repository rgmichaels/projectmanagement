// Data access for users. All SQL for users lives here.

const COLUMNS = 'id, name, username';

function listUsers(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY name, id`).all();
}

// The public list on the sign-in page. Kept separate from listUsers so the
// signed-in list can grow later (for example permissions) without making
// that public: this one returns exactly id, name and username.
function listLoginUsers(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY name, id`).all();
}

function getUser(db, id) {
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id);
}

// Case-insensitive, ignoring surrounding whitespace. Undefined for anything
// that is not a non-empty string or matches no user.
function getUserByUsername(db, username) {
  if (typeof username !== 'string' || !username.trim()) return undefined;
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE lower(username) = lower(?)`).get(username.trim());
}

module.exports = { listUsers, listLoginUsers, getUser, getUserByUsername };
