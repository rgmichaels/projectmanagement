// Data access for users. All SQL for users lives here.
const { managerGroups } = require('../groups');

const COLUMNS = 'id, name, username';
// The signed-in view of a user adds the permission group (API field `group`;
// the column is group_name because GROUP is an SQL keyword).
const COLUMNS_WITH_GROUP = `${COLUMNS}, group_name AS "group"`;

function listUsers(db) {
  return db.prepare(`SELECT ${COLUMNS_WITH_GROUP} FROM users ORDER BY name, id`).all();
}

// The public list on the sign-in page. Kept separate from listUsers so the
// signed-in list can grow later (for example permissions) without making
// that public: this one returns exactly id, name and username.
function listLoginUsers(db) {
  return db.prepare(`SELECT ${COLUMNS} FROM users ORDER BY name, id`).all();
}

function getUser(db, id) {
  return db.prepare(`SELECT ${COLUMNS_WITH_GROUP} FROM users WHERE id = ?`).get(id);
}

// Sets a user's group (validated by the caller) and returns the user.
function setUserGroup(db, id, group) {
  db.prepare('UPDATE users SET group_name = ? WHERE id = ?').run(group, id);
  return getUser(db, id);
}

// How many users are in a group that may manage users (server/groups.js).
function countAdmins(db) {
  const groups = managerGroups();
  if (groups.length === 0) return 0;
  return db.prepare(`SELECT COUNT(*) AS n FROM users WHERE group_name IN (${groups.map(() => '?').join(', ')})`).get(...groups).n;
}

// Case-insensitive, ignoring surrounding whitespace. Undefined for anything
// that is not a non-empty string or matches no user.
function getUserByUsername(db, username) {
  if (typeof username !== 'string' || !username.trim()) return undefined;
  return db.prepare(`SELECT ${COLUMNS} FROM users WHERE lower(username) = lower(?)`).get(username.trim());
}

module.exports = { listUsers, listLoginUsers, getUser, getUserByUsername, setUserGroup, countAdmins };
