// Attachment routes (files and pasted images). Routes validate input and call
// the data-access layer (server/data/attachments.js) and the storage module
// (server/data/storage.js) only; they hold no SQL and never touch the disk.
// Uploads are the raw request body (no multipart), with the URL-encoded file
// name in X-Filename. The uploader and history actor are always req.user.
// Allowed types and limits come from server/attachmentTypes.js. Mounted
// before the JSON body parser, so upload bodies are streamed, never buffered.
const express = require('express');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const projects = require('../data/projects');
const attachments = require('../data/attachments');
const storage = require('../data/storage');
const {
  MAX_FILE_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  typeForFilename,
  isInlineMime,
  signatureLength,
  matchesSignature,
} = require('../attachmentTypes');
const { ValidationError, checkFilename } = require('../validation');
const { loadIssue, loadAttachment, assertWritable, assertOwnsAttachment, actorFrom } = require('./guards');

const TOO_LARGE = 'File is too large (max 10 MB).';
const NOT_ALLOWED = 'That file type is not allowed.';
const tooLarge = () => new ValidationError(TOO_LARGE, 413);

// The API shape of an attachment (the storage key stays on the server).
function toPublic(row) {
  const { storage_key: _key, ...rest } = row;
  return { ...rest, inline: isInlineMime(row.mime_type) };
}

// A pass-through stream that enforces, as the bytes arrive: the size limit
// (413 as soon as it is passed), the signature of inline types (415, checked
// on the first bytes before anything is passed on) and a non-empty body (400).
function uploadGuard(type) {
  const need = signatureLength(type);
  let total = 0;
  let head = need ? Buffer.alloc(0) : null; // held back until the signature is checked
  const checkHead = () => {
    if (!matchesSignature(type, head)) throw new ValidationError(NOT_ALLOWED, 415);
    const out = head;
    head = null;
    return out;
  };
  return new Transform({
    transform(chunk, _enc, done) {
      total += chunk.length;
      if (total > MAX_FILE_BYTES) return done(tooLarge());
      try {
        if (head === null) return done(null, chunk);
        head = Buffer.concat([head, chunk]);
        return done(null, head.length >= need ? checkHead() : undefined);
      } catch (err) {
        return done(err);
      }
    },
    flush(done) {
      if (total === 0) return done(new ValidationError('File is empty.'));
      try {
        return done(null, head === null ? undefined : checkHead());
      } catch (err) {
        return done(err);
      }
    },
  });
}

// Streams stored bytes to the response with safe headers.
async function sendFile(res, row, disposition) {
  const stream = storage.open(row.storage_key); // 404 if the bytes are gone
  const name = encodeURIComponent(row.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set({
    'Content-Type': row.mime_type,
    'Content-Length': String(row.size_bytes),
    'Content-Disposition': `${disposition}; filename*=UTF-8''${name}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, no-cache',
  });
  await pipeline(stream, res);
}

function attachmentRoutes(db) {
  const router = express.Router();

  router.get('/issues/:id/attachments', (req, res) => {
    const issue = loadIssue(db, req.params.id);
    res.json(attachments.listAttachments(db, issue.id).map(toPublic));
  });

  // Checks run in this order: work item (404), archived (409), file name
  // (400), type (415), count (409), then while streaming size (413),
  // signature (415) and empty (400). A rejected upload stores nothing.
  router.post('/issues/:id/attachments', async (req, res) => {
    const issue = loadIssue(db, req.params.id);
    assertWritable(projects.getProject(db, issue.project_id));
    const filename = checkFilename(req.get('X-Filename'));
    const type = typeForFilename(filename);
    if (!type) throw new ValidationError(NOT_ALLOWED, 415);
    const full = () => new ValidationError(`This work item already has ${MAX_ATTACHMENTS_PER_ITEM} attachments.`, 409);
    if (attachments.countAttachments(db, issue.id) >= MAX_ATTACHMENTS_PER_ITEM) throw full();
    if (Number(req.get('Content-Length')) > MAX_FILE_BYTES) throw tooLarge();

    const guard = uploadGuard(type);
    req.pipe(guard);
    let stored;
    try {
      stored = await storage.put(guard);
    } catch (err) {
      // Stop feeding the guard; the rest of the body is discarded.
      req.unpipe(guard);
      req.resume();
      throw err;
    }

    let row;
    try {
      row = attachments.addAttachment(
        db,
        { issueId: issue.id, storageKey: stored.key, filename, mimeType: type.mime, sizeBytes: stored.size },
        actorFrom(req),
        { limit: MAX_ATTACHMENTS_PER_ITEM }
      );
    } catch (err) {
      await storage.remove(stored.key); // no orphan when the insert fails
      throw err;
    }
    if (!row) {
      await storage.remove(stored.key);
      throw full();
    }
    res.status(201).json(toPublic(row));
  });

  // One attachment's details (used to tell a removed image from another work
  // item's when rendering image tokens).
  router.get('/attachments/:id', (req, res) => {
    res.json(toPublic(loadAttachment(db, req.params.id)));
  });

  router.get('/attachments/:id/download', async (req, res) => {
    await sendFile(res, loadAttachment(db, req.params.id), 'attachment');
  });

  router.get('/attachments/:id/preview', async (req, res) => {
    const row = loadAttachment(db, req.params.id);
    if (!isInlineMime(row.mime_type)) throw new ValidationError('This file type cannot be previewed.', 415);
    await sendFile(res, row, 'inline');
  });

  // Order: not found (404), not the uploader (403), archived (409).
  router.delete('/attachments/:id', async (req, res) => {
    const row = loadAttachment(db, req.params.id);
    assertOwnsAttachment(req.user, row);
    assertWritable(projects.getProject(db, loadIssue(db, row.issue_id).project_id));
    const deleted = attachments.deleteAttachment(db, row.id, actorFrom(req));
    if (deleted) {
      try {
        await storage.remove(deleted.storage_key);
      } catch (err) {
        // The row is gone; a file left behind is logged, not an error.
        console.error(`Could not remove attachment file ${deleted.storage_key}: ${err.message}`);
      }
    }
    res.status(204).end();
  });

  return router;
}

module.exports = attachmentRoutes;
