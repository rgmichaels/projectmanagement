# Sprint scope change: design

Spec: `docs/specs/sprint-scope-change.md`. Open the `.html` files straight from disk (they link only `src/scope.css`). Everything is read-only: no buttons write anything (the only buttons are Retry and the log toggle). No new colours or tokens. STYLE.md has no dark mode, so none is designed; contrast follows part 4 of STYLE.md (all new text is black, `--muted` on white/page, `--teal` on white, or `--navy` on white; gold and `--teal-mid` are never text).

## Files

| File | Shows |
|---|---|
| `a-summary-tiles.html` | Option A, 7 frames: normal (full page), log expanded, no changes, no estimates, grace-only, migrated sprint, completed (frozen) |
| `b-compact-table.html` | Option B, same 7 frames |
| `c-side-panel.html` | Option C, same 7 frames |
| `states.html` | Shared by all options: Planned, not tracked, loading, error with Retry, hostile and long text, Viewer / archived |
| `badges.html` | "Added after start" badge on the Sprints table, Backlog row, Board card (short form, narrow) and work item dialog |
| `src/scope.css` | Part 1 repeats existing rules; the block "NEW (append to public/css/app.css)" is the only CSS to add |

## Options

**A. Summary tiles.** Six tiles in a row: Planned, Added, Removed, Estimate changes, Current total, Growth, then an equation line ("40 h planned + 13 h net change = 53 h current total"), the baseline and grace lines and the collapsed log. Best at a glance and makes the reconciliation obvious; uses about 160px of height before the table. Tiles wrap to 3 then 2 per row on narrow screens.

**B. Compact ledger table.** A 3-column table (Measure, Items, Hours) at most 520px wide with a ruled-off Net scope change row, a highlighted Current total row and a Growth row. Shortest panel (about 200px with the lines), real table semantics for screen readers, reads like an audit. Less eye-catching than A.

**C. Side panel.** The Sprints table keeps the left column; a 300px sticky panel on the right leads with the growth headline ("+32.5% growth"), then the figures, lines and log. The table is always visible beside the numbers, but it loses 300px of width (the table already scrolls sideways at 720px); below 900px the panel moves above the table.

## Recommendation

**Option B.** The spec's numbers are an equation (planned + added - removed + estimate changes = current), and a ledger shows that exactly with the least height, so the table of work items stays on screen. It needs no new layout (a small table in a panel, like the existing permission matrix) and no sideways-scroll cost, unlike C. Choose A if the owner wants the growth figure to be the first thing seen; A also fits the "sprint figure" look from time tracking.

## UI contract (all options)

Placement: in `.sprint`, directly under the goal line (the sprint summary line is the `.sprint-head`, which keeps the existing "Estimate N h" figure; it equals Current total) and above the work item table. Option C puts it in an `aside` beside the table.

**Panel heading:** "Scope change" (Active and Planned/loading/error), "Final scope change" (Completed). Hint beside it: "Hours are work item estimates. Read-only." Use `section` with `aria-labelledby` on the h3.

**Figures (exact labels):** Planned; Added (count items, hours); Removed (count items, hours); Estimate changes (count changes, signed hours); Current total ("Final total" when Completed); Growth. Hours show at most two decimals and always the unit " h". Added is shown "+14 h", Removed "-4 h", Estimate changes and net signed ("+3 h", "-1 h", "0 h"). Count wording: "1 item" / "3 items", "1 change" / "3 changes". Growth text: "+32.5% growth", "-5.0% shrink", "0.0% (no change)", "n/a" (planned 0). Never colour alone; in A and C a positive growth also gets a danger-coloured edge or text, but the sign and word carry the meaning.

**Lines under the figures (in this order):**
1. "Baseline: N items, X h" (singular "1 item"). When `baseline_late`: a `.late-note` "Baseline captured on YYYY-MM-DD" on the same line and the visible text "The sprint was already running when tracking began." (visible text, not a tooltip, so keyboard users get it).
2. Only when any grace event exists: "Adjusted in first 24h: +A h added, -R h removed, +/-E h estimate changes (not counted as scope change)".
3. Completed only: "Sprint completed YYYY-MM-DD. These numbers are final."
4. Only when `unestimated_added_count` > 0: "N added items have no estimate."

