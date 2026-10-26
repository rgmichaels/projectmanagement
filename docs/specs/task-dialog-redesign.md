# Task Dialog Redesign (Tabs)
Status: Approved for build
Date: 2026-10-25

**Builds on the implemented code and on `docs/specs/board-mvp.md`, `epic-view.md`, `work-item-links.md`, `attachments-and-pasted-images.md`, `ticket-discussion.md`, `ticket-history.md`, `resolution-and-comments.md`, `permission-groups.md` and `search-and-filters.md` (read-only references; this spec edits none of them).** Terminology follows the MVP ("work item"; the table and API may still be called `issues`). Acceptance criteria are numbered from 1 within this spec; references to other specs are written "Epic AC n", "Links AC n", and so on.

Design source of truth (read these before building): `docs/design/task-modal-v2/README.md` (UI contract, palette, contrast table), `docs/design/task-modal-v2/b-tabs.html` (the chosen option; open it in a browser, use the state strip at the top), `docs/design/STYLE.md`. Where this spec and the mockup disagree, this spec wins; the differences are listed under "Mockup differences" below.

## Problem

The `#detail` dialog is one 560px column of stacked blocks: properties, description, Epic view, Links, Attachments, then the Discussion/History tabs. Links, Attachments and Epic children push the discussion off screen, and status and assignee sit far from the description. The owner reviewed three redesigns and picked option B (Tabs): a 660px single column with a dark teal header band, a status track under the title, properties, description, and one tab bar (with counts) holding Children (epics only), Discussion, History, Links and Attachments.

This is a front-end change only. Every existing behavior and server API stays.

## User stories

1. As a user, I open a work item and see its key, type, title and status first, in a dark header band, with the status as a three-step track I can click.
2. As a user, I see assignee, priority, type and epic next to each other, then the description, without scrolling past other sections.
3. As a user, I find Discussion, History, Links and Attachments (and Children on an epic) in one tab bar, each with a count, and only one is open at a time.
4. As a user opening a child item, I see its epic as a link in the header band and click it to open the epic.
5. As a user, when an error belongs to Links, Attachments or Children, the dialog opens that tab so I see the error.
6. As a Viewer or on an archived project, I read everything and can change nothing, and the dialog says why.
7. As the owner, long or hostile text never breaks the layout or runs as HTML.
8. As the owner, nothing about the data, API, permissions or filters changes.

## Decisions (confirmed by the owner; the developer does not need to ask)

1. **Option B (Tabs)** is chosen. Options A and C are dropped.
2. **Palette** is the teal palette in `docs/design/STYLE.md` part 2 (deep teal `#0b5d66`, pale teal `#e5eded`, navy `#154973`, link blue `#004dd1`, gold `#face00` on dark teal only, error `#c0300b`). No logo, seal, wording or layout from the reference site. It is dialog-scoped for now (AC 35), not app-wide.
3. **No server, API or schema changes.**
4. **Status control:** a radio-group status track replaces `<select name="status">` (not a styled select). Existing code and QA steps that set the select change to clicking a step.
5. **Read-only behavior stays as the current code does it** (AC 26-28): Delete and all editing controls are already hidden for Viewers and archived projects; Delete is Admin-only. No change.
6. **Reporter is read-only for everyone**, including Admins.
7. **Epic link:** the link in the header band replaces `#epic-open`; the Epic dropdown stays.
8. **History tab count:** no count until the first page loads, then the loaded number, with "+" if more exist (AC 14).
9. **Open tab is not remembered between dialogs:** every open starts on Children (epic types) or Discussion (AC 16).

## Mockup differences (this spec overrides `b-tabs.html`)

The mockup is a demo with fake data. The real dialog keeps current behavior where they differ:

