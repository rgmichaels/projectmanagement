# Sprint scope-change tracking
Status: Draft
Date: 2026-10-29

**Builds on the implemented code and on `docs/specs/sprints-and-backlog.md`, `docs/specs/sprints-screen.md` and `docs/specs/time-tracking.md` (read-only references; this spec edits none of them).** Acceptance criteria are numbered from 1; references to other specs are written "Sprints AC n", "Screen AC n", "Time AC n". Terminology: "work item" (the API still says `issues`).

What exists today and is reused:

- `server/data/sprints.js` (`startSprint`, `completeSprint`, `deleteSprint`, `getSprintWithCounts`, which already returns `estimate_hours`, `time_spent_hours`, `unestimated_count`) and `server/sprintStates.js`.
- `server/sprintEvents.js` and `server/data/sprintHistory.js`: the sprint-level audit log (created, edited, started, completed, deleted). It records sprint lifecycle, not item membership, so this spec adds a second, item-level log rather than widening that one (its `sprint_events` columns are lifecycle-shaped).
- `server/data/issues.js`: every change to an item's sprint or estimate goes through `createIssue`, `updateIssue`, `deleteIssue` or `moveToContainer` (the last used by sprint complete and delete). Hooking those four covers all routes.
- `issues.estimate_minutes` (Time AC 34) and `timeEntries.toHours`. "Hours" in this spec is the work item **estimate**, as in Jira.
- `migrateSprints` in `server/db.js` (the additive-migration pattern), Sprints page (`public/sprints.html`, `public/js/sprintView.js`), Backlog page and Board card rendering.

## Problem

Once a sprint starts, work is added, pulled out and re-estimated, and nobody can see how much the plan moved. The owner wants the Jira "scope creep" view: how many hours were planned at start, how many were added or removed after, how estimates changed, and the percentage growth, plus a visible marker on items that were added after the sprint started.

## User stories

1. As a user viewing a sprint on the Sprints page, I see a "Scope change" summary: planned hours, added, removed, estimate changes, current total and % growth.
2. As a user, I see an "Added after start" badge on any work item that was added to its sprint after the grace period, in the Sprints table, the Backlog sprint panel and on Board cards.
3. As a user, work I add or re-estimate in the first 24 hours after the sprint starts is not counted as scope change; I see it listed as "adjusted in first 24h".
4. As a user, I can open a collapsed log of the scope events (item, what happened, hours, who, when).
5. As a user, after a sprint is completed I still see its final scope-change numbers.
6. As a Viewer, or on an archived project, I can read all of it.
7. As the owner, I can change the grace rule later in one place without rewriting stored data.
8. As the owner, the sprint that is Active when this feature first runs is tracked from then on, not shown as "not tracked".

## Decisions (owner, 2026-10-29, not to be re-asked)

1. **Tracked:** items added to a sprint after it started, items removed after it started, estimate changes on sprint items after it started. Net scope change (hours) = added - removed +/- estimate deltas.
2. **Hours = the work item estimate** (`estimate_minutes`, shown as hours). A null estimate counts as 0 hours.
3. **Grace period: a rolling 24 hours from the sprint's actual `started_at` timestamp** (revised 2026-10-29; it replaced "same calendar day"). An event with `created_at` earlier than `started_at` + 24 hours is "adjusted in first 24h": shown in the summary and log, excluded from the scope totals. An event at or after that moment counts. There is no calendar-day, midnight or time-zone dependence.
4. **Record everything, judge at read time.** Every add, remove and estimate-change on an item of an Active sprint is stored as an event with timestamp, actor and the estimate at the time, regardless of when. There is no flag on the issue (an item may be added, removed and re-added). The grace rule is applied when reading, in one function, so the policy can change without data fixes.
5. **Baseline at start:** starting a sprint stores the items in it and their total estimate at that moment.
6. **UI:** a "Scope change" summary on the Sprints page and an "Added after start" badge on items in the sprint and on the board.
7. **The sprint that is Active when the feature first runs is baselined then** (migration/startup step): items and total estimate from its current state, `started_at` unchanged. Its baseline reflects the state at migration time, not the true start. The grace period for that sprint is measured from the baseline capture time, not from `started_at`. The UI labels it "Baseline captured on <date>". Completed sprints from before the feature are not tracked.

Decisions made by the product manager to fill gaps (listed under Open questions for veto):

