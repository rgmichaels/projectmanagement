// Entry point for `npm start`: opens (or creates) data/app.db and serves the app.
const { openDb, DEFAULT_DB_PATH } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;

const db = openDb(dbPath);
// Express 5 passes listen errors (e.g. port in use) to this callback.
createApp(db).listen(PORT, (err) => {
  if (err) {
    const hint = err.code === 'EADDRINUSE' ? ` Port ${PORT} is in use; set PORT to use another, e.g. PORT=3001 npm start.` : '';
    console.error(`Could not start the server: ${err.message}.${hint}`);
    process.exit(1);
  }
  console.log(`Project management POC running at http://localhost:${PORT} (database: ${dbPath})`);
});
