<header class="topbar">
  <a class="brand" href="#">Projects</a>
  <span class="session"><a class="nav-link" href="#">Users</a><span>Dana Reyes</span><button type="button">Sign out</button></span>
</header>
<main class="page">
  <section class="toolbar">
    <h1>Projects</h1>
    <label class="toggle"><input type="checkbox"> Show archived</label>
    <button type="button" class="primary">Create project</button>
  </section>
  <form class="panel" novalidate>
    <h2>Create project</h2>
    <div class="form-row">
      <label>Name <input value="Gemini" maxlength="80"></label>
      <label>Key <input placeholder="PROJ" maxlength="10"></label>
      <label>Status <select><option>Planning</option></select></label>
    </div>
    <p class="error" role="alert">Key is required.</p>
    <div class="actions"><button type="button" class="primary">Create</button><button type="button">Cancel</button></div>
  </form>
  <table class="projects">
    <thead><tr><th>Name</th><th>Key</th><th>Status</th><th></th></tr></thead>
    <tbody>
      <tr><td><a href="#">Apollo</a></td><td>APO</td><td><span class="badge">In Progress</span></td><td class="row-actions"><button type="button">Edit</button><button type="button">Archive</button></td></tr>
      <tr><td><a href="#">Mercury &lt;b&gt;shown literally&lt;/b&gt;</a></td><td>MER</td><td><span class="badge">Planning</span></td><td class="row-actions"><button type="button">Edit</button><button type="button">Archive</button></td></tr>
      <tr class="is-archived"><td><a href="#">Vostok</a> <span class="badge archived">Archived</span></td><td>VOS</td><td><span class="badge">Completed</span></td><td class="row-actions"><button type="button">Unarchive</button></td></tr>
    </tbody>
  </table>
  <p style="margin-top:24px" class="hint">Empty state:</p>
  <div class="empty"><p>No projects yet.</p><button type="button" class="primary">Create project</button></div>
</main>
