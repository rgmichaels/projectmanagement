// Work item routes (single item). Routes validate input and call the
// data-access layer only.
const express = require('express');
const projects = require('../data/projects');
const issues = require('../data/issues');
const { isEpicType } = require('../types');
const { checkIssueFields } = require('../validation');
const { loadIssue, assertWritable, actorFrom } = require('./guards');

function issueRoutes(db) {
  const router = express.Router();

  router.get('/issues/:id', (req, res) => {
    res.json(loadIssue(db, req.params.id));
  });

  router.patch('/issues/:id', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    const project = projects.getProject(db, issue.project_id);
    assertWritable(project);
    const changes = checkIssueFields(db, project, req.body || {}, issue);
    // An epic that stops being an epic releases its children.
    const clearChildren =
      changes.type !== undefined && isEpicType(issue.type) && !isEpicType(changes.type);
    res.json(issues.updateIssue(db, issue.id, changes, actorFrom(req), { clearChildren }));
  });

  router.delete('/issues/:id', async (req, res) => {
    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    // Resolves once the item's attachment files have been removed.
    await issues.deleteIssue(db, issue.id, actorFrom(req));
    res.status(204).end();
  });

  return router;
}

module.exports = issueRoutes;
