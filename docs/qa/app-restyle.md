# QA: app restyle, Edit project, resolution colours, Enhancement type, status pipeline

Scope (uncommitted working-copy changes): app-wide restyle per `docs/design/app-restyle/README.md` (Option A, teal chrome), Edit project dialog, resolution label colours, the `Enhancement` work item type, the 7-status pipeline with the chevron track, and legacy status migration.

Checked against: the restyle README (UI contract and QA checklist), the `a-teal-chrome-*.html` mockups (visual comparison only; no pixel diff), and the developer's report (not trusted; everything re-run here).

## Verdict

**NO-GO.** Blocking: item 5b (legacy status migration). The migration function exists but is never called, so existing `To Do` and `Done` work items are left with statuses that are no longer on the board.

## Commands run

| Command | Result |
|---|---|
| `npm test` (in `C:\Users\elermichaels\Code\projectmanagement`) | exit 0; 281 tests, 281 pass, 0 fail, 0 cancelled, 0 skipped |
| Scratch server: `PORT=3917 DB_PATH=<scratchpad>/qa.db FILES_DIR=<scratchpad>/qaf node server/index.js` | started; login `POST /api/auth/login {"username":"alex"}` OK; stopped at end (port 3917 no longer listening) |
| Legacy DB check: `openDb()` on a scratch file with `To Do` / `Done` / `In Progress` rows, then reopened | see item 5b |
| WCAG contrast, computed in Node (relative luminance formula) | see item 3 |

No application code was modified. Port 3100 and `data/app.db` were not touched.

## Per-item results

