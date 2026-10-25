// Work item history routes: read-only. History is written by the data-access
// layer as a side effect of work item writes, so there is no endpoint to add,
// edit or delete entries (other methods fall through to the API's 404).
// Readable on archived projects (no assertWritable).
const express = require('express');
const history = require('../data/history');
const { isHistoryField } = require('../historyFields');
const { ValidationError } = require('../validation');
const { loadIssue } = require('./guards');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// A positive integer query value, or null when absent; 400 otherwise.
function positiveInt(raw, name) {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new ValidationError(`${name} must be a positive integer.`);
  }
  return Number(raw);
}

function historyRoutes(db) {
  const router = express.Router();

  router.get('/issues/:id/history', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    const limit = Math.min(positiveInt(req.query.limit, 'limit') ?? DEFAULT_LIMIT, MAX_LIMIT);
    const before = positiveInt(req.query.before, 'before');
    let field = null;
    if (req.query.field !== undefined) {
      if (typeof req.query.field !== 'string' || !isHistoryField(req.query.field)) {
        throw new ValidationError(`Unknown field: ${req.query.field}`);
      }
      field = req.query.field;
    }
    res.json(history.listHistory(db, issue.id, { limit, before, field }));
  });

  return router;
}

module.exports = historyRoutes;
