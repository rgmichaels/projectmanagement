# Project permissions

The Users page lets account administrators select a project and assign an Admin, Member, or Viewer group to each user. It also shows the permission matrix from the server. “Use account default” removes the assignment. Archived projects are included.

Assignments are stored in `project_permissions`, keyed by project and user. Existing accounts retain their current group as the default for projects without an assignment. Project Admins can manage that project's settings and work; user administration and creation of projects require the account's permissions. Reads remain available to all signed-in users, including Viewers.

The server resolves project scope from the URL's resource and its database relationships before route permission checks, including attachment uploads. Request bodies and query parameters cannot change that scope. Assignments apply on the next request, including existing sessions. Account-level last-administrator protections remain in effect.
