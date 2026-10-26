# Work item dialog redesign (exploratory, no spec yet)

Open the three files straight from disk. Each has a dark strip at the top to switch between states: Task, Epic with children, Archived project, Viewer, Long and hostile text, Empty sections, New item, Errors. You can also open a state directly, for example `a-rail.html#epic`. Tabs, accordions and the status track work; nothing is saved. The mockups use only system fonts and no network.

## Design plan

**Problem.** The current dialog is one 560px column of eleven stacked blocks. Status, assignee and the description are far from the discussion, and Links, Attachments and Epic children push the discussion off screen.

**Hierarchy (all three options).** 1) Title and status. 2) Assignee, priority, type, epic. 3) Description. 4) Discussion. 5) Everything else (Links, Attachments, Epic children, History) is one step away, always shows its count, and never hides in a way you cannot see.

**Palette (from the owner's reference site, palette and feel only).** No logo, seal, wording or layout from that site is used, and the dialog must not look like an official page. The palette is dialog-scoped until the owner decides to apply it app-wide.

| Role | Hex |
|---|---|
| Deep teal: top band, headings, primary button, selected tab, progress, current status step | `#0b5d66` |
| Mid teal: borders and hover only, never text on light | `#65999e` |
| Pale teal: rail, finished status steps, read-only fields, banner | `#e5eded` |
| Near-white dialog background / white surfaces | `#f8fafa` / `#ffffff` |
| Navy: input borders, secondary and action buttons (Post, Add, Add link, Add files), Close | `#154973` |
| Link blue: inline links only (Edit, Remove, Download) | `#004dd1` |
| Gold: only on the dark teal band, as the epic link and focus marker, and the progress fill on the dark summary panel; never on light | `#face00` |
| Text black / muted grey / borders | `#000000` / `#62666a` / `#d0d0ce`, `#e4e4e4` |

One change from the reference: error text uses `#c0300b` instead of the app's `#de350b`, because `#de350b` is 4.34:1 on `#f8fafa` (fails AA); `#c0300b` is 5.46:1. Type colours on the key chip are kept, shown as a dot on a white chip so they stay readable on the dark band.

**Contrast pairs checked (WCAG AA; text needs 4.5:1, borders and focus 3:1).** White on `#0b5d66` 7.58. Gold `#face00` on `#0b5d66` 5.01. Muted `#62666a` on white 5.79, on `#f8fafa` 5.53, on `#e5eded` 4.87. Link blue `#004dd1` on white 7.04, on `#f8fafa` 6.72, on `#e5eded` 5.92. Navy `#154973` on white 9.41, on `#e5eded` 7.91; white on navy 9.41. Black on `#e5eded` 17.67. Deep teal text on `#f8fafa` 7.23, on `#e5eded` 6.37. Error `#c0300b` on `#f8fafa` 5.46, on white 5.72, on `#e5eded` 4.82 (not used there; errors sit on white or near-white). Error chip `#a82a08` on white (the title error inside the dark band) 7.0. Placeholder `#cfe3e5` on `#0b5d66` 5.69. Navy input border on `#f8fafa` 8.98; mid-teal status track border on `#f8fafa` 3.04. Not used for text on light: gold and `#65999e`.

**Type (system stacks only; the licensed brand fonts are not available).** `"Proxima Nova", "Helvetica Neue", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (falls back gracefully; Proxima Nova is used only if installed). Keys: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`. Sizes unchanged: 11, 12, 13, 14, and 20 to 22 for the title. Weights follow the reference: headings, labels, tabs, buttons and the title are 700; body is 400.

**Layout feel.** Top band: dark teal, white bold title, key chip and a gold uppercase underlined epic link with an arrow (for a child item). Below it the dialog is near-white. Inputs have navy borders; action buttons are navy; Save is deep teal. For an epic, the progress summary is a dark teal panel with 16px radius and a lighter border, a bold "3 of 6 done" heading and a gold progress fill.

**Signature element (the one risk): the status track.** Status stops being a dropdown. It becomes a three-step track right under the dark band: finished steps pale teal, the current step solid `#0b5d66` with white bold text and a dot, remaining steps white. One click moves the item. It is a radio group (`fieldset` + `legend` "Status"), so it is keyboard usable (arrow keys) and has a visible focus ring (navy inside the step). The steps come from the server status list, so adding a status adds a step; with many statuses the track becomes a wrapped row.

**Rule that keeps teal meaningful.** Deep teal now carries the brand (band, headings, primary button, selected tab, progress). Inside the status track only, solid teal means "current" and pale teal means "finished"; nothing else on the page is a large solid teal shape except the band and the epic summary panel. Gold only ever sits on dark teal.

**Self-critique and revisions.**
- The first draft was a generic teal on white. The reference palette makes the dialog distinct, but a dark band plus teal everywhere risks looking like a government portal. Revisions: no logo, seal or nav; the band is only the dialog header; the body stays quiet near-white; the only loud shapes are the band, the current status step and the epic panel.
- Dropped whole-dialog type tinting (the `c-ticket` look); type colour is a dot on the key chip.
- Gold was tempting for highlights; it is limited to the band and the dark panel because it fails on light backgrounds.
- Copy is sentence case with plain verbs. Empty states say what to do ("No description. Select Edit to add one."). Errors say how to fix them ("Title is required. Enter a title and save again.").

## Options

**A. Rail (`a-rail.html`).** Wide dialog (900px) under the dark band. Left column is the work: description, epic children (epics only), then Discussion and History tabs with the composer on top. A right rail of pale teal holds the Details (type, priority, assignee, epic, resolution, reporter) and two collapsed cards, Links and Attachments, each with a count. This is the most Jira-like and keeps every property visible at once. Costs: widest dialog, stacks to one column under 760px.

**B. Tabs (`b-tabs.html`).** Narrow dialog (660px), single column. Title, status track, a 2-column property grid and the description are always visible. Below them one tab bar: Children (epics only, first), Discussion, History, Links, Attachments, each with a count. Only one secondary section is open at a time, so the dialog never gets taller than the biggest section. Costs: Links and Attachments are one click away (the counts make them discoverable); no two sections side by side.

**C. Drawer (`c-drawer.html`).** A right-hand drawer (540px) from top to bottom. Header (dark band with key and title, then the status track) stays put; the middle scrolls; the message box and Save/Delete/Close are pinned at the bottom, so you can post a message from anywhere in the item. Properties are a compact label/value list. Links, Attachments and Epic children are accordions (Epic children open for epics). Costs: a drawer is a different pattern from the board's `<dialog>` (needs side-anchored CSS and the board stays visible behind it); the pinned composer hides on the History tab.

## Recommendation

**Option A (Rail)**, with one change borrowed from B: keep the Links and Attachments cards collapsed but show their counts. Reasons: it matches the order the owner asked for (title, status, assignee, description, discussion come first) with no hidden-by-default content for the most-used things; the properties live in one predictable place (the rail) instead of inside a tab; and it needs the least new behaviour (a CSS grid, native `<details>`, the existing tabs). B is the best fallback if a wide dialog is a problem. C is the most distinctive but the biggest build change.

## UI contract (what the developer builds; applies to all options unless noted)

Existing control names and ids stay: Title, Type, Status, Priority, Resolution, Assignee, Epic, Open (epic link), Description with Edit, Links (Relationship, Work item to link, Add link, Remove), Epic view (Existing work item to add, Add, Create child, Progress bar), Attachments (Add files, Delete, Download), Discussion (Message, Post, Edit, Delete), History (Filter history by field, Show more, Retry), Save, Delete, Close.

1. **Header (dark teal band, white text):** white key chip with a type-coloured dot (type name + key, for example "Task PM-142"); for a child, a gold uppercase underlined link with an arrow, for example "PM-12 ONBOARDING REVAMP →", that opens the epic (this replaces the separate "Open PM-12" link); a Close (x) button with `aria-label="Close"`. New item: the text "Create work item" instead of the chip.
2. **Title:** one auto-growing text area, `maxlength=200`, label "Title" (aria-label is fine), wraps long and hostile text, never shown as HTML. Empty on save: "Title is required. Enter a title and save again." under it, field border becomes a white 2px outline, error shown as a white chip with `#a82a08` text on the band, `role="alert"`.
3. **Status track:** `fieldset` with `legend` "Status" and one radio per server status in board order, `name="status"`. Hidden for a new item (as today). Selecting Done shows Resolution (select, default Fixed); leaving Done hides it and clears it. If this replaces the status `<select>`, existing tests that set the select must change (open question 1).
4. **Properties:** Type, Priority, Assignee ("Unassigned" first option), Epic ("None" first option, hidden for epic types, , Resolution (only when status is Done), and "Reporter: name" as plain text. All are labelled `<select>`s.
5. **Description:** label "Description". Saved item: read view with an Edit link; the edit view is the textarea; empty read view says "No description. Select Edit to add one." (Viewer or archived: "No description."). New item opens on the textarea. "Images in this description" thumbnails stay under the read view.
6. **Epic children (epic types only):** heading "Child work items (n)", a dark teal rounded summary panel (bold "x of n done", progress bar with `role="progressbar"`, per-status counts), child rows (type dot, key, title button, "Status · assignee or Unassigned"), then Existing work item to add + Add (navy) + Create child. Empty: "No child work items yet. Add an existing item or create a new one." Add, Create child and the select are hidden when read-only.
7. **Links:** collapsed card (A, C) or tab (B) titled "Links" with a count badge, grouped by relationship, Remove per row, then Relationship, Work item to link, Add link (navy). Empty: "No links." Error line (`role="alert"`, for example "Choose a work item to link, then select Add link.") opens the card/tab automatically. Hidden for a new item.
8. **Attachments:** collapsed card or tab titled "Attachments" with a count badge, Add files button (navy) plus "or drop files here", rows with thumbnail, name, meta, Download, Delete. Empty: "No attachments." New item: "Save the work item first." (card open, no count).
9. **Discussion and History:** tabs with counts, Discussion selected by default. Composer above the thread: "Posting as <name>", textarea labelled "Message" with placeholder "Write a message", Post (navy). Empty thread: "No messages yet. Be the first to post." History: newest first, filter select, "created this work item" row. Both hidden for a new item. In C the composer is pinned to the bottom and hidden on History.
10. **Footer:** Save (primary, submit), Delete (danger, hidden for Viewer and archived and new items), Close. A save failure shows a `role="alert"` line beside the buttons: "Could not save. Check the fields marked above and try again."
11. **Read-only (archived project or Viewer):** a pale teal banner at the top of the body, `role="status"`: "This project is archived. You can read this work item but not change it." or "You have view-only access. You can read this work item but not change it." All fields are disabled (black text on pale teal, not faded grey); the status track shows the current step and is not clickable; Edit, Add link, Remove, Add files, Delete, Add, Create child, Post, Save and Delete are hidden; the Close button remains; History filter still works.
12. **Text safety:** every user string (title, description, link titles, file names, reporter, comments, history values) is inserted as text, never HTML. `<img src=x onerror=alert(1)>` must appear literally. Long unbroken strings wrap (`overflow-wrap:anywhere`).
13. **Accessibility:** every control has a visible label or `aria-label`; focus ring is 2px deep teal with offset on light areas, 2px gold on the dark band, and a navy ring inside a status step; tab bars use `role="tablist"/"tab"/"tabpanel"` with `aria-selected`; all non-submit buttons are `type="button"`; Escape closes the dialog (native `<dialog>`).

## Open questions for the owner

1. Is replacing the Status dropdown with the three-step track acceptable? It is the one risk. It changes the control from `<select name="status">` to radios, so existing UI tests and QA steps need an update. If not, the fallback is a normal select styled as a filled pill in the same place.
2. Is a wider dialog (900px, option A) acceptable, or do you prefer the narrow B?
3. Today Delete may still show for archived projects. The mockups hide it when read-only. Confirm.
4. Reporter is shown as plain text in the details; should it be editable by Admins? (Not designed.)
5. The epic chip and "Open PM-12" link are now one gold link in the band (this answers the old question; say if you want the separate link back).
6. Should this palette replace the app's blue everywhere, or stay inside this dialog? The mockups and STYLE.md assume dialog only until you decide. Still open.
7. Recommendation unchanged: option A; questions 1 to 4 are unanswered and the recommendations stand (replace the select with the status track, accept 900px, hide Delete when read-only, Reporter is read-only).
