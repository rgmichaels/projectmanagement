const express = require('express');
const cases = require('../data/testCases');
const metadata = require('../testCaseMetadata');
const check = require('../testCaseValidation');
const { assertCan, loadProject, loadIssue, assertWritable, actorFrom } = require('./guards');

module.exports = function testCaseRoutes(db) {
  const router = express.Router();
  router.get('/test-case-metadata', (req, res) => res.json(metadata));
  router.get('/projects/:id/test-cases', (req, res) => {
    const p = loadProject(db, check.integer(req.params.id));
    res.json(cases.listCases(db, p.id, req.query));
  });
  router.post('/projects/:id/test-cases', (req, res) => {
    assertCan(req.user, 'write');
    const p = loadProject(db, check.integer(req.params.id));
    assertWritable(p);
    res.status(201).json(cases.createCase(db, p.id, req.body, actorFrom(req)));
  });
  router.get('/test-cases/:id', (req, res) => res.json(cases.caseDetail(db, check.integer(req.params.id))));
  router.patch('/test-cases/:id', (req, res) => {
    assertCan(req.user, 'write');
    res.json(cases.updateCase(db, check.integer(req.params.id), req.body));
  });
  router.get('/issues/:id/test-cases', (req, res) => {
    const issue = loadIssue(db, check.integer(req.params.id));
    res.json(cases.listIssueCases(db, issue.id));
  });
  router.post('/issues/:id/test-cases', (req, res) => {
    assertCan(req.user, 'write');
    const issue = loadIssue(db, check.integer(req.params.id));
    res.status(201).json(cases.addCases(db, issue.id, req.body, actorFrom(req)));
  });
  router.delete('/issues/:id/test-cases/:caseId', (req, res) => {
    assertCan(req.user, 'write');
    const issue = loadIssue(db, check.integer(req.params.id));
    cases.removeCase(db, issue.id, check.integer(req.params.caseId), actorFrom(req));
    res.status(204).end();
  });
  router.get('/issues/:id/test-cases/:caseId/executions', (req, res) => {
    const issue = loadIssue(db, check.integer(req.params.id));
    res.json(cases.listExecutions(db, issue.id, check.integer(req.params.caseId), req.query));
  });
  router.post('/issues/:id/test-cases/:caseId/executions', (req, res) => {
    assertCan(req.user, 'write');
    const issue = loadIssue(db, check.integer(req.params.id));
    res.status(201).json(cases.recordExecution(db, issue.id, check.integer(req.params.caseId), req.body, actorFrom(req)));
  });
  return router;
};
