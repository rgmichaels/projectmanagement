# Timeline (Gantt) design

One recommended design (owner deadline; no options). Spec: `docs/specs/gantt-chart.md`. Open any mockup straight from disk. CSS: `src/timeline.css`, the block after "NEW: Timeline" is what to append to `public/css/app.css` (the part above it is a mockup copy of existing styles). No new colour tokens; the epic purple `#eae6ff` / `#403294` already exists (epic chip).

Files: `timeline.html` (Week, default), `zoom-day.html`, `zoom-month.html`, `readonly.html` (archived/Viewer), `states.html` (drag, resize, drop from Unscheduled, save error, collapsed, empty, load error), `dialog-dates.html` (task dialog date fields).

## Design in one paragraph

A Jira-style timeline in the app's teal look. Page = top bar, `.subnav` (Board, Backlog, Sprints, **Timeline** with `aria-current="page"`, Test Cases), a head row (h1 "Timeline", Archived badge if archived, Day/Week/Month segmented control at the right), a message area, a one-line legend, then a two-column layout: the chart (flexible) and the "Unscheduled" panel (280px; stacks under the chart below 900px). The chart is one scroll container (`.tl`, max-height 560px, scrolls both ways): a sticky header axis, a sticky 260px label column, rows 34px high, bars 22px high. Rows top to bottom: group "Sprints" (one read-only bar per dated sprint, then a muted note "Sprints without dates: ..."), then one group per epic (header row with the epic's own bar or rollup bar, children beneath), then group "No epic". Epic with no scheduled children and no dates shows no bar (and is in Unscheduled).

## Controls, labels and states (UI contract for QA)

**Page.** `h1` "Timeline". Zoom is `div.seg[role=group][aria-label="Zoom"]` with three `button[type=button]` "Day", "Week", "Month"; the active one has `aria-pressed="true"` (teal fill, white text); default Week; remembered in `localStorage` `pm.timelineZoom`. Message area `#timeline-message[role=alert]` shows `.banner-warn` (bold "Could not save." then the server text, plus a "Dismiss" link button); a load failure shows `.banner-warn` "Could not load the timeline." with "Retry". Project not found uses the existing "Project not found." pattern.

**Axis.** Header is sticky; corner cell reads "Epic / work item". Day: one 36px column per day, top tier month and year ("Nov 2026"), second tier "Th 5" (weekday and date); weekend columns shaded. Week: 12px per day (84px per column), top tier month and year at the first week of a month, second tier the Monday date ("Nov 2"). Month: 4px per day, one cell per month labelled "Nov 2026". Weekend shading is Day only. Range per spec AC 15; chart opens scrolled so Today is visible; zoom keeps today (or the scroll centre) in view.

**Today.** A 2px `--danger` vertical line through all rows plus a red flag "Today" at the top of the axis. The word is always there, never colour alone.

**Rows.** Label column (sticky, stays while scrolling): group header = collapse toggle (`button.tl-toggle`, `aria-expanded`, `aria-label` "Collapse PM-1" / "Expand PM-1", glyph down/right), "Epic" tag, key (mono), title button (opens the dialog, truncated with ellipsis, full text in `title`), count pill of scheduled children. "No epic" and "Sprints" groups have a toggle and count but no key. Item row = type dot, key, title button. Sprint row = name and a state badge (Planned, Active, Completed). Initial state all expanded; a collapsed group keeps its own/rollup bar.

**Bars** (all work item and epic bars are `button[type=button].bar` with `aria-label` "KEY Title, Status, Oct 26 to Nov 13" and a `title` tooltip with the full text):
- To Do: pale teal fill, teal border, black text. In Progress: solid teal, white text. Done: grey fill, grey border, muted text, normal weight, and a leading check mark so it is not colour only.
- Epic own-date bar: pale purple fill, 2px solid `#403294` border and text. Rollup bar: diagonal-stripe pale purple, 2px dashed `#403294` border, label ends " (rollup)", default cursor, no handles, not draggable; clicking it opens the epic dialog.
- One-date item: one-day bar on that date (width = one column unit; min 12px). Bars narrower than 110px put the label outside, to the right of the bar, in normal text.
- Sprint bars: Planned = pale teal with mid-teal border; Active = solid teal, white bold; Completed = white with grey border and grey text. Label "Sprint 3 · Active". Not focusable, not clickable (`role=img`, `aria-label` with dates).
- Text is always inserted as text (hostile text such as `<img src=x onerror=alert(1)>` shows literally, see timeline.html PM-32 and the Unscheduled PM-42).
- Focus: 2px black outline plus a white halo on a bar; teal outline on other controls. Enter on a focused bar or row opens the dialog.

