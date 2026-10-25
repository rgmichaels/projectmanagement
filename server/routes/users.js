// Users and permission groups (docs/specs/permission-groups.md). The user
// list (with groups) and the group names are readable by every signed-in
// user; changing a user's group needs `manage-users`. Group names come only
// from server/groups.js. Routes validate input and call the data layer only.
const express = require('express');
const users = require('../data/users');
const { groupNames, isValidGroup, managerGroups } = require('../groups');
const { ValidationError } = require('../validation');
const { assertCan } = require('./guards');

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function userRoutes(db) {
  const router = express.Router();

  // Also used by the assignee dropdown.
  router.get('/users', (req, res) => res.json(users.listUsers(db)));

  router.get('/groups', (req, res) => res.json(groupNames()));

  // Body { group }; any other field is ignored. The change applies to the
  // user's next request, open sessions included. Not recorded in history.
  router.patch('/users/:id', (req, res) => {
    assertCan(req.user, 'manage-users');
    const id = parseId(req.params.id);
    const user = id && users.getUser(db, id);
    if (!user) throw new ValidationError('User not found.', 404);
    const group = (req.body || {}).group;
    if (!isValidGroup(group)) throw new ValidationError('Unknown group.');
    const managers = managerGroups();
    if (managers.includes(user.group) && !managers.includes(group) && users.countAdmins(db) <= 1) {
      throw new ValidationError(`There must be at least one ${managers.join(' or ')}.`, 409);
    }
    res.json(users.setUserGroup(db, user.id, group));
  });

  return router;
}

module.exports = userRoutes;
