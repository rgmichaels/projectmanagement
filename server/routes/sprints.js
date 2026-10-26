// Sprint routes (docs/specs/sprints-and-backlog.md AC 7-16, 43). Routes
// validate input and call the data-access layer only. Write routes check, in
// this order: group (403, before any record is loaded), record exists (404),
// archived (409), state (409), then field validation (400). Reads (the list,
// the next name and the sprint history) work on archived projects and for
// every signed-in user. State names come from server/sprintStates.js.
const express = require('express');
const projects = require('../data/projects');
const sprints = require('../data/sprints');
const sprintHistory = require('../data/sprintHistory');
const { initialSprintState, activeSprintState, finalSprintState } = require('../sprintStates');
const { ValidationError, checkSprintFields, checkCompletion } = require('../validation');
const { assertCan, loadProject, loadSprint, assertWritable, actorFrom } = require('./guards');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// A positive integer query value, or null when absent; 400 otherwise.
function positiveInt(raw, name) {
  if (raw === undefined) return null;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || Number(raw) < 1) {
    throw new ValidationError(`${name} must be a positive integer.`);
  }
  return Number(raw);
}

function sprintRoutes(db) {
  const router = express.Router();

  // The project of a sprint must be writable.
  const writableProjectOf = (sprint) => assertWritable(projects.getProject(db, sprint.project_id));

  router.get('/projects/:id/sprints', (req, res) => {
    const project = loadProject(db, req.params.id);
    res.json(sprints.listSprints(db, project.id));
  });

  router.get('/projects/:id/sprints/next-name', (req, res) => {
    const project = loadProject(db, req.params.id);
    res.json({ name: sprints.nextName(db, project.id) });
  });

  router.post('/projects/:id/sprints', (req, res) => {
    assertCan(req.user, 'write');
    const project = loadProject(db, req.params.id);
    assertWritable(project);
    const fields = checkSprintFields(req.body || {});
    res.status(201).json(sprints.createSprint(db, project, fields, actorFrom(req)));
  });

  router.patch('/sprints/:id', (req, res) => {
    assertCan(req.user, 'write');
    const sprint = loadSprint(db, req.params.id);
    writableProjectOf(sprint);
    if (sprint.state === finalSprintState()) throw new ValidationError('A completed sprint cannot be edited.', 409);
    const changes = checkSprintFields(req.body || {}, sprint);
    res.json(sprints.updateSprint(db, sprint, changes, actorFrom(req)));
  });

  router.delete('/sprints/:id', (req, res) => {
    assertCan(req.user, 'write');
    const sprint = loadSprint(db, req.params.id);
    writableProjectOf(sprint);
    if (sprint.state !== initialSprintState()) {
      throw new ValidationError(`Only a sprint that is ${initialSprintState()} can be deleted.`, 409);
    }
    sprints.deleteSprint(db, sprint, actorFrom(req));
    res.status(204).end();
  });

  router.post('/sprints/:id/start', (req, res) => {
    assertCan(req.user, 'write');
    const sprint = loadSprint(db, req.params.id);
    writableProjectOf(sprint);
    if (sprint.state !== initialSprintState()) {
      throw new ValidationError(`Only a sprint that is ${initialSprintState()} can be started.`, 409);
    }
    if (sprints.getActiveSprint(db, sprint.project_id)) throw new ValidationError('Complete the active sprint first.', 409);
    res.json(sprints.startSprint(db, sprint, actorFrom(req)));
  });

  router.post('/sprints/:id/complete', (req, res) => {
    assertCan(req.user, 'write');
    const sprint = loadSprint(db, req.params.id);
    writableProjectOf(sprint);
    if (sprint.state !== activeSprintState()) {
      throw new ValidationError(`Only a sprint that is ${activeSprintState()} can be completed.`, 409);
    }
    const options = checkCompletion(db, sprint, req.body || {});
    res.json(sprints.completeSprint(db, sprint, options, actorFrom(req)));
  });

  // The sprint audit log: read-only, newest first, paged like work item history.
  router.get('/projects/:id/sprint-history', (req, res) => {
    const project = loadProject(db, req.params.id);
    const limit = Math.min(positiveInt(req.query.limit, 'limit') ?? DEFAULT_LIMIT, MAX_LIMIT);
    const before = positiveInt(req.query.before, 'before');
    res.json(sprintHistory.listSprintHistory(db, project.id, { limit, before }));
  });

  return router;
}

module.exports = sprintRoutes;
