# Global project scope (main menu project dropdown)
Status: Approved
Date: 2026-10-26

Owner answers recorded 2026-10-26 (see Decisions). Approved by the owner 2026-10-26.

**Builds on the implemented code and on `docs/specs/sprints-and-backlog.md` (read-only reference).** References are written "Sprints AC n". Acceptance criteria are numbered from 1. This is part 1 of 2; part 2 is `docs/specs/sprints-screen.md`, which depends on it. Build this first.

## Problem

Today the current project lives only in the URL: `board.html?project=2`, `backlog.html?project=2` (read in `public/js/board.js` line 29, which also drives the Backlog page). Links are built by hand in `board.js` (`renderHeader`, `backlogUrl`) and `public/js/projects.js`. The header (`.topbar` in each HTML file) shows only the brand "Projects" and a breadcrumb `/ <project name>`. To switch from SFPM (project 2, ~94 items) to project 1 the user must go back to the Projects list and click again. With a third project screen coming (Sprints) this gets worse. The owner wants one project dropdown in the main menu that sets the current project for every project page.

## User stories

1. As a user, I pick a project in a dropdown in the header and the page I am on reloads for that project.
2. As a user, when I click Board, Backlog or Sprints, I stay in the project I picked.
3. As a user, when I open the app without a project in the URL, I land in the project I used last.
4. As a user, an old bookmark `board.html?project=2` still works.
5. As a user, the dropdown lists only live (non-archived) projects; archived ones are reached from the Projects list.
6. As a user, switching project warns me before I lose unsaved edits in an open work item.

## Decisions (owner, 2026-10-26)

1. `/` stays the Projects list; no auto-redirect (AC 17).
2. **Archived projects are not in the dropdown.** An archived id reached by URL is handled by AC 3a, 9 and 20.
3. **Switching project warns about unsaved work item edits** (AC 14, 14a).
4. **Per browser (`localStorage`) is enough** (AC 8); no server-side preference.
5. **Closing the work item dialog (X, Close, Escape) with unsaved edits asks "Discard changes?"** (AC 14c-14e).
6. **Archived project by URL:** read-only, with the extra "(archived)" option, confirmed as specified in AC 3a, 9 and 20.
7. **Option label `KEY - name`** confirmed (AC 3).

## Acceptance criteria

### The dropdown

