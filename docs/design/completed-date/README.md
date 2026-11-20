# Completed date: design (single recommended option)

Spec: `docs/specs/completed-date-on-cards.md` (owner accepted all open-question defaults). Mockup: `main.html` (open from disk; it links the real `public/css/app.css` and `src/completed.css`). Data is project 3 "EFS Automation"; "today" is Nov 20, 2026.

## The design

- **Board card.** Cards in the terminal status get one extra row at the bottom of the existing meta area: the resolution label, then `✓ Completed Nov 20` in 12px muted text (no new colour). The row is its own full-width line (`.card-done`, `order: 1`, `flex-basis: 100%`) so the first meta row (type, key, epic, priority, comments, avatar) keeps its current layout and the avatar stays on it. Why a row of its own: the meta row is already full at the 240px column width, so appending ~115px to it would wrap unpredictably. Cost: terminal cards are about 20px taller than today. Other cards are unchanged.
- **Item dialog.** A read-only "Completed" field in the Properties grid, right after Resolution, shown only while the saved item is in the terminal status. It is a `readonly` text input styled like a disabled field (pale teal, black text), with the date as its value and the full tooltip.
- **Backlog row.** Kept, not dropped. The date is a suffix inside the existing status pill: `✓ Complete · Nov 20`. No new column or header; the pill is already variable width and the row already wraps (title is the flexible part).

## What the developer builds

Date text (one shared formatter, `public/js/`, unit tested): `Nov 20` when the completion year (viewer's local time) equals the current year; `Nov 20, 2025` otherwise. Tooltip text: `Completed Nov 20, 2026 at 3:42 PM by Robert Michaels`; when `completed_by` is null, `Completed Nov 20, 2026 at 11:10 AM` (no "by"). Tooltip always has the year.

| Where | Markup | Text | Title |
|---|---|---|---|
| Board card | `<span class="card-done">` wrapping `resolutionLabel(item)` and `<span class="completed" title>` | `✓ Completed Nov 20` (check is literal text) | full tooltip |
| Dialog | `<div class="completed-field" hidden>` inside `.props`: `<label for="completed-input">Completed</label><input type="text" id="completed-input" class="ro" readonly>` (no `name`) | `Nov 20` | full tooltip on the input |
| Backlog row | `<span class="pill-date" title>` inside `.status-pill.is-done` after the status text | ` · Nov 20` (middle dot, spaces) | full tooltip |

Rules:
- Render only when `isTerminal(item.status)` and `completed_at` is set. Never print "Invalid Date" or an empty row; with a null date the card shows the resolution label alone.
- All text and titles are set as text (`el()` / `textContent` / attributes), never HTML. Hostile titles and a hostile `completed_by` show literally (see the mockup).
- Card: no handlers on the new spans; drag and click behave as before. Same markup in read-only (archived, Viewer) boards.
- Dialog: field shown/hidden with the saved item, not the unsaved status choice; re-evaluated after save returns. Hidden for a new item.
- Backlog: if a row wraps at 1024px viewport or wider only because of the suffix, drop the suffix and tell the owner (spec AC 20 allows it).
- Not on Timeline, Sprints, Test Cases or Daily Report.

## QA checklist

1. **Card height.** A Complete card is one 12px text row (about 20px) taller than the same card in In Progress; no other card changes height. The avatar, comment count and priority stay on the first meta row.
2. **Wrapping.** At a 240px column: `✓ Completed Nov 20, 2025` and `Cannot Reproduce` never break mid-text; if both do not fit on one line the date moves under the label as a unit. Long title (150+ chars) wraps in the title only. No horizontal overflow in the column.
3. **Tooltips.** Card, dialog input and backlog date show `Completed <Mon d, yyyy> at <h:mm AM/PM> by <name>`; `by` omitted when `completed_by` is null; year always present; local time zone (a completion at 23:30 local shows that local day).
4. **Year rule.** Current-year completions show `Nov 20`; any other year shows `Nov 20, 2025` on all three surfaces.
5. **Contrast.** `.completed` is `--muted` (#62666a) on white = 5.8:1 (AA). Dialog field is black on `--teal-soft`. Backlog suffix is black on `--teal-soft`. No colour is the only carrier of meaning (the word "Completed" and the check are text).
6. **States.** Card dragged out of Complete loses the row immediately; dragged in gains it from the server response; failed move shows neither. Reopened item shows no row, no dialog field, no pill suffix. Archived project and Viewer: shown the same, cards `draggable="false"`.
7. **Keyboard / a11y.** Dialog field is reachable by Tab, has a visible label and is announced read-only. Default focus ring (2px teal) is unchanged.
8. **Hostile text.** `<img src=x onerror=alert(1)>` in a title and a script-like completer name render as literal text; no alert, no markup.

## Notes for the owner

No conflicts with the spec. The dialog shows only the date (as the spec says); the who and time are tooltip-only, which the spec accepts (AC 14). If you would rather show "by Robert Michaels" visibly in the dialog, say so; it is a one-line change.
