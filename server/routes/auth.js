// Sign-in routes. Login, logout and the user list are public; `me` needs a
// session. Sessions and cookies are handled only by server/auth.js.
const express = require('express');
const users = require('../data/users');
const auth = require('../auth');
const { ValidationError } = require('../validation');

const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username });

function authRoutes(db) {
  const router = express.Router();

  // An unknown username never creates a user or a session.
  router.post('/auth/login', (req, res) => {
    const user = users.getUserByUsername(db, (req.body || {}).username);
    if (!user) throw new ValidationError('Unknown username.', 401);
    auth.signIn(db, req, res, user);
    res.json(publicUser(user));
  });

  router.post('/auth/logout', (req, res) => {
    auth.signOut(db, req, res);
    res.status(204).end();
  });

  router.get('/auth/users', (req, res) => {
    res.json(users.listLoginUsers(db).map(publicUser));
  });

  // The signed-in user with their group and its permission names; the
  // client hides controls from `permissions` and never from a group name.
  router.get('/auth/me', auth.requireUser, (req, res) => {
    const { group, permissions } = req.user;
    res.json({ ...publicUser(req.user), group, permissions });
  });

  return router;
}

module.exports = authRoutes;
