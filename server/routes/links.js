// Work item link routes. Routes validate input and call the data-access
// layer only. Writes are refused for work items in an archived project;
// reading links always works. The creator and the history actor are always
// the signed-in user (req.user); nothing in the body names a user.
const express = require('express');
const projects = require('../data/projects');
const links = require('../data/links');
const { getLinkType, DIRECTIONS } = require('../linkTypes');
const { ValidationError } = require('../validation');
const { loadIssue, loadLink, assertWritable, actorFrom } = require('./guards');

// A whole number (JSON number or digit string); null otherwise.
function toInteger(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) ? raw : null;
  if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) return Number(raw);
  return null;
}

function linkRoutes(db) {
  const router = express.Router();

  router.get('/issues/:id/links', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    res.json(links.listLinks(db, issue.id));
  });

  // Body { link_type, direction, target_id }. `outward`: this item is the
  // source ("this blocks target"); `inward`: the target is the source.
  // Checks run in the order of docs/specs/work-item-links.md AC 5.
  router.post('/issues/:id/links', (req, res) => {
    const body = req.body || {};
    const type = typeof body.link_type === 'string' ? getLinkType(body.link_type) : null;
    if (!type) throw new ValidationError(`Unknown link type: ${body.link_type}`);
    const direction = type.symmetric ? 'outward' : body.direction;
    if (!DIRECTIONS.includes(direction)) throw new ValidationError('Direction must be outward or inward.');
    const targetId = toInteger(body.target_id);
    if (targetId === null) throw new ValidationError('target_id must be a work item id.');

    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    const target = loadIssue(db, targetId);
    if (target.id === issue.id) throw new ValidationError('A work item cannot be linked to itself.');
    if (target.project_id !== issue.project_id) throw new ValidationError('Links must be within one project.');

    const [source, dest] = direction === 'outward' ? [issue, target] : [target, issue];
    const id = links.addLink(db, source, dest, type.name, actorFrom(req));
    res.status(201).json(links.listLinks(db, issue.id).find((l) => l.id === id));
  });

  router.delete('/issues/:id/links/:linkId', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    const link = loadLink(db, req.params.linkId, issue.id);
    assertWritable(projects.getProject(db, issue.project_id));
    links.removeLink(db, link.id, actorFrom(req));
    res.status(204).end();
  });

  return router;
}

module.exports = linkRoutes;
