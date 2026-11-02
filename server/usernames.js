// The sign-in username rules (docs/specs/user-admin.md AC 3): 1 to 30
// letters, digits, ".", "_" or "-"; unique case-insensitively (enforced by
// the idx_users_username index and server/data/users.js usernameTaken).
// Used by the Users routes and by the migration in server/db.js.

const USERNAME_MAX = 30;
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,30}$/;
const FALLBACK = 'user';

function isValidUsername(username) {
  return typeof username === 'string' && USERNAME_PATTERN.test(username);
}

// The username derived from a display name: its first word, lower-cased
// (`Alex Morgan` -> `alex`), reduced to the allowed characters (accents are
// dropped, `Émile` -> `emile`; nothing left -> `user`), then made unique
// against `taken` (a Set of lower-cased usernames) with 2, 3, ... The result
// always satisfies isValidUsername and is added to `taken`.
function deriveUsername(name, taken) {
  const word = String(name).trim().split(/\s+/)[0] || '';
  const base = word.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, USERNAME_MAX) || FALLBACK;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) {
    const suffix = String(n);
    candidate = base.slice(0, USERNAME_MAX - suffix.length) + suffix;
  }
  taken.add(candidate);
  return candidate;
}

module.exports = { USERNAME_MAX, isValidUsername, deriveUsername };
