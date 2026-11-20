# Completed Date on Cards
Status: Draft
Date: 2026-11-20

Builds on the resolution behaviour in `docs/specs/resolution-and-comments.md` (set on entering the terminal status, cleared on leaving) and on the history in `docs/specs/ticket-history.md`. The terminal status is `Complete` today (`terminalStatus()` in `server/statuses.js`); no code below may name it. This spec is independent of `docs/specs/daily-report.md` (uncommitted); see Implementation notes for the shared files.

## Problem

A card in the Complete column shows its resolution but not when the work was finished. To find out, you must open the item and read its History tab. The owner wants the completion date visible at a glance on the card.

## User stories

1. As a user looking at the Board, I see on each card in Complete the date it was completed, so I can tell recent work from old work without opening it.
2. As a user, I can hover the date to see the exact date and time and who completed it.
3. As a user, I see the same date in the item dialog and on Backlog rows, so it is consistent wherever the item shows its resolution.
4. As a user, when I reopen an item and complete it again, the date reflects the latest completion, and a reopened item shows no completed date.

## Decisions (recommended; the owner can override via the open questions)

- **Completed date** = the time of the most recent change of status into the terminal status. It exists only while the item is in the terminal status and is cleared when the item leaves it. This mirrors how `resolution` already works.
- **Stored, not derived.** Add `completed_at` (and `completed_by`) columns on `issues`, set and cleared in `updateIssue` in the same write that sets the resolution (`resolutionFor` / `statusChanged` in `server/data/issues.js`). Justification: board data is loaded as one query of issue rows (`SELECT` in `server/data/issues.js`); deriving from history would add a per-item lookup into `issue_history_changes` on every board, backlog and export load, and a history row is not guaranteed (see fallback). A stored value is read with the row, exports trivially, and matches the existing resolution pattern. History stays the audit trail and is the source for the one-time backfill.
- **Fallback when history has no completion row** (item created directly in Complete, or completed before history existed): use `created_at` for an item created in Complete, and `updated_at` otherwise, with `completed_by` null. Justification: showing nothing on an old Complete card looks like a bug, and the date is at worst approximate. This only affects the one-time backfill; every later completion is exact.

## Acceptance criteria

### Setting and clearing (server)

