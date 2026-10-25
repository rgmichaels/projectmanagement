// Identity: the only place that knows how a request is tied to a user.
// THIS IS NOT SECURE, ON PURPOSE (docs/specs/username-login.md): there is no
// password; anyone can sign in as any seeded user.
//
// A session is a row in `sessions` (server/data/sessions.js) whose random
// token is sent as the HttpOnly cookie `pm_session`. Everything outside this
// file sees only `req.user = { id, name, username, group, permissions }`. To move to SSO, replace
// how `authenticate` produces req.user and the signIn/signOut steps; routes,
// data access and the UI (apart from the sign-in page) stay as they are.
// The group and its permissions (server/groups.js) are read from the user row
// on every request, so a group change applies without signing in again.
const crypto = require('node:crypto');
const path = require('node:path');
const sessions = require('./data/sessions');
const { permissionsOf } = require('./groups');
const { safeNext, loginUrl } = require('../public/js/redirect');

const COOKIE_NAME = 'pm_session';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000; // signed out after 12 hours idle
const TOUCH_INTERVAL_MS = 60 * 1000; // refresh last_seen_at at most once a minute

// Paths served without sign-in (besides the public auth API routes).
const PUBLIC_PAGE = '/login.html';
const PUBLIC_PREFIXES = ['/css/', '/js/'];
const PUBLIC_FILES = new Set([PUBLIC_PAGE, '/favicon.ico']);

// Reads one cookie from the Cookie header; undefined when absent or not
// decodable.
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// A session cookie: no Max-Age or Expires, so the browser drops it on close.
// No Secure flag: the POC runs on plain http://localhost.
function setSessionCookie(res, token) {
  res.append('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/`);
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// The live session for this request's cookie, or null. Unknown, malformed,
// expired and user-less sessions count as absent; the stale row is removed.
function resolveSession(db, req) {
  const token = readCookie(req, COOKIE_NAME);
  if (token === undefined) return { present: false, session: null };
  if (!TOKEN_PATTERN.test(token)) return { present: true, session: null };
  const session = sessions.getSession(db, token);
  if (!session) return { present: true, session: null };
  const idle = Date.now() - Date.parse(session.last_seen_at);
  if (session.uid === null || !(idle <= IDLE_LIMIT_MS)) {
    sessions.deleteSession(db, token);
    return { present: true, session: null };
  }
  if (idle >= TOUCH_INTERVAL_MS) sessions.touchSession(db, token);
  return { present: true, session };
}

// Middleware: sets req.user = { id, name, username, group, permissions } for
// a live session (undefined otherwise) and clears a cookie that no longer works.
function authenticate(db) {
  return (req, res, next) => {
    const { present, session } = resolveSession(db, req);
    req.user = session
      ? {
          id: session.uid,
          name: session.user_name,
          username: session.username,
          group: session.user_group,
          permissions: permissionsOf(session.user_group),
        }
      : undefined;
    if (present && !session) clearSessionCookie(res);
    next();
  };
}

// Middleware: 401 for API requests without a signed-in user.
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  next();
}

const isPublicPath = (p) => PUBLIC_FILES.has(p) || PUBLIC_PREFIXES.some((prefix) => p.startsWith(prefix));

// Middleware for everything outside /api, placed before express.static.
// Signed out: pages redirect to the sign-in page (with `next`), except the
// public files. Signed in: the sign-in page redirects to `/`, and pages are
// not cached so Back after sign-out asks the server again.
function pageGate(req, res, next) {
  let p;
  try {
    p = path.posix.normalize(decodeURIComponent(req.path)).toLowerCase();
  } catch {
    p = req.path.toLowerCase();
  }
  if (req.user) {
    if (p === PUBLIC_PAGE) return res.redirect(302, '/');
    if (!isPublicPath(p)) res.set('Cache-Control', 'no-store');
    return next();
  }
  if (isPublicPath(p)) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.redirect(302, loginUrl(req.originalUrl));
}

// Starts a session for `user` (replacing this request's current one) and
// sets the cookie. The token never appears in a response body.
function signIn(db, req, res, user) {
  const old = readCookie(req, COOKIE_NAME);
  if (old) sessions.deleteSession(db, old);
  res.removeHeader('Set-Cookie'); // drop a "clear stale cookie" set by authenticate
  const token = crypto.randomBytes(32).toString('hex');
  sessions.createSession(db, token, user.id);
  setSessionCookie(res, token);
}

// Ends this request's session, if any, and clears the cookie.
function signOut(db, req, res) {
  const token = readCookie(req, COOKIE_NAME);
  if (token) sessions.deleteSession(db, token);
  clearSessionCookie(res);
}

module.exports = {
  COOKIE_NAME,
  IDLE_LIMIT_MS,
  authenticate,
  requireUser,
  pageGate,
  signIn,
  signOut,
  safeNext,
  loginUrl,
};
