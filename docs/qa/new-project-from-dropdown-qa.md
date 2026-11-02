# QA: New project from the Project dropdown

Spec: `docs/specs/new-project-from-dropdown.md` (AC 1-20, AC 9/10 amended as the owner decided)
Design: `docs/design/new-project-from-dropdown/README.md` and `states.html`; `docs/design/STYLE.md` part 8
Branch: `sprints-backlog-restyle`. Uncommitted changes: `public/js/projectScope.js`, `public/css/app.css`, `README.md`, `docs/specs/new-project-from-dropdown.md`, `tests/newProjectFromDropdown.test.js`, `docs/design/STYLE.md`, `docs/design/new-project-from-dropdown/`. `public/index.html` and `public/js/projects.js` are unchanged (git status confirms).
QA date: 2026-10-28. Nothing was committed. Only this file was written under `docs/qa/`.

## 1. Commands and results

### Targeted tests (fresh run)

Command:
```
node --test tests/newProjectFromDropdown.test.js tests/projectScope.test.js tests/source.test.js tests/sprintView.test.js tests/permissions.test.js
```
Result: `tests 148`, `pass 148`, `fail 0`, `cancelled 0`, `skipped 0` (duration about 37 s). The full suite was not run, as instructed.

Lint and typecheck: none configured (`package.json` has only `start` and `test`).

### Live check (headless Edge, CDP)

- Edge: `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, headless, driven over the DevTools protocol from Node.
- Data: a copy of `data/app.db` (`scratchpad/qa/copy.db`, Casey set to Viewer in the copy only) and a fresh database with no projects (`scratchpad/qa/fresh.db`). `data/app.db` was only copied, never opened. The app was not run on port 3000 or 3055.
- Servers: `PORT=3077` on the copy and `PORT=3078` on the fresh DB, with `FILES_DIR` pointed at a scratch folder. Both were stopped after the run.
- Scripts (in the scratchpad, not in the project): `scratchpad/qa/run.mjs` (main run, output in `scratchpad/qa/run2.out`), `scratchpad/qa/visual.mjs` (screenshots), `scratchpad/qa/listfail.mjs` (AC 16).
- Result: 75 checks PASS in the main run. Two entries printed FAIL, and both are wrong expectations in my script, not app defects (see section 4). The visual and list-failure runs passed all checks.

Process note: my first live run had a bug in the script. Its wait matched the old `?project=1` URL before navigation finished, so it archived the copy's PROJA project. Those results were discarded. The copy was rebuilt from `data/app.db`, the servers were restarted, and the full run was repeated. Everything reported below comes from the rebuilt data.

## 2. Acceptance criteria

| # | Verdict | Reason |
|---|---|---|
| 1 | PASS | Admin on board, backlog and sprints: options are PROJA, SFPM, a disabled `────────────` separator, then `New project...` (`run2.out` S1). The entry sits after `.brand` in the top bar. |
| 2 | PASS | Viewer (casey) on board, backlog and sprints: projects only, no separator, no entry (S10). The check uses `session.can` after `session.ready`. |
| 3 | PASS | Entry never selected on load; `localStorage` holds `1`, never `__new__`. Unit tests show `parseId` and `resolveProject` reject the sentinel. Archived-by-URL extra option sits after live projects and before the separator (S5). |
| 4 | PASS | Focused the select, set SFPM, pressed ArrowDown: the entry was reached and the dialog opened (S2). Native `<option>`, no custom widget. Enter was not driven separately. |
| 5 | PASS | Dialog is `dialog.app-dialog` titled "Create project". URL unchanged behind it. Scroll position was not measured. |
| 6 | PASS (deviation 1) | Name max 80, required; Key max 10, `PROJ` placeholder, required, uppercased as typed; Create (primary) and Cancel; no extra fields. Statuses come from the server: Planning, In Progress, Completed, Cancelled. Default is Planning. The spec's three-status list is stale (see section 4). |
| 7 | PASS | Focus on Name when the dialog opens. Cancel and Escape both close it. |
| 8 | PASS | Server messages shown verbatim in the foot error area: "Name is required and must be 1-80 characters.", "Key must be 2-10 uppercase letters (A-Z).", "Key PROJA is already used by another project." (409). Dialog stays open and values are kept. |
| 9 | PASS | In flight: Create disabled and reads "Creating..."; Cancel disabled; `aria-busy="true"`; Escape ignored (S4, delayed API stub). Double click created exactly one project (S4). |
| 10 | PASS | Cancel and Escape close, nothing is created, dropdown reverts, focus returns to the select (S2). Placeholder restored on Project-not-found and fresh-install pages (S11, S12). |
| 11 | PASS | `backlog.html?project=1&x=1` goes to `backlog.html?project=3` (x dropped). New project selected and labelled `QAA - <name>`. `pm.project` updated (S4). Same behaviour on Sprints (S5) and on a fresh board (S11). |
| 12 | PASS | New project's issues endpoint returns `[]`. Sub-navigation links carry `?project=<new id>` (S4, S11). |
| 13 | PASS | Created as Completed from the dialog; stored live, not archived (S5). Default Planning confirmed (S2, S6). In Progress is accepted by the server in the POST unit test, but was not driven through the dialog. |
| 14 | PASS | Fresh DB, board with no `?project=`: "No active projects." with dropdown holding placeholder, separator and entry. "Go to the Projects page" link kept. Create from there lands on `board.html?project=1` (S11). Viewer on that state: no dropdown. |
| 15 | PASS | Project-not-found with live projects: placeholder, projects, separator, entry (S12). Fresh DB with none: placeholder, separator, entry (S11). Cancel returns to placeholder. |
| 16 | PASS | `GET /api/projects` failed (CDP request interception). Current project still shown with the entry and a list-failure message. Entry opened the dialog, which loaded 4 statuses. Creating navigated to `board.html?project=6` and selected `LDN - List down` (`listfail.mjs`). |
| 17 | PASS (deviation 4) | With `projectScope.guard.isDirty` stubbed true: "Switch project?" confirm first, no create dialog. Confirm Cancel: nothing opens, dropdown reverts, `discard` not called. Confirm OK: `discard` called, create dialog opens. No real work item edits were used. |
| 18 | PASS | Failed creates (empty name, bad key, duplicate key) left the URL, `pm.project` and project count unchanged (2 projects before, 2 after) (S3). |
| 19 | PASS | Projects list (`index.html`), Users and Login have no dropdown and no entry (S9, S13). `#create-form` still hidden as before. `index.html` and `projects.js` are not in the diff. |
| 20 | PASS | Viewer POST `/api/projects` returns 403 from the server (S10). With a stubbed 403 in the dialog, the server message shows in the error area and the dialog stays open with values kept (S7). |