8. **"Planned hours" = baseline + net grace-period adjustments** (the plan as it stands when the grace period ends), so `planned + net scope change = current total` holds exactly and early edits are neither scope nor lost. The raw baseline is shown in the detail line.
9. **Only Active sprints record events.** A Planned sprint is not started, so everything before Start is covered by the baseline. A Completed sprint records nothing more, which freezes its numbers.
10. **Counts are event counts.** An item added, removed and added again is 2 added and 1 removed; the log shows each event. Hours are what the summary leads with.
11. **Completing a sprint is not scope change.** Unfinished items moved out by Complete (to the backlog, next sprint or new sprint) are not recorded as removals: the final numbers describe the sprint as it stood when it closed, unfinished items included.

## Acceptance criteria

### Data, baseline and migration

1. New table `sprint_scope_events` (`id, project_id, sprint_id, issue_id, issue_key, issue_title, kind, actor_id, actor_name, created_at, estimate_minutes, old_estimate_minutes`). `issue_id`, `sprint_id`, `project_id`, `actor_id` are plain integers with no foreign key; `issue_key`, `issue_title`, `actor_name` are snapshots, so rows survive the deletion of the item and the user. `estimate_minutes` is the estimate at the time (null = none); `old_estimate_minutes` is set only for estimate changes. Append-only: nothing edits or deletes a row. Index on `(sprint_id, id)`.
2. `sprints` gains nullable `baseline_item_count`, `baseline_minutes` and `baseline_at` (null = not tracked), and a table `sprint_baseline_items` (`sprint_id, issue_id, issue_key, estimate_minutes`) holds the items at baseline. `baseline_at` is the instant the grace period is measured from. All additions are idempotent and additive (the `db.js` pattern).
3. `POST /api/sprints/:id/start` writes the baseline in the same transaction as the state change: one `sprint_baseline_items` row per non-epic item in the sprint, the item count and total minutes on the sprint, and `baseline_at` equal to the sprint's new `started_at` (the same value). Starting an empty sprint stores count 0 and minutes 0 (tracked, not null). If the start fails, no baseline exists.
4. **Migration of the Active sprint.** On start of a database that has an Active sprint with `baseline_at` null, a step (after `migrateSprints`, idempotent, runs once per such sprint) captures its baseline from its current state: `sprint_baseline_items` rows for its non-epic items, `baseline_item_count`, `baseline_minutes` and `baseline_at` = the migration time. `started_at`, `updated_at` and all item data are unchanged; no scope events and no sprint events are backfilled. Planned sprints are untouched (they get a baseline at Start). Completed sprints stay untracked (`baseline_at` null). Running it twice, or on a fresh database, writes nothing new.
5. The event kinds (`added`, `removed`, `estimate_changed`, each with a label) live in a new single-source file `server/scopeEvents.js`, served by `GET /api/scope-event-kinds`; code refers to them through that module, never by string.

### Recording events

6. When a non-epic work item **enters** an Active sprint (create with `sprint_id`, PATCH changing `sprint_id` to it, dialog Sprint field, Backlog drag, bulk move), one `added` event is written with the estimate at that moment (after the save, in the same save if the estimate also changed).
7. When a work item **leaves** an Active sprint (PATCH to the backlog or another sprint, drag, type changed to an epic type, or the item is deleted), one `removed` event is written with the estimate it had just before the change. A deleted item's event keeps its key and title snapshot.
8. A move from an Active sprint to another sprint is a `removed` event on the active sprint only; the target (Planned) records nothing (Decision 9). A move from a Planned sprint or the backlog into the Active sprint is an `added` event.
9. When the estimate of an item that is in an Active sprint changes (including null to a value and a value to null; null counts as 0 hours), one `estimate_changed` event is written with the old and new estimate. A save that sends the same value writes nothing. If the same save also adds or removes the item, only the `added` (with the new estimate) or `removed` (with the old estimate) event is written, never both.
10. Nothing is recorded for: a Planned or Completed sprint; epics; reorders (`sprint_rank` only); status, assignee, title or other field changes; logged time; moves performed by Complete sprint (Decision 11) or Delete sprint (Planned only); sprint edits.
11. Events are written inside the same transaction as the item write, attributed to the signed-in user (`actorFrom`, never the request body) with server time. A failed or refused request (400, 403, 404, 409) writes none. A rolled-back write leaves none.
12. All scope SQL lives in `server/data/` (a new `server/data/sprintScope.js`; hooks called from `createIssue`, `updateIssue`, `deleteIssue` in `server/data/issues.js`). Routes only validate and call the data layer.

### Grace rule and totals

