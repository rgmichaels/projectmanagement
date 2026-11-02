# Export buttons: design

Spec: `docs/specs/export.md` (UI is the same whether the CSV is built on the server or in the browser). Files:

- `a-text-button.html` - option A, every page in context, wide and 360px.
- `b-icon-button.html` - option B, same frames.
- `states.html` - default, hover, focus, busy, disabled, empty notice, error, read-only, long and hostile names (A and B side by side).
- `src/export.css` - the NEW block to append to `public/css/app.css` (marked `NEW` / `END NEW`); `src/base.css` is a copy of app.css used only by the mockups.

Placement is identical in both options; only the look of the button differs.

## Options

**A - text button "Export" (recommended).** A 30px secondary button (white, navy outline, bold 13px), the same family as Edit and Clear. No new vocabulary, no icon to learn, accessible name starts with the visible word. Costs about 70px per header.

**B - icon button with tooltip.** A 32px square button with a download arrow (inline SVG, `aria-hidden`), accessible name from `aria-label`, tooltip (`data-tip`) opening to the left on hover and keyboard focus. Saves about 40px in busy Backlog headers. Drawbacks: the icon alone is less obvious; touch users get no tooltip; the spec says the busy button "reads Exporting...", so it must widen into text while busy (a small layout jump in a crowded header); two code paths (icon plus text).

**Recommendation: A.** The Backlog headers wrap cleanly anyway (they are flex-wrap), the label matches the spec wording ("Export"), and it is the cheapest to build and test. Choose B only if you want the headers as quiet as possible.

## Placement (both options)

| Page | Where | Accessible name | Tooltip / title |
|---|---|---|---|
| Board | Last item of `.filter-bar`, right-aligned (`span.filter-export`), after Clear and "Showing n of m" | `Export board` | Filtered: "Download the 12 items shown as a CSV file". No filters: "Download all 31 items as a CSV file" |
| Backlog, active or planned sprint | Last control inside that header's `.sprint-actions`, after Complete sprint / Edit or Start / Edit / Delete | `Export Sprint 4` | "Download Sprint 4 (15 items) as a CSV file" |
| Backlog section | Inside a new `.sprint-actions` in the Backlog header, first line, beside the item count. The dark selection strip stays on its own second line | `Export Backlog` | "Download the Backlog (37 items) as a CSV file" |
| Backlog, completed sprints | Same last-in-actions slot in each completed sprint's `summary.sprint-head` | `Export Sprint 3` | "Download Sprint 3 (11 items) as a CSV file" |
| Sprints page | Inside `.sprint-pick`, directly after the select (label, select, Export) | `Export <selected sprint name>` | "Download Sprint 4 (15 items, in sprint order) as a CSV file" |

Why last: Export lands in the same place in every panel and never moves the primary action (Complete sprint, Start sprint). It sits next to Delete on planned sprints; that is safe (Delete confirms, Export only reads). Viewers and archived projects: `sprintActions` returns nothing today, so create a `.sprint-actions` containing only Export. The button is always shown and enabled for them.

Sprint scope change: that design adds a Scope change panel under the goal line. Export lives in the header row, so the two never share space. Frame 5 shows both.

## Controls and states the developer must build

- Element: `<button type="button" class="export-btn">`, text `Export` (A) or inline SVG icon (B, class `icon-only`, `data-tip` = the tooltip text). `aria-label` = "Export " + target, `title` = the tooltip text (A and B). Names set with `setAttribute`/`textContent`, never HTML.
- Default, hover (teal text plus second border line), keyboard focus (global 2px teal ring) as in `states.html`.
- Busy: text becomes `Exporting...` (A and B), `aria-busy="true"` and `aria-disabled="true"`, 60% opacity, min-width 104px. Use `aria-disabled` and ignore clicks instead of `disabled`: a disabled button loses focus in browsers, and spec AC 19 says focus stays on the button after success. Deviation from AC 19's word "disabled"; visually and functionally the same.
- Empty list: recommended is enabled; click downloads a headers-only file and shows an inline `.notice` with `role="status"`: "Nothing to export; the file has headers only." under the control (frame 3 in states). Alternative, only if the owner says so: native `disabled` plus visible `.export-why` text "Nothing to export" (frame 4).
- Error: `.banner-warn` with `role="alert"`, bold "Export failed." then the server text (as text), and a `button.link` Dismiss; button back to enabled. Placement: Board, full width under the filter bar (`.export-msg.on-board`); Backlog and Sprints, directly under the header of that panel (`.export-msg`).
- Notice and error clear on the next click on Export or on Dismiss. Only one message per page area; a new export replaces the old one.
- Counts in tooltips: Board uses the number behind "Showing n of m". Counts are display only.
- Narrow: no media queries needed. Headers wrap (flex-wrap); Export stays the last item of its group. Sprints: select gets `flex:1; min-width:0` at 600px (existing rule) so Export stays beside it.
- Long or hostile sprint names wrap in the header; Export keeps its size (states frame 2).
- Completed sprint summary: the button is inside `summary`. Check that clicking or pressing Space on it does not toggle the section; if it does, call `stopPropagation`/`preventDefault` on the click, or move Export into the sprint body.

## Open questions for the owner

1. **Empty list: enabled or disabled?** Spec AC 4 and 16 say always enabled, with a "headers only" notice. A disabled button with a reason is mocked as an alternative. Recommend enabled (matches the spec, keyboard-reachable, no reason text to maintain).
2. **Option A or B?** Recommend A.
3. **Busy state wording:** keep "Exporting..." per AC 19, using `aria-disabled` rather than `disabled` so focus is kept. Confirm.
4. **Completed sprints on Backlog:** the spec says "each sprint panel header". Completed sprints are collapsed `details` rows; the mockup gives them Export too. Say if you want them excluded.