1. `issues` has nullable `completed_at` (ISO timestamp, same format as `updated_at`) and `completed_by` (the actor's display name at the time, text). There is no `CHECK` constraint and no hard-coded status name; "completed" is decided by `isTerminalStatus`.
2. A work item that is not in the terminal status has `completed_at` and `completed_by` null.
3. Moving a work item into the terminal status (drag between columns, drag across lanes, dialog status change, or `PATCH` of `status`) sets `completed_at` to the time of that update and `completed_by` to the acting user's name, in the same update as the status and resolution.
4. Creating a work item directly in the terminal status sets `completed_at` to its creation time and `completed_by` to the creator.
5. Moving a work item out of the terminal status clears both fields to null in the same update. Moving it back in sets a new `completed_at`; the earlier value is not kept.
6. An update that leaves the item in the terminal status (edit other fields, reorder in the column, change swimlane, change resolution, `PATCH` with status equal to the current one) leaves `completed_at` and `completed_by` unchanged.
7. `completed_at` and `completed_by` are not writable through the API: a `PATCH` or create body that includes them has them ignored (or rejected with a 4xx, matching how the API treats other unknown fields); the item's values are unchanged.
8. `GET /api/projects/:id/issues`, the single-item endpoint and the `PATCH` response include `completed_at` (string or null) and `completed_by` (string or null) for every work item.
9. Changing `completed_at` / `completed_by` does not by itself add History entries (they are derived from the status change that is already recorded). The status change event continues to be recorded exactly as today.

### Migration and backfill

10. Starting the server on an existing database adds the two columns without data loss and, once, backfills every item currently in the terminal status: `completed_at` and `completed_by` come from the most recent `issue_history_changes` row with `field = 'status'` and `new_value` equal to the terminal status (time and actor name from its `issue_history_events` row); if there is none, `completed_at` is `created_at` when the item was created in the terminal status (it has a `created` history event and no status change rows) and `updated_at` otherwise (including an item with no history at all), with `completed_by` null (Decisions; Open question 1 default). Items not in the terminal status stay null. Starting the server again changes nothing.
11. After the backfill, every item in the terminal status has a non-null `completed_at` (a test seeds items of each case: with a completion in history, created in Complete, no history at all, status history without a completion).

### Display: Board card

12. A card whose status is the terminal status and which has a `completed_at` shows a line on the card with a check mark and the date, for example `✓ Completed Nov 20`, next to the resolution label in the card's existing meta area. It is shown in the card's normal text size and does not push the card to a different width.
13. Date format: month abbreviation and day (`Nov 20`); the year is added (`Nov 20, 2025`) only when the completion year is not the current year. The date is rendered in the viewer's local time zone, so a completion at 23:30 local shows that local day.
14. The date element has a tooltip (`title`) with the full local date and time and the completer, for example `Completed Nov 20, 2026 at 3:42 PM by Dana Lee`. When `completed_by` is null the tooltip omits `by ...`. The text is also available to screen readers (the visible text already says "Completed"; the tooltip's extra detail may be tooltip-only).
15. Cards not in the terminal status show no completed line, including a card just dragged out of Complete, which loses it immediately (taken from the server response, not guessed by the client).
16. A card dragged into Complete shows the completed line immediately after the drop, using the server's `completed_at` from the `PATCH` response, with no page refresh. If the request fails the card returns to its original place and shows no completed line.
17. Cards remain draggable and clickable exactly as before; the new element does not intercept drag or click.
18. With swimlane grouping (Assignee, Epic, Priority) the completed line appears on cards in the Complete column of every lane. On an archived project's board it is shown the same way (read-only anyway).

### Display: other places (recommended small scope)

19. The item dialog shows "Completed" with the same date text and tooltip next to the Resolution control, only while the item is in the terminal status. It is read-only. If the user changes the status field in the dialog but has not saved, the line is not shown or updated until save returns.
20. Each Backlog row for an item in the terminal status shows the same date text (compact) and tooltip next to its status, where the row already shows resolution or status; rows for other statuses show nothing. If the Backlog row has no existing spot for this and it would crowd the row, the developer may omit this criterion and flag it to the owner (see Open question 3).
21. The CSV/export (`docs/specs/export.md`) adds one column, `Completed`, placed after `Resolution` in the columns list of AC 9 of that spec. Its value is the same format the export already uses for the `Created` and `Updated` columns, empty when `completed_at` is null. All other columns, ordering and escaping are unchanged. The export is not built yet: the column is specified in `docs/specs/export.md` (AC 9-10) and is implemented with that feature.
22. Not shown on the Timeline, Sprints list, Test Cases, or in the Daily Report.

### Tests

23. Automated tests (`npm test`, temporary database) cover at least: set on move into terminal, on direct create, and via cross-lane `PATCH` (AC 3-4); cleared on leaving and replaced on re-completion (AC 5); unchanged on same-status updates and reorder (AC 6); not writable via the API (AC 7); present in list, single and `PATCH` responses (AC 8); the backfill cases and idempotent restart (AC 10-11). The export column test (AC 21) is deferred to the export feature (`docs/specs/export.md`), since no exporter exists yet. A unit test of the client date formatter covers current year vs other year and local-day rendering (AC 13).

## Data model changes

`issues`: add `completed_at TEXT` and `completed_by TEXT`, both nullable, added through the existing `PRAGMA table_info` guarded `ALTER TABLE` pattern in `server/db.js` (also added to the fresh-install `CREATE TABLE`). One-time backfill as in AC 10, run only when the column is first added. No new tables.

## Out of scope

- A "completed" filter, sort, or date-range search; "completed in the last N days" views.
- Cycle time, lead time, burndown or any reporting built on the date.
- Showing the date on cards for statuses other than the terminal one, or a history of earlier completions on the card (History tab already has them).
- Editing the completed date by hand.
- Showing it on the Timeline, Sprints, Test Cases or Daily Report.
- Per-user time zone or date-format settings.

## Open questions

1. **Fallback for items with no completion history.** Default chosen: use `created_at` if created in Complete with no status history, otherwise `updated_at`, which may be later than the real completion. Alternative: leave `completed_at` null and show nothing on those cards. Owner to confirm.
2. **Reopen then re-complete.** Default chosen: the date is the latest completion (earlier one discarded from the card). Alternative: keep the first completion date. Owner to confirm.
3. **Backlog rows and dialog.** Default chosen: include both (AC 19-20) for consistency; they can be dropped without affecting the Board work. Confirm.
4. **Export column.** Default chosen: add `Completed` (AC 21). Confirm, or leave the export unchanged.
5. **Tooltip "who".** Default chosen: the name of the user who made the status change, stored as text so it survives a user being renamed or deactivated. Confirm.
6. **Date format.** Default chosen: `Nov 20` / `Nov 20, 2025`, local time zone. Confirm vs numeric or relative ("3 days ago").

## Implementation notes for the developer

Suggested order:

1. `server/db.js`: add the columns to `CREATE TABLE issues`, add a guarded migration function (follow the resolution migration near line 368 and the start/due date migration near line 483) with the backfill, and call it with the other migrations.
2. `server/data/issues.js`: add `i.completed_at, i.completed_by` to `SELECT`; in `createIssue` and `updateIssue` compute them next to `resolutionFor` (entering terminal: `now` and actor name; leaving: null; otherwise unchanged); do not add them to `UPDATABLE`'s client-writable list via validation (check `server/validation.js` strips them). Use `isTerminalStatus` only. Check the actor object passed to `updateIssue` for the name field used by `history.recordChanges`.
3. Server tests: `tests/` alongside the existing resolution and history tests.
4. `public/js/board.js`: add a `completedLabel(item)` helper next to `resolutionLabel` (line ~472) and put it in the card meta (line ~417-430); reuse the same helper for the dialog. Put the date formatter in a small shared module under `public/js/` (like `reportMath.js`) so it can be unit tested. Use the drag-friendly pattern of existing labels (`title` attribute, no extra handlers). Add styles to `public/css/app.css`; follow `docs/design/STYLE.md` (muted text, no new colour). The designer step is not strictly needed; this is one text line, but check card height against `docs/design` card mockups.
5. `public/backlog.html` and its script, only if there is room (AC 20); and `server/` export code plus `docs/specs/export.md` (AC 21).

Conflict notes with the uncommitted daily report: `server/data/report.js`, `server/routes/report.js`, `public/js/report.js*`, `public/report.html` are not touched. Shared files modified in the working tree (`server/statuses.js`, `server/data/history.js`, `server/historyFields.js`, `public/board.html`, `public/backlog.html`, `public/css/app.css`) should be edited with care: add, do not reformat, and re-read before editing. The daily report reads status changes from `issue_history_changes`; this spec does not change what is written there (AC 9), so the two do not interact.