**Log:** `details.scope-log`, closed by default, summary "Scope change log (N)". Rows oldest first: kind label (Added / Removed / Estimate changed, from `GET /api/scope-event-kinds`), key (mono), title, hours at right ("+4 h", "-4 h", "5 h to 8 h (+3 h)"), then actor and time. Grace events carry the text "adjusted in first 24h" in a dashed tag. Added events without an estimate carry the tag "no estimate". Empty: "No scope changes yet." The list scrolls inside 280px. Titles and actor names are text only.

**States (exact text):**
- Normal / no changes / no estimates / grace-only / migrated / completed: see frames 1 to 7 in each option file.
- Planned: "Scope is tracked from the moment the sprint starts." (`role="status"`)
- Not tracked: "Scope change was not tracked for this sprint." (`role="status"`)
- Loading: "Loading scope change..." (`role="status"`)
- Error: `.banner-warn` `role="alert"` "Could not load scope change." plus the server message and a **Retry** button that reloads only the scope request.
- The migrated Active sprint never shows the not-tracked message.
- Viewer / archived: identical, no hidden or disabled controls.
- After the work item dialog saves on this page, the panel re-reads and replaces its contents (AC 25); the open/closed state of the log is kept.

**Badge (`badges.html`):** text "Added after start" with a leading "+". Class `.badge.added-late`: white, navy border and text, sentence case, 11px bold. Placements:
- Sprints table: inside the Title cell right after the title button.
- Backlog sprint panel row: right after `.brow-title`, before the status pill.
- Board card: short form `.badge.added-late.short` in `.card-meta` after the key; visible text "Added", `title="Added after start"` and a `.visually-hidden` "Added after start" so the accessible name is the full text.
- Work item dialog: under the Sprint select, the full badge plus the hint "Added after the sprint's first 24 hours."; absent when not flagged.
- No badge for grace-period adds, backlog items or Planned sprints. It disappears when the item leaves the sprint and returns on a later after-grace add. Completed sprints keep the badge on their items.

## How QA checks the UI against this

1. Open the Sprints page on an Active sprint with changes: panel is between goal and table; labels, signs, units, counts and growth wording match the contract; Current total equals the header "Estimate N h".
2. Click the log summary: opens, shows rows oldest first, grace rows tagged, no-estimate rows tagged; reload keeps nothing open (default closed).
3. Check each state in the list above, including a sprint with zero estimates (growth "n/a", note present), grace-only, and the migrated sprint (note + explanation, no "not tracked").
4. Complete a sprint: heading becomes "Final scope change", "Final total", completion line; numbers unchanged by later edits.
5. Enter a title `<img src=x onerror=alert(1)>` and actor-visible names with markup: shown literally in the log, no alert.
6. Badge on all four places for an item added after the grace period; absent for a grace-period add; disappears after moving the item out; appears again after re-adding past grace (fake the clock per the spec).
7. Keyboard: Tab reaches the log summary, Enter/Space toggles it; Retry reachable; focus ring visible (`:focus-visible` teal). No colour-only meaning. Viewer and archived project show everything with no write controls.
8. Narrow (below 700px, below 900px for C): no sideways page scroll; the panel wraps.

## Open questions for the owner

1. Which option (recommended: B)?
2. The spec's AC 18 gives the badge a boolean only, so the dialog says "Added after the sprint's first 24 hours" without a date. If a date is wanted, the API needs an `added_at`.
3. Backlog and Board show the badge only for items in a tracked sprint; the Board's "Completed" sprint is not shown, so completed-sprint badges only appear on the Sprints page. Acceptable?
4. Spec Open question 4 (a subtler badge for grace-period items): this design shows none, only the log text, as the spec proposes.
