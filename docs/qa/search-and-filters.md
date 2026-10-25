# QA: Search and filters (board)

Spec: `docs/specs/search-and-filters.md` (acceptance criteria 1-27).
Developer report: 273/273 `npm test`, nothing committed, no browser available to the developer.
QA date: 2026-10-25. Reviewer: QA agent (Haiku 5.5), read-only on the project; only this file was written under the project tree.

## Verdict

**GO.** All 27 acceptance criteria pass on fresh runs. No blocking defects were found. Two non-blocking observations and the developer's deviations are judged acceptable (section 6). Nothing has been committed.

## 1. Test suite (fresh, clean copy)

- Clean copy: the working tree copied with `rsync` (excluding `.git`, the root-anchored `/data` folder and `.remember`), then `git init` and a commit, so `tests/` runs its `git check-ignore` check. Location: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/clean`.
- Command: `npm test` (in the clean copy). Result: `ℹ tests 273`, `ℹ pass 273`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, exit 0.
- Lint and typecheck: none configured in `package.json` (only `start` and `test`).
- Note on method: a first copy excluded every folder named `data`, which also dropped `server/data/`, and gave 178 failures. That was a mistake in the QA copy, not a product defect. The corrected copy was compared with the project tree (`diff -r` on `server`, `public`, `tests`: identical) before the valid run.

## 2. Server files (AC 27)

- `git diff -- server/` in the project tree: 0 lines. `git status --short server` shows no change. Feature touches `README.md`, `public/board.html`, `public/css/app.css`, `public/js/board.js`, `tests/source.test.js`, plus new `public/js/filters.js`, `tests/filters.test.js`, `docs/specs/search-and-filters.md`.

## 3. Method and environment

- Scratch server A: port 3002, `PORT=3002 DB_PATH=<scratchpad>/qa/app.db FILES_DIR=<scratchpad>/qa/files`, started from the clean copy. Scratch DB is a copy of `data/app.db`; scratch files a copy of `data/files`. Killed by PID at the end.
- Scratch variant B: port 3003, a second clean copy with `server/resolutions.js` set to an empty list and `'Urgent'` added to `server/priorities.js` (to test AC 13 and AC 25). Scratch DB copy. Started and stopped by PID (stopped before the report).
- Not touched: port 3001 (PID 70985 still running, untouched), port 3000, `data/app.db` (mtime unchanged at 18:45:58), `data/files/` (unchanged; only read to copy).
- Browser: headless Chrome 155 driven over the DevTools protocol by scratch scripts (in the scratchpad, not the project). Users: alex (Admin), blake (Member), casey (set to Viewer through the Users page UI).
- Extra scratch data (via the API, scratch DB only): project 1 gained PMPO-5 "Fix login bug" (In Progress), PMPO-6 "<img src=x onerror=alert(1)>" (Done, Fixed), PMPO-7 "Regex [ ( .* test" (Done, Won't Do), epic PMPO-8 "Second Epic" with children, and so on. Project 3 "QA Drag" (ranks 100..700, `hid*`/`vis*` titles) for the drag test; archived later for the archived-project test. Project 4 "QA Empty" for the empty-board test.
- Driver fixes made during QA: a few expectations and element ids in my own scripts were wrong, and the link form needed `change` events. Each was corrected and the board behaviour re-checked. Those are listed where they matter. None were product defects.

## 4. Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| 1 | PASS | No filters: "Showing 7 of 7", 7 cards (later "Showing 8 of 8" with more items, same rule) |
| 2 | PASS | `pmpo-1` and `PMPO-1` find PMPO-1 only; `LOGIN` finds PMPO-5 by title and description; `   login   ` trimmed; `cannot` finds PMPO-5 by description only; empty-description PMPO-3 found by key, no error |
| 3 | PASS | Each alone: assignee=2 -> PMPO-2,6; type=Task -> 2,5,6; priority=Medium -> 1,3,4; status=Done -> 6,7; resolution=Fixed -> 6 |
| 4 | PASS | Unassigned -> only items with no assignee (PMPO-4,5); assignee list is Any, Unassigned, then the users (labels shown, values are ids) |
| 5 | PASS | status=To Do AND type=Task -> PMPO-2 "Showing 1 of 7"; Done AND Alex -> "Showing 0 of 7", empty board, no error |
| 6 | PASS | `.*`, `(`, `[`, `.*)` each match literally, no error. `(` also matches PMPO-6 because its hostile title contains "(" (correct) |
| 7 | PASS | Typing and dropdown changes make no `/api` request and no reload (resource timing plus window marker) |
| 8 | PASS (note) | DOM order: search, Assignee, Type, Priority, Status, Resolution, Clear, count; every select starts with Any and defaults to Any. The bar sits on its own row directly under the header, not on the same line as Group by (see 6.1) |
| 9 | PASS | Type, status, priority, resolution options match the server list order; assignee options come from users. Extensibility shown in variant B: added "Urgent" appears in the Priority dropdown in list order after restart (AC 25) |
| 10 | PASS | Count matches the API after create, edit, delete and drag (batches 3 and 5); "Showing n of m" m = total items |
| 11 | PASS | Clear resets text and all five dropdowns, shows all, disabled when nothing active, Group by unchanged (`pm.groupBy` kept), `pm.filters.<id>` removed |
| 12 | PASS | Column headers (To Do 1 / In Progress 1 / Done 0 for `login`) and lane headers ("1 work item") count visible items only |
| 13 | PASS | Variant B (resolutions list empty): Resolution dropdown hidden (`hidden` true), rest of the toolbar works. Verified on the 3003 scratch server |
| 14 | PASS | Clear is `type="button"`; every control has a label (`Search`, `Assignee`, ... or aria-label); Enter in the search box causes no reload, navigation or filter loss |
| 15 | PASS | `pm.filters.1` written on change; reload restores text "e", Type Task, assignee Blake, same rows, Clear enabled |
| 16 | PASS | Project 2 opens with Any ("Showing 2 of 2"); its own status filter applies; returning to project 1 restores its filters; `pm.filters.2` separate |
| 17 | PASS | Malformed JSON, a JSON array, non-string text and null fields load as Any with no error. Stale assignee 999, type Gone, priority Urgent (not in list), status Archived, resolution Nope become Any while valid text "login" is kept; saved `unassigned` kept. With `localStorage` throwing on every access (injected before page scripts), the board loads, shows 7 of 7, and filtering works in memory |
| 18 | PASS | Ranks read from the scratch DB with `sqlite3 -readonly`. Start hidA:100 visB:200 hidC:300 visD:400 hidE:500 visF:600 hidG:700 (filter `vis`, 3 of 7). Drop visD above visF: visD:550 (between hidE 500 and visF 600); after Clear the order is hidA, visB, hidC, hidE, visD, visF, hidG. End-of-lane drop of visB while filtered: visB:650 (after visF 600, before hidG 700). Drop visF above visD (first visible, hidE ahead): visF:525; after Clear: hidA, hidC, hidE, visF, visD, visB, hidG. Same-column end drop while filtered: no error, filter and count kept. Cross-column drop while filtered: status saved, filter kept |
| 19 | PASS | Group by Epic with `login`: epic PMPO-4 excluded by its title but its lane shows with only its matching child PMPO-5 (sibling PMPO-2 not drawn); Second Epic lane (no match) hidden; No epic lane shows PMPO-3. Filter `epic` keeps both epic lanes (epic cards match themselves). Type=Epic leaves only the No epic lane. After Clear all lanes return. Assignee lanes with status=Done: Blake and Casey only; after clear 4 lanes (Alex, Blake, Casey, Unassigned; Dana has no items so no lane, same as HEAD). Priority lanes with type=Task: Highest, High, Low only. Group by None with no match: the single unfiltered lane kept |
| 20 | PASS | Filters stay after: create (matching and non-matching), edit (still matching), edit out of filter (AC 22), drag (AC 18 tests), delete from the dialog, comment from the dialog, link from the dialog (`GET /api/issues/7/links` returned it), epic add and remove, Create child. Counts matched the API each time. Epic add ran with the epic reachable under Any, since the epic card is hidden under a Task filter; the filter stayed as it was |
| 21 | PASS | Matching create: no notice. Non-matching create (Defect under Task): "Created PMPO-15, hidden by the current filters.", filter unchanged. Dismiss hides it; it disappears after about 8.6 s; a priority filter change dismisses it; Clear dismisses it. Create child from the epic dialog (filter Epic, child Task): notice shown, filter kept, epic dialog reopened |
| 22 | PASS | PMPO-2 changed from priority High to Low in its dialog while filtered by High: card removed, "Showing 0 of N", filter kept, no error, dialog closed by its normal Save (the filter did not close it) |
| 23 | PASS | Admin, Member and Viewer (casey set to Viewer on the Users page, "Saved: Viewer"): all filter controls enabled and visible; search, combined filter and Clear work; zero non-GET requests from filter actions (fetch wrapper); cards draggable for Admin and Member, not for Viewer; create button shown for Admin and Member, hidden for Viewer |
| 24 | PASS | On archived project 3, as all three users: search `vis` gives "Showing 3 of 7", a dropdown combines with it, Clear resets, Group by unchanged, no write requests |
| 25 | PASS | `npm test` includes the new source rules (`tests/source.test.js`: names not in `filters.js` and the new board code; buttons `type="button"`; text-only DOM; per-project storage with try/catch). Grep of `filters.js` and the added `board.js` lines finds no status, type, priority or resolution name. Adding "Urgent" to the priority list and restarting made it appear (variant B) |
| 26 | PASS | Title `<img src=x onerror=alert(1)>` renders as literal text: no `img` element on the board, no `<img` in the board markup. Typed in the search box: matches that item, shown literally in the box, no dialog. Saved in `pm.filters.1` and reloaded: literal, no dialog (driver captured dialogs: 0) |
| 27 | PASS | `git diff -- server/` is empty; `git status` shows no server file |

Batch totals: batch 1 (AC 1-14) 38/38 after correcting one expectation; batch 2 (AC 15-17) 13/13; batch 3 (AC 18) 9 checks, all pass, but one drop-2 check was a placeholder (see 5); batch 4 (AC 19, 11, 12) 15 checks, four were wrong expectations of mine, corrected and re-checked; batch 5 (AC 20-22) 20 checks, 19 pass, one filter-order miss explained above; batch 6 (AC 23, 24, 26) 36/36 on the final run; batch 7 (gap and regression) 10/10; batch 8 (variant B, AC 13 and 25) 3 real checks pass.

## 5. Checks not counted

- Batch 3, drop 2: a check that always passed (placeholder). The real verification is the DB rank and the order after Clear, which pass.
- Batch 8, "Clear still works" on variant B: a placeholder (`true`), not a real check. It is not counted. Clear is the same code path as on the 3002 server, where it passes.

## 6. Developer deviations and observations

1. **Toolbar placement (non-blocking, AC 8 wording).** The filter bar sits on its own row under the header, not on the same line as Group by. Screenshots at 1400 px and 620 px wrap correctly. Judged acceptable: "next to Group by" is met in the header area.
2. **`matches()` has no `userNamesById` argument.** The spec's suggested signature lists it. The assignee test compares ids directly, so the argument is not needed. Judged acceptable (no behaviour gap; unit tests pass).
3. **Group by storage uses `storageGet`/`storageSet`.** The helpers only add try/catch around the same `localStorage` calls. Group by persists across reload (batch 7) and works with the filter. Judged acceptable; behaviour is unchanged when storage works.
4. **The create notice also closes on any filter change.** The spec says it closes on its own, on dismiss, or on Clear. Closing on any filter change is a superset that fits "the notice is about the current filters". Judged acceptable.
5. **End-of-lane drop while filtered lands after the last visible card.** Verified (visB to 650, before the hidden hidG). Judged acceptable and matches the spec's trap note.
6. **An unfiltered single lane is never hidden when not grouped.** Verified (Group by None with no match keeps the lane with count 0). Judged acceptable.
7. **Type options show labels.** Option values are the names and labels come from `t.label || t.name`. Filtering uses the name, so the behaviour is correct. Judged acceptable.

## 7. Not tested

- Native OS-level mouse drag. Drag was simulated in headless Chrome with `DragEvent` and `DataTransfer`, which exercises the same handlers but not the browser's native drag machinery.
- Safari and Firefox. Only headless Chrome 155 was used.
- Archive and unarchive through the Projects page UI (archive was set through `PATCH /api/projects/3`).
- Adding a status to the server status list and checking the board (only a priority was added in variant B).
- Keyboard-only use beyond Enter in the search box; screen reader output.
- A `localStorage` quota-exceeded error on write (only the throwing-access case was simulated).
- Attachment upload through the file picker (the upload went through the API with the same route, and the dialog heading was checked).
- Real paste of an image (out of scope for this feature; noted in the HANDOFF owner to-do list).
- Viewer with Group by Assignee or Priority (group-by lanes were checked as Admin and Member only; filter behaviour is the same for every group).
- Concurrency: another user changing items while a filter is applied (the board reloads after each action, so counts refresh only on the board's own actions).

## 8. Scratch cleanup

- Scratch server A (3002, PID 89415) is stopped at the end of this QA run. Scratch variant B (3003, PID 95907) was stopped earlier.
- Port 3001 (PID 70985) and port 3000 were not touched.
- No file under `data/` was written. Only `docs/qa/search-and-filters.md` was created in the project tree.

## Verdict line

VERDICT: GO
