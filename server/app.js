// Builds the Express app around an open database. Kept separate from
// index.js so tests can run the app against a temporary database.
const path = require('node:path');
const express = require('express');
const projectRoutes = require('./routes/projects');
const issueRoutes = require('./routes/issues');
const metaRoutes = require('./routes/meta');
const commentRoutes = require('./routes/comments');
const historyRoutes = require('./routes/history');
const linkRoutes = require('./routes/links');
const attachmentRoutes = require('./routes/attachments');
const sprintRoutes = require('./routes/sprints');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const auth = require('./auth');

function createApp(db) {
  const app = express();
  // Order matters: identity first, then the page gate before the static
  // files, then the public auth routes, then sign-in for the rest of /api.
  // The JSON body parser for the rest of /api runs after requireUser, so a
  // signed-out request gets 401 whatever its body. Attachment routes come
  // before it: uploads are raw bodies streamed to storage, never parsed.
  app.use(auth.authenticate(db));
  const isApi = (req) => /^\/api(\/|$)/i.test(req.path);
  app.use((req, res, next) => (isApi(req) ? next() : auth.pageGate(req, res, next)));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/auth', express.json());
  app.use('/api', authRoutes(db));
  app.use('/api', auth.requireUser, attachmentRoutes(db), express.json());
  app.use('/api', metaRoutes(db), userRoutes(db), projectRoutes(db), issueRoutes(db), commentRoutes(db), historyRoutes(db), linkRoutes(db), sprintRoutes(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Express 5 forwards thrown errors (sync and async) here.
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      // A failure part-way through streaming a file: nothing left to report.
      console.error(err);
      return res.destroy();
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp };
