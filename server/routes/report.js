// The daily report (docs/specs/daily-report.md AC 22, 23): the Yesterday
// activity of one person in one project. Read-only, so no assertCan: any
// signed-in user who can see the project may call it, archived projects
// included (project scope resolves from /projects/:id/ in
// server/projectPermissions.js). Routes validate input and call the data
// layer only; nothing here writes or records history.
const express = require('express');
const report = require('../data/report');
const users = require('../data/users');
const { ValidationError } = require('../validation');
const { loadProject } = require('./guards');

// A DST-length day plus slack (AC 23).
const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// A positive integer query value for an existing user.
function checkUser(db, raw) {
  const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
  if (!id || !Number.isSafeInteger(id) || !users.getUser(db, id)) {
    throw new ValidationError('user must be the id of an existing user.');
  }
  return id;
}

// An ISO 8601 instant with a time zone, as the stored UTC text (toISOString)
// so it compares with created_at as text.
function checkInstant(raw, name) {
  const ms = typeof raw === 'string' && INSTANT_PATTERN.test(raw) ? Date.parse(raw) : NaN;
  if (Number.isNaN(ms)) throw new ValidationError(`${name} must be an ISO date and time.`);
  return ms;
}

// A real calendar date as YYYY-MM-DD.
function checkDay(raw) {
  const m = typeof raw === 'string' ? DAY_PATTERN.exec(raw) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new ValidationError('day must be a date as YYYY-MM-DD.');
  }
  return raw;
}

function reportRoutes(db) {
  const router = express.Router();

  router.get('/projects/:id/report', (req, res) => {
    const project = loadProject(db, req.params.id);
    const q = req.query;
    const userId = checkUser(db, q.user);
    const from = checkInstant(q.from, 'from');
    const to = checkInstant(q.to, 'to');
    if (!(from < to)) throw new ValidationError('from must be before to.');
    if (to - from > MAX_SPAN_MS) throw new ValidationError('The range from to to must be at most 48 hours.');
    const day = checkDay(q.day);
    res.json(report.activityFor(db, project.id, userId, new Date(from).toISOString(), new Date(to).toISOString(), day));
  });

  return router;
}

module.exports = reportRoutes;
