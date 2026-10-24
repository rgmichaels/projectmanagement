// Discussion message routes (table and API name: comments). Routes validate
// input and call the data-access layer only. Writes are refused for work
// items in an archived project; reading the thread always works.
const express = require('express');
const projects = require('../data/projects');
const comments = require('../data/comments');
const { checkCommentBody, checkCommentAuthor } = require('../validation');
const { loadIssue, loadComment, assertWritable } = require('./guards');

function commentRoutes(db) {
  const router = express.Router();

  // The project a comment belongs to, via its work item.
  const projectOfComment = (comment) => projects.getProject(db, loadIssue(db, comment.issue_id).project_id);

  router.get('/issues/:id/comments', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    res.json(comments.listComments(db, issue.id));
  });

  router.post('/issues/:id/comments', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    const body = req.body || {};
    const authorId = checkCommentAuthor(db, body.author_id);
    const text = checkCommentBody(body.body);
    res.status(201).json(comments.createComment(db, issue.id, authorId, text));
  });

  router.patch('/comments/:id', (req, res) => {
    const comment = loadComment(db, req.params.id);
    assertWritable(projectOfComment(comment));
    const text = checkCommentBody((req.body || {}).body);
    res.json(comments.updateComment(db, comment.id, text));
  });

  router.delete('/comments/:id', (req, res) => {
    const comment = loadComment(db, req.params.id);
    assertWritable(projectOfComment(comment));
    comments.deleteComment(db, comment.id);
    res.status(204).end();
  });

  return router;
}

module.exports = commentRoutes;
