# QA: Task Dialog Redesign (Tabs)

Spec: `docs/specs/task-dialog-redesign.md` (AC 1-38 and the QA checklist). Design contract: `docs/design/task-modal-v2/README.md`. Chosen mockup: `docs/design/task-modal-v2/b-tabs.html`. Developer report: 277/277 tests, nothing committed.

**Result: NO-GO.** One acceptance criterion fails and blocks: AC 12 (the "Images in this description" thumbnails are hidden under the saved description's read view). Everything else checked passes, with one non-blocking deviation (AC 27, title colour) for the owner to accept or reject.

## 0. Pre-flight

- `git status --short` (start of QA): modified `README.md`, `public/board.html`, `public/css/app.css`, `public/js/board.js`, `tests/source.test.js`; untracked `docs/design/STYLE.md`, `docs/design/task-modal-v2/`, `docs/specs/task-dialog-redesign.md`. Nothing staged, nothing committed.
- `docs/HANDOFF.md` read. Its standing instruction (commit and push on GO) was not followed: this QA task says do not commit, and nothing was committed.
- `git diff --stat -- server/` -> empty (no output). `git status` shows no server file changed or added. AC 37 PASS.
- Port 3001 (owner's server, PID 70985) was not touched; still listening after QA. Port 3000 never touched. `data/app.db` and `data/files/` were only read (SQLite `.backup` to a scratch copy, and `cp` of files to a scratch folder). Nothing written under the project tree except this report.

## 1. Automated tests (run fresh)

Clean copy: the tracked and untracked-not-ignored files of the working tree (`git ls-files -co --exclude-standard`) copied to `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa-verify/tree`, `node_modules` copied, then `git init` in the copy, so `git check-ignore` has a repository. `git check-ignore -v data/app.db` -> `.gitignore:11:/data/	data/app.db`.

- Command: `cd <scratchpad>/qa-verify/tree && npm test` -> exit 0. Summary: `ℹ tests 277`, `ℹ suites 0`, `ℹ pass 277`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, `ℹ todo 0`. Log: `<scratchpad>/qa-verify/npm-test-clean.log`.
- A first copy made with `tar --exclude=./data` dropped `server/data/` (the pattern also matched the nested folder) and failed with `Cannot find module '../data/projects'`. That was a copy error in QA's setup, not a product defect; the corrected copy passes.
- Lint/typecheck: none configured (`package.json` has only `start` and `test`).

## 2. Setup and method

- Scratch server: from the clean copy, `PORT=3002 DB_PATH=<scratch>/run/app.db FILES_DIR=<scratch>/run/files node server/index.js`. DB from `data/app.db` (SQLite `.backup`), files from `data/files/`. PID recorded in `<scratch>/run/server3002.pid` and stopped at the end.
- Scratch fixtures (scratch DB only, through the API): empty epic PMPO-5; hostile item PMPO-6 (title `<img src=x onerror=alert(1)>` plus 120 `W`, description with the tag plus 150 `L`); project "QA Archive" (QAARC) with an item and an old comment, then archived (status Completed); user casey set to Viewer through the API, and later blake set to Viewer through the real Users page UI and restored to Member; a hostile epic and child (PMPA-6, PMPA-7); a 61-event history on PMPO-6 (to test the "+" count).
- Browser: headless Chrome (`--remote-debugging-port=9333`, scratch profile), driven over CDP from scripts in `<scratch>/qa-verify/` (`cdp.mjs`, `lib.mjs`, and per-check `*.mjs`). Screenshots in `<scratch>/qa-verify/shots/` only.
- Mockup: `b-tabs.html` opened from disk; the state strip (`#viewer`) works. Compared Viewer and Task states visually. The mockup's footer order is `Delete, Close, Save` (see deviations).
- Tab-switch and error simulation: the page's `window.fetch` was wrapped in the scratch page to return HTTP 500 for specific GET loads, or to delay them. Only in the scratch browser session.

## 3. Acceptance criteria (38)

Key: PASS / FAIL / UNTESTED. "Evidence" names what was observed.

| AC | Result | Reason (evidence) |
|---|---|---|
| 1 | PASS | Dialog 660px wide at 1280px; background `rgb(248,250,250)`; band teal; radius 8px; footer separated by a border (screenshot). |
| 2 | PASS | Band shows "Task PMPA-3" chip with type dot, gold epic link, `aria-label="Close"` x; x and footer Close both close (checked). |
| 3 | PASS | Child shows "PMPA-2 EPIC 1 ->" as `type=button`, gold uppercase underlined; click re-points to the epic (Children tab, `PMPA-6` hostile epic test). Epic and non-child show no link. No separate link beside the Epic dropdown. |
| 4 | PASS | New item: band text "Create work item"; dialog accessible name "Create work item"; saved item named by key (`aria-labelledby` -> visually hidden heading). |
| 5 | PASS | Title is a textarea, maxlength 200, aria-label Title, placeholder "What needs to be done?". Empty title: no save, chip text "Title is required. Enter a title and save again.", `role=alert`, chip white with text `rgb(168,42,8)`, field border 2px white, focus on title. Save again succeeds (cleared). Long title wraps with no horizontal scroll (scrollWidth = clientWidth). |
| 6 | PASS | Enter in the title saves (new item created with exact title, no newline). Pasted two-line text becomes one line with a space (paste default prevented). |
| 7 | PASS | Radio group (`fieldset` legend "Status") in server order; in-progress shows solid current, earlier pale, later white (screenshot). Scratch test with a fourth status (`Review`, temporary change in the scratch copy only): four radios in order; track wraps to two rows at 400px (height 63px, no overflow). |
| 8 | PASS | One click selects; ArrowRight/ArrowLeft move and check (wrap). Focus ring on the step is inside (2px, deep teal `#0b5d66` outline, offset 2px; the step-specific rule is a navy inset ring). Selection is only in the form until Save (verified: Save is needed to persist). |
| 9 | PASS | Done shows Resolution, default "Fixed"; leaving Done hides it; saved Done with Fixed (API `Done`/`Fixed`); reopened Done shows Fixed; Duplicate kept; moving back to In Progress clears the resolution (API `null`). |
| 10 | PASS | New item has no status track; created as "To Do" (PMPO-7). |
| 11 | PASS | Two-column grid: Assignee (Unassigned first), Priority, Type, Epic (None first; hidden for epic type and in the new-item epic view as specified), Resolution (only on Done). "Reporter: Blake Chen" plain text under the grid. Field names unchanged (`title`, `type`, `status`, `priority`, `assignee_id`, `epic_id`, `resolution`, `description`). |
| 12 | **FAIL (blocking)** | Read view of a saved description shows the image inline (`/api/attachments/10/preview`), but `#description-images` (the "Images in this description" strip) is `hidden` in the read view. Code: `setDescriptionEditing()` sets `els.descriptionImages.hidden = true` when not editing (`public/js/board.js` ~line 1953), and `renderDescriptionImages()` only runs in edit mode. Thumbnails appear only in the textarea view, not under the read view as the spec and mockup require. Other parts pass: Edit button; empty text "No description. Select Edit to add one."; Viewer "No description."; new item opens on the textarea; description paste uploads and inserts the token (+1 attachment). |
| 13 | PASS | Save uses the existing `PATCH /api/issues/:id` and POST for new items; saved fields verified through the API. Tab buttons, Children and Links/Attachments buttons are `type=button`; only Save is submit. |
| 14 | PASS | Tab bar order Children (epic only), Discussion, History, Links, Attachments; pills show 2/3/0 children, message counts, link and attachment counts. History: no pill before load (`""`), then `3` (no more), then `50+` with Show more available, then `61` after Show more (no plus). Counts updated without reopening after post, edit/delete, add link, remove link, upload, delete attachment, add child, remove child, create child. |
| 15 | PASS | `role=tablist aria-label="Activity"`; tabs `role=tab` with `aria-selected` and `aria-controls`; panels `role=tabpanel` with `aria-labelledby`. Left/Right/Home/End move focus and selection, wrapping at the ends; roving tabindex follows selection (checked). |
| 16 | PASS | Default tab: Children on epic (PMPA-2, PMPA-6, PMPO-5), Discussion otherwise; re-pointing to a child or epic re-selects the default. New item shows no tab bar; Attachments section only, with "Save the work item first." |
| 17 | PASS | Visible panel `min-height: 200px`. Long lists scroll inside the panel (max-height rules kept). The 40vh thread scroll was not re-measured. |
| 18 | PASS | Link load error ("Could not load links: ...") opens Links; attachments load error opens Attachments; children load error ("Could not load the epic's items: ...") opens Children; add-link duplicate opens/keeps Links; attachment type error ("evil.exe: That file type is not allowed.") and 26th upload error opens Attachments; comments load error opens Discussion, including when the error arrives 1.5 s later while the user is on Links (switched to Discussion). History load error stays on History with Retry (Retry loads rows). Clearing an error on Discussion does not switch tabs. |
| 19 | PASS | Composer on top ("Posting as Alex Morgan", "Message" textarea, "Write a message", Post); empty thread "No messages yet. Be the first to post."; post with hostile text shows literal, count 0->1; own message Edit (saved, "edited"); own message Delete (count 1->0); Member's message shows no Edit/Delete to Admin; Viewer and archived: composer hidden, no Edit/Delete, old message readable (archived count 1). Not re-run: the 2000-character rule. |
| 20 | PASS | History newest first; "Filter history by field" (`#history-field`) works (filtered Status -> 1 row; Type filter for Viewer -> 0 rows); Show more; Retry; "created this work item" row present on an item created in the app (PMPO-7). Hidden for new items. Filter works for Viewer (blake). |
| 21 | PASS | Links grouped by relationship ("blocks / PMPO-1 / ... / Remove", "relates to / PMPO-3 / ..."); Remove removes (count 1->0, "No links."); form adds a link; duplicate shows "Could not add link: These work items are already linked this way." in the error line; self-link/validation unchanged (add is disabled until both selects are set, as in the committed code). Click on a linked title re-points the dialog. Viewer: no Remove, no form (count still shown). |
| 22 | PASS | Add files, drop onto the panel (uploaded, row added), hostile file name shown literally, rows with name, size, uploader, time, Download (`/api/attachments/10/download`) and Delete (own only: Admin sees no Delete on Blake's file). Paste of an image into a message (count 5->6, token inserted) and into the description (count +1, token inserted). Drop outline not visually checked. |
| 23 | PASS | New item: "Save the work item first.", no count, file controls hidden. |
| 24 | PASS | Children first and selected for epics; dark teal rounded summary "1 of 2 done"; `role=progressbar` with `aria-valuemin=0 aria-valuemax=2 aria-valuenow=1 aria-label="Progress"`, gold fill 50%; per-status counts incl. zeros ("To Do 0 In Progress 1 Done 1"); rows with type dot, key, title button, "Status · Assignee"; Existing work item select with Add and Create child. Empty epic: "No child work items yet. Add an existing item or create a new one.", no summary, Add and Create child shown. Clicking a child opens it (PMPA-3). Remove per child (Admin). Viewer: no Remove, no Add, no Create child. Add existing, Remove, Create child (epic preselected, returns to epic with the new child listed) all verified. |
| 25 | PASS | Tab named "Children" with count; section label comes from the types list. |
| 26 | PASS | `role=status` banner first in the body: archived text on archived project (wins when both apply, and Viewer on archived still shows archived text); Viewer text on active project; no banner for an Admin on an active project. |
| 27 | **FAIL (non-blocking; owner decision)** | Read-only fields are disabled and not faded; Save, Delete, Edit, composer, Add link, Remove, Add files, Add, Create child, child Remove are hidden; radios disabled; Close, tabs, History filter, Download, linked items and children still work. Deviation: the Title stays white text on the deep teal band (`rgb(255,255,255)`, 7.58:1), while AC 27 says black text on pale teal. The chosen mockup (`b-tabs.html` Viewer state) shows the same white title, so the developer followed the mockup. See section 4. |
| 28 | PASS | Viewer (active) and archived user: same read-only state. Member (blake): Edit, Post, Save visible, Delete hidden. Admin: Delete visible on an active saved item. Permission checks unchanged (`git diff` shows no permission change). |
| 29 | PASS | Footer: Delete (danger, hidden for read-only, Member and new items), Close, Save (`type=submit`, "Save" or "Create" for new). Save failure (fetch forced to 500 in the scratch page) shows the server's message "Simulated server refusal" in a `role=alert` line by the buttons; dialog stays open. Footer stays in view at 1280px and 400px. |
| 30 | PASS | Delete asks `Delete PMPO-9? This cannot be undone.` (exact), then closes and removes the card; a created item hidden by the filter shows "Created PMPO-8, hidden by the current filters."; Create child returns to the epic. Save closes and reloads the board. |
| 31 | PASS | Hostile `<img src=x onerror=alert(1)>` shown literally in title, description, epic link text, child title input, comments (post and edit), file name, link target option labels; no alert observed in any run. Key chips and reporter use the same text path. Not directly observed: the link list titles of a hostile item and history values (same code path, `textContent`). No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` in the added lines of the diff (grep count 0). |
| 32 | PASS | 120-character unbroken title and description wrap: dialog, form and title `scrollWidth` equal `clientWidth` at 1280px and 400px; no control pushed out (400px shows the title wrapped inside the band). Title maxlength 200. |
| 33 | PASS | Labels or `aria-label` on controls; non-submit buttons `type=button`. Focus: Close x on band has a 2px gold ring (`rgb(250,206,0)`, offset 2px); other light areas 2px teal (`rgb(11,93,102)`); status step ring inside. Escape closes (verified). Tab order: epic link -> Close -> title -> ... |
| 34 | PASS | Computed contrast: white on `#0b5d66` 7.58; gold `#face00` on `#0b5d66` 5.01; `#0b5d66` on `#f8fafa` 7.23; `#62666a` on `#f8fafa` 5.53 (reporter, empty text); black on `#e5eded` 17.67; `#154973` on white 9.41; error `#c0300b` (link error text) on white 5.72 (README value); title-error chip `#a82a08` on white 7.0. Gold and `#65999e` are not used as text on light backgrounds in the observed states. |
| 35 | PASS | Palette tokens (`--teal`, `--navy`, `--gold`, ...) are declared inside `dialog#detail` (`public/css/app.css` line 316-317 onward); no palette token added to `:root`. Computed styles of `index.html`, `users.html`, `login.html` and `board.html` (board, dialog closed) are identical with the working CSS and the committed CSS: 67, 63, 67 and 168 elements compared, 0 differences. No external fonts, images or icons added. |
| 36 | PASS | At 400px: dialog 366px (95vw), property grid one column (`338px`), status track fits (flex, no overflow), tab bar scrolls horizontally inside itself (`overflow-x: auto`, no page or dialog overflow). |
| 37 | PASS | `git diff --stat -- server/` is empty; no new endpoint; no schema or history change (API responses unchanged in shape). |
| 38 | PASS | `npm test` 277/277 including `tests/source.test.js` (hard-coded names, button types, text-only DOM, git check-ignore). |

Summary: 36 PASS, 1 FAIL blocking (AC 12), 1 FAIL non-blocking (AC 27 title colour), 0 UNTESTED among the 38 criteria (some sub-points are listed in "Not tested" below).

## 4. Developer deviations: judgement

1. **Read-only title is white on the band (AC 27).** Not accepted as written, because AC 27 names the Title with black text on pale teal. Accepted as a design call, pending owner confirmation: it matches the chosen mockup (the mockup's Viewer state shows the same white title), the contrast is 7.58:1, and the spec's "Mockup differences" section does not list it. Non-blocking. The owner should either accept the mockup's version (and amend AC 27) or ask for black on pale teal.
2. **Count pills hidden until data loads (History).** Matches AC 14 exactly. Accepted.
3. **Reporter below the grid.** Matches AC 11. Accepted.
4. **Footer order Delete, Close, Save.** Matches the mockup footer (`Delete`, `Close`, then `Save`). AC 29 names the buttons in a different order but does not require an order. Accepted.
5. **Link rows use a type-coloured dot.** Not in the spec; decorative; no functional effect. Accepted (not separately inspected at high zoom).
6. **Roving tabindex.** Matches AC 15 and the Tab-order rule. Verified. Accepted.
7. **Save error shows only the server's message.** AC 29 requires the server's own message to stay visible; the generic prefix is optional. Verified. Accepted.
8. **Other notes (not deviations):** the step focus ring uses the deep-teal outline on the input plus the navy inset rule on the label; visible in screenshot, so PASS. The README was rewritten for the dialog description, more than the "one sentence" allowed in the spec's implementation notes; harmless, noted for the owner.

## 5. Regression re-verification through the new dialog

Each item was run in the browser on the scratch server.

- **Links:** add (done), duplicate error (done), remove (done, "No links."), click-through re-points (done), Viewer hides Remove and form (done), validation and self-link unchanged (code path unchanged in logic; add button disabled until both selects are set, as before).
- **Attachments:** upload via input (done), drop on panel (done), 26th upload refused with "This work item already has 25 attachments." (done), Delete own only (Admin cannot delete Blake's file; own file deleted, count 7->6), size error not re-run (10 MB limit; 413 path not triggered), type error (done), download link (done), paste image into message and into description (done, synthetic paste; the first attempt hit the 25-file limit and was re-run after freeing slots).
- **Epic view:** add existing (done), remove (done), create child with epic preselected and return (done), progress after a child moves to Done (synthetic drag: "2 of 3 done", bar 2/3), empty epic (done), Viewer read-only (done).
- **Discussion:** post (done), edit own (done), delete own (done), Member message has no Edit/Delete for Admin (done), Viewer/archived (done).
- **History:** lazy load (done), newest first (done), filter (done), Show more (done), count "50+" then "61" (done), created row (done), Retry (done).
- **Resolution on Done:** default Fixed, saved; cleared when moved out of Done (done).
- **Search-filter notice:** "Created PMPO-8, hidden by the current filters." (done). Filters unaffected by opening and closing the dialog: not separately verified.
- **Drag-and-drop:** card to Done (done; API status Done, epic progress updated). Same-column drop: the rank changes (1000 -> 2000) and `updated_at` changes. The drag code (`onDrop`, `moveItem`, `computeRank`) is unchanged from the committed version, so this is pre-existing behaviour, not a regression of this feature. Noted as an observation.
- **Permission groups:** Blake set to Viewer through the Users page select ("Saved: Viewer"), then Blake's dialog showed the view-only banner, no Save/Delete/composer; Blake's History filter worked; Blake restored to Member through the API afterwards.
- **Board, projects, Users, login:** computed-style comparison of all elements (outside the dialog) with the working CSS vs the committed CSS: no differences on `index.html`, `users.html`, `login.html` and `board.html`. Screenshots of the board and Users page were saved to the scratchpad and the board behind the dialog looks unchanged in them; the computed-style comparison is the authoritative check.

## 6. QA checklist (spec section, items 1-14)

1 Band: PASS. 2 Title: PASS. 3 Status track: PASS (Arrow keys, focus, Done/Resolution, read-only, four-status scratch test). 4 Properties grid: PASS. 5 Description: PASS except thumbnails under read view (AC 12, FAIL). 6 Tab bar: PASS. 7 Epic: PASS. 8 Discussion, History, Links, Attachments: PASS. 9 Read-only: PASS (title colour per AC 27 deviation). 10 Hostile text: PASS. 11 Accessibility: PASS (labels, Tab order, focus rings, Escape). 12 Contrast: PASS (spot checks). 13 Viewports 1280px and 400px: PASS (700px boundary not separately measured). 14 Palette scoped: PASS.

## 7. Empty and edge states

- Empty board (new project with no items): 0 cards, columns shown with 0, no error.
- Empty epic: PASS (see AC 24). Empty sections for Viewer: "No description.", "No attachments.", "No links.", "No child work items..." (PASS).
- Very long title: PASS (AC 32). Hostile text everywhere: PASS (AC 31).
- Move a card to its own column: no error; the rank changes (pre-existing behaviour, see section 5).
- Delete an issue that is on the board: PASS (confirm text, dialog closes, card removed, API 404).

## 8. Not tested (limits of this QA run)

- Real Cmd+V paste of a screenshot: not tested. All paste checks used a synthetic `ClipboardEvent` with a `DataTransfer` containing a PNG.
- Safari and Firefox: not tested. Chrome (headless) only.
- A fourth status wrapping the track: tested only on a temporary scratch copy with `Review` added to `server/statuses.js`; the scratch copy was reverted and the scratch server restarted. The project tree was not changed.
- Not re-run: the 2000-character message rule, the 40vh thread scroll, the 10 MB size error, the drop outline visual, the 700px breakpoint (the 400px and 1280px were measured), screen reader behaviour, the epic's dropped-into-epic drag chip, hostile text in the link list titles and in history values (same text path, not observed directly).
- Epic child row text for a hostile child title: observed in the dialog title input and the epic link text only.

## 9. Required fix (for the developer)

- **AC 12:** show the "Images in this description" thumbnails under the saved description's read view (for example, call `renderDescriptionImages()` on the saved text, not `hidden = true`, in `setDescriptionEditing`). Re-check in the browser: a description with an image token shows its thumbnail strip in read view and in edit view.
- Optional, owner's call: AC 27 title colour (see section 4). It does not block GO.

## 10. Verdict

Superseded by section 11.7 (re-run after fix).

## 11. Re-run after fix (AC 12)

Scope: the developer's fix for AC 12. Re-QA done on 2026-10-25 by QA (Haiku 5.5). Sections 0-10 above are the earlier run and are left as written.

### 11.1 What changed since the last QA

- `git status --short` now: `M README.md`, `M public/board.html`, `M public/css/app.css`, `M public/js/board.js`, `M tests/source.test.js`, plus the same untracked files as before (`docs/design/STYLE.md`, `docs/design/task-modal-v2/`, `docs/specs/task-dialog-redesign.md`, `docs/qa/task-dialog-redesign.md`). Nothing staged, nothing committed.
- Diff against the snapshot taken for the last QA (every tracked and untracked-not-ignored file compared byte for byte): only `public/js/board.js` and `tests/source.test.js` changed. The other files are the original uncommitted redesign and are unchanged since the last QA.
- The `board.js` change is limited to `setDescriptionEditing` (no longer hides the strip in the read view; calls `renderDescriptionImages()` in both views) and `renderDescriptionImages` (uses the saved `editing.description` when the textarea is hidden, the textarea value otherwise). Read as not using `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write`; thumbnails are built with `el()` and the id-derived preview URL.
- `tests/source.test.js` gains one rule, "description image thumbnails show under the read view too (redesign AC 12)". It checks the strip is rendered in both views, is not hidden in `setDescriptionEditing`, uses the saved text and the textarea, and has no HTML sinks.

### 11.2 Automated tests (run fresh)

- Clean copy: the working tree's tracked and untracked-not-ignored files copied to `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/tree` (node_modules copied; `data/` not copied), `git init` in the copy. `git check-ignore -v data/app.db` -> `.gitignore:11:/data/	data/app.db`. `public/` and `tests/source.test.js` in the copy compared identical to the working tree.
- Command: `cd /private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/tree && npm test` -> exit 0. Output: `ℹ tests 278`, `ℹ pass 278`, `ℹ fail 0`, `ℹ cancelled 0`, `ℹ skipped 0`, `ℹ todo 0`. Log: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/npm-test.log`.
- Lint/typecheck: none configured.
- The new rule passes; I did not weaken or remove any rule (the diff of `tests/source.test.js` since the last QA is additive).

### 11.3 Browser checks (AC 12)

Setup: scratch DB from `data/app.db` by SQLite `.backup` to `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/run/app.db`; scratch files copied to `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/run/files`; server from the clean copy with `PORT=3002 DB_PATH=... FILES_DIR=...`; headless Chrome on CDP port 9334 with a scratch profile. Only port 3002 and the scratch profile were used. `data/app.db` (mtime unchanged, 20:04:30) and `data/files/` (unchanged) were not written. Ports 3000 and 3001 were not touched (the owner's 3001 process was still listening after QA).

Fixtures (scratch DB only, via the API): PNG uploaded to PMPA-1 (`pasted-image-qa.png`, attachment 4) and a hostile-named PNG (`"><img src=x onerror=alert(3)>.png`, attachment 5); PMPA-1 description `Before text`, `![image](attachment:4)`, `After <img src=x onerror=alert(1)> end`; PMPO-3 description containing a token for attachment 4 (another item's image); new PMPO item `QA hostile <b>bold</b> <img src=x onerror=alert(2)>` with description `<img src=x onerror=alert(4)> ![image](attachment:999999)`; archived project QA Archive B (QAARB, Completed + archived) with item QAARB-1 holding an image; casey set to Viewer (scratch only).

Results (scripts `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/qa2/scripts/ac12.mjs`, `regress.mjs`, `ac27.mjs`):

| Check | Result | Evidence |
|---|---|---|
| Admin, saved item with pasted image: strip under read view | PASS | `#description-images` visible, 1 thumb `/api/attachments/4/preview`, `naturalWidth > 0`; read view shows the same image inline. |
| Thumbnail loads | PASS | In-page fetch of the thumb src: 200 `image/png`; `img.complete && naturalWidth > 0`. |
| Clicking the thumbnail opens the preview | PASS | Real mouse click (CDP `Input.dispatchMouseEvent`) opened a new target at `http://localhost:3002/api/attachments/4/preview`; the dialog stayed open. Link has `target="_blank"`, `rel="noopener"`. (The first attempt used a JS `.click()` and opened nothing, as headless popups from script clicks are blocked; the real click is the valid check.) |
| After Edit: strip still shown | PASS | Edit view: strip visible, 1 thumb, textarea shows the raw token text. |
| Image text removed while editing: strip hidden | PASS | Textarea set to `Text only now` with input event: strip hidden, 0 thumbs. |
| Token re-added while editing: strip shown again | PASS | 1 thumb. |
| Discard without save, reopen: strip shown from saved text | PASS | Saved description unchanged (no Save was pressed). |
| Saved item with no images (PMPO-2): hidden in read and edit view | PASS | `stripHidden: true` in both. |
| New item: hidden | PASS | Opens on textarea; `stripHidden: true`. |
| Another item's token (PMPO-3, attachment of PMPA-1): not a thumbnail | PASS | 0 thumbs; the token is shown as its raw text (the design for another item's attachment, `resolveToken` returns `raw`), not as an image. |
| Hostile text in description/title and new-item title | PASS | Literal text; `img[src="x"]` and `img[onerror]` count 0 in the dialog; key chip `Task PMPO-5`. |
| Hostile filename | PASS | Attachment row shows `"><img src=x onerror=alert(3)>.png` as text; no injected element. |
| Viewer (casey) on PMPA-1: strip shown, no Edit | PASS | Strip visible with 1 thumb that loads; Edit hidden; banner "You have view-only access. You can read this work item but not change it."; Save and Delete hidden; comment composer hidden. |
| Archived project item with image (QAARB-1): strip shown, read-only | PASS | Strip visible, thumb `/api/attachments/6/preview` loads; Edit and Save hidden; banner "This project is archived. ...". |

### 11.4 Regression (quick)

| Check | Result | Evidence |
|---|---|---|
| Description Edit, change, Save | PASS | Saved via UI to PMPO-2; API shows `QA edited description`; reopen shows it in the read view. Original text restored by API (`tasks\nline 2\nline 3`, verified identical). |
| Comment paste (image) and Post | PASS | Synthetic paste of a PNG into the message box inserted `![image](attachment:7)`; attachments count 5 -> 6; posted: comments 2 -> 3; the posted message shows the inline image. |
| Attachments list | PASS | 6 rows, 6 Download links (`/download`), 6 Delete buttons (all are alex's own uploads). |
| Tabs on the epic (PMPA-2): Children default; each tab shows only its panel | PASS | Visible panel per click: discussion, history, links, attachments, epic-view. History rows loaded (8); Links loaded ("relates to" group). |
| Tabs on a task (PMPA-1): Discussion default | PASS | Visible panel `discussion`. |

### 11.5 AC 27 (unchanged, non-blocking)

Checked on a Viewer dialog: `#title-input` is disabled, computed colour `rgb(255, 255, 255)` on the band `rgb(11, 93, 102)`. This is the same as the earlier run. AC 27 still says black text on pale teal; the owner decides (see section 4). It is the only open non-blocking item.

### 11.6 Gaps

- Not re-run: the full earlier list (the other ACs are unchanged code-wise; the fix did not touch them, and the diff since the last QA is confined to two functions and one test).
- Cmd+V of a real screenshot, Safari and Firefox: not tested (synthetic paste and headless Chrome only, as before).

### 11.7 Verdict

AC 12 now passes in every case the spec and this fix cover. No other acceptance criterion changed. AC 27 is the only open non-blocking item, for the owner. Nothing was committed.

VERDICT: GO
