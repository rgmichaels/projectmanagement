// Builds the Express app around an open database. Kept separate from
// index.js so tests can run the app against a temporary database.
const path = require('node:path');
const express = require('express');
const projectRoutes = require('./routes/projects');
const issueRoutes = require('./routes/issues');
const metaRoutes = require('./routes/meta');
const commentRoutes = require('./routes/comments');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', metaRoutes(db), projectRoutes(db), issueRoutes(db), commentRoutes(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Express 5 forwards thrown errors (sync and async) here.
  app.use((err, req, res, next) => {
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
