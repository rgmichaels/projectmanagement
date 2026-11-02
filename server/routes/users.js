// Users and permission groups (docs/specs/permission-groups.md,
// docs/specs/user-admin.md). The user list (with groups), the group names
// and the permission matrix are readable by every signed-in user; adding,
// editing, deactivating and reactivating users needs `manage-users`. Group
// names come only from server/groups.js. Routes validate input and call the
// data layer only. User changes are not recorded in history.
const express = require('express');
const users = require('../data/users');
const auth = require('../auth');
const { groupNames, defaultGroup, managerGroups, can, matrix } = require('../groups');
const { deriveUsername } = require('../usernames');
const { ValidationError, checkUserFields } = require('../validation');
const { assertCan } = require('./guards');

// The fields PATCH /api/users/:id recognises; anything else is ignored.
const EDITABLE = ['name', 'username', 'group', 'active'];

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const lastAdminError = () => new ValidationError(`There must be at least one ${managerGroups().join(' or ')}.`, 409);
const takenError = () => new ValidationError('That username is already taken.', 409);

function userRoutes(db) {
  const router = express.Router();

  // Active users only (also the assignee dropdown). With manage-users,
  // ?include=inactive lists deactivated users too; otherwise the flag is ignored.
  router.get('/users', (req, res) => {
    const includeInactive = req.query.include === 'inactive' && can(req.user.group, 'manage-users');
    const list = users.listUsers(db, { includeInactive });
    if (req.query.project !== undefined) {
      const project = require('./guards').loadProject(db, req.query.project);
      const rows = db.prepare('SELECT user_id, group_name FROM project_permissions WHERE project_id = ?').all(project.id);
      const assigned = new Map(rows.map((r) => [r.user_id, r.group_name]));
      return res.json(list.map((u) => ({ ...u, defaultGroup: u.group, group: assigned.get(u.id) ?? u.group, inherited: !assigned.has(u.id) })));
    }
    res.json(list);
  });

  router.get('/groups', (req, res) => res.json(groupNames()));

  // The read-only "What each group can do" matrix, in server/groups.js order.
  router.get('/groups/permissions', (req, res) => res.json(matrix()));

  // Body { name, username?, group? }. A blank username is derived from the
  // name; the group defaults to the default group. The user can sign in at once.
  router.post('/users', (req, res) => {
    assertCan(req.user, 'manage-users');
    const fields = checkUserFields(req.body || {}, true);
    const user = db.transaction(() => {
      if (fields.username === undefined) fields.username = deriveUsername(fields.name, users.takenUsernames(db));
      else if (users.usernameTaken(db, fields.username)) throw takenError();
      return users.createUser(db, { group: defaultGroup(), ...fields });
    })();
    res.status(201).json(user);
  });

  // Body: any of { name, username, group, active }; other fields are ignored
  // and only present fields change. A group change applies to the user's next
  // request, open sessions included. Deactivating signs the user out
  // everywhere; their work, assignments and history are untouched.
  router.patch('/users/:id', (req, res) => {
    assertCan(req.user, 'manage-users');
    const id = parseId(req.params.id);
    const user = id && users.getUser(db, id);
    if (!user) throw new ValidationError('User not found.', 404);
    const body = req.body || {};
    if (body.project_id !== undefined) {
      const project = require('./guards').loadProject(db, body.project_id);
      if (Object.keys(body).some((key) => !['project_id', 'group'].includes(key))) throw new ValidationError('Project permission changes only accept group and project_id.');
      if (body.group === null) {
        db.prepare('DELETE FROM project_permissions WHERE project_id = ? AND user_id = ?').run(project.id, user.id);
      } else {
        const fields = checkUserFields({ group: body.group }, false);
        if (fields.group === undefined) throw new ValidationError('Unknown group.');
        db.prepare('INSERT INTO project_permissions (project_id, user_id, group_name) VALUES (?, ?, ?) ON CONFLICT(project_id, user_id) DO UPDATE SET group_name = excluded.group_name').run(project.id, user.id, fields.group);
      }
      const assigned = db.prepare('SELECT group_name FROM project_permissions WHERE project_id = ? AND user_id = ?').get(project.id, user.id);
      return res.json({ ...user, defaultGroup: user.group, group: assigned?.group_name ?? user.group, inherited: !assigned });
    }
    if (!EDITABLE.some((field) => body[field] !== undefined)) throw new ValidationError('Nothing to change.');
    const fields = checkUserFields(body, false);

    if (fields.active === false && user.id === req.user.id) {
      throw new ValidationError('You cannot deactivate yourself.', 409);
    }
    // An active user in a manager group who would leave it, or be
    // deactivated, must not be the last active one.
    const managers = managerGroups();
    const staysManager = managers.includes(fields.group ?? user.group) && (fields.active ?? user.active);
    if (user.active && managers.includes(user.group) && !staysManager && users.countAdmins(db) <= 1) {
      throw lastAdminError();
    }
    if (fields.username !== undefined && users.usernameTaken(db, fields.username, user.id)) throw takenError();

    const updated = db.transaction(() => {
      const result = users.updateUser(db, user.id, fields);
      if (user.active && fields.active === false) auth.signOutUser(db, user.id);
      return result;
    })();
    res.json(updated);
  });

  return router;
}

module.exports = userRoutes;
