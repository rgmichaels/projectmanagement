# New project from the Project dropdown
Status: Draft
Date: 2026-10-28

Owner request: "the Project dropdown at the top of the pages should allow for a 'new' project that takes you to a new project modal."

**Builds on the implemented code and on `docs/specs/global-project-scope.md` (dropdown, states, unsaved-edit confirm), `docs/specs/board-mvp.md` and `docs/specs/permission-groups.md` (project creation and the `manage-projects` permission).** References are written "Scope AC n". Acceptance criteria are numbered from 1. The designer is needed (see Design inputs).

## Problem

Projects can only be created on the Projects list page (`/`): `public/index.html` has an inline "Create project" form (`#create-form`: Name, Key, Status) driven by `public/js/projects.js`. A user working on a board who needs another project must leave the board, go to the list, create it, and click through. On a fresh install the pages show "No active projects." (Scope AC 9c) and the only way out is the link to the Projects page. The owner wants "New project" reachable from the top bar Project dropdown (`public/js/projectScope.js`, `buildSelect`), opening a modal.

## User stories

1. As a user who may create projects, I choose "New project..." in the top bar Project dropdown and a modal opens over the page I am on.
2. As that user, after I create the project I am on the same page (Board, Backlog or Sprints) for the new project.
3. As that user, if I cancel, nothing changes and the dropdown shows my current project again.
4. As that user on a fresh install ("No active projects."), I can create the first project from the top bar without going to the Projects page.
5. As a Viewer (no `manage-projects` permission), I do not see the entry.

## Recommendations (for the owner to confirm)

- **Position:** last entry in the dropdown, after a separator, label `New project...`. A native `<select>` can show a disabled `<option>` of dashes as the separator (or an `<optgroup>` with an empty label); the entry is a normal option with a sentinel value (for example `__new__`) that `parseId` already rejects, so it can never be mistaken for a project id. Last position keeps the project order from the server untouched and keeps the archived-by-URL extra option (Scope AC 3a) next to the real projects, before the separator.
- **Action:** open the create modal **in place** on the current page, not a navigation to `/`. This matches "takes you to a new project modal" and avoids losing the page. The Projects list page keeps its inline form unchanged.
- **Cancel:** modal closes, dropdown reverts to the current project (as Scope AC 14 does for a cancelled switch).
- **Success:** go to the same page for the new project: `<same file>?project=<new id>`, other query parameters dropped (Scope AC 4, 12), remembered project updated (Scope AC 8).
- **Who sees it:** only users with `manage-projects` (`session.can('manage-projects')`, the same check `projects.js` uses; Admin by default per `server/groups.js`). Hidden, not disabled, for everyone else. The server stays the authority: `POST /api/projects` already calls `assertCan(req.user, 'manage-projects')`.

## Acceptance criteria

### The entry

1. On every project-scoped page (`board.html`, `backlog.html`, `sprints.html`), a signed-in user with the `manage-projects` permission sees a last option `New project...` in the Project dropdown, below a visual separator that is not selectable.
2. A user without `manage-projects` (for example a Viewer, or any group that lacks it) sees the dropdown exactly as today: no separator and no `New project...` option. This is decided after `session.ready`, using `session.can('manage-projects')`.
3. The entry is never the selected option on page load, is never written to `localStorage`, and is never treated as a project id (`resolveProject`, `parseId`, `pageUrl` ignore it). Existing project options, their `KEY - name` labels, order and the archived-by-URL extra option are unchanged and still come before the separator.
4. Keyboard: the entry is reachable and selectable with the arrow keys and Enter like any other option (no custom widget).

### Opening the modal