Non-criteria checks:
- Regression: picking an existing project in the dropdown still switches and remembers it (S9). Sub-navigation carries the project id.
- Gaps: an empty board (fresh DB) and an 80-character name with HTML-like text (rendered as text, not markup; the dropdown shows the literal text) were checked (S4, S11). Moving a card to its own column and deleting an issue on the board are outside this change and were not exercised.

## 3. Visual check against the design

Screenshots (in `scratchpad/qa/`): `visual-board-dropdown.png`, `visual-dialog-desktop.png`, `visual-dialog-error.png`, `visual-board-narrow.png`, `visual-dialog-narrow.png`.

- The dialog matches the design README: teal band with "Create project", body on the page colour, white foot with the error line above Cancel and Create. Create is the primary button.
- The 380px dialog fits with the narrow side padding.
- The top bar dropdown shows the existing `Project` label and select. The separator and entry are native options, so their look is the browser's.
- Observation: while the dialog is open, the dropdown behind it still shows "New project..." as its value until the dialog closes. The spec does not forbid this.

## 4. Deviations and non-blocking notes

1. Status list (deviation 1): ACCEPT. The dialog's status list comes from `GET /api/project-statuses`, the same call the Projects list create form uses (`public/js/projects.js` line 198). The server returns four statuses, including Cancelled. The spec's AC 6 text ("order Planning, In Progress, Completed") is stale and should be amended. Not blocking.
2. Entry on `test-cases.html` (deviation 2): ACCEPT. The Test Cases page is project-scoped under the existing global-scope spec and loads the same script. Live check shows the entry there (`visual.mjs`). AC 1 names only three pages, so the spec should be amended. Not blocking.
3. Status-load failure (deviation 3): ACCEPT. The dialog opens, shows the load error in the alert area, leaves the status select empty and creates with the server default (Planning, verified in S6). The spec does not define this case. Not blocking.
4. Unsaved-edit confirm (deviation 4): ACCEPT. The confirm and discard path was verified with a stubbed guard, not with real unsaved work item edits. The guard is the shared one from the existing scope work. Not blocking, but real-edit coverage is still UNTESTED live.
5. Keyboard note: on a closed native select, ArrowDown onto the entry fires `change` at once and opens the dialog. Arrowing past the last project will therefore open the dialog. This is native behaviour and meets AC 4 as written. Worth knowing for the owner.
6. Script expectation errors in the main run, not app defects:
   - S5 (AC 3): the server returns live projects in its own order (QAA, PROJA, SFPM), not by id. The output is `[QAA, PROJA, SFPM, QAC (archived), separator, New project...]`, which meets AC 3.
   - S12 (AC 15): the output is `[Choose a project, QAA, SFB, PROJA, SFPM, separator, New project...]`, which meets AC 15. My expected count was for the original data.

## 5. Verdict basis

No criterion fails. The two script FAILs above are my expectation errors, and the output shows the behaviour is correct. The deviations are acceptable. Spec wording needs a small amendment (status list, test-cases page). The untested items are the real work item unsaved-edit path, the keyboard Enter key, and scroll position, none of them blocking.

VERDICT: GO
