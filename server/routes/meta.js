// Read-only lists the client needs: the single-source lists for
// statuses (and which one is terminal), types, priorities, resolutions,
// project statuses, the fields that appear in work item history and the
// link relationships, the allowed attachment types and limits, the sprint
// states and the sprint event kinds.
const express = require('express');
const { STATUSES, terminalStatus } = require('../statuses');
const { RESOLUTIONS } = require('../resolutions');
const { TYPES } = require('../types');
const { PRIORITIES, DEFAULT_PRIORITY } = require('../priorities');
const { PROJECT_STATUSES } = require('../projectStatuses');
const { publicFields } = require('../historyFields');
const { linkOptions } = require('../linkTypes');
const { publicTypes } = require('../attachmentTypes');
const { publicSprintStates } = require('../sprintStates');
const { publicSprintEventKinds } = require('../sprintEvents');

function metaRoutes(db) {
  const router = express.Router();
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
  // Sprint states (with the initial, active and final flags) and sprint
  // event kinds and tracked fields, so the client hard-codes none.
  router.get('/sprint-states', (req, res) => res.json(publicSprintStates()));
  router.get('/sprint-event-kinds', (req, res) => res.json(publicSprintEventKinds()));
  return router;
}

module.exports = metaRoutes;
