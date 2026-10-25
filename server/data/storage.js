// Attachment bytes: the only module that touches the file system for them.
// Everything else stores and passes around the opaque `key` this returns, so
// replacing local disk with another backend (file share, object store,
// database BLOB) means rewriting only these four functions:
//   put(streamOrBuffer) -> Promise<{ key, size }>
//   open(key)           -> readable stream (throws a 404 error if missing)
//   remove(key)         -> Promise<void> (no error if already missing)
//   exists(key)         -> boolean
// Keys are random hex chosen here, never derived from user input, and files
// live at <root>/<key>: data/files/ under the repo root, or FILES_DIR if set
// (the tests point it at a scratch directory). A stream that errors part-way
// (for example the size limit) leaves nothing behind.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DEFAULT_ROOT = path.join(__dirname, '..', '..', 'data', 'files');
const KEY_PATTERN = /^[0-9a-f]{32}$/;

const root = () => process.env.FILES_DIR || DEFAULT_ROOT;

function ensureRoot() {
  fs.mkdirSync(root(), { recursive: true });
  return root();
}

// The path of a key, or null for anything that is not a key this module made
// (so no input can name a path outside the root).
function pathOf(key) {
  return typeof key === 'string' && KEY_PATTERN.test(key) ? path.join(root(), key) : null;
}

function notFound() {
  const err = new Error('Attachment not found.');
  err.status = 404;
  err.code = 'ENOENT';
  return err;
}

// Writes to a temporary name in the root and renames it into place once the
// whole stream has arrived; on any error the temporary file is removed and
// the error is passed on.
async function put(source) {
  const dir = ensureRoot();
  const key = crypto.randomBytes(16).toString('hex');
  const tmp = path.join(dir, `.tmp-${key}`);
  const input = Buffer.isBuffer(source) ? Readable.from([source]) : source;
  const out = fs.createWriteStream(tmp, { flags: 'wx' });
  try {
    await pipeline(input, out);
    await fs.promises.rename(tmp, path.join(dir, key));
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
  return { key, size: out.bytesWritten };
}

function open(key) {
  const file = pathOf(key);
  if (!file || !fs.existsSync(file)) throw notFound();
  return fs.createReadStream(file);
}

async function remove(key) {
  const file = pathOf(key);
  if (file) await fs.promises.rm(file, { force: true });
}

function exists(key) {
  const file = pathOf(key);
  return Boolean(file) && fs.existsSync(file);
}

// The directory exists from start-up on, not only after the first upload.
ensureRoot();

module.exports = { put, open, remove, exists };
