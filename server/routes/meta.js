// Read-only lists the client needs: users and the single-source lists for
// statuses (and which one is terminal), types, priorities, resolutions,
// project statuses, the fields that appear in work item history and the
// link relationships, and the allowed attachment types and limits.
const express = require('express');
const users = require('../data/users');
const { STATUSES, terminalStatus } = require('../statuses');
const { RESOLUTIONS } = require('../resolutions');
const { TYPES } = require('../types');
const { PRIORITIES, DEFAULT_PRIORITY } = require('../priorities');
const { PROJECT_STATUSES } = require('../projectStatuses');
const { publicFields } = require('../historyFields');
const { linkOptions } = require('../linkTypes');
const { publicTypes } = require('../attachmentTypes');

function metaRoutes(db) {
  const router = express.Router();
  router.get('/users', (req, res) => res.json(users.listUsers(db)));
  router.get('/statuses', (req, res) => res.json(STATUSES));
  // The client uses this instead of deciding the terminal column itself.
  router.get('/terminal-status', (req, res) => res.json({ status: terminalStatus() }));
  router.get('/resolutions', (req, res) => res.json(RESOLUTIONS));
  router.get('/types', (req, res) => res.json(TYPES));
  router.get('/priorities', (req, res) => res.json({ priorities: PRIORITIES, default: DEFAULT_PRIORITY }));
  router.get('/project-statuses', (req, res) => res.json(PROJECT_STATUSES));
  router.get('/history-fields', (req, res) => res.json(publicFields()));
  router.get('/link-types', (req, res) => res.json(linkOptions()));
  // Allowed attachment types and limits, so the client hard-codes none.
  router.get('/attachment-types', (req, res) => res.json(publicTypes()));
  return router;
}

module.exports = metaRoutes;
