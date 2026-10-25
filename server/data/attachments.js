// Data access for attachments (table `attachments`). All attachment SQL lives
// here; the bytes themselves are in server/data/storage.js under
// `storage_key`. Adding and removing a row records an `attachment` history
// change on the work item in the same transaction. Validation (type, size,
// filename, uploader-only delete, archived guard) happens in the route.
const history = require('./history');

const SELECT = `
  SELECT id, issue_id, storage_key, filename, mime_type, size_bytes, uploader_id, uploader_name, created_at
  FROM attachments`;

// Newest first.
function listAttachments(db, issueId) {
  return db.prepare(`${SELECT} WHERE issue_id = ? ORDER BY id DESC`).all(issueId);
}

function getAttachment(db, id) {
  return db.prepare(`${SELECT} WHERE id = ?`).get(id);
}

function countAttachments(db, issueId) {
  return db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE issue_id = ?').get(issueId).n;
}

function listKeysForIssue(db, issueId) {
  return db.prepare('SELECT storage_key FROM attachments WHERE issue_id = ?').all(issueId).map((r) => r.storage_key);
}

// Inserts the row for bytes already stored under `storageKey` and records
// "added attachment <filename>". Returns the new row, or null (writing
// nothing) when the work item already has `limit` attachments; the count is
// checked in the same transaction so two concurrent uploads cannot both pass.
function addAttachment(db, { issueId, storageKey, filename, mimeType, sizeBytes }, actor, { limit = Infinity } = {}) {
  return db.transaction(() => {
    if (countAttachments(db, issueId) >= limit) return null;
    const now = new Date().toISOString();
    const id = db
      .prepare(
        `INSERT INTO attachments (issue_id, storage_key, filename, mime_type, size_bytes, uploader_id, uploader_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(issueId, storageKey, filename, mimeType, sizeBytes, actor.id ?? null, actor.name, now).lastInsertRowid;
    history.recordAttachmentChange(db, issueId, actor, { newText: filename }, now);
    return getAttachment(db, id);
  })();
}

// Deletes the row and records "removed attachment <filename>" (the stored
// display name, so the entry stays readable once the file is gone). Returns
// the deleted row (its storage_key is for the caller to remove), or null.
function deleteAttachment(db, id, actor) {
  return db.transaction(() => {
    const row = getAttachment(db, id);
    if (!row) return null;
    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    history.recordAttachmentChange(db, row.issue_id, actor, { oldText: row.filename });
    return row;
  })();
}

// Deletes every attachment row of a work item that is being deleted, with no
// history (the item's history goes with it), and returns their storage keys.
// Runs in the caller's transaction (deleteIssue); opens none of its own.
function deleteAttachmentsFor(db, issueId) {
  const keys = listKeysForIssue(db, issueId);
  db.prepare('DELETE FROM attachments WHERE issue_id = ?').run(issueId);
  return keys;
}

module.exports = {
  listAttachments,
  getAttachment,
  countAttachments,
  listKeysForIssue,
  addAttachment,
  deleteAttachment,
  deleteAttachmentsFor,
};