- **Save button text:** the real dialog shows "Create" for a new item and "Save" for a saved one (`public/js/board.js` line 602). Keep that. The mockup says "Save" for a new item.
- **Delete:** shown only to a user with the `delete-item` permission (Admin), never to Member, Viewer, on an archived project, or for a new item (`els.deleteBtn.hidden = ro || !item || !canDeleteItems()`, line 603). The mockup shows Delete to every writer; do not copy that.
- **Title error text:** the real text today is "Title is required." The new text is "Title is required. Enter a title and save again." (design copy).
- **Description empty text:** the real text today is "No description. Click Edit to add one." The new text is "No description. Select Edit to add one."
- **Status list, types, priorities, resolutions, users, link types:** from the server lists as today. The mockup's hard-coded arrays are demo data only; no name from them goes in the app (`tests/source.test.js` rules).
- **Message post / Posting as:** unchanged behavior; "Posting as <name>" stays.
- **Edit and Delete on messages** only on the user's own messages, as today (the mockup hard-codes "Alex Chen").
- **Tab counts** come from data the dialog already loads (see AC 14); no new endpoint is added to get them.

## Acceptance criteria

Behavior carried over from existing specs is verified by QA, not rebuilt; criteria below describe what is observable in the new layout. Where an existing control name or id changes, the new name is stated.

### Layout and header band

