// Read-only lists the client needs: users and the single-source lists for
// statuses, types, priorities and project statuses.
const express = require('express');
const users = require('../data/users');
const { STATUSES } = require('../statuses');
const { TYPES } = require('../types');
const { PRIORITIES, DEFAULT_PRIORITY } = require('../priorities');
const { PROJECT_STATUSES } = require('../projectStatuses');

function metaRoutes(db) {
  const router = express.Router();
  router.get('/users', (req, res) => res.json(users.listUsers(db)));
  router.get('/statuses', (req, res) => res.json(STATUSES));
  router.get('/types', (req, res) => res.json(TYPES));
  router.get('/priorities', (req, res) => res.json({ priorities: PRIORITIES, default: DEFAULT_PRIORITY }));
  router.get('/project-statuses', (req, res) => res.json(PROJECT_STATUSES));
  return router;
}

module.exports = metaRoutes;
