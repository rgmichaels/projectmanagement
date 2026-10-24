// Data access for discussion messages (table `comments`). All SQL for
// comments lives here. Validation (trimmed 1-2000 chars, author exists,
// archived guard) happens in the routes; these functions assume valid input.

const SELECT = `
  SELECT c.id, c.issue_id, c.author_id, u.name AS author_name, c.body, c.body_format,
         c.created_at, c.updated_at
  FROM comments c
  JOIN users u ON u.id = c.author_id`;

// Newest first; ties (same timestamp) broken by descending id.
function listComments(db, issueId) {
  return db.prepare(`${SELECT} WHERE c.issue_id = ? ORDER BY c.created_at DESC, c.id DESC`).all(issueId);
}

function getComment(db, id) {
  return db.prepare(`${SELECT} WHERE c.id = ?`).get(id);
}

function createComment(db, issueId, authorId, body) {
  const info = db
    .prepare("INSERT INTO comments (issue_id, author_id, body, body_format, created_at) VALUES (?, ?, ?, 'text', ?)")
    .run(issueId, authorId, body, new Date().toISOString());
  return getComment(db, info.lastInsertRowid);
}

// Stores new text and stamps updated_at. A no-op when the text is unchanged,
// so an unchanged save never shows an "edited" marker.
function updateComment(db, id, body) {
  const current = getComment(db, id);
  if (current.body === body) return current;
  db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body, new Date().toISOString(), id);
  return getComment(db, id);
}

function deleteComment(db, id) {
  db.prepare('DELETE FROM comments WHERE id = ?').run(id);
}

module.exports = { listComments, getComment, createComment, updateComment, deleteComment };
