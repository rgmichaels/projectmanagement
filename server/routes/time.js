// Time entry routes (docs/specs/time-tracking.md AC 1-12). Routes validate
// input and call the data-access layer only. Write routes check, in this
// order: group (403), record exists (404), ownership (403, edit and delete),
// archived (409), then validation (400, the epic refusal included). Reading
// works for every signed-in user and on archived projects. The user is always
// the signed-in one (req.user); any user field in the body is ignored. Time
// entries are not recorded in work item history (spec Decision 4), and items
// in a completed sprint still take time (AC 9).
const express = require('express');
const projects = require('../data/projects');
const issues = require('../data/issues');
const timeEntries = require('../data/timeEntries');
const { isEpicType } = require('../types');
const { checkTimeEntry } = require('../timeValidation');
const { ValidationError } = require('../validation');
const { assertCan, loadIssue, loadTimeEntry, assertWritable, assertOwnsTimeEntry } = require('./guards');

const LOG_TIME = 'log time';

function timeRoutes(db) {
  const router = express.Router();

  // The project of a time entry, via its work item.
  const projectOfEntry = (entry) => projects.getProject(db, issues.getIssue(db, entry.issue_id).project_id);

  router.get('/issues/:id/time', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    res.json({
      entries: timeEntries.listForIssue(db, issue.id),
      total_hours: timeEntries.toHours(timeEntries.totalMinutes(db, issue.id)),
    });
  });

  router.post('/issues/:id/time', (req, res) => {
    assertCan(req.user, 'write', null, LOG_TIME);
    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    if (isEpicType(issue.type)) throw new ValidationError('Time cannot be logged on an epic.');
    const fields = checkTimeEntry(req.body || {}, { creating: true });
    res.status(201).json(timeEntries.createEntry(db, issue.id, { id: req.user.id, name: req.user.name }, fields));
  });

  router.patch('/time/:id', (req, res) => {
    assertCan(req.user, 'write', null, LOG_TIME);
    const entry = loadTimeEntry(db, req.params.id);
    assertOwnsTimeEntry(req.user, entry);
    assertWritable(projectOfEntry(entry));
    // user_id and issue_id in the body are ignored: they cannot change.
    const changes = checkTimeEntry(req.body || {}, { creating: false });
    res.json(timeEntries.updateEntry(db, entry.id, changes));
  });

  router.delete('/time/:id', (req, res) => {
    assertCan(req.user, 'write', null, LOG_TIME);
    const entry = loadTimeEntry(db, req.params.id);
    assertOwnsTimeEntry(req.user, entry);
    assertWritable(projectOfEntry(entry));
    timeEntries.deleteEntry(db, entry.id);
    res.status(204).end();
  });

  return router;
}

module.exports = timeRoutes;
