# Sprints and Backlog: UI design and contract

Spec: `docs/specs/sprints-and-backlog.md` (Approved). Look and feel: Option A teal chrome from `docs/design/app-restyle`, real tokens from `public/css/app.css`. Acceptance criteria are cited as "AC n" of the spec.

Mockups are static and open from disk (no network). Each file inlines the real `app.css` plus the new rules from `src/sprints.css`, which is the CSS the developer appends to `public/css/app.css`. The mockup "today" is 2026-10-26.

| File | Shows |
|---|---|
| `a-stacked-backlog.html` | Option A, loaded Backlog page: overdue banner, active sprint with a drag in progress, planned sprints (one blocked Start, one empty drop target), backlog, collapsed Epics / Completed sprints / Sprint history |
| `a-stacked-states.html` | Option A states: no sprints and no items, active sprint empty, Viewer, archived, long and hostile text, quick-create validation and a refused drop |
| `b-split-backlog.html` | Option B, loaded |
| `dialogs.html` | Create sprint (plain, errors), Edit sprint, Delete confirm, Complete sprint (nothing chosen, planned, new sprint, no planned sprint plus server error, nothing unfinished). Same in both options |
| `work-item-sprint-field.html` | Sprint field in the work item dialog (active, backlog, completed sprint, read-only, epic) and the create dialog messages (sprint active, none active, epic) |
| `board-sprint.html` | Board with active sprint header, overdue banner, epic swimlanes, no active sprint (empty state and the create-into-backlog notice), active sprint with no items |
| `sprint-history.html` | Sprint history: loaded, empty, error with Retry, hostile text |

## Options

**A. Stacked sections (recommended).** The Jira layout. One column: active sprint, planned sprints, then the Backlog, each a white panel with a pale-teal header; Epics, Completed sprints and Sprint history are collapsed `<details>` panels at the bottom. Everything is visible and in plan order, so what you drag is always where it appears; a sprint can be started, edited or deleted without leaving the row you are looking at. It reuses the board's row vocabulary (type chip, key, priority, avatar) and needs no new interaction beyond drag between lists. Weakness: with a long backlog, dragging from the Backlog up to a sprint means scrolling during the drag (browsers scroll the page automatically when you drag near the edge; this is acceptable for a POC).

**B. Split panes.** Backlog on the left, one sprint at a time on the right, chosen by tabs (Active first). Both ends of a drag are on screen, which is better for big backlogs. Costs: planned sprints are hidden behind tabs (you cannot see Sprint 5 and Sprint 6 at once or spot an empty sprint), each pane is half width so rows wrap sooner, a tab strip is a new widget with its own keyboard behavior, and below 900px it stacks anyway. Everything else (dialogs, board, history, rows) is identical.

**Recommendation: A.** It is the simpler build (one list component repeated, no tab widget), shows the whole plan at once, matches what the owner asked for ("sprint sections" under a "Backlog page", Jira style) and degrades to phone width without a second layout. Choose B only if backlogs are expected to be hundreds of items long.

## UI contract (both options unless noted)

### Navigation (AC 28)
- A project sub-navigation `<nav class="subnav" aria-label="Project pages">` with two links, **Board** and **Backlog**, is the first element inside `<main>` on `board.html` and `backlog.html`. The current page has `aria-current="page"` (teal text, 3px teal underline). Visible to everyone who can open the project, archived included. Not on Projects, Users or Sign-in.
- The top bar is unchanged (crumb still `/ Apollo (APO)`). The board's empty state and the sprint bar link to the Backlog; the Backlog overdue banner is the only link back to the board's content (the sub-nav handles that).

