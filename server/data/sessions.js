// Data access for sign-in sessions (table `sessions`). All SQL for sessions
// lives here; only server/auth.js uses this module.

function createSession(db, token, userId, now = new Date().toISOString()) {
  db.prepare('INSERT INTO sessions (token, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    now
  );
}

// The session with its user's fields; user_name, username, user_group and
// user_active are null when the user row no longer exists. The group is read
// on every request, so a change applies to sessions that are already open.
function getSession(db, token) {
  return db
    .prepare(
      `SELECT s.token, s.user_id, s.created_at, s.last_seen_at, u.id AS uid, u.name AS user_name, u.username,
              u.group_name AS user_group, u.active AS user_active
       FROM sessions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);
}

function touchSession(db, token, now = new Date().toISOString()) {
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(now, token);
}

function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Signs a user out everywhere (used when they are deactivated).
function deleteSessionsForUser(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

module.exports = { createSession, getSession, touchSession, deleteSession, deleteSessionsForUser };