1. Every signed-in page that is project-scoped (`board.html`, `backlog.html`, and the new `sprints.html`) shows a project dropdown in the `.topbar`, to the right of the brand, replacing the text breadcrumb `/ <project name>`. It is a native `<select>` with an accessible name "Project" (visible label or `aria-label`).
2. The dropdown is built by shared client code loaded on those pages (one new file, for example `public/js/projectScope.js`, after `session.js`), not copied into each page script. It reads `GET /api/projects` (non-archived only).
3. Each option reads `<KEY> - <name>`. **Only non-archived projects are listed** (the list is `GET /api/projects` without `includeArchived`). The text is inserted as text, never HTML. Order is the server's order.
3a. **Archived project reached by URL.** `?project=<id>` of an archived project is still honoured (bookmarks and the Projects list's "Show archived" links keep working): the page opens read-only exactly as today (archived badge, Sprints AC 48), and the dropdown shows that one project as an extra last option `<KEY> - <name> (archived)` so the select is not blank. That extra option exists only while it is the current project; once the user picks another project it is gone and cannot be re-picked from the dropdown. The page needs the project's `archived` flag from `GET /api/projects/:id` (already loaded).
4. The selected option is the current project. Choosing another option navigates to the same page for the new project: same file name, `?project=<new id>`, and all other query parameters dropped (see AC 12). No full-page state from the old project (selection, filters, open dialog) is carried over.
5. Keyboard: the dropdown is reachable by Tab from the brand, operable with arrow keys; changing the value navigates (the browser's default select behaviour is sufficient; no custom widget).
6. The dropdown is shown to every group, Viewer included. If the list request fails, the dropdown shows the current project only and the page shows the error in its existing message area; the page does not break.

### Where the current project is stored

7. **The URL is the source of truth for a page view:** `?project=<id>`. Every project-scoped page reads it first.
8. **The last chosen project is remembered per browser** in `localStorage` under one key (proposed `pm.project`), holding the project id as text. It is written whenever a project-scoped page loads a **non-archived** project successfully (including by following a link) and whenever the dropdown is changed. An archived project's id is never written. Access to `localStorage` is wrapped so that a missing or throwing storage (private mode) leaves the app working with the URL alone, as `storageGet`/`storageSet` in `board.js` already do. The helper is shared (moved or reused), not a third copy.
9. When a project-scoped page is opened **without** `?project=`, the page resolves the project in this order: (a) the remembered id from AC 8, if that project still exists and is not archived; (b) otherwise the first project of `/api/projects` (non-archived); (c) otherwise (no live projects; archived ones are not offered) the page shows "No active projects." with a link to the Projects page and no dropdown. The page then replaces the URL with `?project=<resolved id>` (`history.replaceState`, no extra history entry), so the URL always names the project afterwards.
10. When `?project=` names a project that does not exist or is not a positive integer, the page shows "Project not found." with a link to the Projects page, and the dropdown still lists the projects so the user can pick one. The remembered value is not overwritten by an invalid id. (Today the board shows a raw API error.)
11. Existing links and bookmarks with `?project=<id>` keep working unchanged and update the remembered project (AC 8). Links built in `projects.js` (`board.html?project=<id>`) keep working; the Projects list link text and target are unchanged.

### Switching and navigation

12. Switching project drops page-specific query parameters (for example `?sprint=<id>` on the Sprints screen, `sprints-screen.md` AC 5), because a sprint id belongs to one project. After a switch the page behaves as if opened without those parameters (for the Sprints screen: its default selection).
13. The sub-navigation (Board, Backlog, Sprints) links always carry the current `?project=<id>`. The brand link "Projects" goes to `/` (the Projects list) and carries nothing.
14. **Unsaved-edit warning.** When the user changes the dropdown while the work item dialog holds unsaved changes, the page does not navigate. It shows a confirm (native `window.confirm` is sufficient for the POC) with the text: "You have unsaved changes to this work item. Switch project and discard them?" OK navigates to the new project; Cancel leaves the page as it is and resets the dropdown to the current project. With no unsaved changes, switching navigates at once with no prompt.
14a. **What counts as unsaved.** The dialog tracks a "dirty" flag (new; none exists today in `public/js/board.js`): true when any saved-item field (title, description, assignee, priority, type, epic, sprint, resolution, status) differs from the values loaded into the dialog, or, for "Create work item", when anything has been typed or chosen beyond the defaults, or a comment draft or description edit is non-empty and not posted. It is cleared on Save, on Close without edits, and when the dialog is re-pointed to another item. As a safety net for other ways out (browser Back, reload, sub-navigation link, typed URL), a `beforeunload` handler is registered only while the flag is true; the browser's own generic wording is shown (custom text is not possible there).
14b. **Known constraint.** The dialog is opened with `showModal()` (board.js line 949), which makes the topbar inert, so the dropdown cannot be operated while the dialog is open. The confirm of AC 14 therefore only matters if the dropdown becomes reachable; the close guard of AC 14c-14e is what protects edits in practice. The dirty flag and `beforeunload` of AC 14a are needed regardless.
14c. **Close guard.** When the user closes the work item dialog by the X button, the Close button, or the Escape key while the dirty flag (AC 14a) is true, the dialog does not close. A confirm (native `window.confirm` is sufficient) asks: "Discard changes?" with the detail line "Your unsaved changes to this work item will be lost." (if the native confirm is used, one string: "Discard changes? Your unsaved changes to this work item will be lost."). OK discards the edits and closes the dialog (the dirty flag is cleared). With the flag false, closing is immediate with no prompt.
14d. **Cancel keeps everything.** Cancel leaves the dialog open, every field, draft, tab and scroll position exactly as they were, and focus returns to the control that was used to close (or the title field for Escape). Nothing is saved or sent.
14e. **Escape.** Escape is intercepted through the dialog's `cancel` event (`preventDefault()` when dirty, then the AC 14c confirm), so the browser does not close the dialog first. A second Escape while the confirm is showing is the confirm's own Cancel. Save (the primary button) and Delete are not close actions: Save clears the dirty flag on success and closes as today; a failed Save keeps the dialog open and dirty; Delete has its own confirmation and is unchanged.
14f. **Everywhere.** The guard and the dirty flag live in the shared work item dialog code in `public/js/board.js`, so they apply on every page that opens the dialog: Board, Backlog and Sprints (and the Epic View, Children tab and dialog re-pointing via an epic or linked item chip: re-pointing the dialog to another item while dirty asks the same "Discard changes?" confirm). The project dropdown confirm (AC 14) and this guard share the one dirty flag and one confirm helper.
15. Per-project browser settings that already exist (board filters, saved per project by `filterStorageKey` in `board.js`; the Group by setting `pm.groupBy`, global) are unchanged and keep working after a switch.

### Pages that are not project-scoped

16. `index.html` (Projects list), `users.html` (Users), `login.html` have no project dropdown, and `/` stays the Projects list; they are unchanged except that nothing here breaks them. The Projects list is still the place to create, edit and archive projects.
17. Opening `/` does not auto-redirect into the remembered project (the Projects list stays the landing page). See Open question 1.
18. After sign-in the user lands where they do today (`redirect.js` `next` handling); a `next` of `board.html?project=2` still works.

### Read-only and permissions

19. An archived project opened by URL (AC 3a) opens its pages read-only exactly as today (Sprints AC 48). The dropdown does not need any permission beyond being signed in; there is no new endpoint and no server change.
20. Archiving the remembered project (via Edit project) does not clear the remembered id, but AC 9a skips an archived remembered project, so the next open without `?project=` falls to the first live project. The stale id is left in place and overwritten at the next successful load (AC 8).

## Data model changes

None. No server change. Client storage only: one `localStorage` key (AC 8).

## Out of scope

- Server-side "current project" (per-user preference stored in the database), cross-browser sync.
- A project switcher with search, recent projects, favourites, or project icons.
- Showing project dropdown on the Users, Projects admin and login pages.
- Creating or editing projects from the dropdown.
- Cross-project views (all projects at once), cross-project filters.
- Listing archived projects in the dropdown, or a "Show archived" option in it.
- Deep links to a work item by key (a `?issue=` parameter).

## Open questions

None. All questions are answered (Decisions 1-7).

## Implementation notes for the developer

Pipeline: owner reviews, then the `designer` (header dropdown placement and style, narrow screens, the "Project not found." and "No projects yet." states), then `developer`, then `qa`. Re-read `public/js/board.js`, `public/backlog.html` and `public/board.html` first; they are in flux (uncommitted bulk-move work on the Backlog page).

Suggested order:

1. New `public/js/projectScope.js` (browser global plus `module.exports` for `node:test`, like `public/js/sprints.js`): pure functions `parseProjectParam(search)`, `resolveProject(urlId, rememberedId, projects)` implementing AC 9-10, `optionLabel(project)`, `pageUrl(file, id)`; thin DOM part that builds the `<select>` in `.topbar` and navigates. Shared safe `localStorage` wrapper (extract `storageGet`/`storageSet` from `board.js`).
2. Add the script (after `session.js`) to `board.html`, `backlog.html` and the new `sprints.html`; remove the `#crumb` span from those pages' topbar (or fill it with the dropdown).
3. `public/js/board.js`: replace `projectId = new URLSearchParams(...).get('project')` (line 29) with the resolved id from projectScope (await it before loading, as the file already awaits `session.ready`); replace the "No project selected." message with AC 9/10 states; update `renderHeader` (lines ~564-569) and `backlogUrl` (line 257) to use `pageUrl`; stop writing the crumb.
4. `public/index.html` / `projects.js`: no change expected (AC 16); confirm the link still works.
5. Tests (`node:test`, no browser): `tests/projectScope.test.js` for `resolveProject` (url wins; remembered used; remembered archived skipped; nothing when no live project; invalid id; archived url id still resolved) and the dirty-check helper (pure function comparing loaded and current dialog values), `optionLabel`, `pageUrl` dropping other params. Source test: only `projectScope.js` reads `?project=` and the storage key.
6. `README.md`: one short paragraph on the project dropdown and the remembered project.
6a. `public/js/board.js`: add the dialog dirty flag (AC 14a) and a hook the dropdown calls (`isDirty()`); register and unregister `beforeunload` as the flag changes. The dropdown's change handler (projectScope.js) shows the AC 14 confirm and resets the select on Cancel. Add the close guard (AC 14c-14f) to the X, Close, Escape (`cancel` event) and re-pointing paths, using one shared confirm helper.
7. QA, on a scratch database copy and a spare port (not 3000 or 3001): open each project page with and without `?project=`; switch SFPM to project 1 and back on Board, Backlog, Sprints; stale `?sprint=` dropped; bad id; storage blocked; archived project absent from the dropdown but openable by URL, read-only, with the extra option; edit a field then try to leave (Back, sub-nav, reload) and see the browser prompt; confirm text and Cancel reset where the dropdown is reachable; edit a field then X, Close and Escape each ask "Discard changes?", Cancel keeps edits intact, OK closes; no prompt with no edits; same on Board, Backlog and Sprints; re-pointing via epic chip while dirty asks; Viewer sees the dropdown; Users, Projects, login have none.