5. Choosing `New project...` opens a modal dialog over the current page without navigating (URL, board contents and scroll position unchanged behind it). The dialog is an app dialog in the same shell as the Edit project dialog on `index.html` (`dialog.app-dialog`, band with title, body, foot), with the title "Create project".
6. The form has exactly the fields of the Projects list create form: Name (text, max 80, required), Key (text, max 10, placeholder `PROJ`, required, uppercased as the user types), Status (select filled from `GET /api/project-statuses`, default selected = the status with `isDefault`, which is `Planning`; order `Planning`, `In Progress`, `Completed`). Buttons: Create (primary) and Cancel. No new fields.
7. Focus moves to the Name field when the dialog opens. Escape and the Cancel button close it.
8. Validation and errors are the existing ones, shown in the dialog (an inline `role="alert"` message, dialog stays open, entered values kept): the server's messages from `POST /api/projects` are shown as returned, for example "Name is required and must be 1-80 characters.", "Key must be 2-10 uppercase letters (A-Z).", and "Key XXX is already used by another project." (409). The client sends `{ name (trimmed), key (trimmed), status }` as `projects.js` does. No new endpoint and no server change.
9. While the request is in flight the Create button is disabled and reads `Creating...`, so a double click creates one project. Cancel is disabled and Escape is ignored until the request ends (owner decision), so the dialog cannot close while a project may still be created.

### Cancel and success

10. Cancel, the Escape key, or any other close without creating (all available only while no create request is in flight, AC 9): the dialog closes, nothing is created, the dropdown is set back to the current project, and focus returns to the dropdown. If the page had no current project (the states of AC 14 and 15), the dropdown returns to its placeholder.
11. Success: the browser goes to the same page file for the new project, `<current file>?project=<new id>` (for example from `backlog.html?project=2&x=1` to `backlog.html?project=7`), via the existing `pageUrl`. The new project id is stored as the remembered project (Scope AC 8). Because `Planning` is not archived, the new project is a live project and appears in the dropdown after the load, selected, with the label `<KEY> - <name>`.
12. After success the new project's board, backlog or sprints page loads empty and working (no items, no sprints), with the sub-navigation carrying the new `?project=` (Scope AC 13).
13. The dialog does not create the project in any state other than the one chosen in Status (default `Planning`). Creating with `In Progress` or `Completed` works as on the Projects list. (A project created as `Completed` is not archived, so it is still selected normally.)

### Interplay with the existing states

14. **No active projects.** On a page showing "No active projects." (Scope AC 9c), which today has no dropdown, the top bar shows the Project dropdown for a user with `manage-projects` containing only the placeholder `Choose a project` and `New project...`. The "Go to the Projects page" link stays. For a user without the permission the page is unchanged (no dropdown). Creating the first project from here lands on `<current file>?project=<new id>`.
15. **Project not found.** On "Project not found." (Scope AC 10) the dropdown lists the projects as today, and for a user with `manage-projects` also shows `New project...`. If there are no projects at all, the dropdown is still built for such a user with the placeholder and the entry. Cancel returns to the placeholder; success behaves as AC 11.
16. **List request failed** (Scope AC 6): the entry is still offered to a user with `manage-projects`; the dialog works independently of the list. Success navigates as AC 11.
17. **Unsaved work item edits** (Scope AC 14, 14a). When `projectScope.guard.isDirty()` is true at the moment `New project...` is chosen, the same "Switch project?" confirm (`SWITCH_CONFIRM`) is shown first. Cancel: nothing opens and the dropdown reverts. OK: edits are discarded (`guard.discard()`) and the create dialog opens. (Note Scope AC 14b: while the work item dialog is open as a modal the top bar is inert, so this is a safety net, as for a normal switch.) With no unsaved edits there is no confirm.
18. A failed create (any error) never changes the current project, URL or remembered id.

### Pages without the dropdown

19. The Projects list page (`index.html`), Users and login have no Project dropdown and gain no `New project...` entry. The Projects list keeps its own "Create project" form (and the empty-state button) unchanged and working.

### Permissions

20. A user who lacks `manage-projects` cannot create a project from the dropdown: the entry is absent (AC 2). If the entry is somehow used and the server returns 403 (permission removed while the page is open), the dialog shows the server's message in the error area and stays open.

## Data model changes

None. No new endpoint, field or table; the dialog calls the existing `POST /api/projects` and `GET /api/project-statuses`.

## Out of scope

