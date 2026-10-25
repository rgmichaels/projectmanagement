// Project routes. Routes validate input and call the data-access layer only.
const express = require('express');
const projects = require('../data/projects');
const issues = require('../data/issues');
const { isArchivableStatus, defaultProjectStatus } = require('../projectStatuses');
const { defaultStatus } = require('../statuses');
const { defaultType } = require('../types');
const { DEFAULT_PRIORITY } = require('../priorities');
const {
  ValidationError,
  checkProjectName,
  checkProjectKey,
  checkProjectStatus,
  checkIssueFields,
} = require('../validation');
const { assertCan, loadProject, assertWritable, actorFrom } = require('./guards');

function projectRoutes(db) {
  const router = express.Router();

  router.get('/projects', (req, res) => {
    res.json(projects.listProjects(db, { includeArchived: req.query.includeArchived === 'true' }));
  });

  router.post('/projects', (req, res) => {
    assertCan(req.user, 'manage-projects');
    const body = req.body || {};
    const name = checkProjectName(body.name);
    const key = checkProjectKey(body.key);
    const status = body.status === undefined ? defaultProjectStatus() : checkProjectStatus(body.status);
    if (projects.getProjectByKey(db, key)) {
      throw new ValidationError(`Key ${key} is already used by another project.`, 409);
    }
    res.status(201).json(projects.createProject(db, { name, key, status }));
  });

  router.get('/projects/:id', (req, res) => {
    res.json(loadProject(db, req.params.id));
  });

  // Name, status and the archived flag. Archived is allowed only in an
  // archivable status; moving to a non-archivable status unarchives.
  router.patch('/projects/:id', (req, res) => {
    assertCan(req.user, 'manage-projects');
    const project = loadProject(db, req.params.id);
    const body = req.body || {};
    const changes = {};
    if (body.name !== undefined) changes.name = checkProjectName(body.name);
    if (body.status !== undefined) changes.status = checkProjectStatus(body.status);
    if (body.archived !== undefined) {
      if (typeof body.archived !== 'boolean') throw new ValidationError('archived must be true or false.');
      changes.archived = body.archived;
    }
    const finalStatus = changes.status ?? project.status;
    if (changes.archived === true && !isArchivableStatus(finalStatus)) {
      throw new ValidationError(`A project with status ${finalStatus} cannot be archived.`, 409);
    }
    if (!isArchivableStatus(finalStatus)) changes.archived = false;
    res.json(projects.updateProject(db, project.id, changes));
  });

  router.get('/projects/:id/issues', (req, res) => {
    const project = loadProject(db, req.params.id);
    res.json(issues.listIssues(db, project.id));
  });

  router.post('/projects/:id/issues', (req, res) => {
    assertCan(req.user, 'write');
    const project = loadProject(db, req.params.id);
    assertWritable(project);
    const fields = checkIssueFields(db, project, req.body || {});
    const created = issues.createIssue(db, project, {
      type: defaultType(),
      priority: DEFAULT_PRIORITY,
      ...fields,
      status: defaultStatus(),
      reporter_id: req.user.id, // never from the body
    }, actorFrom(req));
    res.status(201).json(created);
  });

  return router;
}

module.exports = projectRoutes;
