// Data access for users. All SQL for users lives here. Users are never
// deleted: a user who left is deactivated (active = 0, docs/specs/user-admin.md)
// and keeps everything they own. Inputs are validated by the routes.
const { managerGroups } = require('../groups');

const COLUMNS = 'id, name, username';
// The signed-in view of a user adds the permission group (API field `group`;
// the column is group_name because GROUP is an SQL keyword) and `active`.
const COLUMNS_WITH_GROUP = `${COLUMNS}, group_name AS "group", active`;

// The API shape: `active` as a boolean.
const present = (row) => (row ? { ...row, active: row.active === 1 } : row);

// Active users only, unless includeInactive (the Users page for an Admin).
function listUsers(db, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db.prepare(`SELECT ${COLUMNS_WITH_GROUP} FROM users ${where} ORDER BY name, id`).all().map(present);
}

// The public list on the sign-in page: active users only. Kept separate from
// listUsers so the signed-in list can grow later (for example permissions)
// without making that public: this one returns exactly id, name and username.
function listLoginUsers(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE active = 1 ORDER BY name, id`).all();
}

function getUser(db, id) {
  return present(db.prepare(`SELECT ${COLUMNS_WITH_GROUP} FROM users WHERE id = ?`).get(id));
}

// Sets a user's group (validated by the caller) and returns the user.
function setUserGroup(db, id, group) {
  db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(group, id);
  return getUser(db, id);
}

// Adds a user (fields validated, username unique) and returns them, active.
function createUser(db, { name, username, group }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, username, group_name, active) VALUES (?, ?, ?, 1)')
    .run(name, username, group);
  return getUser(db, lastInsertRowid);
}

// Changes any of name, username, group and active (validated by the caller;
// absent fields are kept) and returns the user.
function updateUser(db, id, fields) {
  const columns = { name: 'name', username: 'username', group: 'group_name', active: 'active' };
  const sets = [];
  const values = [];
  for (const [field, column] of Object.entries(columns)) {
    if (fields[field] === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(field === 'active' ? (fields.active ? 1 : 0) : fields[field]);
  }
  if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return getUser(db, id);
}

function setUserActive(db, id, active) {
  return updateUser(db, id, { active: Boolean(active) });
}

// Whether another user (any, deactivated included) has this username,
// case-insensitively. `exceptId` is the user being edited.
function usernameTaken(db, username, exceptId = null) {
  return Boolean(
    db.prepare('SELECT 1 FROM users WHERE lower(username) = lower(?) AND id IS NOT ?').get(username, exceptId)
  );
}

// Every username in use, lower-cased (deactivated users included), for
// deriving a new one.
function takenUsernames(db) {
  return new Set(db.prepare('SELECT lower(username) AS u FROM users').all().map((r) => r.u));
}

// How many active users are in a group that may manage users
// (server/groups.js). A deactivated Admin does not count.
function countAdmins(db) {
  const groups = managerGroups();
  if (groups.length === 0) return 0;
  return db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE active = 1 AND group_name IN (${groups.map(() => '?').join(', ')})`)
    .get(...groups).n;
}

// Case-insensitive, ignoring surrounding whitespace. Undefined for anything
// that is not a non-empty string or matches no user. Includes `active`, so
// sign-in can refuse a deactivated user.
function getUserByUsername(db, username) {
  if (typeof username !== 'string' || !username.trim()) return undefined;
  return present(db.prepare(`SELECT ${COLUMNS}, active FROM users WHERE lower(username) = lower(?)`).get(username.trim()));
}

module.exports = {
  listUsers,
  listLoginUsers,
  getUser,
  getUserByUsername,
  setUserGroup,
  createUser,
  updateUser,
  setUserActive,
  usernameTaken,
  takenUsernames,
  countAdmins,
};
