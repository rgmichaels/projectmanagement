# QA report: Resolution

Spec: `docs/specs/resolution-and-comments.md` (Draft, 2026-10-24), 23 acceptance criteria (resolution ACs, numbered from 1 within the spec).
Build under test: uncommitted working tree on `main` (HEAD `fffe1cb`). Application code was not modified. Only this file was written under `docs/qa/`.
QA date: 2026-10-24 (local). Node: the project's `npm test`. Browser: Playwright 1.59.1, bundled Chromium, headless.
Continues `docs/qa/resolution-partial.md` (the stopped run). Its passing items are reused and cited as "partial"; new checks are cited as "new".
Regression references: `docs/qa/board-mvp.md` (GO, 40 ACs) and `docs/qa/ticket-discussion.md` (GO, 32 ACs).

## Verdict

**GO.** All 23 resolution acceptance criteria PASS. No blocking defects. One minor defect (D1) is pre-existing MVP behaviour that the resolution work does not change; it is non-blocking. The wrong-card observation did not reproduce (0 of 10 injected-failure trials, 0 of 10 control trials), and the app code cannot plausibly cause it (see the section on it).

VERDICT: GO

## Commands run and results

| # | Command | Where | Result |
|---|---|---|---|
| 1 | `npm test` | repo root, working tree | exit 0; `tests 66 / pass 66 / fail 0 / cancelled 0 / skipped 0`. Log: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/qa-final/npm-test-final.log`. Matches the expected 66. |
| 2 | Scratch server: `PORT=3917 DB_PATH=<scratchpad>/qa-final/app.db node server/index.js` | repo root | Started on 3917 with a fresh scratch DB (deleted and recreated before the final browser run). Ports 3000 and 3001 were not contacted. Stopped by PID after the run; 3000 and 3001 still listening (`node` 61520 and 61123), untouched. |
| 3 | `curl` against `localhost:3917` (`GET /api/resolutions`, `GET /api/terminal-status`, `GET /api/projects/1/issues`, `POST` with unknown status) | API | Resolutions in order with `Fixed` default; terminal status `Done`; list items include `resolution` (null); unknown status on create returns 400. |
| 4 | `node browser.cjs` (Playwright, port 3917) | browser | 23 of 24 checks passed on the clean run. The one "FAIL" was a script check that counted the injected 500s from the same run (its console message), so it is a script artefact; the separate "no page errors" check passed. Script: `.../scratchpad/qa-final/browser.cjs`. |
| 5 | `node regression.cjs` (Playwright, port 3917) | browser | 7 of 7 passed. Script: `.../scratchpad/qa-final/regression.cjs`. |
| 6 | `node epicdrop.cjs` (Playwright) | browser | AC 20 browser check passed. Script: `.../scratchpad/qa-final/epicdrop.cjs`. |
| 7 | `node roundtrip.cjs` (Playwright) | browser | Detail-view status round trip keeps the stored resolution. Script: `.../scratchpad/qa-final/roundtrip.cjs`. |
| 8 | `node reloadfail.cjs` (Playwright, injected GET 500 after a successful PATCH) | browser | Reproduces D1 (see defects). Script: `.../scratchpad/qa-final/reloadfail.cjs`. |
| 9 | Wrong-card trials (in `browser.cjs`): 10 injected-failure trials + 10 control trials | browser | 0 of 10 and 0 of 10 wrong-card moves. |
| 10 | `grep` source checks (quoted patterns) for `Fixed`, `Won't Do`, `Duplicate`, `Cannot Reproduce`, `Done`, `CHECK` in `server/`, `public/`, `tests/`, `README.md` | repo | As described under AC 2 and AC 3. |
| 11 | `git check-ignore -v server/resolutions.js tests/resolutions.test.js` | repo | Exit 1 (not ignored). Both untracked, so they must be added in the commit. |
| 12 | Lint / typecheck | repo | Not configured (`package.json` has only `start` and `test`). Not run. |