13. One function `isInGrace(event, sprint)` in a new `server/scopePolicy.js` decides whether an event is within the grace period: true when `event.created_at` is earlier than `sprint.baseline_at` + 24 hours (the length is one named constant in that file). For a sprint started normally `baseline_at` equals `started_at`; for the migrated Active sprint it is the migration time (Decision 7). An event exactly 24 hours after `baseline_at` counts. This is the only place the rule is written; changing the policy changes every report with no data change. The summary counts every event for which it is false and lists the others as "adjusted in first 24h".
14. **Totals** (hours, from minutes / 60), counting only events outside the grace period:
    - `added` = sum of `estimate_minutes` of `added` events, `removed` = sum of `estimate_minutes` of `removed` events;
    - `estimate_change` = sum of (`estimate_minutes` - `old_estimate_minutes`, null as 0) of `estimate_changed` events, which may be negative;
    - `net_change` = added - removed + estimate_change;
    - `planned` = `baseline_minutes` + the same added - removed + estimate-change sum taken over the grace-period events (Decision 8);
    - `current_total` = planned + net_change;
    - `growth_percent` = net_change / planned x 100, rounded to one decimal, and null when planned is 0 (shown as "n/a").
15. **Reconciliation.** For an Active sprint, `current_total` equals the sum of `estimate_minutes` of the non-epic items currently in the sprint (the existing `estimate_hours` of the sprint, Time AC 39). This holds for the migrated Active sprint too, from its baseline on. A test performs a mix of adds, removes, re-adds, deletes, type changes and estimate edits across the 24-hour boundary and asserts equality.
16. **Completed sprint.** Its numbers are final: computed from the same events (none are written after completion, Decision 9) and equal the Active-sprint formula at the moment of completion. Editing an estimate or moving an item afterwards changes nothing in them. `current_total` of a completed sprint is the frozen total, not the live sum.

### API

17. `GET /api/sprints/:id/scope` returns 200 with:
    `{ tracked, state, started_at, baseline_at, baseline_late, grace_ends_at, baseline: { item_count, hours }, grace: { added: {count, hours}, removed: {count, hours}, estimate_change: {count, hours} }, planned_hours, added: {count, hours}, removed: {count, hours}, estimate_change: {count, hours}, net_change_hours, current_total_hours, growth_percent, unestimated_added_count, events: [...] }`.
    `baseline_late` is true when `baseline_at` differs from `started_at` (the migrated sprint). `events` is every recorded event, oldest first, each with `id, kind, issue_id, issue_key, issue_title, actor_name, created_at, hours, old_hours, in_grace`. For a Planned sprint or one not tracked, `tracked` is false and the totals are null and `events` is empty. Unknown sprint 404, signed out 401. Readable by every signed-in user, including Viewers and archived projects. `unestimated_added_count` counts counted `added` events whose estimate was null.
18. `GET /api/projects/:id/issues` (and `GET /api/issues/:id`) add `added_after_start` (boolean) to each non-epic item: true when the item is in a tracked sprint and its **latest membership event** (`added` or `removed`) in that sprint is an `added` event outside the grace period. `estimate_changed` events do not affect it. It is false for backlog items, for items in a Planned sprint, and for items whose latest membership event is a grace-period add.
19. `GET /api/scope-event-kinds` returns the ordered kinds with labels (AC 5).

### Sprints page UI

20. Under the sprint summary line (Screen AC 8) the Sprints page shows a "Scope change" panel for the selected sprint with: Planned hours, Added (count, hours), Removed (count, hours), Estimate changes (count, signed hours), Current total, Growth (percent with sign, or "n/a"). Hours show at most two decimals with an "h" unit. Values are text; growth carries a sign and the word "growth" or "shrink" so it never relies on colour.
21. Below the totals, a line "Baseline: N items, X h" and, when any grace-period event exists, "Adjusted in first 24h: +A h added, -R h removed, +/-E h estimate changes (not counted as scope change)". When `baseline_late` is true, a small note "Baseline captured on <date>" (the `baseline_at` date, local display) is shown beside the baseline line, with a tooltip or help text that the sprint was already running when tracking began.
22. If `unestimated_added_count` > 0 the panel notes "N added items have no estimate."
23. A collapsed "Scope change log" lists the events (item key and title, kind label, hours, actor, time). Grace-period events carry the text "adjusted in first 24h". Empty state: "No scope changes yet." Titles and actor names are inserted as text.
24. States: a Planned sprint shows "Scope is tracked from the moment the sprint starts."; an untracked (pre-feature Completed) sprint shows "Scope change was not tracked for this sprint."; loading and error (with Retry) states match the rest of the page. A Completed sprint shows the same panel headed "Final scope change". The Active sprint present at migration never shows "not tracked".
25. The panel updates without a reload after the work item dialog saves a change on this page (add, remove via Sprint field, estimate edit), like the table.