### 1. App-wide restyle (Option A)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Top bar is teal on every page, not `#0052cc` | PASS | Top bar background `rgb(11,93,102)` on login, projects, board, users |
| 1b | Computed `--primary` is `#0b5d66` | PASS | `getComputedStyle(:root).--primary` = `#0b5d66`; `--teal` same |
| 1c | Dialog tokens on `:root`; old blues gone | PASS (spot-check) | `--page #f8fafa`, `--navy #154973`, `--gold #face00`, `--danger #c0300b` on `:root`; page background `rgb(248,250,250)` |
| 1d | Font stack is the dialog stack | PASS | body `font-family` starts with "Proxima Nova", then Helvetica Neue, system fallbacks |
| 1e | Headings h1 teal bold 20px | PASS | Projects h1 `rgb(11,93,102)`, 20px |
| 1f | Buttons: white, 1px navy border, 4px radius; `.primary` teal | PASS (spot-check) | Secondary button radius 4px, border white on the dark bar; "Create project" and "Create work item" teal fill |
| 1g | Focus ring `2px solid teal`, gold inside top bar | PASS (spot-check) | Board: focused lane button outline `solid 2px rgb(11,93,102)`, `:focus-visible` matched. Global rule at `app.css` line 38; gold rule for `.topbar :focus-visible` at line 66 |
| 1h | Table header pale teal, rows separated, 8px radius | PASS | Projects `th` background `rgb(229,237,237)`, teal text; table `.projects` with 1px border and 8px radius |
| 1i | Sign-in: teal title band, Sign in disabled until a user is chosen, works | PASS (visual + flow) | h1 band teal with white text; signed in as alex through the form and reached the projects page. Disabled-until-chosen not separately checked |
| 1j | Board: columns pale teal `#e5eded`, 8px radius, teal uppercase headers | PASS | Column background `rgb(229,237,237)`; visible in screenshot |
| 1k | Card: white, type colour left border, black type text with coloured dot | PASS | Card `rgb(255,255,255)`, left border `rgb(75,173,232)` for Task; type chip text black `rgb(0,0,0)` on white; dot visible in screenshot |
| 1l | Filter bar is one white card | PASS | Screenshot; `search` block with 1px border |
| 1m | Users page matches table style | PASS | Screenshot: teal header row, white table, same top bar |
| 1n | Dialog looks identical to before | UNTESTED | No pre-change baseline was captured. Dialog band teal `rgb(11,93,102)`, 8px radius, `#f8fafa` background, chevron track present; looks correct but not compared pixel-for-pixel |
| 1o | Mobile 375px: no horizontal page scroll (board's own scroller is allowed) | PASS | Projects page: `scrollWidth` 375 = `clientWidth` 375. Board: `scrollWidth` 360 = `clientWidth` 360; board columns scroll inside their own container |
| 1p | Tab through each page; focus ring visible | PARTIAL | Global `:focus-visible` rule present and verified on the board and the Edit button. Full Tab-order walk per page not completed (DOM order has no positive `tabindex`; `tabindex="0"` only on board.js lines 315, 364). Dialog focus trapping not checked |
| 1q | Error banner (`#message`) styled per README | PARTIAL | Create-project error renders as danger text (`rgb(192,48,11)`) on a white panel with the message "Key DEM is already used by another project." The board's `#message` banner (white, danger border, 4px left) is styled in CSS but not triggered in the browser |
| 1r | Notice banner (filter hides a newly created item) | PASS | Created DEM-10 under the Defect filter; notice shows "Created DEM-10, hidden by the current filters." with `rgb(229,237,237)` background, `teal-mid` border, `role="status"` |
| 1s | Empty board | PASS | Project EMP with no items: 0 counts, empty lanes shown ("Unassigned 0 work items"), no error, no crash |
| 1t | Empty projects list | UNTESTED | Demo and EMP exist, so the empty state was not reached in the browser. Markup and CSS exist (`#empty-state`, dashed border per README) but were not checked |
| 1u | Hostile text: `<b>hostile</b>` and a 170-character unbroken title | PASS | Rendered as literal text; the long title wraps inside the card, no card overflow |

### 2. Edit project dialog

| # | Check | Result | Evidence |
|---|---|---|---|
| 2a | Edit button per row (manage-projects only) | PASS | "Edit Demo" button in the row (alex, Admin) |
| 2b | Dialog opens with name, status, archived, key | PASS | Name "Demo", status select with 4 options, archived checkbox, key "DEM" in the band |
| 2c | Blank name blocked with message | PASS | "Name is required. Enter a name and save again." Dialog stays open |
| 2d | Archived enabled only for Completed or Cancelled | PASS | Archived disabled for Planning; enabled after choosing Completed; hint "Only a project in Completed or Cancelled status can be archived." shown |
| 2e | Save writes name, status and archived in one PATCH | PASS | Saved "Demo QA", Completed, archived; API returned name, status and `archived: true`. Restored to Demo / Planning / unarchived afterwards |
| 2f | Dialog style (radius, background) | PASS | Radius 8px, background `#f8fafa` |
| 2g | Cancel and Escape close without saving | UNTESTED | Cancel button present; Escape not exercised on this dialog |
| 2h | Server rejects an archived non-archivable change | UNTESTED | Not exercised (the UI disables the box, so this is a server-side path only) |

### 3. Resolution label colours

| # | Check | Result | Evidence |
|---|---|---|---|
| 3a | Every resolution colour passes 4.5:1 with white text | PASS | Fixed `#2f6b3f` 6.37:1; Won't Do `#62666a` 5.79:1; Duplicate `#5243aa` 7.66:1; Cannot Reproduce `#8a4b08` 6.79:1 |
| 3b | Board label renders white on the server colour | PASS | Computed `rgb(255,255,255)` on `rgb(47,107,63)` for DEM-8 (Fixed) |
| 3c | Unit test guards contrast | PASS (by reading the test file header) | `server/resolutions.js` comment says `tests/resolutions.test.js` checks every entry; the suite passed |

### 4. New work item type "Enhancement"

| # | Check | Result | Evidence |
|---|---|---|---|
| 4a | Type exists between Issue and Epic, with colour and icon | PASS | `GET /api/types`: `Enhancement`, colour `#2e9e5b`, icon `+` |
| 4b | Appears in create dialog | PASS | Type select options: Defect, Task, Issue, Enhancement, Epic |
| 4c | Created and saved as Enhancement | PASS | Created DEM-3 and DEM-9 as Enhancement; edited DEM-4 from Defect to Enhancement and saved; API confirmed `type: "Enhancement"` |
| 4d | Appears in the type filter | PASS | Type filter option "Enhancement" present |
| 4e | Card uses a type-colour edge and black text with a dot | PASS | "Enhancement DEM-3" chip, green dot, black text in screenshot |
| 4f | Contrast of type colour | NOTE | White text on `#2e9e5b` would be 3.41:1, so the design's dot-not-fill rule is what makes it pass. Confirmed the card uses black text on white |

### 5. Status pipeline and legacy migration

| # | Check | Result | Evidence |
|---|---|---|---|
| 5a | Seven statuses in order: Planning, Ready, In Progress, Internal Testing, UAT, Go Live, Complete | PASS | `GET /api/statuses`; board columns in that order; filter and create-dialog status options match |
| 5b | Legacy migration: `To Do` becomes the first status, `Done` becomes the last | **FAIL** | `server/db.js` defines `migrateStatuses()` (line 237) but `openDb()` never calls it (call list at lines 253-256 is `migrateResolution`, `migrateUsername`, `migrateReporter`, `migrateGroups`). Reproduced: a DB with `To Do`, `Done` and `In Progress` rows, reopened with `openDb()`, still reads `To Do`, `Done`, `In Progress`. `To Do` and `Done` items do not appear in any board column |
| 5c | Migration order and resolution invariant | FAIL (design risk, to fix with 5b) | `migrateResolution()` sets `resolution` only for rows with `status = 'Complete'`. A legacy `Done` item renamed later would have no resolution, which breaks the "terminal status <=> resolution" rule. The rename must run before `migrateResolution()` or set the default resolution itself |
| 5d | Migration is idempotent and leaves `In Progress` unchanged | PASS (by reading the code) | Uses `UPDATE ... WHERE status = ?`; the `In Progress` row was unchanged in the reproduction. Not covered by a test |
| 5e | Test coverage for legacy migration | GAP | No test references `migrateStatuses`. The 281 passing tests do not catch 5b |
| 5f | Chevron track: 7 steps, current step marked | PASS | DEM-4 (In Progress): steps Planning, Ready, In Progress [now], Internal Testing, UAT, Go Live, Complete. Past steps green with checks; current step navy |
| 5g | Status change to Complete asks for a resolution | UNTESTED | Server rule exists (`server/validation.js` lines 108-113); UI resolution select exists; not walked through in the browser |
| 5h | All 7 statuses accepted by the API | PASS | Created and PATCHed items into Planning, Ready, In Progress, Internal Testing, UAT, Go Live, Complete (DEM-2..DEM-8) |

### Gaps the developer did not verify

| Gap | Result | Notes |
|---|---|---|
| Keyboard tab order and visible focus on each page | PARTIAL | See 1p |
| Board drag-and-drop with drop indicator | PASS (synthetic events) | The browser's native drag tool did not move DEM-2 (the drop did not register). Dispatching `dragstart`, `dragover` and `drop` events on the card and the Ready column showed the `.drop-indicator` (4px, `--navy`, inside the target column), and the drop moved DEM-2 from Planning to Ready. Native pointer drag was not reproduced |
| Error and notice banners | PARTIAL | Notice PASS; create error PASS; board `#message` not triggered |
| Empty board | PASS | See 1s |
| 375px width | PASS | See 1o |
| All 7 statuses and Enhancement in create and edit | PASS | See 4b, 4c, 5a, 5h |
| Legacy-DB migration check | FAIL | See 5b and 5c |

## Other observations

- The browser console logged one error on the projects page after the duplicate-key create attempt. This is most likely the expected 409 response, but the error was not inspected.
- `tests/extensibility.test.js` and `tests/issues.test.js` mutate the status list in-process (`STATUSES.splice`); the suite passes, but it means those tests use an 8-status list in part. Not a blocker.
- Blake (Member without manage-projects) was not signed in during this pass, so the hidden Create and Edit controls were not checked in the browser.
- Browser screenshots and snapshot files written by this session under `C:\Users\elermichaels\Code\.playwright-mcp` were deleted. Snapshot files from 14:54 to 14:57 (before this session's browser work) were left in place because they were not created by this pass.
- Scratch data (`<scratchpad>/qa.db`, `<scratchpad>/legacy.db`) lives in the session scratchpad and was not touched in the project.

## Required before GO

1. Call `migrateStatuses(db)` from `openDb()`, before `migrateResolution(db)`, and make it set the default resolution on renamed `Done` items (or otherwise keep "terminal status <=> resolution").
2. Add a test that opens a DB with `To Do` and `Done` rows and checks they become `Planning` and `Complete` (with a resolution).
3. Re-run `npm test` and this QA pass item 5b.

VERDICT: NO-GO: 5b (legacy `To Do` and `Done` items are not migrated; `migrateStatuses` is never called).
