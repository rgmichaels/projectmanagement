// Sign-in routes. Login, logout and the user list are public; `me` needs a
// session. Sessions and cookies are handled only by server/auth.js.
const express = require('express');
const users = require('../data/users');
const auth = require('../auth');
const { assignments } = require('../projectPermissions');
const { permissionsOf } = require('../groups');
const { ValidationError } = require('../validation');

const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username });

function authRoutes(db) {
  const router = express.Router();

  // An unknown username never creates a user or a session. A deactivated
  // user gets the same answer, so the public API does not reveal them.
  router.post('/auth/login', (req, res) => {
    const user = users.getUserByUsername(db, (req.body || {}).username);
    if (!user || !user.active) throw new ValidationError('Unknown username.', 401);
    auth.signIn(db, req, res, user);
    res.json(publicUser(user));
  });

  router.post('/auth/logout', (req, res) => {
    auth.signOut(db, req, res);
    res.status(204).end();
  });

  // Active users only.
  router.get('/auth/users', (req, res) => {
    res.json(users.listLoginUsers(db).map(publicUser));
  });

  // The signed-in user with their group and its permission names; the
  // client hides controls from `permissions` and never from a group name.
  // `active` is always true (a deactivated user has no session; user-admin
  // AC 10, 12). `projectPermissions` maps project id to permission names for
  // projects where the user has a group of their own (project-permissions).
  router.get('/auth/me', auth.requireUser, (req, res) => {
    const { group, permissions } = req.user;
    const rows = assignments(db, req.user.id);
    const projectPermissions = Object.fromEntries(rows.map((r) => [r.project_id, permissionsOf(r.group_name)]));
    res.json({ ...publicUser(req.user), group, active: true, permissions, ...(rows.length ? { projectPermissions } : {}) });
  });

  return router;
}

module.exports = authRoutes;