1. The `#detail` dialog is 660px wide (`min(660px, 95vw)`), single column, with no outer padding around the band; its background is `#f8fafa`. The band is dark teal `#0b5d66` with rounded top corners; the body below is near-white; the footer is separated by a 1px top border.
2. For a saved work item the band shows, in one row: a white key chip with the type name and key (for example "Task PM-142") with a dot in the type's color (from the server types list, not hard-coded), then, for a child item only, the epic link, then a Close (x) button with `aria-label="Close"` at the far right. Close closes the dialog exactly as the footer Close does.
3. For a child item whose epic is loaded on the board, the epic link reads the epic key and title (for example "PM-12 Onboarding revamp"), is gold, uppercase, bold and underlined, with a trailing arrow, and clicking it opens that epic in the same dialog (re-pointed, no reload; same behavior as today's `openLinked`). It is a `type="button"` button. The separate link beside the Epic dropdown is removed (see Decision 7). A non-child item and an epic show no epic link. An item whose `epic_id` is not in the loaded items shows no link (as today).
4. For a new item the band shows the text "Create work item" instead of the key chip. The dialog's accessible name is "Create work item" for a new item and the item key for a saved one (`aria-labelledby` points at a visually hidden heading, replacing the current `#detail-title`).
5. The title is an auto-growing text area, `maxlength` 200, `aria-label="Title"`, white bold text on the band, placeholder "What needs to be done?". Long text wraps (no horizontal scroll). Saving with an empty or whitespace-only title does not call the API and shows "Title is required. Enter a title and save again." under the title, as a white chip with dark red text (`#a82a08`) with `role="alert"`; the title field gets a white 2px border and receives focus. Editing the field and saving again clears the message. The title is still trimmed on save and saved through the same `PATCH`/`POST` as today.
6. Pressing Enter in the title must not insert a line break or submit unexpectedly: it behaves as submit (Save), and pasted line breaks are replaced by spaces. (A textarea replaces the current single-line input; the saved title never contains a newline.)

### Status track

7. For a saved item the Status control is a `fieldset` with `legend` "Status" containing one radio per server status, in server order (from `state.statuses`), `name="status"`, three equal steps today. Steps before the current one are pale teal, the current step is solid deep teal with white bold text and a dot, remaining steps are white. Adding a status to `server/statuses.js` adds a step with no other change; with many statuses the track wraps to more than one row.
8. Clicking a step selects it (one click). The Arrow keys move between steps (native radio behavior), and the focused step shows a navy ring inside the step. The selected step is only changed in the form; nothing is saved until Save (same as the current select).
9. Selecting the terminal status shows the Resolution select (default from `defaultResolution()`, current value kept if the item is already terminal); selecting any other status hides it and the saved value is cleared by the server (existing behavior, `syncResolutionField`). The Resolution select sits in the properties grid (AC 10). Resolution AC from `docs/specs/resolution-and-comments.md` still holds.
10. For a new item the status track is not shown (as today) and the item is created in the first status.

### Properties and description

11. Below the track is a two-column grid of labelled selects: Assignee ("Unassigned" is the first option), Priority, Type, Epic ("None" first; hidden when the selected type is an epic type or when there are no epic types), and Resolution (only in the terminal status). Below the grid is the plain text line "Reporter: <name>" (only when the item has a reporter; read-only, inserted as text). Form field names stay `title`, `type`, `status`, `priority`, `assignee_id`, `epic_id`, `resolution`, `description`.
12. Description: label "Description". For a saved item the read view is shown with an Edit button; the Edit button opens the textarea showing the raw text, as today. For a new item the dialog opens on the textarea. Empty read view for a writer says "No description. Select Edit to add one." and for read-only says "No description." Image tokens still render as images, and "Images in this description" thumbnails still show under the read view. Pasting an image into the description (edit view) still uploads it as an attachment and inserts its token; Save waits for the upload ("Attachments AC").
13. All of Type, Status, Priority, Assignee, Epic, Resolution, Title and Description remain part of Save: one `PATCH /api/issues/:id` (or `POST /api/projects/:id/issues` for new items) with the same body as today (`formValues`). The Children, Discussion, History, Links and Attachments tabs never submit the form and their buttons are all `type="button"`.

### Tab bar

14. A single tab bar (`role="tablist"`, `aria-label="Activity"`) sits below the description for a saved item and shows tabs in this order: Children (epic types only), Discussion, History, Links, Attachments. Each tab has a count pill: Children = number of children, Discussion = number of messages, Links = number of links, Attachments = number of attachments (all of these come from data the dialog already loads), History = no count pill until its first page has loaded, then the number of events loaded so far, with a "+" suffix while "Show more" is available (no new server endpoint; see Decision 8). A count updates after the action that changes it (post, delete, add, remove, upload) without reopening the dialog. A count shows "0" for empty sections except History before it loads.
15. Tabs use `role="tab"` with `aria-selected` and `aria-controls`; panels use `role="tabpanel"` and `aria-labelledby`. Left and Right Arrow move between tabs (extending the current `activityTabs` keydown handler to all tabs, with Home and End optional). Only one panel is visible at a time, and the other panels are hidden.
16. The default tab when a dialog opens (and each time it is re-pointed) is Children for an epic type and Discussion otherwise. A new item shows no tab bar; it shows only the Attachments section from AC 25 below the description.
17. The tab bar does not make the dialog taller than the content of the visible panel: the tab panel has a minimum height (about 200px) so switching between a short and long tab does not make the footer jump by more than the difference, and long lists (thread, history, children, attachments) scroll inside the panel as they do today (max-height rules kept).
18. **An error opens the tab it belongs to:** a visible error from Links (`#link-error` text set), Attachments (`#attachment-error` text set), or Children/Epic (`#epic-view-error` or `#epic-add-error` text set) switches to that tab if it is not the selected one, and the error is visible. A comment error (`#comment-error`) is already in the default tab; if the user is on another tab when an asynchronous load or post error arrives, switch to Discussion. A history load error stays on History (its Retry button works). Only errors raised by an explicit user action or a load for the open item switch tabs; clearing an error does not switch tabs back.

### Discussion tab

19. Discussion tab: composer on top (text "Posting as <name>", `textarea` labelled "Message" with placeholder "Write a message", Post button), then the thread. The empty thread reads "No messages yet. Be the first to post." Posting, editing and deleting your own messages, 1-2000 character rule, paste of images into a message, the 40vh scroll, relative times and the comment count on the board card all behave exactly as today (`ticket-discussion`, `resolution-and-comments`, `attachments` specs). Viewer and archived: the composer is hidden and no Edit/Delete shows on any message; old messages are still readable.

### History tab

20. History tab: newest first, "Filter history by field" select (`#history-field`), "Show more", Retry on load error, and the "created this work item" row. Loaded lazily the first time the tab is shown, as today; filter still works for Viewer and archived. Hidden for a new item.

### Links tab

21. Links tab: links grouped by relationship with Remove per row, then the form (Relationship select, "Work item to link" select, Add link button). Empty state "No links." Error line below the form. Remove and the form are hidden for Viewer and archived. Add link validation, the inline error text and the self-link and duplicate rules are unchanged (`work-item-links`). Hidden for a new item. Clicking a linked item's title opens it (re-pointed), as today.

### Attachments tab

22. Attachments tab: "Add files" button, "or drop files here", the attachment rows with thumbnail, name, meta, Download, Delete (own uploads only, as today), error line, empty state "No attachments." Drag-and-drop of files anywhere on the panel still uploads (drop target outline kept). Controls hidden for Viewer and archived. Pasting an image into the description or a message still attaches it and the Attachments count pill updates.
23. For a new item the Attachments section shows "Save the work item first." and no count, and the file controls are hidden (as today).

### Children tab (epic types only)

24. The Children tab is shown first and selected by default only for epic types; for other types it does not exist. Its content is the existing Epic view: a dark teal rounded summary panel (bold "x of n done", progress bar with `role="progressbar"` and `aria-valuenow`, `aria-valuemax`, `aria-label="Progress"`, gold fill, one count per server status including zeros), the child rows (type dot, key, title button, "Status · Assignee or Unassigned"; priority may stay in the row), the "Existing work item to add" select with Add and Create child buttons. Empty epic reads "No child work items yet. Add an existing item or create a new one." with Add and Create child still shown, and no summary panel (the mockup shows none when empty; a 0 of 0 bar is acceptable if simpler). Clicking a child opens it (re-pointed); Remove per child (not shown in the mockup, but the Epic view spec requires it: keep it, as a link-style button, hidden when read-only). Add, Create child, Remove all behave as in Epic AC 16-18, 21 and 22.
25. Epic AC 11-24 are preserved with these renames: the "Epic" section is the Children tab; the heading now shows as the tab name "Children" with the count pill (the section label still comes from the types list, so for an installation whose epic type has another label the tab label is "Children", never a hard-coded type name).

### Read-only (archived project or Viewer)

26. A pale teal banner (`role="status"`) is the first element in the body: "This project is archived. You can read this work item but not change it." on an archived project, and "You have view-only access. You can read this work item but not change it." for a Viewer. If both apply, the archived text is shown. No banner for a writer on an active project.
27. Read-only fields are disabled with black text on pale teal (not faded grey): Title, Type, Priority, Assignee, Epic, Resolution, Description (read view only, no Edit). The status track shows the current step and earlier steps but clicking does nothing and radios are disabled. Hidden: Save/Create, Delete, Edit (description and messages), the message composer, Add link, link Remove, Add files, attachment Delete, Add, Create child, child Remove. Still working: Close (both the x and the footer button), the tabs, the History filter, Download, opening linked items and children, and opening the epic from the band.
28. A Viewer on an active project and any user on an archived project see the same read-only state. A Member sees all edit controls but no Delete. An Admin sees Delete on a saved item in an active project. This matches the current code (`readOnly()` and `canDeleteItems()` in `board.js`); no new permission is added. See Decision 5.

### Footer

29. The footer has Save (primary deep teal, `type="submit"`; text "Create" for a new item), Delete (danger, `type="button"`, per AC 28), and Close (`type="button"`). A failure on save (API error message) shows in a `role="alert"` line beside the buttons showing the server's message text as today (the mockup's "Could not save. Check the fields marked above and try again." is the generic copy for a field-level failure and may prefix, but the server's own message must remain visible). The footer stays visible at the bottom of a tall dialog (sticky, or the dialog scrolls internally while the footer stays in view).
30. Delete still asks `confirm("Delete PM-1? This cannot be undone.")`, then deletes, closes and reloads the board. Save closes the dialog and reloads the board; a created item that the active filters hide still shows the filters notice (`search-and-filters` AC 21). Create child still returns to the epic.

### Text safety, accessibility, layout robustness

31. Every user string is inserted as text, never parsed as HTML: title, description, key chips, epic link, child titles, link titles, file names, reporter, message bodies, history values, user names. The string `<img src=x onerror=alert(1)>` appears literally in all of them and no alert runs. No `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` in any new or changed code (existing source tests).
32. Long unbroken strings (a 120-character word) in the title, description, link titles, file names, reporter and message bodies wrap inside the dialog; the dialog never scrolls horizontally and no control is pushed out of view. Titles longer than 200 characters cannot be entered (`maxlength`).
33. Every control has a visible label or an `aria-label`. All non-submit buttons are `type="button"`. Focus ring is 2px deep teal with offset on light areas, 2px gold on the dark band, and a navy ring inside a status step. Escape closes the dialog (native `<dialog>` `cancel` behavior). Opening a dialog puts focus on the Title for a new item and on the first sensible control for a saved item (no worse than today's default).
34. Colors meet the contrast table in `docs/design/task-modal-v2/README.md`: text 4.5:1, borders and focus 3:1. Gold and `#65999e` are never used as text on light backgrounds. Error text in the dialog is `#c0300b` (`#a82a08` only on the white chip in the band).
35. The palette tokens are defined under a `dialog#detail` (or `.detail`) selector, not `:root`; the board, project list, Users page and login page look exactly as before. The dialog does not use external fonts, images or icons.
36. At a viewport narrower than 700px the dialog fills 95vw, the property grid becomes one column, and the status track and tab bar scroll or wrap rather than overflow.

### No behavior change elsewhere

37. No file under `server/` changes (`git diff` shows none), no new endpoint, no schema or history field changes. `npm test` passes (see "Tests that need updating").
38. `tests/source.test.js` rules continue to pass or are updated only as listed below: no status, type, priority or resolution name is hard-coded in the changed client code; button types; text-only DOM.

## Data model changes

None. No tables, columns, API endpoints, history fields or permissions change. The only new stored state, if any, is none (the selected tab is not remembered between dialogs).

## Out of scope

- Any server, API, schema or permission change (including a history count endpoint).
- The wider Rail (A) and Drawer (C) layouts.
- Applying the palette to the board, project list, Users page, login or the topbar (see Decision 2).
- A pinned message composer, tab persistence between dialogs, or a deep link to a tab.
- New fields (labels, due dates, story points), subtasks, reorderable children.
- Editing Reporter (see Decision 6).
- Dark mode, custom fonts, a logo or seal.
- Changing what the board cards, swimlanes, filters or drag-and-drop do.
- Extracting `board.js` into modules, beyond what the developer needs (see implementation notes).

## Open questions

None. The owner accepted all recommendations (Decisions 4-9).

## Implementation notes for the developer

Files to touch: `public/board.html`, `public/css/app.css`, `public/js/board.js`, `tests/source.test.js`, `README.md` (one sentence only if the dialog is described there). Do not touch `server/` (AC 37).

`board.js` is about 1,950 lines, with the dialog code in its detail, discussion, history, links, attachments and epic view sections. **Do not extract anything new unless it is needed** (for example, a small shared `selectTab(name)` helper replacing the two-tab `selectTab` at line 934 is fine); keep the existing section markers (`// ---------- epic view ----------`, etc.) because `tests/source.test.js` slices the file on them. Keep element ids that tests and code use (`activity-tabs`, `tab-discussion`, `tab-history`, `discussion`, `history`, `links`, `attachments`, `epic-view`, `epic-open` if kept, `comment-post`, `epic-add-target`, `attachment-add`, `history-field`, `detail-save`, `detail-delete`, `detail-close`, `detail-error`).

Suggested order, each step testable alone in a browser:

1. **Read the mockup's CSS** (`b-tabs.html`) and port it into `app.css` under `dialog#detail`: tokens, band, key chip, epic link, status track, tabs, count pill, dark summary panel, banner, buttons (navy, primary teal), focus rings. Leave the existing board styles untouched. Make the dialog 660px, padding 0.
2. **Restructure `board.html` markup** inside `#detail-form`: band (key chip, epic-link button, Close x, title textarea, error line), body (banner, status `fieldset`, properties grid, description, reporter), tab bar with five tabs, one panel per tab (reuse the existing `<section>` elements and their ids as panels), footer. Move Epic view, Links, Attachments inside tab panels. Keep `type="button"` on every button except Save (existing source tests check markup slices up to `</section>` and `</div>`: see the test notes below).
3. **Title:** change `<input name="title">` to a textarea (or keep a one-line input styled as the mockup if the developer prefers; AC 5-6 must hold). Block newlines (AC 6). Update `formValues()` only if needed.
4. **Status track:** build the radio group in `openDetail` (replace the `fillSelect(f.status, ...)` call at line 580). Update `syncResolutionField` (line 539) and the `change` listener (line 636) to use the checked radio (`f.status.value` works on a RadioNodeList). Disable radios in read-only (line 599 already disables inputs). Style the current/past states from the checked state (a small `syncTrack()` called on change).
5. **Band:** replace `#detail-title` with the key chip and a hidden heading for `aria-labelledby`; turn `#epic-open` into the band epic link (reuse `syncEpicOpen`, line 555, which already sets its text and `openLinked` click). Keep the Epic dropdown in the properties grid.
6. **Tabs:** generalize `selectTab` (line 934) and its click and arrow-key handlers (947-956) to the five tabs; panels hidden through the `hidden` attribute as today. Default tab in `openDetail` (line 613). Add `showTabFor(errorEl)` called wherever `els.linkError`, `els.attachmentError`, `els.epicViewError`/`els.epicAddError` or `els.commentError` text is set (AC 18).
7. **Counts:** put a pill in each tab; update it in the existing renderers (`renderThread` line 782, the attachments render around line 1538, the links render around line 1311, the epic summary around line 1160, history after each page load). Keep the existing in-panel headings only if they do not duplicate the tab label (they can be visually hidden).
8. **Read-only:** add the banner (AC 26) in `openDetail` using `readOnly()` and `state.project.archived`; style disabled fields (AC 27). Do not change the permission checks.
9. **Footer and errors:** keep `#detail-error`; position it beside the buttons; keep the existing messages and add the AC 5 title text.
10. **Run `npm test`**, fix the source tests (notes below), then open the dialog in a browser for every state (QA checklist below).

### Tests that need updating (`tests/source.test.js`; there are no browser tests, and the API tests do not touch the dialog)

All 12 or so UI-facing rules in `tests/source.test.js` slice `public/board.html` by marker. Expect these to need edits when markup moves:

- **Discussion buttons rule (line 90):** slices from `<section id="discussion"` to the first `</section>`. Passes if the section stays; check that `#comment-post` and every button in it keep `type="button"`.
- **History rule (line 258-270):** slices `<section id="history"` to `</section>` and the `<div id="activity-tabs"` to the first `</div>` (it assumes the tab bar has no nested `div`). If tabs get count `<span>`s that is fine, but a nested `div` inside the tab bar will cut the slice short; if the new tab bar needs one, update the slice end.
- **Links rule (line 318-329):** asserts `name="description"` appears before `<section id="links"` and `<section id="links"` before `<div id="activity-tabs"`. **This will fail** with the new order (tab bar above the panels). Update it to assert: description before the tab bar, the tab bar before the links panel.
- **Attachments rule (line 386-392):** slices `<section id="attachments"`, asserts "Save the work item first." and `type="button"` on its buttons. Passes if the section and text stay.
- **Epic view rule (line 466-477):** asserts `<button type="button" id="epic-open"`. Update to the new band link markup (keep the id, or change the test to the new id) per Decision 7.
- **Filter rules (line 510-575):** the filter bar markup is outside the dialog; they should not change.
- **Hard-coded names rule (line 26) and the "terminal status derived only in `statuses.js`" rule (line 55):** apply to the new client code: build the track from `state.statuses`; do not write "Done" or `.at(-1)`; use `isTerminal()`.
- **No `innerHTML` rules** (history, links, attachments, epic, filters sections): applied to the changed code sections.
- **Add one new source rule** for this feature: the status track is built from `state.statuses` (no status names), the dialog markup has `role="tablist"` with five `role="tab"` buttons or the equivalent for epic and non-epic, and the palette tokens are under `dialog#detail` and not `:root` (e.g. no `--teal` in `:root`).

Any other test that sets "the status select" in a browser step belongs to QA reports, not the test suite; update the QA steps in `docs/qa/` templates used next time (see below).

## QA checklist (from `docs/design/task-modal-v2/README.md`)

QA runs in a browser against a scratch DB copy on a spare port (never 3001, never 3000), as Admin, Member and Viewer, and on an archived project. For each state, open the dialog and check:

States: Task (child of an epic), Epic with children and progress (some Done), archived project, Viewer, long and hostile text, empty sections (no description, links, attachments, messages), New item, Errors.

1. Band: dark teal, key chip with type dot, gold uppercase epic link with arrow for a child (opens the epic), Close x works; New item shows "Create work item".
2. Title wraps long text; empty title shows "Title is required. Enter a title and save again." as a white chip, red `role="alert"`, with a white 2px border on the field.
3. Status track: one radio per server status; one click selects; Arrow keys move; focus ring visible; Done shows Resolution (default), leaving Done hides it; hidden for a new item; not clickable when read-only; adding a status (scratch only) adds a step.
4. Properties grid: Assignee ("Unassigned" first), Priority, Type, Epic ("None" first, hidden for epics), Resolution only when Done, Reporter plain text, read-only.
5. Description: read view with Edit; empty text per role; new item opens on textarea; image thumbnails under the read view; real paste still attaches.
6. Tab bar order Children (epic only), Discussion, History, Links, Attachments; counts correct and update after post, add, remove, upload and delete; one panel visible; Arrow keys; default tab; an error in Links, Attachments or Children opens that tab.
7. Epic: dark summary panel "x of n done", progressbar role and values, per-status counts incl. zeros, rows, Add, Create child (epic preselected), Remove, empty-epic message; progress updates after a child is dragged to Done.
8. Discussion, History, Links, Attachments: each existing behavior (post, edit, delete own, filter, show more, retry, add link, remove link, duplicate or self-link error, upload, drop, download, delete, size/type errors).
9. Read-only (Viewer and archived): banner text, disabled fields with black text on pale teal, no Edit/Add/Remove/Post/Save/Delete/Add files/Create child; Close, tabs, History filter, Download still work.
10. Hostile text (`<img src=x onerror=alert(1)>`) is literal in title, description, key chips, link titles, file names, reporter, comments and history; no alert; long unbroken strings wrap with no horizontal scroll.
11. Accessibility: every control labelled; Tab order sensible; focus rings (teal, gold on the band, navy in the status track); Escape closes.
12. Contrast spot-checks against the table: white on `#0b5d66`, gold on `#0b5d66`, muted `#62666a` on `#e5eded`, error `#c0300b` on `#f8fafa`.
13. Viewport 1280px and 400px: no overflow, property grid collapses, footer reachable.
14. Palette is dialog-scoped: board, project list, Users and login pages look unchanged.

### Existing behavior QA must re-verify (each is changed in markup or location, not in logic)

- **Epic view (`epic-view.md`):** AC 11-24 (summary, children list, Add, Remove, Create child with epic preselected and return, archived read-only, refresh after a child changes, the epic chip on cards, the Epic field link now in the band).
- **Links (`work-item-links.md`):** add, remove, grouping, validation errors, click-through, archived read-only.
- **Attachments and paste (`attachments-and-pasted-images.md`):** add files, drop, paste into description and message, download, delete own only, type and size errors, counts, "Save the work item first." on new items.
- **Ticket discussion and resolution/comments:** post, edit and delete own, rules, count on the card; Resolution select default and clearing.
- **Ticket history (`ticket-history.md`):** lazy load, newest first, filter, show more, retry, read-only on archived.
- **Permission groups (`permission-groups.md`):** Viewer read-only everywhere in the dialog, Member sees no Delete, Admin sees Delete.
- **Search and filters (`search-and-filters.md`):** the "Created PM-n, hidden by the current filters." notice after creating a non-matching item from the dialog; editing an item out of the filter via the new status track; filters unaffected by opening and closing the dialog.
- **Board MVP:** create and edit save the same fields; drag-and-drop unaffected; Save/Create text.