### Backlog page layout (`backlog.html`, AC 30-32)
Order, top to bottom: toolbar, optional notice, overdue banner, error message area (`.message`, `role="alert"`), active sprint, planned sprints (by id), Backlog, Epics, Completed sprints, Sprint history.
- Toolbar: `h1` project title, project status badge, `Archived (read-only)` badge when archived, and (writers only, right aligned) **Create sprint** `.primary`.
- No sprints at all: show the `.empty` box "No sprints yet." with a Create sprint button (writers) in place of sprint panels; the Backlog panel still shows.
- Each of the active sprint, planned sprints and the Backlog is a `<section class="sprint" aria-labelledby>` with a header (`.sprint-head`): collapse toggle button (`aria-expanded`, `aria-label="Collapse <name>"`), `h2.sprint-name`, state badge (**Active** filled teal, **Planned** pale teal, **Completed** outlined grey; always the word), dates "YYYY-MM-DD to YYYY-MM-DD" when set (one date: "from ..." or "until ..."), counts "N items · M done", and right-aligned actions. The Backlog panel has no state badge, no dates, no actions, and its count reads just "N items".
- Active sprint panel has a 4px teal top border (`.is-active`). Goal, when set, is a line under the header "Goal: ..." (bold teal word, text inserted as text).
- Actions: Active: **Complete sprint** `.primary`, **Edit**. Planned: **Start sprint** `.navy`, **Edit**, **Delete** `.danger`. While another sprint is active, Start sprint is `disabled` and a visible hint "Complete <active name> first." sits left of it (visible text, not only a tooltip). Hidden entirely for Viewers and archived projects (AC 35).
- Collapse state is per page view only (not stored). Default: all expanded except Epics, Completed sprints and Sprint history, which are `<details class="sprint">` collapsed with a count (`<summary class="sprint-head">`, native keyboard behavior).
- Completed sprints: `details` per sprint inside the "Completed sprints" details, rows read-only (no handle, not draggable, no quick create), muted page-colour background (`.is-completed`).
- Epics (AC 31): read-only rows: Epic type chip, key, title button, "n of m children done". No handle, no drag, no quick create. Click opens the work item dialog on the Children tab. Empty: "No epics." Footer hint: "Epics are not part of a sprint. Create one from the board."

### Rows (`li.brow`, AC 32)
Left to right: drag handle `⋮⋮` (writers only, `aria-hidden`, `cursor: grab`), type chip (`.type-badge`, dot colour from the server), key (mono), title as `<button type="button" class="brow-title">` (wraps with `overflow-wrap:anywhere`; this is the keyboard and screen-reader target; clicking anywhere else on the row also opens the item), epic chip if any (existing `.epic-chip`, click opens the epic), priority (`.priority`), status pill (`.status-pill`, the status text; for the terminal status the pill gets `.is-done` which prefixes a check mark so done is not colour-only), assignee avatar (`?` unassigned). Rows wrap to a second line on narrow widths; the title keeps at least 220px basis. Row separators are `--line2`, hover `--page`.
- Rows in a read-only context (Viewer, archived, completed sprint) have no `draggable` attribute and no handle.

### Drag and drop (AC 33)
- Same mechanics as the board (HTML5 drag events, the existing 4px navy `.drop-indicator` element inserted between rows at the drop position). The dragged row gets `.dragging` (opacity .4).
- An empty container (or the empty state of one) accepts drops: the `ul.brows` gets `.drop-target` (2px dashed navy outline, pale teal fill) while a drag is over it. The empty-state text is "No work items. Drag work items here from the Backlog, or type a title below." (Backlog: "The backlog is empty. Type a title below to add the first work item.")
- Dropping sends one PATCH (`sprint_id`, `sprint_rank`). On failure the row snaps back and the server's message appears in the page `.message` (`role="alert"`), e.g. "Could not move APO-31: ...". Completed sprints and epics are never drop targets.
- Not keyboard-draggable; the keyboard path is the dialog's Sprint field and the quick-create rows (AC 38).

### Quick create (AC 34)
A `<form class="quick">` at the bottom of the Backlog and of every Planned or Active sprint: visually hidden label "Title for a new work item in <container>", `input maxlength="200"` placeholder "What needs to be done?", submit **Create** `.navy`, and an inline `.error` (`role="alert"`, `aria-invalid="true"` on the input) for "Title is required." or the server message. Enter submits. After success the input is cleared, keeps focus, and the new row appears at the bottom. Hidden for Viewers, archived, completed sprints.