### Badge UI

26. A work item with `added_after_start` true shows an "Added after start" badge: on each row of the Sprints table (next to the Key or Title), on each row in the Backlog page's sprint panels, and on Board cards. The text is visible (not colour or icon alone) and has an accessible name. A short form on a Board card is acceptable if its full text is the tooltip and accessible name.
27. The badge disappears when the item leaves the sprint, and reappears when it is added again after the grace period. Items added within the grace period show no badge.
28. The work item dialog shows the same badge near the Sprint field when it applies.

### Permissions and archive

29. Scope data and badges are read-only everywhere. There is no write endpoint for scope events. Viewers and archived projects see everything.

### Source and extensibility

30. No event kind string is hard-coded in `server/` outside `server/scopeEvents.js`, nor in `public/js/`; no sprint state name is hard-coded in the new code; epics are found through `isEpic`. A source test like `tests/source.test.js` enforces this. An extensibility test adds a kind to `server/scopeEvents.js` and sees it in `GET /api/scope-event-kinds`.
31. Tests (`node:test`, `tests/helpers.js` style) in `tests/sprint-scope.test.js` and `tests/sprint-scope-migration.test.js` use injected timestamps so no test waits 24 hours: baseline captured (including empty sprint); each of AC 6-9; the "never both" rule; nothing recorded for AC 10; rollback; grace-period events excluded and listed; events after the boundary counted; `isInGrace` unit-tested at 23h59m (in grace), exactly 24h (counts) and 24h01m (counts), including across midnight and a daylight-saving change; reconciliation (AC 15); completed sprint frozen (AC 16); badge rules (AC 18); migration of an Active sprint (baseline from current state, `baseline_at` = migration time, `baseline_late` true, `started_at` unchanged, idempotent, Completed and Planned untouched); Viewer and archived reads.

## Edge cases

- **Item moved between sprints.** Active to Planned: `removed` on the active sprint. Planned to Active: `added`. Active to Completed is refused today (409), so it cannot occur.
- **Completed (done) items.** Adding, removing or re-estimating an item that is already in the terminal status still counts; status is not considered (as in Sprints Decision 3).
- **Sprint with no estimates.** Planned 0 h, growth "n/a", added items counted with 0 h and the "no estimate" note. Counts still show.
- **Re-add.** Added, removed, added again after the grace period: 2 added and 1 removed events, hours summed, badge shown (latest membership event is an add). Removed and re-added entirely within the grace period: all three in grace, none counted, no badge.
- **Add then re-estimate.** Added at 4 h, then changed to 6 h after the grace period: added 4 h and estimate change +2 h; current total includes 6 h. Removed later at 6 h: removed 6 h.
- **Item deleted** while in an Active sprint: a `removed` event with the key and title snapshot. Its history is deleted with the item, the scope event stays.
- **Sprint started late in the evening.** The grace period simply runs 24 hours: a sprint started at 23:50 has its grace until 23:50 the next day. No midnight edge case.
- **Estimate removed** (6 h to none): estimate change -6 h.
- **Sprint completed within 24 hours of starting:** every event is in grace; scope change shows 0 and the grace line lists them.
- **Estimate cleared by type change to an epic:** the item also leaves the sprint, so one `removed` event at its old estimate.
- **Migrated Active sprint.** Its baseline is "now", so earlier changes are invisible, and its 24-hour grace starts at migration time. Items added before migration are not badged. Changes after migration are tracked as for any other sprint.
- **Time zone.** Grace is an absolute duration, so server time zone and daylight saving do not affect it.

## Data model changes

- New table `sprint_scope_events` (AC 1) and index `idx_sprint_scope_events_sprint ON sprint_scope_events(sprint_id, id)`, created in `SCHEMA` with `IF NOT EXISTS`.
- New table `sprint_baseline_items` (AC 2), index on `sprint_id`.
- `sprints`: add nullable `baseline_item_count INTEGER`, `baseline_minutes INTEGER` and `baseline_at TEXT` (additive migration, same style as `migrateSprints`), plus the one-time baselining of the Active sprint (AC 4).
- New single-source files `server/scopeEvents.js` (kinds) and `server/scopePolicy.js` (`isInGrace`, the 24-hour constant), new data file `server/data/sprintScope.js`.
- No change to `issues`. No flag on the issue.

## Out of scope

