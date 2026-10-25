// Sign-in page: pick a seeded user, sign in, go back to `next` (if safe).
(() => {
  const els = {
    form: document.getElementById('login-form'),
    list: document.getElementById('user-list'),
    error: document.getElementById('login-error'),
    submit: document.getElementById('login-submit'),
  };
  const next = redirect.safeNext(new URLSearchParams(location.search).get('next'));

  function option(user, index) {
    const input = document.createElement('input');
    Object.assign(input, { type: 'radio', name: 'username', value: user.username, checked: index === 0 });
    const label = document.createElement('label');
    label.className = 'user-option';
    const name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = user.name;
    const username = document.createElement('span');
    username.className = 'user-username';
    username.textContent = user.username;
    label.append(input, name, username);
    return label;
  }

  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const chosen = els.form.querySelector('input[name="username"]:checked');
    const username = chosen ? chosen.value : '';
    els.error.textContent = '';
    if (!username) {
      els.error.textContent = 'Choose a username.';
      return;
    }
    els.submit.disabled = true;
    try {
      await api.post('/api/auth/login', { username });
      location.replace(next);
    } catch (err) {
      els.error.textContent = `Could not sign in: ${err.message}`;
      els.submit.disabled = false;
    }
  });

  (async () => {
    try {
      const users = await api.get('/api/auth/users');
      if (!users.length) {
        els.error.textContent = 'No users are available to sign in as.';
        return;
      }
      els.list.append(...users.map(option));
      els.submit.disabled = false;
    } catch (err) {
      els.error.textContent = `Could not load the user list: ${err.message}`;
    }
  })();
})();