### Overdue (AC 26, 32; Decision 19)
Overdue = Active sprint, end date set, viewer's local date after the end date. One shared helper decides it. Shown as:
- Backlog page: a banner above the sprints (`.banner-warn`, `role="status"`): bold "⚠ Overdue" then "Sprint 4 ended on 2026-10-23 (3 days ago). Complete it when the work is finished." plus an outlined badge "⚠ OVERDUE · ENDED 3 DAYS AGO" in the sprint's header. "3 days ago" is days between local dates ("yesterday" for 1, "today" never shows because end day itself is not overdue).
- Board: the sprint bar's badge "⚠ OVERDUE" and a banner (`.banner-warn`, `role="status"`) "⚠ Overdue  This sprint ended on 2026-10-23 (3 days ago).  Complete it on the Backlog page" (link). Writers and Viewers both see it. No banner without an end date or before it passes.
- Never colour alone: the word, the icon and the date are always present; the red border is decoration.

### Create / Edit sprint dialog (`dialogs.html`, AC 8-9, 35)
`<dialog class="app-dialog">` (existing shell: teal band `h2` title, body, footer). Title "Create sprint" / "Edit <name>". Fields (labels bold above inputs): **Name** (required, `maxlength=80`, prefilled in Create from `GET .../sprints/next-name`), **Goal** (textarea, 3 rows, `maxlength=500`), **Start date** and **End date** (`type="date"`, side by side), hint "Dates are for display. Starting and completing a sprint is always done by hand." Footer: error line (flex, left), **Cancel**, `.primary` **Create sprint** / **Save**. Field errors (`.field-error`, `role="alert"`, `aria-describedby`, `aria-invalid`) under the field: "Name is required.", "End date must not be before the start date."; the footer line shows "Fix the fields marked above." or a server message. Focus goes to Name on open and to the first invalid field on error. Esc and Cancel close without saving.

### Delete sprint (AC 35)
Dialog title "Delete <name>?", body "Its N work items will return to the bottom of the backlog. This cannot be undone." and hint "The deletion stays in Sprint history." Footer: Cancel, **Delete sprint** (`.danger`). Default focus on Cancel.

### Complete sprint dialog (AC 36)
Title "Complete <name>". Summary line "**<name>**: N items done, M unfinished." (singular "1 item done"). If M > 0, a `fieldset.choices` with legend "What should happen to the M unfinished items? Choose one." and three radios (`.choice`, label for each radio; the choice box gets a 2px teal border and pale fill when selected):
1. **Move unfinished items to the backlog**: hint "They go to the top of the backlog, in their current order."
2. **Move unfinished items to a planned sprint**: a `select` (aria-label "Planned sprint") listing Planned sprints. Disabled (radio too) with the hint "Create a planned sprint first." when there are none.
3. **Create a new sprint and move unfinished items there**: a text input (aria-label "New sprint name", `maxlength=80`, defaulted from `next-name`, editable) and hint "The new sprint is Planned. You can edit its name now."
Sub-controls (select, name input) are disabled until their radio is selected. No radio is selected on open. Footer: error line, **Cancel**, `.primary` **Complete sprint**, `disabled` until a radio is selected (and, for option 3, the name is non-empty). Footnote "Done items stay in <name> as a record." If M = 0: no fieldset, the line "All items are done. Done items stay in the sprint as a record." and Complete sprint enabled. A server error stays in the footer, the dialog stays open, nothing changed. After success: close, reload the page data; if option 3 was used the new sprint appears as a Planned section.

### Work item dialog: Sprint field (`work-item-sprint-field.html`, AC 37)
A `label` "Sprint" with a `select` in the `.props` grid, after the Epic field. Options: "Backlog", then every Planned and Active sprint as "<name> (Active|Planned)" (state words from `/api/sprint-states`, never hard-coded). Changing it saves immediately (PATCH) like the other fields and refreshes the board or backlog behind the dialog; failure shows in the footer error and restores the previous value.
- Item in a Completed sprint: `select` disabled showing "<name> (Completed)", plus a hint "Completed sprints are read-only." under it.
- Viewer or archived: disabled, current value shown (existing banner explains).
- Epic type: no select; the label "Sprint" and the fixed text "Not applicable (epics are not part of a sprint)" (`p.hint`, black text). The same text replaces the select as soon as Type is switched to an epic type in the dialog.
- Create dialog (new item): the field is present for non-epic types, preset to the active sprint (or Backlog). A status line `role="status"` under the properties reads "This work item will be created in <Sprint name>." or, with no active sprint, "No sprint is active. This work item will be created in the Backlog." For an epic type: "Epics are not part of a sprint." The Epic View's "Create child" opens the same dialog with the same rules.

