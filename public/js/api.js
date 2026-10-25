// Fetch helpers for the JSON API. Errors carry the server's message.
// A 401 (not signed in, or the session expired) sends the browser to the
// sign-in page and back here afterwards; the call then never settles, so no
// error banner is shown. Failed sign-in attempts are reported normally.
// upload() sends a file as the raw request body (attachments); everything
// else is JSON. Needs js/redirect.js loaded first.
const api = (() => {
  const LOGIN_URL = '/api/auth/login';
  async function request(method, url, body, rawHeaders) {
    const opts = { method, headers: {} };
    if (rawHeaders) {
      opts.headers = rawHeaders;
      opts.body = body;
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 401 && url !== LOGIN_URL) {
      location.replace(redirect.loginUrl(location.pathname + location.search));
      return new Promise(() => {});
    }
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),
    // A File or Blob as the body; the server decides the type from the name.
    upload: (url, file, filename) =>
      request('POST', url, file, {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Filename': encodeURIComponent(filename),
      }),
  };
})();
