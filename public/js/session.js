// The signed-in user in the page header: "Signed in as <name>" and Sign out.
// `session.ready` resolves to { id, name, username } once /api/auth/me has
// answered; pages wait for it before loading anything else. A 401 is sent to
// the sign-in page by api.js.
const session = (() => {
  const topbar = document.querySelector('.topbar');

  async function signOut() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      location.replace('/login.html');
    }
  }

  const ready = api.get('/api/auth/me').then((user) => {
    const name = document.createElement('span');
    name.id = 'signed-in-as';
    name.textContent = `Signed in as ${user.name}`;
    const button = document.createElement('button');
    Object.assign(button, { type: 'button', id: 'sign-out', textContent: 'Sign out' });
    button.addEventListener('click', signOut);
    const box = document.createElement('span');
    box.className = 'session';
    box.append(name, button);
    topbar.append(box);
    return user;
  });

  // A page restored from the back/forward cache after sign-out asks the
  // server again (which redirects to sign-in).
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  return { ready };
})();