- Editing, archiving or deleting a project from the dropdown or the new dialog (Edit stays on the Projects list).
- Replacing or restyling the Projects list page's inline create form, or sharing it as a component beyond what the developer needs to avoid duplicating field logic.
- Extra project fields (description, lead, template, copying items from another project).
- A "Recent projects" or search in the dropdown; listing archived projects.
- Creating a project from any other control (brand link, keyboard shortcut).
- Adding a retired or cancelled project status (still an open owner question in `CLAUDE.md`).
- Server-side changes to project key rules or permissions.

## Open questions

Resolved by the owner: label `New project...`; no auto-suggested key; while the create request is in flight Cancel is disabled and Escape ignored (AC 9, 10); in-flight label `Creating...`; no `aria-invalid` on Key (parity with the Projects list form); a 403 shows the server's message as returned.

## Design inputs (designer needed: one modal and one dropdown entry)

Per `CLAUDE.md` this spec adds a dialog and a control, so the `designer` runs before the developer. Inputs:

- `docs/design/STYLE.md` and `docs/design/sprints-and-project-scope/` (topbar option A, `states.html` T6/T7 for the empty and not-found states).
- Dropdown: how the separator and `New project...` look in a native select (text only; native option styling is limited), and how the entry reads next to the placeholder in the "No active projects." top bar (a dropdown on a page that today shows none).
- Modal: reuse the `app-dialog` shell (band, body, foot) as in the Edit project dialog on `index.html`; Name, Key (uppercase, `PROJ` placeholder), Status; inline error area; Create and Cancel; focus on Name.
- States to mock: default, validation error, duplicate key (409), in flight (Create disabled), opened on the empty "No active projects." page, narrow width.
- The design README should note which behaviour is native-select limited so QA checks against it.

## Implementation notes for the developer

Re-read `public/js/projectScope.js`, `public/js/projects.js`, `public/index.html` (create form, edit dialog) first. Suggested order (after the owner approves and the designer delivers):

1. `public/js/projectScope.js`:
   - Add the sentinel option and separator in `buildSelect` after the project options, only when `session.can('manage-projects')`.
   - In the `change` handler, branch on the sentinel before the `parseId` path: run the dirty confirm (AC 17), open the create dialog, and on close without success set `select.value = currentValue` and refocus.
   - Build the select in the states of AC 14 and 15 (today `buildSelect` is skipped for `source: 'none'`, and for `invalid` or a failed fetch only when `projects.length`). `buildSelect` already tolerates a null `current` (placeholder). In the `none` state it must still insert the select in `.topbar` after `.brand`; the `main` content stays hidden by `showState`.
   - Keep pure helpers pure; if a helper is added (for example `isNewProjectValue(value)`), export it for `node:test`. Only this file reads `?project=` and the storage key (existing source test).
2. Dialog markup: because `index.html` has no dialog for creation and the project-scoped pages do not load `projects.js`, build the dialog from JS in `projectScope.js` (like `confirmDialog` does), or extract a small shared helper. Do not copy the whole file; reuse `api.get('/api/project-statuses')`, `api.post('/api/projects', ...)` and the same uppercase-as-you-type and trimming. Use the design's markup and `app-dialog` classes from the existing stylesheet.
3. Success: `storageSet(STORAGE_KEY, String(created.id))`, then `location.assign(pageUrl(location.pathname, created.id))`.
4. `public/index.html` and `public/js/projects.js`: no change (AC 19).
5. Tests in `tests/projectScope.test.js` (`node:test`): sentinel is not a valid id for `parseId`/`resolveProject`; `pageUrl` for the new id drops other params. API tests need none (existing `POST /api/projects` coverage); confirm a Viewer gets 403 there.
6. `README.md`: one line on "New project..." in the dropdown.
7. QA (scratch database copy, spare port not 3000 or 3001): Admin sees the entry on Board, Backlog, Sprints; Viewer does not; open, Cancel and Escape revert the dropdown; empty name, bad key and duplicate key show server messages and keep the dialog open; success from each page lands on the same page with `?project=<new id>`, new project selected and remembered; fresh database ("No active projects.") shows the dropdown with only the entry and creating works; "Project not found." with the entry; Projects, Users, login pages have no dropdown; double-click Create makes one project; dirty work item then choosing the entry asks the confirm (where reachable).
