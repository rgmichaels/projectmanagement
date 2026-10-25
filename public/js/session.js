// The signed-in user in the page header: "Signed in as <name> (<group>)",
// a Users link when the user may manage users, and Sign out.
// `session.ready` resolves to { id, name, username, group, permissions } once
// /api/auth/me has answered; pages wait for it before loading anything else.
// `session.can(permission)` tells pages which controls to show: it uses the
// permission names from the server and never compares group names. The server
// checks every write anyway (403). A 401 is sent to the sign-in page by api.js.
const session = (() => {
  const topbar = document.querySelector('.topbar');
  let current = null;

  const can = (permission) => Boolean(current && Array.isArray(current.permissions) && current.permissions.includes(permission));

  async function signOut() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      location.replace('/login.html');
    }
  }

  const ready = api.get('/api/auth/me').then((user) => {
    current = user;
    const name = document.createElement('span');
    name.id = 'signed-in-as';
    name.textContent = `Signed in as ${user.name} (${user.group})`;
    const button = document.createElement('button');
    Object.assign(button, { type: 'button', id: 'sign-out', textContent: 'Sign out' });
    button.addEventListener('click', signOut);
    const box = document.createElement('span');
    box.className = 'session';
    if (can('manage-users')) {
      const users = document.createElement('a');
      Object.assign(users, { id: 'users-link', className: 'nav-link', href: 'users.html', textContent: 'Users' });
      box.append(users);
    }
    box.append(name, button);
    topbar.append(box);
    return user;
  });

  // A page restored from the back/forward cache after sign-out asks the
  // server again (which redirects to sign-in).
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) location.reload();
  });

  return { ready, can };
})();