- Burndown, burnup, velocity, sprint reports and charts; a scope-change chart or trend over time.
- Cross-sprint or project-level scope reports; export.
- Logged time on added items (see Future).
- Reconstructing the true start state of a sprint that was already running at migration.
- Baselines for Completed sprints from before this feature.
- Scope-change notifications or alerts; a threshold warning when growth passes a limit.
- Story points; any unit other than the estimate in hours.
- Editing or deleting scope events.
- Showing the summary on the Board header (the Board gets only the card badge).

## Future (owner-listed, not built in this version)

- Logged time on items added after the grace period, as a secondary line in the summary (open: "logged while in the sprint" versus "logged ever").
- An optional prompt when adding an item to an Active sprint ("planned adjustment or new scope?") that stores a user-chosen reason on the event.
- A configurable grace length (per project or global setting); today it is one constant in `server/scopePolicy.js`.

## Open questions

1. **"Planned hours" definition (Decision 8).** Proposed: baseline plus grace-period adjustments. Alternative: the raw baseline, with grace adjustments shown separately and the formula then not closing exactly. Which does the owner want?
2. **Event counts versus distinct items (Decision 10).** Re-added items count twice in "added". Prefer distinct items?
3. **Completing a sprint (Decision 11).** Unfinished items moved by Complete are not counted as removed. Confirm.
4. **Grace-period items.** They get no badge, only the log text "adjusted in first 24h". Should they have a subtler badge too?

Closed by the owner on 2026-10-29: the Active sprint is baselined at migration (Decision 7); logged time moved to Future; grace is a rolling 24 hours (Decision 3), which removes the time-zone question.

## Implementation notes for the developer

Pipeline: owner reviews this spec, then the `designer` (Scope change panel, "Baseline captured on" note, log, three badge placements, state messages), then `developer`, then `qa`. Re-read `public/js/sprintView.js` first: the Sprints page and the time-tracking work touch the same files and may be uncommitted.

Suggested order, each step testable alone:

1. `server/scopeEvents.js` and `server/scopePolicy.js` (new), with unit tests for `isInGrace` (take timestamps as arguments, no hidden clock); `GET /api/scope-event-kinds` in `server/routes/meta.js`.
2. `server/db.js`: the two tables, the index, the additive `baseline_*` columns on `sprints`, then the one-time Active-sprint baselining (AC 4), after `migrateSprints`, guarded by "Active and `baseline_at` is null", in a transaction. Reuse `captureBaseline` from step 3 with the migration time.
3. `server/data/sprintScope.js` (new): `captureBaseline(db, sprint, at)`, `recordScopeChange(db, actor, before, after, when)` (derives added / removed / estimate_changed from the before and after rows per AC 6-10), `scopeSummary(db, sprint)`, `membershipFlags(db, issueIds)` for `added_after_start`.
4. `server/data/sprints.js`: call `captureBaseline` inside `startSprint`'s transaction using the same `now` that sets `started_at`. Do not hook `completeSprint` or `deleteSprint` (they call `moveToContainer`, which must stay unhooked: Decision 11).
5. `server/data/issues.js`: call `recordScopeChange` in `createIssue`, `updateIssue` (compare the `current` row with `rowOf` after the write; the sprint and estimate are already computed there) and `deleteIssue` (before the delete). It only records when the item's sprint, before or after, is Active, and the item is not an epic. Add `added_after_start` to the item shape returned by `listIssues` and `getIssue` (one batched lookup, not one query per item).
6. `server/routes/sprints.js`: `GET /api/sprints/:id/scope` via the existing `loadSprint` guard; no write routes.
7. Client after the design is chosen: Scope change panel and log in `public/js/sprintView.js` and `public/sprints.html`; badge in the Sprints table, the Backlog sprint panels (`public/js/backlog.js`), Board cards and the dialog (`public/js/board.js`); styles in `public/css/app.css` (reuse `.badge`); refresh the panel from the dialog's reload callback (AC 25). Text nodes only.
8. Tests per AC 30-31, `README.md` paragraph on scope-change tracking and the new endpoints.
9. QA on a scratch copy of the database and a spare port (not 3000 or 3001): migrate a copy that has an Active sprint and check the baseline, the "Baseline captured on" note and that it never says "not tracked"; start a new sprint, edit within the first hour (nothing counted, listed as "adjusted in first 24h"), then set `baseline_at` and `started_at` more than 24 hours in the past on the scratch DB (or fake the clock) to exercise counted events; add, remove, re-add, re-estimate, delete an item; check the reconciliation against the sprint's estimate total; complete the sprint and confirm the numbers freeze; check badges on all three pages; Viewer and archived project.
