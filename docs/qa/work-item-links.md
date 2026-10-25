# QA: Work Item Links (docs/specs/work-item-links.md)

Date: 2026-10-25
Tester: QA agent (independent re-run; the developer's report was not relied on)
Scope: the 26 acceptance criteria, the developer's listed deviations, the migration on a DB copy, regressions (history, delete item, archived read-only), and the browser check of the Links UI (AC 20-26), which the developer did not test.

No application code was modified. Nothing was committed. Only this file under `docs/qa/` was written.

## Verdict

**GO.** All 26 acceptance criteria pass. The three listed deviations are acceptable and are non-blocking (see "Deviations"). Two minor notes are recorded below; neither blocks.

## Test runs

| # | Command / check | Where | Result |
|---|---|---|---|
| 1 | `npm test` (`node --test "tests/*.test.js"`), exit code captured | Clean copy of the working tree (no `data/`, no `.git`): `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/clean` | exit 0; tests 155, pass 155, fail 0, cancelled 0, skipped 0, todo 0. Matches the developer's 155/155. Log: `/private/tmp/claude-501/-Users-robertmichaels-Documents-code-projectmanagement/d6254d1f-fe3e-4677-86d0-2ad00213bbae/scratchpad/npm-test-1.txt` |
| 2 | Lint / typecheck | `package.json` | Not configured (scripts are only `start` and `test`). Not run. |
| 3 | Migration on a copy of `data/app.db` | Copy at `.../scratchpad/mig-copy.db`; script `.../scratchpad/migrate-check.js` | See "Migration". |
| 4 | Live API checks, 71 checks, on a scratch server on port 3002 (`PORT=3002 DB_PATH=.../scratchpad/ui.db node server/index.js`, run from the clean copy) | Script `.../scratchpad/api-check.js`, plus `.../scratchpad/archive-check.js` and `.../scratchpad/gaps-check.js` | api-check: 69 pass, 2 fail. Both fails were script errors (see the note under AC 10). archive-check: PASS. gaps-check: all observations as listed below. |
| 5 | Browser: headless Google Chrome 155 on a scratch profile, DevTools port 9333, against the 3002 scratch server | Script `.../scratchpad/ui-links.js`; log `.../scratchpad/ui-run4.log` | 27 pass, 1 "fail" that is a checker false positive (see AC 0 below). Zero uncaught exceptions, zero app `console.error` calls. |
| 6 | Hygiene: `git status`, and `data/app.db` checksum before and after | Repo | No commits. The only new files are the feature's own files and one untracked spec, `docs/specs/epic-view.md`, which is not part of this feature. |

Node v26.7.0 (package.json requires >= 20). Ports: 3000 and 3001 were not used by QA and were not touched. Port 3002 (the scratch server) and the scratch Chrome on 9333 were stopped by QA after the run; port 3001 (owner) was not touched.

### Owner data

`data/app.db` was never opened by QA. QA's only operations on it were `stat`, `shasum` and `cp` to scratch. Its checksum was `6428d1f397d00ceb8b27e2b88d5e117c33d9b76b` at the start of the run and `01d4b5cf35e8230256dd5b793e26cf2dfa174179` at the end (size 77824 to 94208 bytes, mtime 09:24:19 EDT). QA did not write to it. The likely writer is the owner's own server on port 3001 (PID 17713, started 09:17:13, working directory this project), which is running against `data/app.db`. The owner should be aware that the file changed during this run.

## Migration (copy of the owner's DB)

- BEFORE: tables `comments, issue_history_changes, issue_history_events, issues, projects, sessions, users`. Counts: issues 6, comments 1, users 4, projects 2.
- AFTER first open: `issue_links` added with columns `id, link_type (TEXT NN), source_id (NN), target_id (NN), created_by_id, created_at (NN)`. Indexes `idx_issue_links_source`, `idx_issue_links_target`, plus the autoindex for the UNIQUE key. Counts unchanged; `integrity_check` ok; `foreign_key_check` 0 violations. No backfill (the table is empty, which is correct).
- Reopen: idempotent (0 rows, no errors).

## Per-AC results

Method key: **API** = live call on the 3002 scratch server; **UI** = headless Chrome run; **Test** = `npm test` test by name; **Src** = code reading or grep.

| AC | Result | Reason (how verified) |
|---|---|---|
| 1 | PASS | Src: `server/linkTypes.js` is the only definition; entries are `{name, outward, inward}`, Relates is `symmetric: true` with one label; exports `LINK_TYPES`, `getLinkType`, `isValidLinkType`, `labelFor`, `linkOptions`. Order Blocks, Relates, Duplicates. |
| 2 | PASS | API: `GET /api/link-types` returns exactly `[Blocks outward 'blocks', Blocks inward 'is blocked by', Relates outward 'relates to', Duplicates outward 'duplicates', Duplicates inward 'is duplicated by']`. UI: the relationship dropdown shows the same labels in that order. |
| 3 | PASS | Test: "added link types appear in the options" and "added link types can be created, read from both ends, recorded and removed" (`tests/link-extensibility.test.js`); source test "no link type name or label outside server/linkTypes.js" passes. Note (non-blocking): the word "blocks" appears in a comment at `server/routes/links.js:28`. The source test matches quoted names only, so it does not flag it. Behaviour is unaffected. |
| 4 | PASS | API: outward POST returns 201 with the link. Inward POST (`C`, `inward`, target `A`) stores A as source, so the link reads "A blocks C". A symmetric type with no `direction` returns 201. |
| 5 | PASS | API: unknown `link_type` 400; missing `link_type` 400; `direction` "sideways" 400; missing `direction` on Blocks 400; missing `target_id` 400; `"abc"` 400; `1.5` 400; target 999999 404 `Work item not found.`; self 400 `A work item cannot be linked to itself.`; cross-project 400 `Links must be within one project.`; `:id` 999999 404. Validation failures wrote no rows (count checked before and after). Deviations, see below. |
| 6 | PASS | API: same type, same direction, same pair 409. Blocks in both directions is allowed (201). Different type on the same pair allowed (201). Relates reversed (`T` then `A`) 409. Blocks via `inward` repeating an existing `outward` 409. |
| 7 | PASS | API: each successful POST adds exactly one `issue_links` row (count checked). Symmetric Relates stores the lower id as `source_id`. Both ends read the same row. |
| 8 | PASS | API: A sees two `outward` "blocks" rows; B and C each see one `inward` "is blocked by A" row. Shape `{id, link_type, direction, label, other{id,key,title,type,status}}`. Order: outward before inward, then by other key. Unknown id 404 `Work item not found.`. Archived project: GET 200. Symmetric Relates reads "relates to" from both ends. |
| 9 | PASS | API: DELETE from the target end 204; the link is gone from both ends. DELETE from the source end 204. Deleting again 404 `Link not found.`. A link that does not involve the item 404 `Link not found.`. Non-numeric link id 404. |
| 10 | PASS | archive-check (live link on an archived project): DELETE from source 409, DELETE from target 409, POST 409 `This project is archived; its work items are read-only.`. Row count unchanged (6 to 6). The link is still listed. GET 200. Also PATCH on an item in the archived project 409. Note on the api-check failures: both were script errors. One tried to create an item in the already-archived project (correctly refused), and the other had no live link left to delete. The archive-check run covers both cases properly. |
| 11 | PASS | API: GET, POST and DELETE on links and GET `/api/link-types` without a session all 401. With blake's session, a body containing `created_by_id: 4` and `actor_id: 4` is ignored: the row's `created_by_id` is blake's id (2). History actor is "Blake Chen". |
| 12 | PASS | API: deleting a linked item leaves no `issue_links` row referencing it (checked for the deleted id and the whole table: 0 orphans). Former partners still exist (200) and no longer list it. UI: deleting a linked item from the dialog (Delete, confirmed) removes its card; the partner loses the row (checked through the API after the UI delete). |
| 13 | PASS | API: PATCH of title, type (Task) and epic (set to an epic) returns 200 and leaves the link ids unchanged (1 link before, 1 link after, same id). |
| 14 | PASS | API: add writes one `changed` event on each item, with actor alex (`req.user`) on both. Field `link`, label `Link`, kind `link`, old null, new `blocks LQ-2` on A and `is blocked by LQ-1` on B, and `new_id` is the other item's id. UI: History reads "changed Link from None to is duplicated by F". |
| 15 | PASS | API: removal writes a mirror event on each item, with `old` set to the same text, `new` null, `old_id` the other item's id, and the same actor. Example: C's history shows old "relates to B", new null, old_id B. |
| 16 | PASS | API: `GET /api/history-fields` includes `{key: 'link', label: 'Link', kind: 'link'}`. `field=link` returns only link events. UI History: "changed Link from is duplicated by F to None" after a remove. |
| 17 | PASS | API: deleting A's partner-linked item writes a removal event on each partner (P1: old "is blocked by T2", new null; P2: old "relates to T2"), attributed to alex. The deleted item's history returns 404. The UI delete check confirmed the partner's history has the link removal (API read). |
| 18 | PASS | API: a duplicate add (409) writes no history event (count checked before and after) and no row. Validation failures write no rows. Forced database-error rollback was not exercised separately; the insert and both history events are inside one `db.transaction` in `server/data/links.js` (Src). |
| 19 | PASS | API: PATCH of title and status writes no link events (link event count 1 before and after; the one event is the earlier add). PATCH history still records Title and Epic. Src: `server/historyFields.js` has the `link` entry with `column: null`. The `tests/history.test.js` reverse check now skips column-less fields (see note below). |
| 20 | PASS | UI: the Links section sits between the Description textarea and the Activity tabs (DOM order checked). Groups appear in order "blocks", "relates to", "duplicates"; each row shows key, title, type icon and status. An item with no links shows "No links." and no groups. |
| 21 | PASS | UI: clicking a linked key re-points the same dialog to that item (title input now "Alpha"). Clicking a linked title re-points too. A window marker set before the click survives, so there was no page reload. The dialog stays open. |
| 22 | PASS | UI: relationship dropdown is "Relationship..." then the API labels in order. The item dropdown lists the other 5 items of the project as "KEY title", excluding the item itself. Add is disabled with no selection and with only the relationship chosen; enabled once both are chosen. After Add, the new row appears and the dialog stays open. A duplicate add (409) shows "Could not add link: These work items are already linked this way." inline; the relationship and target values are kept; no row is added. |
| 23 | PASS | UI: Remove removes the row, the dialog stays open, and `window.confirm` was called 0 times. The API confirms the link is gone from both ends. |
| 24 | PASS | UI on an archived project: the item's Links section is visible and shows its row; the Add form is hidden (computed display none); no Remove buttons. |
| 25 | PASS | UI: a linked item titled `<b>x</b> echo` renders with that literal text. The list contains no `<b>` element. |
| 26 | PASS | UI: with the History tab selected, Add refreshes it (count grows, text shows the new link) without switching tabs. Remove refreshes it again. The History tab stays selected. |

### Additional gap checks (brief, as requested)

- **Empty project**: `GET /api/projects/:id/issues` returns `[]`. The item dropdown would show only the placeholder. Not checked in the browser (UNTESTED in the UI); the code path is a plain `replaceChildren` of the placeholder.
- **Very long title**: a 200-character title (the maximum) links and reads back correctly through the API. CSS uses `word-break: break-word` on the title. Not checked visually.
- **Moving a card to the column it is already in**: unrelated to links (existing board behaviour). Not tested for this feature.
- **Deleting an issue that is on the board**: covered by AC 12 (API and UI).

## Deviations listed by the developer

| Deviation | Verdict | Evidence |
|---|---|---|
| POST check order: the archived check (409) runs before the target-not-found (404), self (400) and cross-project (400) checks. | Acceptable, non-blocking. The spec orders the 404 and the 400 checks but does not place the archived check. Observed: archived project, `target_id` 999999 gives 409; archived project, self target gives 409. Validation (400) for `link_type`, `direction` and `target_id` still runs first. | API, scratch server |
| Symmetric type with a `direction` supplied: the value is ignored and the link is treated as outward. | Acceptable. AC 4 allows `direction` to be omitted for a symmetric type and is silent on a supplied value. Observed: Relates with `direction: 'inward'` for a pair already linked gives 409 (duplicate), not 400. | API |
| Lazy `require('../validation')` inside `addLink` (to break the `validation` to `data/issues` to `data/links` cycle). | Acceptable. Works on the 409 path (tested). Full suite passes. | Test, API |

Additional leniency observed (non-blocking; for the owner to decide): `target_id` given as a digit string (for example `"5"`) is parsed as an integer rather than rejected. AC 5 says "non-integer" gives 400. The owner may want the strict reading.

## Notes

1. **Non-blocking, wording:** `server/routes/links.js:28` has the word "blocks" in a comment. The source test checks quoted names only, so it does not catch this. A one-word comment change would remove it. Not a defect in behaviour.
2. **Test change, reviewed:** `tests/history.test.js` was edited. The `history-fields` list now includes `link`. The "every updatable column has a history field" test now skips column-less fields in the reverse check. AC 19 requires this exemption, so the change is consistent with the spec. The forward check (every updatable column except rank has a history field) is unchanged.
3. **UI console entries:** the UI run recorded two entries that were not app errors. (a) The browser logs `Failed to load resource: ... 409 (Conflict)` for the deliberate duplicate add in AC 22. (b) The native delete confirm was auto-accepted by the driver. The checker counted both as "errors"; no uncaught exception and no `console.error` from app code occurred.

## Conclusion

All 26 criteria pass on the live scratch server and in the browser. The suite passes 155/155 in a clean copy. The migration is additive and idempotent. The deviations are acceptable. The one open item for the owner is the target-id leniency noted above; it is not blocking.

VERDICT: GO