### Board (`board-sprint.html`, AC 24-29)
- **Sprint bar** above the board toolbar when a sprint is active: `.sprint-bar` with name (`h2`), Active badge, dates, optional Overdue badge, link "Open Backlog" (right), and the goal on its own line when set. Followed by the overdue banner when overdue.
- **No active sprint:** the toolbar keeps the h1, status badge and **Create work item** (writers; right aligned), filters and Group by are hidden, the columns are not drawn, and an `.empty` box says "No active sprint." / "The board shows the work in the active sprint. Start a sprint on the Backlog page." / (writers only) "Work items you create now go to the Backlog." / a link "Go to the Backlog". Viewer and archived: same box without the create sentence and without the button.
- **Created into the backlog:** after a create with no active sprint, the dialog closes and a `.notice` (`role="status"`) shows "<KEY> was created in the Backlog. It is not on the board because no sprint is active." with an "Open Backlog" link and Dismiss.
- **Active sprint, no items:** sprint bar and the columns drawn empty (count 0 in each header).
- **Epics (AC 29):** epic-type items are never cards. With Group by = Epic, a lane exists only for epics that have a child among the visible items; the lane header text is "<KEY> <title>" and, as today, the epic chip on cards and the lane title open the Epic View. The "No epic" lane holds the rest.

### Sprint history (`sprint-history.html`, AC 43-46)
The last section of the Backlog page: `details.sprint` titled **Sprint history** with an event count ("8 events"); collapsed by default; lazy loading on first open is allowed (show "Loading..." in `role="status"`). Content is `ul.hist-list`, newest first; each `li.hist-item` has: outlined kind badge (`.badge`, label from `/api/sprint-event-kinds`: Created, Edited, Started, Completed, Deleted), a sentence (`.hist-text`, names bold), and `<time class="hist-time" datetime>` "YYYY-MM-DD HH:MM" formatted like the work item History tab. Sentences (text only, never HTML):
- "<actor> created <sprint>"; "<actor> started <sprint>"
- "<actor> edited <sprint>" plus a `ul.hist-changes` of "Field: old to new" lines for the changed fields (empty value shown as "none")
- "<actor> completed <sprint>: <D> done, <U> unfinished moved to <target>" where target is "the Backlog", "<sprint name>" or "new sprint <name>"; with U = 0: "<D> done, none unfinished"
- "<actor> deleted <sprint>: <N> items returned to the Backlog"
Below the list, **Show more** (appears when the server has older events). Empty: "No sprint activity yet." Error: `.banner-warn` with `role="alert"`, "Could not load sprint history." and a **Retry** button. Visible to Viewers and on archived projects.

### States and accessibility checklist (QA)
- Every control that is not a submit is `type="button"`; every input has a visible or visually hidden label; focus ring is the global teal ring (gold inside the band).
- Read-only: no Create sprint, no sprint action buttons, no handles, no `draggable`, no quick-create rows; Viewer sees the notice "You can view the backlog but not change it (your group is Viewer)." (group name may come from the user object); archived sees "This project is archived; its work items are read-only."
- Hostile and long text (sprint names, goals, titles, epic names, actor names) shows literally and wraps; no horizontal page scroll at 375px (the board keeps its own scroller). Rows wrap, sprint header actions drop below the title.
- State is always a word: Active, Planned, Completed, Overdue, the check mark on done pills. Contrast pairs are listed at the top of `src/sprints.css`.
- Dialog and page strings above are exact; counts use singular for 1.

## Questions for the owner
1. **A or B?** (Recommendation A.)
2. **Dates format.** Mockups show ISO dates (2026-10-12 to 2026-10-23), the same as the data. Prefer a friendlier "12 Oct to 23 Oct 2026"? (Only the string format changes.)
3. **Spec points the design leans on** (from the spec's open questions, unchanged here): the read-only Epics section, always offering "new sprint" in the Complete dialog, and the local-date overdue rule.
4. **Done count wording.** "N items · M done" counts the terminal status only (epics excluded). Fine, or show "M of N done"?
5. **Board with no active sprint hides the filter bar.** If you would rather keep it visible but disabled, say so.