**Drag and resize (editors only).** Cursor `grab` on a bar, `grabbing` while dragging, `ew-resize` on the 8px edge handles (5px on short bars). Handles are dark translucent strips shown on hover and on keyboard focus and during a drag; they are `aria-hidden`. While moving: the bar lifts (shadow, `.is-dragging`), a dashed outline (`.bar-origin`) stays at the original position, and a black tooltip (`.tl-tip`) near the bar says "KEY · Start Nov 2 – Due Nov 20 (19 days)". While resizing: same, only the changed date is stated: "KEY · Due Dec 4 (Start Nov 16 unchanged)". Snaps to whole days at every zoom; edges cannot cross (min one day). Movement under 3px is a click and opens the dialog; a click after a drag does not. On release send PATCH; on failure the bar returns and gets a red 2px outline (`.is-reverting`) until dismissed or the next action, and the message area shows the `.banner-warn`.

**Drag from Unscheduled.** Rows have `draggable="true"` with a grip glyph. While dragging, the source row dims with a dashed navy border; the chart gets a dashed navy outline (`.is-drop-target`); a shaded dashed column (`.tl-dropcol`) shows the 7 days the item will occupy starting at the day under the pointer, with a tooltip "KEY · Nov 16 – Nov 22 (7 days)". After the drop the row leaves the list and the bar appears in its epic group or "No epic".

**Unscheduled panel.** `aside.panel.unsched`, `h2` "Unscheduled" and a count pill. Hint: "Drag a row onto the chart to schedule it for 7 days, or click it to set dates." Rows: grip, type dot (or purple "Epic" tag for an epic), mono key, truncated title; click or Enter opens the dialog. Empty: dashed box "Nothing unscheduled." (`role=status`). The list scrolls inside the panel (max 480px).

**Empty and error.** No work items: dashed `.empty` box "No work items yet." with a one-line hint, and the Unscheduled panel empty ("Nothing unscheduled."). Sprints and axis may still render. No dates anywhere: axis today minus 1 month to today plus 3 months, all items in Unscheduled.

**Read-only (archived project or Viewer).** Archived badge in the head (archived only), a `.banner[role=status]`: "This project is archived. You can read the timeline but not change it." (Viewer: "You can view the timeline but not change it."). Bars: default cursor, no handles, no drag. Unscheduled: no grip, no `draggable`, hint "Read-only. Click a row to open it." Clicking still opens the (read-only) dialog.

**Task dialog dates.** Two native `input type="date"` labelled "Start date" and "Due date" in the existing `.props` 2-column grid after Estimate (visible labels, 12px bold like the others, linked with `for`/`id`). Hint under the grid (editors only): "Both dates are optional. Leave empty if not scheduled. Use one date for a one-day bar." Server error appears in the dialog's existing `.error[role=alert]` (for example "Due date must not be earlier than start date."), and the offending inputs get `aria-invalid="true"` (2px danger border, existing rule). Read-only: both inputs `disabled`, pale teal, hint hidden. Both fields join the dirty flag.

## Questions for the owner

1. Clicking a rollup bar opens the epic's dialog (the spec only says rollup is not draggable). Assumed yes.
2. Sprint bars are not focusable (read-only, no action). The spec's keyboard AC covers only work items and Unscheduled rows, so this fits; say if you want them focusable.
3. In Month zoom one day is 4px wide, so dragging is fine-grained; the tooltip carries the exact dates. Acceptable for a POC?
4. Rows are fixed at 34px and the epic title in the label is truncated; there is no resizable label column.
5. No "Today" jump button is designed (not in the spec). Easy to add later.
6. The mockup dialog excerpt places the dates after Estimate and Assignee; the real order depends on the built dialog, keep them with the other metadata.
