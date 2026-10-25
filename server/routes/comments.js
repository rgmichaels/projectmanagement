// Discussion message routes (table and API name: comments). Routes validate
// input and call the data-access layer only. Writes are refused for work
// items in an archived project; reading the thread always works. The author
// is always the signed-in user (req.user); only the author may edit or delete.
const express = require('express');
const projects = require('../data/projects');
const comments = require('../data/comments');
const { checkCommentBody } = require('../validation');
const { assertCan, loadIssue, loadComment, assertWritable, assertOwnsComment } = require('./guards');

function commentRoutes(db) {
  const router = express.Router();

  // The project a comment belongs to, via its work item.
  const projectOfComment = (comment) => projects.getProject(db, loadIssue(db, comment.issue_id).project_id);

  router.get('/issues/:id/comments', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    res.json(comments.listComments(db, issue.id));
  });

  router.post('/issues/:id/comments', (req, res) => {
    assertCan(req.user, 'write');
    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    // Any author_id in the body is ignored.
    const text = checkCommentBody((req.body || {}).body);
    res.status(201).json(comments.createComment(db, issue.id, req.user.id, text));
  });

  // Order: group (403), not found (404), not the author (403), archived (409).
  router.patch('/comments/:id', (req, res) => {
    assertCan(req.user, 'write');
    const comment = loadComment(db, req.params.id);
    assertOwnsComment(req.user, comment);
    assertWritable(projectOfComment(comment));
    const text = checkCommentBody((req.body || {}).body);
    res.json(comments.updateComment(db, comment.id, text));
  });

  router.delete('/comments/:id', (req, res) => {
    assertCan(req.user, 'write');
    const comment = loadComment(db, req.params.id);
    assertOwnsComment(req.user, comment);
    assertWritable(projectOfComment(comment));
    comments.deleteComment(db, comment.id);
    res.status(204).end();
  });

  return router;
}

module.exports = commentRoutes;
