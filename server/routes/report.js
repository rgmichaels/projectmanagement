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

// Three local days (a Monday's Fri-Sun window) plus an hour of DST change
// and slack (AC 23, Amendment 1).
const MAX_SPAN_MS = 76 * 60 * 60 * 1000;
const MAX_DAYS = 3;
const DAY_MS = 86400000;
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
function checkDay(raw, name) {
  const m = typeof raw === 'string' ? DAY_PATTERN.exec(raw) : null;
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    throw new ValidationError(`${name} must be a date as YYYY-MM-DD.`);
  }
  return raw;
}

// The window's first and last local days (AC 22, 23): either `day` alone
// (the original form, one day) or `from_day` and `to_day` together, in order
// and covering at most MAX_DAYS calendar days.
function checkDays(q) {
  const hasDay = q.day !== undefined;
  const hasFrom = q.from_day !== undefined;
  const hasTo = q.to_day !== undefined;
  if (hasDay) {
    if (hasFrom || hasTo) throw new ValidationError('Send either day, or from_day and to_day, not both.');
    const day = checkDay(q.day, 'day');
    return { fromDay: day, toDay: day };
  }
  if (!hasFrom || !hasTo) throw new ValidationError('from_day and to_day are both required.');
  const fromDay = checkDay(q.from_day, 'from_day');
  const toDay = checkDay(q.to_day, 'to_day');
  const days = (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS;
  if (days < 0) throw new ValidationError('from_day must not be after to_day.');
  if (days > MAX_DAYS - 1) throw new ValidationError(`from_day to to_day must cover at most ${MAX_DAYS} days.`);
  return { fromDay, toDay };
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
    if (to - from > MAX_SPAN_MS) throw new ValidationError('The range from to to must be at most 76 hours.');
    const { fromDay, toDay } = checkDays(q);
    res.json(report.activityFor(db, project.id, userId, new Date(from).toISOString(), new Date(to).toISOString(), fromDay, toDay));
  });

  return router;
}

module.exports = reportRoutes;