Clean-copy `npm ci` and `npm test` (66/66), and the migration on a copy of the owner's `data/app.db`, were run in the partial session. They are cited from `docs/qa/resolution-partial.md` and were not re-run, as the QA brief asked. The owner's real `data/app.db` was not opened by this run.

## Per-AC results (1 to 23)

Verification key: **Test** = `npm test` case (name in `tests/resolutions.test.js` or `tests/resolution-extensibility.test.js`, passing in row 1). **API** = curl or fetch against the live scratch server. **UI** = Playwright. **Partial** = verified in the stopped run, cited from `docs/qa/resolution-partial.md`. **Code** = read only.

| AC | Result | How verified / reason |
|---|---|---|
| 1 | PASS | `server/resolutions.js` exports `RESOLUTIONS` in order: `Fixed` (`isDefault: true`), `Won't Do`, `Duplicate`, `Cannot Reproduce`. API: `GET /api/resolutions` returns the same list in that order (new). Test: "GET /api/resolutions returns the list in order with one default (AC 1)". |
| 2 | PASS | `server/statuses.js` `terminalStatus()` returns the last entry, `Done`. Only `isTerminalStatus` and `terminalStatus` are used outside the list (grep: no `Done` literal in `server/` or `public/` outside `statuses.js`). `GET /api/terminal-status` returns `Done` (new). Live variant B in partial (`Closed` appended after `Done`: the client did not hard-code `Done`). Tests: "the terminal status is the last status (AC 2)", "a status appended after Done becomes the terminal status (AC 2)". |
| 3 | PASS | Grep (new): the literal resolution names appear only in `server/resolutions.js`, in `tests/`, and in `README.md` prose (documentation, outside the spec's source scope). No `CHECK` on `resolution` (the only `CHECK` text is a comment in `server/db.js`). Test: "no hard-coded resolution names outside server/resolutions.js (resolution AC 3)", "schema has no CHECK constraint on status, type or resolution". |
| 4 | PASS | Partial, live variant A: `Obsolete` added to `RESOLUTIONS` and server restarted; the detail control showed it, `PATCH` accepted it, cards showed it. Test: "an added resolution is listed, accepted on PATCH and returned for cards (AC 4)". |
| 5 | PASS | New item has `resolution: null`: API (new; `resolutions.test.js` "a new work item has no resolution (AC 5, 14)"). UI (new): create dialog hides the Resolution control, and the created item (`Echo`) saved with null. Partial: create form saves null. Non-terminal items never hold a value (AC 13 test). |
| 6 | PASS | UI drag to Done (new): PATCH body was `{"status":"Done","rank":1000}` (no resolution sent); response `resolution: "Fixed"`; card shows `Fixed`. Detail-view move to Done with no explicit value stored `Fixed` (new). Test: "moving to Done sets the default; moving out clears it (AC 6, 8)". |
| 7 | PASS | Test: "a supplied valid resolution is stored instead of the default (AC 7)" (`PATCH {status:'Done', resolution:'Duplicate'}` stores `Duplicate`). Partial API checks. |
| 8 | PASS | UI drag out of Done (new): PATCH response `resolution: null`, card label gone. Detail move-out save (new): server `status: In Progress, resolution: null`. Test "moving out clears it (AC 6, 8)". |
| 9 | PASS | UI (new): in-column drop onto a Done card kept `Fixed` (status Done). Done item moved to another assignee lane, still Done, kept `Fixed`. Dirty-run observation (new): a Done item with `Won't Do` dragged to the Done column kept `Won't Do` (the same-status move is a no-op for resolution). Partial: Done item moved between swimlanes and a priority change both kept the resolution. Tests: "updates that keep the item in Done keep its resolution (AC 9)". |
| 10 | PASS | UI (new): detail change to `Won't Do` and Save; the card label changed to `Won't Do` without reload (waited on the DOM); after a reload the label and the API both show `Won't Do`. Test "changing the resolution of a Done item persists (AC 10)". |
| 11 | PASS | UI (new): drag to Done opened no dialog (Playwright dialog counter 0); the card showed `Fixed` from the server response (`resp.resolution === 'Fixed'`). Code: `moveItem` assigns `await api.patch(...)` result (`public/js/board.js`). |
| 12 | PASS | Test: "an unknown resolution is rejected and the item is unchanged (AC 12)". Partial API checks (4xx and unchanged). |
| 13 | PASS | Test: "resolution on a non-terminal item, or null on a terminal one, is rejected (AC 13)". Partial API checks. Validation in `server/validation.js` covers both cases (also `PATCH {status:'Done', resolution:null}` returns 400). |
| 14 | PASS | List: `GET /api/projects/1/issues` items have `resolution` (new, curl). PATCH responses include `resolution` (new, captured in the browser run, e.g. `{"resolution":"Fixed"}` and `null`). Test "a new work item has no resolution, in GET and list responses (AC 5, 14)". |
| 15 | PASS | Partial: migration of a copy of the owner's real `data/app.db` (no `resolution` column, four To Do items) applied cleanly; real file checksum unchanged. Partial: old-schema DB with two Done items backfilled to `Fixed`, ran once, did not re-run across restarts (manual resolution survived). Test: "existing Done items get the default resolution when the column is added (AC 15)". |
| 16 | PASS | UI (new): Done card shows `Fixed`; zero labels on To Do and In Progress cards (`.resolution-label` counts). Code: `resolutionLabel()` returns null outside the terminal status. |
| 17 | PASS | UI (new): control hidden for a To Do item; for a Done item visible, options read from `GET /api/resolutions` (`Fixed, Won't Do, Duplicate, Cannot Reproduce`), current value selected. Archived: disabled (see 21). |
| 18 | PASS | UI (new): changing status to Done showed the control with `Fixed` selected; changing to In Progress hid it; Save sent `status` only and the server stored `resolution: null`. Round trip Done→In Progress→Done keeps the stored value (`Duplicate` preserved; new, `roundtrip.cjs`). |
| 19 | PASS | UI (new): cross-lane drop (Assignee grouping) of a To Do card onto Done in another lane sent exactly one PATCH with `{"status":"Done","rank":3000,"assignee_id":2}`; response `resolution: "Fixed"`; persisted after reload with the `Fixed` label in the new lane. Failure path (new): injected 500 on the cross-lane PATCH returned the card to its lane and To Do, with no label (it had none before), and showed "Could not move QF-4: injected". Partial: injected 500 rollback for the single-lane drop. Test "a cross-lane drop into Done sets the default in the same update (AC 19)". |
| 20 | PASS | UI (new): Done epic `EpicOne` (`Fixed`) dragged into `EpicTwo`'s lane: message "QF-6 (Epic) cannot be placed in another epic lane.", zero PATCH requests, `epic_id` still null, resolution still `Fixed`. Test "a rejected epic-into-epic-lane drop changes nothing, including resolution (AC 20)" (server path; the test body PATCHes `status:'Done'` with `epic_id` and asserts the 4xx and an unchanged item). |
| 21 | PASS | UI (new): archived board showed the `Fixed` label on the Done card; detail resolution select disabled and `#detail-save` hidden. API (new): `PATCH {resolution:'Duplicate'}` on an archived project returned 409, value unchanged. Test "archived projects: resolutions readable, writes rejected, archiving keeps them (AC 21, 22)". |
| 22 | PASS | UI/API (new): snapshot of every item's status and resolution taken before archive and after unarchive (`PATCH {status:'Planning'}`, which auto-unarchives) were identical. Test "archived projects: ... archiving keeps them (AC 21, 22)". |
| 23 | PASS | `npm test` 66/66 (row 1). Test names cover every bullet: list order and default (AC 1); moves, honoured value, same-status and reorder (AC 6-9); invalid, non-terminal and null-on-terminal rejected (AC 12-13); terminal derived by appending a status and an added resolution (AC 2, 4); cross-lane default in one update (AC 19); archived writes rejected (AC 21). Test bodies for AC 2, 15, 19, 20 read; AC 15 and 19 bodies also checked in partial. |

Summary: 23 PASS, 0 FAIL, 0 UNTESTED.

## Regression check

Scope: the MVP and discussion ACs the resolution work touches. Existing suites: `npm test` covers the MVP suites (`issues`, `projects`, `extensibility`, `source`) and the discussion suites (`comments`, `time`) in the 66-test run, all passing (row 1). The per-suite split of the 66 was not re-derived.

| Reference | Result | Evidence |
|---|---|---|
| MVP AC 11 (archived read-only) | PASS | Row 21 above (UI and API). |
| MVP AC 17 (edit persists; create shows card) | PASS | `regression.cjs`: create via dialog shows the card without reload. Row 10 (edit persists after reload). |
| MVP AC 18 (delete from detail asks confirm; card removed) | PASS | `regression.cjs`: confirm count 1, card removed, API 404 (new). |
| MVP AC 19, 20 (columns from status list; card contents) | PASS | `regression.cjs`: empty board renders `To Do, In Progress, Done` with no cards; a 200-char title in Done stayed inside its column (card 436px, column 448px) and kept the label. |
| MVP AC 22, 23 (drag persists; rollback with message) | PASS | Rows 6 and 19; the same-column drop (`regression.cjs`) kept status and resolution. |
| MVP AC 35, 36 (cross-lane field update in one PATCH; epic rejection) | PASS | Rows 19 and 20. |
| MVP AC 37 (grouping does not PATCH) | PASS by existing test | Not re-checked in the browser. `tests/issues.test.js` (MVP AC 37) passes in row 1. |
| Ticket-discussion AC 2, 4, 10, 27 (discussion section, Discussion buttons do not submit the form, post adds a message, comment chip) | PASS | `regression.cjs` (new): discussion visible in the detail dialog, heading `Discussion (0)` then `(1)`, the dialog stayed open after Post, and the card chip changed to `💬1`. Test suite: `comments.test.js` passing. |
| Ticket-discussion AC 13 (post on a Done item) | PASS by existing test | Not re-run in the browser. The discussion QA verified it by API; `tests/comments.test.js` passes in row 1. |
| Gap: deleting an item on the board | PASS | `regression.cjs` (row MVP-18). |
| Gap: moving a card to the column it is already in | PASS | Same-column drop onto a Done card kept status and resolution (`regression.cjs`). |
| Gap: empty board | PASS | `regression.cjs` (row MVP-empty). |
| Gap: very long title | PASS | `regression.cjs` (row gap-long). |
| Gap: console and page errors | PASS | No `pageerror` in any run. The only console errors were the browser's "Failed to load resource: 500" lines for the deliberately injected failures (11 in total: 1 cross-lane, 10 wrong-card trials). |

Known MVP defect status: `docs/qa/board-mvp.md` D1 (POST accepted an unknown status) is fixed. `POST` with `status:"Nonsense"` now returns 400 (new, curl row 3). The fix is in `server/validation.js`, which validates `body.status` on create too.

## Wrong-card observation (after a rolled-back drop)

Question: after a drag that is rolled back by a forced failed PATCH, does dragging a different card on the same page without a reload move the wrong card?

**Result: not reproduced.** Method (`browser.cjs`, new project `QD` with W1 to W4 in To Do): an init script recorded every `dragstart` target. Each trial: force a 500 on the next PATCH, drag card A to Done (rolled back: A returns to To Do, confirmed by API), then drag a different card B to In Progress without reloading. Ten pairs (`W1→W2`, `W2→W3`, `W3→W4`, `W4→W1`, `W1→W3`, `W3→W1`, `W2→W4`, `W4→W2`, `W1→W4`, `W2→W1`).

- Failed-drop trials: 10 of 10 moved the intended card (B) to In Progress and only B. `dragstart` targets were A, then B, each time. 0 wrong-card moves.
- Control, same sequence without a failed PATCH: 10 of 10 correct. 0 wrong-card moves.
- The earlier partial observation (4 of 4 passing after a reload) was not contradicted; the wrong-card case did not show up in this harness.

**Could the app's dragstart/dragend cleanup cause it? Not plausibly.** From `public/js/board.js`:

- `dragstart` (line ~203) sets `state.dragId = item.id` from the card's own closure and writes the same id to `dataTransfer`. It is set again on every drag, so the most recent `dragstart` always wins.
- `dragend` (line ~209) removes the `dragging` class from its own card, sets `state.dragId = null` and removes the indicator. It cannot set a stale id; it only clears.
- `onDrop` (line ~320) reads `state.dragId`, clears it, and then calls `moveItem`. `moveItem`'s rollback runs `Object.assign(item, snapshot)` on the same item object from `state.items`, then `render()` rebuilds every card. The card that the next drag starts from is a new element bound to the correct item.
- Because `dragend` of the previous drag can only run before the next `dragstart` (the drags do not overlap), a late `dragend` cannot clear or redirect a new drag's state. The `requestAnimationFrame` that adds `dragging` only touches a card element.

So a stale `dragId` cannot point at a previous card, and the card moved is always the one whose `dragstart` fired. The most likely explanation for the partial run's intermittent occurrence is a headless drag-session artefact (Playwright re-targeting a stale element after the re-render), but this run did not reproduce it, so that remains a hypothesis. **Suggested manual check for the owner (optional, non-blocking):** with a real mouse, drag a card to Done with the server failing, then drag a different card without reloading.

## Defects

**D1 (minor, non-blocking; pre-existing MVP behaviour, not introduced by resolution).** A failed reload after a successful move rolls the card back and reports the move as failed.
- Repro (`reloadfail.cjs`): drag Delta (To Do) to In Progress with the `GET /api/projects/1/issues` response forced to 500 once. The PATCH returned 200 and the server stored `In Progress`. The UI showed Delta back in To Do with "Could not move QF-4: injected reload".
- Cause (code): in `moveItem` (`public/js/board.js`), `await reloadItems()` sits inside the same `try` as the PATCH, so its failure runs the rollback `catch`. The UI then disagrees with the server until a manual reload.
- Resolution-specific effect: a drop to Done in this state would show the card back in To Do without `Fixed`, while the server has `Fixed`. This is the same root cause.
- Why non-blocking: the server state is correct, it needs a failed GET right after a successful PATCH, and the MVP QA did not cover it. Suggested fix for the developer (not applied): run `reloadItems()` outside the rollback `try`, or on failure of the reload only show a "reload failed" message without rolling back.

**D2 (informational, no action needed).** `README.md` line 50 names `Done` and `Fixed` in prose. The spec's AC 3 search is for source (not documentation), so this is not a defect. Noted only because the README mentions the values.

**D3 (informational, test hygiene).** `tests/resolution-extensibility.test.js` pushes `Closed` into `STATUSES` and `Obsolete` into `RESOLUTIONS` in-process. This is safe because `node --test` runs each file in its own process, but it would leak if the files ever ran in one process. Not blocking.

**D4 (informational).** `tests/resolutions.test.js` "AC 20" drives the server path (a `PATCH` that the validation rejects), not the drag. The drag path (no PATCH sent) was checked in the browser (row 20), so AC 20 is covered at both levels.

## Not verified / limits

- Real mouse drag (the wrong-card case is Playwright-driven only; see the section above).
- Browsers other than Chromium.
- Clean-copy `npm ci` and the migration on a copy of the owner's real `data/app.db`: cited from the partial run, not re-run here.
- Lint and typecheck: not configured.
- The owner's live app on port 3001 was not used, and the owner's `data/app.db` was not opened.

## Artifacts

Scratch directory: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/cefe797e-c953-443f-a86b-8ea04ec96084/scratchpad/qa-final/`. Files: `browser.cjs`, `regression.cjs`, `epicdrop.cjs`, `roundtrip.cjs`, `reloadfail.cjs`, `npm-test-final.log`, `server.log`, `app.db` (scratch). Partial notes remain at `docs/qa/resolution-partial.md`, as requested.
