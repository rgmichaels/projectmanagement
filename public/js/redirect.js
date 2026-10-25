// Where to go after sign-in. Pure functions, loadable in the browser (global
// `redirect`) and from node (module.exports), so the server's page gate, the
// sign-in page and the client's 401 handling all use the same rule.
const redirect = (() => {
  // `next` is honoured only as a same-origin relative path: it starts with a
  // single `/`, not `//`, and has no backslash or control character (browsers
  // turn `/\host` and `/<tab>/host` into `//host`). Anything else gives `/`.
  function safeNext(next) {
    if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return '/';
    if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/';
    return next;
  }

  // The sign-in page URL that returns to `pathAndQuery` afterwards.
  function loginUrl(pathAndQuery) {
    const next = safeNext(pathAndQuery);
    return next === '/' ? '/login.html' : `/login.html?next=${encodeURIComponent(next)}`;
  }

  return { safeNext, loginUrl };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = redirect;
